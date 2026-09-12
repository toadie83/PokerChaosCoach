import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLocalAmounts,
  applyLocalAbsentSeats,
  applyLocalCardStates,
  applyLocalStackStates,
  applyLocalTotalPot,
  applyLocalSeatEvidence,
  changeLocalStreet,
  confirmLocalSeatStatus,
  newLocalHand,
  seedLocalBlinds,
  summarizeLocalHand,
} from "../src/vision/localHandTracker.js";
import {
  buildLocalCoachHandoff,
  localTrackingPrerequisitesReady,
  localTrackerIdentity,
  sameLocalTrackerIdentity,
  screenSeatToPosition,
} from "../src/vision/localCoachHandoff.js";
import { applyEvent, initialState } from "../src/state/machine.js";
import { buildDecisionNode, buildStackState } from "../src/state/decisionState.js";
import { heroSeatFromDealerScreenSeat, localBlindSeats, seatsForTableSize } from "../src/state/seatUtils.js";

const scenarios = JSON.parse(fs.readFileSync(
  new URL("./fixtures/local-hand-tracker/action-scenarios.json", import.meta.url),
));
const realReplay = JSON.parse(fs.readFileSync(
  new URL("./fixtures/gg-replay/local-tracker-observations.json", import.meta.url),
));

test("local OCR stays gated until Replay Vision commits Hero cards and seat", () => {
  const ready = {
    heroCards: { card1: "Ah", card2: "6d" },
    heroSeat: "BTN",
    visionUpdatedAt: 1000,
    visionRevision: 2,
  };
  assert.equal(localTrackingPrerequisitesReady(ready), true);
  assert.equal(localTrackingPrerequisitesReady(ready, { afterVisionRevision: 1 }), true);
  assert.equal(localTrackingPrerequisitesReady(ready, { afterVisionRevision: 2 }), false);
  assert.equal(localTrackingPrerequisitesReady({ ...ready, heroCards: { card1: "Ah", card2: null } }), false);
  assert.equal(localTrackingPrerequisitesReady({ ...ready, heroSeat: "" }), false);
  assert.equal(localTrackingPrerequisitesReady({ ...ready, visionUpdatedAt: 0 }), false);
});

test("dealer screen seat anchors Hero's full-ring position", () => {
  assert.equal(heroSeatFromDealerScreenSeat(0, 8), "BTN");
  assert.equal(heroSeatFromDealerScreenSeat(7, 8), "SB");
  assert.equal(heroSeatFromDealerScreenSeat(6, 8), "BB");
  assert.equal(heroSeatFromDealerScreenSeat(8, 8), null);
});

