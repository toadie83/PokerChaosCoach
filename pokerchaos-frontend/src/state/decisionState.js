import { seatsForTableSize } from "./seatUtils.js";

export const HERO_ACTION_CODES = new Set([
  "hero_fold",
  "hero_check",
  "hero_call",
  "hero_open",
  "hero_bet",
  "hero_raise",
  "hero_3bet",
  "hero_4bet",
  "hero_jam",
]);

export const HERO_ACTION_BY_CODE = {
  hero_fold: "fold",
  hero_check: "check",
  hero_call: "call",
  hero_open: "open",
  hero_bet: "bet",
  hero_raise: "raise",
  hero_3bet: "3-bet",
  hero_4bet: "4-bet",
  hero_jam: "jam",
};

const RESPONSE_ACTION_ALIASES = {
  shove: "jam",
  "all-in": "jam",
  allin: "jam",
  reraise: "raise",
  "re-raise": "raise",
  threebet: "3-bet",
  fourbet: "4-bet",
};

export function normalizePokerAction(value) {
  const action = String(value || "").trim().toLowerCase();
  return RESPONSE_ACTION_ALIASES[action] || action;
}

const CONTINUING_HERO_ACTIONS = new Set([
  "check",
  "call",
  "open",
  "bet",
  "raise",
  "3-bet",
  "4-bet",
  "jam",
]);

const HERO_CODE_FOR_ACTION = {
  check: "hero_check",
  call: "hero_call",
  open: "hero_open",
  bet: "hero_bet",
  raise: "hero_raise",
  "3-bet": "hero_3bet",
  "4-bet": "hero_4bet",
  jam: "hero_jam",
};

export function reopenAssumedFoldForVision(state = {}) {
  if (
    !state.handComplete ||
    !state.lastEventAssumed ||
    state.lastEvent !== "hero_fold"
  ) {
    return state;
  }

  const recommendedAlternative = normalizePokerAction(
    state.lastRecommendation?.alternative_action,
  );
  const continuedAction = CONTINUING_HERO_ACTIONS.has(recommendedAlternative)
    ? recommendedAlternative
    : state.facingAction
      ? "call"
      : "open";
  const continuedCode = HERO_CODE_FOR_ACTION[continuedAction];
  const street = String(state.street || "preflop");
  const history = Array.isArray(state.history) ? [...state.history] : [];
  const foldHistoryIndex = history.findLastIndex(
    (row) =>
      row?.actor === "hero" &&
      row?.action === "fold" &&
      row?.street === street &&
      row?.note === "Coach line assumed",
  );
  if (foldHistoryIndex < 0 || !continuedCode) return state;

  const callAmountBB = continuedAction === "call"
    ? finitePositiveOrNull(state.facingAction?.callAmountBB)
    : null;
  const toAmountBB = continuedAction === "call"
    ? finitePositiveOrNull(
        state.facingAction?.toAmountBB ?? state.facingAction?.amountBB,
      )
    : null;
  history[foldHistoryIndex] = {
    ...history[foldHistoryIndex],
    action: continuedAction,
    amountBB: callAmountBB,
    toAmountBB,
    note: "Coach alternative inferred from replay",
  };

  const foldActionCode = `${street}_hero_fold`;
  const actions = Array.isArray(state.actions) ? [...state.actions] : [];
  const foldActionIndex = actions.findLastIndex(
    (row) => row?.code === foldActionCode,
  );
  const nextActions = actions
    .map((row, index) =>
      index === foldActionIndex
        ? { ...row, code: `${street}_${continuedCode}` }
        : row,
    )
    .filter(
      (row, index) =>
        !(foldActionIndex >= 0 && index > foldActionIndex && row?.code === "hand_complete"),
    );

  const previousActions = Array.isArray(state.previousActions)
    ? [...state.previousActions]
    : [];
  const foldPreviousIndex = previousActions.lastIndexOf(foldActionCode);
  const nextPreviousActions = previousActions
    .map((code, index) =>
      index === foldPreviousIndex ? `${street}_${continuedCode}` : code,
    )
    .filter(
      (code, index) =>
        !(
          foldPreviousIndex >= 0 &&
          index > foldPreviousIndex &&
          code === "hand_complete"
        ),
    );
  const potBeforeContinuation = finitePositiveOrNull(
    state.estimatedPotBB ?? state.potSizes?.total,
  );
  const estimatedPotBB = callAmountBB && potBeforeContinuation
    ? Number((potBeforeContinuation + callAmountBB).toFixed(2))
    : state.estimatedPotBB;

  return {
    ...state,
    actions: nextActions,
    previousActions: nextPreviousActions,
    history,
    estimatedPotBB,
    handComplete: false,
    nextActor: "await_street",
    lastEvent: continuedCode,
    lastEventAt: 0,
    lastEventAssumed: false,
    lastComparison: null,
  };
}

