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
  opponentConfidenceTier,
  buildOpponentConfidenceNarrative,
  deriveHandClassification,
  decisionEvaluationForContext,
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
  assert.equal(
    /validation|system|deterministic|checks failed|guardrails/i.test(
      `${review.primary_leak} ${review.reasoning} ${review.better_line}`,
    ),
    false,
  );
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
      heroHand: ["Ac", "5d"],
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
  assert.equal(classification.effectiveHandCategory, "board_pair_j_high");
  assert.equal(classification.showdownStrength === "none" || classification.showdownStrength === "weak", true);
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

test("board-relative fixture: KJ on QQ532 allows weak bluff-catcher framing", () => {
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
  assert.equal(classification.heroContributionLevel, "weak");
  assert.equal(classification.kickerStrength, "medium");
  assert.equal(classification.showdownRelevance, "marginal");
  assert.equal(classification.boardPairKickerClass, "strong_kicker");
  assert.equal(classification.showdownStrength, "weak");
  assert.equal(classification.bluffCatcher, true);
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
