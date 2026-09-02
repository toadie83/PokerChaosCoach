import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTH_ROUTE,
  normalizeAppRoutePath,
} from "../src/lib/appRoutes.js";

const options = {
  authenticatedPaths: [
    "/tools",
    "/tools/study-spots",
    "/tools/tournament-review",
    "/tools/coach",
  ],
  authenticatedPrefixes: ["/tools/study-spots/reports"],
  marketingPaths: ["/", "/articles", "/free-study-plan", "/free-upload-privacy"],
  marketingPrefixes: ["/learn"],
};

test("legacy product routes redirect into the Tools architecture", () => {
  assert.equal(
    normalizeAppRoutePath("/review", options),
    "/tools/tournament-review",
  );
  assert.equal(normalizeAppRoutePath("/coach/", options), "/tools/coach");
});

test("unknown authenticated routes fail to the Tools Hub", () => {
  assert.equal(normalizeAppRoutePath("/missing", options), DEFAULT_AUTH_ROUTE);
});

test("known product and marketing routes remain stable", () => {
  assert.equal(normalizeAppRoutePath("/tools/study-spots/", options), "/tools/study-spots");
  assert.equal(normalizeAppRoutePath("/articles", options), "/articles");
  assert.equal(normalizeAppRoutePath("/free-study-plan", options), "/free-study-plan");
  assert.equal(normalizeAppRoutePath("/free-upload-privacy", options), "/free-upload-privacy");
  assert.equal(normalizeAppRoutePath("/learn/big-blind-defence", options), "/learn/big-blind-defence");
  assert.equal(
    normalizeAppRoutePath("/tools/study-spots/reports/abc-123", options),
    "/tools/study-spots/reports/abc-123",
  );
});