test("empty physical seats compress dealer, blind, and position mappings", () => {
  const absentSeats = [2, 5];
  assert.deepEqual(seatsForTableSize(6), ["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
  assert.equal(heroSeatFromDealerScreenSeat(1, 6, absentSeats, 8), "CO");
  assert.deepEqual(localBlindSeats("CO", 6, absentSeats, 8), { sb: 3, bb: 4 });
  assert.equal(screenSeatToPosition(3, "CO", 6, absentSeats, 8), "SB");
  assert.equal(screenSeatToPosition(2, "CO", 6, absentSeats, 8), null);
});

test("absent seats are excluded from stack completeness and action-order waits", () => {
  let hand = applyLocalAbsentSeats(newLocalHand(1, "preflop", 8), [2, 5]);
  hand = seedLocalBlinds(hand, 3, 4);
  for (const seat of [6, 7, 1]) hand = confirmLocalSeatStatus(hand, seat, "folded", 1000 + seat);
  const summary = summarizeLocalHand(hand);
  assert.deepEqual(summary.stackSnapshot.expectedSeats, [1, 3, 4, 6, 7]);
  assert.equal(summary.waitingSeats.includes(2), false);
  assert.equal(summary.waitingSeats.includes(5), false);
  assert.equal(summary.seatCount, 8, "physical crop layout remains eight seats");
});

test("a short-handed layout reaches Coach with compressed poker positions", () => {
  const absentSeats = [2, 5];
  let hand = applyLocalAbsentSeats(newLocalHand(1, "preflop", 8), absentSeats);
  hand = seedLocalBlinds(hand, 3, 4);
  hand = confirmLocalSeatStatus(hand, 6, "folded", 1006);
  hand = confirmLocalSeatStatus(hand, 7, "folded", 1007);
  const staged = buildLocalCoachHandoff(hand, {
    heroSeat: "CO",
    tableSize: 6,
    physicalSeatCount: 8,
    absentSeats,
    heroStackBehindBB: 30,
  });
  assert.equal(staged?.ready, true);
  assert.equal(staged?.payload.code, "unopened");
  assert.equal(staged?.identity.layout, "2,5");
  assert.equal(staged?.payload.liveState.tableSize, 6);
  assert.deepEqual(
    staged?.payload.liveState.strategicTableState.opponents.map((opponent) => opponent.screenSeat),
    [1, 3, 4, 6, 7],
  );
});

function buildScenario(scenario) {
  let at = 1000;
  let hand = seedLocalBlinds(newLocalHand(1, "preflop", 8), ...scenario.blinds);
  if (scenario.street && scenario.street !== "preflop") hand = changeLocalStreet(hand, scenario.street);
  for (const [seat, amountBB] of scenario.amounts) {
    hand = applyLocalAmounts(hand, [{ seat, amountBB }], at);
    at += 1000;
  }
  const observedActiveSeats = [...new Set(scenario.amounts.map(([seat]) => seat).filter((seat) => seat !== 0))];
  if (observedActiveSeats.length) {
    const observations = observedActiveSeats.map((seat) => ({ seat, cardsPresent: true }));
    hand = applyLocalCardStates(hand, observations, at);
    hand = applyLocalCardStates(hand, observations, at + 500);
    at += 1000;
  }
  for (const seat of scenario.checkedSeats || []) {
    hand = applyLocalSeatEvidence(hand, [{ seat, actionLabel: "Check", confidence: 95 }], at);
    hand = applyLocalSeatEvidence(hand, [{ seat, actionLabel: "Check", confidence: 95 }], at + 500);
    at += 1000;
  }
  for (const seat of scenario.zeroStackSeats || []) {
    hand = applyLocalStackStates(hand, [{ seat, stackBehindBB: 0 }], at);
    at += 1000;
  }
  for (const seat of scenario.confirmedFolded) {
    hand = confirmLocalSeatStatus(hand, seat, "folded", at);
    at += 1000;
  }
  return hand;
}

for (const scenario of scenarios) {
  test(`deterministic local action fixture: ${scenario.name}`, () => {
    const hand = buildScenario(scenario);
    const summary = summarizeLocalHand(hand);
    const staged = buildLocalCoachHandoff(hand, {
      heroSeat: scenario.heroSeat,
      tableSize: 8,
      anteBB: 0.15,
      heroStackBehindBB: 40,
      effectiveStackBB: 40,
    });
    assert.equal(summary.decisionType, scenario.expectedDecision);
    assert.equal(staged?.payload.code, scenario.expectedCode);
    assert.equal(staged?.ready, true);
    if (scenario.expectedCallers !== undefined) {
      assert.equal(staged.payload.liveState.callers, scenario.expectedCallers);
    }
    if (scenario.name === "Hero open") {
      assert.equal(staged.payload.liveState.heroStackBehindBB, 37.5);
      assert.equal(staged.payload.liveState.effectiveStackBB, 37.5);
    }
    assert.equal(staged.payload.liveState.source, "local_table_tracker");
    assert.ok(staged.payload.liveState.potBB > 0);
  });
}

test("six-max mappings fail closed instead of wrapping V6/V7", () => {
  assert.equal(screenSeatToPosition(6, "CO", 6), null);
  const hand = seedLocalBlinds(newLocalHand(1, "preflop", 8), 2, 3);
  assert.equal(buildLocalCoachHandoff(hand, { heroSeat: "CO", tableSize: 6 }), null);
});

test("staged identity is invalid after hand, street, seat or table-size changes", () => {
  const hand = buildScenario(scenarios.find((scenario) => scenario.name === "open"));
  const identity = localTrackerIdentity(hand, { heroSeat: "CO", tableSize: 8 });
  assert.equal(sameLocalTrackerIdentity(identity, { ...identity }), true);
  for (const changed of [
    { ...identity, trackerHandId: 2 },
    { ...identity, street: "flop" },
    { ...identity, heroSeat: "BTN" },
    { ...identity, tableSize: 6 },
  ]) assert.equal(sameLocalTrackerIdentity(identity, changed), false);
});

test("a later villain re-raise supersedes an already-recordable Hero open", () => {
  let hand = seedLocalBlinds(newLocalHand(1, "preflop", 8), 2, 3);
  hand = applyLocalAmounts(hand, [{ seat: 0, amountBB: 2.5 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 1, amountBB: 8 }], 2000);
  for (const seat of [2, 3, 4, 5, 6, 7]) {
    hand = confirmLocalSeatStatus(hand, seat, "folded", 2000 + seat);
  }
  const staged = buildLocalCoachHandoff(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 37.5,
  });
  assert.equal(staged.payload.code, "open_and_3bet_to_me");
  assert.equal(staged.payload.actorSeat, "BTN");
  assert.equal(staged.payload.openerSeat, "CO");
});

test("BTN receives a provisional CTA after UTG limps, HJ raises, and CO cards disappear", () => {
  let hand = seedLocalBlinds(newLocalHand(1, "preflop", 8), 1, 2);
  hand = applyLocalAmounts(hand, [{ seat: 3, amountBB: 1 }], 1000);
  hand = applyLocalAmounts(hand, [{ seat: 6, amountBB: 3 }], 2000);
  const cardStates = [
    { seat: 3, cardsPresent: true },
    { seat: 4, cardsPresent: false },
    { seat: 5, cardsPresent: false },
    { seat: 6, cardsPresent: true },
    { seat: 7, cardsPresent: false },
  ];
  hand = applyLocalCardStates(hand, cardStates, 3000);
  hand = applyLocalCardStates(hand, cardStates, 3500);
  const summary = summarizeLocalHand(hand);
  const staged = buildLocalCoachHandoff(hand, {
    heroSeat: "BTN",
    tableSize: 8,
    heroStackBehindBB: 72,
  });
  assert.equal(summary.lastAggressorSeat, 6);
  assert.equal(summary.heroToAct, true);
  assert.deepEqual(summary.provisionalFoldSeats, [7]);
  assert.equal(staged.ready, true);
  assert.equal(staged.provisional, true);
  assert.equal(staged.payload.code, "opened_to_me");
});

test("the latest aggressor's accepted stack reaches the Coach handoff", () => {
  let hand = seedLocalBlinds(newLocalHand(1, "preflop", 8), 2, 3);
  hand = applyLocalStackStates(hand, [{ seat: 4, stackBehindBB: 26.5 }], 500);
  hand = applyLocalAmounts(hand, [{ seat: 4, amountBB: 2.5 }], 1000);
  hand = applyLocalCardStates(hand, [{ seat: 4, cardsPresent: true }], 1500);
  hand = applyLocalCardStates(hand, [{ seat: 4, cardsPresent: true }], 1750);
  for (const seat of [5, 6, 7]) hand = confirmLocalSeatStatus(hand, seat, "folded", 1800 + seat);
  const visionDerived = buildLocalCoachHandoff(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 40,
    effectiveStackBB: 40,
  });
  assert.equal(visionDerived.ready, true, "action order is independently ready");
  assert.equal(visionDerived.stackAwareReady, true, "missing or unreconciled OCR must not withhold the CTA");
  assert.deepEqual(visionDerived.missingStackPositions, ["BTN", "SB", "BB"]);
  assert.equal(visionDerived.payload.liveState.opponentStackBehindBB, 24);
  assert.equal(visionDerived.payload.liveState.strategicTableState.opponents.find((opponent) => opponent.screenSeat === 4).stackBehindBB, 24);
  hand = applyLocalStackStates(hand, [
    { seat: 1, stackBehindBB: 30 },
    { seat: 2, stackBehindBB: 29.5 },
    { seat: 3, stackBehindBB: 29 },
    { seat: 4, stackBehindBB: 24 },
  ], 2000);
  const staged = buildLocalCoachHandoff(hand, {
    heroSeat: "CO",
    tableSize: 8,
    heroStackBehindBB: 40,
    effectiveStackBB: 40,
  });
  assert.equal(staged.stackAwareReady, true);
  assert.deepEqual(staged.missingStackPositions, []);
  assert.equal(staged.payload.liveState.opponentStackBehindBB, 24);
  assert.equal(staged.payload.liveState.effectiveStackBB, 24);
  assert.equal(staged.payload.liveState.strategicTableState.opponents.find((opponent) => opponent.screenSeat === 4).stackBehindBB, 24);
});

