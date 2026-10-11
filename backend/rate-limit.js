/**
 * Fixed-window, per-key request limiter kept in memory. Fine for a single Render instance;
 * counts reset on restart and are not shared across instances (move to Redis to scale out).
 */
export function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return function overLimit(key) {
    const now = Date.now();
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (now - v.first > windowMs) hits.delete(k);
    }
    const entry = hits.get(key);
    if (!entry || now - entry.first > windowMs) {
      hits.set(key, { first: now, count: 1 });
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}
