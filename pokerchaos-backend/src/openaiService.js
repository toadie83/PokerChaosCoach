import OpenAI from "openai";
import { z } from "zod";

let openaiClient = null;
function getClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

const VALID_ACTIONS = [
  "open",
  "call",
  "3-bet",
  "4-bet",
  "check",
  "bet",
  "raise",
  "jam",
  "fold",
];

const DEFAULT_MODEL = "gpt-4.1-mini";
const ALLOWED_MODELS = new Set(["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"]);

const RANK_VALUES = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};

const RANK_NAMES = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  T: "ten",
  9: "nine",
  8: "eight",
  7: "seven",
  6: "six",
  5: "five",
  4: "four",
  3: "three",
  2: "two",
};

const RANK_PLURALS = {
  A: "aces",
  K: "kings",
  Q: "queens",
  J: "jacks",
  T: "tens",
  9: "nines",
  8: "eights",
  7: "sevens",
  6: "sixes",
  5: "fives",
  4: "fours",
  3: "threes",
  2: "twos",
};

const SUIT_NAMES = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

const VALUE_TO_RANK = Object.entries(RANK_VALUES).reduce(
  (acc, [rank, value]) => {
    acc[value] = rank;
    return acc;
  },
  {},
);

const REVIEW_MODEL_OUTPUT_SCHEMA = z.object({
  overall_score: z.number(),
  preflop_score: z.number(),
  flop_score: z.number(),
  turn_score: z.number(),
  river_score: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  what_was_good: z.string().min(1),
  primary_leak: z.string().min(1),
  better_line: z.string().min(1),
  reasoning: z.string().min(1),
});

const NORMALIZED_REVIEW_SCHEMA = z.object({
  overall_score: z.number(),
  preflop_score: z.number().nullable(),
  flop_score: z.number().nullable(),
  turn_score: z.number().nullable(),
  river_score: z.number().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  what_was_good: z.string().min(1),
  primary_leak: z.string().min(1),
  better_line: z.string().min(1),
  reasoning: z.string().min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nullable(),
      completion_tokens: z.number().nullable(),
      total_tokens: z.number().nullable(),
    })
    .nullable(),
  guardrail_warnings: z.array(z.string()).optional(),
});

const VALIDATION_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  BLOCKER: "blocker",
};

function rankValueToName(value, plural = false) {
  const rank = VALUE_TO_RANK[value];
  if (!rank) return `${value}`;
  return plural ? RANK_PLURALS[rank] || `${rank}s` : RANK_NAMES[rank] || rank;
}

function parseCardCodeSafe(code) {
  if (typeof code !== "string" || code.length < 2) return null;
  const rank = code[0].toUpperCase();
  const suit = code[1].toLowerCase();
  if (!RANK_VALUES[rank] || !SUIT_NAMES[suit]) return null;
  return { rank, suit, value: RANK_VALUES[rank], code: `${rank}${suit}` };
}

function collectBoardCards(board) {
  const cards = [];
  if (!board) return cards;
  if (Array.isArray(board.flop)) {
    for (const card of board.flop) {
      const parsed = parseCardCodeSafe(card);
      if (parsed) cards.push(parsed);
    }
  }
  if (board.turn) {
    const turn = parseCardCodeSafe(board.turn);
    if (turn) cards.push(turn);
  }
  if (board.river) {
    const river = parseCardCodeSafe(board.river);
    if (river) cards.push(river);
  }
  return cards;
}

function hasStraight(values) {
  if (!Array.isArray(values) || values.length === 0) return false;
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.includes(14)) unique.push(1);
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) {
      run += 1;
      if (run >= 5) return true;
    } else if (unique[i] !== unique[i - 1]) {
      run = 1;
    }
  }
  return false;
}

function detectStraightDraw(values, heroValues, madeStraight) {
  if (madeStraight) return null;
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  const valueSet = new Set(unique);
  if (valueSet.has(14)) valueSet.add(1);
  const heroSet = new Set(heroValues);
  if (heroSet.has(14)) heroSet.add(1);
  let best = null;
  for (let start = 1; start <= 10; start++) {
    const seq = [start, start + 1, start + 2, start + 3, start + 4];
    const present = seq.filter((v) => valueSet.has(v));
    const missing = seq.filter((v) => !valueSet.has(v));
    if (missing.length !== 1) continue;
    const heroInvolved = present.some((v) => heroSet.has(v));
    if (!heroInvolved) continue;
    const missingValue = missing[0];
    const type =
      missingValue === seq[0] || missingValue === seq[4]
        ? "open_ended"
        : "gutshot";
    if (!best) {
      best = { type, highEnd: seq[4] };
    } else if (best.type === "gutshot" && type === "open_ended") {
      best = { type, highEnd: seq[4] };
    } else if (best.type === type && seq[4] > best.highEnd) {
      best = { type, highEnd: seq[4] };
    }
  }
  return best;
}

function straightHighLabel(value) {
  if (value === 14) return "ace-high";
  const rankName = rankValueToName(value, false);
  return `${rankName}-high`;
}

function computeStraightDetails(heroCards = [], boardCards = []) {
  if (!heroCards.length || !boardCards.length) return null;

  const valueSources = new Map();

  const addValue = (value, origin) => {
    if (!valueSources.has(value)) {
      valueSources.set(value, { hero: 0, board: 0 });
    }
    const entry = valueSources.get(value);
    entry[origin] += 1;
  };

  const registerCard = (card, origin) => {
    if (!card) return;
    addValue(card.value, origin);
    if (card.value === 14) addValue(1, origin);
  };

  heroCards.forEach((card) => registerCard(card, "hero"));
  boardCards.forEach((card) => registerCard(card, "board"));

  let heroStraight = null;
  let boardNutHigh = null;

  for (let start = 1; start <= 10; start++) {
    const sequence = [start, start + 1, start + 2, start + 3, start + 4];
    let available = true;
    let boardHits = 0;
    let heroHits = 0;

    for (const value of sequence) {
      const entry = valueSources.get(value);
      if (!entry) {
        available = false;
        break;
      }
      if (entry.board > 0) boardHits += 1;
      if (entry.hero > 0) heroHits += 1;
    }

    if (!available) continue;

    const highValue = sequence[4] === 1 ? 14 : sequence[4];

    if (boardHits >= 3) {
      if (!boardNutHigh || highValue > boardNutHigh) {
        boardNutHigh = highValue;
      }
    }

    const heroHasStraight = heroHits > 0 || boardHits >= 5;
    if (!heroHasStraight) continue;

    const boardOnly = heroHits === 0;

    if (
      !heroStraight ||
      highValue > heroStraight.high ||
      (highValue === heroStraight.high && heroStraight.boardOnly && !boardOnly)
    ) {
      heroStraight = {
        high: highValue,
        boardOnly,
        sequence,
      };
    }
  }

  if (!heroStraight) {
    return {
      hero: null,
      boardNutHigh,
      isNut: false,
    };
  }

  const isNut =
    !boardNutHigh || heroStraight.high >= boardNutHigh ? true : false;

  return {
    hero: {
      high: heroStraight.high,
      boardOnly: heroStraight.boardOnly,
      label: straightHighLabel(heroStraight.high),
    },
    boardNutHigh,
    boardNutLabel: boardNutHigh ? straightHighLabel(boardNutHigh) : null,
    isNut,
  };
}

function describeHandFeatures(heroCards = {}, board = {}) {
  const hero = [
    parseCardCodeSafe(heroCards?.card1),
    parseCardCodeSafe(heroCards?.card2),
  ].filter(Boolean);
  if (hero.length !== 2) return null;

  const boardCards = collectBoardCards(board);
  if (boardCards.length === 0) return null;

  const cards = [...hero, ...boardCards];
  const rankCounts = new Map();
  const suitCounts = new Map();
  for (const card of cards) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  }

  const boardSuitCounts = new Map();
  for (const card of boardCards) {
    boardSuitCounts.set(card.suit, (boardSuitCounts.get(card.suit) || 0) + 1);
  }

  const heroRanks = new Set(hero.map((c) => c.rank));
  const heroValues = hero.map((c) => c.value);
  const allValues = cards.map((c) => c.value);
  const boardValues = boardCards.map((c) => c.value);
  const sortedBoardValues = Array.from(new Set(boardValues)).sort(
    (a, b) => b - a,
  );
  const boardHigh = sortedBoardValues[0] ?? null;
  const boardSecond = sortedBoardValues[1] ?? null;
  const boardLow = sortedBoardValues[sortedBoardValues.length - 1] ?? null;

  const suitEntries = Array.from(suitCounts.entries());
  const flushSuitEntry = suitEntries.find(([, count]) => count >= 5);
  const hasFlush = Boolean(flushSuitEntry);
  const boardSuitEntries = Array.from(boardSuitCounts.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const boardFlushSuitEntry =
    boardSuitEntries.length && boardSuitEntries[0][1] >= 3
      ? boardSuitEntries[0]
      : null;
  const boardFlushSuit = boardFlushSuitEntry ? boardFlushSuitEntry[0] : null;
  const boardFlushCount = boardFlushSuitEntry ? boardFlushSuitEntry[1] : 0;
  const heroFlushBlocker = boardFlushSuit
    ? hero.some((card) => card.suit === boardFlushSuit)
    : false;
  const straightMade = hasStraight(allValues);
  const straightDraw = detectStraightDraw(allValues, heroValues, straightMade);
  const straightDetails = straightMade
    ? computeStraightDetails(hero, boardCards)
    : null;

  const rankEntries = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return RANK_VALUES[b[0]] - RANK_VALUES[a[0]];
  });

  const topCount = rankEntries[0]?.[1] || 1;
  const secondCount = rankEntries[1]?.[1] || 0;
  const topRank = rankEntries[0]?.[0] || null;
  const secondRank = rankEntries[1]?.[0] || null;

  let category = "high_card";
  if (straightMade && hasFlush) {
    category = "straight_flush";
  } else if (topCount === 4) {
    category = "four_of_a_kind";
  } else if (topCount === 3 && secondCount >= 2) {
    category = "full_house";
  } else if (hasFlush) {
    category = "flush";
  } else if (straightMade) {
    category = "straight";
  } else if (topCount === 3) {
    category = "three_of_a_kind";
  } else if (topCount === 2 && secondCount === 2) {
    category = "two_pair";
  } else if (topCount === 2) {
    category = "pair";
  }

  const drawTags = [];
  const drawPhrases = [];
  const notes = [];

  if (!hasFlush) {
    const flushDrawEntry = suitEntries.find(([, count]) => count === 4);
    if (flushDrawEntry) {
      const [suit] = flushDrawEntry;
      const heroHasSuit = hero.some((card) => card.suit === suit);
      if (heroHasSuit) {
        drawTags.push("flush_draw");
        drawPhrases.push(`${SUIT_NAMES[suit]} flush draw`);
      }
    }
  }

  if (straightDraw) {
    if (straightDraw.type === "open_ended") {
      drawTags.push("straight_draw_open");
      drawPhrases.push("open-ended straight draw");
    } else if (straightDraw.type === "gutshot") {
      drawTags.push("straight_draw_gutshot");
      drawPhrases.push("gutshot straight draw");
    }
  }

  if (category === "high_card" && drawTags.length === 0) {
    return {
      category,
      summary: "High-card hand.",
      draws: drawTags,
    };
  }

  const describeRank = (rank) =>
    rank ? RANK_NAMES[rank] || rank : "unknown rank";
  const describePlural = (rank) =>
    rank ? RANK_PLURALS[rank] || `${rank}s` : "pairs";

  let summary = "";
  let strength = null;
  let detail = null;

  switch (category) {
    case "straight_flush":
      summary = "Straight flush.";
      detail = "Straight flush";
      break;
    case "four_of_a_kind":
      summary = `Quads ${describePlural(topRank)}.`;
      detail = `Four of a kind (${describePlural(topRank)})`;
      break;
    case "full_house":
      summary = `Full house, ${describePlural(topRank)} over ${describePlural(
        secondRank,
      )}.`;
      detail = `Full house (${describePlural(topRank)} full of ${describePlural(
        secondRank,
      )})`;
      break;
    case "flush": {
      const suit = flushSuitEntry ? SUIT_NAMES[flushSuitEntry[0]] : "flush";
      summary = `Flush in ${suit}.`;
      detail = `${suit.charAt(0).toUpperCase() + suit.slice(1)} flush`;
      break;
    }
    case "straight":
      if (straightDetails?.hero) {
        const heroLabelRaw = straightDetails.hero.label;
        const heroLabel =
          heroLabelRaw.charAt(0).toUpperCase() + heroLabelRaw.slice(1);
        const boardNutLabel = straightDetails.boardNutLabel
          ? straightDetails.boardNutLabel.replace(/^([a-z])/, (letter) =>
              letter.toUpperCase(),
            )
          : null;
        detail = `${heroLabel} straight`;
        if (straightDetails.hero.boardOnly) {
          summary = `${heroLabel} straight on board.`;
          notes.push(
            "Straight relies entirely on board cards; no kicker edge.",
          );
        } else {
          summary = `${heroLabel} straight.`;
        }
        if (!straightDetails.isNut && boardNutLabel) {
          notes.push(
            `${boardNutLabel} straights remain; avoid treating the hand as the nuts.`,
          );
          summary = `${summary.replace(
            /\.$/,
            "",
          )}; higher ${boardNutLabel.toLowerCase()} straights are possible.`;
        } else {
          summary = `${summary.replace(/\.$/, "")} (nut straight).`;
        }
      } else {
        summary = "Straight made.";
        detail = "Straight";
      }
      break;
    case "three_of_a_kind":
      summary = `Trips ${describePlural(topRank)}.`;
      detail = `Three of a kind (${describePlural(topRank)})`;
      strength = heroRanks.has(topRank) ? "set" : "board_trips";
      break;
    case "two_pair": {
      const heroPairs = rankEntries
        .filter(([rank, count]) => count >= 2 && heroRanks.has(rank))
        .map(([rank]) => rank);
      const pairNames = rankEntries
        .slice(0, 2)
        .map(([rank]) => describePlural(rank));
      summary = `Two pair (${pairNames.join(" and ")}).`;
      detail = `Two pair (${pairNames.join(" and ")})`;
      strength =
        heroPairs.length === 2
          ? "both_pairs"
          : heroPairs.length === 1
            ? "one_pair_hero"
            : "board_two_pair";
      break;
    }
    case "pair": {
      const pairEntry = rankEntries.find(
        ([rank, count]) => count >= 2 && heroRanks.has(rank),
      );
      const pairRank = pairEntry?.[0];
      if (pairRank) {
        const pairValue = RANK_VALUES[pairRank];
        if (boardHigh && pairValue >= boardHigh) strength = "top_pair";
        else if (boardSecond && pairValue >= boardSecond)
          strength = "second_pair";
        else if (boardLow && pairValue > boardLow) strength = "middle_pair";
        else strength = "under_pair";
        summary = `Pair of ${describePlural(pairRank)} (${strength.replace(
          "_",
          " ",
        )}).`;
        detail = `Pair of ${describePlural(pairRank)}`;
      } else if (topRank) {
        summary = `Board pair (${describePlural(topRank)}).`;
        detail = `Board pair (${describePlural(topRank)})`;
        strength = "board_pair";
      } else {
        summary = "One pair.";
        detail = "Pair";
      }
      break;
    }
    default:
      summary = "High-card hand.";
      detail = "High card";
      break;
  }

  if (drawPhrases.length > 0) {
    summary = `${summary.replace(/\.$/, "")} with ${drawPhrases.join(
      " and ",
    )}.`;
  }

  return {
    category,
    detail,
    strength,
    draws: drawTags,
    drawDetails: drawPhrases,
    summary,
    boardTexture: {
      suit: boardFlushSuit ? SUIT_NAMES[boardFlushSuit] : null,
      count: boardFlushCount,
      heroFlushBlocker,
    },
    straightDetails: straightDetails || undefined,
    notes: notes.length ? notes : undefined,
  };
}

function summarizeHistory(history) {
  try {
    if (!Array.isArray(history) || history.length === 0) return "";
    const lastHero = [...history].reverse().find((h) => h?.actor === "hero");
    const lastOpp = [...history].reverse().find((h) => h?.actor === "opp");
    const aggrWords = [
      "bet",
      "raise",
      "jam",
      "3-bet",
      "4-bet",
      "open",
      "squeeze",
    ];
    const aggr = history.reduce(
      (n, h) =>
        n +
        (aggrWords.some((w) =>
          String(h?.action || "")
            .toLowerCase()
            .includes(w),
        )
          ? 1
          : 0),
      0,
    );
    const oddSize = history.some((h) => {
      const s = h?.sizing;
      if (!s || s.value == null) return false;
      if (s.kind === "x") return Math.abs(s.value - Math.round(s.value)) > 0.05; // non-round x
      if (s.kind === "pct") {
        const common = [0.5, 0.66, 0.75, 1.0, 1.33];
        return !common.some((v) => Math.abs(v - s.value) < 0.02);
      }
      return false;
    });
    const parts = [];
    if (lastHero)
      parts.push(
        `last_hero=${lastHero.action}${
          lastHero.sizing
            ? `(${lastHero.sizing.kind}:${lastHero.sizing.value})`
            : ""
        }`,
      );
    if (lastOpp) parts.push(`last_opp=${lastOpp.action}`);
    parts.push(`agg=${aggr}`);
    if (oddSize) parts.push("theme=oddsize");
    return parts.join(", ");
  } catch {
    return "";
  }
}

function buildStyleTone(style) {
  switch (style) {
    case "controlled_maniac":
      return "Tone: measured chaos - confident but strategic aggression.";
    case "villain_mode":
      return "Tone: theatrical villain - cocky, taunting, fearless.";
    case "chaos_shark":
    default:
      return "Tone: primal shark - fearless, hungry, relentless.";
  }
}

function buildMixHint(context) {
  try {
    const branch = String(context?.branch || "");
    const historyCount = context?.previousActions?.length ?? 0;
    let n = historyCount + branch.length;
    if (branch.startsWith("preflop_opened_to_me")) {
      n += 3;
    }
    const bucket = n % 7;
    if (bucket === 0)
      return "Mix mode: trap - favor checks and calls that invite mistakes.";
    if (bucket === 1)
      return "Mix mode: oddsize - pick eye-catching sizes like 61%, 77%, 133%, or 4.7x.";
    if (bucket === 2)
      return "Mix mode: level - favor deceptive moves (check-raise, small bet, slow play).";
    if (bucket === 3)
      return "Mix mode: dominance - assume strong image and keep maximum pressure on.";
    return "Mix mode: pressure - assertive aggression with calculated pauses.";
  } catch {
    return "Mix mode: pressure";
  }
}

function sizingCue(ctx) {
  try {
    const branch = String(ctx?.branch || "");
    const seat = String(ctx?.heroSeat || "").toUpperCase();
    const size = Number(ctx?.tableSize || 8);
    if (
      branch.startsWith("preflop_unopened") ||
      branch.startsWith("preflop_hero_opened")
    ) {
      const lateSeats = new Set(["BTN", "CO"]);
      const midSeats = new Set(["HJ", "LJ"]);
      const epSeats = new Set(["UTG", "UTG+1", "UTG+2"]);
      const optionsLate = ["2.2x", "2.3x", "2.5x", "2.7x", "3x"];
      const optionsMid = ["2.5x", "2.7x", "3x", "3.2x", "3.5x"];
      const optionsEP = ["2.7x", "3x", "3.2x", "3.5x", "3.8x"];
      const bump = (arr) =>
        size >= 9
          ? arr.map((v) => v.replace("2.", "2.").replace("3.", "3."))
          : arr;
      let pool = bump(optionsMid);
      if (lateSeats.has(seat)) pool = bump(optionsLate);
      else if (epSeats.has(seat)) pool = bump(optionsEP);
      const branchLen = branch.length;
      const prevCount = ctx?.previousActions?.length ?? 0;
      const idx = (branchLen + prevCount) % pool.length;
      const preferred = pool[idx];
      return `Open size preferences: ${pool.join(", ")}. Prefer: ${preferred}.`;
    }
    if (branch.startsWith("preflop_opened_to_me")) {
      const inPos = new Set(["BTN", "CO"]);
      const outPos = new Set(["SB", "BB"]);
      const poolIP = ["3x", "3.3x", "3.5x", "3.7x"];
      const poolOOP = ["4x", "4.3x", "4.5x"];
      const pool = inPos.has(seat)
        ? poolIP
        : outPos.has(seat)
          ? poolOOP
          : ["3.5x", "3.8x", "4x"];
      const idx =
        ((ctx?.previousActions?.length ?? 0) + branch.length) % pool.length;
      const preferred = pool[idx];
      return `3-bet size preferences: ${pool.join(
        ", ",
      )}. Prefer: ${preferred}.`;
    }
  } catch {}
  return "";
}

function formatHeroHand(context = {}) {
  const raw =
    typeof context?.heroHand === "string" ? context.heroHand.trim() : "";
  if (raw && raw.length >= 4) {
    const compact = raw.replace(/\s+/g, "");
    const readable =
      raw.length === 4 ? `${raw.slice(0, 2)} ${raw.slice(2)}` : raw;
    return { compact, readable };
  }
  const cards = context?.heroCards || {};
  const c1 = cards.card1;
  const c2 = cards.card2;
  if (!c1 || !c2) return { compact: null, readable: null };
  const compact = `${String(c1)}${String(c2)}`.replace(/\s+/g, "");
  const readable = `${c1} ${c2}`;
  return { compact, readable };
}

function describeHand(compact) {
  if (!compact || compact.length < 4) return null;
  const rank1 = compact[0]?.toUpperCase();
  const suit1 = compact[1]?.toLowerCase();
  const rank2 = compact[2]?.toUpperCase();
  const suit2 = compact[3]?.toLowerCase();
  if (!rank1 || !rank2 || !suit1 || !suit2) return null;
  if (rank1 === rank2) return `${rank1}${rank2} pocket pair`;
  const suited = suit1 === suit2;
  return `${rank1}${rank2} ${suited ? "suited" : "offsuit"}`;
}

