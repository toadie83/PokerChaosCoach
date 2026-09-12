import test from "node:test";
import assert from "node:assert/strict";
import { newLocalHand, seedLocalBlinds, changeLocalStreet, applyLocalAmounts, applyLocalCardStates, applyLocalSeatEvidence, applyLocalStackStates, applyLocalTotalPot, confirmLocalSeatStatus, overrideLocalSeatStatus, localParticipatingOpponentSeats, localSeatCurrentStackBB, localSeatStackReconciled, localStackSnapshot, localStackTargetSeats, appendLocalDebug, summarizeLocalHand } from "../src/vision/localHandTracker.js";

test("local accepted amounts produce open, call, 3-bet and preserve unknown commitments", () => {
  let hand = seedLocalBlinds(newLocalHand(), 1, 2);
  for (const [i, seat, amountBB] of [[1,4,2.6],[2,0,2.6],[3,2,8]]) hand = applyLocalAmounts(hand, [{seat,amountBB}], i*1000);
  assert.match(hand.events[0].text, /open candidate/);
  assert.match(hand.events[1].text, /call candidate/);
  assert.match(hand.events[2].text, /3-bet candidate/);
  hand = applyLocalAmounts(hand, [{seat:2,amountBB:null}], 4000);
  assert.equal(hand.committed[2], 8);
  assert.equal(hand.events.length, 3);
});
test("simultaneous amounts withhold action order and repeated reads add no events", () => {
  let hand = seedLocalBlinds(newLocalHand(),1,2);
  hand = applyLocalAmounts(hand,[{seat:0,amountBB:3},{seat:4,amountBB:3}],1000);
  assert.ok(hand.events.every(e=>e.text.includes("contribution observed")));
  const repeated = applyLocalAmounts(hand,[{seat:0,amountBB:3}],2000);
  assert.equal(repeated.events.length,2);
});

test("an ambiguous first batch does not suppress later single-seat aggression", () => {
  let hand = seedLocalBlinds(newLocalHand(), 1, 2);
  hand = applyLocalAmounts(hand, [{ seat: 4, amountBB: 2 }, { seat: 0, amountBB: 2 }], 1000);
  assert.equal(hand.uncertain, true);
  hand = applyLocalAmounts(hand, [{ seat: 2, amountBB: 6 }], 2000);
  assert.match(hand.events.at(-1).text, /3-bet candidate/);
});
test("decreasing OCR reads are rejected without poisoning the current action order", () => {
  let hand = applyLocalAmounts(newLocalHand(),[{seat:0,amountBB:5}],1000);
  hand = applyLocalAmounts(hand,[{seat:0,amountBB:1}],2000);
  assert.equal(hand.pendingReset,false);
  assert.equal(hand.committed[0],5);
  assert.equal(hand.events.at(-1).reason,"contribution_decrease");
  hand = applyLocalAmounts(hand,[{seat:0,amountBB:8}],3000);
  assert.equal(hand.committed[0],8);
  hand = changeLocalStreet(hand,"flop");
  assert.equal(hand.pendingReset,false);
  assert.deepEqual(hand.committed,{});
  assert.ok(hand.events.length>0);
  assert.equal(newLocalHand(hand.id+1).events.length,0);
});
test("normal tracking stores no debug history; debug is bounded by count and age", () => {
  assert.deepEqual(appendLocalDebug([{capturedAt:1}],{capturedAt:2},false),[]);
  let buffer=[];
  for(let i=0;i<20;i++) buffer=appendLocalDebug(buffer,{capturedAt:i*500},true);
  assert.equal(buffer.length,8);
  assert.deepEqual(appendLocalDebug(buffer,{capturedAt:40000},true),[{capturedAt:40000}]);
});
test("current-hand events stay bounded", () => {
  let hand = newLocalHand();
  for(let i=1;i<=200;i++) hand=applyLocalAmounts(hand,[{seat:0,amountBB:i}],i*1000);
  assert.equal(hand.events.length,100);
});

