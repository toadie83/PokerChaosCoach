export type RankCode = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
export type SuitCode = "h" | "d" | "c" | "s";
export type CardCode = `${RankCode}${SuitCode}`;

export interface ParsedCards {
  card1: CardCode;
  card2: CardCode;
}

const rankAliases = new Map<string, RankCode>([
  ["iv", "4"],
  ["ace", "A"],
  ["king", "K"],
  ["queen", "Q"],
  ["jack", "J"],
  ["ten", "T"],
  ["10", "T"],
  ["tenn", "T"],
  ["nine", "9"],
  ["9", "9"],
  ["8", "8"],
  ["eight", "8"],
  ["seven", "7"],
  ["7", "7"],
  ["six", "6"],
  ["6", "6"],
  ["five", "5"],
  ["5", "5"],
  ["four", "4"],
  ["for", "4"],
  ["fore", "4"],
  ["4", "4"],
  ["three", "3"],
  ["3", "3"],
  ["tree", "3"],
  ["trey", "3"],
  ["2", "2"],
  ["two", "2"],
  ["too", "2"],
  ["tu", "2"],
  ["deuce", "2"],
  ["ate", "8"],
  ["sicks", "6"],
  ["sixx", "6"],
  ["fife", "5"],
]);

const suitAliases = new Map<string, SuitCode>([
  ["heart", "h"],
  ["hearts", "h"],
  ["diamond", "d"],
  ["diamonds", "d"],
  ["club", "c"],
  ["clubs", "c"],
  ["spade", "s"],
  ["spades", "s"],
]);

const rankPattern = Array.from(rankAliases.keys())
  .sort((a, b) => b.length - a.length)
  .join("|");
const suitPattern = Array.from(suitAliases.keys())
  .sort((a, b) => b.length - a.length)
  .join("|");

const cardRegex = new RegExp(
  `\\b(?:a|an)?\\s*(?<rank>${rankPattern})\\s*(?:of\\s*)?(?<suit>${suitPattern})s?\\b`,
  "gi"
);

const connectorRegex = /\b(?:and|with|plus|pair|comma|then)\b/gi;

function normaliseInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(connectorRegex, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toCardCode(rankWord: string, suitWord: string): CardCode | null {
  const rank = rankAliases.get(rankWord);
  const suit = suitAliases.get(suitWord);
  if (!rank || !suit) {
    return null;
  }
  return `${rank}${suit}`;
}

function extractCards(input: string, expectedCount: number): CardCode[] {
  if (!input.trim()) {
    return [];
  }

  const text = normaliseInput(input);
  if (!text) {
    return [];
  }

  const tokens = text.split(" ").filter(Boolean);

  const matches: CardCode[] = [];
  const seen = new Set<CardCode>();
  let pendingRanks: RankCode[] = [];

  const pushCard = (rank: RankCode, suit: SuitCode) => {
    const card = `${rank}${suit}` as CardCode;
    if (seen.has(card)) {
      return;
    }
    seen.add(card);
    matches.push(card);
  };

  for (const token of tokens) {
    if (matches.length === expectedCount) {
      break;
    }

    const maybeRank = rankAliases.get(token);
    if (maybeRank) {
      pendingRanks.push(maybeRank);
      continue;
    }

    const maybeSuit = suitAliases.get(token);
    if (maybeSuit) {
      if (pendingRanks.length === 0) {
        continue;
      }
      for (const rank of pendingRanks) {
        pushCard(rank, maybeSuit);
        if (matches.length === expectedCount) {
          break;
        }
      }
      pendingRanks = [];
      continue;
    }
  }

  if (matches.length === expectedCount) {
    return matches;
  }

  // Fallback: use phrase-by-phrase extraction to capture any remaining cards.
  cardRegex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = cardRegex.exec(text))) {
    if (matches.length === expectedCount) {
      break;
    }
    const rankWord = match.groups?.rank;
    const suitWord = match.groups?.suit;
    if (!rankWord || !suitWord) {
      continue;
    }
    const card = toCardCode(rankWord, suitWord);
    if (!card || seen.has(card)) {
      continue;
    }
    seen.add(card);
    matches.push(card);
  }

  return matches;
}

export function parseSpokenNCards(input: string, expectedCount: number): CardCode[] | null {
  if (expectedCount <= 0) {
    return null;
  }
  const matches = extractCards(input, expectedCount);
  if (matches.length !== expectedCount) {
    return null;
  }
  return matches;
}

export function parseSpokenCards(input: string): ParsedCards | null {
  const matches = parseSpokenNCards(input, 2);
  if (!matches) {
    return null;
  }
  return { card1: matches[0], card2: matches[1] };
}