function sortRanksDescending(rankA, rankB) {
  const a = RANK_VALUES[rankA] || 0;
  const b = RANK_VALUES[rankB] || 0;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function categorizeRangeHand(compact) {
  if (!compact || compact.length < 4) {
    return { tier: "unknown", label: "unknown hand" };
  }
  const r1 = compact[0]?.toUpperCase();
  const s1 = compact[1]?.toLowerCase();
  const r2 = compact[2]?.toUpperCase();
  const s2 = compact[3]?.toLowerCase();
  if (!RANK_VALUES[r1] || !RANK_VALUES[r2]) {
    return { tier: "unknown", label: "unknown hand" };
  }
  const pair = r1 === r2;
  const suited = s1 === s2;
  const ranks = [r1, r2].sort(sortRanksDescending);
  const hi = ranks[0];
  const lo = ranks[1];
  const hiVal = RANK_VALUES[hi];
  const loVal = RANK_VALUES[lo];
  const gap = Math.max(0, hiVal - loVal - 1);

  if (pair) {
    if (hiVal >= 13)
      return { tier: "premium", label: `${hi}${hi} premium pair` };
    if (hiVal >= 11) return { tier: "strong", label: `${hi}${hi} strong pair` };
    if (hiVal >= 9) return { tier: "medium", label: `${hi}${hi} medium pair` };
    if (hiVal >= 6) return { tier: "marginal", label: `${hi}${hi} small pair` };
    return { tier: "trash", label: `${hi}${hi} bottom pair` };
  }

  if (suited) {
    if (hiVal >= 13 && loVal >= 11)
      return { tier: "premium", label: `${hi}${lo}s premium suited` };
    if (hiVal >= 12 && loVal >= 9)
      return { tier: "strong", label: `${hi}${lo}s strong suited` };
    if (hiVal >= 11 && loVal >= 7 && gap <= 3)
      return { tier: "medium", label: `${hi}${lo}s playable suited connector` };
    if (hiVal >= 10 && loVal >= 6 && gap <= 4)
      return { tier: "marginal", label: `${hi}${lo}s speculative suited` };
    return { tier: "trash", label: `${hi}${lo}s weak suited` };
  }

  // offsuit
  if (hiVal >= 14 && loVal >= 11)
    return { tier: "strong", label: `${hi}${lo}o strong offsuit broadway` };
  if (hiVal >= 13 && loVal >= 10 && gap <= 2)
    return { tier: "medium", label: `${hi}${lo}o playable offsuit broadway` };
  if (hiVal >= 12 && loVal >= 9 && gap <= 3)
    return { tier: "marginal", label: `${hi}${lo}o marginal offsuit` };
  return { tier: "trash", label: `${hi}${lo}o offsuit trash` };
}

function positionCategory(seat) {
  const s = String(seat || "").toUpperCase();
  if (!s) return "unknown";
  if (["BTN", "CO"].includes(s)) return "late";
  if (["HJ", "LJ"].includes(s)) return "mid";
  if (["UTG", "UTG+1", "UTG+2"].includes(s)) return "early";
  if (["SB", "BB"].includes(s)) return "blind";
  return "unknown";
}

function actionContext(previousActions = [], branch = "") {
  const last = previousActions.slice(-1)[0] || "";
  const list = [...previousActions, branch].filter(Boolean);
  const context = {
    facingOpen: false,
    facing3bet: false,
    heroOpened: false,
    multiway: false,
    buttonSteal: false,
  };
  for (const code of list) {
    if (/preflop_opened_to_me/.test(code)) context.facingOpen = true;
    if (/preflop_button_steal/.test(code)) {
      context.facingOpen = true;
      context.buttonSteal = true;
    }
    if (
      /preflop_faced_3bet/.test(code) ||
      /preflop_opp_raise/.test(code) ||
      /_opp_4bet/.test(code)
    )
      context.facing3bet = true;
    if (/preflop_hero_opened/.test(code)) context.heroOpened = true;
    if (/multi/.test(code)) context.multiway = true;
  }
  return context;
}

function stackSnapshot(context = {}) {
  const hero = Number(context?.heroStackBB ?? 0);
  const villain = Number(context?.villainStackBB ?? 0);
  const heroValid = Number.isFinite(hero) && hero > 0;
  const villainValid = Number.isFinite(villain) && villain > 0;
  const effective = heroValid
    ? villainValid
      ? Math.min(hero, villain)
      : hero
    : villainValid
      ? villain
      : null;
  return {
    hero: heroValid ? hero : null,
    villain: villainValid ? villain : null,
    effective,
  };
}

async function completePrompt({
  system,
  user,
  temperature = 0.6,
  top_p = 0.85,
  max_tokens = 120,
  model = DEFAULT_MODEL,
}) {
  const chosenModel = ALLOWED_MODELS.has(model) ? model : DEFAULT_MODEL;
  const completion = await getClient().chat.completions.create({
    model: chosenModel,
    temperature,
    top_p,
    max_tokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const choice = completion.choices?.[0]?.message;
  const content = choice?.content?.trim() || "";
  const parsed =
    (choice && Object.prototype.hasOwnProperty.call(choice, "parsed")
      ? choice.parsed
      : undefined) || safeJsonParse(content);

  if (!parsed && process.env.DEBUG_AI_OUTPUTS === "true") {
    console.warn("[ChaosCoach] Raw AI output (unparsed):", content);
  }

  return { parsed, completion };
}

function buildResponse(
  parsed,
  completion,
  fallbackFlavor,
  fallbackAction = "aggress",
) {
  let hero_action = String(parsed?.hero_action || fallbackAction).trim();
  const normalized = hero_action.toLowerCase();
  if (!VALID_ACTIONS.includes(normalized)) {
    hero_action = fallbackAction;
  }
  let sizing = String(parsed?.sizing || "pot").trim();
  if (!sizing) sizing = "pot";
  let flavor_text = String(parsed?.flavor_text || fallbackFlavor).trim();
  if (!flavor_text) flavor_text = fallbackFlavor;
  const usage = completion.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;
  return { hero_action, sizing, flavor_text, usage };
}

function clampStreetScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return Math.max(-2, Math.min(2, rounded));
}

const ILLEGAL_AGGRESSIVE_PATTERNS = [
  /\bshove\b/i,
  /\bjam\b/i,
  /\bre-?jam\b/i,
  /\bre-?shove\b/i,
  /\b4-?bet\b/i,
  /\b3-?bet\b/i,
  /\bclick[\s-]?back\b/i,
  /\bre-?raise\b/i,
  /\braise(?:d|s|ing)?\b/i,
];
const HARD_ILLEGAL_RECOMMENDATION_PATTERNS = [
  /\b(?:should|must|always|never fold|best line is|recommended)\b[\s\S]{0,40}\b(?:raise|jam|shove|rejam|reshove|4-?bet)\b/i,
  /\b(?:raise|jam|shove|rejam|reshove|4-?bet)\b[\s\S]{0,30}\b(?:now|here|instead)\b/i,
];
const PREFLOP_ENDED_FORBIDDEN_PATTERNS = [
  /\bflop\b/i,
  /\bturn\b/i,
  /\briver\b/i,
  /\bboard texture\b/i,
  /\bimplied odds\b/i,
  /\bmultiway\b/i,
];
const AMBIGUOUS_AGGRESSION_PATTERNS = [
  /\bapply pressure\b/i,
  /\bfight for the pot\b/i,
  /\baggressive option\b/i,
  /\bconsider(?:\s+\w+){0,2}\s+(?:jamming|jam|shoving|shove|raising|raise)\b/i,
  /\bpress(?:ing)?(?:ure)?\b/i,
];
const CERTAINTY_PATTERNS = [
  /\bmandatory\b/i,
  /\b100%\b/i,
  /\balways\b/i,
  /\bnever\b/i,
  /\bguaranteed\b/i,
];
const STACK_DEPTH_TIER = {
  SHORT: "short",
  MID: "mid",
  DEEP: "deep",
  UNKNOWN: "unknown",
};
const STACK_DEPTH_INCOHERENT_PATTERNS = {
  [STACK_DEPTH_TIER.SHORT]: [
    {
      pattern: /\bpostflop (?:maneuverability|maneuvering|playability)\b/i,
      label: "postflop maneuverability",
    },
    {
      pattern: /\bsmall\s*3-?bet(?:s)?\b/i,
      label: "small 3-bets",
    },
    {
      pattern: /\bspeculative (?:realization|flat(?:s|ting)?|call(?:s|ing)?)\b/i,
      label: "speculative realization",
    },
    {
      pattern: /\bthin exploit flat(?:s|ting)?\b/i,
      label: "thin exploit flats",
    },
    {
      pattern: /\bset[-\s]?min(?:e|ing)\b/i,
      label: "set-mining framing",
    },
  ],
  [STACK_DEPTH_TIER.MID]: [
    {
      pattern: /\bdeep-?stack(?:ed)?\s+postflop\s+maneuver(?:ing|ability)?\b/i,
      label: "deep-stack maneuverability claim",
    },
    {
      pattern: /\b(?:pure|strict|only)\s+shove\/?fold\b/i,
      label: "pure shove/fold framing",
    },
  ],
  [STACK_DEPTH_TIER.DEEP]: [
    {
      pattern: /\b(?:pure|strict|only)\s+shove\/?fold\b/i,
      label: "pure shove/fold framing",
    },
    {
      pattern: /\bno postflop (?:maneuverability|edge|realization)\b/i,
      label: "no-postflop claim",
    },
  ],
};
const TERMINOLOGY_PATTERNS = {
  trips_as_pair: /\b(top pair|single pair|one pair)\b/i,
  overpair_as_weak: /\b(middle pair|weak pair)\b/i,
  bluff_catcher_reference: /\bbluff[ -]?catch(?:er|ing)\b/i,
  top_pair_label: /\btop pair\b/i,
  medium_strength_pair_label: /\bmedium[-\s]?strength pair\b/i,
  showdown_hand_label: /\bshowdown hand\b/i,
  thin_value_label: /\bthin value\b/i,
  induce_bluffs_label: /\binduce bluffs?\b/i,
  bluff_catching_line_label: /\bbluff[-\s]?catching line\b/i,
};
const PASSIVE_RIVER_CHECK_PATTERN =
  /\b(check(?:ing)?(?:\s+back)?(?:\s+the)?\s+river|river check)\b/i;
const PAIRED_BOARD_OVERSTATEMENT_PATTERN =
  /\b(uncapped value pressure|strong nut advantage)\b/i;
const FALSE_SHOWDOWN_LINE_PATTERN =
  /\b(check[-\s]?call|check and call|induce bluffs?|bluff[ -]?catch(?:er|ing)?)\b/i;
const BOARD_RELATIVE_OVERCLAIM_PATTERN =
  /\b(thin value|medium[-\s]?strength made hand|top pair)\b/i;
const SPECULATIVE_PREFLOP_SUGGESTION_PATTERN =
  /\b(slightly too tight|slightly tight|consider (?:calling|a call)|call occasionally|light 3-?bet|small 3-?bet|3-?bet(?:\/| or )?call|postflop maneuverability|speculative flat(?:s|ting)?|defend (?:wider|more often))\b/i;
const WEAK_OFFSUIT_AGGRESSION_PATTERN =
  /\b(call(?:ing)?|3-?bet(?:ting)?|re-?jam(?:ming)?|shove|jam|maneuverability)\b/i;

const SAFE_REWRITE_RULES = [
  {
    pattern: /\bapply pressure\b/gi,
    replacement: "continue cautiously",
  },
  {
    pattern: /\bconsider(?:\s+\w+){0,2}\s+(?:jamming|jam|shoving|shove|raising|raise)\b/gi,
    replacement: "consider continuing",
  },
  {
    pattern: /\bfight for the pot\b/gi,
    replacement: "evaluate calling frequency",
  },
  {
    pattern: /\baggressive option\b/gi,
    replacement: "more active continuation",
  },
];
const USER_FACING_BANNED_TERMS = [
  /\bvalidation\b/i,
  /\bnode\b/i,
  /\bconstrained action set\b/i,
  /\bdeterministic\b/i,
  /\bschema\b/i,
  /\bvalidator\b/i,
  /\brecovery\b/i,
  /\bunsupported concept\b/i,
  /\blegal action set\b/i,
  /\bchecks failed\b/i,
  /\bguardrails?\b/i,
];
const COACHING_SANITIZE_REPLACEMENTS = [
  {
    pattern: /line selection should stay within legal actions for this node\.?/gi,
    replacement: "This appears to be a fairly standard decision without major deviation.",
  },
  {
    pattern: /the review correctly preserved decision focus under a constrained action set\.?/gi,
    replacement: "The preflop decision itself appears fundamentally reasonable.",
  },
  {
    pattern: /concept-heavy language was reduced because required supporting data is not validated in this hand\.?/gi,
    replacement:
      "This spot appears relatively close, so recommendations are intentionally conservative.",
  },
  {
    pattern: /given this node, keep the plan centered on calling or folding\.?/gi,
    replacement: "This spot appears close; focus on choosing between the most practical options.",
  },
  {
    pattern: /stay with the clearest legal options in this node/gi,
    replacement: "Stay with the clearest practical options in this spot",
  },
];
const HARSH_TONE_PATTERNS = [
  { pattern: /\bsignificant leak\b/gi, replacement: "meaningful adjustment area" },
  { pattern: /\bmajor mistake\b/gi, replacement: "costly spot" },
  { pattern: /\bmistake\b/gi, replacement: "slightly costly decision" },
  { pattern: /\bbad\b/gi, replacement: "suboptimal" },
  { pattern: /\bincorrect\b/gi, replacement: "less preferred" },
  { pattern: /\bwrong\b/gi, replacement: "likely less optimal" },
];
const INTERNAL_JARGON_RULES = [
  {
    pattern: /\bboard-relative strength\b/gi,
    replacement: "how strongly hero's hand holds up on this board",
    label: "board-relative strength",
  },
  {
    pattern: /\bboard-pair-plus-kicker\b/gi,
    replacement: "paired board with limited showdown value",
    label: "board-pair-plus-kicker",
  },
  {
    pattern: /\bhero does not materially improve the paired board\b/gi,
    replacement: "hero's hand remains very weak on the paired board",
    label: "materially improve board",
  },
  {
    pattern: /\bshowdown expectations should stay conservative\b/gi,
    replacement: "this hand is unlikely to win often at showdown",
    label: "showdown expectations should stay conservative",
  },
  {
    pattern: /\beffectiveHandCategory\b/gi,
    replacement: "hand profile",
    label: "effectiveHandCategory",
  },
  {
    pattern: /\bshowdownRelevance\b/gi,
    replacement: "showdown value",
    label: "showdownRelevance",
  },
  {
    pattern: /\bheroContributionLevel\b/gi,
    replacement: "hole-card contribution",
    label: "heroContributionLevel",
  },
  {
    pattern: /\bheroContribution\b/gi,
    replacement: "hole-card contribution",
    label: "heroContribution",
  },
  {
    pattern: /\bmaterially improve board\b/gi,
    replacement: "materially strengthen the hand",
    label: "materially improve board",
  },
];
const INTERNAL_JARGON_LEAK_PATTERNS = [
  { pattern: /\bboard-relative\b/i, label: "board-relative" },
  { pattern: /\bshowdownRelevance\b/i, label: "showdownRelevance" },
  { pattern: /\beffectiveHandCategory\b/i, label: "effectiveHandCategory" },
  { pattern: /\bboard-pair-plus-kicker\b/i, label: "board-pair-plus-kicker" },
  { pattern: /\bheroContributionLevel\b/i, label: "heroContributionLevel" },
  { pattern: /\bmaterially improve board\b/i, label: "materially improve board" },
];
const GENERIC_NARRATION_FLATTENING_PATTERN =
  /\b(weak hand|limited showdown value|unlikely to win often(?: at showdown)?|practical line|intentionally conservative|cautious practical line)\b/i;
const SHOWDOWN_PASSIVE_PATTERN =
  /\b(bluff[ -]?catch(?:er|ing)|check[-\s]?call|check and call|induce bluffs?)\b/i;
const OVERLY_WEAK_SHOWDOWN_PATTERN =
  /\b(very little showdown value|limited showdown value|unlikely to win often(?: at showdown)?|bluff-or-give-up)\b/i;

function hasIllegalAggressiveMention(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return ILLEGAL_AGGRESSIVE_PATTERNS.some((pattern) => pattern.test(value));
}

function hasHardIllegalRecommendation(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return HARD_ILLEGAL_RECOMMENDATION_PATTERNS.some((pattern) =>
    pattern.test(value),
  );
}

function hasAmbiguousAggressionWording(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return AMBIGUOUS_AGGRESSION_PATTERNS.some((pattern) => pattern.test(value));
}

function hasExcessiveCertaintyWording(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return CERTAINTY_PATTERNS.some((pattern) => pattern.test(value));
}

function longestConsecutiveRun(values = []) {
  const unique = Array.from(new Set(values))
    .filter((value) => Number.isFinite(Number(value)))
    .map((value) => Number(value))
    .sort((a, b) => a - b);
  if (unique.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i] === unique[i - 1] + 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function rankCharToDescriptor(rankChar = "") {
  const rank = String(rankChar || "").toUpperCase();
  const rankName = rankValueToName(RANK_VALUES[rank], false);
  const rankPlural = rankValueToName(RANK_VALUES[rank], true);
  return {
    rank,
    rankName: String(rankName || rank).trim(),
    rankPlural: String(rankPlural || `${rank}s`).trim(),
  };
}

function compareCategoryStrength(a = "air", b = "air") {
  const ranks = {
    air: 0,
    high_card: 0,
    pair: 1,
    two_pair: 2,
    trips: 3,
    straight: 4,
    flush: 5,
    full_house: 6,
    quads: 7,
  };
  return (ranks[a] || 0) - (ranks[b] || 0);
}

function classifyFiveCardMadeHand(cards = []) {
  const parsed = (Array.isArray(cards) ? cards : [])
    .map((card) => (typeof card === "string" ? parseCardCodeSafe(card) : card))
    .filter(Boolean);
  if (parsed.length < 5) {
    return {
      category: "air",
      pairType: "none",
      topRank: null,
      secondRank: null,
    };
  }
  const rankCounts = new Map();
  const suits = new Map();
  for (const card of parsed) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    suits.set(card.suit, (suits.get(card.suit) || 0) + 1);
  }
  const entries = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (RANK_VALUES[b[0]] || 0) - (RANK_VALUES[a[0]] || 0);
  });
  const topCount = entries[0]?.[1] || 1;
  const secondCount = entries[1]?.[1] || 0;
  const topRank = entries[0]?.[0] || null;
  const secondRank = entries[1]?.[0] || null;
  const hasFlush = Array.from(suits.values()).some((count) => count >= 5);
  const hasStraightMade = hasStraight(parsed.map((card) => card.value));
  let category = "air";
  if (topCount === 4) category = "quads";
  else if (topCount === 3 && secondCount >= 2) category = "full_house";
  else if (hasFlush) category = "flush";
  else if (hasStraightMade) category = "straight";
  else if (topCount === 3) category = "trips";
  else if (topCount === 2 && secondCount === 2) category = "two_pair";
  else if (topCount === 2) category = "pair";
  return {
    category,
    pairType: category === "pair" ? "pair" : "none",
    topRank,
    secondRank,
  };
}