export function normalizeActionEvent(event) {
  if (typeof event === "string") return { code: event };
  if (!event || typeof event !== "object") return { code: "" };
  return {
    ...event,
    code: String(event.code || ""),
    amountBB: finitePositiveOrNull(event.amountBB),
    toAmountBB: finitePositiveOrNull(event.toAmountBB),
  };
}

export function finitePositiveOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Number(numeric.toFixed(2))
    : null;
}

export function postflopSeatOrder(tableSize = 8) {
  const seats = seatsForTableSize(Number(tableSize));
  return ["SB", "BB", ...seats.filter((seat) => seat !== "SB" && seat !== "BB")];
}

export function preflopPlayersYetToAct(state = {}) {
  if (String(state.street || "preflop").toLowerCase() !== "preflop") return [];
  const decisionKind = String(state.decisionKind || "").toLowerCase();
  if (
    ![
      "unopened",
      "limped",
      "facing_open",
      "facing_open_callers",
      "facing_open_and_3bet",
    ].includes(
      decisionKind,
    )
  ) {
    return [];
  }
  const seats = seatsForTableSize(Number(state.tableSize || 8));
  const heroSeat = String(state.heroSeat || "").toUpperCase();
  const heroIndex = seats.indexOf(heroSeat);
  if (heroIndex < 0) return [];
  return seats.slice(heroIndex + 1);
}

function isUnambiguousPreflopStackOffHand(heroCards = {}) {
  const cards = [heroCards?.card1, heroCards?.card2]
    .map((card) => String(card || "").trim().toUpperCase())
    .filter((card) => /^[AKQJT2-9][SHDC]$/.test(card));
  if (cards.length !== 2) return false;
  const ranks = cards.map((card) => card[0]);
  if (ranks[0] === ranks[1]) return ["A", "K", "Q"].includes(ranks[0]);
  return ranks.includes("A") && ranks.includes("K");
}

export function deriveRelativePosition(state = {}) {
  const explicit = String(state.heroRelativePosition || "auto").toLowerCase();
  if (explicit === "ip" || explicit === "oop") return explicit;
  if (state.street === "preflop") return "not_applicable";
  if (Number(state.playersInHand || 2) > 2) return "unknown";
  const heroSeat = String(state.heroSeat || "").toUpperCase();
  const opponentSeat = String(state.opponentSeat || "").toUpperCase();
  if (!heroSeat || !opponentSeat || heroSeat === opponentSeat) return "unknown";
  const order = postflopSeatOrder(state.tableSize);
  const heroIndex = order.indexOf(heroSeat);
  const opponentIndex = order.indexOf(opponentSeat);
  if (heroIndex < 0 || opponentIndex < 0) return "unknown";
  return heroIndex > opponentIndex ? "ip" : "oop";
}

export function legalActionsForDecision(kind, state = {}) {
  const heroSeat = String(state.heroSeat || "").toUpperCase();
  switch (kind) {
    case "unopened":
      return heroSeat === "BB" ? ["check", "raise", "jam"] : ["fold", "open", "jam"];
    case "limped":
      return heroSeat === "BB"
        ? ["check", "raise", "jam"]
        : ["fold", "call", "raise", "jam"];
    case "facing_open":
    case "facing_open_callers":
      return ["fold", "call", "3-bet", "jam"];
    case "facing_3bet":
    case "facing_open_and_3bet":
      return ["fold", "call", "4-bet", "jam"];
    case "facing_4bet":
      return ["fold", "call", "jam"];
    case "postflop_open":
    case "checked_to_hero":
      return ["check", "bet", "jam"];
    case "facing_bet":
    case "facing_raise":
      return ["fold", "call", "raise", "jam"];
    case "facing_allin":
      return ["fold", "call"];
    default:
      return [];
  }
}

export function actionCodeForLegalAction(action) {
  const normalized = normalizePokerAction(action);
  const map = {
    fold: "hero_fold",
    check: "hero_check",
    call: "hero_call",
    open: "hero_open",
    bet: "hero_bet",
    raise: "hero_raise",
    "3-bet": "hero_3bet",
    "4-bet": "hero_4bet",
    jam: "hero_jam",
  };
  return map[normalized] || "";
}

function sizingPresets(action, state = {}) {
  const pot =
    finitePositiveOrNull(state.estimatedPotBB) ||
    finitePositiveOrNull(state.potSizes?.total);
  if (action === "open") return [2, 2.2, 2.5, 3, 3.5];
  if (action === "3-bet") return [6, 7, 8, 9, 10];
  if (action === "4-bet") return [14, 16, 18, 20, 24];
  if ((action === "bet" || action === "raise") && pot) {
    return [0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.25].map((ratio) =>
      Number((pot * ratio).toFixed(2)),
    );
  }
  if (action === "bet" || action === "raise") return [1, 2, 3, 5, 8];
  return [];
}

