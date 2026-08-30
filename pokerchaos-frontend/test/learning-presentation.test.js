import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAdminLearningResources,
  groupLearningResources,
  learningResourceInput,
  learningResourceSlugFromPath,
} from "../src/lib/learningPresentation.js";

test("admin library filters lessons by identity, category, and publication state", () => {
  const resources = [
    { id: "a", externalId: "daily-mtt-edge-005", lessonNumber: 5, title: "Stop Bluffing Calling Stations", category: "exploitative", status: "published" },
    { id: "b", slug: "big-blind-defence", title: "Big blind defence", category: "preflop", status: "draft" },
    { id: "c", title: "Continuation betting", category: "postflop", status: "published" },
  ];

  assert.deepEqual(filterAdminLearningResources(resources, { query: "edge-005" }).map(({ id }) => id), ["a"]);
  assert.deepEqual(filterAdminLearningResources(resources, { query: "BIG-BLIND" }).map(({ id }) => id), ["b"]);
  assert.deepEqual(filterAdminLearningResources(resources, { category: "postflop", status: "published" }).map(({ id }) => id), ["c"]);
  assert.deepEqual(filterAdminLearningResources(resources, { category: "preflop", status: "published" }), []);
});

test("canonical learning paths resolve only one lesson slug", () => {
  assert.equal(learningResourceSlugFromPath("/learn/big-blind-defence"), "big-blind-defence");
  assert.equal(learningResourceSlugFromPath("/learn"), "");
  assert.equal(learningResourceSlugFromPath("/learn/a/extra"), "");
});

test("resource grouping preserves API order within each category", () => {
  assert.deepEqual(groupLearningResources([
    { id: "a", category: "preflop" },
    { id: "b", category: "postflop" },
    { id: "c", category: "preflop" },
  ]), [
    ["preflop", [{ id: "a", category: "preflop" }, { id: "c", category: "preflop" }]],
    ["postflop", [{ id: "b", category: "postflop" }]],
  ]);
});

test("admin resource input strips read-only API fields", () => {
  const input = learningResourceInput({
    id: "server-id",
    canonicalPath: "/learn/example",
    title: "Example",
  });
  assert.equal(input.title, "Example");
  assert.equal("id" in input, false);
  assert.equal("canonicalPath" in input, false);
});
