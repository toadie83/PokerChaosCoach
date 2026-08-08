const CARD_CODE_PATTERN = /^[AKQJT2-9][shdc]$/i;
const RANKS_ASCENDING = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const RANK_INDEX = new Map(RANKS_ASCENDING.map((rank, index) => [rank, index]));

export const QUICK_OPEN_CHART_VERSION = "cash-6max-rfi-100bb-baseline-v1";
export const MTT_QUICK_OPEN_CHART_VERSION = "mtt-8max-rfi-chip-ev-baseline-v1";

function handsFromPair(minimumRank) {
  const start = RANK_INDEX.get(minimumRank);
  if (start === undefined) return [];
  return RANKS_ASCENDING.slice(start).map((rank) => `${rank}${rank}`);
}

function handsFromKicker(highRank, minimumKicker, suitedness) {
  const highIndex = RANK_INDEX.get(highRank);
  const start = RANK_INDEX.get(minimumKicker);
  if (highIndex === undefined || start === undefined || start >= highIndex) return [];
  return RANKS_ASCENDING.slice(start, highIndex).map(
    (kicker) => `${highRank}${kicker}${suitedness}`,
  );
}

function makeRange(...groups) {
  return new Set(groups.flat());
}

// A conservative, deterministic 6-max cash first-in baseline for standard
// roughly 100 BB play. It intentionally avoids claiming solver frequencies;
// marginal mixed-frequency hands resolve to the tighter action.
const SIX_MAX_CASH_RFI = {
  UTG: makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["JTs", "T9s", "98s", "87s", "76s", "65s"],
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "J", "o"),
    ["QJo"],
  ),
  HJ: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("Q", "9", "s"),
    handsFromKicker("J", "9", "s"),
    handsFromKicker("T", "8", "s"),
    ["97s", "87s", "76s", "65s", "54s"],
    handsFromKicker("A", "9", "o"),
    handsFromKicker("K", "J", "o"),
    ["QJo"],
  ),
  CO: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("K", "7", "s"),
    handsFromKicker("Q", "8", "s"),
    handsFromKicker("J", "8", "s"),
    handsFromKicker("T", "8", "s"),
    ["97s", "87s", "86s", "76s", "75s", "65s", "54s"],
    handsFromKicker("A", "8", "o"),
    handsFromKicker("K", "T", "o"),
    handsFromKicker("Q", "T", "o"),
    ["JTo"],
  ),
  BTN: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "2", "o"),
    handsFromKicker("K", "2", "s"),
    handsFromKicker("K", "8", "o"),
    handsFromKicker("Q", "5", "s"),
    handsFromKicker("Q", "9", "o"),
    handsFromKicker("J", "7", "s"),
    handsFromKicker("J", "9", "o"),
    handsFromKicker("T", "7", "s"),
    [
      "T9o",
      "98o",
      "87o",
      "98s",
      "97s",
      "96s",
      "87s",
      "86s",
      "76s",
      "75s",
      "65s",
      "64s",
      "54s",
      "53s",
      "43s",
    ],
  ),
  SB: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "2", "o"),
    handsFromKicker("K", "2", "s"),
    handsFromKicker("K", "9", "o"),
    handsFromKicker("Q", "5", "s"),
    handsFromKicker("Q", "9", "o"),
    handsFromKicker("J", "7", "s"),
    handsFromKicker("J", "9", "o"),
    handsFromKicker("T", "7", "s"),
    [
      "T9o",
      "98s",
      "97s",
      "96s",
      "87s",
      "86s",
      "76s",
      "75s",
      "65s",
      "64s",
      "54s",
    ],
  ),
};

// An 8-max MTT chip-EV first-in baseline. It deliberately excludes ICM and
// payout pressure. The short-stack branch represents hands that can enter the
// pot first-in; it does not choose between a small open and a jam.
const EIGHT_MAX_MTT_RFI_STANDARD = {
  UTG: makeRange(
    handsFromPair("7"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["JTs", "T9s", "98s"],
    handsFromKicker("A", "J", "o"),
    ["KQo"],
  ),
  "UTG+1": makeRange(
    handsFromPair("6"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["JTs", "T9s", "98s", "87s"],
    handsFromKicker("A", "T", "o"),
    ["KQo"],
  ),
  LJ: makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("Q", "9", "s"),
    handsFromKicker("J", "9", "s"),
    ["T9s", "98s", "87s", "76s"],
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "J", "o"),
    ["QJo"],
  ),
  HJ: SIX_MAX_CASH_RFI.HJ,
  CO: SIX_MAX_CASH_RFI.CO,
  BTN: SIX_MAX_CASH_RFI.BTN,
  SB: SIX_MAX_CASH_RFI.SB,
};