test("the machine applies one typed live-read receipt for pot, caller and stack state", () => {
  const state = applyEvent({
    ...initialState,
    heroSeat: "CO",
    opponentSeat: "",
    lastEventAt: 0,
  }, {
    code: "multiple_villains_opened",
    actorSeat: "UTG",
    toAmountBB: 2.5,
    callers: 1,
    liveState: {
      source: "local_table_tracker",
      trackerHandId: 9,
      street: "preflop",
      potBB: 8.7,
      calculatedPotBB: 7.5,
      displayedTotalPotBB: 8.7,
      potSource: "table_display",
      potReconciliation: {
        displayedTotalPotBB: 8.7,
        calculatedPotBB: 7.5,
        deltaBB: 1.2,
        status: "displayed_override",
      },
      amountToCallBB: 2.5,
      aggressorSeat: "UTG",
      callerSeats: ["UTG+1"],
      callers: 1,
      playersInHand: 3,
      heroStackBehindBB: 39.5,
      opponentStackBehindBB: 31,
      effectiveStackBB: 31,
    },
  });
  assert.equal(state.opponentSeat, "UTG");
  assert.equal(state.estimatedPotBB, 8.7);
  assert.equal(state.preflopCallers, 1);
  assert.equal(state.playersInHand, 3);
  assert.equal(state.liveTrackerReceipt.trackerHandId, 9);
  assert.equal(state.liveTrackerReceipt.potSource, "table_display");
  assert.equal(state.liveTrackerReceipt.displayedTotalPotBB, 8.7);
  assert.equal(state.liveTrackerReceipt.calculatedPotBB, 7.5);
  assert.equal(state.liveTrackerReceipt.potReconciliation.deltaBB, 1.2);
  assert.deepEqual(state.liveTrackerReceipt.callerSeats, ["UTG+1"]);
  assert.equal(buildDecisionNode(state).potBB, 8.7);
  assert.equal(buildDecisionNode(state).potSource, "table_display");
  assert.equal(buildStackState(state).effectiveStackBehindBB, 31);
  assert.equal(state.liveTrackerReceipt.strategicTableState, null);
});

