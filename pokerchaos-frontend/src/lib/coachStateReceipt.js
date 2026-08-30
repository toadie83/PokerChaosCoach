const CARD_CODE_PATTERN = /^[AKQJT2-9][shdc]$/i;

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function normalizeCard(value) {
  const raw = String(value || "").trim();
  if (!CARD_CODE_PATTERN.test(raw)) return null;
  return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
}

function normalizeCards(values = [], limit = 5) {
  return (Array.isArray(values) ? values : [])
    .map(normalizeCard)
    .filter(Boolean)
    .slice(0, limit);
}

function boardCardsFromContext(context = {}, decisionNode = {}) {
  const decisionCards = normalizeCards(decisionNode?.boardCards, 5);
  if (decisionCards.length) return decisionCards;
  const board = context?.board || {};
  return normalizeCards(
    [
      ...(Array.isArray(board?.flop) ? board.flop : []),
      board?.turn,
      board?.river,
    ],
    5,
  );
}

function heroCardsFromContext(context = {}, decisionNode = {}) {
  const decisionCards = normalizeCards(decisionNode?.heroCards, 2);
  if (decisionCards.length === 2) return decisionCards;
  if (context?.heroCards && typeof context.heroCards === "object") {
    return normalizeCards(
      [context.heroCards.card1, context.heroCards.card2],
      2,
    );
  }
  if (typeof context?.heroHand === "string") {
    return normalizeCards(context.heroHand.split(/[\s,/-]+/), 2);
  }
  return [];
}

function normalizePotOdds(value) {
  if (!value || typeof value !== "object") return null;
  const requiredEquityPct = finiteNumberOrNull(value.requiredEquityPct);
  const callAmountBB = finiteNumberOrNull(value.callAmountBB);
  const potBeforeCallBB = finiteNumberOrNull(value.potBeforeCallBB);
  const potAfterCallBB = finiteNumberOrNull(value.potAfterCallBB);
  if (
    requiredEquityPct === null ||
    callAmountBB === null ||
    potBeforeCallBB === null ||
    potAfterCallBB === null
  ) {
    return null;
  }
  return {
    requiredEquityPct,
    callAmountBB,
    potBeforeCallBB,
    potAfterCallBB,
  };
}

function normalizeFacingAction(value) {
  if (!value || typeof value !== "object") return null;
  return {
    type: String(value.type || "unknown").trim().toLowerCase(),
    actorSeat: String(value.actorSeat || "").trim().toUpperCase() || null,
    amountBB: finiteNumberOrNull(value.amountBB),
    toAmountBB: finiteNumberOrNull(value.toAmountBB),
    callAmountBB: finiteNumberOrNull(value.callAmountBB),
    allIn: Boolean(value.allIn),
    initialOpenAmountBB: finiteNumberOrNull(value.initialOpenAmountBB),
    initialOpenerSeat:
      String(value.initialOpenerSeat || "").trim().toUpperCase() || null,
    openerStillActive: Boolean(value.openerStillActive),
  };
}

export function buildCoachStateReceipt(payload = {}, capturedAt = Date.now()) {
  const context = payload?.context && typeof payload.context === "object"
    ? payload.context
    : payload;
  const decisionNode =
    context?.decisionNode && typeof context.decisionNode === "object"
      ? context.decisionNode
      : {};
  const playersInHand = finiteNumberOrNull(
    decisionNode?.playersLiveAtDecision ??
      decisionNode?.playersInHand ??
      context?.playersInHand,
  );

  return {
    version: 1,
    capturedAt: Number.isFinite(Number(capturedAt))
      ? Number(capturedAt)
      : Date.now(),
    street: String(decisionNode?.street || context?.street || "preflop")
      .trim()
      .toLowerCase(),
    heroCards: heroCardsFromContext(context, decisionNode),
    boardCards: boardCardsFromContext(context, decisionNode),
    heroSeat:
      String(decisionNode?.heroSeat || context?.heroSeat || "")
        .trim()
        .toUpperCase() || null,
    opponentSeat:
      String(decisionNode?.opponentSeat || context?.opponentSeat || "")
        .trim()
        .toUpperCase() || null,
    relativePosition:
      String(decisionNode?.relativePosition || context?.relativePosition || "")
        .trim()
        .toLowerCase() || null,
    playersInHand,
    tableSize: finiteNumberOrNull(context?.tableSize),
    playersYetToActSeats: (Array.isArray(decisionNode?.playersYetToActSeats)
      ? decisionNode.playersYetToActSeats
      : [])
      .map((seat) => String(seat || "").trim().toUpperCase())
      .filter(Boolean),
    heroStackBehindBB: finiteNumberOrNull(
      decisionNode?.heroStackBehindBB ?? context?.heroStackBehindBB,
    ),
    opponentStackBehindBB: finiteNumberOrNull(
      decisionNode?.opponentStackBehindBB ?? context?.villainStackBehindBB,
    ),
    effectiveStackBB: finiteNumberOrNull(
      decisionNode?.effectiveStackBB ?? context?.stackInfo?.effective,
    ),
    potBB: finiteNumberOrNull(decisionNode?.potBB ?? context?.potSize),
    spr: finiteNumberOrNull(decisionNode?.spr),
    facingAction: normalizeFacingAction(
      decisionNode?.facingAction || context?.facingAction,
    ),
    potOdds: normalizePotOdds(decisionNode?.potOdds),
    gameType: String(decisionNode?.gameType || context?.gameType || "")
      .trim()
      .toLowerCase() || null,
    anteBB: finiteNumberOrNull(decisionNode?.anteBB ?? context?.anteBB),
    persona: String(context?.persona || "").trim().toLowerCase() || null,
    tournamentStage:
      String(context?.tournamentStage || "").trim().toLowerCase() || null,
    villainType:
      String(context?.villainType || "").trim().toLowerCase() || null,
    missingInformation: (Array.isArray(decisionNode?.missingInformation)
      ? decisionNode.missingInformation
      : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean),
    bountyMode:
      String(context?.bountyMode || "").trim().toLowerCase() || null,
  };
}