test("hand summary derives Hero's call amount and last aggressor", () => {
  let hand = seedLocalBlinds(newLocalHand(), 1, 2);
  hand = applyLocalAmounts(hand, [{ seat: 4, amountBB: 2.5 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 0, amountBB: 2.5 }], 2000);
  hand = applyLocalAmounts(hand, [{ seat: 2, amountBB: 7.5 }], 3000);
  const summary = summarizeLocalHand(hand);
  assert.equal(summary.highestBB, 7.5);
  assert.equal(summary.heroCommittedBB, 2.5);
  assert.equal(summary.amountToCallBB, 5);
  assert.equal(summary.lastAggressorSeat, 2);
  assert.equal(summary.contributors, 4);
  assert.equal(summary.uncertain, false);
});

test("a stable postflop Total Pot overrides and reconciles the contribution ledger", () => {
  let hand = {
    ...newLocalHand(1, "flop", 8),
    carriedPotBB: 6.9,
  };
  hand = applyLocalAmounts(hand, [{ seat: 3, amountBB: 6 }], 1000);
  hand = applyLocalTotalPot(
    hand,
    { amountBB: 14.1, confidence: 94 },
    1000,
    { anteTotalBB: 1.2 },
  );
  const summary = summarizeLocalHand(hand);

  assert.equal(summary.calculatedPotBB, 12.9);
  assert.equal(summary.displayedTotalPotBB, 14.1);
  assert.equal(summary.potBB, 14.1);
  assert.equal(summary.potSource, "table_display");
  assert.equal(summary.potReconciliation.calculatedPotBB, 14.1);
  assert.equal(summary.potReconciliation.status, "confirmed");
});

test("Total Pot disagreements override the ledger but decreases fail closed", () => {
  let hand = {
    ...newLocalHand(1, "turn", 8),
    carriedPotBB: 6.9,
  };
  hand = applyLocalAmounts(hand, [{ seat: 3, amountBB: 5 }], 1000);
  hand = applyLocalTotalPot(
    hand,
    { amountBB: 14.1, confidence: 92 },
    1000,
    { anteTotalBB: 1.2 },
  );
  assert.equal(hand.potReconciliation.status, "displayed_override");
  assert.equal(hand.potReconciliation.deltaBB, 1);

  const rejected = applyLocalTotalPot(
    hand,
    { amountBB: 8.1, confidence: 95 },
    1500,
    { anteTotalBB: 1.2 },
  );
  assert.equal(rejected.displayedTotalPotBB, 14.1);
  assert.equal(rejected.lastRejectedTotalPot.reason, "total_pot_decreased_during_hand");
});

test("Total Pot OCR is ignored preflop", () => {
  const hand = applyLocalTotalPot(
    newLocalHand(1, "preflop", 8),
    { amountBB: 2.7, confidence: 95 },
    1000,
    { anteTotalBB: 1.2 },
  );
  assert.equal(hand.displayedTotalPotBB, null);
});

test("card presence needs two matching reads before changing seat status", () => {
  let hand = newLocalHand();
  hand = applyLocalCardStates(hand, [{ seat: 4, cardsPresent: true }], 1000);
  assert.equal(hand.seatStatus[4], undefined);
  hand = applyLocalCardStates(hand, [{ seat: 4, cardsPresent: true }], 1500);
  assert.equal(hand.seatStatus[4], "active");
  hand = applyLocalCardStates(hand, [{ seat: 4, cardsPresent: false }], 2000);
  assert.equal(hand.seatStatus[4], "active");
  hand = applyLocalCardStates(hand, [{ seat: 4, cardsPresent: false }], 2500);
  assert.equal(hand.seatStatus[4], "folded_candidate");
  assert.equal(hand.seats[4].status, "folded_candidate");
  assert.equal(hand.seats[4].occupied, true);
});

