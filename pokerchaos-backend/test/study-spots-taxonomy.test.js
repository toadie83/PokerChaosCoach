import assert from "node:assert/strict";
import test from "node:test";

import {
  getLearningResourceCanonicalPath,
  getStackDepthTag,
  getStudySpotTaxonomy,
  sanitizeLearningResource,
  sanitizeStudySpotTaxonomy,
} from "../src/studySpots/taxonomy.js";
import { LEARNING_RESOURCE_SEED } from "../src/studySpots/learningResourceSeed.js";

test("stack depth buckets have stable exclusive upper boundaries", () => {
  assert.equal(getStackDepthTag(0), "0-10");
  assert.equal(getStackDepthTag(9.99), "0-10");
  assert.equal(getStackDepthTag(10), "10-15");
  assert.equal(getStackDepthTag(15), "15-25");
  assert.equal(getStackDepthTag(25), "25-40");
  assert.equal(getStackDepthTag(40), "40+");
  assert.equal(getStackDepthTag(null), null);
});

test("Study Spot taxonomy fails unknown values to conservative defaults", () => {
  assert.deepEqual(
    sanitizeStudySpotTaxonomy({
      type: "certain_disaster",
      category: "invented",
      tags: ["fake-tag"],
      heroPosition: "MP9",
      opponentType: "psychic",
    }),
    {
      type: "interesting_spot",
      category: "study",
      tags: [],
      stackDepthTag: null,
      heroPosition: "unknown",
      villainPosition: "unknown",
      opponentType: "unknown",
    },
  );
});

test("resource sanitizer removes unknown tags and clamps priority", () => {
  const resource = sanitizeLearningResource({
    id: "r1",
    slug: "lesson",
    title: "Lesson",
    category: "preflop",
    tags: ["opening", "not-real", "opening"],
    contentType: "article",
    priority: 500,
  });
  assert.deepEqual(resource.tags, ["opening"]);
  assert.equal(resource.priority, 100);
  assert.ok(getStudySpotTaxonomy().categories.preflop.includes("reshove"));
});

test("LearningResource positions expose and preserve an exclusive any wildcard", () => {
  const taxonomy = getStudySpotTaxonomy();
  assert.ok(taxonomy.positionTags.includes("any"));

  const resource = sanitizeLearningResource({
    heroPositionTags: ["any", "BB"],
    villainPositionTags: ["any", "unknown"],
  });
  assert.deepEqual(resource.heroPositionTags, ["any"]);
  assert.deepEqual(resource.villainPositionTags, ["any"]);
});

test("V1 seed contains only real published study resources", () => {
  assert.equal(LEARNING_RESOURCE_SEED.length, 2);
  for (const resource of LEARNING_RESOURCE_SEED) {
    assert.equal(resource.published, true);
    assert.equal(resource.category, "study");
    assert.ok(resource.url.startsWith("https://www.playbackpoker.com/articles/"));
    assert.ok(resource.tags.includes("hand-review"));
  }
  assert.equal(
    LEARNING_RESOURCE_SEED.some((resource) =>
      resource.slug.includes("export"),
    ),
    false,
  );
});

test("article-backed resources resolve to their existing full article route", () => {
  assert.equal(
    getLearningResourceCanonicalPath({
      slug: "how-pros-review-mtt-sessions",
      resourceType: "article",
      sourceUrl: "https://www.playbackpoker.com/articles/how-pros-review-mtt-sessions",
    }),
    "/articles/how-pros-review-mtt-sessions",
  );
  assert.equal(
    LEARNING_RESOURCE_SEED.find(({ slug }) => slug === "how-pros-review-mtt-sessions")?.canonicalPath,
    "/articles/how-pros-review-mtt-sessions",
  );
});

test("article routing fails closed for external, mismatched, and non-article sources", () => {
  assert.equal(
    getLearningResourceCanonicalPath({
      slug: "example",
      resourceType: "article",
      sourceUrl: "https://example.com/articles/example",
    }),
    "/learn/example",
  );
  assert.equal(
    getLearningResourceCanonicalPath({
      slug: "example",
      resourceType: "article",
      sourceUrl: "/articles/something-else",
    }),
    "/learn/example",
  );
  assert.equal(
    getLearningResourceCanonicalPath({
      slug: "example",
      resourceType: "quick_lesson",
      sourceUrl: "/articles/example",
    }),
    "/learn/example",
  );
});
