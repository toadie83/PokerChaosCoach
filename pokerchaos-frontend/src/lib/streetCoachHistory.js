const REVIEWABLE_STREETS = ["preflop", "flop", "turn", "river"];

function copyText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function copyObject(value) {
  if (!value || typeof value !== "object") return null;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function copyPotOdds(value) {
  if (!value || typeof value !== "object") return null;
  const requiredEquityPct = Number(value.requiredEquityPct);
  const callAmountBB = Number(value.callAmountBB);
  const potBeforeCallBB = Number(value.potBeforeCallBB);
  const potAfterCallBB = Number(value.potAfterCallBB);
  if (
    !Number.isFinite(requiredEquityPct) ||
    requiredEquityPct <= 0 ||
    !Number.isFinite(callAmountBB) ||
    callAmountBB <= 0 ||
    !Number.isFinite(potBeforeCallBB) ||
    potBeforeCallBB <= 0 ||
    !Number.isFinite(potAfterCallBB) ||
    potAfterCallBB <= potBeforeCallBB
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

export function createStreetCoachSnapshot(coach, metadata = {}) {
  if (!coach || typeof coach !== "object") return null;

  const heroAction = copyText(coach.hero_action);
  if (!heroAction || heroAction === "...") return null;

  const sizingBB = Number(coach.sizing_bb);
  return {
    hero_action: heroAction,
    sizing: copyText(coach.sizing),
    sizing_bb: Number.isFinite(sizingBB) && sizingBB > 0 ? sizingBB : null,
    flavor_text: copyText(coach.flavor_text),
    reasoning: copyText(coach.reasoning),
    confidence: copyText(coach.confidence),
    assumptions: Array.isArray(coach.assumptions)
      ? coach.assumptions.filter(Boolean).map(String)
      : [],
    alternative_action: copyText(coach.alternative_action),
    alternative_sizing: copyText(coach.alternative_sizing),
    decision_receipt: copyObject(coach.decision_receipt),
    persona: copyText(metadata.persona),
    model: copyText(metadata.model),
    tournamentStage: copyText(metadata.tournamentStage),
    potOdds: copyPotOdds(metadata.potOdds),
    recordedAt: Number.isFinite(Number(metadata.recordedAt))
      ? Number(metadata.recordedAt)
      : Date.now(),
  };
}

export function rememberStreetCoach(history, street, coach, metadata = {}) {
  const normalizedStreet = copyText(street).toLowerCase();
  if (!REVIEWABLE_STREETS.includes(normalizedStreet)) return history;

  const snapshot = createStreetCoachSnapshot(coach, metadata);
  if (!snapshot) return history;
  return {
    ...(history || {}),
    [normalizedStreet]: snapshot,
  };
}

export function clearStreetCoachHistoryFrom(history, street) {
  const normalizedStreet = copyText(street).toLowerCase();
  const startIndex = REVIEWABLE_STREETS.indexOf(normalizedStreet);
  if (startIndex < 0 || !history) return history || {};

  const next = { ...history };
  REVIEWABLE_STREETS.slice(startIndex).forEach((key) => {
    delete next[key];
  });
  return next;
}