test("a stable table Total Pot becomes the Coach decision pot without double-counting the live bet", () => {
  let hand = {
    ...newLocalHand(1, "flop", 8),
    carriedPotBB: 6.9,
  };
  hand = applyLocalAmounts(hand, [{ seat: 1, amountBB: 6 }], 1000);
  hand = applyLocalTotalPot(
    hand,
    { amountBB: 14.1, confidence: 94 },
    1000,
    { anteTotalBB: 1.2 },
  );
  hand = applyLocalCardStates(hand, [{ seat: 1, cardsPresent: true }], 1500);
  hand = applyLocalCardStates(hand, [{ seat: 1, cardsPresent: true }], 1750);
  for (const seat of [2, 3, 4, 5, 6, 7]) {
    hand = confirmLocalSeatStatus(hand, seat, "folded", 1800 + seat);
  }
  const staged = buildLocalCoachHandoff(hand, {
    heroSeat: "BTN",
    tableSize: 8,
    anteBB: 0.15,
    heroStackBehindBB: 30,
  });

  assert.equal(staged.ready, true);
  assert.equal(staged.payload.code, "faced_bet");
  assert.equal(staged.payload.liveState.potBB, 14.1);
  assert.equal(staged.payload.liveState.displayedTotalPotBB, 14.1);
  assert.equal(staged.payload.liveState.calculatedPotBB, 14.1);
  assert.equal(staged.payload.liveState.potSource, "table_display");
  assert.equal(staged.payload.liveState.amountToCallBB, 6);
});

