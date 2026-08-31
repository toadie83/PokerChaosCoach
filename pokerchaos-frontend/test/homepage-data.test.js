import assert from "node:assert/strict";
import test from "node:test";

import {
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
