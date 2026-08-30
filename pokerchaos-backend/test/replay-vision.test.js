import test from "node:test";
import assert from "node:assert/strict";
import { __replayVisionTestables } from "../src/openaiService.js";

const { normalizeReplayCardCode, normalizeReplayCardRecognition } =
  __replayVisionTestables;

test("normalizes replay card codes to rank-plus-lowercase-suit", () => {
  assert.equal(normalizeReplayCardCode("as"), "As");
  assert.equal(normalizeReplayCardCode("10d"), null);
  assert.equal(normalizeReplayCardCode("Tx"), null);
});

test("accepts a complete validated PokerCraft snapshot", () => {
  assert.deepEqual(
    normalizeReplayCardRecognition(
      {
        heroCards: ["QS", "ts"],
        boardCards: ["Td", "Qc", "9d", "3h", "Ks"],
        confidence: "high",
      },
      5,
    ),
    {
      recognized: true,
      confidence: "high",
      confirmationRequired: false,
      manualReviewSuggested: false,
      heroCards: { card1: "Qs", card2: "Ts" },
      board: {
        flop: ["Td", "Qc", "9d"],
        turn: "3h",
        river: "Ks",
      },
      boardCount: 5,
      street: "river",
    },
  );
});

test("rejects duplicate cards and board-count disagreements", () => {
  const duplicate = normalizeReplayCardRecognition(
    {
      heroCards: ["As", "Kd"],
      boardCards: ["As", "7c", "2h"],
      confidence: "high",
    },
    3,
  );
  assert.equal(duplicate.recognized, false);
  assert.match(duplicate.reason, /duplicate/i);

  const wrongCount = normalizeReplayCardRecognition(
    {
      heroCards: ["As", "Kd"],
      boardCards: ["7s", "7c", "2h"],
      confidence: "high",
    },
    4,
  );
  assert.equal(wrongCount.recognized, false);
  assert.match(wrongCount.reason, /count/i);
});

test("locks Hero and earlier board cards across later-street reads", () => {
  const validTurn = normalizeReplayCardRecognition(
    {
      heroCards: ["As", "Kd"],
      boardCards: ["7h", "Tc", "2s", "Qd"],
      confidence: "high",
    },
    4,
    {
      knownHeroCards: ["As", "Kd"],
      knownBoardCards: ["7h", "Tc", "2s"],
    },
  );
  assert.equal(validTurn.recognized, true);

  const changedHero = normalizeReplayCardRecognition(
    {
      heroCards: ["Ah", "Kd"],
      boardCards: ["7h", "Tc", "2s", "Qd"],
      confidence: "high",
    },
    4,
    {
      knownHeroCards: ["As", "Kd"],
      knownBoardCards: ["7h", "Tc", "2s"],
    },
  );
  assert.equal(changedHero.recognized, false);
  assert.match(changedHero.reason, /Hero/i);

  const changedFlop = normalizeReplayCardRecognition(
    {
      heroCards: ["As", "Kd"],
      boardCards: ["7h", "Jc", "2s", "Qd"],
      confidence: "high",
    },
    4,
    {
      knownHeroCards: ["As", "Kd"],
      knownBoardCards: ["7h", "Tc", "2s"],
    },
  );
  assert.equal(changedFlop.recognized, false);
  assert.match(changedFlop.reason, /community/i);
});

test("passes structurally valid low-confidence reads for first-pass acceptance", () => {
  const lowConfidence = normalizeReplayCardRecognition(
    {
      heroCards: ["As", "Kd"],
      boardCards: [],
      confidence: "low",
    },
    0,
  );
  assert.equal(lowConfidence.recognized, true);
  assert.equal(lowConfidence.confidence, "low");
  assert.equal(lowConfidence.confirmationRequired, false);
  assert.equal(lowConfidence.manualReviewSuggested, true);
});

test("normalizes an independently confirmed start-of-hand Hero stack", () => {
  const result = normalizeReplayCardRecognition(
    {
      heroCards: ["Kc", "Qh"],
      boardCards: [],
      confidence: "high",
      heroStackBB: 67.6,
      stackConfidence: "high",
    },
    0,
    { readHeroStack: true },
  );

  assert.equal(result.recognized, true);
  assert.equal(result.heroStackBehindBB, 67.6);
  assert.equal(result.stackConfidence, "high");
});

test("an unclear optional stack never rejects otherwise valid cards", () => {
  const result = normalizeReplayCardRecognition(
    {
      heroCards: ["Kc", "Qh"],
      boardCards: [],
      confidence: "high",
      heroStackBB: 67.8,
      stackConfidence: "low",
    },
    0,
    { readHeroStack: true },
  );

  assert.equal(result.recognized, true);
  assert.equal(result.confidence, "high");
  assert.equal(result.heroStackBehindBB, null);
  assert.equal(result.stackConfidence, "low");
});

test("stack fields are ignored when optional stack vision is excluded", () => {
  const result = normalizeReplayCardRecognition(
    {
      heroCards: ["Kc", "Qh"],
      boardCards: [],
      confidence: "high",
      heroStackBB: 67.6,
      stackConfidence: "high",
    },
    0,
  );

  assert.equal(result.recognized, true);
  assert.equal(Object.hasOwn(result, "heroStackBehindBB"), false);
  assert.equal(Object.hasOwn(result, "stackConfidence"), false);
});

test("Hero visibility guidance treats a clear partial card top as a complete read", () => {
  const guidance = __replayVisionTestables.replayHeroVisibilityGuidance;
  assert.match(guidance, /partial, angled, overlapping/i);
  assert.match(guidance, /upper-left rank and suit is a complete Hero-card read/i);
  assert.match(guidance, /must not reduce confidence/i);
});
