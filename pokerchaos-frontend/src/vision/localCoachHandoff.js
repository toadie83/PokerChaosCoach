import { occupiedScreenSeats, seatsForTableSize } from "../state/seatUtils.js";
import { summarizeLocalHand } from "./localHandTracker.js";
import { buildStrategicTableState } from "./strategicTableState.js";

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function localTrackingPrerequisitesReady(context = {}, options = {}) {
  const visionRevision = Number(context.visionRevision || 0);
  const afterVisionRevision = Number(options.afterVisionRevision ?? -1);
  return Boolean(
    context.heroCards?.card1 &&
    context.heroCards?.card2 &&
    context.heroSeat &&
    Number(context.visionUpdatedAt || 0) > 0 &&
    visionRevision > afterVisionRevision,
  );
}

export function localTrackerIdentity(tracker, context = {}) {
  return {
    trackerHandId: tracker?.id ?? null,
    street: tracker?.street || "unknown",
    heroSeat: String(context.heroSeat || "").toUpperCase(),
    tableSize: Number(context.tableSize || tracker?.seatCount || 8),
    layout: (Array.isArray(context.absentSeats) ? context.absentSeats : []).map(Number).sort((a, b) => a - b).join(","),
  };
}

export function sameLocalTrackerIdentity(left, right) {
  return Boolean(
    left && right &&
    left.trackerHandId === right.trackerHandId &&
    left.street === right.street &&
    left.heroSeat === right.heroSeat &&
    left.tableSize === right.tableSize &&
    (left.layout || "") === (right.layout || ""),
  );
}

export function screenSeatToPosition(screenSeat, heroSeat, tableSize = 8, absentSeats = [], physicalSeatCount = tableSize) {
  const positions = seatsForTableSize(Number(tableSize));
  const occupied = occupiedScreenSeats(physicalSeatCount, absentSeats);
  if (positions.length !== Number(tableSize) || occupied.length !== positions.length) return null;
  const heroIndex = positions.indexOf(String(heroSeat || "").toUpperCase());
  const offset = occupied.indexOf(Number(screenSeat));
  if (heroIndex < 0 || offset < 0) return null;
  return positions[(heroIndex + offset) % positions.length];
}

function latestStreetAction(tracker, predicate) {
  return [...(tracker?.events || [])].reverse().find((event) =>
    event?.street === tracker?.street && event?.type === "action" && predicate(event),
  );
}

function buildLiveState(tracker, summary, context, aggressorSeat, callerSeats, heroEvent = null) {
  const heroStackBeforeBB = finiteNonNegative(context.heroStackBehindBB);
  const heroIncrementBB = heroEvent && Number(heroEvent.seat) === 0
    ? Math.max(0, Number(heroEvent.toBB || 0) - Number(heroEvent.beforeBB || 0))
    : 0;
  const heroStackBehindBB = heroStackBeforeBB === null
    ? null
    : Math.max(0, Number((heroStackBeforeBB - heroIncrementBB).toFixed(2)));
  const opponentStackBehindBB = finiteNonNegative(summary.opponentStackBehindBB);
  const stacks = [heroStackBehindBB, opponentStackBehindBB].filter((value) => value !== null);
  const existingEffectiveStackBB = finiteNonNegative(context.effectiveStackBB);
  const anteTotal = Number(context.anteBB) > 0
    ? Number(context.anteBB) * Number(context.tableSize || tracker.seatCount || 0)
    : 0;
  const calculatedPotBB = Number(
    (Number(summary.calculatedPotBB || 0) + anteTotal).toFixed(2),
  );
  const displayedTotalPotBB = finiteNonNegative(summary.displayedTotalPotBB);
  const potBB = displayedTotalPotBB !== null
    ? displayedTotalPotBB
    : calculatedPotBB;
  const allSeatsKnown = Object.values(tracker.seats || {}).every((seat) =>
    Number(seat?.seat) === 0 || ["active", "folded", "all_in", "absent"].includes(seat?.status),
  );
  return {
    source: "local_table_tracker",
    tableSize: Number(context.tableSize || tracker.seatCount || 8),
    trackerHandId: tracker.id,
    street: tracker.street,
    potBB,
    calculatedPotBB,
    displayedTotalPotBB,
    potSource: displayedTotalPotBB !== null
      ? "table_display"
      : "calculated_ledger",
    potReconciliation: summary.potReconciliation || null,
    amountToCallBB: finiteNonNegative(summary.amountToCallBB),
    aggressorSeat,
    callerSeats,
    callers: callerSeats.length,
    playersInHand: allSeatsKnown
      ? Math.max(2, summary.activeSeats.length + summary.allInSeats.length)
      : null,
    heroStackBehindBB,
    opponentStackBehindBB,
    effectiveStackBB: stacks.length === 2
      ? Math.min(...stacks)
      : heroIncrementBB > 0 && heroStackBehindBB !== null && existingEffectiveStackBB !== null
        ? Math.min(heroStackBehindBB, existingEffectiveStackBB)
        : existingEffectiveStackBB,
    strategicTableState: buildStrategicTableState(tracker, {
      ...context,
      heroStackBehindBB,
      summary,
      potBB,
      amountToCallBB: summary.amountToCallBB,
    }),
  };
}