export function heroActionOptions(state = {}) {
  const minimumRaiseToBB = minimumRaiseToForDecision(state);
  const maxHeroTotalToBB = buildDecisionNode(state).maxHeroTotalToBB;
  return (Array.isArray(state.legalActions) ? state.legalActions : [])
    .map(normalizePokerAction)
    .filter(Boolean)
    .map((action) => {
      const minAmountBB = ["raise", "3-bet", "4-bet"].includes(action)
        ? minimumRaiseToBB
        : action === "open"
          ? 2
          : action === "bet"
            ? 1
            : null;
      const presets = sizingPresets(action, state).filter(
        (amount) =>
          (!minAmountBB || amount >= minAmountBB) &&
          (!maxHeroTotalToBB || amount <= maxHeroTotalToBB),
      );
      if (
        minAmountBB &&
        (!maxHeroTotalToBB || minAmountBB <= maxHeroTotalToBB) &&
        !presets.includes(minAmountBB)
      ) {
        presets.unshift(minAmountBB);
      }
      return {
        code: actionCodeForLegalAction(action),
        label: action === "jam" ? "All-in" : action.replace(/^./, (c) => c.toUpperCase()),
        action,
        requiresAmount: ["open", "bet", "raise", "3-bet", "4-bet"].includes(action),
        amountLabel: ["open", "3-bet", "4-bet", "raise"].includes(action)
          ? "Raise to (BB)"
          : "Bet amount (BB)",
        minAmountBB,
        presets,
      };
    })
    .filter((option) => option.code);
}

function boardCards(state = {}) {
  return [
    ...(Array.isArray(state.board?.flop) ? state.board.flop : []),
    state.board?.turn,
    state.board?.river,
  ].filter(Boolean);
}

function forcedBlindCommitment(seat, street) {
  if (street !== "preflop") return 0;
  const normalizedSeat = String(seat || "").toUpperCase();
  if (normalizedSeat === "SB") return 0.5;
  if (normalizedSeat === "BB") return 1;
  return 0;
}

/**
 * Rebuild each tracked player's current-street commitment from the canonical
 * action history. Raise/open sizes are "to" amounts; calls record both the
 * additional chips and the resulting street commitment when known.
 */
export function streetCommitments(state = {}, street = state.street || "preflop") {
  const committed = {
    hero: forcedBlindCommitment(state.heroSeat, street),
    opp: forcedBlindCommitment(state.opponentSeat, street),
  };
  const rows = Array.isArray(state.history) ? state.history : [];

  for (const row of rows) {
    if (String(row?.street || "") !== street) continue;
    const actor = row?.actor === "hero" ? "hero" : row?.actor === "opp" ? "opp" : null;
    if (!actor) continue;
    const action = normalizePokerAction(row?.action);
    if (["fold", "check"].includes(action)) continue;

    const toAmountBB = finitePositiveOrNull(row?.toAmountBB);
    const amountBB = finitePositiveOrNull(row?.amountBB);
    if (toAmountBB) {
      committed[actor] = Math.max(committed[actor], toAmountBB);
      continue;
    }
    if (action === "call" && amountBB) {
      committed[actor] = Number((committed[actor] + amountBB).toFixed(2));
      continue;
    }
    if (amountBB) committed[actor] = Math.max(committed[actor], amountBB);
  }

  return {
    heroCommittedBB: Number(committed.hero.toFixed(2)),
    opponentCommittedBB: Number(committed.opp.toFixed(2)),
    currentBetBB: Number(Math.max(committed.hero, committed.opp).toFixed(2)),
  };
}

/**
 * Reconstruct total chips invested by the tracked Hero and primary opponent
 * across the hand. Each street keeps its own "to" amount while the returned
 * totals include forced blinds exactly once.
 */
