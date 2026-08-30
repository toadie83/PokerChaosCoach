import assert from "node:assert/strict";
import test from "node:test";

import {
  MTT_QUICK_OPEN_CHART_VERSION,
  QUICK_OPEN_CHART_VERSION,
  canonicalStartingHand,
  getQuickOpenSnapshot,
} from "../src/lib/quickOpenRange.js";

const snapshot = (card1, card2, heroSeat = "BTN") =>
  getQuickOpenSnapshot({
    heroCards: { card1, card2 },
    heroSeat,
    tableSize: 6,
    gameType: "cash",
  });

const mttSnapshot = (
  card1,
  card2,
  heroSeat = "BTN",
  heroStackBB = 35,
  tournamentStage = "auto",
) =>
  getQuickOpenSnapshot({
    heroCards: { card1, card2 },
    heroSeat,
    tableSize: 8,
    gameType: "tournament",
    heroStackBB,
    tournamentStage,
  });

test("canonicalizes starting hands independent of card order", () => {
  assert.equal(canonicalStartingHand({ card1: "Ts", card2: "As" }), "ATs");
  assert.equal(canonicalStartingHand({ card1: "ah", card2: "Td" }), "ATo");
  assert.equal(canonicalStartingHand({ card1: "Tc", card2: "Th" }), "TT");
});

test("BTN ATs receives an immediate six-max cash OPEN snapshot", () => {
  const result = snapshot("As", "Ts", "BTN");
  assert.equal(result.action, "open");
  assert.equal(result.label, "OPEN");
  assert.equal(result.handCode, "ATs");
  assert.equal(result.chartVersion, QUICK_OPEN_CHART_VERSION);
});

test("the same marginal holding can change with position", () => {
  assert.equal(snapshot("Ks", "2s", "BTN").action, "open");
  assert.equal(snapshot("Ks", "2s", "UTG").action, "fold");
});

test("a clear trash hand receives FOLD and the big blind receives CHECK", () => {
  assert.equal(snapshot("7s", "2d", "UTG").action, "fold");
  assert.equal(snapshot("7s", "2d", "BB").action, "check");
});

test("eight-max MTT snapshot uses position and labels chip-EV without ICM", () => {
  const button = mttSnapshot("As", "Ts", "BTN", 35);
  assert.equal(button.action, "open");
  assert.equal(button.heading, "8-max MTT RFI");
  assert.match(button.baselineLabel, /35BB chip-EV · no ICM/);
  assert.equal(button.chartVersion, MTT_QUICK_OPEN_CHART_VERSION);

  assert.equal(mttSnapshot("Ks", "2s", "UTG", 35).action, "fold");
});

test("MTT snapshot labels a selected stage without pretending to solve ICM", () => {
  const bubble = mttSnapshot("As", "Ts", "BTN", 35, "bubble_pressure");
  assert.equal(bubble.action, "open");
  assert.equal(bubble.stageCode, "bubble_pressure");
  assert.equal(bubble.stageLabel, "Bubble Pressure");
  assert.equal(bubble.icmSensitive, true);
  assert.match(bubble.baselineLabel, /Bubble.*ICM-sensitive/i);
  assert.match(bubble.explanation, /stack coverage and payouts/i);

  const middle = mttSnapshot("As", "Ts", "BTN", 35, "middle_accumulation");
  assert.equal(middle.icmSensitive, false);
  assert.match(middle.baselineLabel, /Middle lens/i);
  assert.match(middle.explanation, /conservative chart baseline/i);
});

test("cash snapshot ignores a stale tournament-stage selection", () => {
  const result = getQuickOpenSnapshot({
    heroCards: { card1: "As", card2: "Ts" },
    heroSeat: "BTN",
    tableSize: 6,
    gameType: "cash",
    tournamentStage: "late_endgame",
  });
  assert.equal(result.stageCode, null);
  assert.equal(result.icmSensitive, false);
  assert.equal(result.baselineLabel, "~100BB baseline");
});

test("short-stack MTT snapshot trims speculative opens and keeps strong first-ins", () => {
  const speculative = mttSnapshot("5s", "4s", "BTN", 15);
  const strong = mttSnapshot("As", "Td", "UTG", 15);
  assert.equal(speculative.action, "fold");
  assert.equal(strong.action, "open");
  assert.match(strong.explanation, /does not choose between a small raise and a jam/i);
});

test("eight-max MTT big blind correctly shows CHECK", () => {
  const result = mttSnapshot("7s", "2d", "BB", 25);
  assert.equal(result.action, "check");
  assert.equal(result.heading, "8-max MTT RFI");
});

test("MTT quick range labels bounty context without inventing bounty math", () => {
  const result = getQuickOpenSnapshot({
    heroCards: { card1: "As", card2: "8d" },
    heroSeat: "BTN",
    tableSize: 8,
    gameType: "tournament",
    heroStackBB: 35,
    tournamentStage: "middle_accumulation",
    bountyMode: "progressive_ko",
  });

  assert.equal(result.bountyMode, "progressive_ko");
  assert.equal(result.bountyLabel, "PKO");
  assert.match(result.baselineLabel, /PKO qualitative/i);
  assert.match(result.explanation, /does not invent bounty value/i);
  assert.match(result.explanation, /raw pot odds/i);
});

test("snapshot is unavailable outside supported table formats or without complete inputs", () => {
  assert.equal(
    getQuickOpenSnapshot({
      heroCards: { card1: "As", card2: "Ts" },
      heroSeat: "BTN",
      tableSize: 8,
      gameType: "cash",
    }),
    null,
  );
  assert.equal(
    getQuickOpenSnapshot({
      heroCards: { card1: "As", card2: "Ts" },
      heroSeat: "BTN",
      tableSize: 6,
      gameType: "tournament",
    }),
    null,
  );
  assert.equal(snapshot("As", null), null);
});
