import {
  HERO_ACTION_BY_CODE,
  amountToCallForFacingAction,
  buildDecisionNode,
  buildStackState,
  compareRecommendation,
  deriveRelativePosition,
  finitePositiveOrNull,
  legalActionsForDecision,
  normalizeActionEvent,
  streetCommitments,
} from "./decisionState.js";

export const initialState = {
  street: "preflop",
  heroSeat: "",
  tableSize: 8,
  openSize: 2.5,
  history: [],
  actions: [],
  previousActions: [],
  nextActor: "hero",
  lastEvent: null,
  lastEventAt: 0,
  lastEventAssumed: false,
  aggressors: 0,
  opens: 0,
  threeBets: 0,
  momentum: 0,
  handComplete: false,
  style: "chaos_shark",
  persona: "replay_analyst",
  heroCards: { card1: null, card2: null },
  heroRelativePosition: "auto",
  opponentSeat: "",
  playersInHand: 2,
  gameType: "tournament",
  anteBB: 0,
  decisionKind: null,
  facingAction: null,
  legalActions: [],
  lastAggressorSeat: "",
  lastRecommendation: null,
  lastComparison: null,
  estimatedPotBB: null,
  preflopLimpers: 0,
  preflopCallers: 0,
  board: {
    flop: [null, null, null],
    turn: null,
    river: null,
  },
  potSizes: {
    total: null,
  },
  heroStackBB: 100,
  villainStackBB: 100,
  stackRemainingOverrides: {
    hero: null,
    opponent: null,
  },
  villainType: "fishy",
  stakeTier: "unknown",
  model: "gpt-4.1-mini",
};