export function handCommitments(state = {}) {
  const totals = { hero: 0, opp: 0 };
  const byStreet = new Map();

  const commitmentForStreet = (street) => {
    const normalizedStreet = String(street || "preflop");
    if (!byStreet.has(normalizedStreet)) {
      const heroForced = forcedBlindCommitment(state.heroSeat, normalizedStreet);
      const opponentForced = forcedBlindCommitment(
        state.opponentSeat,
        normalizedStreet,
      );
      byStreet.set(normalizedStreet, {
        hero: heroForced,
        opp: opponentForced,
      });
      totals.hero += heroForced;
      totals.opp += opponentForced;
    }
    return byStreet.get(normalizedStreet);
  };

  // Blinds count even before an action has been recorded.
  commitmentForStreet("preflop");

  for (const row of Array.isArray(state.history) ? state.history : []) {
    const actor = row?.actor === "hero" ? "hero" : row?.actor === "opp" ? "opp" : null;
    if (!actor) continue;
    const action = normalizePokerAction(row?.action);
    if (["fold", "check"].includes(action)) continue;

    const streetCommitment = commitmentForStreet(row?.street || "preflop");
    const before = Number(streetCommitment[actor] || 0);
    const toAmountBB = finitePositiveOrNull(row?.toAmountBB);
    const amountBB = finitePositiveOrNull(row?.amountBB);
    const after = toAmountBB
      ? Math.max(before, toAmountBB)
      : amountBB
        ? Number((before + amountBB).toFixed(2))
        : before;
    const contribution = Math.max(0, Number((after - before).toFixed(2)));
    streetCommitment[actor] = after;
    totals[actor] = Number((totals[actor] + contribution).toFixed(2));
  }

  const current = commitmentForStreet(state.street || "preflop");
  return {
    heroTotalCommittedBB: Number(totals.hero.toFixed(2)),
    opponentTotalCommittedBB: Number(totals.opp.toFixed(2)),
    heroCurrentStreetCommittedBB: Number(current.hero.toFixed(2)),
    opponentCurrentStreetCommittedBB: Number(current.opp.toFixed(2)),
  };
}

function finiteNonNegativeOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function stackBehindFromStartOrOverride(startingStack, totalCommitted, override) {
  const overrideRemaining = finiteNonNegativeOrNull(override?.remainingBB);
  if (overrideRemaining !== null) {
    const committedAtOverride =
      finiteNonNegativeOrNull(override?.committedAtBB) ?? totalCommitted;
    const investedSinceOverride = Math.max(0, totalCommitted - committedAtOverride);
    return Number(Math.max(0, overrideRemaining - investedSinceOverride).toFixed(2));
  }
  if (startingStack === null) return null;
  return Number(Math.max(0, startingStack - totalCommitted).toFixed(2));
}

export function buildStackState(state = {}) {
  const commitments = handCommitments(state);
  const startingHeroStackBB = finitePositiveOrNull(state.heroStackBB);
  const startingOpponentStackBB = finitePositiveOrNull(state.villainStackBB);
  const overrides = state.stackRemainingOverrides || {};
  const heroStackBehindBB = stackBehindFromStartOrOverride(
    startingHeroStackBB,
    commitments.heroTotalCommittedBB,
    overrides.hero,
  );
  const opponentStackBehindBB = stackBehindFromStartOrOverride(
    startingOpponentStackBB,
    commitments.opponentTotalCommittedBB,
    overrides.opponent,
  );
  const knownRemaining = [heroStackBehindBB, opponentStackBehindBB].filter(
    (value) => value !== null,
  );
  const knownStarting = [startingHeroStackBB, startingOpponentStackBB].filter(
    (value) => value !== null,
  );
  const effectiveStackBehindBB = knownRemaining.length
    ? Number(Math.min(...knownRemaining).toFixed(2))
    : null;
  const startingEffectiveStackBB = knownStarting.length
    ? Number(Math.min(...knownStarting).toFixed(2))
    : null;

  return {
    ...commitments,
    startingHeroStackBB,
    startingOpponentStackBB,
    startingEffectiveStackBB,
    heroStackBehindBB,
    opponentStackBehindBB,
    effectiveStackBehindBB,
    heroRemainingOverrideActive:
      finiteNonNegativeOrNull(overrides.hero?.remainingBB) !== null,
    opponentRemainingOverrideActive:
      finiteNonNegativeOrNull(overrides.opponent?.remainingBB) !== null,
  };
}

export function amountToCallForFacingAction(state = {}, facingAction = state.facingAction) {
  if (!facingAction || typeof facingAction !== "object") return null;
  if (["check", "limp"].includes(String(facingAction.type || "").toLowerCase())) {
    return null;
  }
  const commitments = streetCommitments(state);
  const targetBB = finitePositiveOrNull(
    facingAction.toAmountBB ?? facingAction.amountBB,
  );
  let rawCallAmountBB = null;
  if (targetBB) {
    const delta = Number((targetBB - commitments.heroCommittedBB).toFixed(2));
    rawCallAmountBB = delta > 0 ? delta : null;
  } else {
    rawCallAmountBB = finitePositiveOrNull(facingAction.callAmountBB);
  }
  if (!rawCallAmountBB) return null;
  const heroStackBehindBB = buildStackState(state).heroStackBehindBB;
  return heroStackBehindBB !== null
    ? Number(Math.min(rawCallAmountBB, heroStackBehindBB).toFixed(2))
    : rawCallAmountBB;
}

