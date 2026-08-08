import assert from "node:assert/strict";
import test from "node:test";

import {
  applyEvent,
  getAvailableActions,
  initialState,
  summarizeForAI,
} from "../src/state/machine.js";
import {
  assumedHeroEventFromRecommendation,
  buildDecisionNode,
  buildStackState,
  deriveRelativePosition,
  reopenAssumedFoldForVision,
} from "../src/state/decisionState.js";

function freshState(overrides = {}) {
  return {
    ...initialState,
    heroCards: { card1: "As", card2: "5s" },
    ...overrides,
    lastEventAt: 0,
  };
}

function step(state, event) {
  return applyEvent({ ...state, lastEventAt: 0 }, event);
}

test("derives heads-up postflop position from exact seats", () => {
  assert.equal(
    deriveRelativePosition(
      freshState({ street: "flop", heroSeat: "BB", opponentSeat: "BTN" }),
    ),
    "oop",
  );
  assert.equal(
    deriveRelativePosition(
      freshState({ street: "flop", heroSeat: "BTN", opponentSeat: "BB" }),
    ),
    "ip",
  );
  assert.equal(
    deriveRelativePosition(
      freshState({
        street: "flop",
        heroSeat: "BTN",
        opponentSeat: "BB",
        playersInHand: 3,
      }),
    ),
    "unknown",
  );
});

test("automatically records the recommended Hero action for MVP", () => {
  let state = freshState({ heroSeat: "BTN", opponentSeat: "BB" });
  state = step(state, "unopened");
  assert.deepEqual(state.legalActions, ["fold", "open", "jam"]);
  assert.equal(state.history.length, 0);

  const recommendation = {
    hero_action: "open",
    sizing: "2.2 BB",
    sizing_bb: 2.2,
    confidence: "high",
  };
  const assumedEvent = assumedHeroEventFromRecommendation(recommendation, state);
  assert.equal(assumedEvent.code, "hero_open");
  assert.equal(assumedEvent.assumed, true);
  state = step(state, assumedEvent);
  assert.equal(state.history.at(-1).actor, "hero");
  assert.equal(state.history.at(-1).action, "open");
  assert.equal(state.history.at(-1).toAmountBB, 2.2);
  assert.equal(state.history.at(-1).note, "Coach line assumed");
  assert.equal(state.lastComparison, null);
  assert.equal(state.nextActor, "opp");
  assert.equal(state.lastEventAssumed, true);
});

test("assumed recommendation sizes a multiplier against the facing action", () => {
  const state = freshState({
    heroSeat: "CO",
    opponentSeat: "BTN",
    decisionKind: "facing_open",
    legalActions: ["fold", "call", "3-bet", "jam"],
    facingAction: { type: "open", toAmountBB: 2.5, callAmountBB: 2.5 },
    history: [
      { street: "preflop", actor: "opp", action: "open", toAmountBB: 2.5 },
    ],
  });
  const event = assumedHeroEventFromRecommendation(
    { hero_action: "3-bet", sizing: "3.5x" },
    state,
  );
  assert.equal(event.toAmountBB, 8.75);
  assert.equal(
    assumedHeroEventFromRecommendation({ hero_action: "check" }, state),
    null,
  );
});

test("a later board replaces an assumed fold with the continuing alternative", () => {
  let state = freshState({
    heroSeat: "BB",
    opponentSeat: "BTN",
    decisionKind: "facing_open",
    legalActions: ["fold", "call", "3-bet", "jam"],
    facingAction: {
      type: "open",
      toAmountBB: 2.2,
      callAmountBB: 1.2,
    },
  });
  const recommendation = {
    hero_action: "fold",
    alternative_action: "call",
    confidence: "medium",
  };
  state = step(
    state,
    assumedHeroEventFromRecommendation(recommendation, state),
  );
  assert.equal(state.handComplete, true);
  assert.equal(state.history.at(-1).action, "fold");

  state = reopenAssumedFoldForVision(state);
  assert.equal(state.handComplete, false);
  assert.equal(state.nextActor, "await_street");
  assert.equal(state.history.at(-1).action, "call");
  assert.equal(state.history.at(-1).amountBB, 1.2);
  assert.equal(state.history.at(-1).toAmountBB, 2.2);
  assert.equal(state.history.at(-1).note, "Coach alternative inferred from replay");
  assert.ok(state.previousActions.includes("preflop_hero_call"));
  assert.equal(state.previousActions.includes("preflop_hero_fold"), false);
  assert.equal(state.previousActions.includes("hand_complete"), false);
});

