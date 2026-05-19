import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeterministicIntelligence,
  createEmptyDeterministicIntelligence,
} from "../src/deterministicIntelligenceService.js";

function sampleHand() {
  return {
    heroName: "Hero",
    heroPosition: "BB",
    heroStack: 3000,
    blinds: { bigBlind: 100, smallBlind: 50, ante: 10 },
    hadShowdown: false,
    heroResult: { wonAmount: 0 },
    heroOutcome: { code: "not_won_no_showdown_river" },
    board: { flop: ["Ah", "7d", "2c"], turn: "9s", river: "Kd" },
    actionsByStreet: {
      preflop: [
        { player: "Villain", type: "post_small_blind", amount: 50 },
        { player: "Hero", type: "post_big_blind", amount: 100 },
        { player: "Villain", type: "raise", amount: 200, toAmount: 300 },
        { player: "Hero", type: "call", amount: 200 },
      ],
      flop: [
        { player: "Villain", type: "check" },
        { player: "Hero", type: "bet", amount: 125 },
        { player: "Villain", type: "call", amount: 125 },
      ],
      turn: [
        { player: "Villain", type: "bet", amount: 700 },
        { player: "Hero", type: "call", amount: 700 },
      ],
      river: [
        { player: "Villain", type: "jam", amount: 1675, toAmount: 1675 },
        { player: "Hero", type: "fold" },
      ],
    },
  };
}

test("createEmptyDeterministicIntelligence returns stable replay scaffolding", () => {
  const empty = createEmptyDeterministicIntelligence();
  assert.equal(Array.isArray(empty.street_summaries), true);
  assert.equal(empty.street_summaries.length, 4);
  assert.equal(Array.isArray(empty.replay_annotations), true);
  assert.equal(empty.replay_annotations.length, 4);
});

test("buildDeterministicIntelligence generates hand and street metadata", () => {
  const intelligence = buildDeterministicIntelligence({
    hand: sampleHand(),
    validatedHandState: {
      street: "river",
      effectiveStackBB: 20,
      heroCanRaise: false,
      legalActions: ["call", "fold"],
      math: { spr: 0.9, callAmount: 1675, finalPotIfCall: 5050 },
    },
    handStateValidation: { isValid: true, issues: [] },
  });
  assert.equal(Array.isArray(intelligence.hand_headline_candidates), true);
  assert.equal(Array.isArray(intelligence.street_summaries), true);
  assert.equal(intelligence.street_summaries.length, 4);
  assert.equal(Array.isArray(intelligence.mistake_candidates), true);
  assert.equal(Array.isArray(intelligence.strategic_tags), true);
  assert.equal(Array.isArray(intelligence.audit_alignment?.by_street), true);
  assert.equal(
    ["defend", "likely_continue", "mixed_continue", "fold", "open"].includes(
      String(intelligence.audit_alignment?.by_street?.[0]?.chart_recommendation || ""),
    ),
    true,
  );
  assert.ok(
    intelligence.strategic_tags.includes("Pressure Leak") ||
      intelligence.strategic_tags.includes("Overfold River"),
  );
});

test("first-in weak offsuit from early position is chart-aligned as fold", () => {
  const hand = {
    heroName: "Hero",
    heroPosition: "UTG+1",
    heroCards: ["Jc", "5d"],
    heroStack: 5200,
    blinds: { bigBlind: 100, smallBlind: 50, ante: 10 },
    hadShowdown: false,
    heroResult: { wonAmount: 0 },
    heroOutcome: { code: "folded_preflop" },
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "UTG", type: "fold" },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
  };
  const intelligence = buildDeterministicIntelligence({
    hand,
    validatedHandState: {
      street: "preflop",
      effectiveStackBB: 52,
      legalActions: ["fold", "call", "raise"],
      heroCanRaise: true,
      potSize: 160,
      facingBet: 0,
      math: { spr: 10, callAmount: 0, finalPotIfCall: 160 },
    },
    handStateValidation: { isValid: true, issues: [] },
  });
  const pre = Array.isArray(intelligence?.audit_alignment?.by_street)
    ? intelligence.audit_alignment.by_street.find((row) => row?.street === "preflop")
    : null;
  assert.equal(pre?.spot_classification, "first_in_open_spot");
  assert.equal(pre?.chart_recommendation, "fold");
  assert.equal(pre?.solver_mix_estimate, "likely_fold");
});