export function minimumRaiseToForDecision(state = {}, facingAction = state.facingAction) {
  if (state.decisionKind === "limped") return 2;
  if (!facingAction || typeof facingAction !== "object") {
    return state.street === "preflop" ? 2 : null;
  }
  const targetBB = finitePositiveOrNull(
    facingAction.toAmountBB ?? facingAction.amountBB,
  );
  if (!targetBB || facingAction.allIn) return null;

  const facingType = normalizePokerAction(facingAction.type);
  const rows = Array.isArray(state.history) ? state.history : [];
  let facingRowIndex = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row?.street !== state.street || row?.actor !== "opp") continue;
    if (normalizePokerAction(row?.action) !== facingType) continue;
    const rowTarget = finitePositiveOrNull(row?.toAmountBB ?? row?.amountBB);
    if (rowTarget === targetBB) {
      facingRowIndex = index;
      break;
    }
  }
  const priorState = facingRowIndex >= 0
    ? { ...state, history: rows.filter((_, index) => index !== facingRowIndex) }
    : state;
  const priorBetBB =
    finitePositiveOrNull(facingAction.initialOpenAmountBB) ||
    streetCommitments(priorState).currentBetBB;
  const raiseIncrementBB = Number((targetBB - priorBetBB).toFixed(2));
  if (raiseIncrementBB <= 0) return null;
  return Number((targetBB + raiseIncrementBB).toFixed(2));
}

