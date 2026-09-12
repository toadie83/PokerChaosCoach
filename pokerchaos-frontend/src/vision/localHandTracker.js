const MAX_EVENTS = 100;
const DEFAULT_SEAT_COUNT = 8;

function normalizedSeatCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 2 && count <= 10
    ? count
    : DEFAULT_SEAT_COUNT;
}

function initialSeats(seatCount = DEFAULT_SEAT_COUNT, previous = null) {
  return Object.fromEntries(
    Array.from({ length: normalizedSeatCount(seatCount) }, (_, seat) => {
      const prior = previous?.[seat];
      const terminalStatus = ["folded", "all_in", "absent"].includes(prior?.status)
        ? prior.status
        : null;
      return [
        seat,
        {
          seat,
          occupied:
            seat === 0
              ? prior?.status !== "absent"
              : terminalStatus
                ? true
                : (prior?.occupied ?? null),
          status: seat === 0 ? "active" : terminalStatus || "unknown",
          cardsPresent:
            seat === 0 ? true : terminalStatus === "folded" ? false : null,
          committedBB: null,
          stackBehindBB:
            terminalStatus === "all_in" ? 0 : terminalStatus === "absent" ? null : (prior?.stackBehindBB ?? null),
          startingStackBB: terminalStatus === "absent" ? null : (prior?.startingStackBB ?? null),
          stackConfidence: prior?.stackConfidence ?? null,
          stackObservedAt: prior?.stackObservedAt || 0,
          stackSource: prior?.stackSource ?? null,
          openingStackSource: prior?.openingStackSource ?? null,
          stackLocallyConfirmed: prior?.stackLocallyConfirmed ?? false,
          lastRejectedStack: prior?.lastRejectedStack ?? null,
          lastObservedAt: prior?.lastObservedAt || 0,
        },
      ];
    }),
  );
}

function appendEvent(state, event) {
  state.eventSequence = Number(state.eventSequence || 0) + 1;
  state.events.push({
    id: `${state.id}:${state.eventSequence}`,
    handId: state.id,
    street: state.street,
    ...event,
  });
  state.events = state.events.slice(-MAX_EVENTS);
}

function actionLabel(action) {
  return (
    {
      open: "open candidate",
      three_bet: "3-bet candidate",
      four_bet: "4-bet candidate",
      limp: "limp candidate",
      call: "call candidate",
      bet: "bet candidate",
      raise: "raise candidate (level unknown)",
      partial: "partial contribution; action unknown",
      contribution: "contribution observed",
    }[action] || "contribution observed"
  );
}

function isAggressiveAction(action) {
  return ["open", "three_bet", "four_bet", "bet", "raise", "all_in"].includes(
    action,
  );
}

function seatLabel(seat) {
  return Number(seat) === 0 ? "Hero" : `V${seat}`;
}

export function newLocalHand(
  id = 1,
  street = "preflop",
  seatCount = DEFAULT_SEAT_COUNT,
) {
  const count = normalizedSeatCount(seatCount);
  return {
    id,
    street,
    seatCount: count,
    committed: {},
    handCommitted: {},
    carriedPotBB: 0,
    displayedTotalPotBB: null,
    displayedTotalPotConfidence: null,
    displayedTotalPotAt: 0,
    potReconciliation: null,
    lastRejectedTotalPot: null,
    seats: initialSeats(count),
    seatStatus: {},
    cardEvidence: {},
    statusEvidence: {},
    events: [],
    eventSequence: 0,
    highest: street === "preflop" ? null : 0,
    raises: 0,
    baseline: false,
    uncertain: true,
    orderUncertainAt: 0,
    pendingReset: false,
    blinds: null,
    lastAt: 0,
  };
}

export function changeLocalStreet(state, street) {
  if (state.street === street) return state;
  const visibleStreetPot = Object.values(state.committed || {})
    .filter(Number.isFinite)
    .reduce((sum, amount) => sum + amount, 0);
  const carriedPotBB = Number(
    ((state.carriedPotBB || 0) + visibleStreetPot).toFixed(2),
  );
  return {
    ...state,
    street,
    committed: {},
    carriedPotBB,
    seats: initialSeats(state.seatCount, state.seats),
    seatStatus: Object.fromEntries(
      Object.entries(state.seats || {})
        .filter(([, seat]) => ["folded", "all_in", "absent"].includes(seat?.status))
        .map(([seat, record]) => [seat, record.status]),
    ),
    cardEvidence: {},
    statusEvidence: {},
    highest: street === "preflop" ? 1 : 0,
    baseline: false,
    uncertain: true,
    orderUncertainAt: 0,
    raises: 0,
    lastAt: 0,
    pendingReset: false,
  };
}

