import assert from "node:assert/strict";
import test from "node:test";

import {
  clearStreetCoachHistoryFrom,
  createStreetCoachSnapshot,
  rememberStreetCoach,
} from "../src/lib/streetCoachHistory.js";

test("keeps only the latest successful coach message for each street", () => {
  const preflop = rememberStreetCoach({}, "preflop", {
    hero_action: "open",
    sizing: "2.2 BB",
    reasoning: "The button can open this combo profitably.",
  }, { recordedAt: 1 });
  const withFlop = rememberStreetCoach(preflop, "flop", {
    hero_action: "bet",
    sizing: "33% pot",
    reasoning: "Range advantage supports a small continuation bet.",
  }, { recordedAt: 2 });
  const updatedFlop = rememberStreetCoach(withFlop, "flop", {
    hero_action: "check",
    reasoning: "After the raise, preserve showdown value.",
  }, { recordedAt: 3 });

  assert.equal(updatedFlop.preflop.hero_action, "open");
  assert.equal(updatedFlop.flop.hero_action, "check");
  assert.equal(updatedFlop.flop.recordedAt, 3);
  assert.equal(Object.keys(updatedFlop).length, 2);
});

test("does not record placeholders, errors, or unknown streets", () => {
  const original = {
    preflop: createStreetCoachSnapshot(
      { hero_action: "fold", reasoning: "Outside the opening range." },
      { recordedAt: 1 },
    ),
  };

  assert.equal(
    rememberStreetCoach(original, "flop", { hero_action: "..." }),
    original,
  );
  assert.equal(
    rememberStreetCoach(original, "showdown", { hero_action: "check" }),
    original,
  );
});

test("board corrections clear the changed street and every later street", () => {
  const history = {
    preflop: { hero_action: "open" },
    flop: { hero_action: "bet" },
    turn: { hero_action: "check" },
    river: { hero_action: "call" },
  };

  assert.deepEqual(clearStreetCoachHistoryFrom(history, "turn"), {
    preflop: history.preflop,
    flop: history.flop,
  });
});

test("captures the tournament stage used for a street recommendation", () => {
  const snapshot = createStreetCoachSnapshot(
    {
      hero_action: "call",
      reasoning: "Coverage makes the bubble call-off threshold tighter.",
    },
    {
      tournamentStage: "bubble_pressure",
      recordedAt: 4,
    },
  );

  assert.equal(snapshot.tournamentStage, "bubble_pressure");
});

test("captures the exact pot odds used for a street recommendation", () => {
  const snapshot = createStreetCoachSnapshot(
    {
      hero_action: "call",
      reasoning: "The draw clears the required equity threshold.",
    },
    {
      potOdds: {
        requiredEquityPct: 30.8,
        callAmountBB: 12,
        potBeforeCallBB: 27,
        potAfterCallBB: 39,
      },
      recordedAt: 5,
    },
  );

  assert.deepEqual(snapshot.potOdds, {
    requiredEquityPct: 30.8,
    callAmountBB: 12,
    potBeforeCallBB: 27,
    potAfterCallBB: 39,
  });
});

test("preserves an independent copy of the Coach state receipt", () => {
  const receipt = {
    street: "turn",
    heroCards: ["Kh", "Qh"],
    potBB: 31.73,
    facingAction: { type: "jam", amountBB: 16.35 },
  };
  const snapshot = createStreetCoachSnapshot({
    hero_action: "call",
    decision_receipt: receipt,
  });

  receipt.heroCards[0] = "2c";
  receipt.facingAction.amountBB = 1;

  assert.deepEqual(snapshot.decision_receipt.heroCards, ["Kh", "Qh"]);
  assert.equal(snapshot.decision_receipt.facingAction.amountBB, 16.35);
});