export function buildDecisionNode(state = {}) {
  const rawAnteBB = Number(state.anteBB);
  const anteBB = Number.isFinite(rawAnteBB) && rawAnteBB >= 0
    ? Number(rawAnteBB.toFixed(3))
    : 0;
  const forcedPreflopPotBB =
    (state.street || "preflop") === "preflop"
      ? Number(
          (
            1.5 +
            anteBB * Number(state.tableSize || 8)
          ).toFixed(2),
        )
      : null;
  const rawPotBB =
    finitePositiveOrNull(state.estimatedPotBB) ||
    finitePositiveOrNull(state.potSizes?.total) ||
    forcedPreflopPotBB;
  const stackState = buildStackState(state);
  const effectiveStackBB =
    stackState.effectiveStackBehindBB !== null &&
    stackState.effectiveStackBehindBB > 0
      ? stackState.effectiveStackBehindBB
      : null;
  const facing = state.facingAction && typeof state.facingAction === "object"
    ? state.facingAction
    : null;
  const commitments = streetCommitments(state);
  const callAmountBB = amountToCallForFacingAction(state, facing);
  const minimumRaiseToBB = minimumRaiseToForDecision(state, facing);
  const heroMaximumCurrentStreetToBB =
    stackState.heroStackBehindBB !== null
      ? Number(
          (
            commitments.heroCommittedBB + stackState.heroStackBehindBB
          ).toFixed(2),
        )
      : null;
  const uncalledExcessBB =
    facing && heroMaximumCurrentStreetToBB !== null
      ? Number(
          Math.max(
            0,
            commitments.opponentCommittedBB - heroMaximumCurrentStreetToBB,
          ).toFixed(2),
        )
      : 0;
  const potCorrectionBB =
    rawPotBB &&
    uncalledExcessBB > 0 &&
    rawPotBB >= commitments.opponentCommittedBB
      ? Math.min(rawPotBB, uncalledExcessBB)
      : 0;
  const potBB = rawPotBB
    ? Number(Math.max(0, rawPotBB - potCorrectionBB).toFixed(2)) || null
    : null;
  const potOddsPct = potBB && callAmountBB
    ? Number(((callAmountBB / (potBB + callAmountBB)) * 100).toFixed(1))
    : null;
  const potOdds = potOddsPct !== null
    ? {
        requiredEquityPct: potOddsPct,
        callAmountBB,
        potBeforeCallBB: potBB,
        potAfterCallBB: Number((potBB + callAmountBB).toFixed(2)),
      }
    : null;
  const spr = potBB && effectiveStackBB
    ? Number((effectiveStackBB / potBB).toFixed(2))
    : null;
  const heroStackAfterCallBB =
    stackState.heroStackBehindBB !== null && callAmountBB
      ? Number(Math.max(0, stackState.heroStackBehindBB - callAmountBB).toFixed(2))
      : stackState.heroStackBehindBB;
  const maxHeroTotalToBB =
    stackState.heroStackBehindBB !== null
      ? Number(
          (
            stackState.heroCurrentStreetCommittedBB +
            stackState.heroStackBehindBB
          ).toFixed(2),
        )
      : null;
  const maxOpponentTotalToBB =
    stackState.opponentStackBehindBB !== null
      ? Number(
          (
            stackState.opponentCurrentStreetCommittedBB +
            stackState.opponentStackBehindBB
          ).toFixed(2),
        )
      : null;
  const playersYetToActSeats = preflopPlayersYetToAct(state);
  const playersYetToActCount = playersYetToActSeats.length;
  const activeActorsBeforeSeatsBehind =
    String(state.decisionKind || "").toLowerCase() ===
    "facing_open_and_3bet"
      ? 3
      : state.facingAction
        ? 2
        : 1;
  const playersLiveAtDecision = Math.max(
    Math.max(2, Number(state.playersInHand || 2)),
    playersYetToActCount + activeActorsBeforeSeatsBehind,
  );
  const heroExposureBeyondPrimaryOpponentBB =
    maxHeroTotalToBB !== null && maxOpponentTotalToBB !== null
      ? Number(Math.max(0, maxHeroTotalToBB - maxOpponentTotalToBB).toFixed(2))
      : null;
  const primaryOpponentExposureRatio =
    maxHeroTotalToBB !== null && maxOpponentTotalToBB !== null
      ? Number((maxHeroTotalToBB / maxOpponentTotalToBB).toFixed(2))
      : null;
  const overjamPlayersBehindRisk =
    (state.street || "preflop") === "preflop" &&
    ["facing_open", "facing_open_callers"].includes(
      String(state.decisionKind || "").toLowerCase(),
    ) &&
    playersYetToActCount > 0 &&
    maxHeroTotalToBB !== null &&
    maxOpponentTotalToBB !== null &&
    maxHeroTotalToBB >= 30 &&
    (heroExposureBeyondPrimaryOpponentBB >= 15 ||
      primaryOpponentExposureRatio >= 2) &&
    !Boolean(facing?.allIn) &&
    !isUnambiguousPreflopStackOffHand(state.heroCards);
  const facingTargetBB = finitePositiveOrNull(
    facing?.toAmountBB ?? facing?.amountBB,
  );
  const rawLegalActions = Array.isArray(state.legalActions)
    ? state.legalActions.map(normalizePokerAction).filter(Boolean)
    : [];
  const legalActions = rawLegalActions.filter((action) => {
    if (stackState.heroStackBehindBB !== null && stackState.heroStackBehindBB <= 0) {
      return false;
    }
    if (
      action === "jam" &&
      maxHeroTotalToBB !== null &&
      facingTargetBB !== null &&
      facingTargetBB >= maxHeroTotalToBB
    ) {
      return false;
    }
    if (action === "jam" && overjamPlayersBehindRisk) return false;
    if (maxHeroTotalToBB === null || action === "jam") return true;
    const minimumTarget =
      action === "open"
        ? 2
        : action === "bet"
          ? stackState.heroCurrentStreetCommittedBB + 1
          : ["raise", "3-bet", "4-bet"].includes(action)
            ? minimumRaiseToBB
            : null;
    return !minimumTarget || minimumTarget <= maxHeroTotalToBB;
  });
  const missingInformation = [];
  if (!state.heroSeat) missingInformation.push("hero_seat");
  if (![state.heroCards?.card1, state.heroCards?.card2].every(Boolean)) {
    missingInformation.push("hero_cards");
  }
  if (facing && !state.opponentSeat && !facing.actorSeat) {
    missingInformation.push("opponent_seat");
  }
  if (state.street !== "preflop" && deriveRelativePosition(state) === "unknown") {
    missingInformation.push("relative_position");
  }
  if (Number(state.playersInHand || 2) > 2) {
    missingInformation.push("remaining_player_positions");
  }
  if (playersYetToActCount > 0) {
    missingInformation.push("players_yet_to_act_stack_sizes");
  }
  if (String(state.decisionKind || "").toLowerCase() === "facing_open_and_3bet") {
    if (!facing?.initialOpenerSeat) missingInformation.push("initial_opener_seat");
    missingInformation.push("initial_opener_stack_bb");
  }
  const requiredBoardCount = {
    flop: 3,
    turn: 4,
    river: 5,
  }[state.street];
  if (requiredBoardCount && boardCards(state).length < requiredBoardCount) {
    missingInformation.push("board_cards");
  }
  if (!potBB) missingInformation.push("pot_size_bb");
  if (!effectiveStackBB) missingInformation.push("effective_stack_behind_bb");
  if (facing && !callAmountBB && !["check", "limp"].includes(facing.type)) {
    missingInformation.push("facing_amount_bb");
  }

  const strategicRestrictions = [];
  if (overjamPlayersBehindRisk) {
    strategicRestrictions.push({
      action: "jam",
      code: "short_opener_players_behind_overjam",
      reason:
        "The primary opponent's short stack does not cap Hero's exposure while unacted players with unknown stacks remain behind.",
    });
  }
  if (String(state.decisionKind || "").toLowerCase() === "facing_open_and_3bet") {
    strategicRestrictions.push({
      action: "jam",
      code: "cold_3bet_two_villain_exposure",
      reason:
        "The initial opener remains active behind the separate 3-bettor, and any unacted seats behind Hero can also continue; assess Hero's full exposure against every live range.",
    });
  }

  return {
    street: state.street || "preflop",
    decisionKind: state.decisionKind || null,
    heroSeat: state.heroSeat || null,
    opponentSeat: state.opponentSeat || null,
    relativePosition: deriveRelativePosition(state),
    tableSize: Number(state.tableSize || 8),
    playersInHand: Math.max(2, Number(state.playersInHand || 2)),
    playersLiveAtDecision,
    playersYetToActSeats,
    playersYetToActCount,
    gameType: state.gameType || "tournament",
    bountyMode:
      state.gameType === "cash" ? "none" : state.bountyMode || "none",
    anteBB,
    potBB,
    rawPotBB,
    contestablePotBB: potBB,
    uncalledExcessBB,
    potCorrectionBB,
    effectiveStackBB,
    primaryOpponentEffectiveStackBB: effectiveStackBB,
    startingEffectiveStackBB: stackState.startingEffectiveStackBB,
    startingHeroStackBB: stackState.startingHeroStackBB,
    startingOpponentStackBB: stackState.startingOpponentStackBB,
    heroStackBehindBB: stackState.heroStackBehindBB,
    opponentStackBehindBB: stackState.opponentStackBehindBB,
    heroStackAfterCallBB,
    heroTotalCommittedBB: stackState.heroTotalCommittedBB,
    opponentTotalCommittedBB: stackState.opponentTotalCommittedBB,
    maxHeroTotalToBB,
    maxOpponentTotalToBB,
    heroMaximumExposureBB: maxHeroTotalToBB,
    heroExposureBeyondPrimaryOpponentBB,
    playersYetToActStacksKnown: playersYetToActCount === 0,
    strategicRestrictions,
    effectiveStackToPotRatio: spr,
    heroStackToPotRatio:
      potBB && stackState.heroStackBehindBB !== null
        ? Number((stackState.heroStackBehindBB / potBB).toFixed(2))
        : null,
    potSource: finitePositiveOrNull(state.estimatedPotBB)
      ? state.potSizes?.total
        ? "running_from_manual_override"
        : "estimated_from_actions"
      : state.potSizes?.total
        ? "manual_override"
        : forcedPreflopPotBB
          ? "forced_preflop_baseline"
          : "unknown",
    spr,
    potOddsPct,
    potOdds,
    minimumRaiseToBB,
    minimumBetBB:
      Array.isArray(state.legalActions) && state.legalActions.includes("bet") ? 1 : null,
    heroCommittedBB: commitments.heroCommittedBB,
    opponentCommittedBB: commitments.opponentCommittedBB,
    currentBetBB: commitments.currentBetBB,
    preflopSequence:
      state.preflopSequence && typeof state.preflopSequence === "object"
        ? { ...state.preflopSequence }
        : null,
    facingAction: facing
      ? {
          type: String(facing.type || "unknown"),
          actorSeat: facing.actorSeat || state.opponentSeat || null,
          amountBB: finitePositiveOrNull(facing.amountBB),
          toAmountBB: finitePositiveOrNull(facing.toAmountBB),
          callAmountBB,
          allIn: Boolean(facing.allIn),
          initialOpenAmountBB: finitePositiveOrNull(
            facing.initialOpenAmountBB,
          ),
          initialOpenerSeat: facing.initialOpenerSeat || null,
          openerStillActive: Boolean(facing.openerStillActive),
        }
      : null,
    lastAggressorSeat: state.lastAggressorSeat || null,
    legalActions,
    heroCards: [state.heroCards?.card1, state.heroCards?.card2].filter(Boolean),
    boardCards: boardCards(state),
    actionHistory: (Array.isArray(state.history) ? state.history : []).slice(-20),
    missingInformation,
  };
}

