export type RankCode = "A" | "K" | "Q" | "J" | "T" | "9" | "8" | "7" | "6" | "5" | "4" | "3" | "2";
export type SuitCode = "h" | "d" | "c" | "s";
export type CardCode = `${RankCode}${SuitCode}`;

export interface ParsedCards {
  card1: CardCode;
  card2: CardCode;
}

const rankAliases = new Map<string, RankCode>([
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
  ["4", "4"],
  ["three", "3"],
  ["3", "3"],
  ["trey", "3"],
  ["2", "2"],
  ["two", "2"],
  ["deuce", "2"],
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

export function parseSpokenCards(input: string): ParsedCards | null {
  if (!input.trim()) {
    return null;
  }

  const text = normaliseInput(input);
  if (!text) {
    return null;
  }

  // Reset lastIndex so repeated parses start from the beginning (RegExp with /g stores state).
  cardRegex.lastIndex = 0;

  const matches: CardCode[] = [];
  const seen = new Set<CardCode>();

  let match: RegExpExecArray | null;
  while ((match = cardRegex.exec(text))) {
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
    if (matches.length === 2) {
      break;
    }
  }

  if (matches.length !== 2) {
    return null;
  }

  return { card1: matches[0], card2: matches[1] };
}