export function seedLocalBlinds(state, sb, bb) {
  const seatCount = normalizedSeatCount(state.seatCount);
  if (
    state.street !== "preflop" ||
    sb === bb ||
    ![sb, bb].every(
      (seat) => Number.isInteger(seat) && seat >= 0 && seat < seatCount,
    ) ||
    Object.values(state.committed).some((value) => value > 1)
  )
    return state;
  const committed = Object.fromEntries(
    Array.from({ length: seatCount }, (_, seat) => [
      seat,
      seat === bb ? 1 : seat === sb ? 0.5 : 0,
    ]),
  );
  const seats = { ...(state.seats || initialSeats(seatCount)) };
  for (const [seat, amount] of Object.entries(committed)) {
    seats[seat] = {
      ...seats[seat],
      committedBB: amount,
      occupied: seat === "0" ? true : seats[seat]?.occupied,
    };
  }
  return {
    ...state,
    committed,
    handCommitted: { ...committed },
    seats,
    blinds: { sb, bb },
    highest: 1,
    raises: 0,
    baseline: true,
    uncertain: false,
    orderUncertainAt: 0,
    events: [],
    eventSequence: 0,
    lastAt: 0,
    pendingReset: false,
  };
}

export function applyLocalAbsentSeats(state, absentSeats = []) {
  if (!state) return state;
  const absent = new Set((Array.isArray(absentSeats) ? absentSeats : []).map(Number));
  absent.delete(0);
  const next = {
    ...state,
    committed: { ...(state.committed || {}) },
    handCommitted: { ...(state.handCommitted || {}) },
    seats: { ...(state.seats || initialSeats(state.seatCount)) },
    seatStatus: { ...(state.seatStatus || {}) },
    cardEvidence: { ...(state.cardEvidence || {}) },
    statusEvidence: { ...(state.statusEvidence || {}) },
  };
  for (let seat = 1; seat < normalizedSeatCount(state.seatCount); seat += 1) {
    const key = String(seat);
    if (absent.has(seat)) {
      next.seats[key] = {
        ...next.seats[key],
        occupied: false,
        status: "absent",
        cardsPresent: false,
        committedBB: 0,
        stackBehindBB: null,
        startingStackBB: null,
        stackConfidence: null,
        stackObservedAt: 0,
        stackSource: null,
      };
      next.seatStatus[key] = "absent";
      next.committed[key] = 0;
      next.handCommitted[key] = 0;
      delete next.cardEvidence[key];
      delete next.statusEvidence[key];
    } else if (next.seats[key]?.status === "absent") {
      next.seats[key] = {
        ...next.seats[key],
        occupied: null,
        status: "unknown",
        cardsPresent: null,
      };
      delete next.seatStatus[key];
    }
  }
  return next;
}

export function applyLocalCardStates(state, observations, observedAt) {
  if (!Array.isArray(observations) || !observations.length) return state;
  const next = {
    ...state,
    seats: { ...(state.seats || initialSeats(state.seatCount)) },
    seatStatus: { ...(state.seatStatus || {}) },
    cardEvidence: { ...(state.cardEvidence || {}) },
    events: [...state.events],
  };
  for (const observation of observations) {
    const seat = Number(observation.seat);
    if (
      seat === 0 ||
      !Number.isInteger(seat) ||
      seat < 0 ||
      seat >= state.seatCount ||
      state.seats?.[seat]?.status === "absent"
    )
      continue;
    if (typeof observation.cardsPresent !== "boolean") continue;
    const key = String(seat);
    const previous = next.cardEvidence[key];
    const repeats =
      previous?.cardsPresent === observation.cardsPresent
        ? (previous.repeats || 0) + 1
        : 1;
    next.cardEvidence[key] = {
      cardsPresent: observation.cardsPresent,
      repeats,
      observedAt,
    };
    if (repeats < 2) continue;

    const currentStatus = next.seats[key]?.status;
    if (["folded", "all_in", "absent"].includes(currentStatus)) continue;
    const status = observation.cardsPresent ? "active" : "folded_candidate";
    next.seats[key] = {
      ...next.seats[key],
      occupied: observation.cardsPresent
        ? true
        : (next.seats[key]?.occupied ?? null),
      status,
      cardsPresent: observation.cardsPresent,
      lastObservedAt: observedAt,
    };
    if (next.seatStatus[key] === status) continue;
    next.seatStatus[key] = status;
    appendEvent(next, {
      at: observedAt,
      type: "status",
      seat,
      status,
      confirmed: false,
      source: "card_presence",
      text: `${seatLabel(seat)}: ${status === "active" ? "cards present" : "cards absent; fold candidate"}`,
    });
  }
  return next;
}

function acceptedActionEvidence(observation) {
  const label = String(observation?.actionLabel || "")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ");
  const confidence = Number(observation?.confidence);
  if (
    observation?.manualConfirmed === true &&
    ["folded", "all_in"].includes(observation?.status)
  ) {
    return observation.status === "folded" ? "fold" : "all_in";
  }
  if (!Number.isFinite(confidence) || confidence < 75) return null;
  if (["fold", "folded"].includes(label)) return "fold";
  if (["all in", "all-in", "allin"].includes(label)) return "all_in";
  if (["check", "checked"].includes(label)) return "check";
  return null;
}

