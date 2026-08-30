import assert from "node:assert/strict";
import test from "node:test";

import { matchLearningResources } from "../src/studySpots/resourceMatcher.js";

const spot = {
  category: "preflop",
  tags: ["big-blind-defence"],
  stackDepthTag: "25-40",
  heroPosition: "BB",
  opponentType: "unknown",
};

function resource(overrides = {}) {
  return {
    id: "bb-defence",
    slug: "bb-defence",
    title: "Big Blind Defence Fundamentals",
    description: "Defending versus late-position opens.",
    category: "preflop",
    tags: ["big-blind-defence"],
    stackDepthTags: [],
    positionTags: [],
    opponentTags: [],
    contentType: "article",
    url: "/articles/bb-defence",
    published: true,
    publishDate: "2026-01-01",
    priority: 80,
    ...overrides,
  };
}

test("exact principal-tag match produces one recommended resource", () => {
  const matches = matchLearningResources(spot, [resource()]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].quality, "recommended");
  assert.ok(matches[0].score >= 0.75);
});

test("category-only general content can be related but not recommended", () => {
  const matches = matchLearningResources(spot, [
    resource({ id: "general", slug: "general", tags: ["opening"] }),
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].quality, "related");
});

test("unrelated, unpublished, and empty libraries produce no match", () => {
  assert.deepEqual(matchLearningResources(spot, []), []);
  assert.deepEqual(
    matchLearningResources(spot, [
      resource({
        id: "river",
        slug: "river",
        category: "postflop",
        tags: ["river"],
      }),
    ]),
    [],
  );
  assert.deepEqual(
    matchLearningResources(spot, [resource({ published: false })]),
    [],
  );
});

test("specific incompatible context prevents a fabricated recommendation", () => {
  const matches = matchLearningResources(spot, [
    resource({
      stackDepthTags: ["0-10"],
      positionTags: ["BTN"],
      opponentTags: ["aggressive"],
    }),
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].quality, "related");
});

