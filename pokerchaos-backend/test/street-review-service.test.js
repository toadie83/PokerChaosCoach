import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateStreetReviewSummary,
  buildStreetReviewAggregateFromStreetReviews,
  buildStreetReviewAggregate,
  buildStreetReviewsFromLegacyReview,
  computeAverageConfidence,
  computeMistakeCount,
} from "../src/streetReviewService.js";

function sampleLegacyReview(overrides = {}) {
  return {
    overall_score: -1,
    preflop_score: -1,
    flop_score: -2,
    turn_score: null,
    river_score: null,
    confidence: "medium",
    what_was_good: "Good discipline versus pressure.",
    primary_leak: "Turn and river planning was too passive.",
    better_line: "Consider a tighter continue threshold.",
    reasoning: "Stack depth and pot geometry called for caution.",
    ...overrides,
  };
}

function sampleHandContext() {
  return {
    blinds: { bigBlind: 100 },
    board: { flop: ["Ah", "7d", "2c"], turn: "9s", river: null },
    heroActionsByStreet: {
      preflop: [{ type: "raise", amount: 200, toAmount: 300 }],
      flop: [{ type: "call", amount: 250 }],
      turn: [],
      river: [],
    },
    validatedHandState: {
      street: "flop",
      potSize: 900,
      facingBet: 250,
      math: {
        spr: 2.4,
        callAmount: 250,
        finalPotIfCall: 1400,
      },
    },
  };
}

test("buildStreetReviewsFromLegacyReview creates one node per street", () => {
  const nodes = buildStreetReviewsFromLegacyReview(
    sampleLegacyReview(),
    sampleHandContext(),
  );
  assert.equal(nodes.length, 4);
  assert.equal(nodes[0].street, "preflop");
  assert.equal(nodes[1].street, "flop");
  assert.equal(nodes[1].metrics.pot_size_bb, 9);
  assert.equal(nodes[1].metrics.facing_size_bb, 2.5);
});

test("summary helpers compute mistakes and confidence", () => {
  const nodes = buildStreetReviewsFromLegacyReview(
    sampleLegacyReview({ confidence: "high" }),
    sampleHandContext(),
  );
  assert.equal(computeMistakeCount(nodes), 2);
  assert.equal(computeAverageConfidence(nodes, "medium"), "high");
  const summary = aggregateStreetReviewSummary(sampleLegacyReview(), nodes);
  assert.equal(summary.mistakes_found, 2);
  assert.equal(typeof summary.headline, "string");
});

test("buildStreetReviewAggregate returns replay-ready envelope", () => {
  const aggregate = buildStreetReviewAggregate(
    sampleLegacyReview(),
    sampleHandContext(),
  );
  assert.ok(aggregate.hand_summary);
  assert.equal(Array.isArray(aggregate.street_reviews), true);
  assert.equal(Array.isArray(aggregate.key_mistakes), true);
  assert.equal(Array.isArray(aggregate.tags), true);
});

test("buildStreetReviewAggregateFromStreetReviews supports AI street outputs", () => {
  const aggregate = buildStreetReviewAggregateFromStreetReviews({
    legacyReview: sampleLegacyReview(),
    streetReviews: [
      {
        street: "flop",
        score: -1,
        action_taken: { action: "bet", sizing: "1.2bb" },
        preferred_action: { action: "check", sizing: null },
        metrics: { pot_size_bb: 9.1, spr: 2.4, facing_size_bb: null, pot_odds: null },
        analysis: {
          insight: "Sizing was likely too thin for this board interaction.",
          range_context: "Range still has showdown value and can check back frequently.",
          board_texture: "Ah 7d 2c",
          sizing_commentary: "A smaller stab invites too many indifferent continues.",
          plan_commentary: "Check back more and protect turn bluff-catching lines.",
          takeaway: "Reduce low-leverage flop stabs in this node.",
        },
        confidence: "medium",
        strategic_tags: ["sizing_leak", "pressure_leak"],
      },
    ],
  });
  assert.equal(aggregate.hand_summary.mistakes_found, 1);
  assert.equal(Array.isArray(aggregate.street_reviews), true);
  assert.equal(aggregate.street_reviews[0].action_taken.size, "1.2bb");
});

