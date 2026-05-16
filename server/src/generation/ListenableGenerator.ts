/**
 * A wrapper around AsyncGenerator that allows multiple consumers (tee-ing)
 * and tracks whether the generator has ended.
 *
 * Each tee() returns an independent AsyncGenerator that yields the full
 * stream from the point it was created. Internally, chunks are stored in
 * an append-only buffer. Each tee tracks its own read index so consumers
 * never steal data from each other.
 */

export class ListenableGenerator {
  private generator: AsyncGenerator<string>;
  /** Append-only buffer: chunks are never removed. */
  private buffer: string[] = [];
  private done = false;
  private error: any = null;
  /** Promises for consumers waiting for the next chunk. */
  private waiters: {
    resolve: (value: IteratorResult<string>) => void;
    reject: (error: any) => void;
  }[] = [];

  constructor(generator: AsyncGenerator<string>) {
    this.generator = generator;
    this.startConsuming();
  }

  private async startConsuming(): Promise<void> {
    try {
      while (true) {
        const result = await this.generator.next();
        if (result.done) {
          this.done = true;
          for (const w of this.waiters) {
            w.resolve({ value: undefined, done: true });
          }
          this.waiters = [];
          return;
        }
        if (result.value) {
          this.buffer.push(result.value);
          // Wake up one waiter per new chunk
          while (this.waiters.length > 0) {
            const w = this.waiters.shift()!;
            // Resolve with index hint — the tee will read from buffer
            w.resolve({ value: undefined as any, done: false });
          }
        }
      }
    } catch (error) {
      this.error = error;
      this.done = true;
      for (const w of this.waiters) {
        w.reject(error);
      }
      this.waiters = [];
    }
  }

  /**
   * Create an independent generator that yields all chunks from the
   * current append position onward. Each tee sees the full stream.
   */
  tee(): AsyncGenerator<string> {
    const self = this;
    let index = self.buffer.length; // start from current end

    return (async function* () {
      while (true) {
        // Read any buffered chunks at our index
        while (index < self.buffer.length) {
          yield self.buffer[index++];
        }
        // If source is done, we're done
        if (self.done) {
          if (self.error) throw self.error;
          return;
        }
        // Wait for the next chunk to arrive
        await new Promise<IteratorResult<string>>((resolve, reject) => {
          self.waiters.push({ resolve, reject });
        });
        // After waking, loop back to read from buffer
      }
    })();
  }

  isDone(): boolean {
    return this.done;
  }

  async cancel(): Promise<void> {
    this.done = true;
    try {
      await this.generator.return(undefined);
    } catch {
      // Ignore errors from cancelling
    }
    for (const w of this.waiters) {
      w.resolve({ value: undefined, done: true });
    }
    this.waiters = [];
  }
}
