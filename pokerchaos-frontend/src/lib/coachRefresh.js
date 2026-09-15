const CURRENT_INPUT_FIELDS = [
  "heroCards",
  "heroSeat",
  "opponentSeat",
  "tableSize",
  "playersInHand",
  "heroRelativePosition",
  "heroStackBB",
  "villainStackBB",
  "potSizes",
  "gameType",
  "anteBB",
  "style",
  "chaosMode",
  "persona",
  "model",
  "tournamentStage",
  "bountyMode",
  "villainType",
  "stakeTier",
  "liveTrackerReceipt",
];

function clone(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function buildCoachRefreshState(decisionState, currentState = {}) {
  if (!decisionState || typeof decisionState !== "object") return null;
  const refreshed = clone(decisionState);
  for (const field of CURRENT_INPUT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(currentState, field)) {
      refreshed[field] = clone(currentState[field]);
    }
  }
  return refreshed;
}
