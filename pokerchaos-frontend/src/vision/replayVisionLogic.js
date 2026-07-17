const CARD_CODE_PATTERN = /^[AKQJT2-9][shdc]$/i;

function normalizeCard(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!CARD_CODE_PATTERN.test(raw)) return null;
  return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
}

export function replayDetectionCards(detection) {
  const heroCards = [
    normalizeCard(detection?.heroCards?.card1),
    normalizeCard(detection?.heroCards?.card2),
  ];
  const boardCards = [
    ...(Array.isArray(detection?.board?.flop) ? detection.board.flop : []),
    detection?.board?.turn,
    detection?.board?.river,
  ]
    .map(normalizeCard)
    .filter(Boolean);
  return { heroCards, boardCards };
}

export function validateReplayDetectionContinuity(
  previousDetection,
  nextDetection,
  { newHandDetected = false, allowCorrection = false } = {},
) {
  const next = replayDetectionCards(nextDetection);
  if (next.heroCards.some((card) => !card)) {
    return { valid: false, reason: "Hero cards were incomplete." };
  }
  if (!previousDetection) return { valid: true };

  if (allowCorrection) return { valid: true };

  if (newHandDetected) {
    if (next.boardCards.length !== 0) {
      return {
        valid: false,
        reason: "A new hand can only be confirmed before the flop.",
      };
    }
    return { valid: true };
  }

  const previous = replayDetectionCards(previousDetection);
  if (previous.heroCards.some((card) => !card)) return { valid: true };
  if (
    previous.heroCards[0] !== next.heroCards[0] ||
    previous.heroCards[1] !== next.heroCards[1]
  ) {
    return {
      valid: false,
      reason: "Hero cards changed without a confirmed new-hand transition.",
    };
  }
  if (next.boardCards.length < previous.boardCards.length) {
    return {
      valid: false,
      reason: "The board moved backwards without a new hand.",
    };
  }
  const knownBoardChanged = previous.boardCards.some(
    (card, index) => next.boardCards[index] !== card,
  );
  if (knownBoardChanged) {
    return {
      valid: false,
      reason: "A previously confirmed board card changed.",
    };
  }
  return { valid: true };
}