export function applyLocalSeatEvidence(state, observations, observedAt) {
  if (!Array.isArray(observations) || !observations.length) return state;
  const next = {
    ...state,
    seats: { ...(state.seats || initialSeats(state.seatCount)) },
    seatStatus: { ...(state.seatStatus || {}) },
    statusEvidence: { ...(state.statusEvidence || {}) },
    events: [...state.events],
  };
  for (const observation of observations) {
    const seat = Number(observation.seat);
    if (
      seat === 0 ||
      !Number.isInteger(seat) ||
      seat < 0 ||
      seat >= state.seatCount ||
      state.seats?.[seat]?.status === "absent"
    )
      continue;
    const action = acceptedActionEvidence(observation);
    if (!action) continue;
    const status =
      action === "fold" ? "folded" : action === "all_in" ? "all_in" : "active";
    const key = String(seat);
    const evidenceKey = `${action}:${String(observation.actionLabel || observation.status || "manual")}`;
    const previous = next.statusEvidence[key];
    const repeats =
      observation.manualConfirmed === true || observation.validated === true
        ? 2
        : previous?.evidenceKey === evidenceKey
          ? (previous.repeats || 0) + 1
          : 1;
    next.statusEvidence[key] = {
      evidenceKey,
      action,
      status,
      repeats,
      observedAt,
    };
    if (repeats < 2 || next.seats[key]?.lastActionEvidence === evidenceKey)
      continue;
    next.seats[key] = {
      ...next.seats[key],
      occupied: true,
      status,
      cardsPresent: status === "folded" ? false : next.seats[key]?.cardsPresent,
      stackBehindBB: status === "all_in" ? 0 : next.seats[key]?.stackBehindBB,
      lastObservedAt: observedAt,
      lastAction: action,
      lastActionAt: observedAt,
      lastActionEvidence: evidenceKey,
    };
    next.seatStatus[key] = status;
    appendEvent(next, {
      at: observedAt,
      type: "action",
      action,
      aggressive: false,
      seat,
      status,
      confirmed: true,
      source: observation.manualConfirmed
        ? "manual_confirmation"
        : "action_label",
      text: `${seatLabel(seat)}: ${action === "fold" ? "fold confirmed" : action === "all_in" ? "all-in confirmed" : "check confirmed"}`,
    });
  }
  return next;
}

export function applyLocalStackStates(state, observations, observedAt) {
  if (!Array.isArray(observations) || !observations.length) return state;
  const next = {
    ...state,
    seats: { ...(state.seats || initialSeats(state.seatCount)) },
    seatStatus: { ...(state.seatStatus || {}) },
    events: [...state.events],
  };
  for (const observation of observations) {
    const seat = Number(observation.seat);
    const rawStack = observation.stackBehindBB;
    const stackBehindBB = Number(observation.stackBehindBB);
    if (
      seat === 0 ||
      !Number.isInteger(seat) ||
      seat < 0 ||
      seat >= state.seatCount ||
      state.seats?.[seat]?.status === "absent" ||
      rawStack === null ||
      rawStack === undefined ||
      rawStack === "" ||
      !Number.isFinite(stackBehindBB) ||
      stackBehindBB < 0
    )
      continue;
    const key = String(seat);
    const observationSource =
      observation.source === "replay_vision" ? "replay_vision" : "stack_ocr";
    const previousStack = next.seats[key]?.stackBehindBB;
    const startingStack = next.seats[key]?.startingStackBB;
    const handCommitted = Number(next.handCommitted?.[key] || 0);
    const inferredStartingStack = Number(
      (stackBehindBB + handCommitted).toFixed(2),
    );
    const confidenceValue = Number(
      { high: 0.95, medium: 0.8, low: 0 }[
        String(observation.confidence || "").toLowerCase()
      ] ?? observation.confidence,
    );
    const stackConfidence = Number.isFinite(confidenceValue)
      ? Math.min(
          1,
          Math.max(
            0,
            confidenceValue > 1 ? confidenceValue / 100 : confidenceValue,
          ),
        )
      : (next.seats[key]?.stackConfidence ?? null);
    const rejectionReason =
      Number.isFinite(previousStack) && stackBehindBB > previousStack + 0.55
        ? "stack_increased_during_hand"
        : Number.isFinite(startingStack) &&
            Math.abs(inferredStartingStack - startingStack) > 0.55
          ? "stack_does_not_reconcile_with_committed_bets"
          : null;
    if (rejectionReason) {
      const rejectionKey = `${rejectionReason}:${stackBehindBB}:${handCommitted}`;
      next.seats[key] = {
        ...next.seats[key],
        lastRejectedStack: {
          stackBehindBB,
          handCommittedBB: handCommitted,
          reason: rejectionReason,
          observedAt,
        },
      };
      if (next.seats[key]?.lastRejectedStackKey !== rejectionKey) {
        next.seats[key].lastRejectedStackKey = rejectionKey;
        appendEvent(next, {
          at: observedAt,
          type: "warning",
          seat,
          reason: rejectionReason,
          observedStackBB: stackBehindBB,
          handCommittedBB: handCommitted,
          source: "stack_reconciliation",
          text: `${seatLabel(seat)}: rejected ${stackBehindBB} BB stack; it does not reconcile with this hand`,
        });
      }
      continue;
    }
    next.seats[key] = {
      ...next.seats[key],
      occupied: true,
      stackBehindBB,
      startingStackBB: Number.isFinite(startingStack)
        ? startingStack
        : inferredStartingStack,
      stackConfidence,
      stackObservedAt: observedAt,
      stackSource: observationSource,
      openingStackSource:
        next.seats[key]?.openingStackSource || observationSource,
      stackLocallyConfirmed:
        observationSource === "stack_ocr" ||
        next.seats[key]?.stackLocallyConfirmed === true,
      lastRejectedStack: null,
      lastObservedAt: observedAt,
    };
    if (
      stackBehindBB === 0 &&
      (next.committed[key] || 0) > 0 &&
      next.seats[key].status !== "all_in"
    ) {
      next.seats[key].status = "all_in";
      next.seatStatus[key] = "all_in";
      appendEvent(next, {
        at: observedAt,
        type: "action",
        action: "all_in",
        aggressive: false,
        seat,
        status: "all_in",
        confirmed: true,
        source: observationSource,
        text: `${seatLabel(seat)}: all-in confirmed by 0 BB stack`,
      });
    } else if (previousStack !== stackBehindBB) {
      appendEvent(next, {
        at: observedAt,
        type: "stack",
        seat,
        stackBehindBB,
        confirmed: true,
        source: observationSource,
        text: `${seatLabel(seat)}: ${stackBehindBB} BB behind`,
      });
    }
  }
  return next;
}