function recommendedSizingBB(sizing, potBB = null) {
  const text = String(sizing || "").trim().toLowerCase();
  if (!text || /^(?:jam|all[- ]?in|check|fold)$/.test(text)) return null;
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const numeric = finitePositiveOrNull(match[1]);
  if (!numeric) return null;
  if (text.includes("%") && finitePositiveOrNull(potBB)) {
    return Number(((numeric / 100) * Number(potBB)).toFixed(2));
  }
  return numeric;
}

export function assumedHeroEventFromRecommendation(recommendation, state = {}) {
  const action = normalizePokerAction(recommendation?.hero_action);
  const legalActions = Array.isArray(state.legalActions)
    ? state.legalActions.map(normalizePokerAction)
    : [];
  if (!action || !legalActions.includes(action)) return null;

  const decisionNode = buildDecisionNode(state);
  const sizingText = String(recommendation?.sizing || "").toLowerCase();
  const sizingNumber = finitePositiveOrNull(recommendation?.sizing_bb);
  const multiplierMatch = sizingText.match(/(\d+(?:\.\d+)?)\s*(?:x|×)/);
  const facingTargetBB = finitePositiveOrNull(
    state.facingAction?.toAmountBB ?? state.facingAction?.amountBB,
  );
  let amountBB = sizingNumber || recommendedSizingBB(
    recommendation?.sizing,
    decisionNode.potBB,
  );
  if (!sizingNumber && multiplierMatch) {
    const multiplier = Number(multiplierMatch[1]);
    if (sizingText.includes("pot") && decisionNode.potBB) {
      amountBB = finitePositiveOrNull(multiplier * decisionNode.potBB);
    } else if (["raise", "3-bet", "4-bet"].includes(action) && facingTargetBB) {
      amountBB = finitePositiveOrNull(multiplier * facingTargetBB);
    } else {
      amountBB = finitePositiveOrNull(multiplier);
    }
  }
  if (!amountBB && action === "open") {
    amountBB = finitePositiveOrNull(state.openSize) || 2;
  }
  if (!amountBB && ["raise", "3-bet", "4-bet"].includes(action)) {
    amountBB = decisionNode.minimumRaiseToBB;
  }
  if (!amountBB && action === "bet" && decisionNode.potBB) {
    amountBB = Number((decisionNode.potBB * 0.5).toFixed(2));
  }
  const sizingWasCapped = Boolean(
    amountBB &&
    decisionNode.maxHeroTotalToBB &&
    amountBB > decisionNode.maxHeroTotalToBB
  );
  if (sizingWasCapped) {
    amountBB = decisionNode.maxHeroTotalToBB;
  }

  const resolvedAction =
    sizingWasCapped && legalActions.includes("jam") ? "jam" : action;
  const code = actionCodeForLegalAction(resolvedAction);
  if (!code) return null;
  const normalizedRecommendation = sizingWasCapped
    ? {
        ...recommendation,
        hero_action: resolvedAction,
        sizing: resolvedAction === "jam" ? "All-in" : `${amountBB} BB`,
        sizing_bb: amountBB,
        assumptions: [
          ...(Array.isArray(recommendation?.assumptions)
            ? recommendation.assumptions
            : []),
          "Recommended size capped at Hero's remaining stack.",
        ].slice(0, 6),
      }
    : recommendation;

  const sizedAction = ["open", "bet", "raise", "3-bet", "4-bet"].includes(
    resolvedAction,
  );
  return {
    code,
    ...(sizedAction && amountBB
      ? { amountBB, toAmountBB: amountBB }
      : {}),
    recommendation: normalizedRecommendation,
    assumed: true,
    assumedDecisionKey: decisionKeyForAssumedAction(state),
  };
}

