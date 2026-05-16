/**
 * Manages reuse of in-flight LLM generators.
 *
 * When the user keeps typing and triggers a new completion request,
 * instead of cancelling the old request and starting fresh, we check
 * if the new prefix is a prefix-extension of (oldPrefix + streamedOutput).
 * If so, we reuse the existing stream, skipping already-typed characters.
 */

import { ListenableGenerator } from "./ListenableGenerator.js";

interface ActiveGenerator {
  generator: ListenableGenerator;
  leaseId: number;
  originalPrefix: string;
  originalSuffix: string;
  originalFilepath: string;
  /** Chunks accumulated so far from the original generator. */
  accumulated: string;
}

export interface ReuseInfo {
  reuseHit: boolean;
  reuseReason:
    | "prefix_match"
    | "suffix_changed"
    | "filepath_changed"
    | "backspace"
    | "no_active"
    | "prefix_mismatch";
  leaseId: number;
}

export class GeneratorReuseManager {
  private active: ActiveGenerator | null = null;
  private nextLeaseId = 1;
  private lastReuseInfo: ReuseInfo = {
    reuseHit: false,
    reuseReason: "no_active",
    leaseId: 0,
  };

  /**
   * Get a generator for the given request, reusing the active one if possible.
   *
   * @param prefix   Current prefix (what's before cursor now)
   * @param suffix   Current suffix (what's after cursor now)
   * @param filepath Current file path
   * @param createNew  Factory to create a new generator if reuse isn't possible
   * @returns An async generator of completion chunks
   */
  getGenerator(
    prefix: string,
    suffix: string,
    filepath: string,
    createNew: () => AsyncGenerator<string>,
  ): AsyncGenerator<string> {
    const reused = this.tryReuse(prefix, suffix, filepath);
    if (reused) {
      this.lastReuseInfo = {
        reuseHit: true,
        reuseReason: "prefix_match",
        leaseId: reused.leaseId,
      };
      return reused.generator;
    }

    const leaseId = this.nextLeaseId++;
    this.lastReuseInfo = {
      reuseHit: false,
      reuseReason: this.lastReuseInfo.reuseReason,
      leaseId,
    };
    return this.createFreshGenerator(prefix, suffix, filepath, createNew, leaseId);
  }

  getLastReuseInfo(): ReuseInfo {
    return { ...this.lastReuseInfo };
  }

  private async *createFreshGenerator(
    prefix: string,
    suffix: string,
    filepath: string,
    createNew: () => AsyncGenerator<string>,
    leaseId: number,
  ): AsyncGenerator<string> {
    await this.cancelActive();

    // Create new generator
    const rawGen = createNew();
    const listenable = new ListenableGenerator(rawGen);
    const entry: ActiveGenerator = {
      generator: listenable,
      leaseId,
      originalPrefix: prefix,
      originalSuffix: suffix,
      originalFilepath: filepath,
      accumulated: "",
    };
    this.active = entry;

    try {
      // Consume from the listenable generator, tracking accumulated text.
      // Use tee() so that a later reuse can also tee() from the same source.
      const tee = listenable.tee();
      for await (const chunk of tee) {
        entry.accumulated += chunk;
        yield chunk;
      }
    } finally {
      // Clean up active reference if we are still the current one
      if (this.active === entry) {
        this.active = null;
      }
    }
  }

  /**
   * Try to reuse the active generator if the new prefix matches.
   * Returns an AsyncGenerator if reuse is possible, null otherwise.
   */
  private tryReuse(
    newPrefix: string,
    newSuffix: string,
    newFilepath: string,
  ): { generator: AsyncGenerator<string>; leaseId: number } | null {
    if (!this.active) {
      this.lastReuseInfo = {
        reuseHit: false,
        reuseReason: "no_active",
        leaseId: 0,
      };
      return null;
    }
    if (this.active.generator.isDone()) {
      this.active = null;
      this.lastReuseInfo = {
        reuseHit: false,
        reuseReason: "no_active",
        leaseId: 0,
      };
      return null;
    }

    const { originalPrefix, originalSuffix, originalFilepath, accumulated } =
      this.active;

    // Must be same file
    if (originalFilepath !== newFilepath) {
      this.lastReuseInfo = {
        reuseHit: false,
        reuseReason: "filepath_changed",
        leaseId: 0,
      };
      return null;
    }

    // Suffix must be identical (first version — no fuzzy matching)
    if (originalSuffix !== newSuffix) {
      this.lastReuseInfo = {
        reuseHit: false,
        reuseReason: "suffix_changed",
        leaseId: 0,
      };
      return null;
    }

    // New prefix must be longer (user typed more, not backspaced)
    if (newPrefix.length <= originalPrefix.length) {
      this.lastReuseInfo = {
        reuseHit: false,
        reuseReason: "backspace",
        leaseId: 0,
      };
      return null;
    }

    // Check if (originalPrefix + accumulated) starts with newPrefix
    const fullStreamed = originalPrefix + accumulated;
    if (!fullStreamed.startsWith(newPrefix)) {
      this.lastReuseInfo = {
        reuseHit: false,
        reuseReason: "prefix_mismatch",
        leaseId: 0,
      };
      return null;
    }

    // Calculate what's already been "typed" — skip these characters
    const alreadyTyped = newPrefix.length - originalPrefix.length;

    // The remaining completion after the user's new prefix
    const remaining = accumulated.slice(alreadyTyped);

    // Create a reused generator from the same ListenableGenerator via tee()
    const original = this.active;
    const leaseId = this.nextLeaseId++;
    // Update active to reflect new prefix context
    this.active = {
      generator: original.generator,
      leaseId,
      originalPrefix: newPrefix,
      originalSuffix: newSuffix,
      originalFilepath: newFilepath,
      accumulated: remaining,
    };
    const entry = this.active;
    const manager = this;

    const generator = (async function* () {
      try {
        // Yield the remaining portion of already-buffered content
        if (remaining) {
          yield remaining;
        }
        // Continue streaming from the original generator's tee
        // tee() reads from the append-only buffer starting at its current end
        const tee = original.generator.tee();
        for await (const chunk of tee) {
          entry.accumulated += chunk;
          yield chunk;
        }
      } finally {
        if (manager.active === entry) {
          manager.active = null;
        }
      }
    })();
    return { generator, leaseId };
  }

  /**
   * Cancel the active generator.
   */
  async cancelActive(): Promise<void> {
    if (this.active) {
      await this.active.generator.cancel();
      this.active = null;
    }
  }

  async cancelLease(leaseId: number): Promise<void> {
    if (this.active?.leaseId === leaseId) {
      await this.cancelActive();
    }
  }

  isLeaseActive(leaseId: number): boolean {
    return this.active?.leaseId === leaseId;
  }
}