test("opponent raise creates a new legal Hero decision", () => {
  let state = freshState({
    heroSeat: "CO",
    opponentSeat: "BTN",
    nextActor: "opp",
    history: [{ street: "preflop", actor: "hero", action: "open", at: 1 }],
  });
  state = step(state, { code: "opp_raise", toAmountBB: 8, amountBB: 8 });
  assert.equal(state.decisionKind, "facing_3bet");
  assert.deepEqual(state.legalActions, ["fold", "call", "4-bet", "jam"]);
  assert.equal(state.facingAction.toAmountBB, 8);
  assert.equal(state.history.at(-1).action, "3-bet");
  assert.equal(state.nextActor, "hero");
});

test("call amount subtracts Hero's existing preflop commitment", () => {
  let state = freshState({
    heroSeat: "CO",
    opponentSeat: "BTN",
  });
  state = step(state, "unopened");
  state = step(state, { code: "hero_open", amountBB: 2.5, toAmountBB: 2.5 });
  state = step(state, { code: "opp_raise", amountBB: 8, toAmountBB: 8 });

  const decision = buildDecisionNode(state);
  assert.equal(decision.heroCommittedBB, 2.5);
  assert.equal(decision.opponentCommittedBB, 8);
  assert.equal(decision.facingAction.callAmountBB, 5.5);
  assert.equal(decision.minimumRaiseToBB, 13.5);
  assert.equal(decision.potOddsPct, 31.4);
  assert.equal(state.estimatedPotBB, 12);
});

test("blind commitments are included in calls and pot estimates", () => {
  let state = freshState({
    heroSeat: "BB",
    opponentSeat: "BTN",
  });
  state = step(state, { code: "opened_to_me", amountBB: 2.5, toAmountBB: 2.5 });
  assert.equal(buildDecisionNode(state).facingAction.callAmountBB, 1.5);

  state = step(state, { code: "hero_call" });
  assert.equal(state.history.at(-1).amountBB, 1.5);
  assert.equal(state.history.at(-1).toAmountBB, 2.5);
  assert.equal(state.estimatedPotBB, 5.5);
});

test("preflop pot baseline includes antes", () => {
  const state = freshState({
    street: "preflop",
    tableSize: 8,
    anteBB: 0.125,
    estimatedPotBB: null,
  });
  assert.equal(buildDecisionNode(state).potBB, 2.5);
});

test("postflop opponent options follow Hero's check", () => {
  let state = freshState({
    street: "flop",
    heroSeat: "BB",
    opponentSeat: "BTN",
    nextActor: "hero_actual",
    decisionKind: "postflop_open",
    legalActions: ["check", "bet", "jam"],
  });
  state = step(state, { code: "hero_check" });
  assert.equal(state.nextActor, "opp");
  const responseCodes = getAvailableActions(state, true).map((action) => action.code);
  assert.deepEqual(responseCodes, ["opp_check_back", "opp_bet", "opp_shove"]);

  state = step(state, { code: "opp_bet", amountBB: 3, toAmountBB: 3 });
  assert.equal(state.decisionKind, "facing_bet");
  assert.deepEqual(state.legalActions, ["fold", "call", "raise", "jam"]);
  assert.equal(buildDecisionNode(state).facingAction.callAmountBB, 3);
});

test("an in-position check or heads-up call closes the street", () => {
  let checkState = freshState({
    street: "turn",
    heroSeat: "BTN",
    opponentSeat: "BB",
    nextActor: "hero_actual",
    decisionKind: "checked_to_hero",
    legalActions: ["check", "bet", "jam"],
  });
  checkState = step(checkState, { code: "hero_check" });
  assert.equal(checkState.nextActor, "await_street");

  let callState = freshState({
    street: "turn",
    heroSeat: "BB",
    opponentSeat: "BTN",
    nextActor: "hero_actual",
    decisionKind: "facing_bet",
    legalActions: ["fold", "call", "raise", "jam"],
    facingAction: { type: "bet", amountBB: 4, toAmountBB: 4, callAmountBB: 4 },
    history: [
      { street: "turn", actor: "opp", action: "bet", amountBB: 4, toAmountBB: 4 },
    ],
  });
  callState = step(callState, { code: "hero_call" });
  assert.equal(callState.nextActor, "await_street");
});