function deriveHandClassification(handState = {}) {
  const effectiveStack = Number(handState?.effectiveStackBB);
  const stackDepthTier = Number.isFinite(effectiveStack)
    ? effectiveStack < 10
      ? STACK_DEPTH_TIER.SHORT
      : effectiveStack <= 20
        ? STACK_DEPTH_TIER.MID
        : STACK_DEPTH_TIER.DEEP
    : STACK_DEPTH_TIER.UNKNOWN;
  const heroCards = Array.isArray(handState?.heroHand)
    ? handState.heroHand.map((card) => parseCardCodeSafe(card)).filter(Boolean)
    : [];
  const boardCards = Array.isArray(handState?.boardCards)
    ? handState.boardCards.map((card) => parseCardCodeSafe(card)).filter(Boolean)
    : [];
  const boardValues = boardCards.map((card) => card.value);
  const boardSuits = boardCards.map((card) => card.suit);
  const boardRanks = boardCards.map((card) => card.rank);
  const boardRankCounts = new Map();
  for (const rank of boardRanks) {
    boardRankCounts.set(rank, (boardRankCounts.get(rank) || 0) + 1);
  }
  const pairedBoard = Array.from(boardRankCounts.values()).some((count) => count >= 2);
  const connectedBoard =
    boardValues.length >= 3 &&
    (longestConsecutiveRun(boardValues) >= 3 ||
      Math.max(...boardValues) - Math.min(...boardValues) <= 4);
  const monotoneBoard =
    boardSuits.length >= 3 && new Set(boardSuits).size === 1;

  const blockers = Array.from(new Set(heroCards.map((card) => card.rank))).sort(
    (a, b) => (RANK_VALUES[b] || 0) - (RANK_VALUES[a] || 0),
  );
  const boardOnlyClassification = classifyFiveCardMadeHand(boardCards);
  const boardMadeHand = boardOnlyClassification.category;

  if (heroCards.length !== 2) {
    return {
      madeHandCategory: "air",
      pairType: "none",
      tripsType: "none",
      showdownStrength: "none",
      showdownRelevance: "none",
      bluffCatcher: false,
      boardMadeHand,
      heroImprovesBoard: false,
      heroContributionLevel: "none",
      kickerStrength: "none",
      boardPairKickerClass: "air",
      effectiveHandCategory: "air",
      drawsPresent: { flushDraw: false, straightDraw: false },
      blockers,
      boardInteraction: { pairedBoard, connectedBoard, monotoneBoard },
      stackDepthTier,
      primaryMadeRank: null,
      kickerRanks: [],
    };
  }

  const cards = [...heroCards, ...boardCards];
  const suitCounts = new Map();
  const rankCounts = new Map();
  for (const card of cards) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
    rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
  }
  const rankEntries = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (RANK_VALUES[b[0]] || 0) - (RANK_VALUES[a[0]] || 0);
  });
  const topCount = rankEntries[0]?.[1] || 1;
  const secondCount = rankEntries[1]?.[1] || 0;
  const topRank = rankEntries[0]?.[0] || null;
  const allValues = cards.map((card) => card.value);
  const heroValues = heroCards.map((card) => card.value);
  const straightMade = hasStraight(allValues);
  const hasFlush = Array.from(suitCounts.values()).some((count) => count >= 5);

  let madeHandCategory = "air";
  if (topCount === 4) madeHandCategory = "quads";
  else if (topCount === 3 && secondCount >= 2) madeHandCategory = "full_house";
  else if (hasFlush) madeHandCategory = "flush";
  else if (straightMade) madeHandCategory = "straight";
  else if (topCount === 3) madeHandCategory = "trips";
  else if (topCount === 2 && secondCount === 2) madeHandCategory = "two_pair";
  else if (topCount === 2) madeHandCategory = "pair";

  let pairType = "none";
  if (madeHandCategory === "pair" && boardCards.length > 0) {
    const pairRank = rankEntries.find(([, count]) => count >= 2)?.[0] || null;
    const boardSorted = Array.from(new Set(boardValues)).sort((a, b) => b - a);
    const boardHigh = boardSorted[0] ?? null;
    const boardSecond = boardSorted[1] ?? null;
    const pairValue = pairRank ? RANK_VALUES[pairRank] : null;
    const heroPocketPair =
      heroCards[0]?.rank &&
      heroCards[1]?.rank &&
      heroCards[0].rank === heroCards[1].rank;
    const pairOnBoard = pairRank
      ? (boardRankCounts.get(pairRank) || 0) > 0
      : false;
    if (
      heroPocketPair &&
      pairRank &&
      heroCards[0].rank === pairRank &&
      !pairOnBoard &&
      Number.isFinite(boardHigh) &&
      pairValue > boardHigh
    ) {
      pairType = "overpair";
    } else if (pairRank && Number.isFinite(boardHigh) && pairValue === boardHigh) {
      pairType = "top";
    } else if (pairRank && Number.isFinite(boardSecond) && pairValue >= boardSecond) {
      pairType = "middle";
    } else if (pairRank) {
      pairType = "bottom";
    }
  }

  let tripsType = "none";
  if (madeHandCategory === "trips" && topRank) {
    const heroTripCount = heroCards.filter((card) => card.rank === topRank).length;
    if (heroTripCount === 2) tripsType = "set";
    else if (heroTripCount === 1) tripsType = "trips";
    else tripsType = "board_trips";
  }

  let showdownStrength = "none";
  if (madeHandCategory === "pair") {
    showdownStrength =
      pairType === "overpair" || pairType === "top" ? "medium" : "weak";
  } else if (madeHandCategory === "two_pair") {
    showdownStrength = "strong";
  } else if (madeHandCategory === "trips") {
    showdownStrength = tripsType === "board_trips" ? "medium" : "strong";
  } else if (
    madeHandCategory === "straight" ||
    madeHandCategory === "flush" ||
    madeHandCategory === "full_house" ||
    madeHandCategory === "quads"
  ) {
    showdownStrength = "strong";
  }

  const flushDraw = !hasFlush
    ? Array.from(suitCounts.entries()).some(
        ([suit, count]) =>
          count === 4 && heroCards.some((card) => card.suit === suit),
      )
    : false;
  const straightDraw = !straightMade
    ? Boolean(detectStraightDraw(allValues, heroValues, false))
    : false;
  const drawsPresent = {
    flushDraw,
    straightDraw,
  };
  const topDescriptor = rankCharToDescriptor(topRank || "");
  const boardTopDescriptor = rankCharToDescriptor(
    boardOnlyClassification?.topRank || "",
  );
  const heroKickerRanks = heroCards
    .map((card) => card.rank)
    .filter((rank) => rank !== topDescriptor.rank)
    .sort((a, b) => (RANK_VALUES[b] || 0) - (RANK_VALUES[a] || 0));
  const heroHighKickerRank = heroCards
    .map((card) => card.rank)
    .sort((a, b) => (RANK_VALUES[b] || 0) - (RANK_VALUES[a] || 0))[0] || null;
  const heroHighKickerValue = RANK_VALUES[heroHighKickerRank] || 0;
  const boardMainRank = boardTopDescriptor.rank || null;
  const boardTopKickerValue = Math.max(
    0,
    ...boardCards
      .map((card) => (card.rank !== boardMainRank ? card.value : 0))
      .filter((value) => Number.isFinite(value)),
  );

  let heroContributionLevel = "none";
  const categoryDelta = compareCategoryStrength(madeHandCategory, boardMadeHand);
  if (categoryDelta >= 2) heroContributionLevel = "strong";
  else if (categoryDelta === 1) heroContributionLevel = "moderate";
  else if (categoryDelta === 0 && boardMadeHand === "pair" && madeHandCategory === "pair") {
    if (heroHighKickerValue >= 14) heroContributionLevel = "moderate";
    else if (heroHighKickerValue >= 13)
      heroContributionLevel = "weak";
    else heroContributionLevel = "none";
  } else if (
    categoryDelta === 0 &&
    boardMadeHand === "two_pair" &&
    madeHandCategory === "two_pair"
  ) {
    heroContributionLevel = heroHighKickerValue >= 13 ? "weak" : "none";
  } else if (
    categoryDelta === 0 &&
    boardMadeHand === "trips" &&
    madeHandCategory === "trips"
  ) {
    heroContributionLevel = heroHighKickerValue >= 13 ? "weak" : "none";
  }

  const heroImprovesBoard =
    heroContributionLevel === "moderate" || heroContributionLevel === "strong";

  let effectiveHandCategory = madeHandCategory;
  if (boardMadeHand === "pair" && madeHandCategory === "pair") {
    const kickerTag = heroHighKickerRank
      ? String(heroHighKickerRank).toLowerCase()
      : "x";
    if (heroHighKickerValue >= 14) effectiveHandCategory = "top_pair_top_kicker";
    else effectiveHandCategory = `board_pair_${kickerTag}_high`;
  } else if (
    boardMadeHand === "two_pair" &&
    madeHandCategory === "two_pair" &&
    !heroImprovesBoard
  ) {
    effectiveHandCategory = "board_two_pair";
  } else if (
    boardMadeHand === "trips" &&
    madeHandCategory === "trips" &&
    !heroImprovesBoard
  ) {
    effectiveHandCategory = "board_trips";
  }

  let kickerStrength = "none";
  let boardPairKickerClass = "air";
  if (boardMadeHand === "pair") {
    if (heroHighKickerValue >= 14) {
      kickerStrength = "strong";
      boardPairKickerClass = "strong_kicker";
    } else if (heroHighKickerValue >= 13) {
      kickerStrength = "medium";
      boardPairKickerClass = "strong_kicker";
    } else if (heroHighKickerValue >= 11) {
      kickerStrength = "weak";
      boardPairKickerClass = "weak_kicker";
    } else if (heroHighKickerValue > 0) {
      kickerStrength = "weak";
      boardPairKickerClass = "air";
    }
  }

  if (boardMadeHand === "pair" && madeHandCategory === "pair") {
    if (heroContributionLevel === "none") showdownStrength = "none";
    else if (heroContributionLevel === "weak") showdownStrength = "weak";
    else if (heroHighKickerValue >= 14) showdownStrength = "strong";
    else showdownStrength = "medium";
  } else if (!heroImprovesBoard && categoryDelta <= 0 && showdownStrength === "medium") {
    showdownStrength = "weak";
  }

  let showdownRelevance = "none";
  if (showdownStrength === "strong") showdownRelevance = "meaningful";
  else if (showdownStrength === "medium") showdownRelevance = "meaningful";
  else if (showdownStrength === "weak") showdownRelevance = "marginal";
  if (
    boardMadeHand === "pair" &&
    madeHandCategory === "pair" &&
    !heroImprovesBoard
  ) {
    if (kickerStrength === "strong") showdownRelevance = "meaningful";
    else if (kickerStrength === "medium") showdownRelevance = "marginal";
    else showdownRelevance = "none";
  }

  const meaningfulKickerInteraction =
    boardMadeHand === "pair" &&
    madeHandCategory === "pair" &&
    heroHighKickerValue >= 13;
  const bluffCatcherCategoryEligible = ["pair", "two_pair", "trips"].includes(
    String(madeHandCategory || ""),
  );
  const bluffCatcher =
    boardCards.length >= 3 &&
    bluffCatcherCategoryEligible &&
    !drawsPresent.flushDraw &&
    !drawsPresent.straightDraw &&
    (heroImprovesBoard || meaningfulKickerInteraction) &&
    (showdownStrength === "weak" || showdownStrength === "medium") &&
    showdownRelevance !== "none";

  return {
    madeHandCategory,
    pairType,
    tripsType,
    boardMadeHand,
    heroImprovesBoard,
    heroContributionLevel,
    kickerStrength,
    showdownRelevance,
    boardPairKickerClass,
    effectiveHandCategory,
    showdownStrength,
    bluffCatcher,
    drawsPresent,
    blockers,
    boardInteraction: {
      pairedBoard,
      connectedBoard,
      monotoneBoard,
    },
    stackDepthTier,
    primaryMadeRank: topDescriptor.rank || null,
    kickerRanks: heroKickerRanks,
  };
}

function handClassificationForContext(handContext = {}) {
  if (
    handContext?.handClassification &&
    typeof handContext.handClassification === "object"
  ) {
    return handContext.handClassification;
  }
  return deriveHandClassification(handContext?.validatedHandState || {});
}

function compactHeroHandFromState(handState = {}) {
  const cards = Array.isArray(handState?.heroHand) ? handState.heroHand : [];
  if (cards.length !== 2) return null;
  const c1 = parseCardCodeSafe(cards[0]);
  const c2 = parseCardCodeSafe(cards[1]);
  if (!c1 || !c2) return null;
  return `${c1.rank}${c1.suit}${c2.rank}${c2.suit}`;
}

function preflopHandClassContextFromState(handState = {}) {
  const compact = compactHeroHandFromState(handState);
  const rangeCategory = categorizeRangeHand(compact);
  const tier = String(rangeCategory?.tier || "unknown");
  if (["premium", "strong"].includes(tier)) return "premium";
  if (["medium", "marginal"].includes(tier)) return "speculative";
  if (tier === "trash") return "trash";
  return "speculative";
}

function facingActionStrengthFromState(handState = {}) {
  const facingBet = Number(handState?.facingBet) || 0;
  const potSize = Number(handState?.potSize) || 0;
  if (facingBet <= 0) return "weak";
  if (Boolean(handState?.isAllInFacingAction)) return "strong";
  if (potSize > 0 && facingBet >= potSize * 0.8) return "strong";
  return "standard";
}

function chosenActionFromContext(handContext = {}) {
  const selected = String(
    handContext?.handStateValidation?.selectedHeroDecision?.type || "",
  )
    .trim()
    .toLowerCase();
  if (selected) return selected;
  const foldedStreet = String(
    handContext?.reviewContext?.heroFoldedStreet || "",
  )
    .trim()
    .toLowerCase();
  if (foldedStreet) return "fold";
  return "unknown";
}

function decisionEvaluationForContext(handContext = {}, handClassification = {}) {
  const handState = handContext?.validatedHandState || {};
  const street = String(handState?.street || "").trim().toLowerCase();
  const chosenAction = chosenActionFromContext(handContext);
  const handClassContext = preflopHandClassContextFromState(handState);
  const facingActionStrength = facingActionStrengthFromState(handState);
  const effectiveStackBB = Number(handState?.effectiveStackBB);
  const under20bb = Number.isFinite(effectiveStackBB) && effectiveStackBB < 20;
  const preflopFoldProtectionEligible =
    street === "preflop" &&
    chosenAction === "fold" &&
    ["trash", "speculative"].includes(handClassContext) &&
    (handClassContext === "trash" || under20bb);

  let actionQuality = "close";
  let actionAlignment = "standard";
  if (preflopFoldProtectionEligible) {
    actionQuality = "good";
    actionAlignment = "standard";
  } else if (
    street === "preflop" &&
    ["jam", "shove", "raise", "call"].includes(chosenAction) &&
    handClassContext === "trash" &&
    facingActionStrength !== "weak"
  ) {
    actionQuality = "poor";
    actionAlignment = "major_error";
  } else if (
    street === "preflop" &&
    chosenAction === "fold" &&
    handClassContext === "premium"
  ) {
    actionQuality = "poor";
    actionAlignment = "slightly_tight";
  } else if (
    street === "preflop" &&
    ["call", "raise", "jam", "shove"].includes(chosenAction) &&
    handClassContext === "speculative" &&
    under20bb &&
    facingActionStrength !== "weak"
  ) {
    actionQuality = "poor";
    actionAlignment = "slightly_loose";
  }

  return {
    chosenAction,
    actionQuality,
    actionAlignment,
    handClassContext,
    facingActionStrength,
    preflopFoldProtectionEligible,
    under20bb,
    stackDepthTier: handClassification?.stackDepthTier || STACK_DEPTH_TIER.UNKNOWN,
  };
}

function terminologyMismatches(text, handClassification = {}) {
  const value = String(text || "").trim();
  if (!value) return [];
  const mismatches = [];
  if (
    handClassification?.madeHandCategory === "trips" &&
    TERMINOLOGY_PATTERNS.trips_as_pair.test(value)
  ) {
    mismatches.push("trips_as_pair");
  }
  if (
    handClassification?.pairType === "overpair" &&
    TERMINOLOGY_PATTERNS.overpair_as_weak.test(value)
  ) {
    mismatches.push("overpair_as_weak");
  }
  if (
    handClassification?.bluffCatcher === false &&
    TERMINOLOGY_PATTERNS.bluff_catcher_reference.test(value)
  ) {
    mismatches.push("bluff_catcher_misuse");
  }
  if (handClassification?.heroImprovesBoard === false) {
    if (TERMINOLOGY_PATTERNS.top_pair_label.test(value)) {
      mismatches.push("board_relative_top_pair_overclaim");
    }
    if (TERMINOLOGY_PATTERNS.medium_strength_pair_label.test(value)) {
      mismatches.push("board_relative_medium_pair_overclaim");
    }
    if (TERMINOLOGY_PATTERNS.showdown_hand_label.test(value)) {
      mismatches.push("board_relative_showdown_overclaim");
    }
    if (TERMINOLOGY_PATTERNS.bluff_catcher_reference.test(value)) {
      mismatches.push("board_relative_bluff_catcher_overclaim");
    }
  }
  const effective = String(handClassification?.effectiveHandCategory || "");
  const weakBoardPair =
    effective.startsWith("board_pair_") &&
    !["moderate", "strong"].includes(
      String(handClassification?.heroContributionLevel || ""),
    );
  if (weakBoardPair) {
    if (TERMINOLOGY_PATTERNS.thin_value_label.test(value)) {
      mismatches.push("board_pair_thin_value_overclaim");
    }
    if (
      TERMINOLOGY_PATTERNS.induce_bluffs_label.test(value) ||
      TERMINOLOGY_PATTERNS.bluff_catching_line_label.test(value)
    ) {
      mismatches.push("board_pair_bluff_plan_overclaim");
    }
  }
  if (
    String(handClassification?.showdownRelevance || "none") === "none" &&
    TERMINOLOGY_PATTERNS.showdown_hand_label.test(value)
  ) {
    mismatches.push("showdown_relevance_overclaim");
  }
  return Array.from(new Set(mismatches));
}

function strategicContradictions(text, handContext = {}, handClassification = {}) {
  const value = String(text || "").trim();
  if (!value) return [];
  const contradictions = [];
  if (
    (handClassification?.showdownStrength === "none" ||
      String(handClassification?.showdownRelevance || "") === "none") &&
    PASSIVE_RIVER_CHECK_PATTERN.test(value)
  ) {
    contradictions.push("showdown_contradiction");
  }
  if (
    (handClassification?.showdownStrength === "none" ||
      String(handClassification?.showdownRelevance || "") === "none") &&
    FALSE_SHOWDOWN_LINE_PATTERN.test(value)
  ) {
    contradictions.push("false_showdown_line");
  }
  if (
    handClassification?.bluffCatcher === false &&
    TERMINOLOGY_PATTERNS.bluff_catcher_reference.test(value)
  ) {
    contradictions.push("bluff_catcher_contradiction");
  }
  if (
    handClassification?.heroImprovesBoard === false &&
    BOARD_RELATIVE_OVERCLAIM_PATTERN.test(value)
  ) {
    contradictions.push("board_relative_overclaim");
  }
  if (
    handClassification?.boardInteraction?.pairedBoard &&
    PAIRED_BOARD_OVERSTATEMENT_PATTERN.test(value)
  ) {
    contradictions.push("paired_board_overstatement");
  }
  const shortStackMentions = stackDepthIncoherentMentions(value, handContext);
  if (shortStackMentions.length > 0) {
    contradictions.push("stack_depth_incoherence");
  }
  return Array.from(new Set(contradictions));
}

function terminologyRewriteFallback(fieldName, handClassification = {}) {
  const field = String(fieldName || "").trim();
  const made = handClassification?.madeHandCategory;
  const primary = rankCharToDescriptor(handClassification?.primaryMadeRank || "");
  const kicker = Array.isArray(handClassification?.kickerRanks)
    ? handClassification.kickerRanks[0]
    : null;
  const kickerLabel = kicker ? rankCharToDescriptor(kicker).rankName : "kicker";
  if (made === "trips") {
    const tripsLabel =
      handClassification?.tripsType === "set"
        ? `a set of ${primary.rankPlural || "trips"}`
        : `trip ${primary.rankPlural || "cards"}`;
    if (field === "better_line") {
      return `Frame this as ${tripsLabel} with ${kickerLabel} kicker using three-of-a-kind terminology.`;
    }
    if (field === "reasoning") {
      return `Terminology should reflect ${tripsLabel} strength using three-of-a-kind framing.`;
    }
    return `The hand should be described as ${tripsLabel} with three-of-a-kind precision.`;
  }
  if (handClassification?.pairType === "overpair") {
    if (field === "better_line") {
      return "With an overpair, keep the line anchored to overpair strength and protection/value planning.";
    }
    return "This holding is an overpair and should be framed with overpair terminology.";
  }
  if (handClassification?.heroImprovesBoard === false) {
    const effective = String(handClassification?.effectiveHandCategory || "");
    if (effective.startsWith("board_pair_")) {
      if (field === "better_line") {
        return "This is mostly a board-pair-plus-kicker spot, so avoid thin-value or passive-call assumptions without stronger kicker leverage.";
      }
      if (field === "reasoning") {
        return "Because hero does not materially improve the paired board, showdown expectations should stay conservative.";
      }
      return "The line was reframed around board-relative strength rather than overstating made-hand value.";
    }
    if (field === "better_line") {
      return "Use board-relative strength framing and avoid labeling this as a clear top-pair or medium-strength showdown hand.";
    }
    return "Terminology was aligned with board-relative strength and hero contribution level.";
  }
  if (field === "better_line") {
    return "Use terminology that matches the validated hand category and board interaction.";
  }
  return "Hand-category terminology was aligned with deterministic classification.";
}

function contradictionRewriteFallback(fieldName, contradiction = "", handClassification = {}) {
  const field = String(fieldName || "").trim();
  if (contradiction === "showdown_contradiction") {
    if (field === "better_line") {
      return "With minimal showdown value, evaluate higher-EV aggression or disciplined folds instead of defaulting to passive river checks.";
    }
    return "Minimal showdown value and passive river-check framing were inconsistent, so the line was reframed.";
  }
  if (contradiction === "bluff_catcher_contradiction") {
    if (field === "better_line") {
      return "This holding is better framed through value/protection logic than pure bluff-response framing.";
    }
    return "The line was reframed to match the validated hand profile and value/protection incentives.";
  }
  if (contradiction === "false_showdown_line") {
    if (field === "better_line") {
      return "With effectively no showdown value, avoid passive call-down lines and choose between disciplined folds or selective aggression based on blockers and range pressure.";
    }
    return "The line removed passive showdown logic that conflicted with near-zero showdown value.";
  }
  if (contradiction === "board_relative_overclaim") {
    if (field === "reasoning") {
      return "This paired-board spot is mostly board-driven, so avoid overclaiming top-pair or thin-value strength without meaningful hero contribution.";
    }
    return "Board-relative strength framing replaced overconfident made-hand claims.";
  }
  if (contradiction === "paired_board_overstatement") {
    if (field === "reasoning") {
      return "On paired boards, avoid blanket nut-advantage claims and anchor pressure statements to concrete value distribution.";
    }
    return "Overstated paired-board advantage language was replaced with structure-aware phrasing.";
  }
  if (contradiction === "stack_depth_incoherence") {
    return stackDepthFieldFallback(field, handClassification?.stackDepthTier);
  }
  if (field === "reasoning" && handClassification?.showdownStrength === "none") {
    return "The line was rewritten to keep showdown-value framing consistent with the validated hand strength.";
  }
  return "Strategic contradiction language was adjusted for coherence.";
}

function effectiveStackBBFromContext(handContext = {}) {
  const stack = Number(handContext?.validatedHandState?.effectiveStackBB);
  return Number.isFinite(stack) && stack >= 0 ? stack : null;
}

function stackDepthTierForContext(handContext = {}) {
  const stack = effectiveStackBBFromContext(handContext);
  if (!Number.isFinite(stack)) return STACK_DEPTH_TIER.UNKNOWN;
  if (stack < 10) return STACK_DEPTH_TIER.SHORT;
  if (stack <= 20) return STACK_DEPTH_TIER.MID;
  return STACK_DEPTH_TIER.DEEP;
}

function stackDepthIncoherentMentions(text, handContext = {}) {
  const value = String(text || "").trim();
  if (!value) return [];
  const tier = stackDepthTierForContext(handContext);
  const rules = STACK_DEPTH_INCOHERENT_PATTERNS[tier] || [];
  const matches = [];
  for (const rule of rules) {
    if (rule.pattern.test(value)) matches.push(rule.label);
  }
  return Array.from(new Set(matches));
}

function stackDepthFieldFallback(fieldName, tier) {
  const safeField = String(fieldName || "").trim();
  if (tier === STACK_DEPTH_TIER.SHORT) {
    if (safeField === "primary_leak") {
      return "At this stack depth, the biggest risk is overcomplicating a spot that usually rewards simplified commitment decisions.";
    }
    if (safeField === "better_line") {
      return "With under 10BB effective, prioritize simplified shove/fold-style decisions and direct equity realization.";
    }
    if (safeField === "reasoning") {
      return "Short-stack decisions are driven by immediate equity realization and tournament-life pressure, not speculative multi-street planning.";
    }
    return "The line stayed disciplined by keeping a short-stack spot simple and tournament-life aware.";
  }
  if (tier === STACK_DEPTH_TIER.MID) {
    if (safeField === "primary_leak") {
      return "This stack depth rewards selective leverage decisions rather than treating every spot as pure shove/fold.";
    }
    if (safeField === "better_line") {
      return "In the 10-20BB range, prefer selective reshove or flat decisions anchored to SPR and leverage dynamics.";
    }
    if (safeField === "reasoning") {
      return "Mid-stack play should balance leverage, SPR, and selective aggression rather than deep-stack or all-in-only assumptions.";
    }
    return "The review kept focus on practical mid-stack decisions with manageable leverage.";
  }
  if (tier === STACK_DEPTH_TIER.DEEP) {
    if (safeField === "primary_leak") {
      return "At deeper stacks, a pure shove/fold framing usually misses higher-EV maneuverability options.";
    }
    if (safeField === "better_line") {
      return "With 20BB+ effective, use wider postflop-aware planning instead of reducing the spot to shove/fold only.";
    }
    if (safeField === "reasoning") {
      return "Deeper stacks permit meaningful postflop realization and pressure lines, so all-in-only framing is often too narrow.";
    }
    return "The line preserved flexibility appropriate for a deeper-stack decision tree.";
  }
  return String(safeField || "");
}

function enforceStackDepthConstraints(
  text,
  handContext = {},
  guardrailNotes = [],
  fieldName = "",
) {
  const value = String(text || "").trim();
  if (!value) return value;
  const tier = stackDepthTierForContext(handContext);
  if (tier === STACK_DEPTH_TIER.UNKNOWN) return value;
  const blocked = stackDepthIncoherentMentions(value, handContext);
  if (blocked.length === 0) return value;
  guardrailNotes.push(
    `Stack-depth incoherent language removed from ${fieldName}: ${blocked.join(", ")}.`,
  );
  return stackDepthFieldFallback(fieldName, tier);
}

