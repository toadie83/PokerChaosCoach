import assert from "node:assert/strict";
import test from "node:test";

import {
  analyseFreeStudySpotsUpload,
  analyseSavedTournamentForStudy,
  toPublicLearningResourceSummary,
} from "../src/studySpots/service.js";

function blindDefenceHand() {
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
  };
}

function memoryPersistence() {
  const state = { created: null, completed: null, failed: null };
  return {
    state,
    persistence: {
      async createStudyReport(input) {
        state.created = input;
        return input;
      },
      async completeStudyReport(input) {
        state.completed = input;
        return {
          id: input.id,
          status: "complete",
          spotCount: input.spots.length,
          spots: input.spots,
        };
      },
      async failStudyReport(input) {
        state.failed = input;
        return { id: input.id, status: "failed" };
      },
    },
  };
}

function keepEveryCandidate(candidates) {
  return Promise.resolve({
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
    usage: { total_tokens: 100 },
  });
}

function publicTournamentHistory() {
  return `PokerStars Hand #3001: Tournament #T300, Hold'em No Limit - Level I (50/100) - 2026/08/29 20:00:00
Table 'Final' 2-max Seat #1 is the button
Seat 1: Villain (5000 in chips)
Seat 2: Hero (3100 in chips)
Villain: posts small blind 50
Hero: posts big blind 100
*** HOLE CARDS ***
Dealt to Hero [Kh 9d]
Villain: raises 120 to 220
Hero: folds
*** SUMMARY ***
Total pot 200 | Rake 0`;
}

test("orchestrator persists useful no-resource spots without fabricating matches", async () => {
  const memory = memoryPersistence();
  let nextId = 0;
  const result = await analyseSavedTournamentForStudy({
    userId: "user-1",
    tournamentId: "tournament-1",
    compactHands: [blindDefenceHand()],
    model: "test-model",
    classifyCandidates: keepEveryCandidate,
    resources: [],
    persistence: memory.persistence,
    idFactory: () => `id-${++nextId}`,
  });

  assert.equal(memory.state.created.candidateCount, 1);
  assert.equal(memory.state.completed.spots.length, 1);
  assert.deepEqual(memory.state.completed.spots[0].resourceMatches, []);
  assert.equal(memory.state.completed.spots[0].contentGapTag, "bb-defence");
  assert.equal(result.report.status, "complete");
  assert.equal(result.usage.total_tokens, 100);
});

test("Study Spots match only published resources and preserve their canonical lesson path", async () => {
  const memory = memoryPersistence();
  let loaderOptions = null;
  let nextId = 0;
  await analyseSavedTournamentForStudy({
    userId: "free-user",
    tournamentId: "tournament-1",
    compactHands: [blindDefenceHand()],
    model: "test-model",
    classifyCandidates: keepEveryCandidate,
    resourceLoader: async (options) => {
      loaderOptions = options;
      return [{
        id: "lesson-1",
        slug: "big-blind-defence",
        canonicalPath: "/learn/big-blind-defence",
        title: "Big blind defence",
        category: "blind-vs-blind",
        primaryTag: "bb-defence",
        status: "published",
        secondaryTags: [],
        stackDepthTags: [],
        heroPositionTags: ["BB"],
        villainPositionTags: ["SB"],
        opponentTypeTags: [],
        studySpotTypes: ["preflop_uncertainty"],
        priority: 100,
      }];
    },
    persistence: memory.persistence,
    idFactory: () => `published-${++nextId}`,
  });

  assert.deepEqual(loaderOptions, { publishedOnly: true });
  assert.equal(
    memory.state.completed.spots[0].resourceMatches[0]?.resource?.canonicalPath,
    "/learn/big-blind-defence",
  );
});

test("orchestrator completes honest zero-result reports without an AI call", async () => {
  const memory = memoryPersistence();
  let classifierCalled = false;
  const result = await analyseSavedTournamentForStudy({
    userId: "user-1",
    tournamentId: "tournament-1",
    compactHands: [],
    model: "test-model",
    classifyCandidates: async () => {
      classifierCalled = true;
      return { classifications: [] };
    },
    resources: [],
    persistence: memory.persistence,
    idFactory: () => "report-zero",
  });

  assert.equal(classifierCalled, false);
  assert.deepEqual(memory.state.completed.spots, []);
  assert.equal(result.report.spotCount, 0);
});

test("orchestrator marks the persisted report failed when classification fails", async () => {
  const memory = memoryPersistence();
  let attempts = 0;
  await assert.rejects(
    analyseSavedTournamentForStudy({
      userId: "user-1",
      tournamentId: "tournament-1",
      compactHands: [blindDefenceHand()],
      model: "test-model",
      classifyCandidates: async () => {
        attempts += 1;
        throw new Error("provider unavailable");
      },
      resources: [],
      persistence: memory.persistence,
      idFactory: () => "report-failed",
    }),
    (error) => error.reportId === "report-failed",
  );
  assert.equal(attempts, 1);
  assert.equal(memory.state.failed.errorCode, "ANALYSIS_FAILED");
});

test("orchestrator retries one transient classification failure", async () => {
  const memory = memoryPersistence();
  let attempts = 0;
  const result = await analyseSavedTournamentForStudy({
    userId: "user-1",
    tournamentId: "tournament-1",
    compactHands: [blindDefenceHand()],
    model: "test-model",
    classifyCandidates: async (candidates) => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("rate limited");
        error.status = 429;
        throw error;
      }
      return keepEveryCandidate(candidates);
    },
    resources: [],
    persistence: memory.persistence,
    idFactory: () => `retry-${attempts}`,
  });

  assert.equal(attempts, 2);
  assert.equal(result.report.status, "complete");
  assert.equal(memory.state.failed, null);
});

test("public free analysis returns an ephemeral three-spot learning preview", async () => {
  let nextId = 0;
  const result = await analyseFreeStudySpotsUpload({
    historyText: publicTournamentHistory(),
    heroName: "Hero",
    tournamentName: "Sunday Test",
    model: "test-model",
    classifyCandidates: keepEveryCandidate,
    resources: [{
      id: "lesson-1",
      slug: "big-blind-defence",
      canonicalPath: "/learn/big-blind-defence",
      title: "Big blind defence",
      description: "Defend the right hands blind versus blind.",
      category: "preflop",
      primaryTag: "big-blind-defence",
      secondaryTags: [],
      tags: ["big-blind-defence"],
      stackDepthTags: [],
      heroPositionTags: [],
      villainPositionTags: [],
      opponentTypeTags: [],
      studySpotTypes: [],
      resourceType: "quick_lesson",
      status: "published",
      published: true,
      priority: 100,
      body: "Full lesson content is intentionally not returned in the preview.",
    }],
    idFactory: () => `public-${++nextId}`,
  });

  assert.equal(result.report.status, "complete");
  assert.equal(result.report.handsAnalysed, 1);
  assert.ok(result.report.spots.length <= 3);
  assert.equal(result.tournament.name, "Sunday Test");
  assert.equal("tournamentId" in result.tournament, false);

  const resource = toPublicLearningResourceSummary({
    id: "lesson-1",
    slug: "big-blind-defence",
    canonicalPath: "/learn/big-blind-defence",
    title: "Big blind defence",
    body: "Full lesson content is intentionally not returned in the preview.",
  });
  assert.equal(resource.canonicalPath, "/learn/big-blind-defence");
  assert.equal("body" in resource, false);
});
