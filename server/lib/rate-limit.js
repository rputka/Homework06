/* In-memory rate limits: at most `limit` hits per `windowMs` for each key (e.g. an IP address or a user).
   Fine for one server process; a shared store (like Redis) would be needed when running several. */
export function createRateLimiter() {
  const hits = new Map(); // key -> timestamps within the window
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.length || v[v.length - 1] < now - 3600000) hits.delete(k); }, 600000).unref();
  return {
    /* Records a hit; returns true if it's allowed. */
    allow(key, limit, windowMs) {
      const now = Date.now(), list = (hits.get(key) || []).filter(t => t > now - windowMs);
      if (list.length >= limit) { hits.set(key, list); return false; }
      list.push(now); hits.set(key, list); return true;
    },
    reset: () => hits.clear()
  };
}