function buildFinding({ type, severity, field = null, message }) {
  return { type, severity, field, message };
}

function summarizeFindings(findings = [], rewrittenFields = []) {
  const list = Array.isArray(findings) ? findings : [];
  const blockerCount = list.filter(
    (item) => item?.severity === VALIDATION_SEVERITY.BLOCKER,
  ).length;
  const warningCount = list.filter(
    (item) => item?.severity === VALIDATION_SEVERITY.WARNING,
  ).length;
  const infoCount = list.filter(
    (item) => item?.severity === VALIDATION_SEVERITY.INFO,
  ).length;
  return {
    blockerCount,
    warningCount,
    infoCount,
    rewrittenFields: Array.from(
      new Set((Array.isArray(rewrittenFields) ? rewrittenFields : []).filter(Boolean)),
    ),
  };
}

function deterministicVariantIndex(seedText, variantCount) {
  const text = String(seedText || "");
  if (!text || !Number.isFinite(variantCount) || variantCount <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 2147483647;
  }
  return Math.abs(hash) % variantCount;
}

function diversifyExploitNarrative(text, seedText = "") {
  let value = String(text || "");
  if (!value) return value;
  const alternatives = [
    "has defended infrequently so far",
    "appears cautious versus aggression",
    "continues less often than population average",
    "has surrendered to preflop pressure frequently",
  ];
  value = value.replace(/\bfolds too much vs opens\b/gi, () => {
    const idx = deterministicVariantIndex(seedText, alternatives.length);
    return alternatives[idx];
  });
  value = value.replace(/\bpassive opponent\b/gi, "more selective opponent");
  value = value.replace(/\bsteal wider\b/gi, "open a bit wider in late position");
  value = value.replace(/\bapply pressure\b/gi, "lean into disciplined aggression");
  return value;
}

