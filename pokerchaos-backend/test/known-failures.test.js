import test from "node:test";
import assert from "node:assert/strict";
import { buildValidatedHandState } from "../src/handStateValidationService.js";
import {
  __reviewTrustTestables,
  reviewTournamentHand,
} from "../src/openaiService.js";

const {
  VALIDATION_SEVERITY,
  validateReviewModelOutputContract,
  validatePostGenerationReview,
  classifyReviewValidationFindings,
  applyReviewGuardrails,
  finalizeCoachingPresentation,
  classifyPreflopAction,
  detectJamTree,
  detectIsolationSpot,
  detectCommitmentState,
  detectStreetAgency,
  collectStreetAiContexts,
  buildSkippedStreetReviewNode,
  fallbackStreetReview,
  normalizeStreetReviewFromModel,
  areActionAndSizingAligned,
  opponentConfidenceTier,
  buildOpponentConfidenceNarrative,
  deriveHandClassification,
  decisionEvaluationForContext,
  compactStreetContextForPrompt,
} = __reviewTrustTestables;

function baseHandContext(overrides = {}) {
  return {
    reviewContext: { heroFoldedStreet: null },
    validatedHandState: {
      street: "flop",
      heroPosition: "BTN",
      heroHand: ["Ac", "Kd"],
      effectiveStackBB: 18,
      potSize: 3330,
      facingBet: 10874,
      legalActions: ["call", "fold"],
      heroCanRaise: false,
      math: {
        callAmount: 9674,
        finalPotIfCall: 22548,
        potOddsRatio: "2.34:1",
        spr: 1.2,
      },
      boardCards: ["7h", "8d", "2c"],
      villainActions: [],
      actionHistory: [],
      isAllInFacingAction: true,
    },
    handStateValidation: { isValid: true, issues: [] },
    ...overrides,
  };
}

function sampleModelResponse(overrides = {}) {
  return {
    overall_score: -1,
    preflop_score: 0,
    flop_score: -1,
    turn_score: null,
    river_score: null,
    confidence: "medium",
    what_was_good: "Preflop was reasonable.",
    primary_leak: "Calling too wide versus jam ranges.",
    better_line: "Fold versus this sizing.",
    reasoning: "Pot odds and stack depth make the call -EV here.",
    usage: null,
    ...overrides,
  };
}

