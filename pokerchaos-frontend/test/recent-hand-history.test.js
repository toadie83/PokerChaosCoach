import assert from "node:assert/strict";
import test from "node:test";

import {
  RECENT_HAND_LIMIT,
  RECENT_HANDS_STORAGE_KEY,
  buildRecentHandEntry,
  loadRecentHands,
  mergeRecentHand,
  persistRecentHands,
} from "../src/lib/recentHandHistory.js";

function exampleState(overrides = {}) {
  return {
    street: "preflop",
    heroSeat: "BTN",
    heroCards: { card1: "Js", card2: "9c" },
    board: { flop: [null, null, null], turn: null, river: null },
    history: [
      {
        at: 101,
        street: "preflop",
        actor: "opp",
        seat: "HJ",
        action: "open",
        toAmountBB: 2,
      },
      {
        at: 102,
        street: "preflop",
        actor: "hero",
        seat: "BTN",
        action: "fold",
        note: "Coach line assumed",
      },
    ],
    ...overrides,
  };
}

const preflopCoach = {
  hero_action: "fold",
  confidence: "high",
  flavor_text: "J9o lacks blockers and multiway realization.",
  reasoning: "The opener is short but the blinds remain live.",
  alternative_action: "call",
  alternative_sizing: "2 BB",
  assumptions: ["SB and BB stacks are unknown."],
  tournamentStage: "middle_accumulation",
};

test("builds a locally archivable hand with Coach guidance and actions", () => {
  const entry = buildRecentHandEntry({
    state: exampleState(),
    coachByStreet: { preflop: preflopCoach },
    archivedAt: 1000,
  });

  assert.equal(entry.id, "coach-hand-101-js9c");
  assert.deepEqual(entry.heroCards, ["Js", "9c"]);
  assert.equal(entry.heroSeat, "BTN");
  assert.equal(entry.latestCoachStreet, "preflop");
  assert.equal(entry.latestCoachAction, "FOLD");
  assert.equal(entry.coachByStreet.preflop.reasoning, preflopCoach.reasoning);
  assert.equal(entry.history.length, 2);
});

test("does not archive an empty or cardless hand", () => {
  assert.equal(
    buildRecentHandEntry({
      state: exampleState({ history: [] }),
      coachByStreet: {},
    }),
    null,
  );
  assert.equal(
    buildRecentHandEntry({
      state: exampleState({ heroCards: { card1: null, card2: null } }),
      coachByStreet: { preflop: preflopCoach },
    }),
    null,
  );
});

test("updates the same hand and retains only the latest three hands", () => {
  const entries = [101, 201, 301, 401].map((at) =>
    buildRecentHandEntry({
      state: exampleState({
        heroCards: { card1: `${String(at)[0]}s`, card2: "9c" },
        history: [{ ...exampleState().history[0], at }],
      }),
      coachByStreet: { preflop: preflopCoach },
      archivedAt: at,
    }),
  );
  let recent = [];
  entries.forEach((entry) => {
    recent = mergeRecentHand(recent, entry);
  });
  assert.equal(recent.length, RECENT_HAND_LIMIT);
  assert.deepEqual(
    recent.map((entry) => entry.archivedAt),
    [401, 301, 201],
  );

  const updated = { ...recent[1], archivedAt: 999 };
  recent = mergeRecentHand(recent, updated);
  assert.equal(recent.length, RECENT_HAND_LIMIT);
  assert.equal(recent[0].id, updated.id);
  assert.equal(recent[0].archivedAt, 999);
});

test("persists and clears recent hands using local storage semantics", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const entry = buildRecentHandEntry({
    state: exampleState(),
    coachByStreet: { preflop: preflopCoach },
    archivedAt: 1000,
  });

  persistRecentHands([entry], storage);
  assert.equal(values.has(RECENT_HANDS_STORAGE_KEY), true);
  assert.equal(loadRecentHands(storage)[0].id, entry.id);

  persistRecentHands([], storage);
  assert.equal(values.has(RECENT_HANDS_STORAGE_KEY), false);
});
