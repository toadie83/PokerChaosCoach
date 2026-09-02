import assert from "node:assert/strict";
import test from "node:test";

import { createPublicStudyRateLimiter } from "../src/publicStudyRateLimit.js";

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    set(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("public study analysis is bounded per client and resets after its window", () => {
  let timestamp = 1000;
  const limiter = createPublicStudyRateLimiter({
    limit: 2,
    windowMs: 5000,
    now: () => timestamp,
  });
  const request = { ip: "203.0.113.10", headers: {} };

  for (let index = 0; index < 2; index += 1) {
    let called = false;
    limiter(request, responseRecorder(), () => { called = true; });
    assert.equal(called, true);
  }

  const limited = responseRecorder();
  limiter(request, limited, () => assert.fail("limited request must not continue"));
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, "FREE_ANALYSIS_LIMIT_REACHED");
  assert.equal(limited.headers["Retry-After"], "5");
  assert.equal(limited.headers["Cache-Control"], "private, no-store");
  assert.equal(limited.headers["X-RateLimit-Limit"], "2");
  assert.equal(limited.headers["X-RateLimit-Remaining"], "0");

  timestamp = 6000;
  let calledAfterReset = false;
  limiter(request, responseRecorder(), () => { calledAfterReset = true; });
  assert.equal(calledAfterReset, true);
});

test("public study rate limiting ignores a caller-supplied forwarded address", () => {
  const limiter = createPublicStudyRateLimiter({ limit: 1 });
  const firstRequest = {
    ip: "203.0.113.20",
    headers: { "x-forwarded-for": "198.51.100.1" },
  };
  const spoofedRequest = {
    ip: "203.0.113.20",
    headers: { "x-forwarded-for": "198.51.100.2" },
  };

  limiter(firstRequest, responseRecorder(), () => {});
  const limited = responseRecorder();
  limiter(spoofedRequest, limited, () => assert.fail("spoofed forwarding header must not bypass the limit"));

  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, "FREE_ANALYSIS_LIMIT_REACHED");
});
