import { createHash } from "node:crypto";

// In-memory LRU cache for autocomplete results (no SQLite dependency)

interface CacheEntry {
  value: string;
  timestamp: number;
  prefix: string;
  suffixHash: string;
}

export class AutocompleteLruCache {
  private static capacity = 1000;
  private static instancePromise?: Promise<AutocompleteLruCache>;
  private cache: Map<string, CacheEntry> = new Map();

  static async get(): Promise<AutocompleteLruCache> {
    if (!AutocompleteLruCache.instancePromise) {
      AutocompleteLruCache.instancePromise = Promise.resolve(new AutocompleteLruCache());
    }
    return AutocompleteLruCache.instancePromise;
  }

  private static getSuffixHash(suffix: string): string {
    return createHash("sha256").update(suffix).digest("hex");
  }

  async get(prefix: string, suffix: string): Promise<string | undefined> {
    const suffixHash = AutocompleteLruCache.getSuffixHash(suffix);
    let bestMatch: { key: string; entry: CacheEntry } | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (prefix.startsWith(entry.prefix) && suffixHash === entry.suffixHash) {
        if (!bestMatch || entry.prefix.length > bestMatch.entry.prefix.length) {
          bestMatch = { key, entry };
        }
      }
    }

    if (bestMatch) {
      const typedDelta = prefix.slice(bestMatch.entry.prefix.length);
      if (bestMatch.entry.value.startsWith(typedDelta)) {
        bestMatch.entry.timestamp = Date.now();
        return bestMatch.entry.value.slice(typedDelta.length);
      }
    }

    return undefined;
  }

  async put(prefix: string, suffix: string, completion: string) {
    const suffixHash = AutocompleteLruCache.getSuffixHash(suffix);
    const key = `${prefix}\0${suffixHash}`;
    const now = Date.now();
    this.cache.set(key, {
      value: completion,
      timestamp: now,
      prefix,
      suffixHash,
    });

    if (this.cache.size > AutocompleteLruCache.capacity) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.cache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  async close() {
    this.cache.clear();
    AutocompleteLruCache.instancePromise = undefined;
  }
}

export default AutocompleteLruCache;
