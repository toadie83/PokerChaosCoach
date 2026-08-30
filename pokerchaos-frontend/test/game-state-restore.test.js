import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDetectedHeroStack,
  detectedCardsChangeDecisionState,
  popUndoSnapshot,
  prepareRestoredGameState,
} from "../src/state/useGameState.js";
import { initialState } from "../src/state/machine.js";
import { buildStackState } from "../src/state/decisionState.js";

test("restores a saved decision without replaying its AI trigger", () => {
  const saved = {
    street: "flop",
    heroSeat: "BTN",
    heroCards: { card1: "As", card2: "Kh" },
    board: { flop: ["8h", "7c", "2d"], turn: null, river: null },
    potSizes: { total: 7.4 },
    history: [{ street: "preflop", actor: "hero", action: "open" }],
    nextActor: "opp",
    lastEvent: "unopened",
    lastEventAt: 123456,
  };

  const restored = prepareRestoredGameState(saved);

  assert.equal(restored.street, "flop");
  assert.equal(restored.heroSeat, "BTN");
  assert.deepEqual(restored.heroCards, { card1: "As", card2: "Kh" });
  assert.deepEqual(restored.board.flop, ["8h", "7c", "2d"]);
  assert.equal(restored.potSizes.total, 7.4);
  assert.deepEqual(restored.history, saved.history);
  assert.equal(restored.nextActor, "opp");
  assert.equal(restored.lastEvent, "unopened");
  assert.equal(restored.lastEventAt, 0);
  assert.notEqual(restored.history, saved.history);
});

test("normalizes card fields while rebuilding a saved decision", () => {
  const restored = prepareRestoredGameState({
    heroCards: { card1: "as", card2: "not-a-card" },
    board: { flop: ["KH", "7c", "bad"], turn: "2D", river: null },
  });

  assert.deepEqual(restored.heroCards, { card1: "As", card2: null });
  assert.deepEqual(restored.board, {
    flop: ["Kh", "7c", null],
    turn: "2d",
    river: null,
  });
});

test("restored tournament stage is retained and invalid values fall back to auto", () => {
  assert.equal(
    prepareRestoredGameState({ tournamentStage: "post_bubble" }).tournamentStage,
    "post_bubble",
  );
  assert.equal(
    prepareRestoredGameState({ tournamentStage: "unknown_stage" }).tournamentStage,
    "auto",
  );
});

test("restored tournament bounty mode is normalized and cash disables it", () => {
  assert.equal(
    prepareRestoredGameState({
      gameType: "tournament",
      bountyMode: "progressive_ko",
    }).bountyMode,
    "progressive_ko",
  );
  assert.equal(
    prepareRestoredGameState({
      gameType: "tournament",
      bountyMode: "invalid",
    }).bountyMode,
    "none",
  );
  assert.equal(
    prepareRestoredGameState({
      gameType: "cash",
      bountyMode: "standard_ko",
    }).bountyMode,
    "none",
  );
});

test("applies a confirmed vision stack as chips behind without double-counting the blind", () => {
  const detected = applyDetectedHeroStack(
    {
      ...initialState,
      heroSeat: "SB",
      street: "preflop",
      stackRemainingOverrides: { hero: null, opponent: null },
    },
    {
      heroStackBehindBB: 67.6,
      stackConfidence: "high",
    },
  );

  assert.equal(detected.heroStackBB, 68.1);
  assert.equal(detected.stackRemainingOverrides.hero.remainingBB, 67.6);
  assert.equal(detected.stackRemainingOverrides.hero.committedAtBB, 0.5);
  assert.equal(buildStackState(detected).heroStackBehindBB, 67.6);
});

test("does not alter stack state for an absent or low-confidence vision stack", () => {
  const state = {
    ...initialState,
    heroStackBB: 42,
    stackRemainingOverrides: { hero: null, opponent: null },
  };

  assert.equal(applyDetectedHeroStack(state, {}), state);
  assert.equal(
    applyDetectedHeroStack(state, {
      heroStackBehindBB: 18.4,
      stackConfidence: "low",
    }),
    state,
  );
});

test("duplicate Vision confirmations do not invalidate the current decision", () => {
  const state = {
    ...initialState,
    street: "flop",
    heroCards: { card1: "6s", card2: "6h" },
    board: { flop: ["8c", "4h", "2d"], turn: null, river: null },
    nextActor: "opp",
  };

  assert.equal(
    detectedCardsChangeDecisionState(state, {
      heroCards: { card1: "6s", card2: "6h" },
      board: { flop: ["8c", "4h", "2d"], turn: null, river: null },
      heroStackBehindBB: 48.9,
      stackConfidence: "high",
    }),
    false,
  );
  assert.equal(
    detectedCardsChangeDecisionState(state, {
      heroCards: { card1: "6s", card2: "6h" },
      board: { flop: ["8c", "4h", "2d"], turn: "Jc", river: null },
    }),
    true,
  );
});

test("visible undo skips the internal assumed Coach action", () => {
  const beforeUserAction = { marker: "before user action" };
  const afterUserAction = { marker: "after user action" };
  const history = [beforeUserAction, afterUserAction];
  const current = { marker: "assumed Coach action", lastEventAssumed: true };

  const restored = popUndoSnapshot(history, current, {
    skipAssumedAction: true,
  });

  assert.equal(restored, beforeUserAction);
  assert.equal(history.length, 0);
});

test("visible undo removes one normal user action", () => {
  const previous = { marker: "previous" };
  const history = [previous];
  const current = { marker: "current", lastEventAssumed: false };

  assert.equal(
    popUndoSnapshot(history, current, { skipAssumedAction: true }),
    previous,
  );
});