export function decisionKeyForAssumedAction(state = {}) {
  return [
    state.street || "preflop",
    state.lastEvent || "decision",
    state.decisionKind || "unknown",
    Array.isArray(state.history) ? state.history.length : 0,
    state.nextActor || "hero",
  ].join(":");
}

export function compareRecommendation(
  recommendation,
  actualAction,
  amountBB = null,
  context = {},
) {
  const recommendedAction = normalizePokerAction(recommendation?.hero_action);
  const normalizedActual = normalizePokerAction(actualAction);
  const normalizedAmount = finitePositiveOrNull(amountBB);
  const recommendedAmountBB =
    finitePositiveOrNull(recommendation?.sizing_bb) ||
    recommendedSizingBB(recommendation?.sizing, context?.potBB);
  const actionMatched = Boolean(
    recommendedAction && normalizedActual && recommendedAction === normalizedActual,
  );
  const sizingMatched = recommendedAmountBB && normalizedAmount
    ? Math.abs(recommendedAmountBB - normalizedAmount) <= Math.max(0.25, recommendedAmountBB * 0.1)
    : null;
  return {
    at: Date.now(),
    recommendedAction: recommendedAction || null,
    recommendedSizing: recommendation?.sizing || null,
    actualAction: normalizedActual || null,
    recommendedAmountBB,
    actualAmountBB: normalizedAmount,
    actionMatched,
    sizingMatched,
    matched: actionMatched,
    lineMatched: actionMatched && sizingMatched !== false,
    confidence: recommendation?.confidence || null,
    reason: recommendation?.reasoning || recommendation?.flavor_text || null,
  };
}
