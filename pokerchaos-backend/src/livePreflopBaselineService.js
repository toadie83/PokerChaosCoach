export const LIVE_PREFLOP_BASELINE_VERSION =
  "mtt-position-action-chip-ev-v3";

const CARD_CODE_PATTERN = /^[AKQJT2-9][shdc]$/i;
const RANKS_ASCENDING = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const RANK_INDEX = new Map(
  RANKS_ASCENDING.map((rank, index) => [rank, index]),
);

function handsFromPair(minimumRank) {
  const start = RANK_INDEX.get(minimumRank);
  if (start === undefined) return [];
  return RANKS_ASCENDING.slice(start).map((rank) => `${rank}${rank}`);
}

function handsFromKicker(highRank, minimumKicker, suitedness) {
  const highIndex = RANK_INDEX.get(highRank);
  const start = RANK_INDEX.get(minimumKicker);
  if (highIndex === undefined || start === undefined || start >= highIndex) {
    return [];
  }
  return RANKS_ASCENDING.slice(start, highIndex).map(
    (kicker) => `${highRank}${kicker}${suitedness}`,
  );
}

function makeRange(...groups) {
  return new Set(groups.flat());
}

const MTT_RFI_STANDARD = Object.freeze({
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
});

const MTT_RFI_SHALLOW = Object.freeze({
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
});

const BB_DEFEND_RANGES = Object.freeze({
  small_blind: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "2", "o"),
    handsFromKicker("K", "2", "s"),
    handsFromKicker("K", "5", "o"),
    handsFromKicker("Q", "3", "s"),
    handsFromKicker("Q", "8", "o"),
    handsFromKicker("J", "5", "s"),
    handsFromKicker("J", "8", "o"),
    handsFromKicker("T", "6", "s"),
    handsFromKicker("T", "8", "o"),
    [
      "98o", "97o", "98s", "97s", "96s", "95s", "87s", "86s",
      "85s", "76s", "75s", "74s", "65s", "64s", "63s", "54s",
      "53s", "43s",
    ],
  ),
  button: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "2", "o"),
    handsFromKicker("K", "2", "s"),
    handsFromKicker("K", "8", "o"),
    handsFromKicker("Q", "4", "s"),
    handsFromKicker("Q", "9", "o"),
    handsFromKicker("J", "6", "s"),
    handsFromKicker("J", "9", "o"),
    handsFromKicker("T", "6", "s"),
    [
      "T9o",
      "98o",
      "98s",
      "97s",
      "96s",
      "95s",
      "87s",
      "86s",
      "85s",
      "76s",
      "75s",
      "74s",
      "65s",
      "64s",
      "54s",
      "53s",
      "43s",
    ],
  ),
  cutoff: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "7", "o"),
    handsFromKicker("K", "7", "s"),
    handsFromKicker("K", "T", "o"),
    handsFromKicker("Q", "7", "s"),
    handsFromKicker("Q", "T", "o"),
    handsFromKicker("J", "7", "s"),
    ["JTo", "T7s", "T8s", "T9s", "98s", "97s", "96s", "87s", "86s", "76s", "75s", "65s", "64s", "54s"],
  ),
  middle: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("K", "J", "o"),
    handsFromKicker("Q", "9", "s"),
    ["QJo", "J9s", "JTs", "T9s", "98s", "87s", "76s"],
  ),
  early: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "J", "o"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["KQo", "JTs", "T9s", "98s", "87s"],
  ),
});

const BB_DEFEND_STANDARD_RANGES = Object.freeze({
  small_blind: BB_DEFEND_RANGES.button,
  button: makeRange(
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
      "T9o", "98o", "98s", "97s", "96s", "87s", "86s", "76s",
      "75s", "65s", "64s", "54s", "53s", "43s",
    ],
  ),
  cutoff: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "7", "o"),
    handsFromKicker("K", "7", "s"),
    handsFromKicker("K", "T", "o"),
    handsFromKicker("Q", "8", "s"),
    handsFromKicker("Q", "T", "o"),
    handsFromKicker("J", "8", "s"),
    ["JTo", "T8s", "T9s", "98s", "97s", "87s", "86s", "76s", "65s", "54s"],
  ),
  middle: BB_DEFEND_RANGES.middle,
  early: BB_DEFEND_RANGES.early,
});

