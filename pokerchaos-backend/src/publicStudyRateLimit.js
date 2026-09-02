function requestKey(req) {
  return String(req?.ip || req?.socket?.remoteAddress || "unknown");
}

export function createPublicStudyRateLimiter({
  limit = 3,
  windowMs = 24 * 60 * 60 * 1000,
  now = () => Date.now(),
  buckets = new Map(),
} = {}) {
  const safeLimit = Math.max(1, Number(limit) || 3);
  const safeWindowMs = Math.max(1000, Number(windowMs) || 24 * 60 * 60 * 1000);

  return function publicStudyRateLimit(req, res, next) {
    const timestamp = now();
    const key = requestKey(req);
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= timestamp
      ? { count: 0, resetAt: timestamp + safeWindowMs }
      : current;

    bucket.count += 1;
    buckets.set(key, bucket);
    const remaining = Math.max(0, safeLimit - bucket.count);
    res.set?.("Cache-Control", "private, no-store");
    res.set?.("X-RateLimit-Limit", String(safeLimit));
    res.set?.("X-RateLimit-Remaining", String(remaining));
    res.set?.("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > safeLimit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
      res.set?.("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: "The anonymous analysis limit has been reached. Register for free Study Spots to continue.",
        code: "FREE_ANALYSIS_LIMIT_REACHED",
        retryAfter,
      });
    }

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= timestamp) buckets.delete(bucketKey);
      }
    }
    return next();
  };
}