export function applyEvent(state, event) {
  const now = Date.now();
  if (now - (state.lastEventAt || 0) < 250) return state; // debounce spam
  const actionEvent = normalizeActionEvent(event);
  const eventCode = actionEvent.code;
  const s = { ...state };
  const push = (code) => {
    s.actions = [...s.actions, { code, at: now, street: s.street }];
    s.previousActions = [...s.previousActions, code];
  };

  const appendHistory = ({ actor, action, seat, amountBB, toAmountBB, note }) => {
    const entry = {
      at: now,
      street: s.street,
      actor,
      seat: seat || null,
      action,
      amountBB: finitePositiveOrNull(amountBB),
      toAmountBB: finitePositiveOrNull(toAmountBB),
      potBeforeBB:
        finitePositiveOrNull(s.estimatedPotBB) ||
        finitePositiveOrNull(s.potSizes?.total),
      note: note || undefined,
    };
    s.history = [...(Array.isArray(s.history) ? s.history : []), entry].slice(-40);
  };

  const setDecision = (kind, facingAction = null) => {
    s.decisionKind = kind;
    s.facingAction = facingAction;
    s.legalActions = legalActionsForDecision(kind, s);
    s.nextActor = "hero";
    s.lastRecommendation = null;
  };

  const clearDecision = () => {
    s.decisionKind = null;
    s.facingAction = null;
    s.legalActions = [];
    s.lastRecommendation = null;
  };

  const addEstimatedPot = (amount) => {
    const contribution = finitePositiveOrNull(amount);
    if (!contribution) return;
    const knownCurrent =
      finitePositiveOrNull(s.estimatedPotBB) ||
      finitePositiveOrNull(s.potSizes?.total);
    const current = knownCurrent ||
      (s.street === "preflop"
        ? 1.5 + Number(s.anteBB || 0) * Number(s.tableSize || 0)
        : null);
    if (!current) return;
    s.estimatedPotBB = Number((current + contribution).toFixed(2));
  };

  const contributionToTarget = (actor, targetAmount) => {
    const target = finitePositiveOrNull(targetAmount);
    if (!target) return null;
    // Aggressive events are written to history before this helper is called so
    // the UI immediately has a canonical row. Exclude that just-written row
    // when calculating the chips newly added by the action.
    const lastRow = Array.isArray(s.history) ? s.history.at(-1) : null;
    const matchesJustWrittenAction =
      lastRow?.actor === actor &&
      lastRow?.street === s.street &&
      finitePositiveOrNull(lastRow?.toAmountBB ?? lastRow?.amountBB) === target;
    const commitments = streetCommitments(
      matchesJustWrittenAction
        ? { ...s, history: s.history.slice(0, -1) }
        : s,
    );
    const alreadyCommitted = actor === "hero"
      ? commitments.heroCommittedBB
      : commitments.opponentCommittedBB;
    const delta = Number((target - alreadyCommitted).toFixed(2));
    return delta > 0 ? delta : null;
  };

  const recordAggressiveContribution = (actor, targetAmount) => {
    const contribution = contributionToTarget(actor, targetAmount);
    addEstimatedPot(contribution);
    return contribution;
  };

  switch (eventCode) {
    // Preflop
    case "opened_to_me": {
      push("preflop_opened_to_me");
      s.opens += 1;
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "open",
        seat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision("facing_open", {
        type: "open",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "multiple_villains_opened": {
      push("preflop_multiple_villains_opened");
      s.opens += 1;
      s.aggressors += 1;
      s.preflopCallers = Math.max(1, Number(actionEvent.callers || s.preflopCallers || 1));
      s.playersInHand = Math.max(3, Number(s.playersInHand || 3));
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "open",
        seat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        note: `${s.preflopCallers} caller${s.preflopCallers === 1 ? "" : "s"}`,
      });
      const openTarget = actionEvent.toAmountBB || actionEvent.amountBB;
      const openerContribution = recordAggressiveContribution("opp", openTarget);
      if (openerContribution && s.preflopCallers > 0) {
        addEstimatedPot(Number(openTarget) * s.preflopCallers);
      }
      setDecision("facing_open_callers", {
        type: "open",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "limped_to_me": {
      push("preflop_limped_to_me");
      s.preflopLimpers = Math.max(1, Number(actionEvent.limpers || s.preflopLimpers || 1));
      s.playersInHand = Math.max(2 + s.preflopLimpers, Number(s.playersInHand || 2));
      appendHistory({
        actor: "opp",
        action: "call",
        seat: actionEvent.actorSeat || s.opponentSeat,
        amountBB: 1,
        note: `${s.preflopLimpers} limper${s.preflopLimpers === 1 ? "" : "s"}`,
      });
      addEstimatedPot(s.preflopLimpers);
      setDecision("limped", {
        type: "limp",
        actorSeat: actionEvent.actorSeat || s.opponentSeat || null,
        amountBB: 1,
        callAmountBB: s.heroSeat === "BB" ? null : 1,
      });
      break;
    }
    case "button_steal": {
      push("preflop_button_steal");
      s.opens += 1;
      s.aggressors += 1;
      s.opponentSeat = "BTN";
      s.lastAggressorSeat = "BTN";
      appendHistory({
        actor: "opp",
        action: "open",
        seat: "BTN",
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision("facing_open", {
        type: "open",
        actorSeat: "BTN",
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "unopened": {
      push("preflop_unopened");
      setDecision("unopened", null);
      break;
    }
    case "faced_3bet": {
      push("preflop_faced_3bet");
      s.threeBets += 1;
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "3-bet",
        seat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision("facing_3bet", {
        type: "3-bet",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "faced_4bet": {
      push("preflop_faced_4bet");
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "4-bet",
        seat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision("facing_4bet", {
        type: "4-bet",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "hero_opened": {
      push("preflop_hero_opened");
      s.opens += 1;
      s.nextActor = "hero";
      break;
    }
    // Postflop
    case "checked_to_me": {
      push(`${s.street}_checked_to_me`);
      appendHistory({
        actor: "opp",
        action: "check",
        seat: actionEvent.actorSeat || s.opponentSeat,
      });
      setDecision("checked_to_hero", {
        type: "check",
        actorSeat: actionEvent.actorSeat || s.opponentSeat || null,
      });
      break;
    }
    case "faced_bet": {
      push(`${s.street}_faced_bet`);
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "bet",
        seat: s.lastAggressorSeat,
        amountBB: actionEvent.amountBB || actionEvent.toAmountBB,
      });
      recordAggressiveContribution("opp", actionEvent.amountBB || actionEvent.toAmountBB);
      setDecision("facing_bet", {
        type: "bet",
        actorSeat: s.lastAggressorSeat,
        amountBB: actionEvent.amountBB || actionEvent.toAmountBB,
        callAmountBB: actionEvent.amountBB || actionEvent.toAmountBB,
      });
      break;
    }
    case "faced_raise": {
      push(`${s.street}_faced_raise`);
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "raise",
        seat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision("facing_raise", {
        type: "raise",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "faced_allin": {
      push(`${s.street}_faced_allin`);
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      const opponentStackState = buildStackState(s);
      const allInTarget =
        actionEvent.toAmountBB ||
        actionEvent.amountBB ||
        (opponentStackState.opponentStackBehindBB !== null
          ? opponentStackState.opponentCurrentStreetCommittedBB +
            opponentStackState.opponentStackBehindBB
          : s.villainStackBB);
      appendHistory({
        actor: "opp",
        action: "jam",
        seat: s.lastAggressorSeat,
        toAmountBB: allInTarget,
      });
      recordAggressiveContribution("opp", allInTarget);
      setDecision("facing_allin", {
        type: "jam",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: allInTarget,
        callAmountBB: allInTarget,
        allIn: true,
      });
      break;
    }
    case "multiway": {
      push(`${s.street}_multiway`);
      s.playersInHand = Math.max(3, Number(s.playersInHand || 3));
      s.nextActor = "hero";
      break;
    }
    case "headsup": {
      push(`${s.street}_headsup`);
      s.playersInHand = 2;
      s.nextActor = "hero";
      break;
    }
    case "first_to_act": {
      push(`${s.street}_first_to_act`);
      if (s.heroRelativePosition === "auto") s.heroRelativePosition = "oop";
      setDecision("postflop_open", null);
      break;
    }
    case "next_street": {
      push(`${s.street}_advance`);
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        s.street = nextStreet(s.street);
        s.nextActor = "hero";
        clearDecision();
      }
      break;
    }
    case "reset_hand": {
      const keep = {
        heroSeat: s.heroSeat,
        tableSize: s.tableSize,
        style: s.style,
        openSize: s.openSize,
        persona: s.persona,
        heroCards: s.heroCards,
        heroRelativePosition: s.heroRelativePosition,
        opponentSeat: s.opponentSeat,
        playersInHand: 2,
        gameType: s.gameType,
        anteBB: s.anteBB,
        heroStackBB: s.heroStackBB,
        villainStackBB: s.villainStackBB,
        villainType: s.villainType,
        preflopLimpers: 0,
        preflopCallers: 0,
        stakeTier: s.stakeTier,
      };
      return { ...initialState, ...keep };
    }
    case "hero_fold":
    case "hero_check":
    case "hero_call":
    case "hero_open":
    case "hero_bet":
    case "hero_raise":
    case "hero_3bet":
    case "hero_4bet":
    case "hero_jam": {
      const actualAction = HERO_ACTION_BY_CODE[eventCode];
      const beforeCommitments = streetCommitments(s);
      const stackStateBeforeAction = buildStackState(s);
      const potBeforeAction =
        finitePositiveOrNull(s.estimatedPotBB) ||
        finitePositiveOrNull(s.potSizes?.total) ||
        (s.street === "preflop"
          ? Number((1.5 + Number(s.anteBB || 0) * Number(s.tableSize || 0)).toFixed(2))
          : null);
      const facingCallAmount = amountToCallForFacingAction(s);
      const requestedTarget = actionEvent.toAmountBB || actionEvent.amountBB;
      const maxHeroTarget = stackStateBeforeAction.heroStackBehindBB !== null
        ? Number(
            (
              beforeCommitments.heroCommittedBB +
              stackStateBeforeAction.heroStackBehindBB
            ).toFixed(2),
          )
        : null;
      const rawAggressionTarget = ["open", "bet", "raise", "3-bet", "4-bet", "jam"].includes(actualAction)
        ? finitePositiveOrNull(requestedTarget) ||
          (actualAction === "jam" ? maxHeroTarget : null)
        : null;
      const aggressionTarget = rawAggressionTarget && maxHeroTarget !== null
        ? Number(Math.min(rawAggressionTarget, maxHeroTarget).toFixed(2))
        : rawAggressionTarget;
      const callTarget = actualAction === "call"
        ? Number((beforeCommitments.heroCommittedBB + Number(facingCallAmount || 0)).toFixed(2))
        : null;
      const contribution = actualAction === "call"
        ? facingCallAmount
        : aggressionTarget
          ? Number((aggressionTarget - beforeCommitments.heroCommittedBB).toFixed(2))
          : null;
      push(`${s.street}_${eventCode}`);
      appendHistory({
        actor: "hero",
        action: actualAction,
        seat: s.heroSeat,
        amountBB: contribution,
        toAmountBB: callTarget || aggressionTarget,
        note: actionEvent.assumed ? "Coach line assumed" : undefined,
      });
      addEstimatedPot(contribution);
      s.lastRecommendation = actionEvent.recommendation || s.lastRecommendation || null;
      s.lastComparison = actionEvent.assumed
        ? null
        : compareRecommendation(
            s.lastRecommendation,
            actualAction,
            actionEvent.amountBB || actionEvent.toAmountBB || contribution,
            { potBB: potBeforeAction },
          );
      if (["open", "bet", "raise", "3-bet", "4-bet", "jam"].includes(actualAction)) {
        s.lastAggressorSeat = s.heroSeat;
        s.aggressors += 1;
      }
      if (actualAction === "fold") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else if (
        actualAction === "call" &&
        Number(s.playersInHand || 2) <= 2
      ) {
        if (s.street === "river") {
          push("hand_complete");
          s.handComplete = true;
          s.nextActor = "hero";
        } else {
          s.nextActor = "await_street";
        }
      } else if (actualAction === "check") {
        const heroClosesAction =
          s.street === "preflop" || deriveRelativePosition(s) === "ip";
        if (heroClosesAction && s.street === "river") {
          push("hand_complete");
          s.handComplete = true;
          s.nextActor = "hero";
        } else {
          s.nextActor = heroClosesAction ? "await_street" : "opp";
        }
      } else {
        s.nextActor = "opp";
      }
      break;
    }
    case "opp_all_fold": {
      push(`${s.street}_opp_all_fold`);
      push("hand_complete");
      s.handComplete = true;
      s.nextActor = "hero";
      break;
    }
    case "opp_one_call": {
      push(`${s.street}_opp_one_call`);
      const commitments = streetCommitments(s);
      const contribution = Math.max(0, commitments.heroCommittedBB - commitments.opponentCommittedBB);
      appendHistory({
        actor: "opp",
        action: "call",
        seat: s.opponentSeat,
        amountBB: contribution,
        toAmountBB: commitments.heroCommittedBB || null,
        note: "one",
      });
      addEstimatedPot(contribution);
      s.preflopCallers = Math.max(1, Number(s.preflopCallers || 0));
      s.nextActor = "await_street";
      break;
    }
    case "opp_multi_call": {
      push(`${s.street}_opp_multi_call`);
      const commitments = streetCommitments(s);
      const callers = Math.max(2, Number(actionEvent.callers || 2));
      const contribution = Math.max(0, commitments.heroCommittedBB - commitments.opponentCommittedBB);
      appendHistory({
        actor: "opp",
        action: "call",
        seat: s.opponentSeat,
        amountBB: contribution,
        toAmountBB: commitments.heroCommittedBB || null,
        note: `${callers} callers`,
      });
      addEstimatedPot(contribution * callers);
      s.preflopCallers = Math.max(2, Number(s.preflopCallers || 0));
      s.playersInHand = Math.max(3, Number(s.playersInHand || 3));
      s.nextActor = "await_street";
      break;
    }
    case "opp_4bet": {
      push(`${s.street}_opp_4bet`);
      if (s.street === "preflop") push("preflop_faced_4bet");
      appendHistory({
        actor: "opp",
        action: "4-bet",
        seat: actionEvent.actorSeat || s.opponentSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision("facing_4bet", {
        type: "4-bet",
        actorSeat: actionEvent.actorSeat || s.opponentSeat || null,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    case "opp_shove": {
      push(`${s.street}_opp_shove`);
      const opponentStackState = buildStackState(s);
      const allInTarget =
        actionEvent.toAmountBB ||
        actionEvent.amountBB ||
        (opponentStackState.opponentStackBehindBB !== null
          ? opponentStackState.opponentCurrentStreetCommittedBB +
            opponentStackState.opponentStackBehindBB
          : s.villainStackBB);
      appendHistory({
        actor: "opp",
        action: "jam",
        seat: actionEvent.actorSeat || s.opponentSeat,
        toAmountBB: allInTarget,
      });
      recordAggressiveContribution("opp", allInTarget);
      setDecision("facing_allin", {
        type: "jam",
        actorSeat: actionEvent.actorSeat || s.opponentSeat || null,
        toAmountBB: allInTarget,
        callAmountBB: allInTarget,
        allIn: true,
      });
      break;
    }
    case "opp_fold": {
      push(`${s.street}_opp_fold`);
      appendHistory({ actor: "opp", action: "fold", seat: s.opponentSeat });
      if (Number(s.playersInHand || 2) <= 2) {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        s.playersInHand = Math.max(2, Number(s.playersInHand) - 1);
        s.nextActor = "opp";
      }
      break;
    }
    case "opp_call": {
      push(`${s.street}_opp_call`);
      const commitments = streetCommitments(s);
      const contribution = Math.max(0, commitments.heroCommittedBB - commitments.opponentCommittedBB);
      appendHistory({
        actor: "opp",
        action: "call",
        seat: s.opponentSeat,
        amountBB: contribution,
        toAmountBB: commitments.heroCommittedBB || null,
      });
      addEstimatedPot(contribution);
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        s.nextActor = "await_street";
      }
      break;
    }
    case "opp_check_back": {
      push(`${s.street}_opp_check_back`);
      appendHistory({ actor: "opp", action: "check", seat: s.opponentSeat, note: "checked back" });
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        s.nextActor = "await_street";
      }
      break;
    }
    case "opp_bet": {
      push(`${s.street}_opp_bet`);
      push(`${s.street}_faced_bet`);
      s.aggressors += 1;
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: "bet",
        seat: s.lastAggressorSeat,
        amountBB: actionEvent.amountBB || actionEvent.toAmountBB,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution(
        "opp",
        actionEvent.toAmountBB || actionEvent.amountBB,
      );
      setDecision("facing_bet", {
        type: "bet",
        actorSeat: s.lastAggressorSeat || null,
        amountBB: actionEvent.amountBB || actionEvent.toAmountBB,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.amountBB || actionEvent.toAmountBB,
      });
      break;
    }
    case "opp_raise": {
      push(`${s.street}_opp_raise`);
      const latestHeroAction = [...(Array.isArray(s.history) ? s.history : [])]
        .reverse()
        .find((row) => row?.actor === "hero" && row?.street === s.street)?.action;
      const preflopAction = latestHeroAction === "3-bet" ? "4-bet" : "3-bet";
      const decisionKind = s.street === "preflop"
        ? preflopAction === "4-bet"
          ? "facing_4bet"
          : "facing_3bet"
        : "facing_raise";
      if (s.street === "preflop") {
        push(preflopAction === "4-bet" ? "preflop_faced_4bet" : "preflop_faced_3bet");
      } else {
        push(`${s.street}_faced_raise`);
      }
      s.lastAggressorSeat = actionEvent.actorSeat || s.opponentSeat || "";
      appendHistory({
        actor: "opp",
        action: s.street === "preflop" ? preflopAction : "raise",
        seat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      recordAggressiveContribution("opp", actionEvent.toAmountBB || actionEvent.amountBB);
      setDecision(decisionKind, {
        type: s.street === "preflop" ? preflopAction : "raise",
        actorSeat: s.lastAggressorSeat,
        toAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
        callAmountBB: actionEvent.toAmountBB || actionEvent.amountBB,
      });
      break;
    }
    default:
      break;
  }
  s.lastEvent = eventCode;
  s.lastEventAt = now;
  s.lastEventAssumed = Boolean(actionEvent.assumed);
  return s;
}

export function nextStreet(street) {
  const order = ["preflop", "flop", "turn", "river"];
  const idx = order.indexOf(street);
  return order[Math.min(order.length - 1, Math.max(0, idx + 1))] || "river";
}

export function deriveBranch(state) {
  const last = state.previousActions[state.previousActions.length - 1];
  if (last) return last; // already encoded as street_event
  if (state.street === "preflop") return "preflop_unopened";
  return `${state.street}_checked_to_me`;
}

export function instructionForBranch(branch) {
  const map = {
    // Preflop
    preflop_unopened:
      "Evaluate Hero's legal unopened-pot options using exact position, stack depth, antes, and hand strength. At medium/deep depth, preserve wide BTN steals and assertive CO opens rather than requiring premium cards.",
    preflop_opened_to_me:
      "Evaluate fold, call, 3-bet, and jam where legal; account for opener position and size. Preserve priced BB defenses and playable in-position calls at medium/deep depth.",
    preflop_multiple_villains_opened:
      "Evaluate the open-plus-callers decision with multiway risk and squeeze incentives.",
    preflop_button_steal:
      "Evaluate the blind-defense decision against the Button's wide opening range and actual size; avoid premium-only defense when stack depth and price support calls or 3-bets.",
    preflop_limped_to_me:
      "Evaluate checking, over-limping, isolating, folding, or jamming where legal against the limpers.",
    preflop_faced_3bet:
      "Evaluate fold, call, 4-bet, and jam where legal using positions, sizing, and effective stack.",
    preflop_faced_4bet:
      "Evaluate the legal response to the 4-bet using stack commitment, positions, and hand strength.",
    preflop_faced_allin:
      "Evaluate fold or call versus the preflop all-in using exact positions, pot odds, and effective stack.",
    preflop_hero_opened: "Evaluate Hero's response to the next preflop action.",
    // Postflop
    flop_checked_to_me:
      "Evaluate checking and betting sizes using range advantage, board texture, position, and stack-to-pot ratio.",
    flop_faced_bet: "Evaluate the legal response to the flop bet using size, pot odds, ranges, and blockers.",
    flop_faced_raise: "Evaluate the legal response to the flop raise using the raise-to size, ranges, blockers, and stack commitment.",
    flop_faced_allin: "Evaluate fold or call versus the flop all-in using range strength, pot odds, and effective stack.",
    flop_multiway: "Evaluate the multiway flop with tighter value and bluff thresholds.",
    flop_headsup: "Evaluate the heads-up flop decision from the complete state.",
    turn_checked_to_me: "Evaluate checking and betting sizes on the turn using the runout and prior action.",
    turn_faced_bet: "Evaluate the legal response to the turn bet using size, ranges, and stack commitment.",
    turn_faced_raise: "Evaluate the legal response to the turn raise using the raise-to size, ranges, and stack commitment.",
    turn_faced_allin: "Evaluate fold or call versus the turn all-in using ranges, pot odds, and the runout.",
    turn_multiway: "Evaluate the multiway turn with appropriate range and nut constraints.",
    turn_headsup: "Evaluate the heads-up turn from the complete state.",
    river_checked_to_me: "Evaluate checking, value betting, and bluffing with showdown value and blockers.",
    river_faced_bet: "Evaluate fold, call, or raise where legal using sizing, blockers, and range composition.",
    river_faced_raise: "Evaluate the legal response to the river raise using value/bluff composition, blockers, and size.",
    river_faced_allin: "Evaluate fold or call versus the river all-in using pot odds, blockers, and credible value/bluff combinations.",
    river_multiway: "Evaluate the multiway river with conservative bluff-catching and value thresholds.",
    river_headsup: "Evaluate the heads-up river from the complete state.",
    // First to act (postflop)
    flop_first_to_act:
      "Evaluate checking and betting sizes while out of position on the flop.",
    turn_first_to_act:
      "Evaluate checking and betting sizes while out of position on the turn.",
    river_first_to_act: "Evaluate checking and betting sizes while out of position on the river.",
    // Opponent reactions (preflop)
    preflop_opp_all_fold: "The hand ended preflop; preserve the recorded result.",
    preflop_opp_one_call: "The preflop action closed with one caller; wait for the flop.",
    preflop_opp_multi_call: "The preflop action closed multiway; tighten postflop thresholds appropriately.",
    preflop_opp_4bet: "Evaluate the legal response to the 4-bet using exact positions, size, and commitment.",
    preflop_opp_shove: "Evaluate fold or call versus the shove using positions, pot odds, and effective stack.",
    // Opponent reactions (postflop generic)
    flop_opp_fold: "The hand ended on the flop; preserve the recorded result.",
    flop_opp_call: "The flop bet was called; wait for the turn and retain the range interaction.",
    flop_opp_check_back: "The flop checked through; wait for the turn without assuming the opponent is capped.",
    flop_opp_bet: "Evaluate the legal response to the flop bet using size, ranges, blockers, and position.",
    flop_opp_raise: "Evaluate the legal response to the flop raise using the complete decision state.",
    flop_opp_shove: "Evaluate fold or call versus the flop shove using pot odds and range strength.",
    turn_opp_fold: "The hand ended on the turn; preserve the recorded result.",
    turn_opp_call: "The turn bet was called; wait for the river and retain the range interaction.",
    turn_opp_check_back: "The turn checked through; wait for the river without inventing a range cap.",
    turn_opp_bet: "Evaluate the legal response to the turn bet using size, ranges, blockers, and runout.",
    turn_opp_raise: "Evaluate the legal response to the turn raise using the complete decision state.",
    turn_opp_shove: "Evaluate fold or call versus the turn shove using pot odds, range strength, and runout.",
    river_opp_fold: "The hand ended on the river; preserve the recorded result.",
    river_opp_call: "The river bet was called; preserve the showdown result.",
    river_opp_check_back: "The river checked through; preserve the showdown result.",
    river_opp_bet: "Evaluate the legal response to the river bet using pot odds, blockers, and range composition.",
    river_opp_raise: "Evaluate the legal response to the river raise using the complete decision state.",
    river_opp_shove: "Evaluate fold or call versus the river shove using pot odds, blockers, and range composition.",
  };
  return map[branch] || "Recommend the strongest legal action from the complete decision state.";
}

export function summarizeForAI(state) {
  const branch = deriveBranch(state);
  const instruction = instructionForBranch(branch);
  const history = Array.isArray(state.history) ? state.history.slice(-20) : [];
  const heroCards = state.heroCards || {};
  const heroHand =
    heroCards.card1 && heroCards.card2
      ? String(heroCards.card1) + String(heroCards.card2)
      : null;
  const heroStack =
    typeof state.heroStackBB === "number" && Number.isFinite(state.heroStackBB)
      ? state.heroStackBB
      : null;
  const villainStack =
    typeof state.villainStackBB === "number" &&
    Number.isFinite(state.villainStackBB)
      ? state.villainStackBB
      : null;
  const runningStackState = buildStackState(state);
  const effectiveStack = runningStackState.effectiveStackBehindBB;
  const stackBucket =
    effectiveStack === null
      ? "unknown"
      : effectiveStack >= 60
      ? "deep"
      : effectiveStack >= 30
      ? "medium"
      : effectiveStack > 0
      ? "short"
      : "unknown";
  const inferredFormat = state.gameType || "tournament";
  const normalizeCard = (card) =>
    typeof card === "string" && card.trim().length === 2
      ? card.trim().toUpperCase()
      : null;
  const flopCards = Array.isArray(state.board?.flop)
    ? state.board.flop.map(normalizeCard)
    : [null, null, null];
  const boardContext = {};
  if (flopCards.some((card) => card)) {
    boardContext.flop = flopCards;
  }
  const turnCard = normalizeCard(state.board?.turn);
  if (turnCard) boardContext.turn = turnCard;
  const riverCard = normalizeCard(state.board?.river);
  if (riverCard) boardContext.river = riverCard;

  const streets = ["preflop", "flop", "turn", "river"];
  const villainCallsByStreet = streets.reduce((acc, street) => {
    acc[street] = 0;
    return acc;
  }, {});
  const villainRaisesByStreet = streets.reduce((acc, street) => {
    acc[street] = 0;
    return acc;
  }, {});
  const heroAggressionByStreet = streets.reduce((acc, street) => {
    acc[street] = 0;
    return acc;
  }, {});

  history.forEach((entry) => {
    const street = entry.street || state.street;
    if (!street || !streets.includes(street)) return;
    const actor = entry.actor || "";
    const action = String(entry.action || "").toLowerCase();
    if (actor === "opp") {
      if (action === "call") {
        villainCallsByStreet[street] += 1;
      } else if (/raise|jam|shove/.test(action)) {
        villainRaisesByStreet[street] += 1;
      }
    } else if (actor === "hero" && /bet|raise|jam|shove/.test(action)) {
      heroAggressionByStreet[street] += 1;
    }
  });

  const totalVillainCalls = streets.reduce(
    (sum, street) => sum + (villainCallsByStreet[street] || 0),
    0
  );

  const previousActions = Array.isArray(state.previousActions)
    ? state.previousActions
    : [];
  const heroFirstToActStreets = new Set(
    previousActions
      .filter((code) => typeof code === "string" && code.endsWith("_first_to_act"))
      .map((code) => code.replace("_first_to_act", ""))
  );
  const heroFirstToActCurrent = heroFirstToActStreets.has(state.street);
  const relativePositionExplicit = state.heroRelativePosition || "auto";
  const resolvedRelativePosition = deriveRelativePosition(state);
  const decisionNode = buildDecisionNode(state);

  const cautionNotes = [];
  if (
    resolvedRelativePosition === "oop" &&
    totalVillainCalls > 0 &&
    (state.persona === "range_professor" || state.persona === "cash_game_crusher")
  ) {
    cautionNotes.push(
      "Opponent has already called previous aggression. Prioritise pot control when out of position unless equity is strong."
    );
  }
  if (
    resolvedRelativePosition === "oop" &&
    villainCallsByStreet.flop > 0 &&
    state.street === "turn"
  ) {
    cautionNotes.push(
      "Flop bet was called; consider checking marginal holdings on the turn to avoid bloating the pot."
    );
  }

  const finalInstruction =
    cautionNotes.length > 0
      ? `${instruction}\n\nCaution: ${cautionNotes.join(" ")}`
      : instruction;

  return {
    context: {
      street: state.street,
      heroSeat: state.heroSeat,
      opponentSeat: state.opponentSeat || null,
      tableSize: state.tableSize,
      playersInHand: Number(state.playersInHand || 2),
      gameType: inferredFormat,
      anteBB: Number(state.anteBB || 0),
      openSizeBB: Number(state.openSize || 0) || null,
      previousActions: state.previousActions,
      aggressors: state.aggressors,
      style: state.style || "chaos_shark",
      branch,
      history,
      persona: state.persona || "chaos_shark",
      heroCards,
      heroHand,
      board: Object.keys(boardContext).length ? boardContext : undefined,
      heroStackBB: heroStack,
      villainStackBB: villainStack,
      heroStackBehindBB: runningStackState.heroStackBehindBB,
      villainStackBehindBB: runningStackState.opponentStackBehindBB,
      startingEffectiveStackBB: runningStackState.startingEffectiveStackBB,
      stackInfo: {
        heroStarting: heroStack,
        villainStarting: villainStack,
        hero: runningStackState.heroStackBehindBB,
        villain: runningStackState.opponentStackBehindBB,
        effective: effectiveStack,
        heroCommitted: runningStackState.heroTotalCommittedBB,
        villainCommitted: runningStackState.opponentTotalCommittedBB,
        heroOverrideActive: runningStackState.heroRemainingOverrideActive,
        villainOverrideActive: runningStackState.opponentRemainingOverrideActive,
        bucket: stackBucket,
      },
      stackBucket,
      villainType: state.villainType || "balanced",
      relativePosition: resolvedRelativePosition,
      decisionNode,
      legalActions: decisionNode.legalActions,
      facingAction: decisionNode.facingAction,
      preflopLimpers:
        typeof state.preflopLimpers === "number" ? state.preflopLimpers : 0,
      preflopCallers:
        typeof state.preflopCallers === "number" ? state.preflopCallers : 0,
      stakeTier: state.stakeTier || "unknown",
      format: inferredFormat,
      model: state.model || "gpt-4.1-mini",
      potSize: decisionNode.potBB,
      tendencies: {
        villainCallsByStreet,
        villainRaisesByStreet,
      heroAggressionByStreet,
      totalVillainCalls,
      heroFirstToActCurrent,
      relativePositionExplicit,
      resolvedRelativePosition,
    },
     caution: cautionNotes.length ? cautionNotes : undefined,
    },
    instruction: finalInstruction,
  };
}

export function getAvailableActions(state, hasCoach) {
  if (state.handComplete) {
    return [];
  }
  const isPre = state.street === "preflop";
  const next = state.nextActor || "hero";
  const decisionNode = buildDecisionNode(state);
  const opponentAllInTarget = finitePositiveOrNull(
    decisionNode.maxOpponentTotalToBB,
  );

  if (next === "hero_actual") {
    return [];
  }

  if (next === "await_street") {
    return [];
  }

  if (next === "opp" && hasCoach) {
    const latestHeroAction = [...(Array.isArray(state.history) ? state.history : [])]
      .reverse()
      .find((row) => row?.actor === "hero" && row?.street === state.street)?.action;
    if (isPre) {
      const passiveResponses = [
        { code: "opp_all_fold", label: "All folded" },
        { code: "opp_one_call", label: "1 caller" },
        { code: "opp_multi_call", label: "Multi callers" },
      ];
      if (latestHeroAction === "jam") return passiveResponses;
      const raiseResponse = latestHeroAction === "3-bet"
        ? {
            code: "opp_4bet",
            label: "Villain 4-bet",
            requiresAmount: true,
            amountLabel: "4-bet to (BB)",
            presets: [14, 16, 18, 20, 24],
          }
        : latestHeroAction === "4-bet"
          ? null
          : {
          code: "opp_raise",
          label: "Villain 3-bet",
          requiresAmount: true,
          amountLabel: "3-bet to (BB)",
          presets: [6, 7, 8, 9, 10],
        };
      return [
        ...passiveResponses,
        ...(raiseResponse ? [raiseResponse] : []),
        {
          code: "opp_shove",
          label: "Shoved",
          amountBB: opponentAllInTarget,
          toAmountBB: opponentAllInTarget,
          requiresAmount: !opponentAllInTarget,
          amountLabel: "All-in to (BB)",
        },
      ];
    }
    if (latestHeroAction === "check") {
      return [
        { code: "opp_check_back", label: "Villain checked back" },
        {
          code: "opp_bet",
          label: "Villain bet",
          requiresAmount: true,
          amountLabel: "Bet amount (BB)",
          presets: [1, 2, 3, 5, 8, 12],
        },
        {
          code: "opp_shove",
          label: "Villain shove",
          amountBB: opponentAllInTarget,
          toAmountBB: opponentAllInTarget,
          requiresAmount: !opponentAllInTarget,
          amountLabel: "All-in to (BB)",
        },
      ];
    }
    if (latestHeroAction === "jam") {
      return [
        { code: "opp_fold", label: "Villain fold" },
        { code: "opp_call", label: "Villain call" },
      ];
    }
    return [
      { code: "opp_fold", label: "Villain fold" },
      { code: "opp_call", label: "Villain call" },
      {
        code: "opp_raise",
        label: "Villain raise",
        requiresAmount: true,
        amountLabel: "Raise to (BB)",
        presets: [2, 3, 5, 8, 12],
      },
      {
        code: "opp_shove",
        label: "Villain shove",
        amountBB: opponentAllInTarget,
        toAmountBB: opponentAllInTarget,
        requiresAmount: !opponentAllInTarget,
        amountLabel: "All-in to (BB)",
      },
    ];
  }

  if (isPre) {
    const heroSeat = String(state.heroSeat || "").toUpperCase();
    const actions = [
      { code: "unopened", label: "Unopened pot" },
      { code: "limped_to_me", label: "Limped to me" },
      {
        code: "opened_to_me",
        label: "Facing open",
        requiresAmount: true,
        amountLabel: "Open size (BB)",
        presets: [2, 2.2, 2.5, 3, 3.5],
      },
      {
        code: "multiple_villains_opened",
        label: "Open + callers",
        requiresAmount: true,
        amountLabel: "Open size (BB)",
        presets: [2, 2.2, 2.5, 3, 3.5],
      },
      {
        code: "faced_3bet",
        label: "Facing 3-bet",
        requiresAmount: true,
        amountLabel: "3-bet to (BB)",
        presets: [6, 7, 8, 9, 10],
      },
      {
        code: "faced_4bet",
        label: "Facing 4-bet",
        requiresAmount: true,
        amountLabel: "4-bet to (BB)",
        presets: [14, 16, 18, 20, 24],
      },
      {
        code: "faced_allin",
        label: "Facing shove",
        amountBB: opponentAllInTarget,
        toAmountBB: opponentAllInTarget,
        requiresAmount: !opponentAllInTarget,
        amountLabel: "All-in to (BB)",
      },
    ];
    if (heroSeat === "SB" || heroSeat === "BB") {
      actions.splice(3, 0, {
        code: "button_steal",
        label: "BTN open",
        requiresAmount: true,
        amountLabel: "Button open size (BB)",
        presets: [2, 2.2, 2.5, 3],
      });
    }
    return actions;
  }
  const pot =
    finitePositiveOrNull(state.estimatedPotBB) ||
    finitePositiveOrNull(state.potSizes?.total);
  const betPresets = pot
    ? [0.25, 0.33, 0.5, 0.66, 0.75, 1].map((ratio) =>
        Number((pot * ratio).toFixed(2)),
      )
    : [1, 2, 3, 5, 8];
  const base = [
    { code: "first_to_act", label: "Hero first to act" },
    { code: "checked_to_me", label: "Checked to Hero" },
    {
      code: "faced_bet",
      label: "Facing bet",
      requiresAmount: true,
      amountLabel: "Bet amount (BB)",
      presets: betPresets,
    },
    {
      code: "faced_raise",
      label: "Facing raise",
      requiresAmount: true,
      amountLabel: "Raise to (BB)",
      presets: betPresets.map((amount) => Number((amount * 2.5).toFixed(2))),
    },
    {
      code: "faced_allin",
      label: "Facing all-in",
      amountBB: opponentAllInTarget,
      toAmountBB: opponentAllInTarget,
      requiresAmount: !opponentAllInTarget,
      amountLabel: "All-in to (BB)",
    },
  ];
  const relative = deriveRelativePosition(state);
  if (relative === "ip") return [base[1], base[2], base[3], base[4], base[0]];
  if (relative === "oop") return [base[0], base[2], base[3], base[4], base[1]];
  return base;
}