test("preflop opponent re-raise options distinguish 3-bets and 4-bets", () => {
  let state = freshState({
    heroSeat: "CO",
    opponentSeat: "BTN",
    nextActor: "hero_actual",
    decisionKind: "facing_open",
    legalActions: ["fold", "call", "3-bet", "jam"],
    facingAction: { type: "open", toAmountBB: 2.5, callAmountBB: 2.5 },
    history: [
      { street: "preflop", actor: "opp", action: "open", toAmountBB: 2.5 },
    ],
  });
  state = step(state, { code: "hero_3bet", amountBB: 8, toAmountBB: 8 });
  const responseCodes = getAvailableActions(state, true).map((action) => action.code);
  assert.ok(responseCodes.includes("opp_4bet"));
  assert.equal(responseCodes.includes("opp_raise"), false);

  state = step(state, { code: "opp_4bet", amountBB: 20, toAmountBB: 20 });
  assert.equal(state.decisionKind, "facing_4bet");
  assert.equal(buildDecisionNode(state).facingAction.callAmountBB, 12);
});

test("direct all-in situations expose only fold and call", () => {
  let state = freshState({
    street: "river",
    heroSeat: "BB",
    opponentSeat: "BTN",
    villainStackBB: 24,
  });
  state = step(state, { code: "faced_allin", amountBB: 24, toAmountBB: 24 });
  assert.equal(state.decisionKind, "facing_allin");
  assert.deepEqual(state.legalActions, ["fold", "call"]);
});

test("Hero fold is terminal and remains distinct from recommendation", () => {
  const recommendation = { hero_action: "call", confidence: "medium" };
  let state = freshState({
    street: "flop",
    heroSeat: "BB",
    opponentSeat: "BTN",
    nextActor: "hero_actual",
    decisionKind: "facing_bet",
    legalActions: ["fold", "call", "raise", "jam"],
    facingAction: { type: "bet", amountBB: 3, callAmountBB: 3 },
    lastRecommendation: recommendation,
  });
  state = step(state, { code: "hero_fold", recommendation });
  assert.equal(state.handComplete, true);
  assert.equal(state.history.at(-1).action, "fold");
  assert.equal(state.lastComparison.actualAction, "fold");
  assert.equal(state.lastComparison.recommendedAction, "call");
  assert.equal(state.lastComparison.matched, false);
  assert.equal(state.lastEventAssumed, false);
});

test("AI summary contains a structured legal decision node", () => {
  let state = freshState({
    street: "flop",
    heroSeat: "BB",
    opponentSeat: "BTN",
    board: { flop: ["Kd", "7c", "2h"], turn: null, river: null },
    potSizes: { total: 7.5 },
    heroStackBB: 45,
    villainStackBB: 42,
    gameType: "tournament",
  });
  state = step(state, { code: "faced_bet", amountBB: 2.5 });
  const summary = summarizeForAI(state);
  const decision = summary.context.decisionNode;
  assert.equal(decision.relativePosition, "oop");
  assert.equal(decision.potBB, 10);
  assert.equal(decision.facingAction.callAmountBB, 2.5);
  assert.deepEqual(decision.legalActions, ["fold", "call", "raise", "jam"]);
  assert.deepEqual(decision.boardCards, ["Kd", "7c", "2h"]);
  assert.deepEqual(buildDecisionNode(state).legalActions, decision.legalActions);
});

test("Cash Game Crusher turn caution rebuilds ranges instead of defaulting to pot control", () => {
  const state = freshState({
    street: "turn",
    persona: "cash_game_crusher",
    gameType: "tournament",
    heroSeat: "BB",
    opponentSeat: "BTN",
    heroRelativePosition: "oop",
    board: { flop: ["Kd", "7c", "2h"], turn: "9s", river: null },
    potSizes: { total: 12 },
    history: [
      { street: "flop", actor: "hero", action: "bet", amountBB: 4 },
      { street: "flop", actor: "opp", action: "call", amountBB: 4 },
    ],
  });

  const summary = summarizeForAI(state);
  assert.equal(summary.context.gameType, "cash");
  assert.equal(summary.context.decisionNode.gameType, "cash");
  assert.match(summary.instruction, /Rebuild both cash-game ranges/i);
  assert.match(summary.instruction, /value barrels/i);
  assert.doesNotMatch(summary.instruction, /Prioritise pot control/i);
});