test("does not promote speculative preflop leak when summary calls line reasonable", () => {
  const aggregate = buildStreetReviewAggregateFromStreetReviews({
    legacyReview: sampleLegacyReview({
      what_was_good:
        "Preflop call is reasonable at this stack depth versus wider population ranges.",
      primary_leak: "Preflop fold was mandatory.",
    }),
    streetReviews: [
      {
        street: "preflop",
        score: -1,
        action_taken: { action: "call", sizing: "2.5bb" },
        preferred_action: { action: "fold", sizing: null },
        metrics: { pot_size_bb: 6.5, spr: 4.1, facing_size_bb: 2.5, pot_odds: "29%" },
        analysis: {
          insight: "Flatting can be reasonable in practice against aggressive fields.",
          range_context: "Hands with playability can defend at some frequency.",
          board_texture: "No board cards yet.",
          sizing_commentary: "Facing a standard open size.",
          plan_commentary: "Continue cautiously across later streets.",
          takeaway: "Preflop fold was mandatory in theory.",
        },
        confidence: "low",
        strategic_tags: ["low_equity", "passive_line", "preflop_fold"],
      },
    ],
  });

  assert.equal(aggregate.hand_summary.biggest_leak, "No major leak flagged.");
  assert.equal(aggregate.hand_summary.mistakes_found, 0);
  assert.deepEqual(aggregate.key_mistakes, []);
});

test("promotes strong high-confidence negative street as biggest leak", () => {
  const aggregate = buildStreetReviewAggregateFromStreetReviews({
    legacyReview: sampleLegacyReview({
      what_was_good: "Preflop open is standard and defensible.",
      primary_leak: "River fold under pressure.",
    }),
    streetReviews: [
      {
        street: "preflop",
        score: 0,
        action_taken: { action: "raise", sizing: "2.1bb" },
        preferred_action: { action: "raise", sizing: "2.1bb" },
        metrics: { pot_size_bb: 3.2, spr: 18.7, facing_size_bb: null, pot_odds: null },
        analysis: {
          insight: "Open size is standard.",
          range_context: "Opening range is acceptable here.",
          board_texture: "No board cards yet.",
          sizing_commentary: "Sizing is consistent with stack depth.",
          plan_commentary: "Proceed with a balanced c-bet strategy on favorable boards.",
          takeaway: "Solid preflop execution.",
        },
        confidence: "high",
        strategic_tags: ["open_raise"],
      },
      {
        street: "river",
        score: -2,
        action_taken: { action: "fold", sizing: null },
        preferred_action: { action: "call", sizing: null },
        metrics: { pot_size_bb: 24.9, spr: 0.8, facing_size_bb: 7.2, pot_odds: "22%" },
        analysis: {
          insight: "This fold is a mistake against missed draws in villain's range.",
          range_context: "Range still contains bluff-catchers with sufficient showdown value.",
          board_texture: "Kd Ts 6s 3d 2c",
          sizing_commentary: "Facing a medium sizing that keeps bluffs alive.",
          plan_commentary: "Use pot odds and blockers to defend more often.",
          takeaway: "Overfold river here is a clear leak and a costly mistake.",
        },
        confidence: "high",
        strategic_tags: ["overfold_river", "passive_leak"],
      },
    ],
  });

  assert.match(aggregate.hand_summary.biggest_leak, /overfold river|clear leak|costly mistake/i);
  assert.equal(aggregate.hand_summary.mistakes_found, 1);
  assert.equal(aggregate.key_mistakes.length, 1);
  assert.match(aggregate.key_mistakes[0], /^RIVER:/);
});

