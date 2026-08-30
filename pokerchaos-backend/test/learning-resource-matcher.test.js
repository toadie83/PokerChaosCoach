import assert from "node:assert/strict";
import test from "node:test";

import {
  matchLearningResources,
  scoreLearningResource,
} from "../src/studySpots/resourceMatcher.js";

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

test("every controlled context factor contributes deterministically", () => {
  const contextualSpot = {
    ...spot,
    type: "close_decision",
    tags: ["big-blind-defence", "short-stack"],
    villainPosition: "BTN",
    opponentType: "aggressive",
  };
  const contextualResource = resource({
    primaryTag: "big-blind-defence",
    secondaryTags: ["short-stack"],
    studySpotTypes: ["close_decision"],
    stackDepthTags: ["25-40"],
    heroPositionTags: ["BB"],
    villainPositionTags: ["BTN"],
    opponentTypeTags: ["aggressive"],
  });
  const exact = scoreLearningResource(contextualSpot, contextualResource);
  const mismatches = [
    { primaryTag: "opening", secondaryTags: [] },
    { secondaryTags: [] },
    { studySpotTypes: ["mistake"] },
    { stackDepthTags: ["0-10"] },
    { heroPositionTags: ["CO"] },
    { villainPositionTags: ["UTG"] },
    { opponentTypeTags: ["passive"] },
  ];
  for (const override of mismatches) {
    const mismatched = scoreLearningResource(contextualSpot, {
      ...contextualResource,
      ...override,
    });
    assert.ok(mismatched.score < exact.score, JSON.stringify(override));
  }
});