function redditFailureFixture001Hand() {
  return {
    fixtureId: "reddit_failure_fixture_001",
    heroName: "Hero",
    heroCards: ["8s", "9h"],
    heroPosition: "BTN",
    heroStack: 11874,
    blinds: {
      ante: 90,
      smallBlind: 300,
      bigBlind: 600,
    },
    seats: [
      { seat: 1, player: "bba622b1", chips: 12400, position: "SB" },
      { seat: 2, player: "6a5ff5a9", chips: 14000, position: "BB" },
      { seat: 3, player: "Hero", chips: 11874, position: "BTN" },
      { seat: 4, player: "ee9bc1ec", chips: 9600, position: "UTG" },
      { seat: 5, player: "b67ce213", chips: 10100, position: "HJ" },
      { seat: 6, player: "e8171b40", chips: 8300, position: "CO" },
      { seat: 7, player: "a5e2ea4c", chips: 7700, position: "LJ" },
    ],
    board: {
      flop: [],
      turn: null,
      river: null,
    },
    actionsByStreet: {
      preflop: [
        { player: "bba622b1", type: "post_ante", amount: 90 },
        { player: "ee9bc1ec", type: "post_ante", amount: 90 },
        { player: "6a5ff5a9", type: "post_ante", amount: 90 },
        { player: "Hero", type: "post_ante", amount: 90 },
        { player: "b67ce213", type: "post_ante", amount: 90 },
        { player: "e8171b40", type: "post_ante", amount: 90 },
        { player: "a5e2ea4c", type: "post_ante", amount: 90 },
        { player: "bba622b1", type: "post_small_blind", amount: 300 },
        { player: "6a5ff5a9", type: "post_big_blind", amount: 600 },
        { player: "a5e2ea4c", type: "fold" },
        { player: "ee9bc1ec", type: "fold" },
        { player: "b67ce213", type: "fold" },
        { player: "e8171b40", type: "fold" },
        { player: "Hero", type: "raise", amount: 600, toAmount: 1200 },
        { player: "bba622b1", type: "fold" },
        { player: "6a5ff5a9", type: "jam", amount: 10874, toAmount: 10874 },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroOutcome: {
      foldedStreet: "preflop",
      resolvedStreet: "preflop",
    },
  };
}

test("schema contract rejects malformed model payload", () => {
  const malformed = {
    overall_score: "bad",
    confidence: "high",
    primary_leak: "",
  };
  const result = validateReviewModelOutputContract(malformed);
  assert.equal(result.valid, false);
  assert.ok(result.findings.length > 0);
  assert.equal(result.summary.blockerCount > 0, true);
});

test("illegal action mention gets scrubbed when raise is illegal", () => {
  const handContext = baseHandContext();
  const guarded = applyReviewGuardrails(
    sampleModelResponse({
      better_line: "Rejam over the top to maximize fold equity.",
      reasoning: "A shove is best.",
    }),
    handContext,
    [
      {
        type: "ambiguous_aggression_wording",
        severity: VALIDATION_SEVERITY.WARNING,
        field: "better_line",
        message: "Aggressive wording detected in call/fold-only node",
      },
      {
        type: "ambiguous_aggression_wording",
        severity: VALIDATION_SEVERITY.WARNING,
        field: "reasoning",
        message: "Aggressive wording detected in call/fold-only node",
      },
    ],
  );
  assert.match(guarded.review.better_line, /call or fold|legal options|consider continuing/i);
  assert.doesNotMatch(guarded.review.better_line, /\b(rejam|shove|raise|jam)\b/i);
  const validation = validatePostGenerationReview(guarded.review, handContext);
  assert.equal(validation.summary.blockerCount, 0);
});

test("pot-odds mismatch is rejected by post-generation validator", () => {
  const handContext = baseHandContext();
  const invalid = sampleModelResponse({
    reasoning: "You are getting 6.0:1 so calling is mandatory.",
  });
  const result = validatePostGenerationReview(invalid, handContext);
  assert.equal(result.valid, false);
  assert.ok(
    result.findings.some(
      (item) =>
        item.type === "pot_odds_mismatch" &&
        item.severity === VALIDATION_SEVERITY.BLOCKER,
    ),
    `Expected pot-odds blocker, got: ${result.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );
});

test("unsupported concept mention is gated when prerequisites are missing", () => {
  const handContext = baseHandContext({
    payoutDataAvailable: false,
    solverSourceAvailable: false,
    villainRangeModelAvailable: false,
  });
  const raw = sampleModelResponse({
    better_line: "Apply pressure with an aggressive option.",
    reasoning:
      "Solver-approved line uses MDF defense and polarized range pressure with ICM pressure.",
  });
  const findings = classifyReviewValidationFindings(raw, handContext).findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const guarded = applyReviewGuardrails(
    raw,
    handContext,
    findings,
  );
  assert.match(
    guarded.review.reasoning,
    /Concept-heavy language was reduced|continue cautiously|consider continuing/i,
  );
});

test("duplicate-card hand is flagged by deterministic hand-state validation", () => {
  const { validation } = buildValidatedHandState({
    heroName: "Hero",
    heroCards: ["Ac", "Kd"],
    heroPosition: "BTN",
    heroStack: 1800,
    blinds: { bigBlind: 100 },
    board: { flop: ["Ac", "7h", "2d"] },
    actionsByStreet: {
      preflop: [
        { player: "Villain", type: "raise", amount: 200, toAmount: 300 },
        { player: "Hero", type: "call", amount: 200 },
      ],
    },
  });
  assert.equal(validation.isValid, false);
  assert.ok(validation.issues.some((line) => /Duplicate cards detected/i.test(line)));
});

test("invalid hand-state path returns low-confidence safe fallback without OpenAI call", async () => {
  const review = await reviewTournamentHand(
    baseHandContext({
      handStateValidation: {
        isValid: false,
        issues: ["No hero decision action found in hand history."],
      },
    }),
    "review",
    "gpt-4.1-mini",
  );
  assert.equal(review.confidence, "low");
  assert.ok(
    review.deterministic_intelligence &&
      typeof review.deterministic_intelligence === "object",
  );
  assert.equal(
    /validation|system|deterministic|checks failed|guardrails/i.test(
      `${review.primary_leak} ${review.reasoning} ${review.better_line}`,
    ),
    false,
  );
});

test("decision-node filtering marks postflop as automatic runout after preflop all-ins", () => {
  const hand = {
    heroName: "Hero",
    heroStack: 1600,
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    seats: [
      { seat: 1, player: "Hero", chips: 1600, position: "BTN" },
      { seat: 2, player: "SB", chips: 1400, position: "SB" },
      { seat: 3, player: "BB", chips: 1800, position: "BB" },
    ],
    heroOutcome: { resolvedStreet: "river", code: "lost_showdown" },
    board: { flop: ["Ah", "7d", "2c"], turn: "9s", river: "Kd" },
    actionsByStreet: {
      preflop: [
        { player: "SB", type: "post_small_blind", amount: 50 },
        { player: "BB", type: "post_big_blind", amount: 100 },
        { player: "Hero", type: "jam", amount: 1600, toAmount: 1600 },
        { player: "SB", type: "jam", amount: 1400, toAmount: 1400 },
        { player: "BB", type: "call", amount: 1500 },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "jam", amount: 1600, toAmount: 1600 }],
      flop: [],
      turn: [],
      river: [],
    },
  };
  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "preflop",
        effectiveStackBB: 16,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { spr: 1.1, callAmount: 1500, finalPotIfCall: 4650 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "high", strategic_tags: [] },
          { street: "flop", pressure_level: "high", strategic_tags: [] },
          { street: "turn", pressure_level: "high", strategic_tags: [] },
          { street: "river", pressure_level: "high", strategic_tags: [] },
        ],
      },
    },
    { confidence: "medium", preflop_score: -1 },
  );
  const flop = contexts.find((item) => item.street === "flop");
  assert.equal(Boolean(flop?.is_decision_street), false);
  assert.equal(Boolean(flop?.automatic_runout), true);
  assert.equal(Boolean(flop?.hand_semantics?.all_in_before_flop), true);
});

test("street AI contexts derive hand classification per street board progression", () => {
  const hand = {
    heroName: "Hero",
    heroCards: ["Ah", "Kh"],
    heroPosition: "BTN",
    heroStack: 2000,
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    seats: [
      { seat: 1, player: "Hero", chips: 2000, position: "BTN" },
      { seat: 2, player: "SB", chips: 1900, position: "SB" },
      { seat: 3, player: "BB", chips: 2100, position: "BB" },
    ],
    heroOutcome: { resolvedStreet: "river", code: "won_showdown" },
    board: { flop: ["Ad", "7c", "2s"], turn: "Kc", river: "9d" },
    actionsByStreet: {
      preflop: [
        { player: "SB", type: "post_small_blind", amount: 50 },
        { player: "BB", type: "post_big_blind", amount: 100 },
        { player: "Hero", type: "raise", amount: 300, toAmount: 300 },
        { player: "BB", type: "call", amount: 200 },
      ],
      flop: [
        { player: "BB", type: "check" },
        { player: "Hero", type: "bet", amount: 250 },
        { player: "BB", type: "call", amount: 250 },
      ],
      turn: [
        { player: "BB", type: "check" },
        { player: "Hero", type: "check" },
      ],
      river: [
        { player: "BB", type: "check" },
        { player: "Hero", type: "check" },
      ],
    },
    heroActionsByStreet: {
      preflop: [{ type: "raise", amount: 300, toAmount: 300 }],
      flop: [{ type: "bet", amount: 250 }],
      turn: [{ type: "check" }],
      river: [{ type: "check" }],
    },
  };

  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "flop",
        heroHand: ["Ah", "Kh"],
        effectiveStackBB: 20,
        legalActions: ["check", "bet"],
        heroCanRaise: true,
        potSize: 700,
        facingBet: 0,
        math: { spr: 2.2 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "low", strategic_tags: [] },
          { street: "flop", pressure_level: "medium", strategic_tags: [] },
          { street: "turn", pressure_level: "low", strategic_tags: [] },
          { street: "river", pressure_level: "low", strategic_tags: [] },
        ],
      },
    },
    { confidence: "medium", preflop_score: 0, flop_score: 1, turn_score: 0, river_score: 0 },
  );

  const preflop = contexts.find((item) => item.street === "preflop");
  const flop = contexts.find((item) => item.street === "flop");
  const turn = contexts.find((item) => item.street === "turn");
  const river = contexts.find((item) => item.street === "river");

  assert.equal(preflop?.classification?.made_hand_category, "air");
  assert.equal(preflop?.classification?.made_hand_type, "ace_high");
  assert.equal(flop?.classification?.made_hand_category, "pair");
  assert.equal(flop?.classification?.made_hand_type, "top_pair");
  assert.equal(flop?.classification?.pair_type, "top");
  assert.equal(flop?.classification?.pair_source, "one_hole_one_board");
  assert.equal(flop?.classification?.board_pairing, false);
  assert.equal(flop?.classification?.showdown_strength_tier, "medium_showdown");
  assert.equal(turn?.classification?.made_hand_category, "two_pair");
  assert.equal(river?.classification?.made_hand_category, "two_pair");
});

test("KhQh turn combo draw remains explicit without preflop premium leakage", () => {
  const hand = {
    handId: "khqh_combo_draw_regression",
    heroName: "Hero",
    heroCards: ["Kh", "Qh"],
    heroPosition: "UTG",
    heroStack: 2240,
    blinds: { smallBlind: 50, bigBlind: 100, ante: 15 },
    seats: [
      { seat: 1, player: "Hero", chips: 2240, position: "UTG" },
      { seat: 2, player: "Villain", chips: 5000, position: "BTN" },
    ],
    heroOutcome: { resolvedStreet: "turn", code: "lost_showdown" },
    board: { flop: ["6c", "9h", "3h"], turn: "Ts", river: null },
    actionsByStreet: {
      preflop: [
        { player: "Hero", type: "raise", amount: 220, toAmount: 220 },
        { player: "Villain", type: "call", amount: 220 },
      ],
      flop: [
        { player: "Hero", type: "check" },
        { player: "Villain", type: "bet", amount: 300, toAmount: 300 },
        { player: "Hero", type: "call", amount: 300 },
      ],
      turn: [
        { player: "Hero", type: "check" },
        { player: "Villain", type: "jam", amount: 1635, toAmount: 1635 },
        { player: "Hero", type: "call", amount: 1635 },
      ],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "raise", amount: 220, toAmount: 220 }],
      flop: [{ type: "check" }, { type: "call", amount: 300 }],
      turn: [{ type: "check" }, { type: "call", amount: 1635 }],
      river: [],
    },
  };
  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "turn",
        heroHand: ["Kh", "Qh"],
        effectiveStackBB: 22.4,
        legalActions: ["fold", "call"],
        heroCanRaise: false,
        potSize: 3173,
        facingBet: 1635,
        math: {
          spr: 0.71,
          callAmount: 1635,
          finalPotIfCall: 4808,
        },
        boardCards: ["6c", "9h", "3h", "Ts"],
        isAllInFacingAction: true,
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "low", strategic_tags: [] },
          { street: "flop", pressure_level: "medium", strategic_tags: [] },
          { street: "turn", pressure_level: "high", strategic_tags: [] },
        ],
      },
    },
    {
      confidence: "medium",
      preflop_score: 0,
      flop_score: 0,
      turn_score: -1,
    },
  );

  const preflop = contexts.find((item) => item.street === "preflop");
  const turn = contexts.find((item) => item.street === "turn");
  assert.equal(preflop?.classification?.hand_tier, "premium");
  assert.equal(preflop?.classification?.premium_holding, true);
  assert.equal(turn?.classification?.made_hand_category, "air");
  assert.equal(turn?.classification?.made_hand_type, "king_high");
  assert.equal(turn?.classification?.draws_present?.flush_draw, true);
  assert.equal(turn?.classification?.draws_present?.flush_draw_suit, "hearts");
  assert.equal(turn?.classification?.draws_present?.straight_draw, true);
  assert.equal(turn?.classification?.draws_present?.straight_draw_type, "gutshot");
  assert.equal(turn?.classification?.draws_present?.combo_draw, true);
  assert.equal(turn?.classification?.hand_tier, null);
  assert.equal(turn?.classification?.premium_holding, false);

  const compact = compactStreetContextForPrompt(turn);
  assert.equal(compact?.classification?.draws?.flush_draw, true);
  assert.equal(compact?.classification?.draws?.flush_draw_suit, "hearts");
  assert.equal(compact?.classification?.draws?.straight_draw, true);
  assert.equal(compact?.classification?.draws?.straight_draw_type, "gutshot");
  assert.equal(compact?.classification?.draws?.combo_draw, true);
  assert.equal(compact?.classification?.hand_tier, undefined);

  const normalized = normalizeStreetReviewFromModel(
    {
      score: -1,
      preferred_action: { action: "fold", sizing: null },
      analysis: {
        insight: "K-high has strong showdown value despite premium classification.",
        range_context:
          "Without a clearly defined strong draw, this high-card hand cannot continue.",
        board_texture: "The board is moderately connected with a heart draw.",
        sizing_commentary: "The price alone does not settle the range decision.",
        plan_commentary: "Continue only when range equity clears the required price.",
        takeaway: "Premium status alone is insufficient at this commitment point.",
      },
      confidence: "medium",
      strategic_tags: ["premium_hand", "high_pressure_node"],
    },
    turn,
  );
  const normalizedText = Object.values(normalized.analysis).join(" ");
  assert.equal(normalized.preferred_action.action, "fold");
  assert.match(normalizedText, /hearts flush draw/i);
  assert.match(normalizedText, /gutshot straight draw/i);
  assert.doesNotMatch(normalizedText, /strong showdown value/i);
  assert.doesNotMatch(normalizedText, /without a clearly defined strong draw/i);
  assert.equal(normalized.strategic_tags.includes("premium_hand"), false);
  assert.equal(normalized.strategic_tags.includes("combo_draw"), true);

  const fallback = fallbackStreetReview({
    ...turn,
    seed_takeaway: "The preflop decision itself appears fundamentally reasonable.",
    seed_confidence: "medium",
  });
  const fallbackText = Object.values(fallback.analysis).join(" ");
  assert.equal(fallback.generation_status, "fallback");
  assert.equal(fallback.confidence, "low");
  assert.equal(fallback.preferred_action.action, "call");
  assert.match(fallback.analysis.insight, /hearts flush draw/i);
  assert.match(fallback.analysis.insight, /gutshot straight draw/i);
  assert.match(fallback.analysis.range_context, /34% equity/i);
  assert.match(fallback.analysis.sizing_commentary, /16\.35 BB/i);
  assert.match(fallback.analysis.plan_commentary, /no later-street flexibility/i);
  assert.doesNotMatch(fallbackText, /preflop decision/i);
  assert.doesNotMatch(fallbackText, /keep a flexible line/i);
});

test("street AI context preserves check-call decision node semantics", () => {
  const hand = {
    heroName: "Hero",
    heroCards: ["Jh", "9h"],
    heroPosition: "SB",
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    heroOutcome: { resolvedStreet: "river", code: "folded_river" },
    board: { flop: ["Ks", "8c", "3h"], turn: "2d", river: "Qd" },
    actionsByStreet: {
      preflop: [
        { player: "Hero", type: "call", amount: 100 },
        { player: "Villain", type: "check" },
      ],
      flop: [
        { player: "Hero", type: "check" },
        { player: "Villain", type: "bet", amount: 220 },
        { player: "Hero", type: "call", amount: 220 },
      ],
      turn: [],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "call", amount: 100 }],
      flop: [
        { type: "check" },
        { type: "call", amount: 220 },
      ],
      turn: [],
      river: [],
    },
  };
  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "river",
        heroHand: ["Jh", "9h"],
        effectiveStackBB: 24,
        legalActions: ["call", "fold"],
        heroCanRaise: false,
        potSize: 1440,
        facingBet: 360,
        math: { spr: 1.4, callAmount: 360, finalPotIfCall: 1800 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "low", strategic_tags: [] },
          { street: "flop", pressure_level: "medium", strategic_tags: [] },
          { street: "turn", pressure_level: "low", strategic_tags: [] },
          { street: "river", pressure_level: "medium", strategic_tags: [] },
        ],
      },
    },
    { confidence: "medium", preflop_score: 0, flop_score: 0, turn_score: 0, river_score: 0 },
  );

  const flop = contexts.find((item) => item.street === "flop");
  assert.equal(flop?.action_taken?.action, "call");
  assert.equal(Boolean(flop?.facing_bet_after_check), true);
  assert.equal(flop?.hero_initial_action, "check");
  assert.equal(flop?.decision_node_type, "check_call_decision");
  assert.equal(Array.isArray(flop?.hero_decision_options), true);
  assert.equal(flop.hero_decision_options.includes("call"), true);
  assert.equal(flop.hero_decision_options.includes("fold"), true);
  assert.equal(flop.hero_decision_options.includes("check"), false);
});

test("street AI contexts include audit-to-coaching heuristic fields", () => {
  const hand = {
    heroName: "Hero",
    heroCards: ["Jh", "9h"],
    heroPosition: "BB",
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    heroOutcome: { resolvedStreet: "preflop", code: "folded_preflop" },
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "SB", type: "post_small_blind", amount: 50 },
        { player: "Hero", type: "post_big_blind", amount: 100 },
        { player: "BTN", type: "raise", amount: 250, toAmount: 300 },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "fold" }],
      flop: [],
      turn: [],
      river: [],
    },
  };
  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "preflop",
        heroHand: ["Jh", "9h"],
        effectiveStackBB: 24,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        potSize: 450,
        facingBet: 200,
        math: { spr: 6.2, callAmount: 200, finalPotIfCall: 650 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "medium", strategic_tags: [] },
        ],
        audit_alignment: {
          by_street: [
            {
              street: "preflop",
              chart_recommendation: "mixed_continue",
              chart_confidence: "medium",
              spot_classification: "bb_defend_vs_open",
              solver_mix_estimate: "mixed_continue",
              population_adjustment: null,
            },
          ],
        },
      },
    },
    { confidence: "medium", preflop_score: -1 },
  );
  const preflop = contexts.find((item) => item.street === "preflop");
  assert.equal(preflop?.audit_heuristics?.chart_recommendation, "mixed_continue");
  assert.equal(preflop?.audit_heuristics?.spot_classification, "bb_defend_vs_open");
});

test("flop c-bet context classifies weak unpaired betting lines as bluff_cbet intent", () => {
  const hand = {
    heroName: "Hero",
    heroCards: ["Qh", "Jd"],
    heroPosition: "BTN",
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0 },
    heroOutcome: { resolvedStreet: "flop", code: "won_without_showdown" },
    board: { flop: ["Kd", "7c", "2s"], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "Hero", type: "raise", amount: 250, toAmount: 250 },
        { player: "BB", type: "call", amount: 250 },
      ],
      flop: [
        { player: "BB", type: "check" },
        { player: "Hero", type: "bet", amount: 220 },
        { player: "BB", type: "fold" },
      ],
      turn: [],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "raise", amount: 250, toAmount: 250 }],
      flop: [{ type: "bet", amount: 220 }],
      turn: [],
      river: [],
    },
  };

  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "flop",
        heroHand: ["Qh", "Jd"],
        effectiveStackBB: 24,
        legalActions: ["check", "bet"],
        heroCanRaise: true,
        potSize: 620,
        facingBet: 0,
        math: { spr: 3.1, callAmount: 0, finalPotIfCall: 620 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "low", strategic_tags: [] },
          { street: "flop", pressure_level: "medium", strategic_tags: [] },
        ],
      },
    },
    { confidence: "medium", preflop_score: 0, flop_score: 0 },
  );
  const flop = contexts.find((item) => item.street === "flop");
  assert.equal(flop?.decision_node_type, "cbet_decision");
  assert.equal(flop?.classification?.made_hand_category, "air");
  assert.equal(flop?.semantic_action?.cbet_intent, "bluff_cbet");
  assert.equal(Array.isArray(flop?.semantic_action?.cbet_intent_focus), true);
});

test("stage 1 context compaction removes duplicate/low-signal payload while preserving decision signal", () => {
  const compact = compactStreetContextForPrompt({
    hand_id: "TM5937036811",
    street: "preflop",
    is_decision_street: true,
    hero_has_agency: true,
    all_players_committed: false,
    automatic_runout: false,
    stack_depth_bb: 16.72,
    legal_actions: ["call", "fold"],
    hero_position_state: "in_position",
    hero_initial_action: "raise",
    decision_node_type: "jam_call_decision",
    hero_decision_options: ["call", "fold"],
    action_time_state: {
      hero_position: "UTG+1",
      decision_type: "facing_open_decision",
      pot_state_when_hero_acted: {
        pot_before_action_bb: 20.97,
        current_bet_bb: 16.57,
        hero_committed_bb: 2,
        to_call_bb: 14.57,
      },
      prior_actions: [
        { player: "VillainA", action: "post_ante", sizing_bb: null },
        { player: "Hero", action: "raise", sizing_bb: 2 },
        { player: "VillainB", action: "jam", sizing_bb: 16.57 },
        { player: "VillainC", action: "fold", sizing_bb: null },
      ],
      facing_action: { player: "VillainB", action: "jam", sizing_bb: 16.57 },
    },
    action_taken: { action: "call", sizing: "0.0bb" },
    metrics: { pot_size_bb: 20.97, spr: 0.8, facing_size_bb: 14.57, pot_odds: "41%" },
    semantic_action: {
      action_type: "flat_call",
      all_in: false,
      facing_jam: true,
      facing_open: false,
      isolation_spot: false,
      multiway_all_in: false,
      effective_stack_bb: 16.72,
    },
    audit_heuristics: {
      street: "preflop",
      chart_recommendation: "open",
      chart_confidence: "medium",
      spot_classification: "first_in_open_spot",
      solver_mix_estimate: "mixed_open",
      population_adjustment: null,
    },
    deterministic: {
      pressure_level: "extreme",
      commitment_level: "low",
      spr_tier: "all_in",
      street_tags: ["high_pressure_node"],
      relevant_mistake_candidates: [
        {
          code: "stack_off_threshold",
          label: "Questionable stack-off threshold",
          reason: "Calling heavy preflop pressure likely over-committed stack depth.",
        },
      ],
      audit_heuristics: {
        street: "preflop",
        chart_recommendation: "open",
      },
    },
    classification: {
      made_hand_category: "air",
      made_hand_type: "king_high",
      pair_source: null,
      trips_type: "none",
      board_pairing: false,
      showdown_strength: "none",
      bluff_catcher: false,
    },
    seed_takeaway: "Long seed text that should not be included in compact context.",
  });

  assert.equal(compact?.decision?.decision_type, "facing_open_decision");
  assert.equal(Array.isArray(compact?.action_time?.history), true);
  assert.equal(
    compact.action_time.history.some((line) => /post_ante/i.test(String(line))),
    false,
  );
  assert.equal(
    compact.action_time.history.some((line) => /action back on hero/i.test(String(line))),
    true,
  );
  assert.equal(compact?.audit_heuristics?.chart_recommendation, "open");
  assert.equal(compact?.deterministic?.audit_heuristics, undefined);
  assert.equal(compact?.classification?.hand_strength, "king_high");
  assert.equal(compact?.classification?.showdown_value, undefined);
  assert.equal(compact?.classification?.pair_source, undefined);
  assert.equal(compact?.seed_takeaway, undefined);
});

test("stage 1 context compaction preserves postflop board cards for street awareness", () => {
  const compact = compactStreetContextForPrompt({
    hand_id: "TMX",
    street: "turn",
    board_cards: ["Ah", "Kd", "9s", "2c"],
    legal_actions: ["check", "bet"],
    action_taken: { action: "check", sizing: null },
    metrics: { pot_size_bb: 11.2, spr: 2.4, facing_size_bb: 0, pot_odds: null },
    semantic_action: { action_type: "check" },
    classification: {
      made_hand_type: "ace_high",
      showdown_strength: "weak",
      bluff_catcher: false,
    },
  });
  assert.deepEqual(compact?.board_cards, ["Ah", "Kd", "9s", "2c"]);
});

test("street context sizing prefers positive amount over zero toAmount for call/bet actions", () => {
  const hand = {
    heroName: "Hero",
    heroCards: ["As", "Qh"],
    heroPosition: "CO",
    heroStack: 4200,
    blinds: { smallBlind: 70, bigBlind: 140, ante: 20 },
    seats: [
      { seat: 1, player: "Hero", chips: 4200, position: "CO" },
      { seat: 2, player: "V1", chips: 5400, position: "BTN" },
      { seat: 3, player: "V2", chips: 6300, position: "BB" },
    ],
    board: { flop: ["6d", "2c", "2d"], turn: "Ac", river: "5s" },
    actionsByStreet: {
      preflop: [
        { player: "Hero", type: "raise", amount: 325, toAmount: 465 },
        { player: "V1", type: "call", amount: 325 },
      ],
      flop: [
        { player: "V1", type: "bet", amount: 537 },
        { player: "Hero", type: "call", amount: 537, toAmount: 0 },
      ],
      turn: [
        { player: "V1", type: "bet", amount: 518 },
        { player: "Hero", type: "raise", amount: 1868, toAmount: 2386 },
      ],
      river: [
        { player: "V1", type: "check" },
        { player: "Hero", type: "bet", amount: 2466, toAmount: 0 },
      ],
    },
    heroActionsByStreet: {
      preflop: [{ type: "raise", amount: 325, toAmount: 465 }],
      flop: [{ type: "call", amount: 537, toAmount: 0 }],
      turn: [{ type: "raise", amount: 1868, toAmount: 2386 }],
      river: [{ type: "bet", amount: 2466, toAmount: 0 }],
    },
  };

  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "river",
        heroHand: ["As", "Qh"],
        effectiveStackBB: 30,
        legalActions: ["bet", "check"],
        heroCanRaise: true,
        potSize: 7466,
        facingBet: 0,
        math: { spr: 2.52, callAmount: 0, finalPotIfCall: 7466 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "flop", pot_end_bb: 19.14, pressure_level: "medium", strategic_tags: [] },
          { street: "turn", pot_end_bb: 53.22, pressure_level: "medium", strategic_tags: [] },
          { street: "river", pot_end_bb: 53.22, pressure_level: "low", strategic_tags: [] },
        ],
      },
    },
    { confidence: "medium", flop_score: 0, turn_score: 0, river_score: 0 },
  );

  const flop = contexts.find((item) => item.street === "flop");
  const turn = contexts.find((item) => item.street === "turn");
  const river = contexts.find((item) => item.street === "river");
  assert.equal(flop?.action_taken?.sizing, "3.8bb");
  assert.equal(turn?.action_taken?.sizing, "17.0bb");
  assert.equal(river?.action_taken?.sizing, "17.6bb");

  const compactFlop = compactStreetContextForPrompt(flop || {});
  const compactRiver = compactStreetContextForPrompt(river || {});
  assert.equal(compactFlop?.action_taken?.sizing, "3.8bb");
  assert.equal(compactRiver?.action_taken?.sizing, "17.6bb");
});

test("street normalization aligns fold recommendation with chart-qualified continue spots", () => {
  const normalized = normalizeStreetReviewFromModel(
    {
      score: -2,
      preferred_action: { action: "fold", sizing: null },
      analysis: {
        insight: "Mandatory fold preflop with this holding.",
        range_context: "This is air and should always fold.",
        board_texture: "No board cards yet.",
        sizing_commentary: "Standard fold.",
        plan_commentary: "Must fold and wait for better.",
        takeaway: "Obvious fold preflop.",
      },
      confidence: "high",
      strategic_tags: [],
    },
    {
      street: "preflop",
      action_taken: { action: "call", sizing: "2.0bb" },
      deterministic: { street_tags: [] },
      metrics: {},
      legal_actions: ["call", "fold", "raise"],
      seed_confidence: "medium",
      audit_heuristics: {
        street: "preflop",
        chart_recommendation: "mixed_continue",
        chart_confidence: "medium",
        spot_classification: "bb_defend_vs_open",
        solver_mix_estimate: "mixed_continue",
        population_adjustment: null,
      },
    },
  );
  assert.equal(normalized.preferred_action.action, "call");
  assert.equal(normalized.score, 0);
  assert.equal(/mandatory fold|obvious fold|must fold|standard fold/i.test(normalized.analysis.takeaway), false);
  assert.equal(Array.isArray(normalized.strategic_tags), true);
  assert.equal(normalized.strategic_tags.includes("chart_aligned_continue"), true);
});

test("preflop action-time state freezes first-in fold context before later actions", () => {
  const hand = {
    heroName: "Hero",
    heroCards: ["3c", "3d"],
    heroPosition: "BTN",
    blinds: { smallBlind: 60, bigBlind: 120, ante: 18 },
    seats: [
      { seat: 1, player: "Hero", chips: 12000, position: "BTN" },
      { seat: 2, player: "SB", chips: 9000, position: "SB" },
      { seat: 3, player: "BB", chips: 10000, position: "BB" },
      { seat: 4, player: "UTG", chips: 8000, position: "UTG" },
    ],
    heroOutcome: { resolvedStreet: "preflop", code: "folded_preflop" },
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "UTG", type: "fold" },
        { player: "Hero", type: "fold" },
        { player: "SB", type: "raise", amount: 300, toAmount: 300 },
        { player: "BB", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "fold" }],
      flop: [],
      turn: [],
      river: [],
    },
  };
  const contexts = collectStreetAiContexts(
    {
      hand,
      validatedHandState: {
        street: "preflop",
        heroHand: ["3c", "3d"],
        effectiveStackBB: 100,
        legalActions: ["fold", "call", "raise"],
        heroCanRaise: true,
        potSize: 324,
        facingBet: 0,
        math: { spr: 12.5, callAmount: 0, finalPotIfCall: 324 },
      },
      deterministicIntelligence: {
        street_summaries: [
          { street: "preflop", pressure_level: "low", strategic_tags: [] },
        ],
      },
    },
    { confidence: "medium", preflop_score: -1 },
  );
  const preflop = contexts.find((item) => item.street === "preflop");
  assert.equal(preflop?.decision_type, "open_decision");
  assert.equal(Boolean(preflop?.first_in_opportunity), true);
  assert.equal(Boolean(preflop?.facing_open), false);
  assert.equal(Boolean(preflop?.facing_raise), false);
  assert.equal(preflop?.action_time_state?.facing_action, null);
  assert.equal(preflop?.action_time_state?.hero_action_index, 1);
});

test("street normalization removes facing-raise phrasing in open-decision nodes", () => {
  const normalized = normalizeStreetReviewFromModel(
    {
      score: -1,
      preferred_action: { action: "fold", sizing: null },
      analysis: {
        insight: "Hero folded facing a raise from the blinds.",
        range_context: "This fold versus a raise is prudent.",
        board_texture: "No board cards yet.",
        sizing_commentary: "Facing a raise, folding is fine.",
        plan_commentary: "After facing pressure, preserve stack.",
        takeaway: "Standard fold facing a raise.",
      },
      confidence: "medium",
      strategic_tags: [],
    },
    {
      street: "preflop",
      action_taken: { action: "fold", sizing: null },
      deterministic: { street_tags: [] },
      metrics: {},
      legal_actions: ["fold", "call", "raise"],
      action_time_state: {
        open_opportunity: true,
      },
      seed_confidence: "medium",
    },
  );
  const merged = [
    normalized.analysis.insight,
    normalized.analysis.range_context,
    normalized.analysis.sizing_commentary,
    normalized.analysis.plan_commentary,
    normalized.analysis.takeaway,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(/\bfacing (?:a )?(?:raise|open|3-?bet|jam)\b/.test(merged), false);
});

test("street normalization avoids negative score when preferred action matches taken action and sizing", () => {
  const aligned = areActionAndSizingAligned({
    actionTaken: { action: "raise", sizing: "2.1bb" },
    preferredAction: { action: "open_raise", sizing: "2.1bb" },
  });
  assert.equal(aligned, true);

  const normalized = normalizeStreetReviewFromModel(
    {
      score: -2,
      preferred_action: { action: "open_raise", sizing: "2.1bb" },
      analysis: {
        insight: "Open raise is standard.",
        range_context: "Reasonable UTG+1 open range.",
        board_texture: "No board cards yet.",
        sizing_commentary: "2.1bb is standard.",
        plan_commentary: "Proceed with initiative.",
        takeaway: "Open raise is fine.",
      },
      confidence: "medium",
      strategic_tags: [],
    },
    {
      street: "preflop",
      action_taken: { action: "raise", sizing: "2.1bb" },
      deterministic: { street_tags: [] },
      metrics: {},
      legal_actions: [],
      seed_confidence: "medium",
    },
  );

  assert.equal(normalized.score, 0);
});

test("preflop open qualification normalizes weak early-position first-in fold as disciplined", () => {
  const normalized = normalizeStreetReviewFromModel(
    {
      score: -2,
      preferred_action: { action: "raise", sizing: "2.2bb" },
      analysis: {
        insight: "Opening is generally preferred from this first-in spot.",
        range_context: "Avoid folding too frequently in first-in spots.",
        board_texture: "No board cards yet.",
        sizing_commentary: "Use a standard 2.2bb open.",
        plan_commentary: "Take the initiative with a wider opening range.",
        takeaway: "This fold is too tight and misses aggression.",
      },
      confidence: "high",
      strategic_tags: ["missed_aggression"],
    },
    {
      street: "preflop",
      action_taken: { action: "fold", sizing: null },
      deterministic: { street_tags: [] },
      metrics: {},
      legal_actions: ["fold", "call", "raise"],
      decision_type: "open_decision",
      first_in_opportunity: true,
      action_time_state: {
        decision_type: "open_decision",
        open_opportunity: true,
      },
      seed_confidence: "medium",
      audit_heuristics: {
        street: "preflop",
        chart_recommendation: "fold",
        chart_confidence: "high",
        spot_classification: "first_in_open_spot",
        solver_mix_estimate: "likely_fold",
        population_adjustment: null,
      },
      classification: {
        made_hand_category: "air",
        made_hand_type: "jack_high",
        showdown_strength: "none",
      },
    },
  );

  assert.equal(normalized.preferred_action.action, "fold");
  assert.equal(Number(normalized.score) >= 0, true);
  const merged = [
    normalized.analysis.insight,
    normalized.analysis.range_context,
    normalized.analysis.plan_commentary,
    normalized.analysis.takeaway,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(/opening is generally preferred|avoid folding too frequently|too tight|misses aggression/.test(merged), false);
  assert.equal(/disciplined|standard/.test(merged), true);
  assert.equal(String(normalized.confidence || "").toLowerCase(), "medium");
});

test("street normalization rewrites incoherent bluff c-bet value/protection language", () => {
  const normalized = normalizeStreetReviewFromModel(
    {
      score: 0,
      preferred_action: { action: "bet", sizing: "33%" },
      analysis: {
        insight: "This bet can fold out better hands and create value protection with queen-high.",
        range_context: "Bet for value with Q-high and pressure better hands.",
        board_texture: "K72 rainbow is semi-dynamic.",
        sizing_commentary: "Small c-bet extracts value from worse and folds better hands.",
        plan_commentary: "Use a protection bet here for value extraction.",
        takeaway: "This is mostly a value bet with protection upside.",
      },
      confidence: "medium",
      strategic_tags: [],
    },
    {
      street: "flop",
      action_taken: { action: "bet", sizing: "33%" },
      deterministic: { street_tags: [] },
      metrics: {},
      legal_actions: ["check", "bet"],
      seed_confidence: "medium",
      semantic_action: {
        action_type: "bet",
        cbet_intent: "bluff_cbet",
      },
      classification: {
        made_hand_category: "air",
        made_hand_type: "queen_high",
        showdown_strength: "weak",
      },
    },
  );
  const merged = [
    normalized.analysis.insight,
    normalized.analysis.range_context,
    normalized.analysis.sizing_commentary,
    normalized.analysis.plan_commentary,
    normalized.analysis.takeaway,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(/\bfold(?:ing)? out better hands?\b/.test(merged), false);
  assert.equal(/\bvalue[-\s]?protection\b/.test(merged), false);
  assert.equal(/\bextract value from worse\b/.test(merged), false);
  assert.equal(/\bprotection bet(?:ting)?\b/.test(merged), false);
  assert.equal(/\bweaker unpaired hands\b/.test(merged), true);
});

test("preflop semantic classifier identifies isolation jams and reshoves", () => {
  const isolationEvents = [
    { street: "preflop", index: 0, player: "UTG", type: "raise" },
    { street: "preflop", index: 1, player: "CO", type: "call" },
    { street: "preflop", index: 2, player: "Hero", type: "jam" },
  ];
  const isoHero = isolationEvents[2];
  const iso = classifyPreflopAction({
    heroEvent: isoHero,
    streetEvents: isolationEvents,
    heroName: "Hero",
    effectiveStackBb: 14,
  });
  assert.equal(iso.action_type, "isolation_jam");
  assert.equal(iso.all_in, true);
  assert.equal(iso.facing_open, true);
  assert.equal(detectIsolationSpot({ heroEvent: isoHero, streetEvents: isolationEvents, heroName: "Hero" }), true);

  const reshoveEvents = [
    { street: "preflop", index: 0, player: "UTG", type: "raise" },
    { street: "preflop", index: 1, player: "Hero", type: "jam" },
  ];
  const reshove = classifyPreflopAction({
    heroEvent: reshoveEvents[1],
    streetEvents: reshoveEvents,
    heroName: "Hero",
    effectiveStackBb: 12,
  });
  assert.equal(reshove.action_type, "reshove");
  assert.equal(reshove.facing_open, true);
});

test("street skip placeholders encode runout reasons for timeline compatibility", () => {
  const skipped = buildSkippedStreetReviewNode({
    street: "turn",
    automatic_runout: true,
    all_players_committed: true,
    hero_has_agency: false,
    hand_semantics: { all_in_before_flop: true },
    board_cards: ["Ah", "7d", "2c", "9s"],
    metrics: { pot_size_bb: 44.5, spr: 0, facing_size_bb: null, pot_odds: null },
    deterministic: { street_tags: ["high_pressure_node"] },
    action_taken: { action: "none", sizing: null },
  });
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.skipped_reason, "all_in_runout");
  assert.match(skipped.summary, /all-?in|runout/i);
});

test("commitment and agency helpers detect preflop-resolved hands", () => {
  const hand = {
    heroName: "Hero",
    seats: [
      { player: "Hero", chips: 1000 },
      { player: "V1", chips: 900 },
      { player: "V2", chips: 1100 },
    ],
    actionsByStreet: {
      preflop: [
        { player: "V1", type: "raise", amount: 200, toAmount: 300 },
        { player: "Hero", type: "jam", amount: 1000, toAmount: 1000 },
        { player: "V2", type: "jam", amount: 1100, toAmount: 1100 },
        { player: "V1", type: "call", amount: 700 },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroActionsByStreet: {
      preflop: [{ type: "jam", amount: 1000, toAmount: 1000 }],
      flop: [],
      turn: [],
      river: [],
    },
  };
  const jamTree = detectJamTree({ hand, heroName: "Hero" });
  assert.equal(jamTree.all_in_before_flop, true);
  const commitment = detectCommitmentState({ hand, heroName: "Hero" });
  const agency = detectStreetAgency({
    street: "flop",
    decisionStreet: "preflop",
    heroDecisionStreetSet: new Set(["preflop"]),
    commitmentState: commitment,
    jamTree,
  });
  assert.equal(agency.is_decision_street, false);
  assert.equal(agency.automatic_runout, true);
});

test("reddit_failure_fixture_001 is permanently guarded", () => {
  const fixture = redditFailureFixture001Hand();
  const { handState, validation } = buildValidatedHandState(fixture);
  assert.equal(validation.isValid, true, validation.issues.join(" | "));

  assert.deepEqual(handState.legalActions, ["call", "fold"]);
  assert.equal(handState.heroCanRaise, false);
  assert.equal(handState.isAllInFacingAction, true);

  assert.ok(
    handState.math &&
      Number.isFinite(Number(handState.math.callAmount)) &&
      Number.isFinite(Number(handState.math.finalPotIfCall)) &&
      typeof handState.math.potOddsRatio === "string" &&
      handState.math.potOddsRatio.trim().length > 0,
    "Fixture requires precomputed math fields.",
  );

  const handContext = {
    reviewContext: { heroFoldedStreet: "preflop" },
    validatedHandState: handState,
    handStateValidation: { isValid: true, issues: [] },
    payoutDataAvailable: false,
    solverSourceAvailable: false,
    villainRangeModelAvailable: false,
  };

  const problematic = sampleModelResponse({
    confidence: "high",
    preflop_score: -1,
    flop_score: null,
    turn_score: null,
    river_score: null,
    primary_leak:
      "Folding to this shove is too tight; fold equity and 8.95:1 pot odds make call mandatory.",
    better_line:
      "After the shove, rejam or 4-bet jam instead of folding.",
    reasoning:
      "You are getting 8.95:1, with fold equity and polarized range leverage; implied odds and board texture improve multiway realization.",
    what_was_good:
      "Hero opened BTN correctly, but board texture planning should account for multiway realization.",
  });

  const rawValidation = validatePostGenerationReview(problematic, handContext);
  assert.equal(rawValidation.valid, false);

  const warningFindings = rawValidation.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const guarded = applyReviewGuardrails(problematic, handContext, warningFindings);
  const guardedText = [
    guarded.review.primary_leak,
    guarded.review.better_line,
    guarded.review.reasoning,
    guarded.review.what_was_good,
  ]
    .join(" ")
    .toLowerCase();

  const mustNotContain = ["reshove", "rejam", "4-bet", "fold equity", "8.95:1"];
  for (const phrase of mustNotContain) {
    assert.equal(
      guardedText.includes(phrase.toLowerCase()),
      false,
      `Guarded text still contains banned phrase: ${phrase}`,
    );
  }

  const mustNotRecommend = ["raise", "jam", "shove"];
  for (const phrase of mustNotRecommend) {
    assert.equal(
      guardedText.includes(phrase.toLowerCase()),
      false,
      `Guarded text still recommends banned action: ${phrase}`,
    );
  }

  assert.equal(/\bflop\b/.test(guardedText), false);
  assert.equal(/\bturn\b/.test(guardedText), false);
  assert.equal(/\briver\b/.test(guardedText), false);
  assert.equal(/\bboard texture\b/.test(guardedText), false);
  assert.equal(/\bimplied odds\b/.test(guardedText), false);
  assert.equal(/\bmultiway\b/.test(guardedText), false);

  const confidenceRank = { low: 1, medium: 2, high: 3 };
  assert.ok(
    confidenceRank[String(guarded.review.confidence || "low")] <= confidenceRank.medium,
    `Confidence must be moderate or lower, got ${guarded.review.confidence}`,
  );

  const finalValidation = validatePostGenerationReview(guarded.review, handContext);
  assert.equal(finalValidation.summary.blockerCount, 0, finalValidation.errors.join(" | "));
});

function tm5958201117Hand() {
  return {
    heroName: "Hero",
    heroCards: ["Ah", "Js"],
    heroPosition: "CO",
    heroStack: 12450,
    blinds: { ante: 90, smallBlind: 300, bigBlind: 600 },
    seats: [
      { seat: 1, player: "SB1", chips: 9700, position: "SB" },
      { seat: 2, player: "BB1", chips: 13800, position: "BB" },
      { seat: 3, player: "Hero", chips: 12450, position: "CO" },
    ],
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "SB1", type: "post_ante", amount: 90 },
        { player: "BB1", type: "post_ante", amount: 90 },
        { player: "Hero", type: "post_ante", amount: 90 },
        { player: "SB1", type: "post_small_blind", amount: 300 },
        { player: "BB1", type: "post_big_blind", amount: 600 },
        { player: "Hero", type: "raise", amount: 1200, toAmount: 1800 },
        { player: "SB1", type: "fold" },
        { player: "BB1", type: "jam", amount: 12000, toAmount: 12000 },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroOutcome: { foldedStreet: "preflop", resolvedStreet: "preflop" },
  };
}

function weakFold650VsEpOpenHand() {
  return {
    heroName: "Hero",
    heroCards: ["6c", "5d"],
    heroPosition: "HJ",
    heroStack: 6000,
    blinds: { ante: 60, smallBlind: 300, bigBlind: 600 },
    seats: [
      { seat: 1, player: "UTG1", chips: 18000, position: "UTG" },
      { seat: 2, player: "Hero", chips: 6000, position: "HJ" },
      { seat: 3, player: "BTN1", chips: 12000, position: "BTN" },
      { seat: 4, player: "SB1", chips: 8500, position: "SB" },
      { seat: 5, player: "BB1", chips: 14000, position: "BB" },
    ],
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "UTG1", type: "post_ante", amount: 60 },
        { player: "Hero", type: "post_ante", amount: 60 },
        { player: "BTN1", type: "post_ante", amount: 60 },
        { player: "SB1", type: "post_ante", amount: 60 },
        { player: "BB1", type: "post_ante", amount: 60 },
        { player: "SB1", type: "post_small_blind", amount: 300 },
        { player: "BB1", type: "post_big_blind", amount: 600 },
        { player: "UTG1", type: "raise", amount: 600, toAmount: 1200 },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroOutcome: { foldedStreet: "preflop", resolvedStreet: "preflop" },
  };
}

function q7oHjFoldHand() {
  return {
    heroName: "Hero",
    heroCards: ["Qs", "7d"],
    heroPosition: "HJ",
    heroStack: 10200,
    blinds: { ante: 60, smallBlind: 300, bigBlind: 600 },
    seats: [
      { seat: 1, player: "UTG1", chips: 21000, position: "UTG" },
      { seat: 2, player: "Hero", chips: 10200, position: "HJ" },
      { seat: 3, player: "CO1", chips: 12900, position: "CO" },
      { seat: 4, player: "BTN1", chips: 11700, position: "BTN" },
      { seat: 5, player: "SB1", chips: 8900, position: "SB" },
      { seat: 6, player: "BB1", chips: 13800, position: "BB" },
    ],
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "UTG1", type: "post_ante", amount: 60 },
        { player: "Hero", type: "post_ante", amount: 60 },
        { player: "CO1", type: "post_ante", amount: 60 },
        { player: "BTN1", type: "post_ante", amount: 60 },
        { player: "SB1", type: "post_ante", amount: 60 },
        { player: "BB1", type: "post_ante", amount: 60 },
        { player: "SB1", type: "post_small_blind", amount: 300 },
        { player: "BB1", type: "post_big_blind", amount: 600 },
        { player: "UTG1", type: "raise", amount: 900, toAmount: 1500 },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroOutcome: { foldedStreet: "preflop", resolvedStreet: "preflop" },
  };
}

function trashJamMistakeHand() {
  return {
    heroName: "Hero",
    heroCards: ["6c", "5d"],
    heroPosition: "HJ",
    heroStack: 6000,
    blinds: { ante: 60, smallBlind: 300, bigBlind: 600 },
    seats: [
      { seat: 1, player: "UTG1", chips: 18000, position: "UTG" },
      { seat: 2, player: "Hero", chips: 6000, position: "HJ" },
      { seat: 3, player: "BTN1", chips: 12000, position: "BTN" },
      { seat: 4, player: "SB1", chips: 8500, position: "SB" },
      { seat: 5, player: "BB1", chips: 14000, position: "BB" },
    ],
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "UTG1", type: "post_ante", amount: 60 },
        { player: "Hero", type: "post_ante", amount: 60 },
        { player: "BTN1", type: "post_ante", amount: 60 },
        { player: "SB1", type: "post_ante", amount: 60 },
        { player: "BB1", type: "post_ante", amount: 60 },
        { player: "SB1", type: "post_small_blind", amount: 300 },
        { player: "BB1", type: "post_big_blind", amount: 600 },
        { player: "UTG1", type: "raise", amount: 600, toAmount: 1200 },
        { player: "Hero", type: "jam", amount: 5940, toAmount: 6000 },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    heroOutcome: { foldedStreet: null, resolvedStreet: "preflop" },
  };
}

test("tm5958201117 warning path uses partial recovery without full fallback", () => {
  const fixture = tm5958201117Hand();
  const { handState, validation } = buildValidatedHandState(fixture);
  assert.equal(validation.isValid, true, validation.issues.join(" | "));
  const handContext = {
    reviewContext: { heroFoldedStreet: "preflop" },
    validatedHandState: handState,
    handStateValidation: { isValid: true, issues: [] },
  };

  const modelReview = sampleModelResponse({
    confidence: "high",
    preflop_score: -1,
    flop_score: null,
    turn_score: null,
    river_score: null,
    primary_leak: "Fold timing was slightly tight versus this profile.",
    better_line:
      "Call or fold depending on your risk appetite, but apply pressure if table image is strong.",
    reasoning:
      "This is close; continue cautiously based on stack depth and pot odds assumptions.",
    what_was_good: "Opening this hand in late position was standard and disciplined.",
  });

  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.equal(findings.summary.blockerCount, 0);
  assert.ok(findings.summary.warningCount > 0);

  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
    recovered.review.what_was_good,
  ]
    .join(" ")
    .toLowerCase();

  assert.equal(
    /context-sensitive than usual|intentionally conservative|system|validation|deterministic|guardrails|checks failed/i.test(
      merged,
    ),
    false,
  );
  assert.equal(/\b(raise|jam|shove|rejam|4-bet)\b/.test(merged), false);
  assert.equal(recovered.review.confidence === "high", false);
  assert.ok(
    recovered.review.primary_leak.length > 0 &&
      recovered.review.better_line.length > 0 &&
      recovered.review.reasoning.length > 0,
    "Recovered review should preserve strategic coaching fields.",
  );
});

test("phase 3d fixture: 65o vs EP open fold is protected from negative scoring", () => {
  const fixture = weakFold650VsEpOpenHand();
  const { handState, validation } = buildValidatedHandState(fixture);
  assert.equal(validation.isValid, true, validation.issues.join(" | "));
  assert.equal(String(validation?.selectedHeroDecision?.type || ""), "fold");

  const handContext = {
    reviewContext: { heroFoldedStreet: "preflop" },
    validatedHandState: handState,
    handStateValidation: validation,
  };
  const classification = deriveHandClassification(handState);
  const decisionEval = decisionEvaluationForContext(handContext, classification);
  assert.equal(decisionEval.preflopFoldProtectionEligible, true);

  const modelReview = sampleModelResponse({
    overall_score: -2,
    preflop_score: -2,
    flop_score: null,
    turn_score: null,
    river_score: null,
    primary_leak: "This fold is slightly too tight versus the open.",
    better_line: "Consider calling or using a light 3-bet occasionally.",
    reasoning: "Postflop maneuverability allows mixed defenses here.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some((item) => item.type === "action_relative_scoring_mismatch"),
    `Expected action-relative scoring warning, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();

  assert.ok(Number(recovered.review.preflop_score) >= 0);
  assert.ok(Number(recovered.review.overall_score) >= 0);
  assert.equal(/\bslightly tight\b/.test(merged), false);
  assert.equal(/\bconsider calling\b/.test(merged), false);
  assert.equal(/\b3-?bet\b/.test(merged), false);
  assert.equal(/\bmaneuverability\b/.test(merged), false);
});

test("phase 3d fixture: Q7o HJ fold avoids speculative defend leakage", () => {
  const fixture = q7oHjFoldHand();
  const { handState, validation } = buildValidatedHandState(fixture);
  assert.equal(validation.isValid, true, validation.issues.join(" | "));
  assert.equal(String(validation?.selectedHeroDecision?.type || ""), "fold");

  const handContext = {
    reviewContext: { heroFoldedStreet: "preflop" },
    validatedHandState: handState,
    handStateValidation: validation,
  };
  const classification = deriveHandClassification(handState);
  const decisionEval = decisionEvaluationForContext(handContext, classification);
  assert.equal(decisionEval.preflopFoldProtectionEligible, true);
  assert.equal(decisionEval.under20bb, true);

  const modelReview = sampleModelResponse({
    overall_score: -1,
    preflop_score: -1,
    flop_score: null,
    turn_score: null,
    river_score: null,
    better_line: "Could consider a small 3-bet or call with maneuverability.",
    reasoning: "At this stack depth there is enough postflop maneuverability to defend wider.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some((item) => item.type === "preflop_fold_protection_language"),
    `Expected preflop fold protection warning, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();

  assert.ok(Number(recovered.review.preflop_score) >= 0);
  assert.ok(Number(recovered.review.overall_score) >= 0);
  assert.equal(/\b3-?bet\b/.test(merged), false);
  assert.equal(/\bconsider (?:calling|a call)\b/.test(merged), false);
  assert.equal(/\bmaneuverability\b/.test(merged), false);
});

test("phase 3d fixture: trash-hand preflop jam can still retain strong negative scoring", () => {
  const fixture = trashJamMistakeHand();
  const { handState, validation } = buildValidatedHandState(fixture);
  assert.equal(validation.isValid, true, validation.issues.join(" | "));
  assert.equal(String(validation?.selectedHeroDecision?.type || ""), "jam");

  const handContext = {
    reviewContext: { heroFoldedStreet: null },
    validatedHandState: handState,
    handStateValidation: validation,
  };
  const classification = deriveHandClassification(handState);
  const decisionEval = decisionEvaluationForContext(handContext, classification);
  assert.equal(decisionEval.preflopFoldProtectionEligible, false);
  assert.equal(decisionEval.actionAlignment, "major_error");

  const modelReview = sampleModelResponse({
    overall_score: -2,
    preflop_score: -2,
    flop_score: null,
    turn_score: null,
    river_score: null,
    better_line: "Folding would have been best against this open.",
    reasoning: "Jamming this trash offsuit holding into a strong opening range is too loose.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.equal(
    findings.findings.some((item) => item.type === "action_relative_scoring_mismatch"),
    false,
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  assert.ok(Number(recovered.review.preflop_score) <= -1);
  assert.ok(Number(recovered.review.overall_score) <= -1);
});

test("final presentation layer removes infrastructure language and softens tone", () => {
  const handContext = baseHandContext();
  const presented = finalizeCoachingPresentation(
    sampleModelResponse({
      confidence: "medium",
      primary_leak:
        "Line selection should stay within legal actions for this node. This is a significant leak.",
      better_line:
        "Concept-heavy language was reduced because required supporting data is not validated in this hand.",
      what_was_good:
        "The review correctly preserved decision focus under a constrained action set.",
      reasoning:
        "Deterministic checks failed in this schema validator path, so this was wrong and bad.",
    }),
    handContext,
  );
  const merged = [
    presented.primary_leak,
    presented.better_line,
    presented.what_was_good,
    presented.reasoning,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(
    /\b(validation|node|constrained action set|deterministic|schema|validator|recovery|unsupported concept|legal action set|checks failed)\b/.test(
      merged,
    ),
    false,
  );
  assert.equal(/\b(wrong|bad|significant leak)\b/.test(merged), false);
});

test("opponent confidence tiers enforce cautious language on small samples", () => {
  assert.equal(opponentConfidenceTier(10), "low");
  assert.equal(opponentConfidenceTier(35), "moderate");
  assert.equal(opponentConfidenceTier(120), "high");

  const lowNarrative = buildOpponentConfidenceNarrative({
    handsSeen: 12,
    playNote: { text: "Overfolding preflop." },
    tags: ["nit_preflop"],
  }).toLowerCase();
  const moderateNarrative = buildOpponentConfidenceNarrative({
    handsSeen: 40,
    playNote: { text: "Has folded frequently preflop." },
  }).toLowerCase();
  const highNarrative = buildOpponentConfidenceNarrative({
    handsSeen: 120,
    playNote: { text: "Folded to raises at a very high rate over a large sample." },
  }).toLowerCase();

  assert.match(lowNarrative, /limited observations|early tendencies/);
  assert.match(moderateNarrative, /moderate-sample read|premature/);
  assert.match(highNarrative, /high-confidence read/);
});

test("short-stack coaching constraints rewrite deep-stack concepts", () => {
  const base = baseHandContext();
  const handContext = {
    ...base,
    validatedHandState: {
      ...base.validatedHandState,
      effectiveStackBB: 8,
      heroCanRaise: true,
      legalActions: ["call", "fold", "raise"],
    },
  };
  const modelReview = sampleModelResponse({
    primary_leak:
      "You missed postflop maneuverability by not choosing a small 3-bet line.",
    better_line: "Take a thin exploit flat to preserve speculative realization.",
    reasoning:
      "A small 3-bet and speculative flat improve postflop maneuverability at this depth.",
  });

  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.type === "stack_depth_incoherence" &&
        item.severity === VALIDATION_SEVERITY.WARNING,
    ),
    `Expected stack_depth_incoherence warning, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );

  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
    recovered.review.what_was_good,
  ]
    .join(" ")
    .toLowerCase();

  assert.equal(/\bpostflop maneuverability\b/.test(merged), false);
  assert.equal(/\bsmall\s*3-?bet/.test(merged), false);
  assert.equal(/\bthin exploit flat/.test(merged), false);
  assert.equal(/\bspeculative realization\b/.test(merged), false);
  assert.match(
    merged,
    /under 10bb|short-stack decisions|direct equity realization|tournament-life pressure/,
  );
});

test("deep-stack coaching constraints rewrite pure shove-fold framing", () => {
  const base = baseHandContext();
  const handContext = {
    ...base,
    validatedHandState: {
      ...base.validatedHandState,
      effectiveStackBB: 32,
      heroCanRaise: true,
      legalActions: ["call", "fold", "raise"],
    },
  };
  const modelReview = sampleModelResponse({
    better_line: "This is a pure shove/fold node, so jam or fold only.",
    reasoning:
      "There is no postflop maneuverability here; strict shove/fold is mandatory.",
  });

  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.type === "stack_depth_incoherence" &&
        item.severity === VALIDATION_SEVERITY.WARNING,
    ),
    `Expected stack_depth_incoherence warning, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );

  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();

  assert.equal(/\bpure shove\/?fold\b/.test(merged), false);
  assert.equal(/\bstrict shove\/?fold\b/.test(merged), false);
  assert.match(
    merged,
    /20bb\+|postflop realization|maneuverability|deeper stacks/,
  );
});

test("strategic precision: trips terminology is corrected from top-pair language", () => {
  const base = baseHandContext();
  const handContext = {
    ...base,
    validatedHandState: {
      ...base.validatedHandState,
      street: "river",
      heroHand: ["Jh", "Td"],
      boardCards: ["Jc", "Js", "4d", "8h", "2c"],
      effectiveStackBB: 28,
      facingBet: 0,
      legalActions: ["check", "bet"],
      heroCanRaise: true,
    },
  };
  const modelReview = sampleModelResponse({
    primary_leak: "Top pair is too weak to continue for value.",
    better_line: "With top pair second kicker, choose a small value check.",
    reasoning: "This one-pair hand should avoid pressure.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.type === "terminology_mismatch" &&
        item.severity === VALIDATION_SEVERITY.WARNING,
    ),
    `Expected terminology mismatch warning, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const recoveredValidation = validatePostGenerationReview(recovered.review, handContext);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(recoveredValidation.summary.blockerCount, 0);
  assert.equal(/\b(top pair|single pair|one pair)\b/.test(merged), false);
  assert.match(merged, /\btrip|set|three-of-a-kind\b/);
});

test("strategic precision: bluff-catcher misuse is rewritten when classification disallows it", () => {
  const base = baseHandContext();
  const handContext = {
    ...base,
    validatedHandState: {
      ...base.validatedHandState,
      street: "river",
      heroHand: ["Ah", "Kh"],
      boardCards: ["Qh", "7h", "2h", "9c", "4d"],
      effectiveStackBB: 24,
      facingBet: 1200,
      legalActions: ["call", "fold", "raise"],
      heroCanRaise: true,
    },
  };
  const modelReview = sampleModelResponse({
    primary_leak: "You turned your hand into a bluff catcher too early.",
    better_line: "Use this bluff catcher to call wider.",
    reasoning: "As a bluff-catching candidate, this hand should mostly call.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.severity === VALIDATION_SEVERITY.WARNING &&
        (item.type === "terminology_mismatch" ||
          item.type === "bluff_catcher_contradiction"),
    ),
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const recoveredValidation = validatePostGenerationReview(recovered.review, handContext);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(recoveredValidation.summary.blockerCount, 0);
  assert.equal(/\bbluff[ -]?catch(?:er|ing)\b/.test(merged), false);
  assert.match(merged, /\bdeterministic classification|validated hand category\b/);
});

test("strategic contradiction: none showdown value plus passive river check is rewritten", () => {
  const base = baseHandContext();
  const handContext = {
    ...base,
    validatedHandState: {
      ...base.validatedHandState,
      street: "river",
      heroHand: ["8c", "5d"],
      boardCards: ["Kh", "Qd", "9s", "3c", "2d"],
      effectiveStackBB: 22,
      facingBet: 1400,
      legalActions: ["call", "fold", "raise"],
      heroCanRaise: true,
    },
  };
  const modelReview = sampleModelResponse({
    better_line: "Check back river and accept the result.",
    reasoning:
      "With minimal showdown value, checking the river is prudent.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.type === "showdown_contradiction" &&
        item.severity === VALIDATION_SEVERITY.WARNING,
    ),
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const recoveredValidation = validatePostGenerationReview(recovered.review, handContext);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
    recovered.review.what_was_good,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(recoveredValidation.summary.blockerCount, 0);
  assert.equal(/\b(check(?:ing)?(?: back)?(?: the)? river|river check)\b/.test(merged), false);
  assert.equal(/context-sensitive than usual|intentionally conservative/.test(merged), false);
});

test("strategic contradiction: paired-board overstatement language is rewritten", () => {
  const base = baseHandContext();
  const handContext = {
    ...base,
    validatedHandState: {
      ...base.validatedHandState,
      street: "river",
      heroHand: ["Ah", "Kd"],
      boardCards: ["Qc", "Qd", "7s", "2h", "3c"],
      effectiveStackBB: 26,
      facingBet: 900,
      legalActions: ["call", "fold", "raise"],
      heroCanRaise: true,
    },
  };
  const modelReview = sampleModelResponse({
    reasoning:
      "This paired board gives us strong nut advantage and uncapped value pressure.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.type === "paired_board_overstatement" &&
        item.severity === VALIDATION_SEVERITY.WARNING,
    ),
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const recoveredValidation = validatePostGenerationReview(recovered.review, handContext);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(recoveredValidation.summary.blockerCount, 0);
  assert.equal(/\buncapped value pressure\b/.test(merged), false);
  assert.equal(/\bstrong nut advantage\b/.test(merged), false);
  assert.match(merged, /\bpaired boards|structure-aware|value distribution\b/);
});

test("board-relative fixture: J9 on QQ532 is not top-pair or bluff-catcher", () => {
  const handState = {
    street: "river",
    heroHand: ["Jc", "9h"],
    boardCards: ["Qh", "Qd", "5s", "3s", "2h"],
    effectiveStackBB: 26,
    facingBet: 1400,
    legalActions: ["call", "fold", "raise"],
    heroCanRaise: true,
    math: { callAmount: 1400, finalPotIfCall: 6200, potOddsRatio: "3.43:1", spr: 1.9 },
  };
  const classification = deriveHandClassification(handState);
  assert.equal(classification.boardMadeHand, "pair");
  assert.equal(classification.heroImprovesBoard, false);
  assert.equal(classification.effectiveHandCategory, "air");
  assert.equal(classification.madeHandType, "jack_high");
  assert.equal(classification.pairSource, null);
  assert.equal(classification.boardPairing, true);
  assert.equal(classification.showdownStrength, "none");
  assert.equal(classification.showdownStrengthTier, "none_showdown");
  assert.equal(classification.kickerStrength, "weak");
  assert.equal(classification.showdownRelevance, "none");
  assert.equal(classification.boardPairKickerClass, "weak_kicker");
  assert.equal(classification.bluffCatcher, false);

  const handContext = {
    reviewContext: { heroFoldedStreet: null },
    validatedHandState: handState,
    handStateValidation: { isValid: true, issues: [] },
    handClassification: classification,
  };
  const modelReview = sampleModelResponse({
    primary_leak: "You folded top pair too often in this node.",
    better_line: "This is a medium-strength pair, so check-call as a bluff catcher.",
    reasoning: "Induce bluffs and bluff-catch river with your showdown hand.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some((item) => item.type === "terminology_mismatch"),
    `Expected terminology warnings, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );
  assert.ok(
    findings.findings.some((item) => item.type === "false_showdown_line"),
    `Expected false_showdown_line warning, got ${findings.findings
      .map((item) => `${item.type}:${item.severity}`)
      .join(" | ")}`,
  );
  const warningFindings = findings.findings.filter(
    (item) => item.severity === VALIDATION_SEVERITY.WARNING,
  );
  const recovered = applyReviewGuardrails(modelReview, handContext, warningFindings);
  const recoveredValidation = validatePostGenerationReview(recovered.review, handContext);
  const merged = [
    recovered.review.primary_leak,
    recovered.review.better_line,
    recovered.review.reasoning,
  ]
    .join(" ")
    .toLowerCase();
  assert.equal(recoveredValidation.summary.blockerCount, 0);
  assert.equal(/\btop pair\b/.test(merged), false);
  assert.equal(/\bbluff[ -]?catch(?:er|ing)\b/.test(merged), false);
  assert.equal(/\bcheck[-\s]?call\b/.test(merged), false);
});

test("board-relative fixture: AQ on QQ532 is strong showdown and improved board", () => {
  const handState = {
    street: "river",
    heroHand: ["As", "Qh"],
    boardCards: ["Qc", "Qd", "5s", "3s", "2h"],
    effectiveStackBB: 31,
    facingBet: 1200,
    legalActions: ["call", "fold", "raise"],
    heroCanRaise: true,
    math: { callAmount: 1200, finalPotIfCall: 5600, potOddsRatio: "3.67:1", spr: 2.4 },
  };
  const classification = deriveHandClassification(handState);
  assert.equal(classification.boardMadeHand, "pair");
  assert.equal(classification.heroImprovesBoard, true);
  assert.equal(classification.effectiveHandCategory, "trips");
  assert.equal(classification.kickerStrength, "strong");
  assert.equal(classification.showdownRelevance, "meaningful");
  assert.equal(classification.boardPairKickerClass, "strong_kicker");
  assert.equal(classification.showdownStrength, "strong");
});

test("paired-board made-hand classification: TT9 distinguishes king-high, trips, and full house correctly", () => {
  const scenarios = [
    {
      id: "kj_king_high",
      handState: {
        street: "flop",
        heroHand: ["Ks", "Jc"],
        boardCards: ["Ts", "Td", "9s"],
      },
      expected: {
        madeHandCategory: "air",
        madeHandType: "king_high",
        pairSource: null,
        boardPairing: true,
        showdownStrengthTier: "weak_showdown",
      },
    },
    {
      id: "at_trips",
      handState: {
        street: "flop",
        heroHand: ["As", "Th"],
        boardCards: ["Ts", "Td", "9s"],
      },
      expected: {
        madeHandCategory: "trips",
        madeHandType: "trips",
        boardPairing: true,
      },
    },
    {
      id: "99_full_house",
      handState: {
        street: "flop",
        heroHand: ["9c", "9d"],
        boardCards: ["Ts", "Td", "9s"],
      },
      expected: {
        madeHandCategory: "full_house",
        madeHandType: "full_house",
        boardPairing: true,
      },
    },
    {
      id: "kt_trips",
      handState: {
        street: "flop",
        heroHand: ["Kh", "Tc"],
        boardCards: ["Ts", "Td", "9s"],
      },
      expected: {
        madeHandCategory: "trips",
        madeHandType: "trips",
        boardPairing: true,
      },
    },
  ];

  for (const scenario of scenarios) {
    const classification = deriveHandClassification(scenario.handState);
    assert.equal(
      classification.madeHandCategory,
      scenario.expected.madeHandCategory,
      scenario.id,
    );
    assert.equal(classification.madeHandType, scenario.expected.madeHandType, scenario.id);
    if ("pairSource" in scenario.expected) {
      assert.equal(classification.pairSource, scenario.expected.pairSource, scenario.id);
    }
    assert.equal(classification.boardPairing, scenario.expected.boardPairing, scenario.id);
    if (scenario.expected.showdownStrengthTier) {
      assert.equal(
        classification.showdownStrengthTier,
        scenario.expected.showdownStrengthTier,
        scenario.id,
      );
    }
  }
});

test("board-relative fixture: KJ on QQ532 remains king-high with marginal showdown value", () => {
  const handState = {
    street: "river",
    heroHand: ["Kh", "Jd"],
    boardCards: ["Qc", "Qd", "5s", "3s", "2h"],
    effectiveStackBB: 24,
    facingBet: 1000,
    legalActions: ["call", "fold", "raise"],
    heroCanRaise: true,
    math: { callAmount: 1000, finalPotIfCall: 5100, potOddsRatio: "4.10:1", spr: 1.7 },
  };
  const classification = deriveHandClassification(handState);
  assert.equal(classification.boardMadeHand, "pair");
  assert.equal(classification.heroImprovesBoard, false);
  assert.equal(classification.heroContributionLevel, "none");
  assert.equal(classification.madeHandType, "king_high");
  assert.equal(classification.pairSource, null);
  assert.equal(classification.boardPairing, true);
  assert.equal(classification.kickerStrength, "medium");
  assert.equal(classification.showdownRelevance, "marginal");
  assert.equal(classification.boardPairKickerClass, "strong_kicker");
  assert.equal(classification.showdownStrength, "weak");
  assert.equal(classification.showdownStrengthTier, "weak_showdown");
  assert.equal(classification.bluffCatcher, false);
});

test("board-only full-house fixture does not overstate hero improvement", () => {
  const handState = {
    street: "river",
    heroHand: ["Ac", "Jd"],
    boardCards: ["Kh", "Kd", "Kc", "7s", "7h"],
    effectiveStackBB: 20,
    facingBet: 900,
    legalActions: ["call", "fold"],
    heroCanRaise: false,
    math: { callAmount: 900, finalPotIfCall: 4900, potOddsRatio: "4.44:1", spr: 1.2 },
  };
  const classification = deriveHandClassification(handState);
  assert.equal(classification.boardMadeHand, "full_house");
  assert.equal(classification.heroImprovesBoard, false);
  assert.equal(
    classification.heroContributionLevel === "none" ||
      classification.heroContributionLevel === "weak",
    true,
  );
  assert.equal(classification.effectiveHandCategory, "full_house");

  const handContext = {
    reviewContext: { heroFoldedStreet: null },
    validatedHandState: handState,
    handStateValidation: { isValid: true, issues: [] },
    handClassification: classification,
  };
  const modelReview = sampleModelResponse({
    reasoning:
      "Hero has strong nut advantage and uncapped value pressure because of hole-card improvement.",
  });
  const findings = validatePostGenerationReview(modelReview, handContext);
  assert.ok(
    findings.findings.some(
      (item) =>
        item.type === "paired_board_overstatement" &&
        item.severity === VALIDATION_SEVERITY.WARNING,
    ),
  );
});

test("phase 3b humanizer removes internal evaluator terminology across key paired-board fixtures", () => {
  const scenarios = [
    {
      handState: {
        street: "river",
        heroHand: ["Jc", "9h"],
        boardCards: ["Qh", "Qd", "5s", "3s", "2h"],
        effectiveStackBB: 26,
        facingBet: 1200,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 1200, finalPotIfCall: 5400, potOddsRatio: "3.50:1", spr: 1.7 },
      },
      review: sampleModelResponse({
        primary_leak:
          "The board-relative strength classification is weak and hero does not materially improve the paired board.",
        better_line:
          "This is mostly a board-pair-plus-kicker spot per effectiveHandCategory.",
        reasoning:
          "showdownRelevance is low and showdown expectations should stay conservative.",
      }),
    },
    {
      handState: {
        street: "river",
        heroHand: ["Kh", "Jd"],
        boardCards: ["Qh", "Qd", "5s", "3s", "2h"],
        effectiveStackBB: 24,
        facingBet: 1000,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 1000, finalPotIfCall: 5000, potOddsRatio: "4.00:1", spr: 1.6 },
      },
      review: sampleModelResponse({
        primary_leak:
          "heroContributionLevel indicates weak board-relative strength in this board-pair-plus-kicker node.",
        better_line:
          "hero does not materially improve the paired board so showdownRelevance is marginal.",
        reasoning:
          "effectiveHandCategory and heroContribution should drive passive bluff-catching.",
      }),
    },
    {
      handState: {
        street: "river",
        heroHand: ["As", "Qh"],
        boardCards: ["Qc", "Qd", "5s", "3s", "2h"],
        effectiveStackBB: 30,
        facingBet: 1100,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 1100, finalPotIfCall: 5600, potOddsRatio: "4.09:1", spr: 2.1 },
      },
      review: sampleModelResponse({
        primary_leak:
          "effectiveHandCategory is strong but board-relative language should remain conservative.",
        better_line:
          "showdownRelevance suggests a measured line despite heroContributionLevel being high.",
        reasoning:
          "Avoid leaking evaluator terms like board-pair-plus-kicker to users.",
      }),
    },
    {
      handState: {
        street: "river",
        heroHand: ["Ah", "Kd"],
        boardCards: ["Qc", "Qd", "7s", "2h", "3c"],
        effectiveStackBB: 22,
        facingBet: 900,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 900, finalPotIfCall: 4700, potOddsRatio: "4.22:1", spr: 1.5 },
      },
      review: sampleModelResponse({
        primary_leak:
          "hero does not materially improve board-relative strength and should avoid overplaying.",
        better_line:
          "This board-pair-plus-kicker pattern needs conservative showdownRelevance assumptions.",
        reasoning:
          "heroContribution and effectiveHandCategory should stay internal.",
      }),
    },
  ];

  for (const scenario of scenarios) {
    const classification = deriveHandClassification(scenario.handState);
    const handContext = {
      reviewContext: { heroFoldedStreet: null },
      validatedHandState: scenario.handState,
      handStateValidation: { isValid: true, issues: [] },
      handClassification: classification,
    };
    const presented = finalizeCoachingPresentation(scenario.review, handContext);
    const merged = [
      presented.primary_leak,
      presented.better_line,
      presented.reasoning,
      presented.what_was_good,
    ]
      .join(" ")
      .toLowerCase();

    assert.equal(/\bboard-relative\b/.test(merged), false);
    assert.equal(/\bshowdownrelevance\b/.test(merged), false);
    assert.equal(/\beffectivehandcategory\b/.test(merged), false);
    assert.equal(/\bboard-pair-plus-kicker\b/.test(merged), false);
    assert.equal(/\bherocontributionlevel\b/.test(merged), false);
    assert.equal(/\bmaterially improve board\b/.test(merged), false);
    assert.equal(/\bhero does not materially improve the paired board\b/.test(merged), false);

    assert.equal(
      /\bpaired board|paired river|showdown value|unlikely to win often at showdown|practical line\b/.test(
        merged,
      ),
      true,
      `Expected human coaching language, got: ${merged}`,
    );
  }
});

test("phase 3c narration differentiates paired-board kicker tiers (J9 vs KJ vs AQ on QQ532)", () => {
  const baseReview = sampleModelResponse({
    primary_leak:
      "This is a weak hand with limited showdown value, so conservative play is preferred.",
    better_line:
      "Use a cautious practical line because this weak hand is unlikely to win often at showdown.",
    reasoning:
      "Keep the line conservative with limited showdown value and avoid thin edges.",
    what_was_good: "You stayed disciplined in a close spot.",
  });
  const scenarios = [
    {
      id: "j9_none",
      handState: {
        street: "river",
        heroHand: ["Jc", "9h"],
        boardCards: ["Qh", "Qd", "5s", "3s", "2h"],
        effectiveStackBB: 26,
        facingBet: 1200,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 1200, finalPotIfCall: 5400, potOddsRatio: "3.50:1", spr: 1.7 },
      },
      mustInclude: /\bvery little showdown value|unlikely to win often at showdown|bluff-or-give-up\b/i,
      mustNotInclude: /\bbluff[ -]?catch(?:er|ing)\b/i,
    },
    {
      id: "kj_marginal",
      handState: {
        street: "river",
        heroHand: ["Kh", "Jd"],
        boardCards: ["Qh", "Qd", "5s", "3s", "2h"],
        effectiveStackBB: 24,
        facingBet: 1000,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 1000, finalPotIfCall: 5000, potOddsRatio: "4.00:1", spr: 1.6 },
      },
      mustInclude: /\boccasionally win at showdown|some showdown value remains|marginal showdown value\b/i,
    },
    {
      id: "aq_meaningful",
      handState: {
        street: "river",
        heroHand: ["As", "Qh"],
        boardCards: ["Qc", "Qd", "5s", "3s", "2h"],
        effectiveStackBB: 30,
        facingBet: 1100,
        legalActions: ["call", "fold", "raise"],
        heroCanRaise: true,
        math: { callAmount: 1100, finalPotIfCall: 5600, potOddsRatio: "4.09:1", spr: 2.1 },
      },
      mustInclude: /\bmeaningful showdown value|strong showdown hand|wins often at showdown\b/i,
    },
  ];

  const outputs = new Map();
  for (const scenario of scenarios) {
    const classification = deriveHandClassification(scenario.handState);
    const handContext = {
      reviewContext: { heroFoldedStreet: null },
      validatedHandState: scenario.handState,
      handStateValidation: { isValid: true, issues: [] },
      handClassification: classification,
    };
    const presented = finalizeCoachingPresentation(baseReview, handContext);
    const merged = [
      presented.primary_leak,
      presented.better_line,
      presented.reasoning,
      presented.what_was_good,
    ]
      .join(" ")
      .toLowerCase();

    assert.match(
      merged,
      scenario.mustInclude,
      `Expected differentiated narration for ${scenario.id}, got: ${merged}`,
    );
    if (scenario.mustNotInclude) {
      assert.equal(scenario.mustNotInclude.test(merged), false);
    }
    outputs.set(scenario.id, merged);
  }

  assert.notEqual(
    outputs.get("j9_none"),
    outputs.get("kj_marginal"),
    "J9 and KJ narration should not collapse into identical wording.",
  );
});