test("the current hand exposes one seat ledger for contributions and status", () => {
  let hand = seedLocalBlinds(newLocalHand(), 1, 2);
  hand = applyLocalAmounts(hand, [{ seat: 4, amountBB: 2.5 }], 1000);
  assert.equal(hand.seats[4].committedBB, 2.5);
  assert.equal(hand.seats[2].committedBB, 1);
  assert.equal(hand.seats[0].status, "active");
});

test("repeat-validated fold candidates permit a provisional CTA; confirmation removes the warning", () => {
  let hand = seedLocalBlinds(newLocalHand(), 7, 2);
  hand = applyLocalAmounts(hand, [{ seat: 5, amountBB: 2 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 6, amountBB: 2 }], 2000);
  hand = applyLocalCardStates(hand, [{ seat: 6, cardsPresent: true }, { seat: 7, cardsPresent: false }], 3000);
  assert.equal(summarizeLocalHand(hand).heroToAct, false, "one absent-card sample remains unknown");
  hand = applyLocalCardStates(hand, [{ seat: 6, cardsPresent: true }, { seat: 7, cardsPresent: false }], 3500);
  let summary = summarizeLocalHand(hand);
  assert.equal(summary.heroToAct, true);
  assert.equal(summary.orderConfidence, "provisional");
  assert.deepEqual(summary.provisionalFoldSeats, [7]);
  assert.deepEqual(summary.waitingSeats, []);
  hand = confirmLocalSeatStatus(hand, 7, "folded", 4000);
  summary = summarizeLocalHand(hand);
  assert.equal(summary.lastAggressorSeat, 5);
  assert.equal(summary.heroToAct, true);
  assert.equal(summary.orderConfidence, "confirmed");
  assert.deepEqual(summary.provisionalFoldSeats, []);
  assert.deepEqual(summary.waitingSeats, []);
});

test("unresolved simultaneous aggression fails closed while decreasing reads are rejected", () => {
  let hand = seedLocalBlinds(newLocalHand(), 7, 2);
  hand = applyLocalAmounts(hand, [{ seat: 5, amountBB: 2 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 6, amountBB: 6 }, { seat: 7, amountBB: 6 }], 2000);
  hand = applyLocalCardStates(hand, [{ seat: 6, cardsPresent: true }, { seat: 7, cardsPresent: true }], 3000);
  hand = applyLocalCardStates(hand, [{ seat: 6, cardsPresent: true }, { seat: 7, cardsPresent: true }], 3500);
  assert.equal(summarizeLocalHand(hand).heroToAct, false);
  assert.equal(summarizeLocalHand(hand).actionOrderKnown, false);

  hand = changeLocalStreet(hand, "flop");
  hand = applyLocalAmounts(hand, [{ seat: 5, amountBB: 4 }], 5000);
  hand = applyLocalAmounts(hand, [{ seat: 5, amountBB: 1 }], 6000);
  assert.equal(hand.pendingReset, false);
  assert.equal(hand.committed[5], 4);
  assert.equal(summarizeLocalHand(hand).heroToAct, false);
});

test("simultaneous calls after a known raise do not suppress Hero's decision", () => {
  let hand = seedLocalBlinds(newLocalHand(), 4, 5);
  hand = applyLocalAmounts(hand, [{ seat: 0, amountBB: 2.1 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 1, amountBB: 6 }], 2000);
  hand = applyLocalAmounts(hand, [{ seat: 2, amountBB: 6 }, { seat: 3, amountBB: 6 }], 3000);
  hand = applyLocalCardStates(hand, [{ seat: 2, cardsPresent: true }, { seat: 3, cardsPresent: true }], 3100);
  hand = applyLocalCardStates(hand, [{ seat: 2, cardsPresent: true }, { seat: 3, cardsPresent: true }], 3200);
  for (const seat of [4, 5, 6, 7]) hand = confirmLocalSeatStatus(hand, seat, "folded", 3500 + seat);

  const summary = summarizeLocalHand(hand);
  assert.equal(summary.lastAggressorSeat, 1);
  assert.equal(summary.actionOrderKnown, true);
  assert.equal(summary.heroToAct, true);
  assert.equal(summary.amountToCallBB, 3.9);
  assert.equal(summary.orderBlockedReason, null);
});

