import test from "node:test";
import assert from "node:assert/strict";
import {
  attachReviewEvaluation,
  evaluatePokerReviewQuality,
  resolveReviewEvaluationThresholds,
} from "../src/reviewEvaluationService.js";

function makeStreetNode({
  street = "flop",
  score = 0,
  preferredAction = "check",
  boardTexture = "",
  insight = "",
  rangeContext = "",
  sizingCommentary = "",
  planCommentary = "",
  takeaway = "",
  classification = {},
  skipped = false,
} = {}) {
  return {
    street,
    score,
    skipped,
    action_taken: { action: "check", sizing: null, size: null },
    preferred_action: { action: preferredAction, sizing: null, size: null },
    metrics: { pot_size_bb: null, spr: null, facing_size_bb: null, pot_odds: null },
    analysis: {
      insight,
      range_context: rangeContext,
      board_texture: boardTexture,
      sizing_commentary: sizingCommentary,
      plan_commentary: planCommentary,
      takeaway,
    },
    strategic_tags: [],
    tags: [],
    confidence: "medium",
    classification: {
      made_hand_category: "air",
      effective_hand_category: "air",
      pair_type: "none",
      trips_type: "none",
      showdown_strength: "none",
      showdown_relevance: "none",
      hero_contribution_level: "none",
      board_made_hand: "air",
      board_pair_kicker_class: "air",
      kicker_strength: "none",
      bluff_catcher: false,
      ...classification,
    },
  };
}

function makeReview(streetReviews = []) {
  return {
    confidence: "medium",
    street_intelligence: {
      hand_summary: {
        overall_score: 0,
        confidence: "medium",
        headline: "Street-by-street review",
        biggest_leak: "n/a",
        mistakes_found: 0,
      },
      street_reviews: streetReviews,
      tags: [],
      key_mistakes: [],
    },
  };
}

test("review QA flags bluff-catcher value-hand contradictions", () => {
  const review = makeReview([
    makeStreetNode({
      street: "river",
      boardTexture: "Qh 9d 9c 2s 3d",
      insight: "This is a bluff-catcher spot.",
      sizingCommentary: "Thin value bet is best.",
      classification: {
        made_hand_category: "pair",
        bluff_catcher: true,
      },
    }),
  ]);
  const hand = { board: { flop: ["Qh", "9d", "9c"], turn: "2s", river: "3d" } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.ok(
    out.failures.some((item) => item.code === "bluff_catcher_as_value_hand"),
  );
  assert.ok(out.categories.strategic_correctness < 100);
});

test("review QA flags fake precision equity and solver certainty claims", () => {
  const review = makeReview([
    makeStreetNode({
      street: "turn",
      boardTexture: "Ah Kc 7d 2c",
      insight: "You have exactly 38% equity and solver says this is always a jam.",
      takeaway: "Always jam this node.",
    }),
  ]);
  const hand = { board: { flop: ["Ah", "Kc", "7d"], turn: "2c" } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.ok(out.warnings.some((item) => item.code === "hallucination_threshold_breach"));
  assert.ok(out.categories.hallucination_risk > 20);
});

test("review QA flags generic coaching clichés without concrete strategic grounding", () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "Semi-dynamic flop.",
      insight: "Check to gather information and see where you're at.",
      planCommentary: "Keep options open and avoid unnecessary risk.",
      takeaway: "Stay balanced.",
    }),
  ]);
  const out = evaluatePokerReviewQuality({ review, hand: {} }).evaluation;
  assert.equal(
    out.failures.some((item) => item.code === "generic_coaching_cliche"),
    true,
  );
});

test("review QA tolerates language when concrete strategic concepts are present", () => {
  const review = makeReview([
    makeStreetNode({
      street: "turn",
      boardTexture: "Somewhat coordinated turn.",
      insight:
        "Checking keeps options open while preserving showdown value and equity realization.",
      planCommentary:
        "Use pot control here; fold equity is limited and range interaction is close.",
      takeaway: "Prioritize stack preservation near commitment threshold.",
    }),
  ]);
  const out = evaluatePokerReviewQuality({ review, hand: {} }).evaluation;
  assert.equal(
    out.failures.some((item) => item.code === "generic_coaching_cliche"),
    false,
  );
  assert.equal(
    out.warnings.some((item) => item.code === "generic_coaching_cliche"),
    true,
  );
});

test("review QA catches only extreme dry/wet board language mismatches", () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "Very dry board texture.",
      insight: "Dynamic draw pressure is low.",
    }),
  ]);
  const hand = { board: { flop: ["9h", "Th", "Jh"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.ok(
    out.warnings.some((item) => item.code === "dry_board_mismatch"),
  );
});

test("review QA treats low disconnected rainbow flops as relatively dry/static", () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "This is a fairly dry static flop.",
      insight: "Ranges stay relatively stable here.",
    }),
  ]);
  const hand = { board: { flop: ["3c", "7h", "4s"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) => item.code === "dry_board_mismatch"),
    false,
  );
});

