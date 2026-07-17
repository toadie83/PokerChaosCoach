import test from "node:test";
import assert from "node:assert/strict";
import { prepareRestoredGameState } from "../src/state/useGameState.js";

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