test("a manual player-status toggle can resolve or restore a missed fold", () => {
  let hand = seedLocalBlinds(newLocalHand(), 4, 5);
  hand = applyLocalAmounts(hand, [{ seat: 1, amountBB: 6 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 2, amountBB: 6 }], 2000);
  hand = applyLocalCardStates(hand, [{ seat: 2, cardsPresent: true }, { seat: 3, cardsPresent: true }], 2100);
  hand = applyLocalCardStates(hand, [{ seat: 2, cardsPresent: true }, { seat: 3, cardsPresent: true }], 2200);
  for (const seat of [4, 5, 6, 7]) hand = confirmLocalSeatStatus(hand, seat, "folded", 2300 + seat);
  assert.deepEqual(summarizeLocalHand(hand).waitingSeats, [3]);

  hand = overrideLocalSeatStatus(hand, 3, "folded", 3000);
  assert.equal(summarizeLocalHand(hand).heroToAct, true);
  assert.equal(hand.events.at(-1).source, "manual_override");

  hand = overrideLocalSeatStatus(hand, 3, "active", 3100);
  assert.equal(summarizeLocalHand(hand).heroToAct, false);
  assert.deepEqual(summarizeLocalHand(hand).waitingSeats, [3]);
});

test("action labels and zero-stack reads need validated evidence before terminal status", () => {
  let hand = seedLocalBlinds(newLocalHand(), 7, 2);
  hand = applyLocalSeatEvidence(hand, [{ seat: 6, actionLabel: "Fold", confidence: 94 }], 1000);
  assert.notEqual(hand.seats[6].status, "folded");
  hand = applyLocalSeatEvidence(hand, [{ seat: 6, actionLabel: "Fold", confidence: 94 }], 1500);
  assert.equal(hand.seats[6].status, "folded");
  hand = applyLocalAmounts(hand, [{ seat: 7, amountBB: 1 }], 2000);
  hand = applyLocalStackStates(hand, [{ seat: 7, stackBehindBB: null }], 2250);
  assert.notEqual(hand.seats[7].status, "all_in");
  hand = applyLocalStackStates(hand, [{ seat: 7, stackBehindBB: 0 }], 2500);
  assert.equal(hand.seats[7].status, "all_in");
  assert.equal(hand.events.at(-1).source, "stack_ocr");
});

test("events expose structured action data rather than requiring label parsing", () => {
  let hand = seedLocalBlinds(newLocalHand(), 7, 2);
  hand = applyLocalAmounts(hand, [{ seat: 5, amountBB: 2.5 }], 1000);
  assert.deepEqual(
    Object.fromEntries(["type", "action", "aggressive", "seat", "toBB", "source"].map((key) => [key, hand.events[0][key]])),
    { type: "action", action: "open", aggressive: true, seat: 5, toBB: 2.5, source: "bet_ocr" },
  );
});

