import { occupiedScreenSeats, seatsForTableSize } from "../state/seatUtils.js";
import { localSeatCurrentStackBB, localSeatStackReconciled, localStackSnapshot, summarizeLocalHand } from "./localHandTracker.js";

function finiteNonNegative(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) && number >= 0
    ? number
    : null;
}

function stackBand(stackBB) {
  if (stackBB === null) return "unknown";
  if (stackBB <= 10) return "shove_fold";
  if (stackBB <= 25) return "reshove";
  if (stackBB <= 40) return "medium";
  return "deep";
}

function ratio(numerator, denominator, digits = 2) {
  return numerator !== null && denominator !== null && denominator > 0
    ? Number((numerator / denominator).toFixed(digits))
    : null;
}

function sprBand(spr) {
  if (spr === null) return "unknown";
  if (spr <= 0.75) return "very_low";
  if (spr <= 1.5) return "low";
  if (spr <= 3) return "medium";
  return "high";
}

export function buildStrategicTableState(tracker, context = {}) {
  if (!tracker) return null;
  const tableSize = Number(context.tableSize || tracker.seatCount || 8);
  const positions = seatsForTableSize(tableSize);
  const occupied = occupiedScreenSeats(context.physicalSeatCount || tracker.seatCount, context.absentSeats);
  const heroSeat = String(context.heroSeat || "").toUpperCase();
  const heroPositionIndex = positions.indexOf(heroSeat);
  const heroStackBehindBB = finiteNonNegative(context.heroStackBehindBB);
  const summary = context.summary || summarizeLocalHand(tracker);
  const potBB = finiteNonNegative(context.potBB ?? summary.potBB);
  const amountToCallBB = finiteNonNegative(context.amountToCallBB ?? summary.amountToCallBB) ?? 0;
  const postCallPotBB = potBB !== null ? Number((potBB + amountToCallBB).toFixed(2)) : null;
  const aggressorScreenSeat = Number.isInteger(Number(summary.lastAggressorSeat))
    ? Number(summary.lastAggressorSeat)
    : null;
  const playersYetToActSeats = new Set(summary.playersYetToActSeats || []);
  const playersWhoCanRespondSeats = new Set(summary.playersWhoCanRespondSeats || []);
  const snapshot = localStackSnapshot(tracker);
  const opponents = Object.values(tracker.seats || {})
    .filter((record) => Number(record?.seat) !== 0 && record?.status !== "absent")
    .map((record) => {
      const screenSeat = Number(record.seat);
      const occupiedOffset = occupied.indexOf(screenSeat);
      const position = heroPositionIndex >= 0 && occupiedOffset >= 0 && occupied.length === positions.length
        ? positions[(heroPositionIndex + occupiedOffset) % positions.length]
        : null;
      const observedStackBehindBB = finiteNonNegative(record.stackBehindBB);
      const currentStackReconciled = localSeatStackReconciled(tracker, screenSeat);
      const stackBehindBB = finiteNonNegative(localSeatCurrentStackBB(tracker, screenSeat));
      const startingStackBB = finiteNonNegative(record.startingStackBB);
      const effectiveStackBB = heroStackBehindBB !== null && stackBehindBB !== null
        ? Math.min(heroStackBehindBB, stackBehindBB)
        : null;
      const postCallEffectiveStackBB = heroStackBehindBB !== null && stackBehindBB !== null
        ? Number(Math.min(Math.max(0, heroStackBehindBB - amountToCallBB), stackBehindBB).toFixed(2))
        : null;
      const heroCoversByBB = heroStackBehindBB !== null && stackBehindBB !== null
        ? Number(Math.max(0, heroStackBehindBB - stackBehindBB).toFixed(2))
        : null;
      const opponentCoversByBB = heroStackBehindBB !== null && stackBehindBB !== null
        ? Number(Math.max(0, stackBehindBB - heroStackBehindBB).toFixed(2))
        : null;
      const yetToAct = summary.heroToAct && summary.actionOrderKnown
        ? playersYetToActSeats.has(screenSeat)
        : null;
      const canRespondToHero = summary.heroToAct && summary.actionOrderKnown
        ? playersWhoCanRespondSeats.has(screenSeat)
        : null;
      const effectiveStackToPotRatio = ratio(effectiveStackBB, potBB);
      const postCallSPR = amountToCallBB > 0
        ? ratio(postCallEffectiveStackBB, postCallPotBB)
        : effectiveStackToPotRatio;
      return {
        screenSeat,
        position,
        status: record.status || "unknown",
        participating: Number(tracker.handCommitted?.[screenSeat] || 0) > 0,
        isAggressor: screenSeat === aggressorScreenSeat,
        currentStreetCommittedBB: finiteNonNegative(tracker.committed?.[screenSeat]) ?? 0,
        handCommittedBB: finiteNonNegative(tracker.handCommitted?.[screenSeat]) ?? 0,
        startingStackBB,
        observedStackBehindBB,
        currentStackReconciled,
        stackDerivedFromOpeningSnapshot: startingStackBB !== null,
        stackBehindBB,
        effectiveStackBB,
        effectiveStackToPotRatio,
        postCallEffectiveStackBB,
        postCallSPR,
        postCallSprBand: sprBand(postCallSPR),
        stackBand: stackBand(stackBehindBB),
        heroCoversByBB,
        opponentCoversByBB,
        heroCoverRatio: heroStackBehindBB !== null && stackBehindBB > 0
          ? Number((heroStackBehindBB / stackBehindBB).toFixed(2))
          : null,
        yetToAct,
        canRespondToHero,
        reshoveCapable: Boolean(yetToAct && stackBehindBB !== null && stackBehindBB > 0 && stackBehindBB <= 25),
        retaliationCapable: Boolean(yetToAct && effectiveStackBB !== null && effectiveStackBB >= 25),
        confidence: finiteNonNegative(record.stackConfidence),
        observedAt: Number(record.stackObservedAt || 0) || null,
      };
    });
  const heroStartingStackBB = heroStackBehindBB === null
    ? null
    : Number((heroStackBehindBB + Number(tracker.handCommitted?.[0] || 0)).toFixed(2));
  const rankedStacks = heroStartingStackBB === null || !snapshot.complete
    ? []
    : [heroStartingStackBB, ...opponents.map((opponent) => opponent.startingStackBB)].sort((a, b) => b - a);
  const heroTableStackRank = rankedStacks.length
    ? rankedStacks.findIndex((stack) => stack <= heroStartingStackBB) + 1
    : null;
  const playersYetToAct = opponents.filter((opponent) => opponent.yetToAct === true);
  const playersWhoCanRespond = opponents.filter((opponent) => opponent.canRespondToHero === true);
  const effectiveStacksAtRisk = playersWhoCanRespond
    .map((opponent) => opponent.effectiveStackBB)
    .filter((value) => value !== null);
  const knownPlayersYetToAct = playersYetToAct.filter((opponent) => opponent.stackBehindBB !== null);
  const relevantStackEvidenceComplete = playersWhoCanRespond.every((opponent) => opponent.stackBehindBB !== null);
  const relevantRejectedReads = playersWhoCanRespond.filter((opponent) => {
    const record = tracker.seats?.[opponent.screenSeat];
    return Number(record?.lastRejectedStack?.observedAt || 0) >= Number(record?.stackObservedAt || 0);
  });
  const relevantConfidences = playersWhoCanRespond
    .map((opponent) => opponent.confidence)
    .filter((value) => value !== null);
  const relevantStackConfidence = relevantConfidences.length
    ? Number((relevantConfidences.reduce((sum, value) => sum + value, 0) / relevantConfidences.length).toFixed(2))
    : snapshot.confidence;
  const missingRelevantOpponentStacks = playersWhoCanRespond
    .filter((opponent) => opponent.stackBehindBB === null)
    .map((opponent) => opponent.position);
  const reconciliationWarningPositions = relevantRejectedReads.map((opponent) => opponent.position);
  const readyForLiveDecision = Boolean(
    summary.heroToAct && summary.actionOrderKnown,
  );
  const tournamentStage = String(context.tournamentStage || "auto").toLowerCase();
  const stageOnlyIcmPressure = ["bubble", "endgame", "bubble_pressure", "late_endgame"].includes(tournamentStage);
  return {
    source: "local_table_tracker",
    trackerHandId: tracker.id,
    street: tracker.street,
    hero: {
      position: heroSeat || null,
      startingStackBB: heroStartingStackBB,
      stackBehindBB: heroStackBehindBB,
      tableStackRank: heroTableStackRank,
    },
    decision: {
      heroToAct: Boolean(summary.heroToAct),
      orderConfidence: summary.orderConfidence || "unknown",
      potBB,
      amountToCallBB,
      postCallPotBB,
      callPotOddsPct: amountToCallBB > 0 && postCallPotBB > 0
        ? Number(((amountToCallBB / postCallPotBB) * 100).toFixed(1))
        : 0,
      callConsumesHeroStackPct: amountToCallBB > 0 && heroStackBehindBB > 0
        ? Number(((amountToCallBB / heroStackBehindBB) * 100).toFixed(1))
        : 0,
      aggressorPosition: opponents.find((opponent) => opponent.isAggressor)?.position || null,
    },
    opponents,
    features: {
      stackSnapshotComplete: snapshot.complete,
      knownOpponentStacks: snapshot.knownSeats.length,
      expectedOpponentStacks: snapshot.expectedSeats.length,
      stackSnapshotConfidence: snapshot.confidence,
      relevantStackEvidenceComplete,
      relevantStackConfidence,
      readyForLiveDecision,
      readyForStackAwareDecision: readyForLiveDecision,
      missingRelevantOpponentStacks,
      reconciliationWarningPositions,
      coveredOpponentCount: opponents.filter((opponent) => !["folded", "folded_candidate"].includes(opponent.status) && Number(opponent.heroCoversByBB) > 0).length,
      meaningfullyCoveredMediumStacks: opponents.filter((opponent) =>
        !["folded", "folded_candidate"].includes(opponent.status) && opponent.stackBehindBB !== null && opponent.stackBehindBB > 10 && opponent.stackBehindBB <= 40 && Number(opponent.heroCoverRatio) >= 1.25,
      ).map((opponent) => opponent.position),
      playersYetToAct: playersYetToAct.map((opponent) => opponent.position),
      playersWhoCanRespond: playersWhoCanRespond.map((opponent) => opponent.position),
      shortestStackBehindBB: knownPlayersYetToAct.length
        ? Math.min(...knownPlayersYetToAct.map((opponent) => opponent.stackBehindBB))
        : null,
      reshoveStacksBehind: playersYetToAct.filter((opponent) => opponent.reshoveCapable).map((opponent) => opponent.position),
      retaliatingStacksBehind: playersYetToAct.filter((opponent) => opponent.retaliationCapable).map((opponent) => opponent.position),
      shortStacksWhoCanRespond: playersWhoCanRespond
        .filter((opponent) => opponent.stackBehindBB !== null && opponent.stackBehindBB <= 10)
        .map((opponent) => opponent.position),
      deepStacksWhoCanRespond: playersWhoCanRespond
        .filter((opponent) => opponent.effectiveStackBB !== null && opponent.effectiveStackBB >= 40)
        .map((opponent) => opponent.position),
      maximumEffectiveStackAtRiskBB: effectiveStacksAtRisk.length
        ? Math.max(...effectiveStacksAtRisk)
        : null,
      icmPressure: stageOnlyIcmPressure
        ? "stage_only_unquantified"
        : "unknown",
    },
    confidence: snapshot.complete && relevantStackEvidenceComplete && relevantRejectedReads.length === 0 &&
      snapshot.confidence >= 0.85 && relevantStackConfidence >= 0.85 && summary.orderConfidence === "confirmed"
      ? "high"
      : relevantStackEvidenceComplete && snapshot.knownSeats.length >= Math.ceil(snapshot.expectedSeats.length / 2)
        ? "medium"
        : "low",
    limitations: [
      ...(!summary.heroToAct || !summary.actionOrderKnown ? ["decision_action_order_not_confirmed"] : []),
      ...(heroStackBehindBB === null ? ["hero_stack_evidence_missing"] : []),
      ...(!relevantStackEvidenceComplete ? ["relevant_opponent_stack_evidence_incomplete"] : []),
      ...(relevantRejectedReads.length ? ["relevant_opponent_stack_reconciliation_warning"] : []),
      ...(stageOnlyIcmPressure ? ["payouts_and_field_state_required_for_actual_icm"] : []),
      ...(!snapshot.complete ? ["full_table_stack_snapshot_incomplete"] : []),
    ],
  };
}