const EIGHT_MAX_MTT_RFI_SHORT = {
  UTG: makeRange(
    handsFromPair("6"),
    handsFromKicker("A", "8", "s"),
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "T", "s"),
    ["KQo", "QJs"],
  ),
  "UTG+1": makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "5", "s"),
    handsFromKicker("A", "9", "o"),
    handsFromKicker("K", "T", "s"),
    ["KQo", "QJs", "JTs"],
  ),
  LJ: makeRange(
    handsFromPair("4"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "8", "o"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("K", "J", "o"),
    handsFromKicker("Q", "T", "s"),
    ["QJo", "JTs", "T9s"],
  ),
  HJ: makeRange(
    handsFromPair("3"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "7", "o"),
    handsFromKicker("K", "8", "s"),
    handsFromKicker("K", "T", "o"),
    handsFromKicker("Q", "9", "s"),
    ["QJo", "J9s", "JTs", "T9s"],
  ),
  CO: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "5", "o"),
    handsFromKicker("K", "7", "s"),
    handsFromKicker("K", "T", "o"),
    handsFromKicker("Q", "9", "s"),
    handsFromKicker("Q", "T", "o"),
    ["J9s", "JTs", "JTo", "T9s", "98s"],
  ),
  BTN: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "2", "o"),
    handsFromKicker("K", "5", "s"),
    handsFromKicker("K", "9", "o"),
    handsFromKicker("Q", "8", "s"),
    handsFromKicker("Q", "T", "o"),
    handsFromKicker("J", "8", "s"),
    ["JTo", "T8s", "T9s", "T9o", "98s", "87s"],
  ),
  SB: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "2", "o"),
    handsFromKicker("K", "5", "s"),
    handsFromKicker("K", "9", "o"),
    handsFromKicker("Q", "8", "s"),
    handsFromKicker("Q", "T", "o"),
    handsFromKicker("J", "8", "s"),
    ["JTo", "T8s", "T9s", "T9o", "98s", "87s"],
  ),
};

function normalizeCard(card) {
  const raw = String(card || "").trim();
  if (!CARD_CODE_PATTERN.test(raw)) return null;
  return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
}

export function canonicalStartingHand(heroCards = {}) {
  const first = normalizeCard(heroCards?.card1);
  const second = normalizeCard(heroCards?.card2);
  if (!first || !second || first === second) return null;

  const firstRank = first[0];
  const secondRank = second[0];
  if (firstRank === secondRank) return `${firstRank}${secondRank}`;

  const ordered = [first, second].sort(
    (left, right) => RANK_INDEX.get(right[0]) - RANK_INDEX.get(left[0]),
  );
  const suitedness = ordered[0][1] === ordered[1][1] ? "s" : "o";
  return `${ordered[0][0]}${ordered[1][0]}${suitedness}`;
}

export function getQuickOpenSnapshot({
  heroCards,
  heroSeat,
  tableSize,
  gameType,
  heroStackBB,
} = {}) {
  const normalizedGameType = String(gameType || "").toLowerCase();
  const normalizedTableSize = Number(tableSize);
  const isCash = normalizedGameType === "cash" && normalizedTableSize === 6;
  const isMtt = normalizedGameType === "tournament" && normalizedTableSize === 8;
  if (!isCash && !isMtt) {
    return null;
  }

  const handCode = canonicalStartingHand(heroCards);
  const seat = String(heroSeat || "").trim().toUpperCase();
  if (!handCode || !seat) return null;

  const rawStack = Number(heroStackBB);
  const knownStack = Number.isFinite(rawStack) && rawStack > 0 ? rawStack : null;
  const mttStackBand = knownStack !== null && knownStack <= 20
    ? "short"
    : knownStack !== null && knownStack <= 40
      ? "medium"
      : "deep";
  const range = isCash
    ? SIX_MAX_CASH_RFI[seat]
    : mttStackBand === "short"
      ? EIGHT_MAX_MTT_RFI_SHORT[seat]
      : EIGHT_MAX_MTT_RFI_STANDARD[seat];
  const heading = isCash ? "6-max cash RFI" : "8-max MTT RFI";
  const baselineLabel = isCash
    ? "~100BB baseline"
    : `${knownStack !== null ? `${knownStack}BB` : "stack unknown"} chip-EV · no ICM`;
  const chartVersion = isCash
    ? QUICK_OPEN_CHART_VERSION
    : MTT_QUICK_OPEN_CHART_VERSION;

  if (seat === "BB") {
    return {
      action: "check",
      label: "CHECK",
      tone: "neutral",
      handCode,
      seat,
      explanation: "If everyone folds to the big blind, there is no open-or-fold decision.",
      heading,
      baselineLabel,
      chartVersion,
    };
  }

  if (!range) return null;
  const shouldOpen = range.has(handCode);
  return {
    action: shouldOpen ? "open" : "fold",
    label: shouldOpen ? "OPEN" : "FOLD",
    tone: shouldOpen ? "positive" : "negative",
    handCode,
    seat,
    explanation: shouldOpen
      ? isMtt && mttStackBand === "short"
        ? "Inside the conservative first-in short-stack play range; the snapshot does not choose between a small raise and a jam."
        : "Inside the conservative first-in range for this position."
      : "Outside the conservative first-in range for this position.",
    heading,
    baselineLabel,
    chartVersion,
  };
}

export const __quickOpenRangeTestables = {
  cashRanges: SIX_MAX_CASH_RFI,
  mttStandardRanges: EIGHT_MAX_MTT_RFI_STANDARD,
  mttShortRanges: EIGHT_MAX_MTT_RFI_SHORT,
};
