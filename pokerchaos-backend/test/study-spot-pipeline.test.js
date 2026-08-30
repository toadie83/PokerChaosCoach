import assert from "node:assert/strict";
import test from "node:test";

import { extractStudySpotCandidates } from "../src/studySpots/candidateExtractor.js";
import { applyStudySpotClassifications } from "../src/studySpots/classifier.js";
import { rankStudySpots } from "../src/studySpots/ranker.js";

function hand(overrides = {}) {
  return {
    handKey: "hand-1",
    handId: "1",
    gameType: "tournament",
    heroName: "Hero",
    heroCards: ["Kh", "9d"],
    heroPosition: "BB",
    heroStack: 3100,
    blinds: { smallBlind: 50, bigBlind: 100, ante: 10 },
    seats: [
      { player: "Villain", position: "SB", chips: 5000 },
      { player: "Hero", position: "BB", chips: 3100 },
    ],
    board: { flop: [], turn: null, river: null },
    actionsByStreet: {
      preflop: [
        { player: "Villain", type: "raise", toAmount: 220 },
        { player: "Hero", type: "fold" },
      ],
      flop: [],
      turn: [],
      river: [],
    },
    ...overrides,
  };
}

test("extractor includes Hero preflop folds as blind-defence candidates", () => {
  const candidates = extractStudySpotCandidates([hand()]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].tags[0], "bb-defence");
  assert.equal(candidates[0].stackDepthTag, "25-40");
  assert.match(candidates[0].summary, /2.2x open/);
});

test("extractor surfaces river facing-bet decisions without declaring a mistake", () => {
  const riverHand = hand({
    handKey: "river-1",
    heroPosition: "BTN",
    heroCards: ["Ah", "Jd"],
    board: { flop: ["8h", "7h", "6c"], turn: "2s", river: "Kd" },
    actionsByStreet: {
      preflop: [{ player: "Hero", type: "raise", toAmount: 220 }],
      flop: [{ player: "Hero", type: "bet", amount: 180 }],
      turn: [{ player: "Hero", type: "check" }],
      river: [
        { player: "Villain", type: "bet", amount: 600 },
        { player: "Hero", type: "fold" },
      ],
    },
  });
  const candidates = extractStudySpotCandidates([riverHand]);
  const river = candidates.find((candidate) => candidate.street === "river");
  assert.equal(river.type, "close_decision");
  assert.deepEqual(river.tags, ["river", "bluff-catch"]);
  assert.doesNotMatch(river.summary, /mistake|wrong/i);
});

test("extractor labels non-aggressor turn bets as probes rather than delayed c-bets", () => {
  const probeHand = hand({
    handKey: "probe-1",
    heroPosition: "BTN",
    actionsByStreet: {
      preflop: [
        { player: "Villain", type: "raise", toAmount: 220 },
        { player: "Hero", type: "call", amount: 220 },
      ],
      flop: [
        { player: "Villain", type: "check" },
        { player: "Hero", type: "check" },
      ],
      turn: [
        { player: "Villain", type: "check" },
        { player: "Hero", type: "bet", amount: 300 },
      ],
      river: [],
    },
  });

  const candidates = extractStudySpotCandidates([probeHand]);
  const turn = candidates.find((candidate) => candidate.street === "turn");
  assert.equal(turn.detector, "turn_probe");
  assert.deepEqual(turn.tags, ["probe"]);
  assert.doesNotMatch(turn.title, /continuation/i);
});

test("classification reconciliation rejects unknown IDs and keeps deterministic facts", () => {
  const [candidate] = extractStudySpotCandidates([hand()]);
  const classified = applyStudySpotClassifications([candidate], {
    classifications: [
      {
        candidateId: "invented",
        keep: true,
        title: "Fake",
      },
      {
        candidateId: candidate.candidateId,
        keep: true,
        type: "mistake",
        category: "blind-vs-blind",
        tags: ["bb-defence", "fake-tag"],
        title: "Blind defence frequency",
        summary: "Invented cards and stack",
        whyStudyThis: "This repeatable blind decision is worth checking against a sound baseline.",
        confidence: 0.95,
        strategicImportance: 0.8,
        severity: 0.5,
      },
    ],
  });
  assert.equal(classified.length, 1);
  assert.equal(classified[0].summary, candidate.summary);
  assert.deepEqual(classified[0].tags, ["bb-defence"]);
  assert.equal(classified[0].confidence, candidate.confidence);
});

test("ranking groups compatible repeated spots and is independent of resources", () => {
  const candidates = extractStudySpotCandidates([
    hand(),
    hand({ handKey: "hand-2", handId: "2", heroCards: ["Qh", "8d"] }),
    hand({ handKey: "hand-3", handId: "3", heroCards: ["Jh", "7d"] }),
  ]);
  const classifications = {
    classifications: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      keep: true,
      type: candidate.type,
      category: candidate.category,
      tags: candidate.tags,
      title: candidate.title,
      whyStudyThis: candidate.whyStudyThis,
      confidence: candidate.confidence,
      strategicImportance: candidate.strategicImportance,
      severity: candidate.severity,
    })),
  };
  const ranked = rankStudySpots(
    applyStudySpotClassifications(candidates, classifications),
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].type, "recurring_pattern");
  assert.equal(ranked[0].occurrenceCount, 3);
  assert.deepEqual(ranked[0].exampleHandKeys, ["hand-1", "hand-2", "hand-3"]);
});

test("ranking preserves category diversity when one category dominates", () => {
  const candidate = (index, category, score) => ({
    candidateId: `candidate-${index}`,
    handKey: `hand-${index}`,
    category,
    tags: [`tag-${index}`],
    type: "interesting_spot",
    stackDepthTag: "25-40",
    heroPosition: "BTN",
    villainPosition: "BB",
    opponentType: "unknown",
    strategicImportance: score,
    confidence: score,
    severity: score,
  });
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) =>
      candidate(index, "preflop", 1 - index * 0.02),
    ),
    candidate(20, "postflop", 0.2),
  ];

  const ranked = rankStudySpots(candidates, { limit: 8 });
  assert.equal(ranked.length, 8);
  assert.equal(ranked.some((spot) => spot.category === "postflop"), true);
});