test("tracks running pot, total commitments, and chips behind across streets", () => {
  let state = freshState({
    heroSeat: "BTN",
    opponentSeat: "BB",
    heroStackBB: 20,
    villainStackBB: 20,
  });
  state = step(state, "unopened");
  state = step(state, { code: "hero_open", amountBB: 2.2, toAmountBB: 2.2 });
  state = step(state, "opp_one_call");
  state = step(state, "next_street");
  state = step(state, "checked_to_me");
  state = step(state, { code: "hero_bet", amountBB: 4, toAmountBB: 4 });
  state = step(state, "opp_call");
  state = step(state, "next_street");
  state = step(state, { code: "opp_bet", amountBB: 5, toAmountBB: 5 });

  const stacks = buildStackState(state);
  const decision = buildDecisionNode(state);
  assert.equal(state.estimatedPotBB, 17.9);
  assert.equal(stacks.heroTotalCommittedBB, 6.2);
  assert.equal(stacks.opponentTotalCommittedBB, 11.2);
  assert.equal(decision.heroStackBehindBB, 13.8);
  assert.equal(decision.opponentStackBehindBB, 8.8);
  assert.equal(decision.effectiveStackBB, 8.8);
  assert.equal(decision.facingAction.callAmountBB, 5);
  assert.equal(decision.heroStackAfterCallBB, 8.8);
  assert.equal(decision.spr, 0.49);

  const summary = summarizeForAI(state).context;
  assert.equal(summary.stackInfo.heroStarting, 20);
  assert.equal(summary.stackInfo.hero, 13.8);
  assert.equal(summary.stackInfo.heroCommitted, 6.2);
  assert.equal(summary.decisionNode.heroStackAfterCallBB, 8.8);
});

test("a live remaining-stack and pot override remains a running baseline", () => {
  let state = freshState({
    street: "flop",
    heroSeat: "BTN",
    opponentSeat: "BB",
    heroStackBB: 20,
    villainStackBB: 20,
    estimatedPotBB: 20,
    potSizes: { total: 20 },
    nextActor: "hero_actual",
    decisionKind: "checked_to_hero",
    legalActions: ["check", "bet", "jam"],
    history: [
      { street: "preflop", actor: "hero", action: "open", toAmountBB: 2.2 },
      { street: "preflop", actor: "opp", action: "call", amountBB: 1.2, toAmountBB: 2.2 },
    ],
    stackRemainingOverrides: {
      hero: { remainingBB: 10, committedAtBB: 2.2 },
      opponent: null,
    },
  });

  state = step(state, { code: "hero_bet", amountBB: 3, toAmountBB: 3 });
  const decision = buildDecisionNode(state);
  assert.equal(decision.potBB, 23);
  assert.equal(decision.potSource, "running_from_manual_override");
  assert.equal(decision.heroTotalCommittedBB, 5.2);
  assert.equal(decision.heroStackBehindBB, 7);
});

test("sizes and calls cannot exceed Hero's remaining stack", () => {
  const facingState = freshState({
    street: "flop",
    heroSeat: "BTN",
    opponentSeat: "BB",
    heroStackBB: 10,
    villainStackBB: 50,
    estimatedPotBB: 24.9,
    nextActor: "hero",
    decisionKind: "facing_bet",
    legalActions: ["fold", "call", "raise", "jam"],
    facingAction: { type: "bet", amountBB: 20, toAmountBB: 20 },
    history: [
      { street: "preflop", actor: "hero", action: "open", toAmountBB: 2.2 },
      { street: "preflop", actor: "opp", action: "call", amountBB: 1.2, toAmountBB: 2.2 },
      { street: "flop", actor: "opp", action: "bet", amountBB: 20, toAmountBB: 20 },
    ],
  });
  const facingDecision = buildDecisionNode(facingState);
  assert.equal(facingDecision.heroStackBehindBB, 7.8);
  assert.equal(facingDecision.facingAction.callAmountBB, 7.8);
  assert.equal(facingDecision.heroStackAfterCallBB, 0);
  assert.deepEqual(facingDecision.legalActions, ["fold", "call"]);

  let bettingState = freshState({
    street: "flop",
    heroSeat: "BTN",
    opponentSeat: "BB",
    heroStackBB: 10,
    villainStackBB: 50,
    estimatedPotBB: 4.9,
    nextActor: "hero_actual",
    decisionKind: "checked_to_hero",
    legalActions: ["check", "bet", "jam"],
    history: [
      { street: "preflop", actor: "hero", action: "open", toAmountBB: 2.2 },
      { street: "preflop", actor: "opp", action: "call", amountBB: 1.2, toAmountBB: 2.2 },
    ],
  });
  const cappedRecommendation = assumedHeroEventFromRecommendation(
    { hero_action: "bet", sizing: "50 BB", sizing_bb: 50 },
    bettingState,
  );
  assert.equal(cappedRecommendation.code, "hero_jam");
  assert.equal(cappedRecommendation.recommendation.hero_action, "jam");
  assert.equal(cappedRecommendation.recommendation.sizing_bb, 7.8);

  bettingState = step(bettingState, {
    code: "hero_bet",
    amountBB: 50,
    toAmountBB: 50,
  });
  assert.equal(bettingState.history.at(-1).toAmountBB, 7.8);
  assert.equal(bettingState.history.at(-1).amountBB, 7.8);
  assert.equal(buildStackState(bettingState).heroStackBehindBB, 0);
});