function sanitizeInfrastructureLanguage(text) {
  let value = String(text || "").trim();
  if (!value) return value;
  for (const rule of COACHING_SANITIZE_REPLACEMENTS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  for (const banned of USER_FACING_BANNED_TERMS) {
    if (banned.test(value)) {
      value = value.replace(
        banned,
        "context",
      );
    }
  }
  return value.trim();
}

function softenCoachingTone(text, confidence = "medium") {
  let value = String(text || "").trim();
  if (!value) return value;
  const conf = String(confidence || "").toLowerCase();
  if (conf === "high") return value;
  for (const rule of HARSH_TONE_PATTERNS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  return value.trim();
}

function containsBannedInfrastructureLanguage(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return USER_FACING_BANNED_TERMS.some((pattern) => pattern.test(value));
}

function detectInternalJargonLeaks(text) {
  const value = String(text || "").trim();
  if (!value) return [];
  const leaks = [];
  for (const rule of INTERNAL_JARGON_LEAK_PATTERNS) {
    if (rule.pattern.test(value)) leaks.push(rule.label);
  }
  return Array.from(new Set(leaks));
}

function humanizeCoachingLanguage(text) {
  let value = String(text || "").trim();
  if (!value) return value;
  for (const rule of INTERNAL_JARGON_RULES) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  value = value
    .replace(/\bboard[-\s]?driven hand profile\b/gi, "board-driven hand")
    .replace(/\bclassification\b/gi, "assessment")
    .replace(/\s{2,}/g, " ")
    .trim();
  return value;
}

function pairedBoardNarrationTemplate(field, handClassification = {}) {
  const safeField = String(field || "").trim();
  const relevance = String(handClassification?.showdownRelevance || "none");
  const kickerRank = Array.isArray(handClassification?.kickerRanks)
    ? handClassification.kickerRanks[0]
    : null;
  const kickerName = kickerRank
    ? rankCharToDescriptor(kickerRank).rankName
    : "high-card";

  if (relevance === "none") {
    if (safeField === "primary_leak") {
      return "This paired river leaves hero with very little showdown value, so passive call-down plans can overestimate how often this hand wins.";
    }
    if (safeField === "better_line") {
      return "Hero's hand has very little showdown value on this paired river, so this is mostly bluff-or-give-up territory instead of a passive call-down.";
    }
    if (safeField === "reasoning") {
      return "With a weak kicker and no meaningful board improvement, this holding is unlikely to win often at showdown.";
    }
    if (safeField === "what_was_good") {
      return "You avoided overcommitting chips with a very weak paired-board holding.";
    }
    return "";
  }

  if (relevance === "marginal") {
    if (safeField === "primary_leak") {
      return "This paired river leaves only marginal showdown value, so over-bluffing can burn equity that could still be realized at showdown.";
    }
    if (safeField === "better_line") {
      return `${kickerName}-high may occasionally win at showdown here, making a more controlled river line reasonable when aggression lacks clear fold equity.`;
    }
    if (safeField === "reasoning") {
      return "The kicker retains some showdown value, which supports selective pot control more than automatic aggression.";
    }
    if (safeField === "what_was_good") {
      return "The line preserved some showdown potential instead of forcing a high-variance bluff.";
    }
    return "";
  }

  if (relevance === "meaningful") {
    if (safeField === "primary_leak") {
      return "This holding carries meaningful showdown value here, so unnecessary bluffing can turn a strong hand into a lower-EV line.";
    }
    if (safeField === "better_line") {
      return "This paired river gives hero a strong showdown hand, so reaching showdown comfortably is often higher EV than forcing aggression.";
    }
    if (safeField === "reasoning") {
      return "Kicker strength and board interaction give hero clear showdown equity, making passive realization and selective value lines credible.";
    }
    if (safeField === "what_was_good") {
      return "You kept focus on realizing a hand that already wins often at showdown.";
    }
    return "";
  }

  return "";
}

function applyKickerAwareNarrationDifferentiation(text, field, handClassification = {}) {
  let value = String(text || "").trim();
  if (!value) return value;
  const pairedBoard = Boolean(handClassification?.boardInteraction?.pairedBoard);
  if (!pairedBoard) return value;
  const relevance = String(handClassification?.showdownRelevance || "none");
  if (!["none", "marginal", "meaningful"].includes(relevance)) return value;
  const template = pairedBoardNarrationTemplate(field, handClassification);
  if (!template) return value;

  const hasGenericFlattening = GENERIC_NARRATION_FLATTENING_PATTERN.test(value);
  const hasFalsePassiveShowdown = relevance === "none" && SHOWDOWN_PASSIVE_PATTERN.test(value);
  const needsMarginalUpgrade =
    relevance === "marginal" && OVERLY_WEAK_SHOWDOWN_PATTERN.test(value);
  const needsMeaningfulUpgrade =
    relevance === "meaningful" && OVERLY_WEAK_SHOWDOWN_PATTERN.test(value);

  if (
    hasGenericFlattening ||
    hasFalsePassiveShowdown ||
    needsMarginalUpgrade ||
    needsMeaningfulUpgrade
  ) {
    return template;
  }

  if (
    relevance === "none" &&
    !/\b(very little showdown value|unlikely to win often at showdown|bluff-or-give-up)\b/i.test(
      value,
    )
  ) {
    value = `${value} This paired river leaves hero with very little showdown value.`;
  } else if (
    relevance === "marginal" &&
    !/\b(occasionally win at showdown|some showdown value remains|marginal showdown value)\b/i.test(
      value,
    )
  ) {
    value = `${value} Some showdown value remains, so a controlled line can be reasonable.`;
  } else if (
    relevance === "meaningful" &&
    !/\b(meaningful showdown value|strong showdown hand|wins often at showdown)\b/i.test(
      value,
    )
  ) {
    value = `${value} This hand has meaningful showdown value and can often realize equity without forcing aggression.`;
  }
  return value.trim();
}

function finalizeCoachingPresentation(review = {}, handContext = {}) {
  const out = { ...review };
  const handState = handContext?.validatedHandState || {};
  const handClassification = handClassificationForContext(handContext);
  const seed = [
    String(handState?.street || ""),
    String(handState?.heroPosition || ""),
    String(handState?.math?.potOddsRatio || ""),
  ].join("|");
  const presentationWarnings = [];

  for (const field of ["primary_leak", "better_line", "what_was_good", "reasoning"]) {
    let value = String(out[field] || "").trim();
    value = sanitizeInfrastructureLanguage(value);
    value = diversifyExploitNarrative(value, seed + field);
    value = softenCoachingTone(value, out.confidence);
    value = humanizeCoachingLanguage(value);
    value = applyKickerAwareNarrationDifferentiation(
      value,
      field,
      handClassification,
    );
    const jargonLeaks = detectInternalJargonLeaks(value);
    if (jargonLeaks.length > 0) {
      presentationWarnings.push({
        type: "internal_jargon_leak",
        severity: VALIDATION_SEVERITY.WARNING,
        field,
        message: `Internal terminology leak detected in ${field}: ${jargonLeaks.join(", ")}.`,
      });
      value = humanizeCoachingLanguage(value);
    }
    if (detectInternalJargonLeaks(value).length > 0) {
      value = pairedBoardNarrationTemplate(field, handClassification);
      if (!value) {
        value =
          field === "reasoning"
            ? "The paired board weakens hero's hand here, so the recommendation stays practical and showdown-aware."
            : field === "better_line"
              ? "This paired board leaves hero with limited showdown value, so a cautious practical line is preferred."
              : field === "primary_leak"
                ? "The line likely overestimates how often this hand wins at showdown on paired boards."
                : "The review stays grounded in practical coaching language and realistic showdown expectations.";
      }
    }
    value = sanitizeInfrastructureLanguage(value);
    out[field] = value;
  }

  if (containsBannedInfrastructureLanguage(JSON.stringify(out))) {
    out.primary_leak =
      "This spot appears relatively close, so the adjustment should stay practical and conservative.";
    out.better_line =
      "Use the cleanest practical option based on position, stack depth, and available opponent evidence.";
    out.what_was_good =
      "The decision process stayed disciplined in a close and variance-sensitive spot.";
    out.reasoning =
      "The available evidence supports a cautious, fundamentals-first recommendation rather than an aggressive deviation.";
  }
  if (presentationWarnings.length > 0 && process.env.DEBUG_AI_VALIDATION === "true") {
    const prior = Array.isArray(out.guardrail_warnings) ? out.guardrail_warnings : [];
    out.guardrail_warnings = [
      ...prior,
      ...presentationWarnings.map((item) => `${item.type}:${item.field}`),
    ];
  }

  return out;
}

function sanitizeForIllegalAggressiveMentions(
  text,
  fallback,
  guardrailNotes,
  fieldName,
) {
  const value = String(text || "").trim();
  if (!value) return String(fallback || "").trim();
  if (!hasIllegalAggressiveMention(value)) return value;
  guardrailNotes.push(
    `Illegal aggressive action mention removed from ${fieldName}.`,
  );
  return String(fallback || "").trim();
}

function hasImpossibleCardReference(text, heroHand = []) {
  const value = String(text || "").trim();
  if (!value) return false;
  const heroCards = new Set(
    (Array.isArray(heroHand) ? heroHand : [])
      .map((card) => String(card || "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (!heroCards.size) return false;

  const directPattern = /\b([2-9TJQKA][cdhs])x\b/gi;
  let match = null;
  while ((match = directPattern.exec(value)) !== null) {
    const card = String(match[1] || "").toLowerCase();
    if (heroCards.has(card)) return true;
  }
  return false;
}

function hasPreflopEndedForbiddenLanguage(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  return PREFLOP_ENDED_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(value));
}

function preflopEndedForHandContext(handContext = {}) {
  const foldedStreet = String(
    handContext?.reviewContext?.heroFoldedStreet || "",
  ).toLowerCase();
  if (foldedStreet === "preflop") return true;
  const handState = handContext?.validatedHandState || {};
  return (
    String(handState?.street || "").toLowerCase() === "preflop" &&
    Array.isArray(handState?.boardCards) &&
    handState.boardCards.length === 0
  );
}

function scrubPreflopEndedField(text, fallback, guardrailNotes, fieldName) {
  const value = String(text || "").trim();
  if (!value) return String(fallback || "").trim();
  if (!hasPreflopEndedForbiddenLanguage(value)) return value;
  guardrailNotes.push(
    `Postflop-only language removed from ${fieldName} for preflop-ended hand.`,
  );
  return String(fallback || "").trim();
}

function collectReviewTextFields(response = {}) {
  return {
    primary_leak: String(response?.primary_leak || "").trim(),
    better_line: String(response?.better_line || "").trim(),
    reasoning: String(response?.reasoning || "").trim(),
    what_was_good: String(response?.what_was_good || "").trim(),
  };
}

function extractRatioMentions(text) {
  const value = String(text || "");
  const ratios = [];
  const ratioPattern = /(\d+(?:\.\d+)?)\s*:\s*1\b/g;
  let match = null;
  while ((match = ratioPattern.exec(value)) !== null) {
    const left = Number(match[1]);
    if (Number.isFinite(left) && left > 0) ratios.push(left);
  }
  return ratios;
}

function hasConflictingActionTerms(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  if (/\bcall\s+or\s+fold\b/.test(value)) return false;
  const hasFold = /\bfold\b/.test(value);
  const hasCall = /\bcall\b/.test(value);
  const hasJam = /\b(jam|shove)\b/.test(value);
  return (hasFold && hasCall) || (hasFold && hasJam);
}

function conceptMentions(text) {
  const value = String(text || "");
  const mentions = [];
  if (/\bfold equity\b/i.test(value)) mentions.push("fold_equity");
  if (/\bpolarized range\b/i.test(value)) mentions.push("polarized_range");
  if (/\bmdf\b/i.test(value) || /\bminimum defense frequency\b/i.test(value)) {
    mentions.push("mdf");
  }
  if (/\bicm pressure\b/i.test(value)) mentions.push("icm_pressure");
  if (/\bsolver-?approved\b/i.test(value)) mentions.push("solver_approved");
  return mentions;
}

function conceptPrerequisites(handContext = {}) {
  const handState = handContext?.validatedHandState || {};
  const hasPotOddsValidated =
    handState?.math &&
    typeof handState.math === "object" &&
    Number.isFinite(Number(handState.math.callAmount)) &&
    Number.isFinite(Number(handState.math.finalPotIfCall)) &&
    typeof handState.math.potOddsRatio === "string" &&
    handState.math.potOddsRatio.trim().length > 0;
  return {
    fold_equity: Boolean(handState?.heroCanRaise),
    polarized_range: Boolean(handContext?.villainRangeModelAvailable),
    mdf: Boolean(hasPotOddsValidated),
    icm_pressure: Boolean(handContext?.payoutDataAvailable),
    solver_approved: Boolean(handContext?.solverSourceAvailable),
  };
}

function enforceUnsupportedConcepts(text, prereqs, guardrailNotes, fieldName) {
  const value = String(text || "").trim();
  if (!value) return value;
  const mentions = conceptMentions(value);
  if (mentions.length === 0) return value;

  const blocked = mentions.filter((concept) => !prereqs?.[concept]);
  if (blocked.length === 0) return value;
  guardrailNotes.push(
    `Unsupported concept mention removed from ${fieldName}: ${blocked.join(", ")}.`,
  );
  return "Concept-heavy language was reduced because required supporting data is not validated in this hand.";
}

function validateReviewModelOutputContract(parsed) {
  const result = REVIEW_MODEL_OUTPUT_SCHEMA.safeParse(parsed);
  if (result.success) {
    return { valid: true, findings: [], errors: [], summary: summarizeFindings([]) };
  }
  const findings = result.error.issues.map((issue) =>
    buildFinding({
      type: "malformed_schema",
      severity: VALIDATION_SEVERITY.BLOCKER,
      field: issue.path?.[0] ? String(issue.path[0]) : null,
      message: `${issue.path.join(".") || "root"}: ${issue.message}`,
    }),
  );
  return {
    valid: false,
    findings,
    errors: findings.map((item) => item.message),
    summary: summarizeFindings(findings),
  };
}

function classifyReviewValidationFindings(response, handContext = {}) {
  const findings = [];
  const schemaResult = NORMALIZED_REVIEW_SCHEMA.safeParse(response);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      findings.push(
        buildFinding({
          type: "malformed_schema",
          severity: VALIDATION_SEVERITY.BLOCKER,
          field: issue.path?.[0] ? String(issue.path[0]) : null,
          message: `${issue.path.join(".") || "root"}: ${issue.message}`,
        }),
      );
    }
  }

  const normalized = schemaResult.success ? schemaResult.data : response || {};
  const texts = collectReviewTextFields(normalized);
  const mergedText = Object.values(texts).join(" ");
  const handState = handContext?.validatedHandState || {};
  const handClassification = handClassificationForContext(handContext);
  const decisionEvaluation = decisionEvaluationForContext(
    handContext,
    handClassification,
  );
  const legalActions = Array.isArray(handState?.legalActions)
    ? handState.legalActions.map((action) =>
        String(action || "")
          .trim()
          .toLowerCase(),
      )
    : [];

  const facingBet = Number(handState?.facingBet) || 0;
  const hasContradictoryLegalActions =
    (facingBet > 0 && legalActions.includes("check")) ||
    (facingBet <= 0 && legalActions.includes("call")) ||
    (legalActions.includes("call") && legalActions.includes("check"));
  if (hasContradictoryLegalActions) {
    findings.push(
      buildFinding({
        type: "contradictory_legal_actions",
        severity: VALIDATION_SEVERITY.BLOCKER,
        message: "Legal actions conflict with current facing-bet state.",
      }),
    );
  }

  const heroCannotRaise =
    !Boolean(handState?.heroCanRaise) &&
    legalActions.length > 0 &&
    !legalActions.includes("raise") &&
    !legalActions.includes("bet");
  if (heroCannotRaise && hasHardIllegalRecommendation(mergedText)) {
    findings.push(
      buildFinding({
        type: "illegal_action_recommendation",
        severity: VALIDATION_SEVERITY.BLOCKER,
        message:
          "Illegal action recommendation detected in call/fold-only decision node.",
      }),
    );
  }

  const heroHand = Array.isArray(handState?.heroHand) ? handState.heroHand : [];
  const prereqs = conceptPrerequisites(handContext);
  for (const [fieldName, text] of Object.entries(texts)) {
    const terminologyIssues = terminologyMismatches(text, handClassification);
    if (terminologyIssues.length > 0) {
      findings.push(
        buildFinding({
          type: "terminology_mismatch",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Terminology mismatch detected in ${fieldName}: ${terminologyIssues.join(", ")}.`,
        }),
      );
    }
    const contradictions = strategicContradictions(
      text,
      handContext,
      handClassification,
    );
    for (const contradiction of contradictions) {
      findings.push(
        buildFinding({
          type: contradiction,
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Strategic contradiction detected in ${fieldName}: ${contradiction}.`,
        }),
      );
    }
    if (hasImpossibleCardReference(text, heroHand)) {
      findings.push(
        buildFinding({
          type: "impossible_card_reference",
          severity: VALIDATION_SEVERITY.BLOCKER,
          field: fieldName,
          message: `Impossible card reference found in ${fieldName}.`,
        }),
      );
    }
    if (heroCannotRaise && hasIllegalAggressiveMention(text)) {
      findings.push(
        buildFinding({
          type: "ambiguous_aggression_wording",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message:
            "Aggressive wording detected in a call/fold-only decision node.",
        }),
      );
    }
    if (hasConflictingActionTerms(text)) {
      findings.push(
        buildFinding({
          type: "conflicting_action_language",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Conflicting action language detected in ${fieldName}.`,
        }),
      );
    }
    if (hasAmbiguousAggressionWording(text)) {
      findings.push(
        buildFinding({
          type: "ambiguous_aggression_wording",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Ambiguous aggression phrasing detected in ${fieldName}.`,
        }),
      );
    }
    if (hasExcessiveCertaintyWording(text)) {
      findings.push(
        buildFinding({
          type: "excessive_certainty_wording",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Excessive certainty wording detected in ${fieldName}.`,
        }),
      );
    }
    if (preflopEndedForHandContext(handContext) && hasPreflopEndedForbiddenLanguage(text)) {
      findings.push(
        buildFinding({
          type: "preflop_scope_leak",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Postflop-only language detected in ${fieldName} for preflop-ended hand.`,
        }),
      );
    }

    const fieldConcepts = conceptMentions(text);
    const blockedFieldConcepts = fieldConcepts.filter(
      (concept) => !prereqs?.[concept],
    );
    if (blockedFieldConcepts.length > 0) {
      findings.push(
        buildFinding({
          type: "unsupported_concept",
          severity: VALIDATION_SEVERITY.WARNING,
          field: fieldName,
          message: `Unsupported concepts referenced in ${fieldName}: ${blockedFieldConcepts.join(", ")}.`,
        }),
      );
    }
  }

  const foldedStreet = String(
    handContext?.reviewContext?.heroFoldedStreet || "",
  ).toLowerCase();
  const hasFlopMention = /\bflop\b/i.test(mergedText);
  const hasTurnMention = /\bturn\b/i.test(mergedText);
  const hasRiverMention = /\briver\b/i.test(mergedText);
  if (foldedStreet === "preflop" && (hasFlopMention || hasTurnMention || hasRiverMention)) {
    findings.push(
      buildFinding({
        type: "street_progression_mismatch",
        severity: VALIDATION_SEVERITY.BLOCKER,
        message:
          "Response references postflop streets after a preflop fold endpoint.",
      }),
    );
  }
  if (foldedStreet === "flop" && (hasTurnMention || hasRiverMention)) {
    findings.push(
      buildFinding({
        type: "street_progression_mismatch",
        severity: VALIDATION_SEVERITY.BLOCKER,
        message: "Response references turn/river after flop fold endpoint.",
      }),
    );
  }
  if (foldedStreet === "turn" && hasRiverMention) {
    findings.push(
      buildFinding({
        type: "street_progression_mismatch",
        severity: VALIDATION_SEVERITY.BLOCKER,
        message: "Response references river after turn fold endpoint.",
      }),
    );
  }
  const expectedRatioText = String(handState?.math?.potOddsRatio || "").trim();
  if (expectedRatioText) {
    const expectedLeft = Number(expectedRatioText.split(":")[0]);
    if (Number.isFinite(expectedLeft)) {
      const mentionedRatios = extractRatioMentions(mergedText);
      for (const ratioLeft of mentionedRatios) {
        if (Math.abs(ratioLeft - expectedLeft) > 0.15) {
          findings.push(
            buildFinding({
              type: "pot_odds_mismatch",
              severity: VALIDATION_SEVERITY.BLOCKER,
              message: `Pot-odds ratio mismatch (mentioned ${ratioLeft.toFixed(2)}:1 vs validated ${expectedLeft.toFixed(2)}:1).`,
            }),
          );
          break;
        }
      }
    }
  }

  const handStateIssues = Array.isArray(handContext?.handStateValidation?.issues)
    ? handContext.handStateValidation.issues
    : [];
  if (handStateIssues.some((issue) => /Duplicate cards detected/i.test(issue))) {
    findings.push(
      buildFinding({
        type: "duplicate_cards",
        severity: VALIDATION_SEVERITY.BLOCKER,
        message: "Duplicate cards detected in validated hand state.",
      }),
    );
  }

  if (String(normalized?.reasoning || "").trim().length > 420) {
    findings.push(
      buildFinding({
        type: "verbosity",
        severity: VALIDATION_SEVERITY.INFO,
        field: "reasoning",
        message: "Reasoning is verbose and could be more concise.",
      }),
    );
  }
  if (/no clear strengths identified/i.test(String(normalized?.what_was_good || ""))) {
    findings.push(
      buildFinding({
        type: "low_value_coaching",
        severity: VALIDATION_SEVERITY.INFO,
        field: "what_was_good",
        message: "What-was-good section is generic.",
      }),
    );
  }

  if (decisionEvaluation.preflopFoldProtectionEligible) {
    if (
      Number.isFinite(Number(normalized?.preflop_score)) &&
      Number(normalized.preflop_score) < 0
    ) {
      findings.push(
        buildFinding({
          type: "action_relative_scoring_mismatch",
          severity: VALIDATION_SEVERITY.WARNING,
          field: "preflop_score",
          message:
            "Negative preflop score conflicts with a protected preflop fold decision.",
        }),
      );
    }
    if (
      Number.isFinite(Number(normalized?.overall_score)) &&
      Number(normalized.overall_score) < 0
    ) {
      findings.push(
        buildFinding({
          type: "action_relative_scoring_mismatch",
          severity: VALIDATION_SEVERITY.WARNING,
          field: "overall_score",
          message:
            "Negative overall score conflicts with action-relative preflop fold quality.",
        }),
      );
    }
    for (const [fieldName, text] of Object.entries(texts)) {
      if (SPECULATIVE_PREFLOP_SUGGESTION_PATTERN.test(text)) {
        findings.push(
          buildFinding({
            type: "preflop_fold_protection_language",
            severity: VALIDATION_SEVERITY.WARNING,
            field: fieldName,
            message: `Speculative preflop defend language detected in ${fieldName} for protected fold spot.`,
          }),
        );
      }
    }
  }

  if (
    String(handState?.street || "").toLowerCase() === "preflop" &&
    decisionEvaluation.under20bb &&
    decisionEvaluation.handClassContext === "trash"
  ) {
    for (const [fieldName, text] of Object.entries(texts)) {
      if (
        WEAK_OFFSUIT_AGGRESSION_PATTERN.test(text) &&
        SPECULATIVE_PREFLOP_SUGGESTION_PATTERN.test(text)
      ) {
        findings.push(
          buildFinding({
            type: "weak_offsuit_speculative_leak",
            severity: VALIDATION_SEVERITY.WARNING,
            field: fieldName,
            message: `Weak offsuit speculative suggestion detected in ${fieldName} under 20BB.`,
          }),
        );
      }
    }
  }

  const summary = summarizeFindings(findings);
  return {
    valid: summary.blockerCount === 0,
    findings,
    summary,
    errors: findings.map((item) => item.message),
  };
}

function validatePostGenerationReview(response, handContext = {}) {
  return classifyReviewValidationFindings(response, handContext);
}

export const __reviewTrustTestables = {
  VALIDATION_SEVERITY,
  validateReviewModelOutputContract,
  validatePostGenerationReview,
  classifyReviewValidationFindings,
  applyReviewGuardrails,
  finalizeCoachingPresentation,
  opponentConfidenceTier,
  buildOpponentConfidenceNarrative,
  conceptMentions,
  conceptPrerequisites,
  deriveHandClassification,
  decisionEvaluationForContext,
};

function safeFallbackReviewText(validationIssues = [], pipelineIssues = []) {
  const issueHint =
    Array.isArray(validationIssues) && validationIssues.length
      ? " Key details may be incomplete."
      : "";
  const pipelineHint =
    Array.isArray(pipelineIssues) && pipelineIssues.length
      ? " Some assumptions remain uncertain."
      : "";
  return {
    primary_leak:
      "This spot appears more context-sensitive than usual, so recommendations are intentionally conservative.",
    better_line:
      "Stay with the clearest legal options in this node and avoid high-variance commitments without stronger supporting reads.",
    what_was_good:
      "You reached a disciplined endpoint by preserving stack and avoiding unsupported high-risk lines.",
    reasoning:
      `The available context leaves this decision close, so the coaching is intentionally cautious.${issueHint}${pipelineHint}`.trim(),
  };
}

function guardrailConfidence(
  handContext = {},
  modelConfidence = "medium",
  validationSummary = {},
) {
  const safeModelConfidence = ["low", "medium", "high"].includes(
    String(modelConfidence || "").toLowerCase(),
  )
    ? String(modelConfidence || "").toLowerCase()
    : "medium";
  const validation = handContext?.handStateValidation || {};
  const handState = handContext?.validatedHandState || {};
  if (!validation?.isValid) return "low";

  const hasCoreFields =
    String(handState?.street || "").trim().length > 0 &&
    Array.isArray(handState?.heroHand) &&
    handState.heroHand.length === 2 &&
    Array.isArray(handState?.legalActions) &&
    handState.legalActions.length > 0;
  if (!hasCoreFields) return "low";

  const hasStackDepth = Number.isFinite(Number(handState?.effectiveStackBB));
  if (!hasStackDepth && safeModelConfidence === "high") return "medium";

  const legalActions = Array.isArray(handState?.legalActions)
    ? handState.legalActions.map((action) =>
        String(action || "")
          .trim()
          .toLowerCase(),
      )
    : [];
  const isCallFoldNode =
    legalActions.length === 2 &&
    legalActions.includes("call") &&
    legalActions.includes("fold");
  if (
    String(handState?.street || "").toLowerCase() === "preflop" &&
    Boolean(handState?.isAllInFacingAction) &&
    isCallFoldNode &&
    safeModelConfidence === "high"
  ) {
    return "medium";
  }

  if ((Number(validationSummary?.warningCount) || 0) > 0) {
    return safeModelConfidence === "high" ? "medium" : safeModelConfidence;
  }

  return safeModelConfidence;
}

function enforceActionRelativeDecisionScoring(
  review = {},
  handContext = {},
  handClassification = {},
  guardrailNotes = [],
  rewrittenFields = new Set(),
) {
  const out = { ...review };
  const markRewriteIfChanged = (field, before, after) => {
    if (String(before || "") !== String(after || "")) rewrittenFields.add(field);
  };
  const decisionEvaluation = decisionEvaluationForContext(
    handContext,
    handClassification,
  );
  if (!decisionEvaluation.preflopFoldProtectionEligible) {
    return { review: out, decisionEvaluation };
  }

  const preflopBefore = out.preflop_score;
  const overallBefore = out.overall_score;
  if (Number.isFinite(Number(out.preflop_score)) && Number(out.preflop_score) < 0) {
    out.preflop_score = decisionEvaluation.facingActionStrength === "strong" ? 1 : 0;
    guardrailNotes.push(
      "Preflop score capped to action-relative neutral/positive for protected weak-hand fold.",
    );
  }
  if (Number.isFinite(Number(out.overall_score)) && Number(out.overall_score) < 0) {
    out.overall_score = Math.max(
      Number(out.preflop_score) || 0,
      decisionEvaluation.facingActionStrength === "strong" ? 1 : 0,
    );
    guardrailNotes.push(
      "Overall score capped to action-relative neutral/positive for protected weak-hand fold.",
    );
  }
  if (String(preflopBefore) !== String(out.preflop_score)) rewrittenFields.add("preflop_score");
  if (String(overallBefore) !== String(out.overall_score)) rewrittenFields.add("overall_score");

  const rewriteNeeded = ["primary_leak", "better_line", "reasoning"].some((field) =>
    SPECULATIVE_PREFLOP_SUGGESTION_PATTERN.test(String(out[field] || "")),
  );
  if (rewriteNeeded) {
    const primaryBefore = out.primary_leak;
    const betterBefore = out.better_line;
    const goodBefore = out.what_was_good;
    const reasoningBefore = out.reasoning;
    out.primary_leak =
      "No major strategic leak stands out in this preflop fold; the decision appears disciplined for hand quality and stack depth.";
    out.better_line =
      "Folding preflop is a reasonable default here; only deviate with strong exploit evidence.";
    out.what_was_good =
      "Hero avoided a low-EV dominated continue and preserved stack in a standard preflop spot.";
    out.reasoning =
      "With a weak offsuit holding and limited stack depth leverage, folding preflop is a practical action-relative decision.";
    markRewriteIfChanged("primary_leak", primaryBefore, out.primary_leak);
    markRewriteIfChanged("better_line", betterBefore, out.better_line);
    markRewriteIfChanged("what_was_good", goodBefore, out.what_was_good);
    markRewriteIfChanged("reasoning", reasoningBefore, out.reasoning);
    guardrailNotes.push(
      "Speculative preflop defend language removed for protected weak-hand fold spot.",
    );
  }

  return { review: out, decisionEvaluation };
}

function applyReviewGuardrails(response, handContext = {}, findings = []) {
  const guarded = { ...response };
  const handState = handContext?.validatedHandState || {};
  const handClassification = handClassificationForContext(handContext);
  const legalActions = Array.isArray(handState?.legalActions)
    ? handState.legalActions.map((action) =>
        String(action || "")
          .trim()
          .toLowerCase(),
      )
    : [];
  const heroCanRaise = Boolean(handState?.heroCanRaise);
  const cannotRaise =
    !heroCanRaise &&
    legalActions.length > 0 &&
    !legalActions.includes("raise") &&
    !legalActions.includes("bet");
  const guardrailNotes = [];
  const rewrittenFields = new Set();
  const markRewriteIfChanged = (field, before, after) => {
    if (String(before || "") !== String(after || "")) rewrittenFields.add(field);
  };
  const warningFields = new Set(
    (Array.isArray(findings) ? findings : [])
      .filter((item) => item?.severity === VALIDATION_SEVERITY.WARNING)
      .map((item) => String(item?.field || "").trim())
      .filter(Boolean),
  );
  const shouldTouchField = (field) =>
    warningFields.size === 0 || warningFields.has(field);
  const contradictionTypes = new Set([
    "showdown_contradiction",
    "false_showdown_line",
    "board_relative_overclaim",
    "bluff_catcher_contradiction",
    "paired_board_overstatement",
    "stack_depth_incoherence",
  ]);
  const contradictionWarningCount = (Array.isArray(findings) ? findings : []).filter(
    (item) =>
      item?.severity === VALIDATION_SEVERITY.WARNING &&
      contradictionTypes.has(String(item?.type || "")),
  ).length;

  if (cannotRaise && (warningFields.size === 0 || warningFields.size > 0)) {
    if (shouldTouchField("primary_leak")) {
    const before = guarded.primary_leak;
    guarded.primary_leak = sanitizeForIllegalAggressiveMentions(
      guarded.primary_leak,
      "Line selection should stay within legal actions for this node.",
      guardrailNotes,
      "primary_leak",
    );
    markRewriteIfChanged("primary_leak", before, guarded.primary_leak);
    }
    if (shouldTouchField("better_line")) {
    const before = guarded.better_line;
    guarded.better_line = sanitizeForIllegalAggressiveMentions(
      guarded.better_line,
      "In this spot, hero options are limited to call or fold.",
      guardrailNotes,
      "better_line",
    );
    markRewriteIfChanged("better_line", before, guarded.better_line);
    }
    if (shouldTouchField("reasoning")) {
    const before = guarded.reasoning;
    guarded.reasoning = sanitizeForIllegalAggressiveMentions(
      guarded.reasoning,
      "Given this node, keep the plan centered on calling or folding.",
      guardrailNotes,
      "reasoning",
    );
    markRewriteIfChanged("reasoning", before, guarded.reasoning);
    }
    if (shouldTouchField("what_was_good")) {
    const before = guarded.what_was_good;
    guarded.what_was_good = sanitizeForIllegalAggressiveMentions(
      guarded.what_was_good,
      "The review correctly preserved decision focus under a constrained action set.",
      guardrailNotes,
      "what_was_good",
    );
    markRewriteIfChanged("what_was_good", before, guarded.what_was_good);
    }
  }

  const heroHand = Array.isArray(handState?.heroHand) ? handState.heroHand : [];
  const prereqs = conceptPrerequisites(handContext);
  const isPreflopEnded = preflopEndedForHandContext(handContext);
  const impossibleCardFieldFallback = {
    primary_leak:
      "Card-removal claims should reference only cards that remain available in villain ranges.",
    better_line:
      "Keep range language anchored to validated visible cards and avoid impossible blocker references.",
    reasoning:
      "An impossible card reference was removed because it conflicted with hero's known cards.",
    what_was_good:
      "The final recommendation now excludes contradictory card-combo references.",
  };
  if (shouldTouchField("primary_leak") && hasImpossibleCardReference(guarded.primary_leak, heroHand)) {
    const before = guarded.primary_leak;
    guardrailNotes.push(
      "Impossible villain card reference removed from primary_leak.",
    );
    guarded.primary_leak = impossibleCardFieldFallback.primary_leak;
    markRewriteIfChanged("primary_leak", before, guarded.primary_leak);
  }
  if (shouldTouchField("better_line") && hasImpossibleCardReference(guarded.better_line, heroHand)) {
    const before = guarded.better_line;
    guardrailNotes.push(
      "Impossible villain card reference removed from better_line.",
    );
    guarded.better_line = impossibleCardFieldFallback.better_line;
    markRewriteIfChanged("better_line", before, guarded.better_line);
  }
  if (shouldTouchField("reasoning") && hasImpossibleCardReference(guarded.reasoning, heroHand)) {
    const before = guarded.reasoning;
    guardrailNotes.push(
      "Impossible villain card reference removed from reasoning.",
    );
    guarded.reasoning = impossibleCardFieldFallback.reasoning;
    markRewriteIfChanged("reasoning", before, guarded.reasoning);
  }
  if (shouldTouchField("what_was_good") && hasImpossibleCardReference(guarded.what_was_good, heroHand)) {
    const before = guarded.what_was_good;
    guardrailNotes.push(
      "Impossible villain card reference removed from what_was_good.",
    );
    guarded.what_was_good = impossibleCardFieldFallback.what_was_good;
    markRewriteIfChanged("what_was_good", before, guarded.what_was_good);
  }

  if (shouldTouchField("primary_leak")) {
    guarded.primary_leak = enforceUnsupportedConcepts(
      guarded.primary_leak,
      prereqs,
      guardrailNotes,
      "primary_leak",
    );
  }
  if (shouldTouchField("better_line")) {
    guarded.better_line = enforceUnsupportedConcepts(
      guarded.better_line,
      prereqs,
      guardrailNotes,
      "better_line",
    );
  }
  if (shouldTouchField("reasoning")) {
    guarded.reasoning = enforceUnsupportedConcepts(
      guarded.reasoning,
      prereqs,
      guardrailNotes,
      "reasoning",
    );
  }
  if (shouldTouchField("what_was_good")) {
    guarded.what_was_good = enforceUnsupportedConcepts(
      guarded.what_was_good,
      prereqs,
      guardrailNotes,
      "what_was_good",
    );
  }

  for (const field of ["primary_leak", "better_line", "reasoning", "what_was_good"]) {
    if (!shouldTouchField(field)) continue;
    const before = String(guarded[field] || "");
    let text = before;
    const terminologyIssues = terminologyMismatches(text, handClassification);
    if (terminologyIssues.length > 0) {
      text = terminologyRewriteFallback(field, handClassification);
      guardrailNotes.push(
        `Terminology mismatch rewritten in ${field}: ${terminologyIssues.join(", ")}.`,
      );
    }
    const contradictions = strategicContradictions(
      text,
      handContext,
      handClassification,
    );
    if (contradictions.length > 0) {
      const priorityContradiction = contradictions[0];
      text = contradictionRewriteFallback(
        field,
        priorityContradiction,
        handClassification,
      );
      guardrailNotes.push(
        `Strategic contradiction rewritten in ${field}: ${priorityContradiction}.`,
      );
    }
    text = enforceStackDepthConstraints(
      text,
      handContext,
      guardrailNotes,
      field,
    );
    for (const rule of SAFE_REWRITE_RULES) {
      text = text.replace(rule.pattern, rule.replacement);
    }
    if (hasExcessiveCertaintyWording(text)) {
      text = text
        .replace(/\bmandatory\b/gi, "often reasonable")
        .replace(/\balways\b/gi, "typically")
        .replace(/\bnever\b/gi, "rarely")
        .replace(/\bguaranteed\b/gi, "likely");
      guardrailNotes.push(`Certainty wording softened in ${field}.`);
    }
    if (hasConflictingActionTerms(text)) {
      text = field === "better_line"
        ? "Choose the higher-EV option between calling and folding based on validated pot odds and opponent range assumptions."
        : text;
      if (field === "better_line") {
        guardrailNotes.push("Conflicting action wording rewritten in better_line.");
      }
    }
    guarded[field] = text.trim();
    markRewriteIfChanged(field, before, guarded[field]);
  }

  if (isPreflopEnded) {
    if (shouldTouchField("primary_leak")) {
    const before = guarded.primary_leak;
    guarded.primary_leak = scrubPreflopEndedField(
      guarded.primary_leak,
      "Keep analysis anchored to preflop decision quality only for this hand.",
      guardrailNotes,
      "primary_leak",
    );
    markRewriteIfChanged("primary_leak", before, guarded.primary_leak);
    }
    if (shouldTouchField("better_line")) {
    const before = guarded.better_line;
    guarded.better_line = scrubPreflopEndedField(
      guarded.better_line,
      "Given a preflop endpoint, compare only fold versus call against validated all-in math and ranges.",
      guardrailNotes,
      "better_line",
    );
    markRewriteIfChanged("better_line", before, guarded.better_line);
    }
    if (shouldTouchField("reasoning")) {
    const before = guarded.reasoning;
    guarded.reasoning = scrubPreflopEndedField(
      guarded.reasoning,
      "Hand ended preflop, so postflop concepts are intentionally excluded from this explanation.",
      guardrailNotes,
      "reasoning",
    );
    markRewriteIfChanged("reasoning", before, guarded.reasoning);
    }
    if (shouldTouchField("what_was_good")) {
    const before = guarded.what_was_good;
    guarded.what_was_good = scrubPreflopEndedField(
      guarded.what_was_good,
      "Preflop execution was isolated cleanly without leaking into postflop narratives.",
      guardrailNotes,
      "what_was_good",
    );
    markRewriteIfChanged("what_was_good", before, guarded.what_was_good);
    }
  }

  const actionRelativeAdjusted = enforceActionRelativeDecisionScoring(
    guarded,
    handContext,
    handClassification,
    guardrailNotes,
    rewrittenFields,
  );
  Object.assign(guarded, actionRelativeAdjusted.review);

  const warningCount = (Array.isArray(findings) ? findings : []).filter(
    (item) => item?.severity === VALIDATION_SEVERITY.WARNING,
  ).length;
  guarded.confidence = guardrailConfidence(handContext, guarded.confidence, {
    warningCount,
  });
  if (contradictionWarningCount >= 2) {
    if (guarded.confidence === "high") guarded.confidence = "medium";
    else if (guarded.confidence === "medium") guarded.confidence = "low";
  }
  if (guardrailNotes.length > 0 && process.env.DEBUG_AI_VALIDATION === "true") {
    guarded.guardrail_warnings = guardrailNotes;
  }
  return { review: guarded, rewrittenFields: Array.from(rewrittenFields) };
}

function normalizeReviewResponse(parsed, completion, handContext = {}) {
  const confidenceRaw = String(parsed?.confidence || "medium")
    .trim()
    .toLowerCase();
  const confidence = ["low", "medium", "high"].includes(confidenceRaw)
    ? confidenceRaw
    : "medium";
  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;

  const response = {
    overall_score: clampStreetScore(parsed?.overall_score) ?? 0,
    preflop_score: clampStreetScore(parsed?.preflop_score),
    flop_score: clampStreetScore(parsed?.flop_score),
    turn_score: clampStreetScore(parsed?.turn_score),
    river_score: clampStreetScore(parsed?.river_score),
    confidence,
    what_was_good:
      String(parsed?.what_was_good || "").trim() ||
      "No clear strengths identified.",
    primary_leak:
      String(parsed?.primary_leak || "").trim() || "No major leak flagged.",
    better_line:
      String(parsed?.better_line || "").trim() ||
      "No alternative line suggested.",
    reasoning:
      String(parsed?.reasoning || "").trim() ||
      "Review was inconclusive with the available hand details.",
    usage,
  };

  const foldedStreet = String(
    handContext?.reviewContext?.heroFoldedStreet || "",
  )
    .trim()
    .toLowerCase();
  if (foldedStreet === "preflop") {
    response.flop_score = null;
    response.turn_score = null;
    response.river_score = null;
  } else if (foldedStreet === "flop") {
    response.turn_score = null;
    response.river_score = null;
  } else if (foldedStreet === "turn") {
    response.river_score = null;
  }

  return response;
}

function attachValidationSummary(review, summary) {
  if (!review || typeof review !== "object") return review;
  if (process.env.DEBUG_AI_VALIDATION !== "true") return review;
  return {
    ...review,
    validationSummary: {
      blockerCount: Number(summary?.blockerCount) || 0,
      warningCount: Number(summary?.warningCount) || 0,
      infoCount: Number(summary?.infoCount) || 0,
      rewrittenFields: Array.isArray(summary?.rewrittenFields)
        ? summary.rewrittenFields
        : [],
    },
  };
}

function opponentConfidenceTier(handsSeen) {
  const n = Number(handsSeen) || 0;
  if (n >= 75) return "high";
  if (n >= 20) return "moderate";
  return "low";
}

function formatPctOrNa(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "n/a";
}

function buildOpponentEvidenceLine(opponent = {}) {
  const handsSeen = Number(opponent?.handsSeen) || 0;
  const foldVsOpen = formatPctOrNa(opponent?.foldToPreflopRaisePct);
  const vpip = formatPctOrNa(opponent?.enteredPotPct);
  const pfr = formatPctOrNa(opponent?.preflopRaisePct);
  return `Stats: VPIP ${vpip}, PFR ${pfr}, Fold-vs-open ${foldVsOpen} over ${handsSeen} hands.`;
}

function buildOpponentConfidenceNarrative(opponent = {}) {
  const handsSeen = Number(opponent?.handsSeen) || 0;
  const tier = opponentConfidenceTier(handsSeen);
  const playNote = String(opponent?.playNote?.text || "").trim();
  const tags =
    Array.isArray(opponent?.tags) && opponent.tags.length > 0
      ? opponent.tags.join(", ")
      : "";
  if (tier === "low") {
    return "Limited observations suggest early tendencies only; avoid strong exploit assumptions.";
  }
  if (tier === "moderate") {
    return playNote
      ? `Moderate-sample read: ${playNote}`
      : "Appears somewhat directional so far, but extreme exploit assumptions are still premature.";
  }
  if (playNote) {
    return `High-confidence read: ${playNote}`;
  }
  if (tags) {
    return `High-confidence read from sample-backed tendencies: ${tags}.`;
  }
  return "High-confidence sample supports data-driven exploit adjustments.";
}

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return (n / d) * 100;
}

function rateLabel(numerator, denominator) {
  const d = toFinite(denominator, 0);
  const n = toFinite(numerator, 0);
  if (d <= 0) return "n/a";
  return `${pct(n, d).toFixed(1)}% (${n}/${d})`;
}

function sampleConfidence(sampleSize) {
  const n = toFinite(sampleSize, 0);
  if (n >= 30) return "high";
  if (n >= 12) return "medium";
  return "low";
}

function dedupeList(items = [], max = 8) {
  const unique = [];
  const seen = new Set();
  for (const raw of items) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
    if (unique.length >= max) break;
  }
  return unique;
}