export function confirmLocalSeatStatus(
  state,
  seat,
  status,
  observedAt = Date.now(),
) {
  return applyLocalSeatEvidence(
    state,
    [{ seat, status, manualConfirmed: true }],
    observedAt,
  );
}

export function overrideLocalSeatStatus(
  state,
  seat,
  status,
  observedAt = Date.now(),
) {
  const normalizedSeat = Number(seat);
  if (
    !state ||
    normalizedSeat === 0 ||
    !Number.isInteger(normalizedSeat) ||
    normalizedSeat < 0 ||
    normalizedSeat >= normalizedSeatCount(state.seatCount) ||
    !["active", "folded"].includes(status)
  )
    return state;
  const key = String(normalizedSeat);
  if (state.seats?.[key]?.status === status) return state;
  const next = {
    ...state,
    seats: { ...(state.seats || initialSeats(state.seatCount)) },
    seatStatus: { ...(state.seatStatus || {}) },
    cardEvidence: { ...(state.cardEvidence || {}) },
    statusEvidence: { ...(state.statusEvidence || {}) },
    events: [...(state.events || [])],
  };
  delete next.cardEvidence[key];
  delete next.statusEvidence[key];
  next.seats[key] = {
    ...next.seats[key],
    occupied: true,
    status,
    cardsPresent: status === "active",
    lastObservedAt: observedAt,
    lastAction: status === "folded" ? "fold" : "manual_active",
    lastActionAt: observedAt,
    lastActionEvidence: `manual_override:${status}:${observedAt}`,
  };
  next.seatStatus[key] = status;
  appendEvent(next, {
    at: observedAt,
    type: status === "folded" ? "action" : "status",
    action: status === "folded" ? "fold" : undefined,
    aggressive: false,
    seat: normalizedSeat,
    status,
    confirmed: true,
    source: "manual_override",
    text: `${seatLabel(normalizedSeat)}: manually marked ${status}`,
  });
  return next;
}

export function localStackTargetSeats(state) {
  if (state?.street === "preflop") return [];
  const missingSnapshotSeats = Array.from(
    { length: normalizedSeatCount(state?.seatCount) - 1 },
    (_, index) => index + 1,
  ).filter((seat) => state?.seats?.[seat]?.status !== "absent" && !Number.isFinite(state?.seats?.[seat]?.startingStackBB));
  const participatingSeats = localParticipatingOpponentSeats(state).filter(
    (seat) => state?.seats?.[seat]?.status !== "all_in",
  );
  return [...new Set([...missingSnapshotSeats, ...participatingSeats])];
}

export function localStackSnapshot(state) {
  const opponentSeats = Array.from(
    { length: normalizedSeatCount(state?.seatCount) - 1 },
    (_, index) => index + 1,
  ).filter((seat) => state?.seats?.[seat]?.status !== "absent");
  const knownSeats = opponentSeats.filter((seat) =>
    Number.isFinite(state?.seats?.[seat]?.startingStackBB),
  );
  return {
    expectedSeats: opponentSeats,
    knownSeats,
    missingSeats: opponentSeats.filter((seat) => !knownSeats.includes(seat)),
    complete: knownSeats.length === opponentSeats.length,
    confidence: knownSeats.length
      ? Number(
          (
            knownSeats.reduce(
              (sum, seat) =>
                sum + Number(state.seats[seat].stackConfidence || 0),
              0,
            ) / knownSeats.length
          ).toFixed(2),
        )
      : 0,
  };
}