export function buildLocalCoachHandoff(tracker, context = {}) {
  if (!tracker || tracker.pendingReset) return null;
  const tableSize = Number(context.tableSize || tracker.seatCount || 8);
  const mapSeat = (screenSeat) => screenSeatToPosition(
    screenSeat,
    context.heroSeat,
    tableSize,
    context.absentSeats,
    context.physicalSeatCount || tracker.seatCount,
  );
  if (occupiedScreenSeats(context.physicalSeatCount || tracker.seatCount, context.absentSeats).length !== tableSize) return null;
  const summary = summarizeLocalHand(tracker);
  const identity = localTrackerIdentity(tracker, context);
  const streetActions = (tracker.events || []).filter((event) =>
    event?.street === tracker.street && event?.type === "action",
  );
  const heroEvent = latestStreetAction(tracker, (event) => Number(event.seat) === 0 && [
    "open", "three_bet", "four_bet", "bet", "raise", "all_in",
  ].includes(event.action));
  const aggression = latestStreetAction(tracker, (event) =>
    event.aggressive === true && event.ambiguous !== true,
  );
  const heroIsLatestAggression = heroEvent && (
    !aggression || streetActions.lastIndexOf(heroEvent) >= streetActions.lastIndexOf(aggression)
  );
  if (heroIsLatestAggression) {
    const code = {
      open: "hero_open",
      three_bet: "hero_3bet",
      four_bet: "hero_4bet",
      bet: "hero_bet",
      raise: "hero_raise",
      all_in: "hero_jam",
    }[heroEvent.action];
    return {
      identity,
      eventId: heroEvent.id,
      label: heroEvent.text,
      ready: true,
      stackAwareReady: true,
      blockedReason: null,
      payload: {
        code,
        toAmountBB: heroEvent.toBB,
        liveState: buildLiveState(tracker, summary, context, context.heroSeat || null, [], heroEvent),
      },
    };
  }

  if (!summary.actionOrderKnown) return null;
  let payload = null;
  let event = aggression;
  if (aggression) {
    const actorSeat = mapSeat(aggression.seat);
    if (!actorSeat || actorSeat === String(context.heroSeat || "").toUpperCase()) return null;
    const callerSeats = summary.callerSeats
      .map(mapSeat)
      .filter(Boolean);
    const aggressorAllIn = tracker.seats?.[aggression.seat]?.status === "all_in";
    if (aggressorAllIn) {
      payload = { code: "faced_allin", actorSeat, toAmountBB: aggression.toBB };
    } else if (aggression.action === "open") {
      payload = summary.callers > 0
        ? { code: "multiple_villains_opened", actorSeat, toAmountBB: aggression.toBB, callers: summary.callers, callerSeats }
        : { code: "opened_to_me", actorSeat, toAmountBB: aggression.toBB };
    } else if (aggression.action === "three_bet") {
      const open = latestStreetAction(tracker, (candidate) => candidate.action === "open" && candidate.at <= aggression.at);
      payload = {
        code: "open_and_3bet_to_me",
        actorSeat,
        openerSeat: open ? mapSeat(open.seat) : null,
        openAmountBB: open?.toBB ?? null,
        toAmountBB: aggression.toBB,
        callers: summary.callers,
        callerSeats,
      };
    } else if (aggression.action === "four_bet") {
      payload = { code: "faced_4bet", actorSeat, toAmountBB: aggression.toBB };
    } else if (aggression.action === "bet") {
      payload = { code: "faced_bet", actorSeat, amountBB: aggression.toBB };
    } else if (aggression.action === "raise") {
      payload = { code: "faced_raise", actorSeat, toAmountBB: aggression.toBB };
    }
    if (payload) {
      payload.liveState = buildLiveState(tracker, summary, context, actorSeat, callerSeats);
    }
  } else if (summary.heroToAct && summary.decisionType === "limp") {
    event = latestStreetAction(tracker, (candidate) => candidate.action === "limp");
    const actorSeat = event ? mapSeat(event.seat) : null;
    const limpers = (tracker.events || []).filter((candidate) =>
      candidate.street === tracker.street && candidate.type === "action" && candidate.action === "limp",
    ).length;
    payload = { code: "limped_to_me", actorSeat, amountBB: 1, limpers };
    payload.liveState = buildLiveState(tracker, summary, context, actorSeat, []);
  } else if (summary.heroToAct && summary.decisionType === "unopened") {
    payload = { code: "unopened" };
    payload.liveState = buildLiveState(tracker, summary, context, null, []);
  } else if (summary.heroToAct && summary.decisionType === "first_to_act") {
    payload = { code: "first_to_act" };
    payload.liveState = buildLiveState(tracker, summary, context, null, []);
  } else if (summary.heroToAct && summary.decisionType === "checked_to_me") {
    event = latestStreetAction(tracker, (candidate) => candidate.action === "check");
    const actorSeat = event ? mapSeat(event.seat) : null;
    payload = { code: "checked_to_me", actorSeat };
    payload.liveState = buildLiveState(tracker, summary, context, actorSeat, []);
  }

  if (!payload) return null;
  const strategicFeatures = payload.liveState?.strategicTableState?.features || {};
  const stackAwareReady = strategicFeatures.readyForLiveDecision === true;
  return {
    identity,
    eventId: event?.id || `${tracker.id}:${tracker.street}:${summary.decisionType}`,
    label: event?.text || `${summary.decisionType.replaceAll("_", " ")} confirmed`,
    ready: Boolean(summary.heroToAct),
    stackAwareReady,
    blockedReason: null,
    missingStackPositions: Array.isArray(strategicFeatures.missingRelevantOpponentStacks)
      ? [...strategicFeatures.missingRelevantOpponentStacks]
      : [],
    reconciliationWarningPositions: Array.isArray(strategicFeatures.reconciliationWarningPositions)
      ? [...strategicFeatures.reconciliationWarningPositions]
      : [],
    provisional: summary.orderConfidence === "provisional",
    provisionalFoldSeats: [...(summary.provisionalFoldSeats || [])],
    payload,
  };
}