function deriveSummaryHeuristic(summaryContext = {}) {
  const pre = summaryContext?.preflopBreakdown || {};
  const post = summaryContext?.postflopIpAudit || {};
  const postFindings = post?.findings || {};
  const candidates = [];

  const addCandidate = ({
    key,
    area = "preflop",
    severity,
    sample,
    label,
    evidence,
    action,
  }) => {
    candidates.push({
      key,
      area,
      severity: toFinite(severity, 0),
      sample: toFinite(sample, 0),
      label: String(label || "").trim(),
      evidence: String(evidence || "").trim(),
      action: String(action || "").trim(),
    });
  };

  const openSpots = toFinite(pre.noRaiseBeforeHeroSpots, 0);
  const openCount = toFinite(pre.openedWhenNoRaiseBeforeHero, 0);
  const openPct = pct(openCount, openSpots);
  if (openSpots >= 12 && openPct < 28) {
    addCandidate({
      key: "opening_low",
      area: "preflop",
      severity: 28 - openPct,
      sample: openSpots,
      label: "Under-opening in first-in spots",
      evidence: `Open first-in rate is ${rateLabel(openCount, openSpots)}.`,
      action:
        "Increase opening frequency first from late and middle positions before widening marginal defenses.",
    });
  }

  const defendSpots = toFinite(pre.facingOpenSpots, 0);
  const defendCount = toFinite(pre.defendedFacingOpen, 0);
  const defendPct = pct(defendCount, defendSpots);
  if (defendSpots >= 12 && defendPct < 32) {
    addCandidate({
      key: "defend_low",
      area: "preflop",
      severity: 32 - defendPct,
      sample: defendSpots,
      label: "Overfolding when facing opens",
      evidence: `Defend vs open rate is ${rateLabel(defendCount, defendSpots)}.`,
      action:
        "Defend more versus opens, starting with BB continues and selective SB 3-bets versus late opens.",
    });
  }

  const blindSpots = toFinite(pre.blindFacingOpenSpots, 0);
  const blindFolds = toFinite(pre.blindFoldFacingOpen, 0);
  const blindFoldPct = pct(blindFolds, blindSpots);
  if (blindSpots >= 12 && blindFoldPct > 66) {
    addCandidate({
      key: "blind_overfold",
      area: "preflop",
      severity: blindFoldPct - 66,
      sample: blindSpots,
      label: "Blinds fold too often versus opens",
      evidence: `Blind fold vs open is ${rateLabel(blindFolds, blindSpots)}.`,
      action:
        "Prioritize BB defend expansion first, then add SB defend/3-bet continues with playable suited holdings.",
    });
  }

  const reraiseSpots = toFinite(pre.facedReraiseAfterAggressionSpots, 0);
  const reraiseFolds = toFinite(pre.foldedAfterFacingReraise, 0);
  const reraiseFoldPct = pct(reraiseFolds, reraiseSpots);
  if (reraiseSpots >= 8 && reraiseFoldPct > 78) {
    addCandidate({
      key: "reraise_overfold",
      area: "preflop",
      severity: reraiseFoldPct - 78,
      sample: reraiseSpots,
      label: "Likely overfolding after facing reraises",
      evidence: `Fold after facing reraises is ${rateLabel(
        reraiseFolds,
        reraiseSpots,
      )}.`,
      action:
        "Tighten your aggressive range construction so opens/3-bets do not become automatic folds to reraises.",
    });
  }

  const preflopFoldPct = toFinite(summaryContext?.preflopFoldPct, 0);
  const preflopFoldThreshold = toFinite(
    summaryContext?.preflopFoldWarnThreshold,
    999,
  );
  const totalHands = toFinite(summaryContext?.totalHands, 0);
  if (
    candidates.length === 0 &&
    totalHands >= 40 &&
    preflopFoldPct > preflopFoldThreshold
  ) {
    addCandidate({
      key: "preflop_fold_high",
      area: "preflop",
      severity: preflopFoldPct - preflopFoldThreshold,
      sample: totalHands,
      label: "Overall preflop fold rate is high",
      evidence: `Preflop fold rate is ${preflopFoldPct.toFixed(
        1,
      )}% versus ~${preflopFoldThreshold.toFixed(1)}% threshold.`,
      action:
        "Split focus between first-in opens and blind defenses to bring overall preflop fold rate down.",
    });
  }

  const postMetric = (key) => {
    const metric = postFindings?.[key] || {};
    const count = toFinite(metric?.count, 0);
    const opportunities = toFinite(metric?.opportunities, 0);
    const metricPct = pct(count, opportunities);
    return { count, opportunities, metricPct };
  };

  const missedIpCbet = postMetric("missedIpCbetFavorable");
  if (missedIpCbet.opportunities >= 8 && missedIpCbet.metricPct >= 35) {
    addCandidate({
      key: "postflop_ip_cbet_missed",
      area: "postflop",
      severity: missedIpCbet.metricPct - 35,
      sample: missedIpCbet.opportunities,
      label: "Missing profitable in-position flop c-bets",
      evidence: `Missed IP c-bets on favorable flops: ${rateLabel(
        missedIpCbet.count,
        missedIpCbet.opportunities,
      )}.`,
      action:
        "C-bet favorable flop textures more often in position when preflop aggressor.",
    });
  }

  const missedIpStab = postMetric("missedIpStabFavorable");
  if (missedIpStab.opportunities >= 8 && missedIpStab.metricPct >= 35) {
    addCandidate({
      key: "postflop_ip_stab_missed",
      area: "postflop",
      severity: missedIpStab.metricPct - 35,
      sample: missedIpStab.opportunities,
      label: "Under-stabbing in position after checks",
      evidence: `Missed IP stabs on favorable flops: ${rateLabel(
        missedIpStab.count,
        missedIpStab.opportunities,
      )}.`,
      action:
        "Attack capped check lines more frequently in position on favorable boards.",
    });
  }

  const lightIpTurnFold = postMetric("lightIpFoldTurn");
  if (lightIpTurnFold.opportunities >= 8 && lightIpTurnFold.metricPct >= 22) {
    addCandidate({
      key: "postflop_ip_turn_overfold",
      area: "postflop",
      severity: lightIpTurnFold.metricPct - 22,
      sample: lightIpTurnFold.opportunities,
      label: "Likely overfolding turn bets in position",
      evidence: `Likely light IP turn folds: ${rateLabel(
        lightIpTurnFold.count,
        lightIpTurnFold.opportunities,
      )}.`,
      action:
        "Continue more turn bets in position with pair-plus and draw-heavy holdings.",
    });
  }

  const lightIpRiverFold = postMetric("lightIpFoldRiver");
  if (lightIpRiverFold.opportunities >= 8 && lightIpRiverFold.metricPct >= 20) {
    addCandidate({
      key: "postflop_ip_river_overfold",
      area: "postflop",
      severity: lightIpRiverFold.metricPct - 20,
      sample: lightIpRiverFold.opportunities,
      label: "Likely overfolding rivers in position",
      evidence: `Likely light IP river folds: ${rateLabel(
        lightIpRiverFold.count,
        lightIpRiverFold.opportunities,
      )}.`,
      action:
        "Review river bluff-catch thresholds in position before defaulting to folds.",
    });
  }

  const missedIpValueRaise = postMetric("missedIpValueRaise");
  if (
    missedIpValueRaise.opportunities >= 8 &&
    missedIpValueRaise.metricPct >= 30
  ) {
    addCandidate({
      key: "postflop_ip_value_raise_missed",
      area: "postflop",
      severity: missedIpValueRaise.metricPct - 30,
      sample: missedIpValueRaise.opportunities,
      label: "Missing turn/river value-raise opportunities in position",
      evidence: `Missed IP value-raises (turn/river): ${rateLabel(
        missedIpValueRaise.count,
        missedIpValueRaise.opportunities,
      )}.`,
      action:
        "Add selective turn/river value-raises in position when strong made hands face capped bet ranges.",
    });
  }

  const hasStrongPreflopSignal = candidates.some(
    (item) =>
      item.area === "preflop" && item.sample >= 12 && item.severity >= 3,
  );

  candidates.sort((a, b) => {
    const aAdjusted =
      hasStrongPreflopSignal && a.area === "postflop"
        ? a.severity * 0.75
        : a.severity;
    const bAdjusted =
      hasStrongPreflopSignal && b.area === "postflop"
        ? b.severity * 0.75
        : b.severity;
    return bAdjusted - aAdjusted;
  });
  const primary = candidates[0] || null;
  const secondary = candidates[1] || null;

  const evidence = [];
  if (primary?.evidence) evidence.push(primary.evidence);
  if (secondary?.evidence) evidence.push(secondary.evidence);
  if (openSpots > 0) {
    evidence.push(
      `Open first-in baseline: ${rateLabel(openCount, openSpots)}.`,
    );
  }
  if (defendSpots > 0) {
    evidence.push(
      `Defend vs open baseline: ${rateLabel(defendCount, defendSpots)}.`,
    );
  }
  if (blindSpots > 0) {
    evidence.push(
      `Blind fold vs open baseline: ${rateLabel(blindFolds, blindSpots)}.`,
    );
  }
  if (missedIpCbet.opportunities > 0) {
    evidence.push(
      `Missed IP c-bets (favorable flop): ${rateLabel(
        missedIpCbet.count,
        missedIpCbet.opportunities,
      )}.`,
    );
  }
  if (lightIpTurnFold.opportunities > 0) {
    evidence.push(
      `Likely light IP turn folds: ${rateLabel(
        lightIpTurnFold.count,
        lightIpTurnFold.opportunities,
      )}.`,
    );
  }
  if (missedIpValueRaise.opportunities > 0) {
    evidence.push(
      `Missed IP value-raises (turn/river): ${rateLabel(
        missedIpValueRaise.count,
        missedIpValueRaise.opportunities,
      )}.`,
    );
  }

  const actions = [];
  if (primary?.action) actions.push(primary.action);
  if (secondary?.action) actions.push(secondary.action);
  if (actions.length === 0) {
    actions.push(
      "No dominant leak crossed confidence thresholds. Keep collecting sample and prioritize metrics with 12+ opportunities.",
    );
  }

  const warnings = [];
  const warnIfSmall = (label, sample) => {
    if (toFinite(sample, 0) > 0 && toFinite(sample, 0) < 8) {
      warnings.push(
        `${label} sample is small (${toFinite(sample, 0)}); treat as low confidence.`,
      );
    }
  };
  warnIfSmall("Open first-in", openSpots);
  warnIfSmall("Defend vs open", defendSpots);
  warnIfSmall("Blind vs open", blindSpots);
  warnIfSmall("Fold after reraises", reraiseSpots);
  warnIfSmall(
    "Call then faced raise",
    toFinite(pre.callThenFacedRaiseSpots, 0),
  );
  warnIfSmall("Missed IP c-bets", missedIpCbet.opportunities);
  warnIfSmall("Missed IP stabs", missedIpStab.opportunities);
  warnIfSmall("Likely light IP turn folds", lightIpTurnFold.opportunities);
  warnIfSmall("Likely light IP river folds", lightIpRiverFold.opportunities);
  warnIfSmall("Missed IP value-raises", missedIpValueRaise.opportunities);

  const confidence = primary
    ? sampleConfidence(primary.sample)
    : sampleConfidence(totalHands);

  return {
    primaryLeak: primary?.label || "No major leak flagged.",
    secondaryLeak: secondary?.label || "No secondary leak flagged.",
    evidence: dedupeList(evidence, 6),
    actions: dedupeList(actions, 6),
    warnings: dedupeList(warnings, 6),
    confidence,
  };
}

function normalizeSummaryReviewResponse(
  parsed,
  completion,
  summaryContext = {},
) {
  const heuristic = deriveSummaryHeuristic(summaryContext);
  const confidenceRaw = String(parsed?.confidence || "medium")
    .trim()
    .toLowerCase();
  const confidence = ["low", "medium", "high"].includes(confidenceRaw)
    ? confidenceRaw
    : heuristic.confidence;
  const asStringList = (value, fallback = []) => {
    if (!Array.isArray(value)) return fallback;
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 8);
  };
  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;

  const modelPrimary = String(parsed?.primary_leak || "").trim();
  const modelSecondary = String(parsed?.secondary_leak || "").trim();
  const modelEvidence = asStringList(parsed?.evidence, []);
  const modelActions = asStringList(parsed?.actions, []);
  const modelWarnings = asStringList(parsed?.warnings, []);
  const primaryLooksGeneric =
    !modelPrimary ||
    /no major leak flagged|insufficient|no clear leak/i.test(modelPrimary);
  const secondaryLooksGeneric =
    !modelSecondary || /no secondary leak flagged|none/i.test(modelSecondary);
  const evidenceLooksWeak =
    modelEvidence.length === 0 ||
    modelEvidence.every((line) =>
      /insufficient structured evidence/i.test(line),
    );
  const actionsLookWeak =
    modelActions.length === 0 ||
    modelActions.every((line) => /collect a larger sample/i.test(line));
  const shouldUseHeuristicPrimary =
    primaryLooksGeneric &&
    !/No major leak flagged\./i.test(heuristic.primaryLeak);
  const shouldUseHeuristicSecondary =
    secondaryLooksGeneric && heuristic.secondaryLeak;
  const shouldUseHeuristicLists = evidenceLooksWeak || actionsLookWeak;

  return {
    primary_leak: shouldUseHeuristicPrimary
      ? heuristic.primaryLeak
      : modelPrimary || heuristic.primaryLeak,
    secondary_leak: shouldUseHeuristicSecondary
      ? heuristic.secondaryLeak
      : modelSecondary || heuristic.secondaryLeak,
    evidence: shouldUseHeuristicLists
      ? heuristic.evidence
      : dedupeList([...modelEvidence, ...heuristic.evidence], 8),
    actions: shouldUseHeuristicLists
      ? heuristic.actions
      : dedupeList([...modelActions, ...heuristic.actions], 8),
    warnings: dedupeList([...modelWarnings, ...heuristic.warnings], 8),
    confidence:
      shouldUseHeuristicPrimary || shouldUseHeuristicLists
        ? heuristic.confidence
        : confidence,
    usage,
  };
}

function normalizeTableHintResponse(parsed, completion, tableContext = {}) {
  const asString = (value) => String(value || "").trim();
  const asStringList = (value, max = 8) =>
    Array.isArray(value)
      ? value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, max)
      : [];
  const escapeRegex = (value) =>
    String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const toSeatLabel = (opponent) => {
    const explicit = asString(opponent?.seatLabel);
    if (explicit && !/unknown/i.test(explicit)) return explicit;
    const seatNumber = Number(opponent?.latestSeat?.number);
    if (Number.isFinite(seatNumber)) return `Seat ${seatNumber}`;
    return "";
  };
  const aliasPairs = [];

  const opponents = Array.isArray(tableContext?.opponents)
    ? tableContext.opponents
    : [];
  for (const opponent of opponents) {
    const playerId = asString(opponent?.player);
    const seatLabel = toSeatLabel(opponent);
    if (
      playerId &&
      seatLabel &&
      playerId.toLowerCase() !== seatLabel.toLowerCase()
    ) {
      aliasPairs.push({ playerId, seatLabel });
    }
  }
  aliasPairs.sort((a, b) => b.playerId.length - a.playerId.length);
  const rewritePlayerIdsToSeats = (line) => {
    let out = asString(line);
    if (!out) return "";
    for (const alias of aliasPairs) {
      const pattern = new RegExp(`\\b${escapeRegex(alias.playerId)}\\b`, "gi");
      out = out.replace(pattern, alias.seatLabel);
    }
    out = out.replace(/\b(Seat\s+\d+)\s*\([^)]*\)/gi, "$1");
    return out;
  };

  const strongSampleOpponents = opponents.filter(
    (item) => Number(item?.handsSeen) >= 12,
  );
  const maxHandsSeen = opponents.reduce((best, item) => {
    const hands = Number(item?.handsSeen);
    if (!Number.isFinite(hands)) return best;
    return Math.max(best, hands);
  }, 0);

  const heuristicExploits = [];
  for (const opponent of strongSampleOpponents) {
    const seatLabel = toSeatLabel(opponent);
    const playerId = asString(opponent?.player);
    const name = seatLabel || playerId || "Opponent";
    const foldToRaisePct = Number(opponent?.foldToPreflopRaise?.pct);
    const foldToRaiseSample = Number(opponent?.foldToPreflopRaise?.total);
    if (
      Number.isFinite(foldToRaisePct) &&
      Number.isFinite(foldToRaiseSample) &&
      foldToRaiseSample >= 8 &&
      foldToRaisePct >= 68
    ) {
      heuristicExploits.push(
        `${name} overfolds after facing raises (${foldToRaisePct.toFixed(1)}% over ${foldToRaiseSample} spots); pressure opens and 3-bets more.`,
      );
    }

    const vpip = Number(opponent?.enteredPot?.pct);
    const pfr = Number(opponent?.preflopRaise?.pct);
    if (
      Number.isFinite(vpip) &&
      Number.isFinite(pfr) &&
      vpip >= 36 &&
      pfr <= 16
    ) {
      heuristicExploits.push(
        `${name} looks loose-passive (VPIP ${vpip.toFixed(1)} / PFR ${pfr.toFixed(1)}); isolate wider and value-bet bigger postflop.`,
      );
    }

    const postFreq = Number(opponent?.postflopAggression?.frequencyPct);
    const postDecisions = Number(opponent?.postflopAggression?.decisions);
    if (
      Number.isFinite(postFreq) &&
      Number.isFinite(postDecisions) &&
      postDecisions >= 8 &&
      postFreq <= 22
    ) {
      heuristicExploits.push(
        `${name} is passive postflop (${postFreq.toFixed(1)}% aggression frequency); add delayed stabs after checks.`,
      );
    }
    if (
      Number.isFinite(postFreq) &&
      Number.isFinite(postDecisions) &&
      postDecisions >= 8 &&
      postFreq >= 45
    ) {
      heuristicExploits.push(
        `${name} is high-aggression postflop (${postFreq.toFixed(1)}% aggression frequency); tighten thin bluffs and bluff-catch selectively.`,
      );
    }
  }

  const modelPlan = rewritePlayerIdsToSeats(parsed?.table_plan);
  const modelExploits = asStringList(parsed?.priority_exploits, 6).map(
    rewritePlayerIdsToSeats,
  );
  const modelAvoid = asStringList(parsed?.avoid_traps, 6).map(
    rewritePlayerIdsToSeats,
  );
  const modelAdjustments = asStringList(parsed?.next_hour_adjustments, 8).map(
    rewritePlayerIdsToSeats,
  );
  const modelWarnings = asStringList(parsed?.sample_warnings, 8).map(
    rewritePlayerIdsToSeats,
  );
  const confidenceRaw = asString(parsed?.confidence).toLowerCase();
  const confidenceFromSample =
    strongSampleOpponents.length >= 3 || maxHandsSeen >= 30
      ? "high"
      : strongSampleOpponents.length >= 1 || maxHandsSeen >= 12
        ? "medium"
        : "low";
  const confidence = ["low", "medium", "high"].includes(confidenceRaw)
    ? confidenceRaw
    : confidenceFromSample;

  const tableLabel =
    asString(tableContext?.tableContext?.tableId) || "current table";
  const heuristicPlan = `Play a disciplined exploit strategy at ${tableLabel}: attack clear preflop leaks, avoid marginal high-variance spots versus unknowns, and keep adjustments tied to sampled tendencies.`;
  const fallbackAdjustments = [
    "Open wider from late position when blinds overfold to pressure.",
    "Versus sticky callers, trim pure bluffs and emphasize thin value.",
    "Versus high-aggression players, check stronger bluff-catchers and reduce auto c-bets.",
    "Re-check assumptions every orbit and downgrade reads below 8 opportunities.",
  ];
  const fallbackAvoid = [
    "Do not over-adjust to players with tiny samples.",
    "Avoid forcing big river bluffs into passive calling profiles.",
    "Do not flatten too many opens out of position versus aggressive opponents.",
  ];
  const sampleWarnings = [];
  if (opponents.length < 3) {
    sampleWarnings.push(
      "Current table read is based on a small opponent pool.",
    );
  }
  if (maxHandsSeen > 0 && maxHandsSeen < 8) {
    sampleWarnings.push(
      `Largest opponent sample is only ${maxHandsSeen} hands; confidence should stay low.`,
    );
  }

  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;

  const priorityExploits = dedupeList(
    [...modelExploits, ...heuristicExploits].map(rewritePlayerIdsToSeats),
    6,
  );
  const nextHourAdjustmentsRaw = dedupeList(
    (modelAdjustments.length > 0
      ? modelAdjustments
      : [...heuristicExploits.slice(0, 3), ...fallbackAdjustments]
    ).map(rewritePlayerIdsToSeats),
    9,
  );
  const nextHourAdjustments = nextHourAdjustmentsRaw.filter(
    (line) =>
      !priorityExploits.some(
        (exploit) => exploit.toLowerCase() === String(line).toLowerCase(),
      ),
  );
  const safeAdjustments =
    nextHourAdjustments.length > 0
      ? nextHourAdjustments.slice(0, 7)
      : dedupeList(fallbackAdjustments.map(rewritePlayerIdsToSeats), 4);

  return {
    table_plan: modelPlan || heuristicPlan,
    priority_exploits: priorityExploits,
    avoid_traps: dedupeList(
      modelAvoid.length > 0 ? modelAvoid : fallbackAvoid,
      5,
    ),
    next_hour_adjustments: safeAdjustments,
    sample_warnings: dedupeList([...modelWarnings, ...sampleWarnings], 6),
    confidence,
    usage,
  };
}

