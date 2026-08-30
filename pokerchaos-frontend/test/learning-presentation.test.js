import assert from "node:assert/strict";
import test from "node:test";

import {
  groupLearningResources,
  learningResourceInput,
  learningResourceSlugFromPath,
} from "../src/lib/learningPresentation.js";

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