test("stack OCR is disabled preflop and targets relevant stacks from the flop onward", () => {
  let hand = seedLocalBlinds(newLocalHand(), 1, 2);
  hand = applyLocalCardStates(hand, [
    { seat: 3, cardsPresent: true },
    { seat: 4, cardsPresent: false },
  ], 1000);
  hand = applyLocalCardStates(hand, [
    { seat: 3, cardsPresent: true },
    { seat: 4, cardsPresent: false },
  ], 1500);
  hand = applyLocalAmounts(hand, [{ seat: 5, amountBB: 2.5 }], 2000);
  hand = confirmLocalSeatStatus(hand, 2, "folded", 2500);
  assert.deepEqual(localStackTargetSeats(hand), []);
  assert.deepEqual(localParticipatingOpponentSeats(hand), [1, 5]);
  assert.equal(hand.handCommitted[5], 2.5);
  hand = applyLocalStackStates(hand, [
    { seat: 1, stackBehindBB: 20, confidence: 92 },
    { seat: 2, stackBehindBB: 31, confidence: 91 },
    { seat: 3, stackBehindBB: 14, confidence: 90 },
    { seat: 4, stackBehindBB: 42, confidence: 89 },
    { seat: 5, stackBehindBB: 37.5, confidence: 93 },
    { seat: 6, stackBehindBB: 27, confidence: 88 },
    { seat: 7, stackBehindBB: 55, confidence: 94 },
  ], 3000);
  assert.equal(localStackSnapshot(hand).complete, true);
  assert.equal(hand.seats[5].startingStackBB, 40);
  assert.deepEqual(localStackTargetSeats(hand), []);
  hand = changeLocalStreet(hand, "flop");
  assert.deepEqual(localStackTargetSeats(hand), [1, 5]);
  assert.equal(hand.handCommitted[5], 2.5);
});

test("stack reconciliation rejects impossible jumps and accepts bet-matched decreases", () => {
  let hand = seedLocalBlinds(newLocalHand(), 1, 2);
  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 30, confidence: 90 }], 1000);
  assert.equal(hand.seats[3].startingStackBB, 30);
  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 39, confidence: 95 }], 1500);
  assert.equal(hand.seats[3].stackBehindBB, 30);
  assert.equal(hand.seats[3].lastRejectedStack.reason, "stack_increased_during_hand");
  hand = applyLocalAmounts(hand, [{ seat: 3, amountBB: 2.5 }], 2000);
  assert.equal(localSeatStackReconciled(hand, 3), false, "the accepted pre-bet stack is stale until OCR catches up");
  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 27.5, confidence: 94 }], 2250);
  assert.equal(hand.seats[3].stackBehindBB, 27.5);
  assert.equal(hand.seats[3].lastRejectedStack, null);
  assert.equal(localSeatStackReconciled(hand, 3), true);
});

test("Replay Vision opening stacks remain authoritative when postflop OCR validates them", () => {
  let hand = seedLocalBlinds(newLocalHand(), 2, 3);
  hand = applyLocalStackStates(hand, [{
    seat: 3,
    stackBehindBB: 29,
    confidence: "high",
    source: "replay_vision",
  }], 1000);
  assert.equal(hand.seats[3].startingStackBB, 30);
  assert.equal(hand.seats[3].openingStackSource, "replay_vision");
  assert.equal(hand.seats[3].stackLocallyConfirmed, false);

  hand = changeLocalStreet(hand, "flop");
  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 39, confidence: 94 }], 1500);
  assert.equal(hand.seats[3].stackBehindBB, 29);
  assert.equal(hand.seats[3].startingStackBB, 30);
  assert.equal(hand.seats[3].lastRejectedStack.reason, "stack_increased_during_hand");

  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 29, confidence: 94 }], 1750);
  assert.equal(hand.seats[3].openingStackSource, "replay_vision");
  assert.equal(hand.seats[3].stackLocallyConfirmed, true);

  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 49, confidence: 95 }], 2000);
  assert.equal(hand.seats[3].stackBehindBB, 29, "an impossible jump cannot replace the Vision opening ledger");
});

test("Replay Vision opening stacks deterministically decrease with preflop contributions", () => {
  let hand = seedLocalBlinds(newLocalHand(), 4, 5);
  hand = applyLocalStackStates(hand, [{
    seat: 1,
    stackBehindBB: 24.9,
    confidence: "high",
    source: "replay_vision",
  }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 1, amountBB: 6 }], 2000);

  assert.equal(hand.seats[1].startingStackBB, 24.9);
  assert.equal(localSeatCurrentStackBB(hand, 1), 18.9);
  assert.equal(localStackTargetSeats(hand).length, 0);
});