export function localSeatCurrentStackBB(state, seat) {
  const record = state?.seats?.[seat];
  if (record?.status === "all_in") return 0;
  const hasStartingStack =
    record?.startingStackBB !== null &&
    record?.startingStackBB !== undefined &&
    record?.startingStackBB !== "";
  const startingStackBB = Number(record?.startingStackBB);
  const handCommittedBB = Number(state?.handCommitted?.[seat] || 0);
  if (
    hasStartingStack &&
    Number.isFinite(startingStackBB) &&
    startingStackBB >= 0 &&
    Number.isFinite(handCommittedBB)
  ) {
    return Number(Math.max(0, startingStackBB - handCommittedBB).toFixed(2));
  }
  const hasObservedStack =
    record?.stackBehindBB !== null &&
    record?.stackBehindBB !== undefined &&
    record?.stackBehindBB !== "";
  const observedStackBehindBB = Number(record?.stackBehindBB);
  return hasObservedStack &&
    Number.isFinite(observedStackBehindBB) &&
    observedStackBehindBB >= 0
    ? observedStackBehindBB
    : null;
}

export function localSeatStackReconciled(state, seat, toleranceBB = 0.55) {
  const record = state?.seats?.[seat];
  if (
    record?.startingStackBB === null ||
    record?.startingStackBB === undefined ||
    record?.stackBehindBB === null ||
    record?.stackBehindBB === undefined
  )
    return false;
  const startingStackBB = Number(record?.startingStackBB);
  const stackBehindBB = Number(record?.stackBehindBB);
  const handCommittedBB = Number(state?.handCommitted?.[seat] || 0);
  return (
    Number.isFinite(startingStackBB) &&
    Number.isFinite(stackBehindBB) &&
    Math.abs(startingStackBB - handCommittedBB - stackBehindBB) <= toleranceBB
  );
}

export function localParticipatingOpponentSeats(state) {
  return Object.values(state?.seats || {})
    .filter((record) => {
      const seat = Number(record?.seat);
      const handCommitted = Number(state?.handCommitted?.[seat]);
      return (
        Number.isInteger(seat) &&
        seat !== 0 &&
        Number.isFinite(handCommitted) &&
        handCommitted > 0 &&
        !["folded", "folded_candidate", "absent"].includes(record?.status)
      );
    })
    .map((record) => Number(record.seat));
}

export function applyLocalAmounts(state, readings, capturedAt) {
  if (capturedAt <= state.lastAt) return state;
  const next = {
    ...state,
    committed: { ...state.committed },
    handCommitted: { ...(state.handCommitted || {}) },
    seats: { ...(state.seats || initialSeats(state.seatCount)) },
    events: [...state.events],
    lastAt: capturedAt,
  };
  const accepted = (Array.isArray(readings) ? readings : []).filter(
    (reading) =>
      Number.isInteger(Number(reading.seat)) &&
      Number(reading.seat) >= 0 &&
      Number(reading.seat) < state.seatCount &&
      state.seats?.[reading.seat]?.status !== "absent" &&
      Number.isFinite(reading.amountBB) &&
      reading.amountBB >= 0,
  );
  const changed = accepted.filter(
    (reading) => state.committed[reading.seat] !== reading.amountBB,
  );
  const decreases = changed.some(
    (reading) =>
      Number.isFinite(state.committed[reading.seat]) &&
      reading.amountBB < state.committed[reading.seat],
  );
  if (decreases) {
    const rejectedDecreaseKey = changed
      .filter(
        (reading) =>
          Number.isFinite(state.committed[reading.seat]) &&
          reading.amountBB < state.committed[reading.seat],
      )
      .map(
        (reading) =>
          `${reading.seat}:${state.committed[reading.seat]}:${reading.amountBB}`,
      )
      .sort()
      .join("|");
    next.lastRejectedContributionKey = rejectedDecreaseKey;
    if (state.lastRejectedContributionKey !== rejectedDecreaseKey) {
      appendEvent(next, {
        at: capturedAt,
        type: "warning",
        reason: "contribution_decrease",
        ambiguous: true,
        text: "Rejected a decreasing contribution read; waiting for the board/hand watcher to confirm a reset.",
      });
    }
    return next;
  }
  if (state.pendingReset) return next;

  const ambiguousBatch = changed.length > 1;
  if (ambiguousBatch) {
    next.uncertain = true;
    // Simultaneous calls/completions at or below the established high do not
    // invalidate an already-known aggressor. Only a batch containing a new
    // high can conceal who raised and must hold back the decision handoff.
    if (
      changed.some((reading) => reading.amountBB > Number(state.highest ?? 0))
    ) {
      next.orderUncertainAt = capturedAt;
    }
  }
  for (const reading of changed) {
    const seat = Number(reading.seat);
    const before = state.committed[seat];
    let action = "contribution";
    if (!ambiguousBatch && state.highest !== null) {
      if (reading.amountBB > state.highest) {
        if (state.street === "preflop" && state.baseline) {
          const voluntaryContributionExists = Object.values(
            state.committed,
          ).some((amount) => Number.isFinite(amount) && amount > 1);
          action =
            state.raises === 0 && !voluntaryContributionExists
              ? "open"
              : state.raises <= 1
                ? "three_bet"
                : "four_bet";
        } else {
          action =
            state.street !== "preflop" && state.highest === 0 ? "bet" : "raise";
        }
        next.raises++;
      } else if (
        reading.amountBB === state.highest &&
        Number.isFinite(before) &&
        reading.amountBB > before
      ) {
        action =
          state.street === "preflop" && state.highest === 1 && before === 0
            ? "limp"
            : "call";
      } else if (Number.isFinite(before) && reading.amountBB > before) {
        action = "partial";
      }
    }
    appendEvent(next, {
      at: capturedAt,
      type: "action",
      action,
      aggressive: isAggressiveAction(action),
      seat,
      beforeBB: before ?? null,
      toBB: reading.amountBB,
      ambiguous: ambiguousBatch,
      source: "bet_ocr",
      text: `${seatLabel(seat)}: ${actionLabel(action)}, ${reading.amountBB} BB`,
    });
    next.committed[seat] = reading.amountBB;
    next.handCommitted[seat] = Number(
      (
        (next.handCommitted[seat] || 0) +
        reading.amountBB -
        (Number.isFinite(before) ? before : 0)
      ).toFixed(2),
    );
    next.seats[seat] = {
      ...next.seats[seat],
      occupied: true,
      committedBB: reading.amountBB,
      lastObservedAt: capturedAt,
    };
  }
  if (accepted.length)
    next.highest = Math.max(
      state.highest ?? 0,
      ...accepted.map((reading) => reading.amountBB),
    );
  return next;
}