const BB_DEFEND_THREE_X_RANGES = Object.freeze({
  small_blind: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "5", "o"),
    handsFromKicker("K", "5", "s"),
    handsFromKicker("K", "9", "o"),
    handsFromKicker("Q", "7", "s"),
    handsFromKicker("Q", "T", "o"),
    handsFromKicker("J", "7", "s"),
    ["JTo", "T7s", "T8s", "T9s", "98s", "97s", "87s", "86s", "76s", "65s", "54s"],
  ),
  button: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "7", "o"),
    handsFromKicker("K", "7", "s"),
    handsFromKicker("K", "T", "o"),
    handsFromKicker("Q", "8", "s"),
    handsFromKicker("Q", "T", "o"),
    handsFromKicker("J", "8", "s"),
    ["JTo", "T8s", "T9s", "98s", "87s", "76s", "65s"],
  ),
  cutoff: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "9", "o"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("K", "J", "o"),
    handsFromKicker("Q", "9", "s"),
    ["QJo", "J9s", "JTs", "T9s", "98s", "87s"],
  ),
  middle: makeRange(
    handsFromPair("2"),
    handsFromKicker("A", "5", "s"),
    handsFromKicker("A", "J", "o"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["KQo", "JTs", "T9s"],
  ),
  early: makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "T", "s"),
    handsFromKicker("A", "J", "o"),
    handsFromKicker("K", "J", "s"),
    ["KQo", "QJs", "JTs"],
  ),
});

const BB_DEFEND_LARGE_OPEN_RANGES = Object.freeze({
  small_blind: makeRange(
    handsFromPair("2"), handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "T", "o"), handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"), ["KQo", "JTs", "T9s", "98s"],
  ),
  button: makeRange(
    handsFromPair("2"), handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "T", "o"), handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"), ["KQo", "JTs", "T9s", "98s"],
  ),
  cutoff: makeRange(
    handsFromPair("4"), handsFromKicker("A", "8", "s"),
    handsFromKicker("A", "J", "o"), handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"), ["KQo", "JTs"],
  ),
  middle: makeRange(
    handsFromPair("5"), handsFromKicker("A", "T", "s"),
    handsFromKicker("A", "J", "o"), handsFromKicker("K", "J", "s"),
    ["KQo", "QJs", "JTs"],
  ),
  early: makeRange(
    handsFromPair("7"), handsFromKicker("A", "J", "s"),
    handsFromKicker("A", "Q", "o"), ["KQs"],
  ),
});

const SB_CONTINUE_RANGES = Object.freeze({
  button: makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("K", "J", "o"),
    handsFromKicker("Q", "9", "s"),
    ["QJo", "J9s", "JTs", "T9s", "98s", "87s"],
  ),
  cutoff: makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "2", "s"),
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "9", "s"),
    handsFromKicker("K", "J", "o"),
    handsFromKicker("Q", "9", "s"),
    ["QJo", "J9s", "JTs", "T9s", "98s", "87s"],
  ),
  middle: makeRange(
    handsFromPair("5"),
    handsFromKicker("A", "8", "s"),
    ["A5s", "A4s"],
    handsFromKicker("A", "J", "o"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["KQo", "JTs", "T9s"],
  ),
  early: makeRange(
    handsFromPair("6"),
    handsFromKicker("A", "9", "s"),
    ["A5s", "A4s"],
    handsFromKicker("A", "Q", "o"),
    handsFromKicker("K", "J", "s"),
    ["KQo", "QJs", "JTs"],
  ),
});