test("does not promote mandatory-fold leak text when chart marks spot as mixed continue", () => {
  const aggregate = buildStreetReviewAggregateFromStreetReviews({
    legacyReview: sampleLegacyReview({
      what_was_good: "Defending this blind spot can be reasonable versus wider opens.",
      primary_leak: "Standard fold preflop.",
    }),
    streetReviews: [
      {
        street: "preflop",
        score: -1,
        action_taken: { action: "call", sizing: "2.0bb" },
        preferred_action: { action: "fold", sizing: null },
        metrics: { pot_size_bb: 4.8, spr: 5.6, facing_size_bb: 2, pot_odds: "31%" },
        analysis: {
          insight: "Mandatory fold here with this holding.",
          range_context: "Too weak to continue.",
          board_texture: "No board cards yet.",
          sizing_commentary: "Standard fold.",
          plan_commentary: "Must fold preflop.",
          takeaway: "Obvious fold preflop.",
        },
        confidence: "medium",
        strategic_tags: ["passive_line"],
        audit_heuristics: {
          street: "preflop",
          chart_recommendation: "mixed_continue",
          chart_confidence: "medium",
          spot_classification: "bb_defend_vs_open",
          solver_mix_estimate: "mixed_continue",
          population_adjustment: null,
        },
      },
    ],
  });

  assert.equal(aggregate.hand_summary.mistakes_found, 0);
  assert.equal(aggregate.hand_summary.biggest_leak, "No major leak flagged.");
  assert.deepEqual(aggregate.key_mistakes, []);
});

test("source-of-truth summary suppresses stale facing-raise framing for open-decision nodes", () => {
  const aggregate = buildStreetReviewAggregateFromStreetReviews({
    legacyReview: sampleLegacyReview({
      what_was_good: "Fold facing a raise from the big blind was prudent.",
      better_line: "Facing pressure, fold preflop.",
      primary_leak: "None. Folding versus raise is standard.",
      reasoning: "Hero was under preflop aggression.",
    }),
    streetReviews: [
      {
        street: "preflop",
        score: -1,
        decision_type: "open_decision",
        first_in_opportunity: true,
        facing_raise: false,
        action_time_state: {
          decision_type: "open_decision",
          open_opportunity: true,
          facing_raise: false,
        },
        action_taken: { action: "fold", sizing: null },
        preferred_action: { action: "raise", sizing: "2.2bb" },
        metrics: { pot_size_bb: 2.3, spr: 40, facing_size_bb: 0, pot_odds: null },
        analysis: {
          insight: "Folding first-in here is somewhat tight on the button.",
          range_context: "This is an unopened pot spot, not a facing-raise node.",
          board_texture: "No board cards yet.",
          sizing_commentary: "A standard open size applies when choosing to enter.",
          plan_commentary: "Open at normal frequency when action folds to you.",
          takeaway: "Opening is generally preferred in this first-in node.",
        },
        confidence: "medium",
        strategic_tags: ["missed_aggression"],
      },
    ],
  });

  assert.equal(
    /facing (a )?(raise|open|3-bet|jam)/i.test(
      String(aggregate?.source_of_truth_summary?.what_was_good || ""),
    ),
    false,
  );
  assert.equal(
    /no prior action|good spot to consider opening|opening is generally preferred/i.test(
      String(aggregate?.source_of_truth_summary?.what_was_good || ""),
    ),
    true,
  );
  assert.equal(
    /facing (a )?(raise|open|3-bet|jam)/i.test(
      String(aggregate?.source_of_truth_summary?.better_line || ""),
    ),
    false,
  );
  const summaryBlob = [
    aggregate?.source_of_truth_summary?.what_was_good,
    aggregate?.source_of_truth_summary?.better_line,
    aggregate?.source_of_truth_summary?.primary_leak,
    aggregate?.source_of_truth_summary?.reasoning,
    aggregate?.hand_summary?.strategic_summary,
    aggregate?.hand_summary?.primary_adjustment,
    aggregate?.hand_summary?.biggest_leak,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  assert.equal(
    /\b(node|reconstruction|semantic classification|action-time state|normalized street review|deterministic interpretation)\b/i.test(
      summaryBlob,
    ),
    false,
  );
});