test("review QA recognizes semi-dynamic bucket independently", () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "Semi-dynamic paired board.",
      insight: "Texture supports controlled aggression.",
    }),
  ]);
  const hand = { board: { flop: ["Qh", "Qd", "7s"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) => item.code === "semi_dynamic_mismatch"),
    false,
  );
});

test("review QA does not treat semi-dynamic language as wet/draw-heavy language", () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "Semi-dynamic texture with moderate connectivity.",
      insight: "Keep line flexible.",
    }),
  ]);
  const hand = { board: { flop: ["3c", "7h", "4s"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) => item.code === "wet_board_mismatch"),
    false,
  );
});

test("review QA accepts intermediate descriptors without false positives", () => {
  const review = makeReview([
    makeStreetNode({
      street: "turn",
      boardTexture: "Moderately connected and somewhat coordinated turn.",
      insight: "Keep sizing practical.",
    }),
  ]);
  const hand = { board: { flop: ["2s", "Ks", "8h"], turn: "4h" } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) =>
      ["dry_board_mismatch", "wet_board_mismatch", "semi_dynamic_mismatch"].includes(
        item.code,
      ),
    ),
    false,
  );
});

test("review QA flags extreme wet label on static disconnected board", () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "This flop is wet and draw-heavy.",
      insight: "Expect many draws.",
    }),
  ]);
  const hand = { board: { flop: ["3c", "7h", "4s"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) => item.code === "wet_board_mismatch"),
    true,
  );
});

test("review QA catches preflop postflop terminology misuse", () => {
  const review = makeReview([
    makeStreetNode({
      street: "preflop",
      boardTexture: "No board cards yet.",
      insight: "Hero has top pair and should value bet.",
    }),
  ]);
  const out = evaluatePokerReviewQuality({ review, hand: {} }).evaluation;
  assert.ok(
    out.warnings.some((item) => item.code === "preflop_postflop_terminology"),
  );
});

test('review QA flags overuse of "air" for speculative suited defendable holdings', () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "Kc 7d 3h",
      insight: "Calling with air is too loose in this node.",
      takeaway: "Fold air and avoid over-defending here.",
      classification: {
        made_hand_category: "air",
        effective_hand_category: "air",
      },
    }),
  ]);
  const hand = { heroCards: ["Jh", "9h"], board: { flop: ["Kc", "7d", "3h"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) => item.code === "air_overuse_speculative_holding"),
    true,
  );
});

test('review QA allows "air" label for true low-equity trash holdings', () => {
  const review = makeReview([
    makeStreetNode({
      street: "flop",
      boardTexture: "Kc 7d 3h",
      insight: "This is mostly air with poor realization.",
      takeaway: "Folding this air-heavy holding is fine.",
      classification: {
        made_hand_category: "air",
        effective_hand_category: "air",
      },
    }),
  ]);
  const hand = { heroCards: ["7c", "2d"], board: { flop: ["Kc", "7d", "3h"] } };
  const out = evaluatePokerReviewQuality({ review, hand }).evaluation;
  assert.equal(
    out.warnings.some((item) => item.code === "air_overuse_speculative_holding"),
    false,
  );
});

test("review QA catches coherence contradiction between score and matching actions", () => {
  const review = makeReview([
    {
      ...makeStreetNode({
        street: "preflop",
        score: -2,
        preferredAction: "raise",
        boardTexture: "No board cards yet.",
        insight: "Open raise is standard and effective.",
      }),
      action_taken: { action: "raise", sizing: "2.1bb", size: "2.1bb" },
      preferred_action: { action: "raise", sizing: "2.1bb", size: "2.1bb" },
    },
  ]);
  const out = evaluatePokerReviewQuality({ review, hand: {} }).evaluation;
  assert.ok(
    out.warnings.some((item) => item.code === "score_action_contradiction"),
  );
});

test("review QA supports threshold configuration and dev report attachment", () => {
  const review = makeReview([
    makeStreetNode({
      street: "turn",
      boardTexture: "Ah Kc 7d 2c",
      insight: "You have exactly 38% equity and solver says always jam.",
    }),
  ]);
  const thresholds = resolveReviewEvaluationThresholds({
    minimum_coherence_score: 95,
    maximum_hallucination_risk: 10,
  });
  const attached = attachReviewEvaluation({
    review,
    hand: { board: { flop: ["Ah", "Kc", "7d"], turn: "2c" } },
    thresholds,
    includeDetailedReport: true,
  });
  assert.ok(attached.evaluation);
  assert.equal(attached.evaluation.thresholds.minimum_coherence_score, 95);
  assert.equal(attached.evaluation.thresholds.maximum_hallucination_risk, 10);
  assert.ok(attached.evaluation_report);
});
