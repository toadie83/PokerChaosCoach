import assert from "node:assert/strict";
import test from "node:test";

import { buildHandReplay, replayActionLabel } from "../src/lib/handReplay.js";

function replayHand() {
  return {
    heroName: "Hero",
    heroSeat: 1,
    heroCards: ["Ah", "Kd"],
    table: { buttonSeat: 2 },
    seats: [
      { seat: 1, player: "Hero", position: "SB", chips: 1000 },
      { seat: 2, player: "Villain", position: "BB", chips: 1000 },
    ],
    replayEvents: [
      { player: "Hero", type: "post_small_blind", amount: 50 },
      { player: "Villain", type: "post_big_blind", amount: 100 },
      { player: "Hero", type: "raise", raiseBy: 250, toAmount: 300 },
      { player: "Villain", type: "call", amount: 200 },
      { type: "street", street: "flop", cards: ["As", "7d", "2c"] },
      { player: "Villain", type: "check" },
      { player: "Hero", type: "bet", amount: 400 },
      { player: "Villain", type: "fold" },
      { player: "Hero", type: "return_uncalled", amount: 400 },
      { player: "Hero", type: "collect", amount: 600 },
    ],
  };
}

test("builds an immutable frame for every action and street transition", () => {
  const replay = buildHandReplay(replayHand());

  assert.equal(replay.frames.length, 11);
  assert.equal(replay.frames[0].players[0].player, "Hero");
  assert.deepEqual(replay.frames[5].board, ["As", "7d", "2c"]);
  assert.equal(replay.frames[4].pot, 600);
  assert.equal(replay.frames[4].players[0].stack, 700);
  assert.equal(replay.frames[4].players[1].stack, 700);
  assert.equal(replay.frames[4].players[1].lastActionLabel, "calls 200");
  assert.equal(replay.frames[5].players[0].bet, 0);
  assert.equal(replay.frames[7].pot, 1000);
  assert.equal(replay.frames[9].pot, 600);
  assert.equal(replay.frames[10].pot, 0);
  assert.equal(replay.frames[10].players[0].stack, 1300);
  assert.equal(replay.frames[8].players[1].folded, true);
  assert.equal(replay.frames[0].players[1].folded, false);
});

test("keeps antes out of the current street bet while adding them to the pot", () => {
  const hand = replayHand();
  hand.replayEvents = [
    { player: "Hero", type: "post_ante", amount: 10 },
    { player: "Villain", type: "post_ante", amount: 10 },
    { player: "Hero", type: "post_small_blind", amount: 50 },
  ];
  const replay = buildHandReplay(hand);
  const last = replay.frames.at(-1);

  assert.equal(last.pot, 70);
  assert.equal(last.players[0].stack, 940);
  assert.equal(last.players[0].bet, 50);
  assert.equal(last.players[1].stack, 990);
  assert.equal(last.players[1].bet, 0);
});

test("supports older hands by deriving a partial timeline", () => {
  const hand = replayHand();
  delete hand.replayEvents;
  hand.board = { flop: ["As", "7d", "2c"], turn: null, river: null };
  hand.actionsByStreet = {
    preflop: [{ player: "Hero", type: "fold" }],
    flop: [],
    turn: [],
    river: [],
  };

  const replay = buildHandReplay(hand);
  assert.equal(replay.available, true);
  assert.ok(replay.warnings.some((warning) => warning.includes("partial replay timeline")));
  assert.deepEqual(replay.frames.at(-1).board, ["As", "7d", "2c"]);
});

test("formats raise-to and reveal labels", () => {
  assert.equal(replayActionLabel({ player: "Hero", type: "raise", toAmount: 450 }), "Hero: raises to 450");
  assert.equal(replayActionLabel({ player: "Villain", type: "show", cards: ["Qs", "Qh"] }), "Villain: shows Qs Qh");
});
