import assert from "node:assert/strict";
import test from "node:test";

import { compactHandForApi, parseHandHistory } from "../src/handHistoryService.js";

const history = `Poker Hand #TM9001: Tournament #T900, Hold'em No Limit - Level1 (50/100) - 2026/09/16 20:00:00
Table 'Replay' 2-max Seat #2 is the button
Seat 1: Hero (1000 in chips)
Seat 2: Villain (1000 in chips)
Hero: posts small blind 50
Villain: posts big blind 100
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Hero: raises 250 to 300
Villain: calls 200
*** FLOP *** [As 7d 2c]
Villain: checks
Hero: bets 400
Villain: folds
Uncalled bet (400) returned to Hero
Hero collected 600 from pot
*** SUMMARY ***
Total pot 600 | Rake 0`;

test("parses a replay timeline in original hand-history order", () => {
  const [hand] = parseHandHistory(history, { heroName: "Hero" });
  assert.ok(hand);
  assert.deepEqual(
    hand.replayEvents.map((event) => event.type),
    [
      "post_small_blind",
      "post_big_blind",
      "raise",
      "call",
      "street",
      "check",
      "bet",
      "fold",
      "return_uncalled",
      "collect",
    ],
  );
  assert.deepEqual(hand.replayEvents[4], {
    type: "street",
    street: "flop",
    cards: ["As", "7d", "2c"],
  });
});

test("keeps table geometry and replay events in the compact API hand", () => {
  const [hand] = parseHandHistory(history, { heroName: "Hero" });
  const compact = compactHandForApi(hand);

  assert.equal(compact.heroSeat, 1);
  assert.equal(compact.table.buttonSeat, 2);
  assert.equal(compact.replayEvents.length, 10);
});
