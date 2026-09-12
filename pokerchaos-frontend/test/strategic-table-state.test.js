import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalAmounts, applyLocalCardStates, applyLocalSeatEvidence, applyLocalStackStates, changeLocalStreet, confirmLocalSeatStatus, newLocalHand, seedLocalBlinds } from "../src/vision/localHandTracker.js";
import { buildStrategicTableState } from "../src/vision/strategicTableState.js";
import { applyEvent, initialState, summarizeForAI } from "../src/state/machine.js";

test("strategic stack state distinguishes reshove and retaliation risk behind Hero", () => {
  let hand = seedLocalBlinds(newLocalHand(1, "preflop", 8), 2, 3);
  hand = applyLocalStackStates(hand, [
    { seat: 1, stackBehindBB: 44, confidence: 94 },
    { seat: 2, stackBehindBB: 7.5, confidence: 92 },
    { seat: 3, stackBehindBB: 29, confidence: 93 },
    { seat: 4, stackBehindBB: 22, confidence: 90 },
    { seat: 5, stackBehindBB: 35, confidence: 91 },
    { seat: 6, stackBehindBB: 60, confidence: 95 },
    { seat: 7, stackBehindBB: 18, confidence: 89 },
  ], 1000);
  hand = applyLocalCardStates(hand, [1, 2, 3].map((seat) => ({ seat, cardsPresent: true })), 1100);
  hand = applyLocalCardStates(hand, [1, 2, 3].map((seat) => ({ seat, cardsPresent: true })), 1200);
  for (const seat of [4, 5, 6, 7]) hand = confirmLocalSeatStatus(hand, seat, "folded", 1200 + seat);
  const strategic = buildStrategicTableState(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 50,
    tournamentStage: "bubble_pressure",
  });
  assert.equal(strategic.features.stackSnapshotComplete, true);
  assert.deepEqual(strategic.features.playersYetToAct, ["BTN", "SB", "BB"]);
  assert.deepEqual(strategic.features.reshoveStacksBehind, ["SB"]);
  assert.deepEqual(strategic.features.retaliatingStacksBehind, ["BTN", "BB"]);
  assert.equal(strategic.hero.tableStackRank, 2);
  assert.equal(strategic.features.icmPressure, "stage_only_unquantified");
  assert.ok(strategic.limitations.includes("payouts_and_field_state_required_for_actual_icm"));
});

test("postflop order distinguishes players yet to act from every player who can respond", () => {
  let hand = seedLocalBlinds(newLocalHand(3, "preflop", 8), 2, 3);
  hand = applyLocalStackStates(hand, [
    { seat: 1, stackBehindBB: 40, confidence: 94 },
    { seat: 2, stackBehindBB: 39.5, confidence: 94 },
    { seat: 3, stackBehindBB: 39, confidence: 94 },
    { seat: 4, stackBehindBB: 30, confidence: 90 },
    { seat: 5, stackBehindBB: 30, confidence: 90 },
    { seat: 6, stackBehindBB: 30, confidence: 90 },
    { seat: 7, stackBehindBB: 30, confidence: 90 },
  ], 1000);
  for (const [at, seat] of [[2000, 0], [3000, 1], [4000, 2], [5000, 3]]) {
    hand = applyLocalAmounts(hand, [{ seat, amountBB: 2.5 }], at);
  }
  hand = applyLocalStackStates(hand, [
    { seat: 1, stackBehindBB: 37.5, confidence: 93 },
    { seat: 2, stackBehindBB: 37.5, confidence: 93 },
    { seat: 3, stackBehindBB: 37.5, confidence: 93 },
  ], 5500);
  hand = applyLocalCardStates(hand, [1, 2, 3].map((seat) => ({ seat, cardsPresent: true })), 5600);
  hand = applyLocalCardStates(hand, [1, 2, 3].map((seat) => ({ seat, cardsPresent: true })), 5700);
  for (const seat of [4, 5, 6, 7]) hand = confirmLocalSeatStatus(hand, seat, "folded", 5700 + seat);
  hand = changeLocalStreet(hand, "flop");
  hand = applyLocalSeatEvidence(hand, [{ seat: 2, actionLabel: "check", confidence: 95 }], 6000);
  hand = applyLocalSeatEvidence(hand, [{ seat: 2, actionLabel: "check", confidence: 95 }], 6100);
  hand = applyLocalAmounts(hand, [{ seat: 3, amountBB: 5 }], 7000);
  const ledgerDerivedState = buildStrategicTableState(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 37.5,
  });
  assert.equal(ledgerDerivedState.features.relevantStackEvidenceComplete, true);
  assert.equal(ledgerDerivedState.features.readyForStackAwareDecision, true);
  assert.deepEqual(ledgerDerivedState.features.missingRelevantOpponentStacks, []);
  assert.equal(ledgerDerivedState.opponents.find((opponent) => opponent.position === "BB").stackBehindBB, 32.5);
  hand = applyLocalStackStates(hand, [{ seat: 3, stackBehindBB: 32.5, confidence: 95 }], 7100);

  const strategic = buildStrategicTableState(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 37.5,
  });
  assert.equal(strategic.decision.heroToAct, true);
  assert.equal(strategic.features.relevantStackEvidenceComplete, true);
  assert.equal(strategic.features.readyForStackAwareDecision, true);
  assert.deepEqual(strategic.features.playersYetToAct, ["BTN", "SB"]);
  assert.deepEqual(strategic.features.playersWhoCanRespond, ["BTN", "SB", "BB"]);
  assert.equal(strategic.decision.potBB, 15);
  assert.equal(strategic.decision.amountToCallBB, 5);
  assert.equal(strategic.decision.callPotOddsPct, 25);
  const bigBlind = strategic.opponents.find((opponent) => opponent.position === "BB");
  assert.equal(bigBlind.isAggressor, true);
  assert.equal(bigBlind.effectiveStackBB, 32.5);
  assert.equal(bigBlind.postCallEffectiveStackBB, 32.5);
  assert.equal(bigBlind.postCallSPR, 1.63);
  assert.equal(bigBlind.postCallSprBand, "medium");
  assert.ok(!strategic.limitations.includes("postflop_players_yet_to_act_not_derived"));
});

test("incomplete stack evidence stays explicit and lowers confidence", () => {
  let hand = seedLocalBlinds(newLocalHand(2, "preflop", 8), 2, 3);
  hand = applyLocalStackStates(hand, [{ seat: 1, stackBehindBB: 20, confidence: 90 }], 1000);
  const strategic = buildStrategicTableState(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 40,
  });
  assert.equal(strategic.features.stackSnapshotComplete, false);
  assert.equal(strategic.hero.tableStackRank, null);
  assert.equal(strategic.confidence, "low");
  assert.ok(strategic.limitations.includes("full_table_stack_snapshot_incomplete"));
});

test("an explicitly applied live read carries strategic stack features into the Coach payload", () => {
  const strategicTableState = {
    source: "local_table_tracker",
    trackerHandId: 4,
    confidence: "high",
    features: { reshoveStacksBehind: ["SB"] },
  };
  const state = applyEvent({ ...initialState, heroSeat: "CO", lastEventAt: 0 }, {
    code: "unopened",
    liveState: {
      source: "local_table_tracker",
      trackerHandId: 4,
      street: "preflop",
      potBB: 2.5,
      strategicTableState,
    },
  });
  assert.deepEqual(summarizeForAI(state).context.strategicTableState, strategicTableState);
});
