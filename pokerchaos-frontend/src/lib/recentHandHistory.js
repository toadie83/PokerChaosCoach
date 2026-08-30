export const RECENT_HAND_LIMIT = 3;
export const RECENT_HANDS_STORAGE_KEY = "pcc_recent_coach_hands_v1";

const STREETS = ["preflop", "flop", "turn", "river"];

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function hasCoachGuidance(coach) {
  const action = String(coach?.hero_action || "").trim();
  return Boolean(action && action !== "...");
}

function normalizedCoachByStreet(coachByStreet = {}, latestCoach, street) {
  const result = STREETS.reduce((acc, streetCode) => {
    if (hasCoachGuidance(coachByStreet?.[streetCode])) {
      acc[streetCode] = cloneValue(coachByStreet[streetCode]);
    }
    return acc;
  }, {});
  if (hasCoachGuidance(latestCoach) && !result[street]) {
    result[street] = cloneValue(latestCoach);
  }
  return result;
}

function latestCoachStreet(coachByStreet = {}) {
  return [...STREETS]
    .reverse()
    .find((street) => hasCoachGuidance(coachByStreet?.[street])) || null;
}

function sanitizedCards(state = {}) {
  return [state.heroCards?.card1, state.heroCards?.card2]
    .map((card) => String(card || "").trim())
    .filter(Boolean)
    .slice(0, 2);
}

export function buildRecentHandEntry({
  state,
  coachByStreet = {},
  latestCoach = null,
  archivedAt = Date.now(),
} = {}) {
  if (!state || typeof state !== "object") return null;
  const history = Array.isArray(state.history)
    ? state.history.filter((entry) => entry && typeof entry === "object")
    : [];
  const coaches = normalizedCoachByStreet(
    coachByStreet,
    latestCoach,
    String(state.street || "preflop"),
  );
  const heroCards = sanitizedCards(state);
  if (!history.length && !Object.keys(coaches).length) return null;
  if (heroCards.length !== 2) return null;

  const firstEventAt = Number(history[0]?.at);
  const fallbackEventAt = Number(state.lastEventAt || state.visionUpdatedAt);
  const sourceTime = Number.isFinite(firstEventAt) && firstEventAt > 0
    ? firstEventAt
    : Number.isFinite(fallbackEventAt) && fallbackEventAt > 0
      ? fallbackEventAt
      : archivedAt;
  const finalCoachStreet = latestCoachStreet(coaches);
  const finalCoach = finalCoachStreet ? coaches[finalCoachStreet] : null;
  const finalHistoryAction = [...history]
    .reverse()
    .find((entry) => entry?.actor === "hero")?.action;
  const id = `coach-hand-${sourceTime}-${heroCards.join("").toLowerCase()}`;

  return {
    id,
    archivedAt,
    heroSeat: String(state.heroSeat || "").toUpperCase(),
    heroCards,
    board: cloneValue(state.board || {}),
    currentStreet: String(state.street || "preflop"),
    history: cloneValue(history),
    coachByStreet: coaches,
    latestCoachStreet: finalCoachStreet,
    latestCoachAction: String(
      finalCoach?.hero_action || finalHistoryAction || "",
    )
      .replaceAll("_", " ")
      .trim()
      .toUpperCase(),
  };
}

export function mergeRecentHand(recentHands = [], entry, limit = RECENT_HAND_LIMIT) {
  if (!entry?.id) return Array.isArray(recentHands) ? recentHands : [];
  const current = Array.isArray(recentHands) ? recentHands : [];
  return [entry, ...current.filter((hand) => hand?.id !== entry.id)].slice(
    0,
    Math.max(1, Number(limit) || RECENT_HAND_LIMIT),
  );
}

export function loadRecentHands(storage = globalThis?.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(RECENT_HANDS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (hand) =>
          hand?.id &&
          Array.isArray(hand.heroCards) &&
          Array.isArray(hand.history) &&
          hand.coachByStreet &&
          typeof hand.coachByStreet === "object",
      )
      .slice(0, RECENT_HAND_LIMIT);
  } catch {
    return [];
  }
}

export function persistRecentHands(
  recentHands,
  storage = globalThis?.localStorage,
) {
  try {
    const safeHands = Array.isArray(recentHands)
      ? recentHands.slice(0, RECENT_HAND_LIMIT)
      : [];
    if (safeHands.length) {
      storage?.setItem(RECENT_HANDS_STORAGE_KEY, JSON.stringify(safeHands));
    } else {
      storage?.removeItem(RECENT_HANDS_STORAGE_KEY);
    }
  } catch {}
}