function normalizeIcmReviewResponse(parsed, completion, icmContext = {}) {
  const asString = (value) => String(value || "").trim();
  const asStringList = (value, max = 8) =>
    Array.isArray(value)
      ? value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, max)
      : [];
  const issueCounts =
    icmContext?.issueCounts && typeof icmContext.issueCounts === "object"
      ? icmContext.issueCounts
      : {};
  const sortedIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]);
  const topIssue = sortedIssues[0]?.[0] || "";
  const secondaryIssue = sortedIssues[1]?.[0] || "";
  const flaggedCount = Number(icmContext?.flagged?.count) || 0;
  const openSpots = Number(icmContext?.openSpots) || 0;
  const pressureEligibleSpots = Number(icmContext?.pressureEligibleSpots) || 0;
  const missedPressureSpots = Number(icmContext?.missedPressureSpots) || 0;
  const facingJamSpots = Number(icmContext?.facingJamSpots) || 0;
  const avgStackBb = Number(icmContext?.avgHeroStackBb);

  const primaryHeuristicByIssue = {
    missed_icm_pressure:
      "Missing late-stage pressure opportunities in position",
    missed_stack_pressure:
      "Not applying enough stack pressure on shorter blinds",
    too_loose_icm_open: "Opening/jamming too loose at late-stage stack depths",
    loose_jam_call_icm: "Calling all-ins too loose in ICM-heavy spots",
    too_tight_icm_defend:
      "Overfolding defend spots when stack depth allows continues",
    too_tight_jam_fold_icm: "Overfolding versus jams in likely continue spots",
    passive_short_stack_line:
      "Using passive short-stack lines instead of jam/fold",
  };

  const primaryLeakHeuristic =
    primaryHeuristicByIssue[topIssue] ||
    (flaggedCount > 0
      ? "Late-stage ICM spots show mixed pressure and continue leaks"
      : "No dominant ICM leak in the current sample");
  const secondaryLeakHeuristic =
    primaryHeuristicByIssue[secondaryIssue] ||
    (facingJamSpots >= 3
      ? "Review all-in continue thresholds versus jams"
      : "No clear secondary ICM leak");

  const evidenceHeuristic = [];
  evidenceHeuristic.push(
    `Flagged ICM spots: ${flaggedCount}/${Number(icmContext?.lateLevelHands) || 0}.`,
  );
  if (openSpots > 0) {
    evidenceHeuristic.push(`Open spots reviewed: ${openSpots}.`);
  }
  if (pressureEligibleSpots > 0) {
    evidenceHeuristic.push(
      `Pressure-eligible spots: ${missedPressureSpots}/${pressureEligibleSpots} missed.`,
    );
  }
  if (facingJamSpots > 0) {
    evidenceHeuristic.push(`Facing-jam spots reviewed: ${facingJamSpots}.`);
  }
  if (Number.isFinite(avgStackBb)) {
    evidenceHeuristic.push(
      `Average stack depth in sample: ${avgStackBb.toFixed(1)} BB.`,
    );
  }

  const actionsHeuristic = Array.isArray(icmContext?.quickFixes)
    ? icmContext.quickFixes.map((line) => asString(line)).filter(Boolean)
    : [];
  if (actionsHeuristic.length === 0) {
    actionsHeuristic.push(
      "No dominant ICM leak from this sample. Keep collecting late-stage hands and review pressure spots.",
    );
  }

  const warningsHeuristic = Array.isArray(icmContext?.warnings)
    ? icmContext.warnings.map((line) => asString(line)).filter(Boolean)
    : [];

  const modelPrimary = asString(parsed?.primary_leak);
  const modelSecondary = asString(parsed?.secondary_leak);
  const modelEvidence = asStringList(parsed?.evidence, 8);
  const modelActions = asStringList(parsed?.actions, 8);
  const modelWarnings = asStringList(parsed?.warnings, 8);
  const modelConfidence = asString(parsed?.confidence).toLowerCase();
  const confidence = ["low", "medium", "high"].includes(modelConfidence)
    ? modelConfidence
    : ["low", "medium", "high"].includes(asString(icmContext?.confidence))
      ? asString(icmContext?.confidence)
      : flaggedCount >= 6
        ? "high"
        : flaggedCount >= 3
          ? "medium"
          : "low";

  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;

  return {
    primary_leak: modelPrimary || primaryLeakHeuristic,
    secondary_leak: modelSecondary || secondaryLeakHeuristic,
    evidence: dedupeList(
      modelEvidence.length > 0
        ? [...modelEvidence, ...evidenceHeuristic]
        : evidenceHeuristic,
      8,
    ),
    actions: dedupeList(
      modelActions.length > 0
        ? [...modelActions, ...actionsHeuristic]
        : actionsHeuristic,
      8,
    ),
    warnings: dedupeList([...modelWarnings, ...warningsHeuristic], 8),
    confidence,
    usage,
  };
}

function normalizeBlindDefenseReviewResponse(
  parsed,
  completion,
  blindContext = {},
) {
  const asString = (value) => String(value || "").trim();
  const asStringList = (value, max = 8) =>
    Array.isArray(value)
      ? value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, max)
      : [];
  const totalSpots = Number(blindContext?.totalBlindDefenseSpots) || 0;
  const likelyContinueSpots = Number(blindContext?.likelyContinueSpots) || 0;
  const missedContinues = Number(blindContext?.missedContinues?.count) || 0;
  const missedSb3BetPressure =
    Number(blindContext?.missedSb3BetPressure?.count) || 0;
  const classRows = Array.isArray(blindContext?.handClassRows)
    ? blindContext.handClassRows
    : [];
  const topClass = classRows[0];
  const issueCounts =
    blindContext?.issueCounts && typeof blindContext.issueCounts === "object"
      ? blindContext.issueCounts
      : {};
  const topIssue =
    Object.entries(issueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";

  const primaryByIssue = {
    missed_sb_3bet_pressure: "Underusing SB 3-bet pressure against late opens",
    missed_blind_continue:
      "Overfolding likely blind continue spots versus opens",
  };
  const primaryLeakHeuristic =
    primaryByIssue[topIssue] ||
    (missedContinues > 0
      ? "Overfolding in blind-defense spots"
      : "No dominant blind-defense leak in this sample");
  const secondaryLeakHeuristic =
    missedSb3BetPressure > 0
      ? "Missed stack-pressure reraises from SB"
      : missedContinues > 0
        ? "Missed continues concentrated in specific hand classes"
        : "No clear secondary blind-defense leak";

  const evidenceHeuristic = [];
  evidenceHeuristic.push(`Blind defense spots reviewed: ${totalSpots}.`);
  evidenceHeuristic.push(
    `Likely continue spots: ${missedContinues}/${likelyContinueSpots}.`,
  );
  if (missedSb3BetPressure > 0) {
    evidenceHeuristic.push(
      `Likely SB 3-bet pressure spots folded: ${missedSb3BetPressure}.`,
    );
  }
  if (topClass?.label) {
    evidenceHeuristic.push(
      `Most frequent missed class: ${topClass.label} (${Number(topClass.count) || 0}).`,
    );
  }

  const actionsHeuristic = Array.isArray(blindContext?.quickFixes)
    ? blindContext.quickFixes.map((line) => asString(line)).filter(Boolean)
    : [];
  if (actionsHeuristic.length === 0) {
    actionsHeuristic.push(
      "No dominant blind-defense issue detected; keep collecting sample and re-check missed continue classes.",
    );
  }
  const warningsHeuristic = Array.isArray(blindContext?.warnings)
    ? blindContext.warnings.map((line) => asString(line)).filter(Boolean)
    : [];

  const modelPrimary = asString(parsed?.primary_leak);
  const modelSecondary = asString(parsed?.secondary_leak);
  const modelEvidence = asStringList(parsed?.evidence, 8);
  const modelActions = asStringList(parsed?.actions, 8);
  const modelWarnings = asStringList(parsed?.warnings, 8);
  const modelConfidence = asString(parsed?.confidence).toLowerCase();
  const confidence = ["low", "medium", "high"].includes(modelConfidence)
    ? modelConfidence
    : ["low", "medium", "high"].includes(asString(blindContext?.confidence))
      ? asString(blindContext?.confidence)
      : totalSpots >= 30
        ? "high"
        : totalSpots >= 12
          ? "medium"
          : "low";

  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;

  return {
    primary_leak: modelPrimary || primaryLeakHeuristic,
    secondary_leak: modelSecondary || secondaryLeakHeuristic,
    evidence: dedupeList(
      modelEvidence.length > 0
        ? [...modelEvidence, ...evidenceHeuristic]
        : evidenceHeuristic,
      8,
    ),
    actions: dedupeList(
      modelActions.length > 0
        ? [...modelActions, ...actionsHeuristic]
        : actionsHeuristic,
      8,
    ),
    warnings: dedupeList([...modelWarnings, ...warningsHeuristic], 8),
    confidence,
    usage,
  };
}

export async function getAggressionPrompt(context = {}, instruction) {
  const persona = String(context?.persona || "chaos_shark");
  const requestedModel =
    typeof context?.model === "string" && context.model.trim()
      ? context.model.trim()
      : null;
  const model =
    requestedModel && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  if (persona === "cash_game_crusher") {
    return runCashGameCrusher(context, instruction, model);
  }
  if (persona === "exploit_detective") {
    return runExploitDetective(context, instruction, model);
  }
  if (persona === "range_professor") {
    return runRangeProfessor(context, instruction, model);
  }
  if (persona === "short_stack_ninja") {
    return runShortStackNinja(context, instruction, model);
  }
  return runChaosCoach(context, instruction, model);
}

export async function reviewTournamentHand(
  handContext = {},
  instruction,
  requestedModel,
) {
  const model =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const opponentsInHand = Array.isArray(
    handContext?.opponentContext?.opponentsInHand,
  )
    ? handContext.opponentContext.opponentsInHand
    : [];
  const opponentLines = opponentsInHand.slice(0, 6).map((opponent) => {
    const parts = [];
    const player = String(opponent?.player || "").trim() || "Unknown";
    const handsSeen = Number(opponent?.handsSeen) || 0;
    parts.push(`${player} (${handsSeen} hands)`);
    const seatNumber = Number(opponent?.latestSeat?.number);
    const seatPosition = String(opponent?.latestSeat?.position || "").trim();
    if (Number.isFinite(seatNumber) || seatPosition) {
      const seatBits = [];
      if (Number.isFinite(seatNumber)) seatBits.push(`Seat ${seatNumber}`);
      if (seatPosition) seatBits.push(seatPosition);
      parts.push(seatBits.join(" "));
    }
    parts.push(buildOpponentEvidenceLine(opponent));
    parts.push(buildOpponentConfidenceNarrative(opponent));
    const tier = opponentConfidenceTier(handsSeen);
    if (tier === "high" && Array.isArray(opponent?.tags) && opponent.tags.length > 0) {
      parts.push(`Sample-backed tags: ${opponent.tags.join(", ")}`);
    }
    return `- ${parts.join(" | ")}`;
  });

  const handState =
    handContext?.validatedHandState &&
    typeof handContext.validatedHandState === "object"
      ? handContext.validatedHandState
      : null;
  const handStateValidation =
    handContext?.handStateValidation &&
    typeof handContext.handStateValidation === "object"
      ? handContext.handStateValidation
      : null;
  const handClassification = deriveHandClassification(handState || {});
  const decisionEvaluation = decisionEvaluationForContext(
    handContext,
    handClassification,
  );
  const enrichedHandContext = {
    ...handContext,
    handClassification,
    decisionEvaluation,
  };
  const aiHandContext = {
    handState,
    handClassification,
    decisionEvaluation,
    handStateValidation,
    reviewContext: handContext?.reviewContext || {},
    heroOutcome: handContext?.heroOutcome || {},
    opponentContext: {
      snapshotIncluded: Boolean(handContext?.opponentContext?.snapshotIncluded),
      topTagHints: Array.isArray(handContext?.opponentContext?.topTagHints)
        ? handContext.opponentContext.topTagHints
        : [],
    },
  };

  if (handStateValidation && handStateValidation.isValid === false) {
    const safe = safeFallbackReviewText(handStateValidation.issues || []);
    const base = normalizeReviewResponse(
      {
        overall_score: 0,
        preflop_score: 0,
        flop_score: 0,
        turn_score: 0,
        river_score: 0,
        confidence: "low",
        what_was_good: safe.what_was_good,
        primary_leak: safe.primary_leak,
        better_line: safe.better_line,
        reasoning: safe.reasoning,
      },
      null,
      enrichedHandContext,
    );
    return finalizeCoachingPresentation(base, enrichedHandContext);
  }

  const system = `You are a tournament poker hand reviewer.
Grade decisions using sound GTO principles with practical exploit awareness.
Do not claim solver precision. If data is missing, reduce confidence.
The handState object is the source of truth for action legality and state facts.
The handClassification object is the source of truth for hand-category terminology and showdown framing.
Use provided handClassification as source of truth. Do not invent hand-category terminology.
Board-relative hand strength matters.
A paired board alone does not mean hero has top pair or meaningful showdown value.
Use effectiveHandCategory and heroContributionLevel as source of truth.
Use kickerStrength, showdownRelevance, and boardPairKickerClass as source of truth for kicker-driven river logic.
Different levels of showdownRelevance should produce meaningfully different coaching recommendations.
Do not flatten all paired-board holdings into the same conservative narrative.
Kicker relevance should materially influence showdown expectations, bluff-catching potential, and river aggression recommendations.
Evaluate the quality of hero's chosen action, not merely the strength of the hole cards.
Weak hands folded correctly should not receive negative scoring simply because the cards themselves are weak.
Avoid suggesting speculative calls or 3-bets with weak offsuit holdings unless stack depth, position, and exploit evidence strongly justify it.
Do not invent mechanics, cards, stack math, or legal actions outside handState.
Use only handState.math for pot-odds/SPR references; do not perform fresh arithmetic.
Respond with strict JSON only.

Output JSON:
{
  "overall_score": -2,
  "preflop_score": -2,
  "flop_score": -2,
  "turn_score": -2,
  "river_score": -2,
  "confidence": "low|medium|high",
  "what_was_good": "string",
  "primary_leak": "string",
  "better_line": "string",
  "reasoning": "string"
}

Scoring rubric:
-2 major mistake, -1 slight mistake, 0 neutral, +1 good, +2 excellent.
Keep feedback concise and actionable.
- Evaluate each street only with information available at that street.
- Never use future cards/actions to justify earlier decisions.
- If hero folded on a street, later streets must not be scored or used for leak claims.
- If opponentContext is present, use it only as exploit context for those specific opponents in this hand.
- Reliability by sample size: <12 hands low confidence, 12-30 medium, >30 stronger.
- Stack-depth coaching constraints by effectiveStackBB:
  - <10BB: prioritize shove/fold-style simplification, direct equity realization, and tournament-life pressure; avoid small 3-bets, speculative flats, and postflop maneuverability claims.
  - 10-20BB: selective reshove/flat decisions and SPR/leverage language are acceptable.
  - >20BB: postflop maneuverability and wider exploit narratives are acceptable; avoid framing every spot as pure shove/fold.
- Do not make claims about hidden cards from opponent tags; keep uncertainty explicit.`;

  const user = `Hand context:
${JSON.stringify(aiHandContext, null, 2)}

${opponentLines.length ? `Opponent tendencies:\n${opponentLines.join("\n")}\n` : ""}

Instruction: ${
    instruction ||
    "Review this hand street-by-street and score hero's line with practical GTO-informed reasoning."
  }`;

  const maxAttempts = 3;
  let lastPipelineErrors = [];
  let lastFindings = [];
  let lastUsage = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const retryInstruction =
      attempt > 0
        ? `\n\nValidation retry requirements:\n- Fix every issue listed below.\n- Keep strict JSON shape unchanged.\nIssues:\n${lastPipelineErrors
            .slice(0, 6)
            .map((line) => `- ${line}`)
            .join("\n")}`
        : "";
    const attemptUser = `${user}${retryInstruction}`;
    const { parsed, completion } = await completePrompt({
      system,
      user: attemptUser,
      temperature: 0.25,
      top_p: 0.7,
      max_tokens: 420,
      model,
    });
    lastUsage = completion?.usage || null;

    const contractValidation = validateReviewModelOutputContract(parsed);
    if (!contractValidation.valid) {
      lastFindings = contractValidation.findings || [];
      lastPipelineErrors = (contractValidation.errors || []).slice(0, 8);
      continue;
    }

    const normalized = normalizeReviewResponse(
      parsed,
      completion,
      enrichedHandContext,
    );
    const postValidation = validatePostGenerationReview(
      normalized,
      enrichedHandContext,
    );
    lastFindings = postValidation.findings || [];

    if ((postValidation.summary?.blockerCount || 0) > 0) {
      lastPipelineErrors = (postValidation.errors || []).slice(0, 8);
      continue;
    }

    if ((postValidation.summary?.warningCount || 0) > 0) {
      const warningFindings = (postValidation.findings || []).filter(
        (item) => item?.severity === VALIDATION_SEVERITY.WARNING,
      );
      const recovered = applyReviewGuardrails(
        normalized,
        enrichedHandContext,
        warningFindings,
      );
      const recoveredValidation = validatePostGenerationReview(
        recovered.review,
        enrichedHandContext,
      );
      lastFindings = recoveredValidation.findings || [];
      if ((recoveredValidation.summary?.blockerCount || 0) > 0) {
        lastPipelineErrors = (recoveredValidation.errors || []).slice(0, 8);
        continue;
      }
      const summaryWithRewrites = summarizeFindings(recoveredValidation.findings, [
        ...(recoveredValidation.summary?.rewrittenFields || []),
        ...(recovered.rewrittenFields || []),
      ]);
      const presented = finalizeCoachingPresentation(
        recovered.review,
        enrichedHandContext,
      );
      const withSummary = attachValidationSummary(presented, summaryWithRewrites);
      return withSummary;
    }

    const confidenceAdjusted = {
      ...normalized,
      confidence: guardrailConfidence(
        enrichedHandContext,
        normalized.confidence,
        postValidation.summary,
      ),
    };
    const presented = finalizeCoachingPresentation(
      confidenceAdjusted,
      enrichedHandContext,
    );
    const withSummary = attachValidationSummary(presented, postValidation.summary);
    return withSummary;
  }

  const safe = safeFallbackReviewText(
    handStateValidation?.issues || [],
    lastPipelineErrors.length > 0
      ? lastPipelineErrors
      : (Array.isArray(lastFindings) ? lastFindings.map((item) => item?.message) : []),
  );
  const fallbackReview = normalizeReviewResponse(
    {
      overall_score: 0,
      preflop_score: 0,
      flop_score: 0,
      turn_score: 0,
      river_score: 0,
      confidence: "low",
      what_was_good: safe.what_was_good,
      primary_leak: safe.primary_leak,
      better_line: safe.better_line,
      reasoning: safe.reasoning,
    },
    lastUsage ? { usage: lastUsage } : null,
    enrichedHandContext,
  );
  const fallbackWithConfidence = {
    ...fallbackReview,
    confidence: "low",
  };
  const presentedFallback = finalizeCoachingPresentation(
    fallbackWithConfidence,
    enrichedHandContext,
  );
  return attachValidationSummary(
    presentedFallback,
    summarizeFindings(lastFindings),
  );
}

export async function reviewTournamentSummary(
  summaryContext = {},
  instruction,
  requestedModel,
) {
  const model =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const system = `You are a tournament poker performance analyst.
Given summary stats from a player's session, identify likely leaks without over-claiming.
Use sample-size awareness and avoid definitive claims on tiny denominators.
Respond with strict JSON only.

Output JSON:
{
  "primary_leak": "string",
  "secondary_leak": "string",
  "evidence": ["string"],
  "actions": ["string"],
  "warnings": ["string"],
  "confidence": "low|medium|high"
}

Rules:
- Every evidence line must include denominator context (e.g. 12/58).
- Prefer actionable advice tied to opening, defending, and blind play before postflop leaks when preflop stats are clearly worse.
- When "postflopIpAudit" is present with adequate samples, include it in leak selection and evidence.
- When "tournamentRating" is present, keep the leak narrative aligned with its top penalty drivers.
- If a metric sample is tiny (<8), call it out as low confidence in warnings instead of overfitting.
- Keep evidence and actions concise (max 5 each).
- Do not return generic placeholders like "No major leak flagged" when open/defend/blind metrics show clear deviations with 12+ samples.`;

  const user = `Session Summary context:
${JSON.stringify(summaryContext, null, 2)}

Instruction: ${
    instruction ||
    "Review this Session Summary and return the most likely leaks with concise, prioritized fixes."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.25,
    top_p: 0.7,
    max_tokens: 320,
    model,
  });

  return normalizeSummaryReviewResponse(parsed, completion, summaryContext);
}

export async function reviewCurrentTableHint(
  tableContext = {},
  instruction,
  requestedModel,
) {
  const model =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const system = `You are a tournament poker table-exploit advisor.
Given current-table opponent tendencies and session summary context, provide practical next-hour adjustments.
Stay sample-aware and avoid overconfident reads on tiny samples.
Respond with strict JSON only.

Output JSON:
{
  "table_plan": "string",
  "priority_exploits": ["string"],
  "avoid_traps": ["string"],
  "next_hour_adjustments": ["string"],
  "sample_warnings": ["string"],
  "confidence": "low|medium|high"
}

Rules:
- Focus advice on the current table only, not generic tournament strategy.
- Prefer seat references (e.g. "Seat 4") over raw player IDs.
- Anchor exploit lines to provided tendencies whenever possible.
- Keep output concise and actionable (max 5 items per list).
- Flag low-confidence reads when denominators are small (<8 spots or <12 hands seen).
- Avoid mentioning hidden-card certainty or solver-perfect claims.`;

  const user = `Current table context:
${JSON.stringify(tableContext, null, 2)}

Instruction: ${
    instruction ||
    "Give a practical current-table plan for the next hour with specific exploits and cautions."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.25,
    top_p: 0.7,
    max_tokens: 420,
    model,
  });

  return normalizeTableHintResponse(parsed, completion, tableContext);
}