export function applyLocalTotalPot(
  state,
  reading,
  capturedAt,
  { anteTotalBB = 0 } = {},
) {
  if (
    state?.street === "preflop" ||
    !reading ||
    !Number.isFinite(Number(reading.amountBB)) ||
    Number(reading.amountBB) <= 0 ||
    Number(capturedAt) < Number(state?.displayedTotalPotAt || 0)
  ) {
    return state;
  }
  const amountBB = Number(Number(reading.amountBB).toFixed(2));
  const previousBB = Number(state?.displayedTotalPotBB);
  if (Number.isFinite(previousBB) && amountBB < previousBB - 0.05) {
    return {
      ...state,
      lastRejectedTotalPot: {
        amountBB,
        previousBB,
        capturedAt,
        reason: "total_pot_decreased_during_hand",
      },
    };
  }
  const visibleStreetPot = Object.values(state?.committed || {})
    .filter(Number.isFinite)
    .reduce((sum, amount) => sum + amount, 0);
  const calculatedPotBB = Number(
    (
      Number(state?.carriedPotBB || 0) +
      visibleStreetPot +
      Math.max(0, Number(anteTotalBB) || 0)
    ).toFixed(2),
  );
  const deltaBB = Number((amountBB - calculatedPotBB).toFixed(2));
  const toleranceBB = Math.max(0.2, Number((amountBB * 0.03).toFixed(2)));
  return {
    ...state,
    displayedTotalPotBB: amountBB,
    displayedTotalPotConfidence: Number.isFinite(Number(reading.confidence))
      ? Number(reading.confidence)
      : null,
    displayedTotalPotAt: Number(capturedAt),
    potReconciliation: {
      displayedTotalPotBB: amountBB,
      calculatedPotBB,
      deltaBB,
      toleranceBB,
      status: Math.abs(deltaBB) <= toleranceBB
        ? "confirmed"
        : "displayed_override",
    },
    lastRejectedTotalPot: null,
  };
}

export function appendLocalDebug(buffer, batch, enabled) {
  if (!enabled) return [];
  return [
    ...buffer.filter((item) => batch.capturedAt - item.capturedAt <= 10000),
    batch,
  ].slice(-8);
}

function seatActionCompletion(record, commitment, highest) {
  if (["folded", "all_in", "absent"].includes(record?.status)) return "confirmed";
  if (record?.status === "active" && Number(commitment || 0) >= highest)
    return "confirmed";
  if (record?.status === "folded_candidate") return "provisional_fold";
  return "waiting";
}

function seatsClockwiseUntil(start, stop, seatCount) {
  const result = [];
  for (let offset = 0; offset < seatCount; offset += 1) {
    const seat = (start + offset) % seatCount;
    if (seat === stop) break;
    result.push(seat);
  }
  return result;
}

function seatCanAct(record) {
  return !["folded", "folded_candidate", "all_in", "absent"].includes(record?.status);
}