const SB_CONTINUE_THREE_X_RANGES = Object.freeze({
  button: makeRange(
    handsFromPair("6"),
    handsFromKicker("A", "5", "s"),
    handsFromKicker("A", "T", "o"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["KQo", "JTs", "T9s"],
  ),
  cutoff: makeRange(
    handsFromPair("7"),
    handsFromKicker("A", "8", "s"),
    handsFromKicker("A", "J", "o"),
    handsFromKicker("K", "T", "s"),
    handsFromKicker("Q", "T", "s"),
    ["KQo", "JTs"],
  ),
  middle: makeRange(
    handsFromPair("8"),
    handsFromKicker("A", "T", "s"),
    handsFromKicker("A", "Q", "o"),
    handsFromKicker("K", "J", "s"),
    ["KQo", "QJs"],
  ),
  early: makeRange(
    handsFromPair("9"),
    handsFromKicker("A", "J", "s"),
    handsFromKicker("A", "Q", "o"),
    ["KQs"],
  ),
});

const SB_CONTINUE_LARGE_OPEN_RANGES = Object.freeze({
  button: makeRange(
    handsFromPair("T"), handsFromKicker("A", "Q", "s"),
    handsFromKicker("A", "Q", "o"), ["KQs"],
  ),
  cutoff: makeRange(
    handsFromPair("T"), handsFromKicker("A", "Q", "s"),
    handsFromKicker("A", "Q", "o"), ["KQs"],
  ),
  middle: makeRange(
    handsFromPair("T"), handsFromKicker("A", "Q", "s"),
    handsFromKicker("A", "Q", "o"), ["KQs"],
  ),
  early: makeRange(
    handsFromPair("T"), handsFromKicker("A", "Q", "s"),
    handsFromKicker("A", "Q", "o"), ["KQs"],
  ),
});

const IP_CONTINUE_VS_OPEN = makeRange(
  handsFromPair("2"),
  handsFromKicker("A", "2", "s"),
  handsFromKicker("A", "J", "o"),
  handsFromKicker("K", "T", "s"),
  handsFromKicker("Q", "T", "s"),
  ["KQo", "QJo", "JTs", "T9s", "98s", "87s", "76s"],
);

const EARLY_MIDDLE_CONTINUE_VS_OPEN = makeRange(
  handsFromPair("5"),
  handsFromKicker("A", "9", "s"),
  ["A5s", "A4s"],
  handsFromKicker("A", "J", "o"),
  handsFromKicker("K", "T", "s"),
  handsFromKicker("Q", "T", "s"),
  ["KQo", "JTs", "T9s", "98s"],
);

const MULTIWAY_CONTINUE = makeRange(
  handsFromPair("2"),
  handsFromKicker("A", "2", "s"),
  handsFromKicker("A", "Q", "o"),
  handsFromKicker("K", "T", "s"),
  handsFromKicker("Q", "T", "s"),
  ["KQo", "JTs", "T9s", "98s", "87s", "76s"],
);

const SHALLOW_CONTINUE = makeRange(
  handsFromPair("5"),
  handsFromKicker("A", "8", "s"),
  handsFromKicker("A", "T", "o"),
  handsFromKicker("K", "T", "s"),
  handsFromKicker("Q", "T", "s"),
  ["KQo", "QJo", "JTs", "T9s"],
);

const SHALLOW_BLIND_CONTINUE = makeRange(
  handsFromPair("2"),
  handsFromKicker("A", "2", "s"),
  handsFromKicker("A", "8", "o"),
  handsFromKicker("K", "9", "s"),
  handsFromKicker("K", "T", "o"),
  handsFromKicker("Q", "T", "s"),
  ["QJo", "JTs", "T9s", "98s"],
);

const VALUE_3BET = new Set(["AA", "KK", "QQ", "AKs", "AKo"]);
const LATE_VALUE_3BET = new Set([
  ...VALUE_3BET,
  "JJ",
  "TT",
  "AQs",
  "AQo",
  "AJs",
  "KQs",
]);
const BLOCKER_3BET = new Set(["A5s", "A4s", "A3s", "A2s"]);
const STRONG_VS_3BET = new Set(["AA", "KK", "QQ", "AKs", "AKo"]);
const CALL_VS_3BET = new Set([
  "JJ",
  "TT",
  "99",
  "AQs",
  "AQo",
  "AJs",
  "ATs",
  "KQs",
  "KJs",
  "QJs",
  "JTs",
]);

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function normalizeCard(card) {
  const raw = String(card || "").trim();
  if (!CARD_CODE_PATTERN.test(raw)) return null;
  return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
}

function contextHeroCards(context = {}) {
  if (context?.heroCards && !Array.isArray(context.heroCards)) {
    return [context.heroCards.card1, context.heroCards.card2];
  }
  if (Array.isArray(context?.decisionNode?.heroCards)) {
    return context.decisionNode.heroCards;
  }
  return [];
}

export function canonicalLiveStartingHand(heroCards = []) {
  const source = Array.isArray(heroCards)
    ? heroCards
    : [heroCards?.card1, heroCards?.card2];
  const first = normalizeCard(source[0]);
  const second = normalizeCard(source[1]);
  if (!first || !second || first === second) return null;
  if (first[0] === second[0]) return `${first[0]}${second[0]}`;
  const ordered = [first, second].sort(
    (left, right) => RANK_INDEX.get(right[0]) - RANK_INDEX.get(left[0]),
  );
  const suitedness = ordered[0][1] === ordered[1][1] ? "s" : "o";
  return `${ordered[0][0]}${ordered[1][0]}${suitedness}`;
}

export function describeStructuralPreflopHand(handCode) {
  const code = String(handCode || "");
  if (!code) return { code: null, family: "unknown", label: "unknown hand" };
  if (code.length === 2) {
    const value = RANK_INDEX.get(code[0]) ?? -1;
    return {
      code,
      family: "pocket_pair",
      label:
        value >= RANK_INDEX.get("Q")
          ? `${code} premium pocket pair`
          : value >= RANK_INDEX.get("8")
            ? `${code} medium pocket pair`
            : `${code} small pocket pair`,
    };
  }
  const high = code[0];
  const low = code[1];
  const suited = code[2] === "s";
  const highIndex = RANK_INDEX.get(high) ?? 0;
  const lowIndex = RANK_INDEX.get(low) ?? 0;
  const rankDistance = highIndex - lowIndex;
  if (suited && high === "A") {
    return { code, family: "suited_ace", label: `${code} suited ace` };
  }
  if (!suited && high === "A") {
    return { code, family: "offsuit_ace", label: `${code} offsuit ace` };
  }
  if (highIndex >= RANK_INDEX.get("T") && lowIndex >= RANK_INDEX.get("T")) {
    return {
      code,
      family: suited ? "suited_broadway" : "offsuit_broadway",
      label: `${code} ${suited ? "suited" : "offsuit"} broadway`,
    };
  }
  if (suited && rankDistance === 1) {
    return { code, family: "suited_connector", label: `${code} suited connector` };
  }
  if (suited && rankDistance <= 3) {
    return { code, family: "suited_gapper", label: `${code} suited gapper` };
  }
  if (suited && ["K", "Q", "J"].includes(high)) {
    return { code, family: "suited_high_card", label: `${code} suited high-card hand` };
  }
  return {
    code,
    family: suited ? "other_suited" : "disconnected_offsuit",
    label: `${code} ${suited ? "other suited" : "disconnected offsuit"} hand`,
  };
}

function openerGroup(seat) {
  const normalized = String(seat || "").toUpperCase();
  if (normalized === "SB") return "small_blind";
  if (normalized === "BTN") return "button";
  if (normalized === "CO") return "cutoff";
  if (["HJ", "LJ"].includes(normalized)) return "middle";
  if (["UTG", "UTG+1", "UTG+2"].includes(normalized)) return "early";
  return null;
}

function bigBlindRangeForOpen(group, facingSizeBB) {
  if (facingSizeBB === null) {
    return {
      range: BB_DEFEND_STANDARD_RANGES[group] || null,
      sizingBand: "unknown_assume_standard",
      assumedFacingSizeBB: 2.5,
    };
  }
  if (facingSizeBB <= 2.2) {
    return {
      range: BB_DEFEND_RANGES[group] || null,
      sizingBand: "small_2_2_or_less",
      assumedFacingSizeBB: facingSizeBB,
    };
  }
  if (facingSizeBB <= 2.5) {
    return {
      range: BB_DEFEND_STANDARD_RANGES[group] || null,
      sizingBand: "standard_2_21_to_2_5",
      assumedFacingSizeBB: facingSizeBB,
    };
  }
  if (facingSizeBB <= 3) {
    return {
      range: BB_DEFEND_THREE_X_RANGES[group] || null,
      sizingBand: "medium_2_51_to_3",
      assumedFacingSizeBB: facingSizeBB,
    };
  }
  return {
    range: BB_DEFEND_LARGE_OPEN_RANGES[group] || null,
    sizingBand: "large_over_3",
    assumedFacingSizeBB: facingSizeBB,
  };
}

function smallBlindRangeForOpen(group, facingSizeBB) {
  if (facingSizeBB === null) {
    return {
      range: SB_CONTINUE_RANGES[group] || null,
      sizingBand: "unknown_assume_standard",
      assumedFacingSizeBB: 2.5,
    };
  }
  if (facingSizeBB <= 2.2) {
    return {
      range: SB_CONTINUE_RANGES[group] || null,
      sizingBand: "small_2_2_or_less",
      assumedFacingSizeBB: facingSizeBB,
    };
  }
  if (facingSizeBB <= 2.5) {
    return {
      range: SB_CONTINUE_RANGES[group] || null,
      sizingBand: "standard_2_21_to_2_5",
      assumedFacingSizeBB: facingSizeBB,
    };
  }
  if (facingSizeBB <= 3) {
    return {
      range: SB_CONTINUE_THREE_X_RANGES[group] || null,
      sizingBand: "medium_2_51_to_3",
      assumedFacingSizeBB: facingSizeBB,
    };
  }
  return {
    range: SB_CONTINUE_LARGE_OPEN_RANGES[group] || null,
    sizingBand: "large_over_3",
    assumedFacingSizeBB: facingSizeBB,
  };
}

function pickLegal(legalActions, candidates) {
  const legal = new Set(
    (Array.isArray(legalActions) ? legalActions : []).map((action) =>
      String(action || "").toLowerCase(),
    ),
  );
  return candidates.find((candidate) => legal.has(candidate)) || null;
}

function rangeForTableSeat(tableSize, seat, shallow) {
  let normalizedSeat = String(seat || "").toUpperCase();
  const size = Number(tableSize || 8);
  if (size <= 6 && normalizedSeat === "UTG") normalizedSeat = "LJ";
  if (size >= 9 && normalizedSeat === "UTG+2") normalizedSeat = "UTG+1";
  return (shallow ? MTT_RFI_SHALLOW : MTT_RFI_STANDARD)[normalizedSeat] || null;
}

function multiwayPlayable(handCode) {
  return MULTIWAY_CONTINUE.has(handCode);
}

function facingOpenAnchor({
  handCode,
  handClass,
  heroSeat,
  opponentSeat,
  decisionKind,
  facingSizeBB,
  effectiveStackBB,
  legalActions,
}) {
  const group = openerGroup(opponentSeat);
  const effectiveFacingSizeBB = facingSizeBB ?? 2.5;
  const smallOpen = effectiveFacingSizeBB <= 2.5;
  const shallow = effectiveStackBB !== null && effectiveStackBB <= 20;
  const veryShort = effectiveStackBB !== null && effectiveStackBB <= 12;
  const multiway = decisionKind === "facing_open_callers";
  let range = null;
  let sizingBand = facingSizeBB === null
    ? "unknown_assume_standard"
    : facingSizeBB <= 2.5
      ? "small_2_5_or_less"
      : facingSizeBB <= 3
        ? "medium_2_51_to_3"
        : "large_over_3";
  let assumedFacingSizeBB = effectiveFacingSizeBB;
  if (heroSeat === "BB") {
    const selected = bigBlindRangeForOpen(group, facingSizeBB);
    range = selected.range;
    sizingBand = selected.sizingBand;
    assumedFacingSizeBB = selected.assumedFacingSizeBB;
  } else if (heroSeat === "SB") {
    const selected = smallBlindRangeForOpen(group, facingSizeBB);
    range = selected.range;
    sizingBand = selected.sizingBand;
    assumedFacingSizeBB = selected.assumedFacingSizeBB;
  } else if (["BTN", "CO"].includes(heroSeat)) {
    range = IP_CONTINUE_VS_OPEN;
  } else if (["HJ", "LJ", "UTG+1", "UTG+2"].includes(heroSeat)) {
    range = EARLY_MIDDLE_CONTINUE_VS_OPEN;
  }

  const spot = heroSeat === "BB"
    ? "bb_defend_vs_open"
    : heroSeat === "SB"
      ? "sb_defend_vs_open"
      : ["BTN", "CO"].includes(heroSeat)
        ? "in_position_continue_vs_open"
        : "early_middle_continue_vs_open";

  if (!range) {
    return {
      version: LIVE_PREFLOP_BASELINE_VERSION,
      applicable: false,
      source: "structural_hand_context_only",
      spot,
      handCode,
      handClass,
      verdict: "context_required",
      recommendedActions: [],
      fallbackAction: null,
      mixedAggressionCandidate: false,
      valueAggressionCandidate: false,
      sizingBand,
      assumedFacingSizeBB,
      confidence: "low",
      rationale:
        "No deterministic continue range is available for this exact seat configuration; use the supplied position, price, stack and action state without treating missing strategy data as a fold.",
    };
  }

  let continues = range.has(handCode);
  if (
    !["BB", "SB"].includes(heroSeat) &&
    !smallOpen &&
    !VALUE_3BET.has(handCode) &&
    !CALL_VS_3BET.has(handCode)
  ) {
    continues = false;
  }
  if (multiway && !multiwayPlayable(handCode)) continues = false;
  if (veryShort) {
    const preservePricedBigBlind =
      heroSeat === "BB" &&
      smallOpen &&
      ["small_blind", "button", "cutoff"].includes(group);
    const shallowRange = ["SB", "BB"].includes(heroSeat)
      ? SHALLOW_BLIND_CONTINUE
      : SHALLOW_CONTINUE;
    if (!preservePricedBigBlind && !shallowRange.has(handCode)) continues = false;
  }

  const lateOpen = ["small_blind", "button", "cutoff"].includes(group);
  const value3Bet = (lateOpen ? LATE_VALUE_3BET : VALUE_3BET).has(handCode);
  const blocker3Bet =
    lateOpen &&
    !multiway &&
    !shallow &&
    BLOCKER_3BET.has(handCode) &&
    ["SB", "BB", "BTN"].includes(heroSeat);
  const aggressive = continues && (value3Bet || blocker3Bet);
  const fallbackAction = continues
    ? aggressive
      ? pickLegal(legalActions, ["3-bet", "jam", "call"])
      : pickLegal(legalActions, ["call", "3-bet", "jam"])
    : pickLegal(legalActions, ["fold"]);
  const recommendedActions = continues
    ? aggressive
      ? ["3-bet", "call"]
      : ["call", "3-bet"]
    : ["fold"];
  return {
    version: LIVE_PREFLOP_BASELINE_VERSION,
    applicable: Boolean(range),
    source: "conservative_position_price_heuristic",
    spot,
    handCode,
    handClass,
    verdict: continues ? "continue" : "fold",
    recommendedActions,
    fallbackAction,
    mixedAggressionCandidate: blocker3Bet,
    valueAggressionCandidate: value3Bet,
    sizingBand,
    assumedFacingSizeBB,
    confidence:
      range && opponentSeat && facingSizeBB !== null
        ? ["BB", "SB"].includes(heroSeat) && facingSizeBB <= 3
          ? "medium"
          : smallOpen
          ? "medium"
          : "low"
        : "low",
    rationale: continues
      ? `${handCode} is inside the conservative ${spot.replaceAll("_", " ")} region against a ${opponentSeat || "position-unknown"} ${facingSizeBB ?? `size-unknown (assumed ${assumedFacingSizeBB})`} BB open in the ${sizingBand.replaceAll("_", " ")} band. Preserve the continue through ${recommendedActions.join(" or ")}; do not fold solely because the hand is non-premium.${blocker3Bet ? " This suited wheel ace is also a selective blocker 3-bet candidate." : ""}`
      : range
        ? `${handCode} falls outside this conservative continue anchor after accounting for opener position, size${multiway ? ", callers" : ""}, and stack depth.`
        : "No deterministic continue range is available for this exact seat configuration; use the supplied position, price, stack and action state.",
  };
}

function facingThreeBetAnchor({
  handCode,
  handClass,
  effectiveStackBB,
  relativePosition,
  legalActions,
}) {
  const shallow = effectiveStackBB !== null && effectiveStackBB <= 20;
  const strong = STRONG_VS_3BET.has(handCode);
  const playableCall = CALL_VS_3BET.has(handCode);
  const deepPairCall =
    relativePosition === "ip" &&
    effectiveStackBB !== null &&
    effectiveStackBB >= 35 &&
    /^([2-8])\1$/.test(handCode);
  const continues = strong || playableCall || deepPairCall;
  const fallbackAction = continues
    ? strong || (shallow && ["JJ", "TT", "AQs"].includes(handCode))
      ? pickLegal(legalActions, ["4-bet", "jam", "call"])
      : pickLegal(legalActions, ["call", "4-bet", "jam"])
    : pickLegal(legalActions, ["fold"]);
  return {
    version: LIVE_PREFLOP_BASELINE_VERSION,
    applicable: true,
    source: "conservative_facing_3bet_heuristic",
    spot: "facing_3bet_after_hero_open",
    handCode,
    handClass,
    verdict: continues ? "continue" : "fold",
    recommendedActions: continues
      ? strong
        ? ["4-bet", "jam", "call"]
        : ["call", "4-bet"]
      : ["fold"],
    fallbackAction,
    confidence: "medium",
    rationale: continues
      ? `${handCode} belongs to the conservative continue region after Hero's open. ${strong ? "Retain value 4-bet or jam branches." : "Protect a calling range rather than using fold-or-4-bet only."}`
      : `${handCode} is outside the conservative continue anchor versus a 3-bet at this depth and position.`,
  };
}

export function buildLivePreflopAnchor(context = {}) {
  const decision = context?.decisionNode || {};
  const street = String(decision?.street || context?.street || "").toLowerCase();
  if (street !== "preflop") return null;
  const handCode = canonicalLiveStartingHand(contextHeroCards(context));
  if (!handCode) return null;
  const handClass = describeStructuralPreflopHand(handCode);
  const gameType = String(
    decision?.gameType || context?.gameType || context?.format || "tournament",
  ).toLowerCase();
  const decisionKind = String(decision?.decisionKind || "").toLowerCase();
  const heroSeat = String(decision?.heroSeat || context?.heroSeat || "").toUpperCase();
  const opponentSeat = String(
    decision?.facingAction?.actorSeat ||
      decision?.opponentSeat ||
      context?.opponentSeat ||
      "",
  ).toUpperCase();
  const primaryEffectiveStackBB = finiteNonNegative(
    decision?.effectiveStackBB ??
      context?.stackInfo?.effective ??
      context?.heroStackBehindBB,
  );
  const heroDecisionStackBB = finiteNonNegative(
    decision?.startingHeroStackBB ??
      context?.stackInfo?.heroStarting ??
      context?.heroStackBB ??
      decision?.heroStackBehindBB ??
      context?.heroStackBehindBB,
  );
  const effectiveStackBB =
    decisionKind === "unopened"
      ? heroDecisionStackBB ?? primaryEffectiveStackBB
      : primaryEffectiveStackBB;
  const facingSizeBB = finiteNonNegative(
    decision?.facingAction?.toAmountBB ?? decision?.facingAction?.amountBB,
  );
  const tableSize = Number(decision?.tableSize || context?.tableSize || 8);
  const legalActions = Array.isArray(decision?.legalActions)
    ? decision.legalActions
    : context?.legalActions || [];
  const relativePosition = String(
    decision?.relativePosition || context?.relativePosition || "",
  ).toLowerCase();
  const shallow = effectiveStackBB !== null && effectiveStackBB <= 20;

  if (gameType !== "tournament") {
    return {
      version: LIVE_PREFLOP_BASELINE_VERSION,
      applicable: false,
      source: "structural_hand_context_only",
      spot: decisionKind || "preflop_other",
      handCode,
      handClass,
      verdict: "context_required",
      recommendedActions: [],
      fallbackAction: null,
      confidence: "low",
      rationale:
        "The tournament anchor is disabled outside tournament mode; use the cash-game range and rake context.",
    };
  }

  if (decisionKind === "unopened") {
    const range = rangeForTableSeat(tableSize, heroSeat, shallow);
    const shouldEnter = Boolean(range?.has(handCode));
    const fallbackAction = shouldEnter
      ? effectiveStackBB !== null && effectiveStackBB <= 12
        ? pickLegal(legalActions, ["jam", "open"])
        : pickLegal(legalActions, ["open", "jam"])
      : pickLegal(legalActions, ["fold"]);
    return {
      version: LIVE_PREFLOP_BASELINE_VERSION,
      applicable: Boolean(range),
      source: "conservative_mtt_rfi_chart",
      chartBand: shallow ? "shallow_20bb_or_less" : "standard_over_20bb",
      spot: "first_in_open",
      handCode,
      handClass,
      verdict: shouldEnter ? "enter" : "fold",
      recommendedActions: shouldEnter ? ["open", "jam"] : ["fold"],
      fallbackAction,
      confidence: range ? "high" : "low",
      rationale: range
        ? shouldEnter
          ? `${handCode} is inside the conservative ${heroSeat} first-in ${shallow ? "shallow" : "standard"} tournament range. Enter the pot; choose open versus jam from exact depth and stack geometry.`
          : `${handCode} is outside the conservative ${heroSeat} first-in ${shallow ? "shallow" : "standard"} tournament range.`
        : "No deterministic RFI chart is available for this seat or table configuration.",
    };
  }

  if (["facing_open", "facing_open_callers"].includes(decisionKind)) {
    return facingOpenAnchor({
      handCode,
      handClass,
      heroSeat,
      opponentSeat,
      decisionKind,
      facingSizeBB,
      effectiveStackBB,
      legalActions,
    });
  }

  if (decisionKind === "facing_3bet") {
    return facingThreeBetAnchor({
      handCode,
      handClass,
      effectiveStackBB,
      relativePosition,
      legalActions,
    });
  }

  if (decisionKind === "facing_open_and_3bet") {
    const premium = STRONG_VS_3BET.has(handCode);
    const fallbackAction = premium
      ? pickLegal(legalActions, ["4-bet", "jam", "call"])
      : pickLegal(legalActions, ["fold"]);
    return {
      version: LIVE_PREFLOP_BASELINE_VERSION,
      applicable: true,
      source: "conservative_cold_3bet_heuristic",
      spot: "cold_open_plus_3bet",
      handCode,
      handClass,
      verdict: premium ? "continue" : "fold",
      recommendedActions: premium ? ["4-bet", "jam", "call"] : ["fold"],
      fallbackAction,
      confidence: "medium",
      rationale: premium
        ? `${handCode} is robust enough to continue against both the opener and separate 3-bettor.`
        : `${handCode} is outside the conservative cold continue region when both the opener and 3-bettor remain live.`,
    };
  }

  return {
    version: LIVE_PREFLOP_BASELINE_VERSION,
    applicable: false,
    source: "structural_hand_context_only",
    spot: decisionKind || "preflop_other",
    handCode,
    handClass,
    verdict: "context_required",
    recommendedActions: [],
    fallbackAction: null,
    confidence: "low",
    rationale:
      "Use this structural hand class with the exact action order, position, size and stack depth; no deterministic action anchor applies.",
  };
}

export const __livePreflopBaselineTestables = {
  mttRfiStandard: MTT_RFI_STANDARD,
  mttRfiShallow: MTT_RFI_SHALLOW,
  bbDefendRanges: BB_DEFEND_RANGES,
  bbDefendStandardRanges: BB_DEFEND_STANDARD_RANGES,
  bbDefendThreeXRanges: BB_DEFEND_THREE_X_RANGES,
  bbDefendLargeOpenRanges: BB_DEFEND_LARGE_OPEN_RANGES,
  sbContinueRanges: SB_CONTINUE_RANGES,
  sbContinueThreeXRanges: SB_CONTINUE_THREE_X_RANGES,
  sbContinueLargeOpenRanges: SB_CONTINUE_LARGE_OPEN_RANGES,
  blocker3Bet: BLOCKER_3BET,
};