test("unknown live stacks remain unknown instead of becoming zero", () => {
  const state = applyEvent({ ...initialState, heroSeat: "UTG", lastEventAt: 0 }, {
    code: "unopened",
    liveState: {
      source: "local_table_tracker",
      trackerHandId: 10,
      street: "preflop",
      potBB: 2.7,
      amountToCallBB: 0,
      heroStackBehindBB: null,
      opponentStackBehindBB: null,
      effectiveStackBB: null,
      callerSeats: [],
      callers: 0,
    },
  });
  assert.equal(state.stackRemainingOverrides?.hero, null);
  assert.equal(state.stackRemainingOverrides?.opponent, null);
  assert.equal(state.liveTrackerReceipt.amountToCallBB, 0);
  assert.equal(state.liveTrackerReceipt.effectiveStackBB, null);
});

test("real GG replay checks expose a provisional CTA before exact fold confirmation", () => {
  assert.equal(fs.existsSync(new URL(`./fixtures/gg-replay/${realReplay.sourceVideo}`, import.meta.url)), true);
  let hand = seedLocalBlinds(
    newLocalHand(1, "preflop", realReplay.tableSize),
    realReplay.blindScreenSeats.sb,
    realReplay.blindScreenSeats.bb,
  );
  hand = changeLocalStreet(hand, realReplay.street);
  const checks = realReplay.observations.filter((observation) => observation.actionLabel === "Check");
  for (const observation of checks) {
    const evidence = [{ seat: observation.screenSeat, actionLabel: observation.actionLabel, confidence: 95 }];
    hand = applyLocalSeatEvidence(hand, evidence, observation.replayTimeSeconds * 1000);
    hand = applyLocalSeatEvidence(hand, evidence, observation.replayTimeSeconds * 1000 + 250);
  }
  const absentCards = realReplay.confirmedFoldedScreenSeats.map((seat) => ({ seat, cardsPresent: false }));
  hand = applyLocalCardStates(hand, absentCards, 32000);
  hand = applyLocalCardStates(hand, absentCards, 32500);
  const provisionalSummary = summarizeLocalHand(hand);
  const provisionalStaged = buildLocalCoachHandoff(hand, {
    heroSeat: realReplay.heroSeat,
    tableSize: realReplay.tableSize,
    heroStackBehindBB: 43.62,
  });
  assert.equal(provisionalSummary.heroToAct, true);
  assert.equal(provisionalSummary.orderConfidence, "provisional");
  assert.deepEqual(provisionalSummary.provisionalFoldSeats, realReplay.confirmedFoldedScreenSeats);
  assert.equal(provisionalStaged.ready, true);
  assert.equal(provisionalStaged.provisional, true);
  for (const seat of realReplay.confirmedFoldedScreenSeats) {
    hand = confirmLocalSeatStatus(hand, seat, "folded", 34000);
  }
  const summary = summarizeLocalHand(hand);
  const staged = buildLocalCoachHandoff(hand, {
    heroSeat: realReplay.heroSeat,
    tableSize: realReplay.tableSize,
    heroStackBehindBB: 43.62,
  });
  assert.equal(summary.heroToAct, realReplay.expected.heroToAct);
  assert.equal(summary.orderConfidence, "confirmed");
  assert.equal(staged.provisional, false);
  assert.equal(summary.decisionType, realReplay.expected.decisionType);
  assert.equal(staged.payload.code, realReplay.expected.coachCode);
  assert.equal(staged.payload.actorSeat, screenSeatToPosition(
    realReplay.expected.latestCheckerScreenSeat,
    realReplay.heroSeat,
    realReplay.tableSize,
  ));
});