export function summarizeLocalHand(state) {
  const committed = state?.committed || {};
  const seatCount = normalizedSeatCount(state?.seatCount);
  const highest = Object.values(committed)
    .filter(Number.isFinite)
    .reduce((max, amount) => Math.max(max, amount), 0);
  const hero = Number.isFinite(committed[0]) ? committed[0] : 0;
  const streetEvents = (state?.events || []).filter(
    (event) => event?.street === state?.street,
  );
  const latest = [...streetEvents].reverse().find((event) => event?.text);
  const aggression = [...streetEvents]
    .reverse()
    .find(
      (event) =>
        event?.type === "action" &&
        event?.aggressive === true &&
        event?.ambiguous !== true &&
        Number.isInteger(event?.seat),
    );
  const statuses = state?.seats || {};
  const heroActionAt =
    [...streetEvents]
      .reverse()
      .find(
        (event) =>
          Number(event?.seat) === 0 &&
          event?.type === "action" &&
          event?.action !== "fold",
      )?.at || 0;
  const waitingSeats = [];
  const provisionalFoldSeats = [];
  let heroToAct = false;
  let decisionType = null;
  let decisionClosingSeat = null;
  let actionOrderKnown = !state?.pendingReset;
  const unresolvedAfterAggression =
    Number(state?.orderUncertainAt || 0) >= Number(aggression?.at || 0) &&
    Number(state?.orderUncertainAt || 0) > 0;

  if (state?.pendingReset || unresolvedAfterAggression)
    actionOrderKnown = false;
  if (aggression && Number(aggression.seat) !== 0 && actionOrderKnown) {
    const aggressor = Number(aggression.seat);
    const aggressionIsCurrent =
      Number(aggression.at) >= Number(heroActionAt || 0);
    if (aggressionIsCurrent && hero < highest) {
      for (const seat of seatsClockwiseUntil(
        (aggressor + 1) % seatCount,
        0,
        seatCount,
      )) {
        const record = statuses[seat];
        const completion = seatActionCompletion(
          record,
          record?.committedBB ?? committed[seat],
          highest,
        );
        if (completion === "provisional_fold") provisionalFoldSeats.push(seat);
        else if (completion === "waiting") {
          actionOrderKnown = false;
          waitingSeats.push(seat);
        }
      }
      heroToAct = actionOrderKnown && waitingSeats.length === 0;
      decisionType = aggression.action;
      decisionClosingSeat = aggressor;
    }
  } else if (
    !aggression &&
    state?.street === "preflop" &&
    state?.baseline &&
    state?.blinds &&
    actionOrderKnown
  ) {
    const firstActor = (Number(state.blinds.bb) + 1) % seatCount;
    const beforeHero = seatsClockwiseUntil(firstActor, 0, seatCount);
    for (const seat of beforeHero) {
      const record = statuses[seat];
      const completion = seatActionCompletion(
        record,
        record?.committedBB ?? committed[seat],
        highest,
      );
      if (completion === "provisional_fold") provisionalFoldSeats.push(seat);
      else if (completion === "waiting") {
        actionOrderKnown = false;
        waitingSeats.push(seat);
      }
    }
    heroToAct = actionOrderKnown && waitingSeats.length === 0;
    decisionType = Object.entries(committed).some(
      ([seat, amount]) =>
        Number(seat) !== Number(state.blinds.sb) &&
        Number(seat) !== Number(state.blinds.bb) &&
        Number(amount) === 1,
    )
      ? "limp"
      : "unopened";
    decisionClosingSeat = firstActor;
  } else if (
    !aggression &&
    state?.street !== "preflop" &&
    state?.blinds &&
    actionOrderKnown
  ) {
    const firstActor = Number(state.blinds.sb);
    const beforeHero = seatsClockwiseUntil(firstActor, 0, seatCount);
    let checksObserved = 0;
    for (const seat of beforeHero) {
      const record = statuses[seat];
      const terminal = ["folded", "all_in", "absent"].includes(record?.status);
      const provisionalFold = record?.status === "folded_candidate";
      const checkedThisStreet = streetEvents.some(
        (event) =>
          event.type === "action" &&
          event.action === "check" &&
          Number(event.seat) === seat,
      );
      if (checkedThisStreet) checksObserved += 1;
      if (provisionalFold) provisionalFoldSeats.push(seat);
      else if (!terminal && !checkedThisStreet) {
        actionOrderKnown = false;
        waitingSeats.push(seat);
      }
    }
    heroToAct = actionOrderKnown && waitingSeats.length === 0;
    decisionType = checksObserved > 0 ? "checked_to_me" : "first_to_act";
    decisionClosingSeat = firstActor;
  }

  const playersYetToActSeats =
    heroToAct && Number.isInteger(decisionClosingSeat)
      ? seatsClockwiseUntil(1, decisionClosingSeat, seatCount).filter((seat) =>
          seatCanAct(statuses[seat]),
        )
      : [];
  const playersWhoCanRespondSeats = heroToAct
    ? Array.from({ length: seatCount - 1 }, (_, index) => index + 1)
        .filter((seat) => seatCanAct(statuses[seat]))
        .filter(
          (seat) =>
            playersYetToActSeats.includes(seat) ||
            Number(state?.handCommitted?.[seat] || 0) > 0,
        )
    : [];

  const confirmedFoldedSeats = Object.entries(statuses)
    .filter(([, seat]) => seat?.status === "folded")
    .map(([seat]) => Number(seat));
  const activeSeats = Object.entries(statuses)
    .filter(([, seat]) => seat?.status === "active")
    .map(([seat]) => Number(seat));
  const callerSeats = aggression
    ? Object.entries(committed)
        .filter(
          ([seat, amount]) =>
            Number(seat) !== Number(aggression.seat) &&
            Number(seat) !== 0 &&
            Number(amount) === highest,
        )
        .map(([seat]) => Number(seat))
    : [];
  const visiblePotBB = Object.values(committed)
    .filter(Number.isFinite)
    .reduce((sum, amount) => sum + amount, 0);
  const calculatedPotBB = Number(
    ((state?.carriedPotBB || 0) + visiblePotBB).toFixed(2),
  );
  const displayedTotalPotBB = Number(state?.displayedTotalPotBB);
  const hasDisplayedTotalPot =
    state?.street !== "preflop" &&
    Number.isFinite(displayedTotalPotBB) &&
    displayedTotalPotBB > 0;
  const participatingOpponentSeats = localParticipatingOpponentSeats(state);
  const stackSnapshot = localStackSnapshot(state);
  const activeOpponentSeats = participatingOpponentSeats
    .map((seat) => statuses[seat])
    .filter((seat) => ["active", "all_in", "unknown"].includes(seat?.status));
  const stackOpponent = aggression
    ? statuses[aggression.seat]
    : activeOpponentSeats.length === 1
      ? activeOpponentSeats[0]
      : null;
  const stackOpponentSeat = Number(stackOpponent?.seat);
  const aggressorStack = Number.isInteger(stackOpponentSeat)
    ? localSeatCurrentStackBB(state, stackOpponentSeat)
    : null;
  const heroStack = statuses[0]?.stackBehindBB;
  const knownEffectiveStacks = [heroStack, aggressorStack].filter(
    Number.isFinite,
  );

  return {
    handId: state?.id ?? null,
    street: state?.street || "unknown",
    seatCount,
    highestBB: highest,
    heroCommittedBB: hero,
    amountToCallBB: Math.max(0, highest - hero),
    visiblePotBB: Number(visiblePotBB.toFixed(2)),
    potBB: hasDisplayedTotalPot ? displayedTotalPotBB : calculatedPotBB,
    calculatedPotBB,
    displayedTotalPotBB: hasDisplayedTotalPot ? displayedTotalPotBB : null,
    potSource: hasDisplayedTotalPot ? "table_display" : "calculated_ledger",
    potReconciliation: hasDisplayedTotalPot
      ? state?.potReconciliation || null
      : null,
    contributors: Object.values(committed).filter(
      (amount) => Number.isFinite(amount) && amount > 0,
    ).length,
    activeSeats,
    participatingOpponentSeats,
    stackSnapshot,
    foldedCandidates: Object.entries(statuses)
      .filter(([, seat]) => seat?.status === "folded_candidate")
      .map(([seat]) => Number(seat)),
    confirmedFoldedSeats,
    allInSeats: Object.entries(statuses)
      .filter(([, seat]) => seat?.status === "all_in")
      .map(([seat]) => Number(seat)),
    heroToAct,
    actionOrderKnown,
    orderConfidence: heroToAct
      ? provisionalFoldSeats.length
        ? "provisional"
        : "confirmed"
      : "unknown",
    provisionalFoldSeats,
    decisionType,
    decisionClosingSeat,
    waitingSeats,
    orderBlockedReason: state?.pendingReset
      ? "pending_reset"
      : unresolvedAfterAggression
        ? "ambiguous_aggression"
        : waitingSeats.length
          ? "waiting_for_seats"
          : null,
    playersYetToActSeats,
    playersWhoCanRespondSeats,
    callerSeats,
    callers: callerSeats.length,
    lastAction: latest?.text || "Waiting for confirmed contribution changes.",
    lastAggressorSeat: aggression?.seat ?? null,
    lastAggressionEventId: aggression?.id ?? null,
    opponentStackBehindBB: Number.isFinite(aggressorStack)
      ? aggressorStack
      : null,
    opponentStackSeat: Number.isInteger(stackOpponentSeat)
      ? stackOpponentSeat
      : null,
    effectiveStackBB:
      knownEffectiveStacks.length === 2
        ? Math.min(...knownEffectiveStacks)
        : null,
    uncertain: Boolean(
      state?.uncertain ||
      state?.pendingReset ||
      unresolvedAfterAggression ||
      provisionalFoldSeats.length,
    ),
  };
}
