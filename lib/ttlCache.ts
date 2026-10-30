/**
 * Size-bounded in-memory cache with per-entry expiry. Pure functions, no framework imports.
 * Replaces the unbounded Map caches used by the geocode / route proxies.
 */

export interface TtlCache<V> {
  get(key: string, nowMs?: number): V | undefined;
  set(key: string, value: V, ttlMs: number, nowMs?: number): void;
  size(): number;
}

export function createTtlCache<V>(maxEntries: number = 500): TtlCache<V> {
  const store = new Map<string, { value: V; expires: number }>();

  function evict(now: number): void {
    for (const [key, entry] of store) {
      if (entry.expires <= now) store.delete(key);
    }
    while (store.size >= maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return {
    get(key, now = Date.now()) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs, now = Date.now()) {
      // Re-insert so a refreshed key counts as the newest entry.
      store.delete(key);
      if (store.size >= maxEntries) evict(now);
      store.set(key, { value, expires: now + ttlMs });
    },
    size() {
      return store.size;
    },
  };
}
