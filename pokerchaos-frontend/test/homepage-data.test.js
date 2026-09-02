import assert from "node:assert/strict";
import test from "node:test";

import {
  STUDY_PREVIEW_SPOTS,
  TOURNAMENT_ANALYSIS_STEPS,
  isQuickLearningResource,
  selectHomepageLearningResources,
} from "../src/components/marketing/homepage/homepageData.js";

test("homepage learning resources stay published, canonical, ordered, and limited", () => {
  const resources = [
    { id: "first", status: "published", canonicalPath: "/learn/first" },
    { id: "draft", status: "draft", canonicalPath: "/learn/draft" },
    { id: "missing-path", status: "published" },
    { id: "second", status: "published", canonicalPath: "/learn/second" },
    { id: "third", status: "published", canonicalPath: "/learn/third" },
  ];

  assert.deepEqual(
    selectHomepageLearningResources(resources, 2).map((resource) => resource.id),
    ["first", "second"],
  );
});

test("homepage learning resource selection handles invalid input and limits", () => {
  assert.deepEqual(selectHomepageLearningResources(null), []);
  assert.deepEqual(
    selectHomepageLearningResources([
      { id: "lesson", status: "published", canonicalPath: "/learn/lesson" },
    ], -1),
    [],
  );
});

test("homepage distinguishes quick lessons from long-form articles", () => {
  assert.equal(isQuickLearningResource({ resourceType: "quick_lesson" }), true);
  assert.equal(isQuickLearningResource({ contentType: "quick_lesson" }), true);
  assert.equal(isQuickLearningResource({ resourceType: "article" }), false);
  assert.equal(isQuickLearningResource(null), false);
});

test("homepage study plan preview stays concise and lesson-led", () => {
  assert.equal(STUDY_PREVIEW_SPOTS.length, 3);
  for (const spot of STUDY_PREVIEW_SPOTS) {
    assert.ok(spot.category);
    assert.ok(spot.context);
    assert.ok(spot.reason);
    assert.ok(spot.lesson);
    assert.ok(spot.href);
  }
});

test("homepage analysis preview exposes the complete five-stage journey", () => {
  assert.deepEqual(
    TOURNAMENT_ANALYSIS_STEPS.map((step) => step.title),
    [
      "Validating tournament",
      "Reading hand history",
      "Identifying useful study spots",
      "Matching Learning Library resources",
      "Building your lesson plan",
    ],
  );
});