export async function reviewIcmSpotSummary(
  icmContext = {},
  instruction,
  requestedModel,
) {
  const model =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const system = `You are a tournament poker late-stage ICM analyst.
Given a heuristic audit of recent high-level hands, identify where the player missed pressure or misapplied risk.
Keep feedback practical and sample-aware; do not claim exact solver/ICM model outputs.
Respond with strict JSON only.

Output JSON:
{
  "primary_leak": "string",
  "secondary_leak": "string",
  "evidence": ["string"],
  "actions": ["string"],
  "warnings": ["string"],
  "confidence": "low|medium|high"
}

Rules:
- Prioritize pressure application leaks in position when stack coverage supports it.
- Include stack-depth framing (in BB) in at least one evidence/action line when available.
- Keep lists concise (max 5 items each).
- Treat this as heuristic ICM proxy review unless payout/ladder inputs are explicitly provided.`;

  const user = `ICM spot audit context:
${JSON.stringify(icmContext, null, 2)}

Instruction: ${
    instruction ||
    "Review these late-stage spots and identify where pressure should increase or risk should tighten."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.25,
    top_p: 0.7,
    max_tokens: 360,
    model,
  });

  return normalizeIcmReviewResponse(parsed, completion, icmContext);
}

export async function reviewBlindDefenseSummary(
  blindContext = {},
  instruction,
  requestedModel,
) {
  const model =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const system = `You are a tournament poker blind-defense analyst.
Given blind-defense spot summaries across a full tournament sample, identify the most important defend leaks.
Focus on missed continues and SB 3-bet pressure opportunities, with practical next-study guidance.
Respond with strict JSON only.

Output JSON:
{
  "primary_leak": "string",
  "secondary_leak": "string",
  "evidence": ["string"],
  "actions": ["string"],
  "warnings": ["string"],
  "confidence": "low|medium|high"
}

Rules:
- Prioritize actionable blind-defense fixes over generic preflop advice.
- When relevant, call out hand-class patterns (e.g., suited connectors, broadways, Ax).
- Include SB 3-bet pressure guidance when missed SB pressure candidates are present.
- Keep lists concise (max 5 items each).
- Treat this as chart-based heuristic review unless solver/payout model context is provided.`;

  const user = `Blind defense audit context:
${JSON.stringify(blindContext, null, 2)}

Instruction: ${
    instruction ||
    "Review these blind-defense misses and summarize what hand classes and pressure lines to work on."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.25,
    top_p: 0.7,
    max_tokens: 360,
    model,
  });

  return normalizeBlindDefenseReviewResponse(parsed, completion, blindContext);
}

async function runChaosCoach(context = {}, instruction, model) {
  const styleTone = buildStyleTone(context?.style);
  const system = `You are ChaosCoach - an AI poker hype bot.
You never reference hole cards, board cards, math, or odds.
You always respond with valid JSON only - no markdown or commentary.

${styleTone}

Flavor inspirations (mix in sparingly, max 1 per response):
- "Alligator blood. We keep coming."
- "Pay that man his money."
- "If you can't spot the sucker, change the table."
- "Splash the pot? I insist."
- "Rounders Teachings: grind, glide, then strike."
- "Shower them with fear."
- "Stop playing patty-cake. Jam the gas."
- "No more training wheels. Fire or fold."
- "Worm says tighten up? Tell him to railbird."
- "I like you. I'll bust you last."
- "They think you're meek; prove them wrong."
- "This table smells scared."
- "Ace up, heart out - pressure now."
- "Destiny favors maniacs."
- "Bankroll talks; whisper is for folding."
- "Stack their chips before dessert."
- "We don't check back winning hands."
- "Fear is the underdog. Crush it."
- "Grease the gears and fire again."
- "Michael McDermott would 3-bet here."
- "Grandma plays softer - make her proud by blasting."

Output strict JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: one of "open","call","3-bet","4-bet","check","bet","raise","jam","fold" (aggressive bias)
- sizing: fun, loose, or odd (e.g. "4x open","77% pot","133% overbet","4.7x squeeze")
- flavor_text: short, hype-driven, max 20 words. Lean into Rounders quotes, iconic poker lines, or needle the hero for being too soft. Rotate phrasing.
- No card or probability mentions.
- If context.history is present, use it to maintain narrative consistency (keep sizing vibe, mix traps after heavy aggression). Do not repeat the history; just use the signal in the next JSON output.`;

  const mixHint = buildMixHint(context);
  const hypeLevel = Math.min((context?.previousActions?.length ?? 0) * 5, 100);
  const sizingPref = sizingCue(context);
  const historyHint = summarizeHistory(context?.history);
  const stakeTier = String(context?.stakeTier || "unknown");
  const stakeGuidanceMap = {
    micro: {
      label: "Micro stakes",
      note: "Population over-calls and under-bluffs; widen thin value bets, trim pure bluffs, punish passive lines.",
    },
    low: {
      label: "Low stakes",
      note: "Expect loose preflop calls and passive postflop play; value bet hard, probe capped ranges, distrust big river bluffs.",
    },
    mid: {
      label: "Mid stakes",
      note: "Regulars mix balanced aggression; defend enough vs steals, mix blocker-driven bluffs, respect credible multi-barrels.",
    },
    high: {
      label: "High stakes",
      note: "Population balances ranges well; default to solver baselines, seize polarized spots, and anticipate double/triple barrels.",
    },
  };
  const stakeGuide =
    stakeTier !== "unknown" ? stakeGuidanceMap[stakeTier] || null : null;

  const user = `Context: ${JSON.stringify(context || {}, null, 2)}
${mixHint}
${sizingPref ? `${sizingPref}\n` : ""}${
    historyHint ? `History hint: ${historyHint}\n` : ""
  }Hype level: ${hypeLevel}
Instruction: ${
    instruction ||
    "Suggest the next aggressive or deceptive action for this branch."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.6,
    top_p: 0.85,
    max_tokens: 120,
    model,
  });

  return buildResponse(parsed, completion, "Apply pressure.");
}

async function runCashGameCrusher(context = {}, instruction, model) {
  const stacks = stackSnapshot(context);
  const effective = stacks.effective || stacks.hero || 100;
  const villainType = String(context?.villainType || "fishy");
  const villainNotes = {
    balanced: "Balanced regular - pressure capped ranges, respect reraises.",
    nit: "Nitty villain - bluff scare cards, fold to aggression, isolate limps.",
    station:
      "Calling station - bet big for value, keep bluffing frequency low.",
    maniac:
      "Maniac - let them hang themselves, 3-bet premiums, pot control marginal.",
    fishy: "Loose-passive fish - iso wide, overbet value, deny equity.",
  };
  const villainPlan = villainNotes[villainType] || villainNotes.fishy;
  const posCategory = positionCategory(context?.heroSeat);
  const { compact, readable } = formatHeroHand(context);
  const handCategory = compact ? categorizeRangeHand(compact) : null;
  const handTier = handCategory?.tier || "unknown";
  const isWeakHand = ["trash", "marginal"].includes(handTier);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);

  const stackNote =
    effective >= 140
      ? `Deep stack ${effective} BB - room for triple-barrels and check-raise traps.`
      : effective <= 60
        ? `Effective stack ${effective} BB - trim bluff frequency, prioritize value.`
        : `Effective stack ${effective} BB - standard 100 BB cash depth.`;
  const multiOpened = previous.some((code) =>
    /preflop_multiple_villains_opened/.test(String(code)),
  );
  const multiwayNote = multiOpened
    ? "Preflop: multiple villains entered before hero - expect multiway pots."
    : null;
  const facingOpen = previous.some((code) =>
    /preflop_opened_to_me|preflop_multiple_villains_opened|preflop_faced_3bet/.test(
      String(code),
    ),
  );
  const fallbackAction = isWeakHand && facingOpen ? "fold" : "bet";
  const weakHandNote =
    isWeakHand && facingOpen
      ? "Hand tier is weak; prioritize folding or cheap over-limps unless a clear exploit exists."
      : null;

  const focusLines = [
    "Game type: low/mid stakes cash (no ICM).",
    stackNote,
    `Villain profile: ${villainType}`,
    villainPlan,
    posCategory !== "unknown" ? `Hero seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    previous.length ? `Previous actions: ${previous.join(" | ")}` : "",
    readable ? `Hero hand: ${readable}` : "",
    handCategory ? `Hand evaluation: ${handCategory.label}` : "",
    multiwayNote,
    weakHandNote,
    historyHint ? `Recent history: ${historyHint}` : "",
  ].filter(Boolean);

  const cashContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    villainType,
    heroHand: compact,
    heroCards: context?.heroCards,
    stacks: {
      hero: stacks.hero,
      villain: stacks.villain,
      effective,
    },
    multiVillainsOpened: multiOpened,
    handTier,
  };

  const system = `You are Cash Game Crusher - a deep-stack cash poker coach who exploits loose low-stakes opponents.
Focus on building pots with value, isolating weak players, leveraging position, and adjusting aggression to stack depth.
No ICM or payout concerns ever enter the plan.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: pick among "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- sizing: specify cash-game sizes (e.g., "raise to 3.5x", "70% pot", "overbet 135%").
- flavor_text: <= 20 words, highlight exploit reasoning (value targeting, isolating fish, pressure capped range).
- Mention the follow-up plan vs calls or raises (e.g., double barrel, check back turn).
- Assume effective stacks around 100 BB unless context specifies otherwise.
- If hand tier is trash or marginal and facing raises out of position, default to folding or cheap over-limps unless a clear exploit warrants aggression.`;

  const user = `Context: ${JSON.stringify(cashContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the most profitable cash-game line given deep-stack dynamics and villain profile."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.5,
    top_p: 0.85,
    max_tokens: 160,
    model,
  });

  return buildResponse(
    parsed,
    completion,
    "Extract max value from the cash table.",
    fallbackAction,
  );
}

async function runExploitDetective(context = {}, instruction, model) {
  const villainType = String(context?.villainType || "balanced");
  const villainNotes = {
    balanced: "Solid, balanced villain - mix pressure but respect resistance.",
    nit: "Over-folds and protects premiums only - attack with bluffs and steals.",
    station: "Calls too wide - bet big for value, keep bluffs sparse.",
    maniac:
      "Over-aggressive - trap with strong hands, induce bluffs, control pot.",
    fishy:
      "Loose-passive - bet for value, avoid massive bluffs, isolate often.",
  };
  const villainPlan = villainNotes[villainType] || villainNotes.balanced;
  const posCategory = positionCategory(context?.heroSeat);
  const { compact, readable } = formatHeroHand(context);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);
  const stacks = stackSnapshot(context);
  const multiOpened = previous.some((code) =>
    /preflop_multiple_villains_opened/.test(String(code)),
  );

  const focusLines = [
    `Villain profile: ${villainType}`,
    villainPlan,
    posCategory !== "unknown" ? `Hero seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    previous.length ? `Previous actions: ${previous.join(" | ")}` : "",
    stacks.effective ? `Effective stack ~ ${stacks.effective} BB` : "",
    readable ? `Hero hand (optional): ${readable}` : "",
    multiOpened
      ? "Multiple villains entered preflop - expect more callers and capped ranges."
      : "Assume heads-up pot versus the villain.",
    historyHint ? `Recent history: ${historyHint}` : "",
  ].filter(Boolean);

  const exploitContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    villainType,
    heroHand: compact,
    heroCards: context?.heroCards,
    stacks,
    multiVillainsOpened: multiOpened,
  };

  const system = `You are Exploit Detective - a heads-up poker specialist who tailors lines to villain tendencies.
Reference specific leaks (over-folding, calling wide, over-aggression) and adjust aggression, sizing, and trap frequency accordingly.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose from "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- sizing: give precise exploit sizing (e.g., "65% pot value bet", "small 2.2x stab", "overbet scare card").
- flavor_text: <= 20 words, call out the exploit rationale (e.g., "value vs station", "pressure the nit's cap").
- Discuss plan vs likely villain reactions (calls, raises, folds) in the line description.
- Assume heads-up dynamics; no multiway considerations.`;

  const user = `Context: ${JSON.stringify(exploitContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the most exploitative line given the villain profile and recent action."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.45,
    top_p: 0.8,
    max_tokens: 150,
    model,
  });

  return buildResponse(
    parsed,
    completion,
    "Exploit their leak with precision.",
    "aggress",
  );
}

async function runShortStackNinja(context = {}, instruction, model) {
  const stacks = stackSnapshot(context);
  if (!stacks.hero && !stacks.effective) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Need hero stack in BB for shove-or-fold advice.",
      usage: null,
    };
  }

  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Select hero cards for Short-Stack Ninja.",
      usage: null,
    };
  }
  const descriptor = compact ? describeHand(compact) : null;
  const posCategory = positionCategory(context?.heroSeat);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const actionInfo = actionContext(previous, context?.branch);
  const historyHint = summarizeHistory(context?.history);

  const focusLines = [
    `Hero stack: ${stacks.hero ?? stacks.effective ?? "?"} BB`,
    stacks.villain ? `Villain stack: ${stacks.villain} BB` : "",
    stacks.effective ? `Effective stack: ${stacks.effective} BB` : "",
    readable
      ? `Hero hand: ${readable}${descriptor ? ` (${descriptor})` : ""}`
      : "",
    posCategory !== "unknown" ? `Seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    actionInfo.facingOpen ? "Facing an open raise." : "",
    actionInfo.facing3bet ? "Facing a 3-bet or shove." : "",
    actionInfo.heroOpened ? "Hero opened the pot already." : "",
    actionInfo.multiway ? "Pot is multiway." : "",
    stacks.effective && stacks.effective <= 12
      ? "Short-stack zone: prepare jam-or-fold decisions."
      : "",
    historyHint ? `Recent history: ${historyHint}` : "",
  ].filter(Boolean);

  const shortContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    heroHand: compact,
    heroCards: context?.heroCards,
    stacks,
    actionContext: actionInfo,
  };

  const system = `You are Short-Stack Ninja - an expert at shove-or-fold tournament spots.
Specialize in effective stacks of 20 BB or less, and call out when depth is beyond that zone.
Use disciplined push/fold charts, blocker logic, and fold equity calculations.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose from "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- Emphasize jam/fold/induce logic. If recommending min-raise, specify follow-up plan vs shove.
- sizing: provide precise guidance ("jam", "min-raise to 2.1x", "fold").
- flavor_text: <= 18 words, concise, tactical, reference fold equity, blockers, or ladder awareness. No hype.
- Default to folding trash hands with <12 BB when facing raises unless blockers or antes justify aggression.
- Mention how to respond vs calls, reshoves, or folds in the next beats.`;

  const user = `Context: ${JSON.stringify(shortContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the optimal short-stack line using shove/fold logic and plan for villain reactions."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.35,
    top_p: 0.7,
    max_tokens: 140,
    model,
  });

  return buildResponse(
    parsed,
    completion,
    "Stay sharp with shove-or-fold discipline.",
    "jam",
  );
}

async function runRangeProfessor(context = {}, instruction, model) {
  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Select hero cards for Range Professor.",
      usage: null,
    };
  }

  const descriptor = describeHand(compact);
  const handCategory = categorizeRangeHand(compact);
  const posCategory = positionCategory(context?.heroSeat);
  const actionInfo = actionContext(
    context?.previousActions || [],
    context?.branch,
  );
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);
  const stakeTier = String(context?.stakeTier || "unknown");
  const format = String(context?.format || "unknown");
  const stacks = stackSnapshot(context);
  const effectiveStack = stacks.effective || stacks.hero || null;
  const stackBucket =
    context?.stackBucket ||
    (effectiveStack !== null
      ? effectiveStack >= 60
        ? "deep"
        : effectiveStack >= 30
          ? "medium"
          : effectiveStack > 0
            ? "short"
            : "unknown"
      : "unknown");
  const relativePosition =
    context?.relativePosition ||
    context?.tendencies?.resolvedRelativePosition ||
    "unknown";
  const isPreflop = String(context?.street || "").toLowerCase() === "preflop";
  const unopenedPreflop =
    isPreflop && !actionInfo.facingOpen && !actionInfo.heroOpened;
  if (
    unopenedPreflop &&
    ["early", "mid"].includes(posCategory) &&
    handCategory.tier === "trash"
  ) {
    return {
      hero_action: "fold",
      sizing: "",
      flavor_text:
        "Trash-tier offsuit from early/mid position—standard preflop fold at this stack depth.",
      usage: null,
    };
  }
  const stakeGuidanceMap = {
    micro: {
      label: "Micro stakes",
      note: "Population over-calls and under-bluffs; widen thin value bets, trim pure bluffs, punish passive lines.",
    },
    low: {
      label: "Low stakes",
      note: "Expect loose preflop calls and passive postflop play; value bet hard, probe capped ranges, distrust big river bluffs.",
    },
    mid: {
      label: "Mid stakes",
      note: "Regulars mix balanced aggression; defend enough vs steals, mix blocker-driven bluffs, respect credible multi-barrels.",
    },
    high: {
      label: "High stakes",
      note: "Population balances ranges well; default to solver baselines, seize polarized spots, and anticipate double/triple barrels.",
    },
  };
  const stakeGuide =
    stakeTier !== "unknown" ? stakeGuidanceMap[stakeTier] || null : null;
  const normalizeCard = (card) =>
    typeof card === "string" && card.trim().length === 2
      ? card.trim().toUpperCase()
      : null;
  const flopCards = Array.isArray(context?.board?.flop)
    ? context.board.flop.map(normalizeCard).filter(Boolean)
    : [];
  const turnCard = normalizeCard(context?.board?.turn);
  const riverCard = normalizeCard(context?.board?.river);
  const boardSummary = [];
  if (flopCards.length === 3) boardSummary.push(`Flop: ${flopCards.join(" ")}`);
  if (turnCard) boardSummary.push(`Turn: ${turnCard}`);
  if (riverCard) boardSummary.push(`River: ${riverCard}`);
  const handFeatures = describeHandFeatures(context?.heroCards, context?.board);
  const focusLines = [
    `Hero hand: ${readable}${descriptor ? ` (${descriptor})` : ""}`,
    `Hand tier: ${handCategory.label} (tier=${handCategory.tier})`,
    "Hero profile: balanced aggression; manage pot size when nut edge is unclear.",
    stacks.hero ? `Hero stack: ${stacks.hero} BB` : "",
    stacks.villain ? `Villain stack: ${stacks.villain} BB` : "",
    stacks.effective ? `Effective stack: ${stacks.effective} BB` : "",
    context?.heroSeat ? `Hero seat: ${String(context.heroSeat)}` : "",
    posCategory !== "unknown" ? `Seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    previous.length ? `Previous actions: ${previous.join(" | ")}` : "",
    actionInfo.facingOpen ? "Facing an open raise." : "",
    actionInfo.buttonSteal ? "Open raise likely from button steal range." : "",
    actionInfo.facing3bet ? "Facing a 3-bet or 4-bet." : "",
    actionInfo.heroOpened ? "Hero has already opened the pot." : "",
    actionInfo.multiway ? "Pot is multiway." : "",
    typeof context?.aggressors === "number"
      ? `Aggressors seen: ${context.aggressors}`
      : "",
    boardSummary.length ? `Board: ${boardSummary.join(" | ")}` : "",
    handFeatures ? `Hand eval: ${handFeatures.summary}` : "",
    handFeatures?.boardTexture?.suit && handFeatures.boardTexture.count >= 3
      ? `${handFeatures.boardTexture.count >= 4 ? "Four-card" : "Three-card"} ${
          handFeatures.boardTexture.suit
        } board; hero ${
          handFeatures.boardTexture.heroFlushBlocker ? "holds" : "lacks"
        } blocker.`
      : "",
    ...(handFeatures?.notes || []).map((note) => `Hand note: ${note}`),
    historyHint ? `Recent history: ${historyHint}` : "",
    stakeGuide
      ? `Stakes: ${stakeGuide.label}. Guidance: ${stakeGuide.note}`
      : stakeTier === "unknown"
        ? "Stakes: Unknown - use baseline solver frequencies."
        : "",
    relativePosition === "ip"
      ? "In position: leverage informational advantage to mix flats and controlled aggression."
      : relativePosition === "oop"
        ? "Out of position: temper barreling frequency, protect checking ranges, lean on bluff-catchers judiciously."
        : "",
    format === "tournament"
      ? stackBucket === "deep"
        ? "Tournament context, deep stack (60bb+): widen open-raising ranges from mid/late seats, apply pressure to accumulate chips early."
        : stackBucket === "medium"
          ? "Tournament context, medium stack (30-60bb): balance chip preservation with selective steals; avoid bloating marginal spots OOP."
          : stackBucket === "short"
            ? "Tournament context, short stack (<30bb): tighten opens, preserve fold equity for jam-or-fold decisions."
            : "Tournament context: adjust ranges based on stack depth."
      : "",
  ].filter(Boolean);

  const boardContext = {};
  if (flopCards.length) boardContext.flop = flopCards;
  if (turnCard) boardContext.turn = turnCard;
  if (riverCard) boardContext.river = riverCard;

  const rangeContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    aggressors: context?.aggressors,
    history: context?.history,
    heroHand: compact,
    heroCards: context?.heroCards,
    handTier: handCategory.tier,
    handDescription: handCategory.label,
    seatCategory: posCategory,
    actionContext: actionInfo,
    board: Object.keys(boardContext).length ? boardContext : undefined,
    handFeatures: handFeatures || undefined,
    format,
    stacks,
    stackBucket,
    relativePosition,
    heroProfile: {
      riskTolerance: "medium",
      style: "balanced_cautious",
      guidance:
        "Hero feels variance-prone; apply controlled aggression - press nut or blocker edges, otherwise temper pot growth.",
    },
    stakeTier: stakeTier,
    stakeGuidance: stakeGuide ? stakeGuide.note : undefined,
  };

  const system = `You are Range Professor - a disciplined poker strategy coach.
You evaluate hands with range logic, blockers, and positional awareness.
Ground every recommendation in solver/GTO logic, flagging any exploitative deviations explicitly.
Leverage board texture as context while keeping range fundamentals primary.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose one of "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- sizing: supply a concrete size tied to the line (e.g. "55% pot","3.5x 3-bet","jam").
- flavor_text: <= 22 words, analytical, reference range or blocker insights when useful, no hype.
- Consider hero hand ${readable} and anticipate likely villain responses for the next decisions.
- When board cards are present, state hero's current made hand class (e.g. top pair, two pair, set, straight) before discussing draw potential.
- Use solver-baseline lines first; call out exploitative departures and rationale when you recommend them.
- Pair plus strong draw combinations (e.g. pair + flush draw or pair + open-ended) typically continue versus single raises; only fold with clear GTO justification (stack, range disadvantage, extreme sizing).
- When the board shows three or more of a suit, tighten calling frequencies without that suit blocker; default to folding two-pair or weaker versus large raises unless blockers or sizing justify a hero call.
- Preflop: protect a calling range. In position versus 3-bets, mix flats with suited broadways, pocket pairs, and Axs; out of position, defend with suited broadways/pairs that play well post-flop while keeping 4-bet traps for premiums.
- Hero profile: variance-aware yet balanced; reserve big commitments for clear nut edges or strong blocker-driven aggression.
- In bloated or multiway pots without the nuts, lean on pot-control or disciplined folds unless range/nut dynamics justify pressure; detail loss-mitigation plans.
- Reference blockers, equity shifts, or nut advantages from the board only as supporting evidence; don't ignore positional/range foundations.
- Mention plan adjustments when facing calls, raises, or folds.
- Default to folding hands marked tier=trash or tier=marginal when facing strong action unless clear exploitative rationale exists; explain any deviation.
- Early and middle positions require tighter continuing ranges against opens.`;

  const user = `Context: ${JSON.stringify(rangeContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Provide the highest EV line considering hero hand strength, position, and likely opponent reactions."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.35,
    top_p: 0.75,
    max_tokens: 160,
    model,
  });

  return buildResponse(parsed, completion, "Balance range discipline.", "fold");
}
