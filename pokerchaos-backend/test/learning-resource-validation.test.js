import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  learningResourceValidationDetails,
  validateLearningResourceImport,
  validateLearningResourceInput,
} from "../src/studySpots/learningResourceValidation.js";
import { LEARNING_RESOURCE_TYPES } from "../src/studySpots/taxonomy.js";

function validResource(overrides = {}) {
  return {
    externalId: "daily-mtt-edge-001",
    series: "Daily MTT Edge",
    lessonNumber: 1,
    slug: "defend-the-big-blind",
    title: "Defend the Big Blind With a Plan",
    shortTitle: "Big Blind Defence",
    description: "Use price, position, and stack depth to build a disciplined defending range.",
    resourceType: "quick_lesson",
    category: "preflop",
    primaryTag: "bb-defence",
    secondaryTags: ["short-stack"],
    stackDepthTags: ["15-25"],
    heroPositionTags: ["BB"],
    villainPositionTags: ["BTN"],
    opponentTypeTags: ["aggressive"],
    studySpotTypes: ["close_decision"],
    body: "Start with the price and the opener's range before judging the hand in isolation.",
    exampleSpot: "Hero is in the big blind facing a button open at 22 BB effective.",
    mistake: "Folding every marginal holding without accounting for pot odds.",
    betterPlay: "Defend hands that realise enough equity against the opening range.",
    whenToUse: ["Heads-up against a late-position open"],
    whenNotToUse: ["When players behind can still act"],
    takeaway: "Build the defence from price, range, and stack depth.",
    status: "published",
    publishedAt: null,
    instagramCaption: "",
    instagramUrl: "",
    sourceUrl: "",
    priority: 70,
    ...overrides,
  };
}

test("strict learning-resource validation accepts every future-proof resource type", () => {
  for (const resourceType of LEARNING_RESOURCE_TYPES) {
    const parsed = validateLearningResourceInput(validResource({
      resourceType,
      status: resourceType === "quick_lesson" ? "published" : "draft",
    }));
    assert.equal(parsed.success, true, resourceType);
    assert.equal(parsed.data.resourceType, resourceType);
    assert.equal(parsed.data.canonicalPath, "/learn/defend-the-big-blind");
  }
});

test("invalid taxonomy and unknown fields are rejected with field-level details", () => {
  const parsed = validateLearningResourceInput({
    ...validResource(),
    primaryTag: "river",
    inventedTag: "model-drift",
  });
  assert.equal(parsed.success, false);
  const details = learningResourceValidationDetails(parsed.error);
  assert.ok(details.fieldErrors.primaryTag?.length > 0);
  assert.ok(details.formErrors.length > 0);
});

test("published Quick Lessons require the complete lesson structure", () => {
  const parsed = validateLearningResourceInput(validResource({
    exampleSpot: "",
    mistake: "",
    betterPlay: "",
    takeaway: "",
  }));
  assert.equal(parsed.success, false);
  const details = learningResourceValidationDetails(parsed.error);
  for (const field of ["exampleSpot", "mistake", "betterPlay", "takeaway"]) {
    assert.ok(details.fieldErrors[field]?.length > 0, field);
  }
});

test("lesson numbers require a named series", () => {
  const parsed = validateLearningResourceInput(validResource({ series: null }));
  assert.equal(parsed.success, false);
  assert.ok(learningResourceValidationDetails(parsed.error).fieldErrors.series?.length > 0);
});

test("external Daily MTT Edge schema v1 is normalized for import", () => {
  const parsed = validateLearningResourceImport({
    schema_version: 1,
    external_id: "daily-mtt-edge-001",
    series: "daily-mtt-edge",
    lesson_number: "001",
    date: "2026-08-29",
    title: "Isolation raises vs limps",
    short_social_title: "Stop auto-calling behind limpers",
    category: "Preflop",
    primary_study_tag: "isolation",
    secondary_study_tags: ["opening", "capped-range", "limper"],
    stack_depth_bands: ["25-40"],
    hero_positions: ["BTN", "CO"],
    villain_positions: ["UTG"],
    opponent_types: ["recreational", "calling-station"],
    study_spot_types: ["isolation", "opening"],
    summary: "Isolate limpers from late position rather than automatically calling behind.",
    canonical_lesson: "Raise to isolate a weak, capped limping range and retain position.",
    example_spot: "Hero has ace-jack on the button after an early-position limp.",
    common_mistake: "Calling behind and inviting the blinds into a multiway pot.",
    better_play: "Raise to isolate the limper and play heads-up in position.",
    when_to_use: "**Use when:**\n- You are in late position\n- The blinds can fold",
    when_not_to_use: "**Avoid when:**\n- Aggressive players are still to act behind you",
    one_thing_to_remember: "A limp is an invitation to isolate, not an invitation to call.",
    instagram_caption: "Stop auto-calling behind limpers.",
    publication_status: "published",
    instagram_url: "https://www.instagram.com/p/example/",
    taxonomy_flags: ["missing:iso-sizing"],
    source_paths: { slug: "001-isolate-the-limp", lesson_md: "/workspace/lesson.md" },
    published_at: "2026-08-29T15:10:05Z",
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.slug, "001-isolate-the-limp");
  assert.equal(parsed.data.series, "Daily MTT Edge");
  assert.equal(parsed.data.lessonNumber, 1);
  assert.equal(parsed.data.category, "preflop");
  assert.equal(parsed.data.resourceType, "quick_lesson");
  assert.deepEqual(parsed.data.studySpotTypes, ["interesting_spot"]);
  assert.deepEqual(parsed.data.whenToUse, ["You are in late position", "The blinds can fold"]);
  assert.ok(parsed.warnings.some((warning) => warning.includes("taxonomy flags")));
});

test("external import schema remains strict and rejects unknown fields", () => {
  const parsed = validateLearningResourceImport({ schema_version: 1, invented_field: true });
  assert.equal(parsed.success, false);
  assert.ok(learningResourceValidationDetails(parsed.error).formErrors.length > 0);
});

test("complete production Daily MTT Edge 001 payload remains import-compatible", () => {
  const fixtureUrl = new URL("./fixtures/daily-mtt-edge-001.production.json", import.meta.url);
  const payload = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  const parsed = validateLearningResourceImport(payload);

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.externalId, "daily-mtt-edge-001");
  assert.equal(parsed.data.slug, "001-isolate-the-limp");
  assert.equal(parsed.data.body, payload.canonical_lesson.trim());
  assert.deepEqual(parsed.data.secondaryTags, [
    "opening",
    "capped-range",
    "limper",
    "squeeze",
    "calling-station",
  ]);
  assert.equal(parsed.data.whenToUse.length, 9);
  assert.equal(parsed.data.whenNotToUse.length, 5);
  assert.deepEqual(parsed.warnings, ["Source taxonomy flags: missing:iso-sizing."]);
});
