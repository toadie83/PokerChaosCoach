import OpenAI from "openai";
import { z } from "zod";
import {
  buildStreetReviewAggregate,
  buildStreetReviewAggregateFromStreetReviews,
} from "./streetReviewService.js";
import {
  buildDeterministicIntelligence,
  createEmptyDeterministicIntelligence,
} from "./deterministicIntelligenceService.js";
import {
  buildTournamentStageGuidance,
  TOURNAMENT_STAGE_LIFECYCLE_RULES,
} from "./tournamentStageService.js";
import {
  BOUNTY_TOURNAMENT_LIFECYCLE_RULES,
  buildBountyTournamentGuidance,
} from "./bountyTournamentService.js";
import {
  STUDY_SPOT_CATEGORIES,
  STUDY_SPOT_TAGS,
  STUDY_SPOT_TYPES,
} from "./studySpots/taxonomy.js";

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

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_VISION_MODEL = "gpt-4.1-mini";
const FAST_LUNA_MODEL_SELECTION = "gpt-5.6-luna-fast";
const GPT_56_REASONING_EFFORT = "low";
const GPT_56_REASONING_TOKEN_RESERVE = 256;
const ALLOWED_MODELS = new Set([
  "gpt-5.6-luna",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
]);
const ALLOWED_MODEL_SELECTIONS = new Set([
  ...ALLOWED_MODELS,
  FAST_LUNA_MODEL_SELECTION,
]);
const ALLOWED_VISION_MODELS = new Set([
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
]);

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

const STREET_AI_REVIEW_SCHEMA = z.object({
  score: z.number().min(-2).max(2),
  preferred_action: z.object({
    action: z.string().min(1),
    sizing: z.string().nullable(),
  }),
  analysis: z.object({
    insight: z.string().min(1),
    range_context: z.string().min(1),
    board_texture: z.string().min(1),
    sizing_commentary: z.string().min(1),
    plan_commentary: z.string().min(1),
    takeaway: z.string().min(1),
  }),
  confidence: z.enum(["low", "medium", "high"]),
  strategic_tags: z.array(z.string()).max(10),
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
  const hasStraightFlush = suitEntries.some(([suit, count]) => {
    if (count < 5) return false;
    return hasStraight(
      cards.filter((card) => card.suit === suit).map((card) => card.value),
    );
  });
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
  if (hasStraightFlush) {
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

function isPremiumTierLabel(tier = "") {
  return String(tier || "").trim().toLowerCase() === "premium";
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
      /preflop_open_and_3bet_to_me/.test(code) ||
      /preflop_opp_raise/.test(code) ||
      /_opp_4bet/.test(code)
    )
      context.facing3bet = true;
    if (/preflop_hero_opened/.test(code)) context.heroOpened = true;
    if (/multi|open_and_3bet_to_me/.test(code)) context.multiway = true;
  }
  return context;
}

function stackSnapshot(context = {}) {
  const decision = context?.decisionNode || {};
  const stackInfo = context?.stackInfo || {};
  const positiveOrNull = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
    }
    return null;
  };
  const nonNegativeOrNull = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric >= 0) return numeric;
    }
    return null;
  };
  const hero = nonNegativeOrNull(
    context?.heroStackBehindBB,
    stackInfo?.hero,
    decision?.heroStackBehindBB,
    context?.heroStackBB,
  );
  const villain = nonNegativeOrNull(
    context?.villainStackBehindBB,
    stackInfo?.villain,
    decision?.opponentStackBehindBB,
    context?.villainStackBB,
  );
  const effective = nonNegativeOrNull(
    decision?.effectiveStackBB,
    stackInfo?.effective,
    hero !== null && villain !== null ? Math.min(hero, villain) : hero ?? villain,
  );
  return {
    hero,
    villain,
    effective,
    heroStarting: positiveOrNull(
      decision?.startingHeroStackBB,
      stackInfo?.heroStarting,
      context?.heroStackBB,
    ),
    villainStarting: positiveOrNull(
      decision?.startingOpponentStackBB,
      stackInfo?.villainStarting,
      context?.villainStackBB,
    ),
  };
}

const LIVE_STACK_LEVERAGE_RULES = `Live stack rules:
- Treat heroStackBehindBB and effectiveStackBB in the supplied decision object as chips remaining now, not hand-start stacks. Replay Analyst receives context.decisionNode as decision.
- effectiveStackBB and primaryOpponentEffectiveStackBB describe Hero versus the named primary opponent only. They do not cap Hero's total exposure to unacted players.
- On preflop decisions, inspect playersYetToActSeats, playersYetToActCount, playersLiveAtDecision, heroMaximumExposureBB, and strategicRestrictions. A default playersInHand value of 2 does not erase seats that structurally remain to act.
- When players remain behind and their stacks are unknown, assume they can cover Hero. Never justify risking Hero's full stack solely because the opener is short; assess the jam against both the opener's range and the cold-call/cold-4-bet ranges behind.
- If Hero covers a short opener but has a materially deeper stack exposed to players behind, preserve calls and non-all-in 3-bets for non-premium hands so Hero can respond to a cold reshove. Reserve a full-stack jam for a range robust against every live continuing range.
- Use potBB, facingAction.callAmountBB, heroStackAfterCallBB, and SPR together when choosing an action and size. potBB and contestablePotBB exclude any uncalled excess that Hero cannot win; never use rawPotBB or uncalledExcessBB to make a covering shove look like a better price.
- Avoid a non-all-in aggressive size that leaves Hero an awkward remainder, especially 6 BB or less or roughly one-third pot or less. If aggression is best, choose a coherent jam, a smaller size with a plan, or a check as permitted by legal actions.
- Never size above maxHeroTotalToBB in the supplied decision object.`;

const LIVE_MADE_HAND_SAFETY_RULES = `Postflop made-hand safety:
- Re-evaluate Hero's complete made hand after every board card; preflop tier labels never override the current postflop hand class.
- An ace-high flush on an unpaired board is a protected continuing hand. Never fold it to ordinary aggression or a small raise; choose at least call when call is legal, then compare call versus raise or jam using SPR and ranges.
- A rare possible straight flush does not turn an ace-high flush into a routine fold. Paired boards and explicit full-house pressure require a separate range analysis.
- If generated advice conflicts with the supplied cards or deterministic made-hand class, the card-derived hand class wins.`;

const LIVE_PREFLOP_POSITION_RULES = `Preflop range posture:
- Do not default to a premium-only strategy or try to force an arbitrary VPIP. Card distribution varies, but a balanced baseline must include positional opens, calls, and blind defenses.
- At roughly 30 BB or deeper, an unopened BTN is a wide steal spot and an unopened CO is meaningfully wider than middle position. Marginal hand labels do not override position: all pairs, suited aces, many offsuit aces, broadways, suited kings/queens, and connected suited hands can be legitimate late-position opens.
- At roughly 25 BB or deeper, defend the BB substantially against 2-2.5 BB BTN/CO opens using calls and 3-bets; do not fold playable suited, connected, broadway, ace-x, king-x, or pair classes merely because they are non-premium. The SB should retain a selective call/3-bet continuing range.
- Preserve in-position calls with hands that realize equity well when stack depth and price support them. Tighten progressively below about 25 BB and prioritize coherent jam/reshove or disciplined fold lines at genuinely short depth.
- Antes, smaller opens, position, and weaker opponent ranges widen participation; multiway action, larger opens, and poor realization tighten it. A user-selected tournament stage supplies only qualitative pressure; exact ICM requires payout and field data, and ICM never applies to cash decisions.`;

function selectedTournamentStageGuidance(context = {}) {
  const guidance = buildTournamentStageGuidance(context);
  return guidance?.code && guidance.code !== "auto" ? guidance : null;
}

function selectedBountyTournamentGuidance(context = {}) {
  return buildBountyTournamentGuidance(context);
}

const CASH_GAME_LIFECYCLE_RULES = `Cash-game objective and full-hand lifecycle:
- Maximize repeatable long-run monetary EV. Cash chips have linear monetary value, lost chips can be rebought, blinds do not rise, and there is no bubble, ladder, survival premium, or ICM risk premium.
- Never preserve a stack for a later tournament stage or chase early-tournament chip accumulation. Choose the highest-EV current decision while respecting bankroll-independent table stakes and effective stacks.
- Treat rake as a real drag on marginal calls and small pots, especially at low stakes, but never invent an exact rake structure when it is not supplied.
- Preflop: construct position- and action-specific open, call, 3-bet, 4-bet, isolation, squeeze, and blind-defense ranges. Account for rake, limpers, likely callers, position, and deep-stack reverse implied odds; size larger when isolating callers or playing out of position when the state supports it.
- Flop: decide whether the range wants a small range bet, selective medium sizing, polarized large sizing, or a check-heavy strategy from range advantage, nut advantage, board texture, position, player count, SPR, and opponent tendencies. Separate value, protection, semi-bluff, pure-bluff, and showdown-value checks.
- Turn: update both ranges after the flop action and new card. Barrel cards that improve Hero's nut/range advantage or credible value region; give up poor bluffs; use geometric sizing when building toward a river shove and preserve a coherent checking range.
- River: construct explicit value-bet and bluff regions, including thin value against likely worse calls and blocker/unblocker quality for bluffs. Low-stakes populations often under-bluff large river lines and over-call some nodes, so adjust only when the supplied profile supports it.
- Across every street, choose one legal action for this exact hand as a combo inside a range strategy. In reasoning, name the qualitative range posture (range-bet, selective/merged, polarized, or check-heavy), the value region, the best bluff candidates, and the principal checking/calling/folding region when the known state supports those claims.
- Choose sizing for the range, not just for the exact hand. Tie it to potBB, facing amount, SPR, effective stack, number of players, range geometry, and the intended next-street plan; never use a large size merely because Hero currently has a strong hand.
- Multiway pots require stronger value, fewer bluffs, and awareness that different opponents can retain different nut regions. Heads-up assumptions are forbidden when decisionNode.playersInHand exceeds 2.
- Use only cards and actions available at the current node. Keep the line consistent with prior actions, but express future play only as conditional plans versus calls, raises, folds, and runout classes.`;

function buildLivePreflopGuidance(context = {}) {
  const decision = context?.decisionNode || {};
  const street = String(decision?.street || context?.street || "").toLowerCase();
  if (street !== "preflop") return null;

  const heroSeat = String(decision?.heroSeat || context?.heroSeat || "").toUpperCase();
  const opponentSeat = String(
    decision?.facingAction?.actorSeat || decision?.opponentSeat || context?.opponentSeat || "",
  ).toUpperCase();
  const effectiveRaw = Number(
    decision?.effectiveStackBB ?? context?.stackInfo?.effective ?? context?.heroStackBehindBB,
  );
  const effectiveStackBB = Number.isFinite(effectiveRaw) && effectiveRaw >= 0
    ? effectiveRaw
    : null;
  const decisionKind = String(decision?.decisionKind || "").toLowerCase();
  const facingSizeRaw = Number(
    decision?.facingAction?.toAmountBB ?? decision?.facingAction?.amountBB,
  );
  const facingSizeBB = Number.isFinite(facingSizeRaw) && facingSizeRaw > 0
    ? facingSizeRaw
    : null;
  const playersYetToActSeats = Array.isArray(decision?.playersYetToActSeats)
    ? decision.playersYetToActSeats
        .map((seat) => String(seat || "").toUpperCase())
        .filter(Boolean)
    : [];
  const playersYetToActCount = Number.isFinite(
    Number(decision?.playersYetToActCount),
  )
    ? Math.max(0, Number(decision.playersYetToActCount))
    : playersYetToActSeats.length;
  const heroMaximumExposureRaw = Number(
    decision?.heroMaximumExposureBB ??
      decision?.maxHeroTotalToBB ??
      decision?.heroStackBehindBB,
  );
  const heroMaximumExposureBB = Number.isFinite(heroMaximumExposureRaw)
    ? heroMaximumExposureRaw
    : null;
  const hasOverjamRestriction = Array.isArray(decision?.strategicRestrictions)
    ? decision.strategicRestrictions.some(
        (item) => item?.code === "short_opener_players_behind_overjam",
      )
    : false;
  const hasAntes = Number(decision?.anteBB ?? context?.anteBB) > 0;
  const depthBand = effectiveStackBB === null
    ? "unknown"
    : effectiveStackBB <= 20
      ? "short"
      : effectiveStackBB < 40
        ? "medium"
        : "deep";
  const common = {
    depthBand,
    effectiveStackBB,
    heroSeat: heroSeat || null,
    opponentSeat: opponentSeat || null,
    facingSizeBB,
    playersYetToActSeats,
    playersYetToActCount,
    heroMaximumExposureBB,
  };

  if (hasOverjamRestriction) {
    const playersBehindLabel = playersYetToActSeats.length
      ? playersYetToActSeats.join(" and ")
      : "unacted players";
    return {
      ...common,
      situation: "short_opener_players_behind_overjam",
      baseline:
        `The short effective stack applies only against the opener; Hero's full ${heroMaximumExposureBB ?? "deeper"} BB remains exposed while ${playersBehindLabel} can still act with unknown stacks. Do not default to a full Hero-stack jam with non-premium hands. Preserve calls or a normal non-all-in 3-bet with a fold plan versus a cold 4-bet/reshove, and reserve jams for hands robust against both the opener and players-behind continuing ranges.`,
    };
  }

  if (decisionKind === "facing_open_and_3bet") {
    const initialOpenAmountRaw = Number(
      decision?.facingAction?.initialOpenAmountBB ??
        decision?.preflopSequence?.initialOpenAmountBB,
    );
    const initialOpenAmountBB =
      Number.isFinite(initialOpenAmountRaw) && initialOpenAmountRaw > 0
        ? initialOpenAmountRaw
        : null;
    const openerSeat = String(
      decision?.facingAction?.initialOpenerSeat ??
        decision?.preflopSequence?.initialOpenerSeat ??
        "",
    ).toUpperCase();
    return {
      ...common,
      situation: "cold_3bet_two_villains",
      initialOpenAmountBB,
      initialOpenerSeat: openerSeat || null,
      baseline:
        `This is a cold decision after an initial ${
          initialOpenAmountBB !== null ? `${initialOpenAmountBB} BB ` : ""
        }open and a separate ${
          facingSizeBB !== null ? `${facingSizeBB} BB ` : ""
        }3-bet. Hero did not make the original raise. Continue substantially tighter than versus a single open or when defending Hero's own open: the initial opener remains active and can call or back-raise, while ${
          playersYetToActCount > 0
            ? `${playersYetToActSeats.join(" and ") || "additional seats"} also remain behind`
            : "both villain ranges must still be cleared"
        }. Cold-calls need robust multiway realization; use 4-bets or jams primarily with strong value and carefully selected blockers, sized against full-stack exposure. ${
          depthBand === "short"
            ? "At short depth, prefer a coherent value reshove-or-fold posture rather than speculative cold-calling."
            : "At medium/deep depth, do not turn ordinary one-villain continues into automatic cold 4-bets or jams."
        }`,
    };
  }

  if (depthBand === "short") {
    return {
      ...common,
      situation: decisionKind || "preflop",
      baseline:
        "Short-stack discipline applies: remove speculative deep-stack calls, protect fold equity, and prefer coherent open-jam, reshove, raise-call, or fold decisions.",
    };
  }

  if (decisionKind === "unopened") {
    if (heroSeat === "BTN") {
      return {
        ...common,
        situation: "unopened_btn",
        baseline:
          "Use a wide first-in BTN steal baseline, not a premium-only range. All pairs, all suited aces, most offsuit aces including A3o, broadways, suited kings/queens, and many connected suited hands are routine open candidates; fold only the genuinely weakest combinations.",
      };
    }
    if (heroSeat === "CO") {
      return {
        ...common,
        situation: "unopened_co",
        baseline:
          "Use an assertive CO opening baseline: all pairs, suited aces, stronger offsuit aces including A8o, broadways, suited kings/queens/jacks, and playable suited connectors belong in the opening conversation.",
      };
    }
    if (heroSeat === "SB") {
      return {
        ...common,
        situation: "unopened_sb",
        baseline:
          "When folded to the SB, steal materially wider than from middle position while accounting for being out of position if called; use a consistent small open size and retain jams only for suitable depths.",
      };
    }
    return {
      ...common,
      situation: "unopened_other",
      baseline: hasAntes
        ? "Antes improve the reward for first-in aggression; widen selectively by position without turning early-position ranges loose."
        : "Use a position-appropriate first-in range; late position should be visibly wider than early and middle position.",
    };
  }

  const facingOpen = ["facing_open", "facing_open_callers"].includes(decisionKind);
  if (facingOpen && heroSeat === "BB" && ["BTN", "CO", "SB"].includes(opponentSeat)) {
    return {
      ...common,
      situation: "bb_defend_vs_late_open",
      baseline:
        facingSizeBB !== null && facingSizeBB <= 2.5
          ? "The BB is receiving a strong price against a late-position small open. Continue broadly through calls and selective 3-bets with pairs, aces, broadways, suited kings/queens, and connected suited hands; avoid reflex overfolding."
          : "Defend the BB against the late-position range, but tighten as the open grows; retain calls and 3-bets for hands with suitable equity realization and blockers.",
    };
  }
  if (facingOpen && heroSeat === "SB" && ["BTN", "CO"].includes(opponentSeat)) {
    return {
      ...common,
      situation: "sb_defend_vs_late_open",
      baseline:
        "Against a late-position steal, keep a real SB continuing range: mix selective calls with linear and blocker-driven 3-bets instead of folding every non-premium hand, while respecting poor out-of-position realization.",
    };
  }
  if (facingOpen && ["BTN", "CO"].includes(heroSeat)) {
    return {
      ...common,
      situation: "in_position_vs_open",
      baseline:
        "At medium/deep depth, preserve an in-position calling range with pairs, suited broadways, suited aces, and connected suited hands when the opener, price, and players behind allow; mix value and blocker 3-bets rather than using fold-or-3-bet only.",
    };
  }

  return {
    ...common,
    situation: decisionKind || "preflop",
    baseline:
      "Use position, price, stack depth, and range interaction. Do not collapse a medium/deep preflop strategy into premium hands only.",
  };
}

function liveCoachFallbackAction(legalActions = [], preflopGuidance = null) {
  const legal = new Set(
    (Array.isArray(legalActions) ? legalActions : []).map((action) =>
      String(action || "").toLowerCase(),
    ),
  );
  const situation = String(preflopGuidance?.situation || "");
  if (
    ["unopened_btn", "unopened_co", "unopened_sb"].includes(situation) &&
    legal.has("open")
  ) {
    return "open";
  }
  if (
    [
      "bb_defend_vs_late_open",
      "sb_defend_vs_late_open",
      "in_position_vs_open",
      "short_opener_players_behind_overjam",
    ].includes(situation) &&
    legal.has("call")
  ) {
    return "call";
  }
  if (legal.has("check")) return "check";
  if (legal.has("fold")) return "fold";
  return [...legal][0] || "fold";
}

function protectedAceHighFlush(context = {}) {
  const decision =
    context?.decisionNode && typeof context.decisionNode === "object"
      ? context.decisionNode
      : {};
  const street = String(decision?.street || context?.street || "").toLowerCase();
  if (!["flop", "turn", "river"].includes(street)) return null;

  const sourceHero = context?.heroCards;
  const hero = (
    sourceHero && typeof sourceHero === "object" && !Array.isArray(sourceHero)
      ? [sourceHero.card1, sourceHero.card2]
      : decision?.heroCards
  )
    ?.map(parseCardCodeSafe)
    .filter(Boolean) || [];
  const board = context?.board
    ? collectBoardCards(context.board)
    : (Array.isArray(decision?.boardCards) ? decision.boardCards : [])
        .map(parseCardCodeSafe)
        .filter(Boolean);
  if (hero.length !== 2 || board.length < 3) return null;
  if (new Set(board.map((card) => card.rank)).size !== board.length) return null;

  const boardSuitCounts = new Map();
  for (const card of board) {
    boardSuitCounts.set(card.suit, (boardSuitCounts.get(card.suit) || 0) + 1);
  }
  for (const [suit, boardCount] of boardSuitCounts.entries()) {
    if (boardCount < 3) continue;
    const suitedHero = hero.filter((card) => card.suit === suit);
    if (
      suitedHero.some((card) => card.rank === "A") &&
      boardCount + suitedHero.length >= 5
    ) {
      return {
        suit,
        suitName: SUIT_NAMES[suit] || suit,
        boardCount,
      };
    }
  }
  return null;
}

function applyLiveDecisionSafety(response = {}, context = {}) {
  if (String(response?.hero_action || "").toLowerCase() !== "fold") {
    return response;
  }
  const protectedFlush = protectedAceHighFlush(context);
  if (!protectedFlush) return response;

  const decision = context?.decisionNode || {};
  const legalActions = Array.isArray(decision?.legalActions)
    ? decision.legalActions.map((action) => String(action || "").toLowerCase())
    : [];
  if (!legalActions.includes("call")) return response;

  const callAmountRaw = Number(
    decision?.facingAction?.callAmountBB ?? decision?.potOdds?.callAmountBB,
  );
  const callAmountBB =
    Number.isFinite(callAmountRaw) && callAmountRaw > 0 ? callAmountRaw : null;
  const requiredEquityRaw = Number(
    decision?.potOdds?.requiredEquityPct ?? decision?.potOddsPct,
  );
  const requiredEquityPct =
    Number.isFinite(requiredEquityRaw) && requiredEquityRaw > 0
      ? requiredEquityRaw
      : null;
  const alternativeAction = ["raise", "jam"]
    .find((action) => legalActions.includes(action)) || null;
  const priceText = requiredEquityPct !== null
    ? ` at a ${requiredEquityPct}% raw-equity price`
    : "";

  return {
    ...response,
    hero_action: "call",
    sizing: callAmountBB !== null ? `Call ${callAmountBB} BB` : "Call",
    sizing_bb: callAmountBB,
    confidence: "high",
    flavor_text:
      "The ace-high flush is a mandatory continue; calling is the conservative floor against this raise.",
    reasoning:
      `Hero holds the ace-high ${protectedFlush.suitName} flush on an unpaired board${priceText}. Folding is excluded by the deterministic made-hand safety check. Call preserves every worse flush and bluff; ${
        alternativeAction
          ? `${alternativeAction} remains the aggressive alternative after weighing SPR and Villain's continuing range.`
          : "continue with the legal call."
      }`,
    alternative_action: alternativeAction,
    alternative_sizing: null,
    safety_override: "protected_ace_high_flush",
  };
}

function cashGameFallbackAction({
  legalActions = [],
  preflopGuidance = null,
  weakHandFacingPreflopAggression = false,
} = {}) {
  const legal = new Set(
    (Array.isArray(legalActions) ? legalActions : []).map((action) =>
      String(action || "").toLowerCase(),
    ),
  );
  if (weakHandFacingPreflopAggression && legal.has("fold")) return "fold";
  return liveCoachFallbackAction(legalActions, preflopGuidance);
}

function isGpt56Model(model) {
  return String(model || "").startsWith("gpt-5.6");
}

function resolveCoachModelSelection(selection) {
  if (selection === FAST_LUNA_MODEL_SELECTION) {
    return {
      model: DEFAULT_MODEL,
      serviceTier: "fast",
    };
  }

  return {
    model: ALLOWED_MODELS.has(selection) ? selection : DEFAULT_MODEL,
    serviceTier: null,
  };
}

function buildChatCompletionRequest({
  system,
  user,
  temperature = 0.6,
  top_p = 0.85,
  max_tokens = 120,
  model = DEFAULT_MODEL,
  responseSchema = null,
  responseSchemaName = "poker_coach_response",
}) {
  const resolvedSelection = resolveCoachModelSelection(model);
  const chosenModel = resolvedSelection.model;
  const outputTokenLimit = Math.max(1, Math.round(Number(max_tokens) || 120));
  const request = {
    model: chosenModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: responseSchema
      ? {
          type: "json_schema",
          json_schema: {
            name: responseSchemaName,
            strict: true,
            schema: responseSchema,
          },
        }
      : { type: "json_object" },
  };

  if (isGpt56Model(chosenModel)) {
    request.reasoning_effort = GPT_56_REASONING_EFFORT;
    request.max_completion_tokens =
      outputTokenLimit + GPT_56_REASONING_TOKEN_RESERVE;
  } else {
    request.temperature = temperature;
    request.top_p = top_p;
    request.max_tokens = outputTokenLimit;
  }

  if (resolvedSelection.serviceTier) {
    request.service_tier = resolvedSelection.serviceTier;
  }

  return request;
}

async function completePrompt(options) {
  const completion = await getClient().chat.completions.create(
    buildChatCompletionRequest(options),
  );

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

function liveDecisionResponseSchema(legalActions = []) {
  const normalizedLegal = Array.from(
    new Set(
      (Array.isArray(legalActions) ? legalActions : [])
        .map((action) => String(action || "").trim().toLowerCase())
        .filter((action) => VALID_ACTIONS.includes(action)),
    ),
  );
  const actionEnum = normalizedLegal.length ? normalizedLegal : VALID_ACTIONS;
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      hero_action: { type: "string", enum: actionEnum },
      sizing: { type: "string" },
      sizing_bb: {
        anyOf: [
          { type: "number", minimum: 0 },
          { type: "null" },
        ],
      },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      reasoning: { type: "string" },
      assumptions: {
        type: "array",
        items: { type: "string" },
        maxItems: 6,
      },
      alternative_action: {
        type: "string",
        enum: [...actionEnum, ""],
      },
      alternative_sizing: { type: "string" },
      flavor_text: { type: "string" },
    },
    required: [
      "hero_action",
      "sizing",
      "sizing_bb",
      "confidence",
      "reasoning",
      "assumptions",
      "alternative_action",
      "alternative_sizing",
      "flavor_text",
    ],
  };
}

function structuredLiveDecisionConfig(legalActions, responseSchemaName) {
  return {
    responseSchema: liveDecisionResponseSchema(legalActions),
    responseSchemaName,
  };
}

function buildResponse(
  parsed,
  completion,
  fallbackFlavor,
  fallbackAction = "check",
  legalActions = [],
  context = null,
) {
  const normalizeAction = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    const aliases = {
      shove: "jam",
      allin: "jam",
      "all-in": "jam",
      threebet: "3-bet",
      fourbet: "4-bet",
      reraise: "raise",
      "re-raise": "raise",
    };
    return aliases[raw] || raw;
  };
  const normalizedLegal = Array.isArray(legalActions)
    ? legalActions.map(normalizeAction).filter((action) => VALID_ACTIONS.includes(action))
    : [];
  const preferredFallbacks = [
    normalizeAction(fallbackAction),
    "check",
    "fold",
    "call",
    "bet",
    "open",
    "raise",
    "jam",
  ];
  const fallback =
    preferredFallbacks.find(
      (action) =>
        VALID_ACTIONS.includes(action) &&
        (normalizedLegal.length === 0 || normalizedLegal.includes(action)),
    ) || normalizedLegal[0] || "fold";
  let hero_action = normalizeAction(parsed?.hero_action || fallback);
  if (
    !VALID_ACTIONS.includes(hero_action) ||
    (normalizedLegal.length > 0 && !normalizedLegal.includes(hero_action))
  ) {
    hero_action = fallback;
  }
  let sizing = String(parsed?.sizing || "").trim();
  let sizing_bb = Number(parsed?.sizing_bb);
  sizing_bb = Number.isFinite(sizing_bb) && sizing_bb > 0 ? sizing_bb : null;
  if (["check", "fold"].includes(hero_action)) {
    sizing = "";
    sizing_bb = null;
  }
  let flavor_text = String(parsed?.flavor_text || fallbackFlavor).trim();
  if (!flavor_text) flavor_text = fallbackFlavor;
  const confidenceValue = String(parsed?.confidence || "").toLowerCase();
  const confidence = ["low", "medium", "high"].includes(confidenceValue)
    ? confidenceValue
    : "medium";
  const reasoning = String(parsed?.reasoning || flavor_text).trim() || flavor_text;
  const assumptions = Array.isArray(parsed?.assumptions)
    ? parsed.assumptions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  let alternative_action = normalizeAction(parsed?.alternative_action);
  if (
    !alternative_action ||
    alternative_action === hero_action ||
    !VALID_ACTIONS.includes(alternative_action) ||
    (normalizedLegal.length > 0 && !normalizedLegal.includes(alternative_action))
  ) {
    alternative_action =
      normalizedLegal.find((action) => action !== hero_action) || null;
  }
  const alternative_sizing = alternative_action
    ? String(parsed?.alternative_sizing || "").trim() || null
    : null;
  const usage = completion.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;
  const response = {
    hero_action,
    sizing,
    sizing_bb,
    flavor_text,
    confidence,
    reasoning,
    assumptions,
    alternative_action,
    alternative_sizing,
    legal_actions: normalizedLegal,
    usage,
  };
  return context ? applyLiveDecisionSafety(response, context) : response;
}

function buildIncompleteLiveCoachResponse({
  flavorText,
  reasoning,
  assumptions = [],
  legalActions = [],
} = {}) {
  const normalizedLegal = Array.from(
    new Set(
      (Array.isArray(legalActions) ? legalActions : [])
        .map((action) => String(action || "").trim().toLowerCase())
        .filter((action) => VALID_ACTIONS.includes(action)),
    ),
  );
  const message = String(flavorText || "More decision information is required.").trim();
  return {
    hero_action: "...",
    sizing: "",
    sizing_bb: null,
    flavor_text: message,
    confidence: "low",
    reasoning: String(reasoning || message).trim(),
    assumptions: (Array.isArray(assumptions) ? assumptions : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 6),
    alternative_action: null,
    alternative_sizing: null,
    legal_actions: normalizedLegal,
    usage: null,
  };
}

export const __liveCoachTestables = {
  allowedModelSelections: ALLOWED_MODEL_SELECTIONS,
  allowedModels: ALLOWED_MODELS,
  allowedVisionModels: ALLOWED_VISION_MODELS,
  buildChatCompletionRequest,
  buildLivePreflopGuidance,
  buildIncompleteLiveCoachResponse,
  buildResponse,
  applyLiveDecisionSafety,
  cashGameFallbackAction,
  cashGameLifecycleRules: CASH_GAME_LIFECYCLE_RULES,
  categorizeRangeHand,
  describeHandFeatures,
  liveCoachFallbackAction,
  protectedAceHighFlush,
  liveDecisionResponseSchema,
  defaultModel: DEFAULT_MODEL,
  defaultVisionModel: DEFAULT_VISION_MODEL,
  positionCategory,
  resolveCoachModelSelection,
  selectedTournamentStageGuidance,
  selectedBountyTournamentGuidance,
  structuredLiveDecisionConfig,
  bountyTournamentLifecycleRules: BOUNTY_TOURNAMENT_LIFECYCLE_RULES,
  tournamentStageLifecycleRules: TOURNAMENT_STAGE_LIFECYCLE_RULES,
};

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
      madeHandType: "high_card",
      pairType: "none",
      pairSource: null,
      tripsType: "none",
      boardPairing: pairedBoard,
      showdownStrength: "none",
      showdownStrengthTier: "none_showdown",
      showdownRelevance: "none",
      bluffCatcher: false,
      boardMadeHand,
      heroImprovesBoard: false,
      heroContributionLevel: "none",
      kickerStrength: "none",
      boardPairKickerClass: "air",
      effectiveHandCategory: "air",
      drawsPresent: { flushDraw: false, straightDraw: false },
      drawDetails: {
        flushDrawSuit: null,
        straightDrawType: null,
        comboDraw: false,
      },
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
  const heroHighKickerRank = heroCards
    .map((card) => card.rank)
    .sort((a, b) => (RANK_VALUES[b] || 0) - (RANK_VALUES[a] || 0))[0] || null;
  const heroHighKickerValue = RANK_VALUES[heroHighKickerRank] || 0;
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
  let pairRank = null;
  const heroPocketPair =
    heroCards[0]?.rank &&
    heroCards[1]?.rank &&
    heroCards[0].rank === heroCards[1].rank;
  if (madeHandCategory === "pair" && boardCards.length > 0) {
    pairRank = rankEntries.find(([, count]) => count >= 2)?.[0] || null;
    const boardSorted = Array.from(new Set(boardValues)).sort((a, b) => b - a);
    const boardHigh = boardSorted[0] ?? null;
    const boardSecond = boardSorted[1] ?? null;
    const pairValue = pairRank ? RANK_VALUES[pairRank] : null;
    const pairOnBoard = pairRank
      ? (boardRankCounts.get(pairRank) || 0) > 0
      : false;
    const heroHasPairRank = pairRank
      ? heroCards.some((card) => card.rank === pairRank)
      : false;
    // A paired board alone (without hero matching that rank) is not hero "pair".
    if (pairOnBoard && !heroHasPairRank && !heroPocketPair) {
      madeHandCategory = "air";
      pairType = "none";
    } else if (
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
  } else if (madeHandCategory === "air" && boardCards.length >= 3) {
    // High-card hands can retain weak showdown value on some runouts.
    showdownStrength = heroHighKickerValue >= 13 ? "weak" : "none";
  }

  const flushDrawEntry = !hasFlush
    ? Array.from(suitCounts.entries()).find(
        ([suit, count]) =>
          count === 4 && heroCards.some((card) => card.suit === suit),
      )
    : null;
  const straightDrawDetails = !straightMade
    ? detectStraightDraw(allValues, heroValues, false)
    : null;
  const flushDraw = Boolean(flushDrawEntry);
  const straightDraw = Boolean(straightDrawDetails);
  const drawsPresent = {
    flushDraw,
    straightDraw,
  };
  const drawDetails = {
    flushDrawSuit: flushDrawEntry ? SUIT_NAMES[flushDrawEntry[0]] || null : null,
    straightDrawType: straightDrawDetails?.type || null,
    comboDraw: flushDraw && straightDraw,
  };
  const topDescriptor = rankCharToDescriptor(topRank || "");
  const boardTopDescriptor = rankCharToDescriptor(
    boardOnlyClassification?.topRank || "",
  );
  const heroKickerRanks = heroCards
    .map((card) => card.rank)
    .filter((rank) => rank !== topDescriptor.rank)
    .sort((a, b) => (RANK_VALUES[b] || 0) - (RANK_VALUES[a] || 0));
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

  const madeHandType = (() => {
    if (madeHandCategory === "air") {
      const highDescriptor = rankCharToDescriptor(heroHighKickerRank || "");
      const highName = String(highDescriptor?.rankName || "high_card")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      return `${highName}_high`;
    }
    if (madeHandCategory === "pair") {
      if (pairType === "overpair") return "overpair";
      if (pairType === "top") return "top_pair";
      if (pairType === "middle") return "middle_pair";
      if (pairType === "bottom") return "bottom_pair";
      return "pair";
    }
    if (madeHandCategory === "trips") {
      if (tripsType === "set") return "set";
      if (tripsType === "board_trips") return "board_trips";
      return "trips";
    }
    return madeHandCategory;
  })();
  const pairSource = (() => {
    if (madeHandCategory !== "pair") return null;
    const pairOnBoard = pairRank ? (boardRankCounts.get(pairRank) || 0) > 0 : false;
    if (heroPocketPair && !pairOnBoard) return "pocket_pair";
    if (pairRank && heroCards.some((card) => card.rank === pairRank)) {
      return "one_hole_one_board";
    }
    return null;
  })();
  const showdownStrengthTier = `${showdownStrength}_showdown`;

  return {
    madeHandCategory,
    madeHandType,
    pairType,
    pairSource,
    tripsType,
    boardMadeHand,
    boardPairing: pairedBoard,
    heroImprovesBoard,
    heroContributionLevel,
    kickerStrength,
    showdownRelevance,
    showdownStrengthTier,
    boardPairKickerClass,
    effectiveHandCategory,
    showdownStrength,
    bluffCatcher,
    drawsPresent,
    drawDetails,
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
  out.review_version = "v2_street_intelligence";
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

  try {
    // Additive response field: keeps legacy contract intact while enabling timeline-style review consumers.
    out.street_intelligence = buildStreetReviewAggregate(out, handContext);
  } catch {
    // Non-fatal fallback to preserve existing review delivery path.
    out.street_intelligence = {
      hand_summary: {
        overall_score: Number.isFinite(Number(out?.overall_score)) ? Number(out.overall_score) : null,
        confidence: ["low", "medium", "high"].includes(String(out?.confidence || "").toLowerCase())
          ? String(out.confidence).toLowerCase()
          : "medium",
        headline: "Full Hand Review",
        biggest_leak: String(out?.primary_leak || "").trim() || "No major leak flagged.",
        mistakes_found: 0,
      },
      street_reviews: [],
      tags: [],
      key_mistakes: [],
    };
  }

  try {
    out.deterministic_intelligence =
      handContext?.deterministicIntelligence && typeof handContext.deterministicIntelligence === "object"
        ? handContext.deterministicIntelligence
        : buildDeterministicIntelligence({
            hand: handContext,
            validatedHandState: handContext?.validatedHandState || {},
            handStateValidation: handContext?.handStateValidation || {},
          });
  } catch {
    out.deterministic_intelligence = createEmptyDeterministicIntelligence();
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
  classifyPreflopAction,
  classifyPostflopAction,
  detectJamTree,
  detectIsolationSpot,
  detectCommitmentState,
  detectStreetAgency,
  collectStreetAiContexts,
  buildSkippedStreetReviewNode,
  fallbackStreetReview,
  normalizeStreetReviewFromModel,
  areActionAndSizingAligned,
  opponentConfidenceTier,
  buildOpponentConfidenceNarrative,
  conceptMentions,
  conceptPrerequisites,
  deriveHandClassification,
  decisionEvaluationForContext,
  compactStreetContextForPrompt,
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

function normalizeUsageBlock(usage = null) {
  if (!usage || typeof usage !== "object") return null;
  const prompt = Number(usage.prompt_tokens);
  const completion = Number(usage.completion_tokens);
  const total = Number(usage.total_tokens);
  return {
    prompt_tokens: Number.isFinite(prompt) ? Math.max(0, Math.trunc(prompt)) : 0,
    completion_tokens: Number.isFinite(completion)
      ? Math.max(0, Math.trunc(completion))
      : 0,
    total_tokens: Number.isFinite(total) ? Math.max(0, Math.trunc(total)) : 0,
  };
}

function mergeUsageBlocks(baseUsage, addonUsage) {
  const base = normalizeUsageBlock(baseUsage);
  const addon = normalizeUsageBlock(addonUsage);
  if (!base && !addon) return null;
  if (!base) return addon;
  if (!addon) return base;
  return {
    prompt_tokens: (base.prompt_tokens || 0) + (addon.prompt_tokens || 0),
    completion_tokens:
      (base.completion_tokens || 0) + (addon.completion_tokens || 0),
    total_tokens: (base.total_tokens || 0) + (addon.total_tokens || 0),
  };
}

function boardCardsForStreet(board = {}, street = "preflop") {
  const safeStreet = String(street || "").toLowerCase();
  if (safeStreet === "preflop") return [];
  const flop = Array.isArray(board?.flop) ? board.flop : [];
  const turn = typeof board?.turn === "string" ? board.turn : null;
  const river = typeof board?.river === "string" ? board.river : null;
  const cards = [...flop];
  if (safeStreet === "turn" || safeStreet === "river") {
    if (turn) cards.push(turn);
  }
  if (safeStreet === "river") {
    if (river) cards.push(river);
  }
  return cards.filter(Boolean);
}

function heroHandForClassification(validatedHandState = {}, hand = {}) {
  const fromState = Array.isArray(validatedHandState?.heroHand)
    ? validatedHandState.heroHand
    : [];
  if (fromState.length >= 2) return fromState.slice(0, 2);
  const fromHand = Array.isArray(hand?.heroCards) ? hand.heroCards : [];
  return fromHand.slice(0, 2);
}

function buildStreetClassification({
  validatedHandState = {},
  hand = {},
  street = "preflop",
  fallbackClassification = {},
} = {}) {
  const boardCards = boardCardsForStreet(hand?.board, street);
  const heroHand = heroHandForClassification(validatedHandState, hand);
  const stateForStreet = {
    ...validatedHandState,
    street,
    heroHand,
    boardCards,
  };
  const derived = deriveHandClassification(stateForStreet);
  const classification = derived && typeof derived === "object"
    ? derived
    : fallbackClassification || {};
  const compactHeroHand = compactHeroHandFromState(stateForStreet);
  const rangeCategory = categorizeRangeHand(compactHeroHand);
  const rangeTier = String(rangeCategory?.tier || "").trim().toLowerCase() || null;
  const rangeLabel = String(rangeCategory?.label || "").trim() || null;
  const safeStreet = String(street || "preflop").trim().toLowerCase();
  const isPreflop = safeStreet === "preflop";
  const flushDraw = Boolean(classification?.drawsPresent?.flushDraw);
  const straightDraw = Boolean(classification?.drawsPresent?.straightDraw);
  const premiumHolding =
    (isPreflop && isPremiumTierLabel(rangeTier)) ||
    String(classification?.pairType || "").trim().toLowerCase() === "overpair";
  return {
    made_hand_category: classification?.madeHandCategory || null,
    made_hand_type: classification?.madeHandType || null,
    effective_hand_category: classification?.effectiveHandCategory || null,
    pair_type: classification?.pairType || null,
    pair_source: classification?.pairSource || null,
    trips_type: classification?.tripsType || null,
    board_pairing:
      typeof classification?.boardPairing === "boolean" ? classification.boardPairing : null,
    showdown_strength: classification?.showdownStrength || null,
    showdown_strength_tier: classification?.showdownStrengthTier || null,
    showdown_relevance: classification?.showdownRelevance || null,
    hero_contribution_level: classification?.heroContributionLevel || null,
    board_made_hand: classification?.boardMadeHand || null,
    board_pair_kicker_class: classification?.boardPairKickerClass || null,
    kicker_strength: classification?.kickerStrength || null,
    bluff_catcher: Boolean(classification?.bluffCatcher),
    draws_present: {
      flush_draw: flushDraw,
      straight_draw: straightDraw,
      combo_draw: flushDraw && straightDraw,
      flush_draw_suit: classification?.drawDetails?.flushDrawSuit || null,
      straight_draw_type: classification?.drawDetails?.straightDrawType || null,
    },
    // Starting-hand tiers describe preflop range strength, not postflop made-hand strength.
    hand_tier: isPreflop ? rangeTier : null,
    hand_label: isPreflop ? rangeLabel : null,
    premium_holding: premiumHolding,
  };
}

function resolvedStreetOrderForHand(hand = {}) {
  const order = ["preflop", "flop", "turn", "river"];
  const foldedStreet = String(hand?.heroOutcome?.foldedStreet || "")
    .trim()
    .toLowerCase();
  if (order.includes(foldedStreet)) {
    return order.slice(0, order.indexOf(foldedStreet) + 1);
  }
  const resolvedStreet = String(hand?.heroOutcome?.resolvedStreet || "")
    .trim()
    .toLowerCase();
  if (order.includes(resolvedStreet)) {
    return order.slice(0, order.indexOf(resolvedStreet) + 1);
  }
  if (hand?.board?.river) return order;
  if (hand?.board?.turn) return order.slice(0, 3);
  if (Array.isArray(hand?.board?.flop) && hand.board.flop.length >= 3) {
    return order.slice(0, 2);
  }
  return order.slice(0, 1);
}

function toStreetAction(rawType) {
  const action = String(rawType || "")
    .trim()
    .toLowerCase();
  if (!action) return "none";
  if (action === "post_small_blind" || action === "post_big_blind") return "post blind";
  if (action === "post_ante") return "post ante";
  return action;
}

function amountToBb(amount, bb) {
  const num = Number(amount);
  const bigBlind = Number(bb);
  if (!Number.isFinite(num) || !Number.isFinite(bigBlind) || bigBlind <= 0) return null;
  return Number((num / bigBlind).toFixed(2));
}

function amountToBbLabel(amount, bb) {
  const asBb = amountToBb(amount, bb);
  return asBb === null ? null : `${asBb.toFixed(1)}bb`;
}

function sizingAmountFromAction(action = {}) {
  const type = String(action?.type || action?.action || "")
    .trim()
    .toLowerCase();
  const toAmount = Number(action?.toAmount);
  const amount = Number(action?.amount);
  const hasPositiveToAmount = Number.isFinite(toAmount) && toAmount > 0;
  const hasPositiveAmount = Number.isFinite(amount) && amount > 0;

  if (type === "raise" || type === "jam") {
    if (hasPositiveToAmount) return toAmount;
    if (hasPositiveAmount) return amount;
    return null;
  }
  if (type === "call" || type === "bet") {
    if (hasPositiveAmount) return amount;
    if (hasPositiveToAmount) return toAmount;
    return null;
  }
  if (hasPositiveAmount) return amount;
  if (hasPositiveToAmount) return toAmount;
  return null;
}

function streetScoreFromLegacy(review = {}, street = "preflop") {
  if (street === "preflop") return clampStreetScore(review?.preflop_score);
  if (street === "flop") return clampStreetScore(review?.flop_score);
  if (street === "turn") return clampStreetScore(review?.turn_score);
  if (street === "river") return clampStreetScore(review?.river_score);
  return null;
}

function semanticContribution(action = {}, priorCommitted = 0) {
  const type = String(action?.type || "").trim().toLowerCase();
  if (!type) return 0;
  if (type === "raise" || type === "jam") {
    const toAmount = Number(action?.toAmount);
    if (Number.isFinite(toAmount)) {
      const delta = toAmount - Number(priorCommitted || 0);
      return Number.isFinite(delta) && delta > 0 ? delta : 0;
    }
  }
  const amount = Number(action?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

function normalizeStreetActionRows(hand = {}) {
  const order = ["preflop", "flop", "turn", "river"];
  const rows = [];
  for (const street of order) {
    const actions = Array.isArray(hand?.actionsByStreet?.[street])
      ? hand.actionsByStreet[street]
      : [];
    actions.forEach((action, index) => {
      rows.push({
        street,
        index,
        player: String(action?.player || "").trim(),
        type: String(action?.type || "").trim().toLowerCase(),
        amount: Number(action?.amount),
        toAmount: Number(action?.toAmount),
      });
    });
  }
  return rows;
}

function detectJamTree({ hand = {}, heroName = "" } = {}) {
  const rows = normalizeStreetActionRows(hand);
  const byStreet = new Map(["preflop", "flop", "turn", "river"].map((street) => [street, []]));
  for (const row of rows) {
    if (!byStreet.has(row.street)) byStreet.set(row.street, []);
    byStreet.get(row.street).push(row);
  }
  const preflopRows = byStreet.get("preflop") || [];
  const firstJam = rows.find((row) => row.type === "jam");
  const jamStreet = firstJam?.street || null;
  const preflopJamCount = preflopRows.filter((row) => row.type === "jam").length;
  const heroPreflopActions = preflopRows.filter((row) => row.player === heroName);
  const heroJamPreflop = heroPreflopActions.some((row) => row.type === "jam");
  const heroFoldedPreflop = heroPreflopActions.some((row) => row.type === "fold");
  const allInBeforeFlop = jamStreet === "preflop" && preflopJamCount >= 2;
  const handResolvedPreflop = allInBeforeFlop && !heroFoldedPreflop;
  const postflopAgencyRemoved =
    handResolvedPreflop &&
    ["flop", "turn", "river"].every((street) => {
      const heroRows = (byStreet.get(street) || []).filter(
        (row) => row.player === heroName,
      );
      return heroRows.length === 0;
    });
  return {
    jam_street: jamStreet,
    preflop_jam_count: preflopJamCount,
    all_in_before_flop: allInBeforeFlop,
    hand_resolved_preflop: handResolvedPreflop,
    postflop_agency_removed: postflopAgencyRemoved,
  };
}

function detectCommitmentState({ hand = {}, heroName = "" } = {}) {
  const seatRows = Array.isArray(hand?.seats) ? hand.seats : [];
  const stacks = new Map();
  const knownPlayers = new Set();
  for (const seat of seatRows) {
    const player = String(seat?.player || "").trim();
    if (player) knownPlayers.add(player);
    const chips = Number(seat?.chips);
    if (!player || !Number.isFinite(chips) || chips <= 0) continue;
    stacks.set(player, chips);
  }

  const rows = normalizeStreetActionRows(hand);
  const order = ["preflop", "flop", "turn", "river"];
  const byStreet = new Map(order.map((street) => [street, []]));
  for (const row of rows) {
    if (!byStreet.has(row.street)) byStreet.set(row.street, []);
    byStreet.get(row.street).push(row);
    if (row.player) knownPlayers.add(row.player);
  }

  const foldedPlayers = new Set();
  const totalContrib = new Map();
  const committedByStreet = new Map();
  const allInPlayers = new Set();
  const streetSnapshots = {};
  let preflopAggressor = null;

  for (const street of order) {
    committedByStreet.clear();
    const streetRows = byStreet.get(street) || [];
    for (const row of streetRows) {
      const player = row.player;
      if (!player) continue;
      const priorStreetCommitted = committedByStreet.get(player) || 0;
      const contribution = semanticContribution(row, priorStreetCommitted);
      if (contribution > 0) {
        committedByStreet.set(player, priorStreetCommitted + contribution);
        totalContrib.set(player, (totalContrib.get(player) || 0) + contribution);
      }
      if (row.type === "fold") foldedPlayers.add(player);
      if (row.type === "jam") allInPlayers.add(player);
      const stack = stacks.get(player);
      const total = totalContrib.get(player) || 0;
      if (Number.isFinite(stack) && total >= stack - 0.01) {
        allInPlayers.add(player);
      }
      if (
        street === "preflop" &&
        ["raise", "bet", "jam"].includes(row.type)
      ) {
        preflopAggressor = row.player;
      }
    }

    const livePlayers = Array.from(knownPlayers.values()).filter(
      (player) => !foldedPlayers.has(player),
    );
    if (!livePlayers.length) {
      streetSnapshots[street] = {
        live_players: 0,
        all_in_players: 0,
        all_players_committed: true,
      };
      continue;
    }
    const liveAllInCount = livePlayers.filter((player) => allInPlayers.has(player)).length;
    const allPlayersCommitted =
      livePlayers.length <= 1 || liveAllInCount === livePlayers.length;
    streetSnapshots[street] = {
      live_players: livePlayers.length,
      all_in_players: liveAllInCount,
      all_players_committed: allPlayersCommitted,
    };
  }

  return {
    preflop_aggressor: preflopAggressor,
    street_snapshots: streetSnapshots,
  };
}

function detectIsolationSpot({
  heroEvent = null,
  streetEvents = [],
  heroName = "",
} = {}) {
  if (!heroEvent) return false;
  const street = String(heroEvent?.street || "").toLowerCase();
  if (street !== "preflop") return false;
  const heroIndex = streetEvents.findIndex(
    (row) =>
      row.player === heroName &&
      row.index === heroEvent.index &&
      row.type === heroEvent.type,
  );
  if (heroIndex <= 0) return false;
  const prior = streetEvents.slice(0, heroIndex);
  const priorAggressors = prior.filter((row) =>
    ["raise", "bet", "jam"].includes(row.type),
  );
  const priorCallers = prior.filter((row) => row.type === "call");
  return priorAggressors.length >= 1 && priorCallers.length >= 1;
}

function classifyPreflopAction({
  heroEvent = null,
  streetEvents = [],
  heroName = "",
  effectiveStackBb = null,
} = {}) {
  if (!heroEvent) {
    return {
      action_type: "none",
      all_in: false,
      facing_jam: false,
      facing_open: false,
      isolation_spot: false,
      multiway_all_in: false,
      effective_stack_bb: effectiveStackBb,
    };
  }
  const heroType = String(heroEvent?.type || "").toLowerCase();
  const heroIndex = streetEvents.findIndex(
    (row) =>
      row.player === heroName &&
      row.index === heroEvent.index &&
      row.type === heroEvent.type,
  );
  const prior = heroIndex >= 0 ? streetEvents.slice(0, heroIndex) : [];
  const priorAggressors = prior.filter((row) =>
    ["raise", "bet", "jam"].includes(row.type),
  );
  const priorCalls = prior.filter((row) => row.type === "call");
  const priorJam = prior.some((row) => row.type === "jam");
  const isolationSpot = detectIsolationSpot({
    heroEvent,
    streetEvents,
    heroName,
  });
  const jamCountStreet = streetEvents.filter((row) => row.type === "jam").length;
  let actionType = heroType || "none";

  if (heroType === "jam") {
    if (priorAggressors.length === 0) actionType = "open_jam";
    else if (isolationSpot) actionType = "isolation_jam";
    else actionType = "reshove";
  } else if (heroType === "raise") {
    if (priorAggressors.length === 0) actionType = "open_raise";
    else if (priorCalls.length > 0) actionType = "squeeze";
    else actionType = "3bet_or_4bet";
  } else if (heroType === "call") {
    if (priorAggressors.length > 0 && priorCalls.length > 0) actionType = "cold_call";
    else if (priorAggressors.length > 0) actionType = "flat_call";
    else actionType = "limp";
  } else if (heroType === "fold" && priorJam) {
    actionType = "fold_to_jam";
  }

  return {
    action_type: actionType,
    all_in: heroType === "jam",
    facing_jam: priorJam,
    facing_open:
      priorAggressors.length > 0 && !priorJam,
    isolation_spot: isolationSpot,
    multiway_all_in: jamCountStreet >= 2,
    effective_stack_bb: effectiveStackBb,
  };
}

function classifyPostflopAction({
  street = "",
  heroEvent = null,
  streetEvents = [],
  heroName = "",
  preflopAggressor = null,
  deterministicTags = [],
  showdownReached = false,
} = {}) {
  if (!heroEvent) {
    return {
      action_type: "none",
      all_in: false,
      facing_jam: false,
      facing_open: false,
      isolation_spot: false,
      multiway_all_in: false,
      effective_stack_bb: null,
    };
  }
  const safeStreet = String(street || "").toLowerCase();
  const heroType = String(heroEvent?.type || "").toLowerCase();
  const heroIndex = streetEvents.findIndex(
    (row) =>
      row.player === heroName &&
      row.index === heroEvent.index &&
      row.type === heroEvent.type,
  );
  const prior = heroIndex >= 0 ? streetEvents.slice(0, heroIndex) : [];
  const priorAggressive = prior.filter((row) =>
    ["bet", "raise", "jam"].includes(row.type),
  );
  const priorJam = prior.some((row) => row.type === "jam");
  const ratioToPot = Number(heroEvent?.ratio_to_pot);
  let actionType = heroType || "none";

  if (
    heroType === "bet" &&
    safeStreet === "flop" &&
    preflopAggressor &&
    preflopAggressor !== heroName &&
    priorAggressive.length === 0
  ) {
    actionType = "probe_bet";
  } else if (
    heroType === "bet" &&
    safeStreet === "turn" &&
    preflopAggressor === heroName &&
    !streetEvents.some(
      (row) =>
        row.player === heroName &&
        row.street === "flop" &&
        ["bet", "raise", "jam"].includes(row.type),
    )
  ) {
    actionType = "delayed_cbet";
  } else if (heroType === "bet" && safeStreet === "river" && Number.isFinite(ratioToPot)) {
    if (ratioToPot >= 1) actionType = "river_overbet";
    else if (ratioToPot <= 0.33) actionType = "blocker_bet";
  } else if (
    heroType === "check" &&
    safeStreet === "river" &&
    priorAggressive.length === 0 &&
    showdownReached
  ) {
    actionType = "check_back_showdown";
  } else if (
    heroType === "call" &&
    safeStreet === "river" &&
    (priorJam || deterministicTags.includes("bluff_catcher_node"))
  ) {
    actionType = "bluff_catch_call";
  }

  return {
    action_type: actionType,
    all_in: heroType === "jam",
    facing_jam: priorJam,
    facing_open: false,
    isolation_spot: false,
    multiway_all_in: false,
    effective_stack_bb: null,
  };
}

function isWeakUnpairedCbetCandidate(classification = {}) {
  const madeHandCategory = String(classification?.made_hand_category || "")
    .trim()
    .toLowerCase();
  const madeHandType = String(classification?.made_hand_type || "")
    .trim()
    .toLowerCase();
  const showdownStrength = String(classification?.showdown_strength || "")
    .trim()
    .toLowerCase();
  const highCardProfile =
    madeHandCategory === "air" ||
    madeHandType === "high_card" ||
    /_high$/.test(madeHandType);
  return highCardProfile && (showdownStrength === "none" || showdownStrength === "weak");
}

function deriveFlopCbetStrategicIntent({
  street = "",
  decisionNodeType = "",
  semanticAction = {},
  classification = {},
} = {}) {
  const safeStreet = String(street || "").toLowerCase();
  if (safeStreet !== "flop") return null;
  const nodeType = String(decisionNodeType || "").toLowerCase();
  const actionType = String(semanticAction?.action_type || "").toLowerCase();
  const isCbetDecision = nodeType === "cbet_decision";
  const isBettingLine =
    actionType === "bet" ||
    actionType === "delayed_cbet" ||
    actionType === "probe_bet";
  if (!isCbetDecision && !isBettingLine) return null;

  const madeHandCategory = String(classification?.made_hand_category || "")
    .trim()
    .toLowerCase();
  const showdownStrength = String(classification?.showdown_strength || "")
    .trim()
    .toLowerCase();

  if (isWeakUnpairedCbetCandidate(classification)) {
    return {
      cbet_intent: "bluff_cbet",
      cbet_intent_focus: [
        "fold_equity",
        "initiative",
        "equity_denial",
        "range_pressure",
        "realization_denial",
      ],
    };
  }

  if (
    ["straight", "flush", "full_house", "quads", "trips", "two_pair"].includes(
      madeHandCategory,
    ) ||
    showdownStrength === "strong"
  ) {
    return {
      cbet_intent: "value_cbet",
      cbet_intent_focus: ["value_extraction", "stack_building", "range_advantage"],
    };
  }

  if (madeHandCategory === "pair" && showdownStrength === "medium") {
    return {
      cbet_intent: "protection_cbet",
      cbet_intent_focus: ["equity_denial", "protection", "thin_value"],
    };
  }

  if (madeHandCategory === "pair" && showdownStrength === "weak") {
    return {
      cbet_intent: "thin_value_cbet",
      cbet_intent_focus: ["thin_value", "equity_denial", "range_pressure"],
    };
  }

  return {
    cbet_intent: "range_cbet",
    cbet_intent_focus: ["range_pressure", "initiative", "equity_realization"],
  };
}

function detectStreetAgency({
  street = "",
  decisionStreet = "",
  heroDecisionStreetSet = new Set(),
  commitmentState = {},
  jamTree = {},
} = {}) {
  const order = ["preflop", "flop", "turn", "river"];
  const safeStreet = String(street || "").toLowerCase();
  const idx = order.indexOf(safeStreet);
  const prevStreet = idx > 0 ? order[idx - 1] : null;
  const snapshots = commitmentState?.street_snapshots || {};
  const prevSnapshot = prevStreet ? snapshots[prevStreet] || {} : {};
  const currentSnapshot = snapshots[safeStreet] || {};
  const heroHasAgency = heroDecisionStreetSet.has(safeStreet) || safeStreet === decisionStreet;
  const allPlayersCommitted = Boolean(currentSnapshot?.all_players_committed);
  const automaticRunout =
    safeStreet !== "preflop" &&
    Boolean(prevSnapshot?.all_players_committed) &&
    !heroHasAgency;
  const handResolvedPreflop = Boolean(jamTree?.hand_resolved_preflop);
  const postflopAgencyRemoved = Boolean(jamTree?.postflop_agency_removed);
  const postflopNoAgency =
    safeStreet !== "preflop" && handResolvedPreflop && postflopAgencyRemoved;

  return {
    is_decision_street: heroHasAgency && !postflopNoAgency,
    hero_has_agency: heroHasAgency && !postflopNoAgency,
    all_players_committed: allPlayersCommitted,
    automatic_runout: automaticRunout || postflopNoAgency,
    hand_resolved_preflop: handResolvedPreflop,
    all_in_before_flop: Boolean(jamTree?.all_in_before_flop),
    postflop_agency_removed: postflopAgencyRemoved,
  };
}

function inferHeroPositionStateForStreet({
  streetEvents = [],
  heroName = "",
} = {}) {
  const firstHeroIndex = streetEvents.findIndex((row) => row.player === heroName);
  const firstVillainIndex = streetEvents.findIndex((row) => row.player !== heroName);
  if (firstHeroIndex === -1 || firstVillainIndex === -1) return "unknown";
  return firstHeroIndex < firstVillainIndex ? "out_of_position" : "in_position";
}

function deriveNodeSemantics({
  street = "",
  streetEvents = [],
  heroDecisionEvent = null,
  heroDecisionEvents = [],
  heroName = "",
  preflopAggressor = null,
  semanticAction = {},
  atDecisionStreet = false,
  validatedHandState = {},
  agency = {},
} = {}) {
  const safeStreet = String(street || "").toLowerCase();
  const heroInitialEvent =
    heroDecisionEvents.length > 0 ? heroDecisionEvents[0] : null;
  const heroInitialAction = String(heroInitialEvent?.type || "").toLowerCase() || null;
  const heroFinalAction = String(heroDecisionEvent?.type || "").toLowerCase() || null;
  const heroFinalIndex = Number.isFinite(Number(heroDecisionEvent?.index))
    ? Number(heroDecisionEvent.index)
    : -1;
  const beforeFinal =
    heroFinalIndex >= 0
      ? streetEvents.filter((row) => Number(row?.index) < heroFinalIndex)
      : streetEvents.slice();
  const facingAggressiveAtFinal = beforeFinal.some(
    (row) =>
      row.player !== heroName && ["bet", "raise", "jam"].includes(String(row?.type || "").toLowerCase()),
  );
  const facingBetAfterCheck =
    heroInitialAction === "check" && facingAggressiveAtFinal;
  const heroPositionState = inferHeroPositionStateForStreet({
    streetEvents,
    heroName,
  });

  let decisionNodeType = "street_decision";
  if (facingBetAfterCheck) {
    if (heroFinalAction === "call") decisionNodeType = "check_call_decision";
    else if (heroFinalAction === "raise" || heroFinalAction === "jam")
      decisionNodeType = "check_raise_decision";
    else if (heroFinalAction === "fold") decisionNodeType = "check_fold_decision";
    else decisionNodeType = "check_response_decision";
  } else if (
    safeStreet === "flop" &&
    preflopAggressor === heroName &&
    (heroFinalAction === "bet" || heroFinalAction === "check")
  ) {
    decisionNodeType = "cbet_decision";
  } else if (
    safeStreet === "turn" &&
    preflopAggressor === heroName &&
    (semanticAction?.action_type === "delayed_cbet" || heroFinalAction === "bet")
  ) {
    decisionNodeType = "delayed_cbet_decision";
  } else if (safeStreet === "river" && semanticAction?.action_type === "bluff_catch_call") {
    decisionNodeType = "river_bluffcatch_decision";
  } else if (safeStreet === "turn" && facingAggressiveAtFinal && preflopAggressor !== heroName) {
    decisionNodeType = "turn_probe_response";
  } else if (semanticAction?.facing_jam && ["call", "fold"].includes(heroFinalAction)) {
    decisionNodeType = "jam_call_decision";
  }

  const fromValidated = atDecisionStreet && agency?.is_decision_street
    ? (Array.isArray(validatedHandState?.legalActions) ? validatedHandState.legalActions : [])
        .map((action) => String(action || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (fromValidated.length > 0) {
    return {
      hero_position_state: heroPositionState,
      hero_initial_action: heroInitialAction,
      facing_bet_after_check: facingBetAfterCheck,
      decision_node_type: decisionNodeType,
      hero_decision_options: Array.from(new Set(fromValidated)),
    };
  }

  let options = [];
  if (facingAggressiveAtFinal) {
    options = ["call", "fold"];
    if (!agency?.all_players_committed) options.push("raise");
  } else {
    options = ["check", "bet"];
  }
  if (heroFinalAction === "raise" || heroFinalAction === "jam") {
    options = ["call", "fold", "raise"];
  }
  if (heroFinalAction === "call" && !options.includes("call")) options.push("call");
  if (heroFinalAction === "fold" && !options.includes("fold")) options.push("fold");
  if (heroFinalAction === "check" && !options.includes("check")) options.push("check");
  if (heroFinalAction === "bet" && !options.includes("bet")) options.push("bet");

  return {
    hero_position_state: heroPositionState,
    hero_initial_action: heroInitialAction,
    facing_bet_after_check: facingBetAfterCheck,
    decision_node_type: decisionNodeType,
    hero_decision_options: Array.from(new Set(options)),
  };
}

function safeActionType(value) {
  return String(value || "").trim().toLowerCase();
}

function isDecisionType(type = "") {
  return ["fold", "check", "call", "bet", "raise", "jam"].includes(
    safeActionType(type),
  );
}

function isAggressiveType(type = "") {
  return ["bet", "raise", "jam"].includes(safeActionType(type));
}

function buildActionTimeState({
  hand = {},
  street = "",
  streetEvents = [],
  heroDecisionEvent = null,
  heroName = "",
  bigBlind = null,
} = {}) {
  const safeStreet = String(street || "").toLowerCase();
  if (!heroDecisionEvent) {
    return {
      hero_action_index: null,
      hero_position: String(hand?.heroPosition || "").trim().toUpperCase() || null,
      pot_state_when_hero_acted: {
        pot_before_action_bb: null,
        current_bet_bb: null,
        hero_committed_bb: null,
        to_call_bb: null,
      },
      players_remaining: [],
      prior_actions: [],
      facing_action: null,
      is_first_in: false,
      open_opportunity: false,
      facing_open: false,
      facing_raise: false,
      decision_type: "street_decision",
    };
  }

  const heroIndex = Number.isFinite(Number(heroDecisionEvent?.index))
    ? Number(heroDecisionEvent.index)
    : -1;
  const priorEvents =
    heroIndex >= 0
      ? streetEvents.filter((row) => Number(row?.index) < heroIndex)
      : [];

  const committed = new Map();
  let potBefore = 0;
  let currentBet = 0;
  let facingAction = null;
  const priorActions = [];

  for (const row of priorEvents) {
    const player = String(row?.player || "").trim();
    if (!player) continue;
    const priorCommitted = committed.get(player) || 0;
    const contribution = semanticContribution(row, priorCommitted);
    if (contribution > 0) {
      committed.set(player, priorCommitted + contribution);
      potBefore += contribution;
    }
    if (row.type === "bet") {
      currentBet = Math.max(currentBet, contribution);
    } else if (row.type === "raise" || row.type === "jam") {
      if (Number.isFinite(Number(row?.toAmount))) {
        currentBet = Math.max(currentBet, Number(row.toAmount));
      } else if (contribution > 0) {
        currentBet = Math.max(currentBet, contribution);
      }
    }
    if (player !== heroName && isAggressiveType(row?.type)) {
      facingAction = row;
    }

    priorActions.push({
      player,
      action: safeActionType(row?.type),
      sizing_bb: amountToBb(sizingAmountFromAction(row), bigBlind),
    });
  }

  const folded = new Set();
  for (const row of priorEvents) {
    if (safeActionType(row?.type) !== "fold") continue;
    const player = String(row?.player || "").trim();
    if (player) folded.add(player);
  }
  const players = Array.isArray(hand?.seats)
    ? hand.seats
        .map((seat) => String(seat?.player || "").trim())
        .filter(Boolean)
    : [];
  const playersRemaining = players.filter((player) => !folded.has(player));

  const heroCommitted = committed.get(heroName) || 0;
  const toCall = Math.max(0, currentBet - heroCommitted);
  const potBeforeBb = amountToBb(potBefore, bigBlind);
  const currentBetBb = amountToBb(currentBet, bigBlind);
  const heroCommittedBb = amountToBb(heroCommitted, bigBlind);
  const toCallBb = amountToBb(toCall, bigBlind);
  const priorVoluntaryEntries = priorEvents.filter((row) => {
    if (String(row?.player || "").trim() === heroName) return false;
    const type = safeActionType(row?.type);
    return ["call", "bet", "raise", "jam"].includes(type);
  });
  const priorAggressive = priorEvents.filter((row) => isAggressiveType(row?.type));
  const facingOpen = priorAggressive.length > 0;
  const firstInOpportunity =
    safeStreet === "preflop" && priorVoluntaryEntries.length === 0;

  let decisionType = "street_decision";
  if (safeStreet === "preflop") {
    if (firstInOpportunity) decisionType = "open_decision";
    else if (facingOpen) decisionType = "facing_open_decision";
  } else if (facingOpen) {
    decisionType = "response_decision";
  }

  return {
    hero_action_index: heroIndex >= 0 ? heroIndex : null,
    hero_position: String(hand?.heroPosition || "").trim().toUpperCase() || null,
    pot_state_when_hero_acted: {
      pot_before_action_bb: potBeforeBb,
      current_bet_bb: currentBetBb,
      hero_committed_bb: heroCommittedBb,
      to_call_bb: toCallBb,
    },
    players_remaining: playersRemaining,
    prior_actions: priorActions,
    facing_action: facingAction
      ? {
          player: String(facingAction?.player || "").trim() || null,
          action: safeActionType(facingAction?.type),
          sizing_bb: amountToBb(sizingAmountFromAction(facingAction), bigBlind),
        }
      : null,
    is_first_in: firstInOpportunity,
    open_opportunity: safeStreet === "preflop" && firstInOpportunity,
    facing_open: facingOpen,
    facing_raise: facingOpen,
    decision_type: decisionType,
  };
}

function fallbackAuditHeuristicForStreet({
  street = "",
  heroPosition = "",
  semanticAction = {},
  stackDepthBb = null,
} = {}) {
  const safeStreet = String(street || "").toLowerCase();
  if (safeStreet !== "preflop") return null;
  const pos = String(heroPosition || "").toUpperCase();
  const actionType = String(semanticAction?.action_type || "").toLowerCase();
  const facingOpen = Boolean(semanticAction?.facing_open);
  const isBlind = pos === "BB" || pos === "SB";
  if (!facingOpen || !isBlind) return null;
  const shortStack = Number.isFinite(Number(stackDepthBb)) && Number(stackDepthBb) <= 12;
  return {
    street: "preflop",
    chart_recommendation: "mixed_continue",
    chart_confidence: shortStack ? "low" : "medium",
    spot_classification: pos === "BB" ? "bb_defend_vs_open" : "sb_defend_vs_open",
    solver_mix_estimate:
      actionType === "fold_to_jam" || actionType === "fold" ? "mixed_continue" : "likely_continue",
    population_adjustment: shortStack ? "short_stack_tighter_defend" : null,
  };
}

function collectStreetAiContexts(handContext = {}, baseReview = {}) {
  const hand = handContext?.hand || handContext || {};
  const deterministic =
    handContext?.deterministicIntelligence || handContext?.deterministic_intelligence || {};
  const validatedHandState = handContext?.validatedHandState || {};
  const decisionStreet = String(validatedHandState?.street || "")
    .trim()
    .toLowerCase();
  const streets = resolvedStreetOrderForHand(hand);
  const bigBlind = Number(hand?.blinds?.bigBlind);
  const streetSummaries = Array.isArray(deterministic?.street_summaries)
    ? deterministic.street_summaries
    : [];
  const replayAnnotations = Array.isArray(deterministic?.replay_annotations)
    ? deterministic.replay_annotations
    : [];
  const handTags = Array.isArray(deterministic?.strategic_tags)
    ? deterministic.strategic_tags
    : [];
  const mistakeCandidates = Array.isArray(deterministic?.mistake_candidates)
    ? deterministic.mistake_candidates
    : [];
  const auditByStreet = new Map(
    (Array.isArray(deterministic?.audit_alignment?.by_street)
      ? deterministic.audit_alignment.by_street
      : []
    )
      .map((row) => ({
        street: String(row?.street || "").trim().toLowerCase(),
        value: row,
      }))
      .filter((row) => ["preflop", "flop", "turn", "river"].includes(row.street))
      .map((row) => [row.street, row.value]),
  );
  const actionByStreet = hand?.heroActionsByStreet || {};
  const fallbackClassification = handContext?.handClassification || {};
  const heroName = String(hand?.heroName || "Hero").trim() || "Hero";
  const jamTree = detectJamTree({ hand, heroName });
  const commitmentState = detectCommitmentState({ hand, heroName });
  const actionRows = normalizeStreetActionRows(hand);
  const heroDecisionStreetSet = new Set();
  for (const row of actionRows) {
    if (row.player !== heroName) continue;
    if (["fold", "check", "call", "bet", "raise", "jam"].includes(row.type)) {
      heroDecisionStreetSet.add(row.street);
    }
  }

  return streets.map((street) => {
    const streetBoardCards = boardCardsForStreet(hand?.board, street);
    const streetClassification = buildStreetClassification({
      validatedHandState,
      hand,
      street,
      fallbackClassification,
    });
    const heroActions = Array.isArray(actionByStreet?.[street]) ? actionByStreet[street] : [];
    const heroLast = heroActions[heroActions.length - 1] || {};
    const streetEvents = actionRows.filter((row) => row.street === street);
    const heroDecisionEvents = streetEvents.filter(
      (row) =>
        row.player === heroName &&
        ["fold", "check", "call", "bet", "raise", "jam"].includes(row.type),
    );
    const heroDecisionEvent =
      heroDecisionEvents.length > 0
        ? heroDecisionEvents[heroDecisionEvents.length - 1]
        : null;
    const summary = streetSummaries.find((item) => item?.street === street) || {};
    const annotation = replayAnnotations.find((item) => item?.street === street) || {};
    const agency = detectStreetAgency({
      street,
      decisionStreet,
      heroDecisionStreetSet,
      commitmentState,
      jamTree,
    });
    const atDecisionStreet = street === decisionStreet;
    const actionTimeState = buildActionTimeState({
      hand,
      street,
      streetEvents,
      heroDecisionEvent,
      heroName,
      bigBlind,
    });

    const ratioToPot =
      Number.isFinite(Number(summary?.pot_end_bb)) &&
      Number.isFinite(Number(sizingAmountFromAction(heroDecisionEvent))) &&
      bigBlind > 0
        ? (() => {
            const amtBb = amountToBb(sizingAmountFromAction(heroDecisionEvent), bigBlind);
            const potBb = Number(summary?.pot_end_bb);
            if (!Number.isFinite(amtBb) || !Number.isFinite(potBb) || potBb <= 0) return null;
            return Number((amtBb / potBb).toFixed(2));
          })()
        : null;
    const heroEventForSemantic =
      heroDecisionEvent && Number.isFinite(ratioToPot)
        ? { ...heroDecisionEvent, ratio_to_pot: ratioToPot }
        : heroDecisionEvent;
    const semanticAction =
      street === "preflop"
        ? classifyPreflopAction({
            heroEvent: heroEventForSemantic,
            streetEvents,
            heroName,
            effectiveStackBb: Number.isFinite(Number(validatedHandState?.effectiveStackBB))
              ? Number(validatedHandState.effectiveStackBB)
              : null,
          })
        : classifyPostflopAction({
            street,
            heroEvent: heroEventForSemantic,
            streetEvents,
            heroName,
            preflopAggressor: commitmentState?.preflop_aggressor || null,
            deterministicTags: Array.isArray(summary?.strategic_tags)
              ? summary.strategic_tags
              : [],
            showdownReached: Boolean(hand?.hadShowdown),
          });
    const auditHeuristic =
      auditByStreet.get(street) ||
      fallbackAuditHeuristicForStreet({
        street,
        heroPosition: hand?.heroPosition,
        semanticAction,
        stackDepthBb: validatedHandState?.effectiveStackBB,
      });
    const nodeSemantics = deriveNodeSemantics({
      street,
      streetEvents,
      heroDecisionEvent: heroEventForSemantic,
      heroDecisionEvents,
      heroName,
      preflopAggressor: commitmentState?.preflop_aggressor || null,
      semanticAction,
      atDecisionStreet,
      validatedHandState,
      agency,
    });
    const flopCbetIntent = deriveFlopCbetStrategicIntent({
      street,
      decisionNodeType: nodeSemantics?.decision_node_type,
      semanticAction,
      classification: streetClassification,
    });
    const semanticActionWithIntent =
      flopCbetIntent && typeof flopCbetIntent === "object"
        ? {
            ...semanticAction,
            ...flopCbetIntent,
          }
        : semanticAction;
    const legalActions = agency.is_decision_street
      ? (Array.isArray(nodeSemantics?.hero_decision_options)
          ? nodeSemantics.hero_decision_options
          : []
        )
          .map((action) => String(action || "").trim().toLowerCase())
          .filter(Boolean)
      : [];

    return {
      hand_id: String(hand?.handId || hand?.handKey || "").trim() || null,
      street,
      is_decision_street: agency.is_decision_street,
      hero_has_agency: agency.hero_has_agency,
      all_players_committed: agency.all_players_committed,
      automatic_runout: agency.automatic_runout,
      hand_semantics: {
        hand_resolved_preflop: agency.hand_resolved_preflop,
        all_in_before_flop: agency.all_in_before_flop,
        postflop_agency_removed: agency.postflop_agency_removed,
      },
      stack_depth_bb: Number.isFinite(Number(validatedHandState?.effectiveStackBB))
        ? Number(validatedHandState.effectiveStackBB)
        : null,
      board_cards: streetBoardCards,
      legal_actions: legalActions,
      hero_position_state: nodeSemantics.hero_position_state,
      hero_initial_action: nodeSemantics.hero_initial_action,
      facing_bet_after_check: nodeSemantics.facing_bet_after_check,
      decision_node_type: nodeSemantics.decision_node_type,
      hero_decision_options: nodeSemantics.hero_decision_options,
      action_time_state: actionTimeState,
      decision_type: actionTimeState.decision_type,
      facing_open: actionTimeState.facing_open,
      facing_raise: actionTimeState.facing_raise,
      first_in_opportunity: actionTimeState.open_opportunity,
      action_taken: {
        action: toStreetAction(heroLast?.type),
        sizing: amountToBbLabel(sizingAmountFromAction(heroLast), bigBlind),
      },
      metrics: {
        pot_size_bb: atDecisionStreet
          ? amountToBb(validatedHandState?.potSize, bigBlind)
          : Number.isFinite(Number(summary?.pot_end_bb))
            ? Number(summary.pot_end_bb)
            : null,
        spr: atDecisionStreet
          ? Number.isFinite(Number(validatedHandState?.math?.spr))
            ? Number(validatedHandState.math.spr)
            : null
          : null,
        facing_size_bb: atDecisionStreet
          ? amountToBb(validatedHandState?.facingBet, bigBlind)
          : null,
        pot_odds:
          atDecisionStreet && Number.isFinite(Number(validatedHandState?.math?.callAmount))
            ? (() => {
                const callAmount = Number(validatedHandState.math.callAmount);
                const finalPotIfCall = Number(validatedHandState?.math?.finalPotIfCall);
                if (!Number.isFinite(callAmount) || !Number.isFinite(finalPotIfCall) || finalPotIfCall <= 0) {
                  return null;
                }
                return `${Math.round((callAmount / finalPotIfCall) * 100)}%`;
              })()
            : null,
      },
      semantic_action: semanticActionWithIntent,
      audit_heuristics: auditHeuristic || null,
      deterministic: {
        pressure_level: String(annotation?.pressure_level || summary?.pressure_level || "low"),
        commitment_level: String(
          annotation?.commitment_level || summary?.commitment_level || "low",
        ),
        aggression_shift: Number.isFinite(Number(annotation?.aggression_shift))
          ? Number(annotation.aggression_shift)
          : Number.isFinite(Number(summary?.aggression_shift))
            ? Number(summary.aggression_shift)
            : 0,
        spr_tier: String(summary?.spr_tier || "unknown"),
        street_tags: Array.isArray(summary?.strategic_tags) ? summary.strategic_tags : [],
        hand_tags: handTags,
        relevant_mistake_candidates: mistakeCandidates.filter(
          (item) => String(item?.street || "").toLowerCase() === street,
        ),
        audit_heuristics: auditHeuristic || null,
      },
      classification: {
        ...streetClassification,
      },
      seed_score: streetScoreFromLegacy(baseReview, street),
      seed_confidence:
        ["low", "medium", "high"].includes(String(baseReview?.confidence || "").toLowerCase())
          ? String(baseReview.confidence).toLowerCase()
          : "medium",
      seed_takeaway:
        Number(streetScoreFromLegacy(baseReview, street)) <= -1
          ? String(baseReview?.primary_leak || "").trim()
          : String(baseReview?.what_was_good || "").trim(),
    };
  });
}

function sanitizePreferredAction(preferredAction = {}, legalActions = []) {
  const actionRaw = String(preferredAction?.action || "")
    .trim()
    .toLowerCase();
  const legal = (Array.isArray(legalActions) ? legalActions : [])
    .map((action) => String(action || "").trim().toLowerCase())
    .filter(Boolean);
  if (!legal.length) {
    return {
      action: actionRaw || "check",
      sizing: String(preferredAction?.sizing || "").trim() || null,
    };
  }
  if (legal.includes(actionRaw)) {
    return {
      action: actionRaw,
      sizing: String(preferredAction?.sizing || "").trim() || null,
    };
  }
  const fallbackAction = legal.includes("check")
    ? "check"
    : legal.includes("call")
      ? "call"
      : legal[0];
  return {
    action: fallbackAction || "check",
    sizing: null,
  };
}

function canonicalizeActionLabel(action = "") {
  const value = String(action || "")
    .trim()
    .toLowerCase();
  if (!value) return "unknown";
  if (["raise", "open_raise", "squeeze", "3bet_or_4bet", "3-bet", "4-bet"].includes(value)) {
    return "raise";
  }
  if (["jam", "open_jam", "reshove", "isolation_jam"].includes(value)) {
    return "jam";
  }
  if (["call", "flat_call", "cold_call", "bluff_catch_call"].includes(value)) {
    return "call";
  }
  if (["bet", "probe_bet", "delayed_cbet", "river_overbet", "blocker_bet"].includes(value)) {
    return "bet";
  }
  if (["check", "check_back_showdown"].includes(value)) {
    return "check";
  }
  if (["fold", "fold_to_jam"].includes(value)) {
    return "fold";
  }
  return value;
}

function parseBbSizing(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text.includes("bb")) return null;
  const match = text.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function areActionAndSizingAligned({
  actionTaken = {},
  preferredAction = {},
} = {}) {
  const takenAction = canonicalizeActionLabel(actionTaken?.action);
  const preferred = canonicalizeActionLabel(preferredAction?.action);
  if (!takenAction || !preferred || takenAction === "unknown" || preferred === "unknown") {
    return false;
  }
  if (takenAction !== preferred) return false;

  const takenSizing = parseBbSizing(actionTaken?.sizing ?? actionTaken?.size);
  const preferredSizing = parseBbSizing(preferredAction?.sizing ?? preferredAction?.size);
  if (takenSizing === null || preferredSizing === null) return true;
  return Math.abs(takenSizing - preferredSizing) <= 0.25;
}

function constrainStreetAnalysisText(street, analysis = {}) {
  const out = {
    insight: String(analysis?.insight || "").trim(),
    range_context: String(analysis?.range_context || "").trim(),
    board_texture: String(analysis?.board_texture || "").trim(),
    sizing_commentary: String(analysis?.sizing_commentary || "").trim(),
    plan_commentary: String(analysis?.plan_commentary || "").trim(),
    takeaway: String(analysis?.takeaway || "").trim(),
  };
  const safeStreet = String(street || "").toLowerCase();
  const trimTo = (value, max) => {
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
  };
  for (const key of Object.keys(out)) {
    out[key] = trimTo(out[key], 240);
  }
  if (safeStreet === "preflop") {
    for (const key of ["insight", "range_context", "plan_commentary", "takeaway"]) {
      out[key] = out[key].replace(/\b(flop|turn|river)\b/gi, "postflop");
    }
  }
  return out;
}

function chartQualifiedContinueSpot(auditHeuristics = {}) {
  const recommendation = String(auditHeuristics?.chart_recommendation || "")
    .trim()
    .toLowerCase();
  return ["defend", "likely_continue", "mixed_continue"].includes(recommendation);
}

function hasExplicitExploitDriver(text = "") {
  return /\b(exploit|population|icm|stack depth|effective stack|short stack|payout|extreme sizing|overbluff|underbluff|pool|field tendency)\b/i.test(
    String(text || ""),
  );
}

function softenMandatoryFoldLanguage(text = "") {
  let value = String(text || "");
  value = value.replace(/\bmandatory fold\b/gi, "mixed-frequency continue can be reasonable");
  value = value.replace(/\bobvious fold\b/gi, "often a close continue/fold mix");
  value = value.replace(/\bstandard fold\b/gi, "population-dependent continue/fold mix");
  value = value.replace(/\bmust fold\b/gi, "can fold, but continuing can be defensible");
  value = value.replace(/\balways fold\b/gi, "often folds in tighter pools");
  return value;
}

function alignStreetNodeWithActionTimeState(node = {}, streetContext = {}) {
  const state = streetContext?.action_time_state || null;
  if (!state || !state.open_opportunity) return node;
  const fix = (value) =>
    String(value || "")
      .replace(/\bfacing (?:a )?(?:raise|open|3-?bet|jam)\b/gi, "in an unopened pot")
      .replace(/\bversus (?:a )?(?:raise|open|3-?bet|jam)\b/gi, "in an unopened pot")
      .replace(/\bafter facing pressure\b/gi, "from first-in opportunity");
  return {
    ...node,
    analysis: {
      insight: fix(node?.analysis?.insight),
      range_context: fix(node?.analysis?.range_context),
      board_texture: node?.analysis?.board_texture,
      sizing_commentary: fix(node?.analysis?.sizing_commentary),
      plan_commentary: fix(node?.analysis?.plan_commentary),
      takeaway: fix(node?.analysis?.takeaway),
    },
  };
}

function alignStreetNodeWithAuditHeuristics(node = {}, streetContext = {}) {
  const auditHeuristics =
    streetContext?.audit_heuristics ||
    streetContext?.deterministic?.audit_heuristics ||
    null;
  if (!auditHeuristics || !chartQualifiedContinueSpot(auditHeuristics)) return node;

  const legal = (Array.isArray(streetContext?.legal_actions) ? streetContext.legal_actions : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const analysis = node?.analysis || {};
  const combined = [
    analysis.insight,
    analysis.range_context,
    analysis.board_texture,
    analysis.sizing_commentary,
    analysis.plan_commentary,
    analysis.takeaway,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
  if (hasExplicitExploitDriver(combined)) {
    return {
      ...node,
      audit_heuristics: auditHeuristics,
    };
  }

  const takenAction = canonicalizeActionLabel(node?.action_taken?.action || "");
  const preferredAction = canonicalizeActionLabel(node?.preferred_action?.action || "");
  const canContinue = legal.includes("call") || legal.includes("raise");
  const shouldBlockFoldRecommendation =
    canContinue &&
    preferredAction === "fold" &&
    takenAction !== "fold";
  const adjustedPreferredAction = shouldBlockFoldRecommendation
    ? {
        ...node.preferred_action,
        action:
          legal.includes("call") && takenAction !== "raise" && takenAction !== "jam"
            ? "call"
            : takenAction === "call" || takenAction === "raise" || takenAction === "jam"
              ? takenAction
              : legal.includes("call")
                ? "call"
                : legal.includes("raise")
                  ? "raise"
                  : node.preferred_action?.action || "call",
        sizing:
          shouldBlockFoldRecommendation &&
          (takenAction === "raise" || takenAction === "jam")
            ? node?.action_taken?.sizing ?? null
            : node?.preferred_action?.sizing ?? null,
      }
    : node.preferred_action;
  const adjustedScore =
    Number.isFinite(Number(node?.score)) &&
    Number(node.score) <= -1 &&
    shouldBlockFoldRecommendation
      ? 0
      : node?.score;

  const adjustedAnalysis = {
    insight: softenMandatoryFoldLanguage(analysis.insight),
    range_context: softenMandatoryFoldLanguage(analysis.range_context),
    board_texture: analysis.board_texture,
    sizing_commentary: softenMandatoryFoldLanguage(analysis.sizing_commentary),
    plan_commentary: softenMandatoryFoldLanguage(analysis.plan_commentary),
    takeaway: softenMandatoryFoldLanguage(analysis.takeaway),
  };

  const mergedTags = Array.from(
    new Set([
      ...(Array.isArray(node?.strategic_tags) ? node.strategic_tags : []),
      "chart_aligned_continue",
    ]),
  );

  return {
    ...node,
    score: adjustedScore,
    preferred_action: adjustedPreferredAction,
    analysis: adjustedAnalysis,
    strategic_tags: mergedTags,
    tags: mergedTags,
    audit_heuristics: auditHeuristics,
  };
}

function alignStreetNodeWithOpenQualification(node = {}, streetContext = {}) {
  const safeStreet = String(streetContext?.street || node?.street || "")
    .trim()
    .toLowerCase();
  if (safeStreet !== "preflop") return node;

  const decisionType = String(
    streetContext?.decision_type || streetContext?.action_time_state?.decision_type || "",
  )
    .trim()
    .toLowerCase();
  const openOpportunity = Boolean(
    streetContext?.first_in_opportunity ||
      streetContext?.action_time_state?.open_opportunity ||
      decisionType === "open_decision",
  );
  if (!openOpportunity) return node;

  const auditHeuristics =
    streetContext?.audit_heuristics ||
    streetContext?.deterministic?.audit_heuristics ||
    null;
  const chartRecommendation = String(auditHeuristics?.chart_recommendation || "")
    .trim()
    .toLowerCase();
  const solverMix = String(auditHeuristics?.solver_mix_estimate || "")
    .trim()
    .toLowerCase();
  const takenAction = canonicalizeActionLabel(streetContext?.action_taken?.action || "");
  const preferredAction = canonicalizeActionLabel(node?.preferred_action?.action || "");
  const noOpenSupport =
    chartRecommendation === "fold" ||
    (chartRecommendation !== "open" &&
      !solverMix.includes("likely_open") &&
      !solverMix.includes("mixed_open"));
  const shouldNormalizeFold =
    takenAction === "fold" &&
    ["raise", "jam", "bet", "open_raise", "open_jam"].includes(preferredAction) &&
    noOpenSupport;
  if (!shouldNormalizeFold) return node;

  const soften = (text = "") =>
    String(text || "")
      .replace(/\bopening is generally preferred\b/gi, "Folding is standard from this position with this hand class")
      .replace(/\bavoid folding too frequently in first-?in spots\b/gi, "Keep early-position opening ranges disciplined")
      .replace(/\btoo tight\b/gi, "appropriately disciplined")
      .replace(/\bmiss(?:ed|es)\s+aggression\b/gi, "disciplined fold")
      .replace(/\bmust open\b/gi, "can usually fold")
      .replace(/\bmandatory open\b/gi, "often a fold")
      .replace(/\bclear open\b/gi, "close spot")
      .replace(/\buse a standard\s+\d+(?:\.\d+)?bb open\b/gi, "No opening size is required when folding is preferred")
      .replace(/\btake the initiative with a wider opening range\b/gi, "Preserve chips and keep early-position opens disciplined")
      .trim();

  const defaultInsight =
    "Folding weak offsuit holdings from early or middle position is standard.";
  const defaultRangeContext =
    "This hand lacks the playability and blocker profile typically needed for a first-in open from tighter seats.";
  const defaultTakeaway =
    "Disciplined preflop folds in early-position open spots are often correct.";

  const adjustedConfidence =
    chartRecommendation === "fold"
      ? "medium"
      : ["low", "medium", "high"].includes(String(node?.confidence || "").toLowerCase())
        ? "low"
        : "low";

  return {
    ...node,
    score:
      Number.isFinite(Number(node?.score)) && Number(node.score) < 0
        ? 0
        : node?.score,
    preferred_action: {
      ...node?.preferred_action,
      action: "fold",
      sizing: null,
      size: null,
    },
    confidence: adjustedConfidence,
    analysis: {
      insight: soften(node?.analysis?.insight) || defaultInsight,
      range_context: soften(node?.analysis?.range_context) || defaultRangeContext,
      board_texture: node?.analysis?.board_texture,
      sizing_commentary:
        soften(node?.analysis?.sizing_commentary) ||
        "No opening size is required when the disciplined action is to fold.",
      plan_commentary:
        soften(node?.analysis?.plan_commentary) ||
        "Preserve chips and focus opens on stronger early-position candidates.",
      takeaway: soften(node?.analysis?.takeaway) || defaultTakeaway,
    },
    strategic_tags: Array.from(
      new Set([...(Array.isArray(node?.strategic_tags) ? node.strategic_tags : []), "disciplined_preflop_fold"]),
    ),
    tags: Array.from(
      new Set([...(Array.isArray(node?.tags) ? node.tags : []), "disciplined_preflop_fold"]),
    ),
  };
}

function rewriteBluffCbetLanguage(text = "") {
  let value = String(text || "");
  value = value.replace(/\bfold(?:ing)? out better hands?\b/gi, "folding out weaker unpaired hands");
  value = value.replace(/\bvalue[-\s]?protection\b/gi, "equity denial");
  value = value.replace(/\bprotection bet(?:ting)?\b/gi, "equity-denial betting");
  value = value.replace(/\bbet(?:ting)? for value\b/gi, "betting to leverage initiative and fold equity");
  value = value.replace(/\bvalue bet(?:ting)?\b/gi, "pressure betting");
  value = value.replace(/\bvalue extraction\b/gi, "fold equity and realization denial");
  value = value.replace(/\bextract value from worse(?: hands?)?\b/gi, "pressure weaker continuing ranges");
  value = value.replace(/\bfolding better hands\b/gi, "folding out weaker hands");
  return value;
}

function alignStreetNodeWithCbetIntent(node = {}, streetContext = {}) {
  const safeStreet = String(streetContext?.street || node?.street || "")
    .trim()
    .toLowerCase();
  if (safeStreet !== "flop") return node;
  const intent = String(streetContext?.semantic_action?.cbet_intent || "")
    .trim()
    .toLowerCase();
  if (!intent) return node;

  const analysis = node?.analysis || {};
  const genericFix = (value) =>
    String(value || "").replace(
      /\bfold(?:ing)? out better hands?\b/gi,
      "folding out weaker unpaired hands",
    );

  const fix =
    intent === "bluff_cbet"
      ? rewriteBluffCbetLanguage
      : genericFix;

  const adjustedAnalysis = {
    insight: fix(analysis.insight),
    range_context: fix(analysis.range_context),
    board_texture: analysis.board_texture,
    sizing_commentary: fix(analysis.sizing_commentary),
    plan_commentary: fix(analysis.plan_commentary),
    takeaway: fix(analysis.takeaway),
  };

  return {
    ...node,
    analysis: adjustedAnalysis,
    cbet_intent: intent,
  };
}

function isPremiumStreetHolding(streetContext = {}, node = {}) {
  const classification =
    (streetContext?.classification && typeof streetContext.classification === "object"
      ? streetContext.classification
      : null) ||
    (node?.classification && typeof node.classification === "object"
      ? node.classification
      : null) ||
    {};
  const tier = String(classification?.hand_tier || "").trim().toLowerCase();
  const premiumFlag = Boolean(classification?.premium_holding);
  const pairType = String(classification?.pair_type || "").trim().toLowerCase();
  const madeHandType = String(classification?.made_hand_type || "").trim().toLowerCase();
  return (
    premiumFlag ||
    tier === "premium" ||
    pairType === "overpair" ||
    madeHandType === "overpair"
  );
}

function choosePremiumContinueAction(legalActions = [], fallbackAction = "call") {
  const legal = (Array.isArray(legalActions) ? legalActions : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  if (legal.includes("call")) return "call";
  if (legal.includes("raise")) return "raise";
  if (legal.includes("jam")) return "jam";
  return fallbackAction;
}

function rewritePremiumMisclassificationLanguage(text = "") {
  let value = String(text || "");
  value = value.replace(/\bweak pair\b/gi, "premium pair");
  value = value.replace(/\bmarginal hand\b/gi, "premium value hand");
  value = value.replace(/\bmarginal holding\b/gi, "premium holding");
  value = value.replace(/\bspeculative holding\b/gi, "premium holding");
  value = value.replace(/\bweak showdown value\b/gi, "strong showdown value");
  value = value.replace(/\blow showdown value\b/gi, "strong showdown value");
  value = value.replace(/\bpoor showdown value\b/gi, "strong showdown value");
  value = value.replace(/\bfolding is preferred\b/gi, "continuing is generally preferred");
  value = value.replace(/\bfold(?:ing)?(?:\s+here)?\s+to preserve stack\b/gi, "continue and realize premium equity");
  value = value.replace(/\bpreserve stack\b/gi, "preserve value while continuing");
  value = value.replace(/\bstack preservation\b/gi, "value-preserving continuation");
  return value;
}

function hasPremiumOverrideExceptionFromText(text = "") {
  return /\b(icm|bubble|satellite|payout|ladder|explicit exploit|population (?:read|tendency)|pool tendency|nit(?:ty)? range|underbluff|overbluff|extreme multiway|multiway all-?in)\b/i.test(
    String(text || ""),
  );
}

function hasPremiumOverrideExceptionFromContext(streetContext = {}) {
  const audit = streetContext?.audit_heuristics || streetContext?.deterministic?.audit_heuristics || {};
  const tags = Array.isArray(streetContext?.deterministic?.street_tags)
    ? streetContext.deterministic.street_tags.map((item) => String(item || "").trim().toLowerCase())
    : [];
  const actionTime = streetContext?.action_time_state || {};
  const semanticAction = streetContext?.semantic_action || {};
  const stackDepthBb = Number(streetContext?.stack_depth_bb);
  const playersRemaining = Array.isArray(actionTime?.players_remaining)
    ? actionTime.players_remaining.filter(Boolean).length
    : 0;
  const populationAdjustment = String(audit?.population_adjustment || "").trim();
  const hasIcmTag = tags.some((tag) => tag.includes("icm"));
  const hasExtremeMultiwayTag = tags.some(
    (tag) => tag.includes("extreme_multiway") || tag.includes("multiway_all_in"),
  );
  const multiwayJamPressure =
    Boolean(semanticAction?.facing_jam) &&
    (Boolean(semanticAction?.multiway_all_in) || playersRemaining >= 3);
  const unusualStackConstraint =
    Number.isFinite(stackDepthBb) && stackDepthBb <= 5 && Boolean(semanticAction?.facing_jam);
  return (
    hasIcmTag ||
    hasExtremeMultiwayTag ||
    multiwayJamPressure ||
    unusualStackConstraint ||
    Boolean(populationAdjustment)
  );
}

function alignStreetNodeWithPremiumHandSemantics(node = {}, streetContext = {}) {
  if (!isPremiumStreetHolding(streetContext, node)) return node;
  const legal = (Array.isArray(streetContext?.legal_actions) ? streetContext.legal_actions : [])
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  const analysis = node?.analysis || {};
  const mergedText = [
    analysis.insight,
    analysis.range_context,
    analysis.board_texture,
    analysis.sizing_commentary,
    analysis.plan_commentary,
    analysis.takeaway,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
  const hasExplicitException =
    hasPremiumOverrideExceptionFromText(mergedText) ||
    hasPremiumOverrideExceptionFromContext(streetContext);
  const rewrittenAnalysis = {
    insight: rewritePremiumMisclassificationLanguage(analysis.insight),
    range_context: rewritePremiumMisclassificationLanguage(analysis.range_context),
    board_texture: analysis.board_texture,
    sizing_commentary: rewritePremiumMisclassificationLanguage(analysis.sizing_commentary),
    plan_commentary: rewritePremiumMisclassificationLanguage(analysis.plan_commentary),
    takeaway: rewritePremiumMisclassificationLanguage(analysis.takeaway),
  };
  const preferredAction = canonicalizeActionLabel(node?.preferred_action?.action || "");
  const takenAction = canonicalizeActionLabel(node?.action_taken?.action || "");
  const canContinue = legal.includes("call") || legal.includes("raise") || legal.includes("jam");
  const shouldOverrideFold = !hasExplicitException && canContinue && preferredAction === "fold";
  const adjustedPreferredAction = shouldOverrideFold
    ? {
        ...node.preferred_action,
        action: choosePremiumContinueAction(legal, takenAction || "call"),
        sizing:
          takenAction === "raise" || takenAction === "jam"
            ? node?.action_taken?.sizing ?? null
            : node?.preferred_action?.sizing ?? null,
      }
    : node.preferred_action;
  const adjustedScore =
    shouldOverrideFold && Number.isFinite(Number(node?.score)) && Number(node.score) < 0
      ? 0
      : node?.score;
  const adjustedConfidence =
    shouldOverrideFold && String(node?.confidence || "").trim().toLowerCase() === "high"
      ? "medium"
      : node?.confidence;
  const mergedTags = Array.from(
    new Set([...(Array.isArray(node?.strategic_tags) ? node.strategic_tags : []), "premium_hand"]),
  );
  return {
    ...node,
    score: adjustedScore,
    confidence: adjustedConfidence,
    preferred_action: adjustedPreferredAction,
    analysis: rewrittenAnalysis,
    strategic_tags: mergedTags,
    tags: mergedTags,
  };
}

function drawDescriptionFromClassification(classification = {}) {
  const draws =
    classification?.draws_present && typeof classification.draws_present === "object"
      ? classification.draws_present
      : {};
  const parts = [];
  if (draws.flush_draw) {
    const suit = String(draws.flush_draw_suit || "").trim().toLowerCase();
    parts.push(`${suit ? `${suit} ` : ""}flush draw`);
  }
  if (draws.straight_draw) {
    const type = String(draws.straight_draw_type || "").trim().toLowerCase();
    if (type === "gutshot") parts.push("gutshot straight draw");
    else if (type === "open_ended") parts.push("open-ended straight draw");
    else parts.push("straight draw");
  }
  if (!parts.length) return null;
  if (parts.length === 1) return `a ${parts[0]}`;
  return `a ${parts[0]} and a ${parts[1]}`;
}

function rewriteDrawMisclassificationLanguage(text = "", drawDescription = "", highCard = false) {
  let value = String(text || "");
  if (drawDescription) {
    value = value.replace(
      /\bwithout (?:a |an )?(?:clearly defined |clearly identifiable |clear |defined |meaningful )?(?:strong )?draw\b/gi,
      `with ${drawDescription}`,
    );
    value = value.replace(
      /\black(?:s|ing|ed)? (?:a |an )?(?:clearly defined |clear |meaningful |strong )?draw\b/gi,
      `has ${drawDescription}`,
    );
  }
  if (highCard) {
    value = value.replace(/\bstrong showdown value\b/gi, "draw equity");
    value = value.replace(/\bpremium classification\b/gi, "preflop strength");
    value = value.replace(/\bpremium status\b/gi, "preflop strength");
  }
  return value;
}

function alignStreetNodeWithDrawSemantics(node = {}, streetContext = {}) {
  const classification =
    (streetContext?.classification && typeof streetContext.classification === "object"
      ? streetContext.classification
      : null) ||
    (node?.classification && typeof node.classification === "object"
      ? node.classification
      : null) ||
    {};
  const drawDescription = drawDescriptionFromClassification(classification);
  const safeStreet = String(streetContext?.street || node?.street || "")
    .trim()
    .toLowerCase();
  const postflop = ["flop", "turn", "river"].includes(safeStreet);
  const premiumHolding = Boolean(classification?.premium_holding);
  const removeStalePremiumTag = postflop && !premiumHolding;
  const filterTags = (tags = []) =>
    (Array.isArray(tags) ? tags : []).filter(
      (tag) =>
        !removeStalePremiumTag ||
        String(tag || "").trim().toLowerCase() !== "premium_hand",
    );

  if (!drawDescription) {
    const strategicTags = filterTags(node?.strategic_tags);
    const tags = filterTags(node?.tags);
    return {
      ...node,
      strategic_tags: strategicTags,
      tags,
    };
  }

  const madeCategory = String(classification?.made_hand_category || "")
    .trim()
    .toLowerCase();
  const madeType = String(classification?.made_hand_type || "")
    .trim()
    .toLowerCase();
  const highCard = madeCategory === "air" || madeType.endsWith("_high");
  const analysis = node?.analysis || {};
  const originalText = Object.values(analysis)
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  const hadShowdownContradiction =
    highCard && /\bstrong showdown value\b/i.test(originalText);
  const rewrite = (text) =>
    rewriteDrawMisclassificationLanguage(text, drawDescription, highCard);
  const rewrittenAnalysis = {
    insight: rewrite(analysis.insight),
    range_context: rewrite(analysis.range_context),
    board_texture: rewrite(analysis.board_texture),
    sizing_commentary: rewrite(analysis.sizing_commentary),
    plan_commentary: rewrite(analysis.plan_commentary),
    takeaway: rewrite(analysis.takeaway),
  };
  const rewrittenText = Object.values(rewrittenAnalysis).join(" ");
  const explicitlyNamesDraw =
    /\b(flush draw|straight draw|gutshot|open-ended|combo draw)\b/i.test(rewrittenText);
  if (hadShowdownContradiction) {
    const madeLabel = madeType ? madeType.replace(/_/g, "-") : "High-card";
    rewrittenAnalysis.insight = `${madeLabel} has ${drawDescription}; this is draw equity rather than made-hand showdown value.`;
  } else if (!explicitlyNamesDraw) {
    const existing = String(rewrittenAnalysis.insight || "").trim();
    rewrittenAnalysis.insight = `${existing}${existing ? " " : ""}Hero also has ${drawDescription}.`;
  }

  const drawTags = [
    classification?.draws_present?.combo_draw
      ? "combo_draw"
      : classification?.draws_present?.flush_draw
        ? "flush_draw"
        : null,
    classification?.draws_present?.straight_draw_type === "gutshot"
      ? "straight_draw_gutshot"
      : classification?.draws_present?.straight_draw_type === "open_ended"
        ? "straight_draw_open"
        : classification?.draws_present?.straight_draw
          ? "straight_draw"
          : null,
  ].filter(Boolean);
  const strategicTags = Array.from(
    new Set([...drawTags, ...filterTags(node?.strategic_tags)]),
  ).slice(0, 10);
  const tags = Array.from(
    new Set([...drawTags, ...filterTags(node?.tags)]),
  ).slice(0, 10);

  return {
    ...node,
    analysis: constrainStreetAnalysisText(safeStreet, rewrittenAnalysis),
    strategic_tags: strategicTags,
    tags,
  };
}

function normalizeStreetReviewFromModel(parsed, streetContext = {}) {
  const score = clampStreetScore(parsed?.score) ?? streetContext?.seed_score ?? 0;
  const confidence = ["low", "medium", "high"].includes(
    String(parsed?.confidence || "").toLowerCase(),
  )
    ? String(parsed.confidence).toLowerCase()
    : streetContext?.seed_confidence || "medium";
  const legalActions = Array.isArray(streetContext?.legal_actions)
    ? streetContext.legal_actions
    : [];
  const preferredAction = sanitizePreferredAction(parsed?.preferred_action, legalActions);
  const tags = Array.isArray(parsed?.strategic_tags)
    ? parsed.strategic_tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const mergedTags = Array.from(
    new Set([
      ...tags,
      ...(Array.isArray(streetContext?.deterministic?.street_tags)
        ? streetContext.deterministic.street_tags
        : []),
    ]),
  ).slice(0, 10);
  const actionSizingAligned = areActionAndSizingAligned({
    actionTaken: streetContext?.action_taken || {},
    preferredAction,
  });
  const normalizedScore =
    actionSizingAligned && Number.isFinite(Number(score)) && Number(score) < 0 ? 0 : score;
  const baseNode = {
    street: streetContext?.street,
    skipped: false,
    skipped_reason: null,
    summary: null,
    score: normalizedScore,
    decision_type:
      String(
        streetContext?.decision_type || streetContext?.action_time_state?.decision_type || "",
      ).trim() || null,
    first_in_opportunity: Boolean(
      streetContext?.first_in_opportunity ||
        streetContext?.action_time_state?.open_opportunity,
    ),
    facing_open: Boolean(
      streetContext?.facing_open || streetContext?.action_time_state?.facing_open,
    ),
    facing_raise: Boolean(
      streetContext?.facing_raise || streetContext?.action_time_state?.facing_raise,
    ),
    action_time_state:
      streetContext?.action_time_state && typeof streetContext.action_time_state === "object"
        ? streetContext.action_time_state
        : null,
    action_taken: {
      action: String(streetContext?.action_taken?.action || "none").trim() || "none",
      sizing:
        streetContext?.action_taken?.sizing ??
        null,
      size:
        streetContext?.action_taken?.sizing ??
        null,
    },
    preferred_action: {
      action: preferredAction.action,
      sizing: preferredAction.sizing,
      size: preferredAction.sizing,
    },
    metrics: {
      pot_size_bb: Number.isFinite(Number(streetContext?.metrics?.pot_size_bb))
        ? Number(streetContext.metrics.pot_size_bb)
        : null,
      spr: Number.isFinite(Number(streetContext?.metrics?.spr))
        ? Number(streetContext.metrics.spr)
        : null,
      facing_size_bb: Number.isFinite(Number(streetContext?.metrics?.facing_size_bb))
        ? Number(streetContext.metrics.facing_size_bb)
        : null,
      pot_odds:
        typeof streetContext?.metrics?.pot_odds === "string"
          ? streetContext.metrics.pot_odds
          : null,
    },
    analysis: constrainStreetAnalysisText(
      streetContext?.street,
      parsed?.analysis || {
        insight: streetContext?.seed_takeaway || "No major finding for this street.",
        range_context: "Range interaction remains close in this node.",
        board_texture:
          streetContext?.board_cards && streetContext.board_cards.length
            ? streetContext.board_cards.join(" ")
            : "No board cards.",
        sizing_commentary: "Sizing should align with pressure and commitment context.",
        plan_commentary: "Favor the line that preserves flexibility against pressure shifts.",
        takeaway: streetContext?.seed_takeaway || "Use a disciplined default line.",
      },
    ),
    confidence,
    strategic_tags: mergedTags,
    tags: mergedTags,
    classification:
      streetContext?.classification && typeof streetContext.classification === "object"
        ? streetContext.classification
        : null,
    audit_heuristics:
      streetContext?.audit_heuristics ||
      streetContext?.deterministic?.audit_heuristics ||
      null,
  };
  const actionTimeAligned = alignStreetNodeWithActionTimeState(baseNode, streetContext);
  const auditAligned = alignStreetNodeWithAuditHeuristics(
    actionTimeAligned,
    streetContext,
  );
  const openQualified = alignStreetNodeWithOpenQualification(auditAligned, streetContext);
  const cbetAligned = alignStreetNodeWithCbetIntent(openQualified, streetContext);
  const premiumAligned = alignStreetNodeWithPremiumHandSemantics(
    cbetAligned,
    streetContext,
  );
  return alignStreetNodeWithDrawSemantics(premiumAligned, streetContext);
}

function readableClassificationLabel(classification = {}) {
  const raw = String(
    classification?.made_hand_type || classification?.made_hand_category || "holding",
  )
    .trim()
    .toLowerCase();
  if (!raw || raw === "air") return "high-card holding";
  return raw.replace(/_/g, "-");
}

function formatFallbackBb(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return `${Number(amount.toFixed(2))} BB`;
}

function buildFallbackStreetAnalysis(streetContext = {}) {
  const street = String(streetContext?.street || "")
    .trim()
    .toLowerCase();
  const classification =
    streetContext?.classification && typeof streetContext.classification === "object"
      ? streetContext.classification
      : {};
  const drawDescription = drawDescriptionFromClassification(classification);
  const handLabel = readableClassificationLabel(classification);
  const board = Array.isArray(streetContext?.board_cards)
    ? streetContext.board_cards.map((card) => String(card || "").trim()).filter(Boolean)
    : [];
  const boardLabel = board.length ? board.join("-") : "No board cards";
  const potOdds = String(streetContext?.metrics?.pot_odds || "").trim() || null;
  const facingSize = formatFallbackBb(streetContext?.metrics?.facing_size_bb);
  const facingJam = Boolean(streetContext?.semantic_action?.facing_jam);
  const callFoldNode =
    facingJam ||
    (Array.isArray(streetContext?.legal_actions) &&
      streetContext.legal_actions.includes("call") &&
      streetContext.legal_actions.includes("fold") &&
      !streetContext.legal_actions.includes("raise"));

  if (street === "preflop") {
    const seed = String(streetContext?.seed_takeaway || "").trim();
    return {
      insight: seed || "Evaluate this preflop action from position, stack depth, and prior action.",
      range_context:
        "Use the position-specific opening or response range and account for every player still able to act.",
      board_texture: "No board cards apply preflop.",
      sizing_commentary:
        "Keep the size coherent with effective stack, prior action, and the amount already committed.",
      plan_commentary:
        "Choose a line that remains coherent against calls and reraises from all live opponents.",
      takeaway: seed || "Judge the action against the complete preflop range and action order.",
    };
  }

  const insight = drawDescription
    ? `Hero has ${handLabel} with ${drawDescription}; the decision is driven by draw equity rather than made-hand showdown value.`
    : `Hero has ${handLabel} on ${boardLabel}; evaluate its range equity and realization against the action faced.`;
  const rangeContext = callFoldNode && potOdds
    ? `This is a range-versus-price decision: Hero needs ${potOdds} equity against Villain's continuing range, and detected outs alone do not prove that threshold is met.`
    : "Compare Hero's full hand class with Villain's action-specific range rather than judging the visible cards in isolation.";
  const boardTexture = drawDescription
    ? `${boardLabel} leaves ${drawDescription} live; distinguish nominal outs from clean outs against Villain's made hands and stronger draws.`
    : `${boardLabel} is the visible ${street || "postflop"} board; assess its suits, pairing, and connectivity before choosing a line.`;
  const sizingCommentary = callFoldNode
    ? `Facing ${facingSize || "an all-in"}${potOdds ? ` requires ${potOdds} equity` : ""}; this is a call-or-fold response, not a sizing choice.`
    : facingSize
      ? `The ${facingSize} facing size must be evaluated against the current pot, remaining stack, and legal responses.`
      : "No reliable sizing conclusion is available without a complete generated street review.";
  const planCommentary = callFoldNode
    ? "A call ends Hero's decision-making for the hand, so there is no later-street flexibility to preserve; decide from current range equity, price, and tournament pressure."
    : "Continue with a plan tied to the legal actions, remaining stack, and likely responses on later streets.";
  const takeaway = drawDescription && potOdds
    ? `Treat this as a close equity threshold: continue only if ${drawDescription} clears ${potOdds} against the realistic action range.`
    : "Treat this as a provisional classification until a complete street-level analysis is available.";

  return {
    insight,
    range_context: rangeContext,
    board_texture: boardTexture,
    sizing_commentary: sizingCommentary,
    plan_commentary: planCommentary,
    takeaway,
  };
}

function fallbackStreetReview(streetContext = {}) {
  const review = normalizeStreetReviewFromModel(
    {
      score: streetContext?.seed_score ?? 0,
      preferred_action: {
        action:
          streetContext?.action_taken?.action === "none"
            ? "check"
            : streetContext?.action_taken?.action || "check",
        sizing: streetContext?.action_taken?.sizing || null,
      },
      analysis: buildFallbackStreetAnalysis(streetContext),
      confidence: "low",
      strategic_tags: Array.isArray(streetContext?.deterministic?.street_tags)
        ? streetContext.deterministic.street_tags
        : [],
    },
    streetContext,
  );
  return {
    ...review,
    generation_status: "fallback",
  };
}

function skippedReasonForStreetContext(streetContext = {}) {
  if (streetContext?.automatic_runout) return "all_in_runout";
  if (streetContext?.all_players_committed) return "all_players_committed";
  if (!streetContext?.hero_has_agency) return "no_hero_agency";
  return "not_decision_street";
}

function skippedStreetSummary(streetContext = {}) {
  const reason = skippedReasonForStreetContext(streetContext);
  if (reason === "all_in_runout") {
    if (streetContext?.hand_semantics?.all_in_before_flop) {
      return "All players were all-in preflop; board runout had no further decisions.";
    }
    return "All players were already committed; this street is a runout-only node.";
  }
  if (reason === "all_players_committed") {
    return "No legal strategic actions remained because stacks were committed.";
  }
  if (reason === "no_hero_agency") {
    return "Hero had no legal decision on this street.";
  }
  return "No strategic decision node for hero on this street.";
}

function buildSkippedStreetReviewNode(streetContext = {}) {
  const reason = skippedReasonForStreetContext(streetContext);
  const summary = skippedStreetSummary(streetContext);
  const tags = Array.from(
    new Set([
      "runout_only",
      ...(Array.isArray(streetContext?.deterministic?.street_tags)
        ? streetContext.deterministic.street_tags
        : []),
    ]),
  ).slice(0, 10);

  return {
    street: streetContext?.street,
    skipped: true,
    skipped_reason: reason,
    summary,
    score: null,
    decision_type:
      String(
        streetContext?.decision_type || streetContext?.action_time_state?.decision_type || "",
      ).trim() || null,
    first_in_opportunity: Boolean(
      streetContext?.first_in_opportunity ||
        streetContext?.action_time_state?.open_opportunity,
    ),
    facing_open: Boolean(
      streetContext?.facing_open || streetContext?.action_time_state?.facing_open,
    ),
    facing_raise: Boolean(
      streetContext?.facing_raise || streetContext?.action_time_state?.facing_raise,
    ),
    action_time_state:
      streetContext?.action_time_state && typeof streetContext.action_time_state === "object"
        ? streetContext.action_time_state
        : null,
    action_taken: {
      action: String(streetContext?.action_taken?.action || "none").trim() || "none",
      sizing: streetContext?.action_taken?.sizing ?? null,
      size: streetContext?.action_taken?.sizing ?? null,
    },
    preferred_action: {
      action: "n/a",
      sizing: null,
      size: null,
    },
    metrics: {
      pot_size_bb: Number.isFinite(Number(streetContext?.metrics?.pot_size_bb))
        ? Number(streetContext.metrics.pot_size_bb)
        : null,
      spr: Number.isFinite(Number(streetContext?.metrics?.spr))
        ? Number(streetContext.metrics.spr)
        : null,
      facing_size_bb: Number.isFinite(Number(streetContext?.metrics?.facing_size_bb))
        ? Number(streetContext.metrics.facing_size_bb)
        : null,
      pot_odds:
        typeof streetContext?.metrics?.pot_odds === "string"
          ? streetContext.metrics.pot_odds
          : null,
    },
    analysis: {
      insight: summary,
      range_context: "Street skipped: no hero agency remained.",
      board_texture:
        Array.isArray(streetContext?.board_cards) && streetContext.board_cards.length
          ? streetContext.board_cards.join(" ")
          : "No board cards.",
      sizing_commentary: "No sizing decision occurred on this street.",
      plan_commentary: "Preserve timeline continuity; strategy resolved earlier.",
      takeaway: summary,
    },
    confidence: "high",
    strategic_tags: tags,
    tags,
    classification:
      streetContext?.classification && typeof streetContext.classification === "object"
        ? streetContext.classification
        : null,
  };
}

function summarizePriorActionsForPrompt(streetContext = {}) {
  const state = streetContext?.action_time_state || {};
  const prior = Array.isArray(state?.prior_actions) ? state.prior_actions : [];
  if (!prior.length) return [];
  const keepAction = (action = "") => {
    const value = String(action || "").trim().toLowerCase();
    if (!value) return false;
    if (["post_ante", "post_small_blind", "post_big_blind"].includes(value)) return false;
    return ["raise", "jam", "bet", "call", "fold", "check"].includes(value);
  };
  const rows = prior
    .filter((row) => keepAction(row?.action))
    .filter((row) => {
      const action = String(row?.action || "").toLowerCase();
      const player = String(row?.player || "").trim();
      const heroName = String(
        streetContext?.action_time_state?.players_remaining?.find((item) => String(item || "").trim() === "Hero") || "",
      ).trim();
      const isHero = heroName ? player === heroName : player === "Hero";
      return isHero || ["raise", "jam", "bet"].includes(action);
    })
    .slice(-5);

  const lineFor = (row = {}) => {
    const player = String(row?.player || "Player").trim();
    const action = String(row?.action || "").trim().toLowerCase();
    const sizing = Number(row?.sizing_bb);
    const sizingLabel = Number.isFinite(sizing) && sizing > 0 ? ` ${sizing}bb` : "";
    if (!action) return "";
    if (action === "raise") return `${player} opens${sizingLabel}`.trim();
    if (action === "jam") return `${player} jams${sizingLabel}`.trim();
    if (action === "bet") return `${player} bets${sizingLabel}`.trim();
    if (action === "call") return `${player} calls${sizingLabel}`.trim();
    if (action === "fold") return `${player} folds`;
    if (action === "check") return `${player} checks`;
    return `${player} ${action}${sizingLabel}`.trim();
  };

  const lines = rows.map((row) => lineFor(row)).filter(Boolean);
  if (state?.facing_action?.player && state?.facing_action?.action) {
    const facingPlayer = String(state.facing_action.player).trim();
    const facingAction = String(state.facing_action.action).trim().toLowerCase();
    const facingSizing = Number(state?.facing_action?.sizing_bb);
    const facingSizingLabel =
      Number.isFinite(facingSizing) && facingSizing > 0 ? ` ${facingSizing}bb` : "";
    lines.push(
      `${facingPlayer} ${facingAction}${facingSizingLabel}`.trim(),
      "action back on Hero",
    );
  }
  return Array.from(new Set(lines)).slice(-6);
}

function compactStreetContextForPrompt(streetContext = {}) {
  const metrics = streetContext?.metrics || {};
  const semanticAction = streetContext?.semantic_action || {};
  const deterministic = streetContext?.deterministic || {};
  const classification = streetContext?.classification || {};
  const actionTime = streetContext?.action_time_state || {};
  const audit =
    streetContext?.audit_heuristics ||
    deterministic?.audit_heuristics ||
    null;

  const compact = {
    hand_id: String(streetContext?.hand_id || "").trim() || null,
    street: String(streetContext?.street || "").trim().toLowerCase() || null,
    stack_depth_bb: Number.isFinite(Number(streetContext?.stack_depth_bb))
      ? Number(streetContext.stack_depth_bb)
      : null,
    board_cards: Array.isArray(streetContext?.board_cards)
      ? streetContext.board_cards
          .map((card) => String(card || "").trim())
          .filter(Boolean)
      : [],
    legal_actions: Array.isArray(streetContext?.legal_actions)
      ? streetContext.legal_actions
      : [],
    decision: {
      decision_type:
        String(streetContext?.decision_type || actionTime?.decision_type || "")
          .trim()
          .toLowerCase() || null,
      node_type:
        String(streetContext?.decision_node_type || "")
          .trim()
          .toLowerCase() || null,
      hero_position_state:
        String(streetContext?.hero_position_state || "")
          .trim()
          .toLowerCase() || null,
      hero_initial_action:
        String(streetContext?.hero_initial_action || "")
          .trim()
          .toLowerCase() || null,
      hero_decision_options: Array.isArray(streetContext?.hero_decision_options)
        ? streetContext.hero_decision_options
        : [],
    },
    action_time: {
      hero_position: String(actionTime?.hero_position || "").trim() || null,
      pot_before_action_bb: Number.isFinite(Number(actionTime?.pot_state_when_hero_acted?.pot_before_action_bb))
        ? Number(actionTime.pot_state_when_hero_acted.pot_before_action_bb)
        : null,
      to_call_bb: Number.isFinite(Number(actionTime?.pot_state_when_hero_acted?.to_call_bb))
        ? Number(actionTime.pot_state_when_hero_acted.to_call_bb)
        : null,
      history: summarizePriorActionsForPrompt(streetContext),
    },
    action_taken: {
      action: String(streetContext?.action_taken?.action || "").trim().toLowerCase() || null,
      sizing: String(streetContext?.action_taken?.sizing || "").trim() || null,
    },
    metrics: {
      pot_size_bb: Number.isFinite(Number(metrics?.pot_size_bb))
        ? Number(metrics.pot_size_bb)
        : null,
      spr: Number.isFinite(Number(metrics?.spr)) ? Number(metrics.spr) : null,
      facing_size_bb: Number.isFinite(Number(metrics?.facing_size_bb))
        ? Number(metrics.facing_size_bb)
        : null,
      pot_odds: typeof metrics?.pot_odds === "string" ? metrics.pot_odds : null,
    },
    semantic_action: {
      action_type: String(semanticAction?.action_type || "").trim().toLowerCase() || null,
      facing_jam: Boolean(semanticAction?.facing_jam) || undefined,
      cbet_intent: String(semanticAction?.cbet_intent || "").trim().toLowerCase() || null,
      cbet_intent_focus: Array.isArray(semanticAction?.cbet_intent_focus)
        ? semanticAction.cbet_intent_focus
        : [],
    },
    audit_heuristics: audit
      ? {
          chart_recommendation:
            String(audit?.chart_recommendation || "").trim().toLowerCase() || null,
          chart_confidence:
            String(audit?.chart_confidence || "").trim().toLowerCase() || null,
          spot_classification:
            String(audit?.spot_classification || "").trim().toLowerCase() || null,
          solver_mix_estimate:
            String(audit?.solver_mix_estimate || "").trim().toLowerCase() || null,
          population_adjustment:
            String(audit?.population_adjustment || "").trim() || null,
        }
      : null,
    deterministic: {
      pressure_level: String(deterministic?.pressure_level || "").trim().toLowerCase() || null,
      commitment_level:
        String(deterministic?.commitment_level || "").trim().toLowerCase() || null,
      spr_tier: String(deterministic?.spr_tier || "").trim().toLowerCase() || null,
      street_tags: Array.isArray(deterministic?.street_tags) ? deterministic.street_tags : [],
      mistake_signals: Array.isArray(deterministic?.relevant_mistake_candidates)
        ? deterministic.relevant_mistake_candidates
            .map((item) => String(item?.code || "").trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 4)
        : [],
    },
    classification: {
      hand_strength:
        String(classification?.made_hand_type || classification?.made_hand_category || "")
          .trim()
          .toLowerCase() || null,
      hand_tier:
        String(classification?.hand_tier || "").trim().toLowerCase() || null,
      premium_holding:
        typeof classification?.premium_holding === "boolean"
          ? classification.premium_holding
          : undefined,
      pair_type:
        String(classification?.pair_type || "").trim().toLowerCase() || null,
      showdown_value:
        String(classification?.showdown_strength || "").trim().toLowerCase() || null,
      bluff_catcher:
        typeof classification?.bluff_catcher === "boolean"
          ? classification.bluff_catcher
          : undefined,
      draws: {
        flush_draw: Boolean(classification?.draws_present?.flush_draw) || undefined,
        straight_draw: Boolean(classification?.draws_present?.straight_draw) || undefined,
        combo_draw: Boolean(classification?.draws_present?.combo_draw) || undefined,
        flush_draw_suit:
          String(classification?.draws_present?.flush_draw_suit || "")
            .trim()
            .toLowerCase() || null,
        straight_draw_type:
          String(classification?.draws_present?.straight_draw_type || "")
            .trim()
            .toLowerCase() || null,
      },
    },
  };

  const prune = (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || trimmed === "none" || trimmed === "n/a") return undefined;
      return trimmed;
    }
    if (Array.isArray(value)) {
      const items = value.map((item) => prune(item)).filter((item) => item !== undefined);
      return items.length ? items : undefined;
    }
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        if (item === false) continue;
        const next = prune(item);
        if (next !== undefined) out[key] = next;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return value;
  };

  return prune(compact) || {};
}

async function generateStreetReview(streetContext = {}, instruction, model) {
  const promptStreetContext = compactStreetContextForPrompt(streetContext);
  const system = `You are a tournament poker street coach.
Return concise, replay-ready coaching for one street only.
Do not discuss future streets beyond the provided context.
Use deterministic tags and pressure metadata as hard constraints.
Respond with strict JSON only.

Output JSON:
{
  "score": -2,
  "preferred_action": {
    "action": "string",
    "sizing": "string|null"
  },
  "analysis": {
    "insight": "string",
    "range_context": "string",
    "board_texture": "string",
    "sizing_commentary": "string",
    "plan_commentary": "string",
    "takeaway": "string"
  },
  "confidence": "low|medium|high",
  "strategic_tags": ["string"]
}

Rules:
- Keep each analysis field tight and specific (1-2 sentences max).
- preferred_action.action must respect legal_actions if provided.
- Treat semantic_action and decision_node_type as canonical node semantics.
- Decision integrity: use action_time_state as frozen truth; never use actions after hero_action_index; if open_opportunity/open_decision, do not frame as facing raise/open/3-bet.
- Response integrity: if hero checked then faced a bet, evaluate CALL/FOLD/RAISE only (do not re-grade whether the initial check was preferred).
- Respect legal_actions, commitment/agency flags, and avoid postflop betting advice in committed/runout states.
- Strategic realism: be concrete and mechanism-based (showdown value, equity realization, fold equity, pot control, range interaction, blockers); avoid vague filler, unsupported hidden-card assumptions, and solver certainty claims.
- Board texture: tie directly to visible cards (pairing/connectivity/suits). Use "dry" only for truly low interaction; otherwise prefer "semi-dynamic", "moderately connected", "coordinated", "draw-heavy", "static paired board", or "high-card runout".
- C-bet intent mapping:
  - bluff_cbet -> fold equity, initiative, equity/realization denial, range pressure; avoid value/protection framing and never say "fold out better hands".
  - thin_value_cbet/protection_cbet -> vulnerable made-hand incentives and equity denial.
  - value_cbet -> value extraction and stack building.
- Terminology discipline: reserve "air" for complete misses with negligible showdown value and weak realization; for defendable/speculative holdings prefer terms like "speculative holding" or "weak showdown value".
- Draw integrity: classification.draws is deterministic source data. Explicitly name detected flush/straight draws, keep draw equity separate from made-hand showdown value, and never describe a detected draw as absent. For high-card draws, compare estimated range equity with the supplied price instead of calling the hand strong showdown value.
- Street integrity: classification.hand_tier describes starting-hand strength only when supplied preflop. Never carry a preflop premium label into postflop made-hand strength.
- Premium-hand protection: if classification indicates premium_holding=true, hand_tier=premium, or pair_type=overpair, never frame the hand as weak/marginal/speculative or default to fold-preservation language unless explicit exploit/ICM/extreme multiway context is present.
- Audit alignment: if chart_recommendation is {"defend","likely_continue","mixed_continue"}, avoid "mandatory/standard/obvious fold" unless explicit exploit drivers are present (ICM, stack-depth compression, extreme sizing, population over/under-bluff).
- Keep language consistent with audit_heuristics.spot_classification and solver_mix_estimate when provided.
- Compression: avoid repeating the same concept across insight/sizing/plan/takeaway; prefer one clear actionable takeaway with complementary supporting lines.`;

  const user = `Street context:
${JSON.stringify(promptStreetContext, null, 2)}

Instruction: ${
    instruction ||
    "Coach this street decision with concise strategic clarity and replay-friendly structure."
  }`;

  let usage = null;
  let lastFailure = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptUser = attempt === 0
      ? user
      : `${user}\nRetry requirement: return the complete JSON object with exactly one concise sentence per analysis field. Keep the full response under 180 words.`;
    try {
      const { parsed, completion } = await completePrompt({
        system,
        user: attemptUser,
        temperature: 0.2,
        top_p: 0.75,
        max_tokens: 420,
        model,
      });
      usage = mergeUsageBlocks(usage, completion?.usage || null);
      const schemaResult = STREET_AI_REVIEW_SCHEMA.safeParse(parsed || {});
      if (schemaResult.success) {
        const normalized = normalizeStreetReviewFromModel(
          schemaResult.data,
          streetContext,
        );
        return {
          review: {
            ...normalized,
            generation_status: attempt === 0 ? "generated" : "generated_after_retry",
          },
          usage,
          repaired: attempt > 0,
        };
      }
      lastFailure = schemaResult.error;
    } catch (error) {
      lastFailure = error;
    }
  }

  if (process.env.DEBUG_AI_OUTPUTS === "true" && lastFailure) {
    console.warn(
      `[ChaosCoach] Street review fallback used for ${streetContext?.street || "unknown"}:`,
      lastFailure?.message || String(lastFailure),
    );
  }
  return {
    review: fallbackStreetReview(streetContext),
    usage,
    repaired: true,
  };
}

async function generateStreetReviewsForHand(
  handContext = {},
  baseReview = {},
  instruction,
  model,
) {
  const contexts = collectStreetAiContexts(handContext, baseReview);
  const streetReviews = [];
  let usage = null;
  for (const context of contexts) {
    if (!context?.is_decision_street) {
      streetReviews.push(buildSkippedStreetReviewNode(context));
      continue;
    }
    try {
      const result = await generateStreetReview(context, instruction, model);
      streetReviews.push(result.review);
      usage = mergeUsageBlocks(usage, result.usage);
    } catch {
      streetReviews.push(fallbackStreetReview(context));
    }
  }
  return { streetReviews, usage };
}

async function enrichReviewWithStreetAi(review = {}, handContext = {}, instruction, model) {
  const enableStreetAi =
    String(process.env.STREET_AI_REVIEW_ENABLED || "true")
      .trim()
      .toLowerCase() !== "false";
  if (!enableStreetAi || !process.env.OPENAI_API_KEY) return review;

  const validation = handContext?.handStateValidation || {};
  if (validation?.isValid === false) return review;

  try {
    const { streetReviews, usage } = await generateStreetReviewsForHand(
      handContext,
      review,
      instruction,
      model,
    );
    if (!Array.isArray(streetReviews) || !streetReviews.length) return review;
    const aggregate = buildStreetReviewAggregateFromStreetReviews({
      legacyReview: review,
      streetReviews,
    });
    const sourceOfTruthSummary =
      aggregate?.source_of_truth_summary &&
      typeof aggregate.source_of_truth_summary === "object"
        ? aggregate.source_of_truth_summary
        : null;
    const next = {
      ...review,
      street_intelligence: aggregate,
    };
    if (sourceOfTruthSummary) {
      next.what_was_good =
        String(sourceOfTruthSummary.what_was_good || "").trim() ||
        next.what_was_good;
      next.better_line =
        String(sourceOfTruthSummary.better_line || "").trim() || next.better_line;
      next.primary_leak =
        String(sourceOfTruthSummary.primary_leak || "").trim() || next.primary_leak;
      next.reasoning =
        String(sourceOfTruthSummary.reasoning || "").trim() || next.reasoning;
    }
    next.usage = mergeUsageBlocks(next?.usage, usage);
    // TODO(replay-sync): align street node ids with future timeline animation checkpoints.
    // TODO(solver-overlays): attach solver delta fields beside preferred_action when solver service is available.
    // TODO(population-overlays): enrich strategic_tags with pool exploit patterns by stake/field size.
    // TODO(chat-tab): expose this per-street artifact to future conversational coaching tab.
    return next;
  } catch {
    return review;
  }
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
    requestedModel && ALLOWED_MODEL_SELECTIONS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  if (persona === "replay_analyst") {
    return runReplayAnalyst(context, instruction, model);
  }
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

const REPLAY_CARD_CODE_PATTERN = /^[AKQJT2-9][shdc]$/i;
const REPLAY_BOARD_COUNTS = new Set([0, 3, 4, 5]);
const REPLAY_HERO_VISIBILITY_GUIDANCE = `- The Hero cards in PokerCraft are intentionally partial, angled, overlapping, and may be covered below the rank/suit by an avatar, flag, name plate, percentage, or stack label. Those obstructions are outside the card identity and must not reduce confidence.
- HERO CARD 1 - LEFT and HERO CARD 2 - RIGHT are enlarged upper portions of the two Hero cards. Read one code from each labelled crop in that order.
- A clearly readable upper-left rank and suit is a complete Hero-card read even when the lower half or opposite corner of the card is not visible. Use high confidence when both labelled rank/suit pairs are unambiguous.`;
const REPLAY_CARD_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    heroCards: {
      type: "array",
      items: { type: "string" },
      maxItems: 2,
    },
    boardCards: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
  },
  required: ["heroCards", "boardCards", "confidence"],
};

const REPLAY_CARD_AND_STACK_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...REPLAY_CARD_RESPONSE_SCHEMA.properties,
    heroStackBB: {
      anyOf: [
        { type: "number", minimum: 0, maximum: 10000 },
        { type: "null" },
      ],
    },
    stackConfidence: {
      type: "string",
      enum: ["low", "medium", "high"],
    },
  },
  required: [
    ...REPLAY_CARD_RESPONSE_SCHEMA.required,
    "heroStackBB",
    "stackConfidence",
  ],
};

function normalizeReplayCardCode(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!REPLAY_CARD_CODE_PATTERN.test(raw)) return null;
  return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
}

function normalizeReplayCardRecognition(
  raw,
  expectedBoardCount = null,
  { knownHeroCards = [], knownBoardCards = [], readHeroStack = false } = {},
) {
  const heroInput = Array.isArray(raw?.heroCards) ? raw.heroCards : [];
  const boardInput = Array.isArray(raw?.boardCards) ? raw.boardCards : [];
  const heroCards = heroInput.map(normalizeReplayCardCode);
  const boardCards = boardInput.map(normalizeReplayCardCode);
  const lockedHeroCards = (Array.isArray(knownHeroCards) ? knownHeroCards : [])
    .map(normalizeReplayCardCode)
    .filter(Boolean);
  const lockedBoardCards = (Array.isArray(knownBoardCards) ? knownBoardCards : [])
    .map(normalizeReplayCardCode)
    .filter(Boolean);
  const confidence = ["low", "medium", "high"].includes(raw?.confidence)
    ? raw.confidence
    : "low";
  const rawHeroStackBB = Number(raw?.heroStackBB);
  const stackConfidence = ["low", "medium", "high"].includes(
    raw?.stackConfidence,
  )
    ? raw.stackConfidence
    : "low";
  const heroStackBehindBB =
    readHeroStack &&
    stackConfidence !== "low" &&
    Number.isFinite(rawHeroStackBB) &&
    rawHeroStackBB > 0 &&
    rawHeroStackBB <= 10000
      ? Number(rawHeroStackBB.toFixed(2))
      : null;

  if (
    heroCards.length !== 2 ||
    heroCards.some((card) => !card) ||
    boardCards.some((card) => !card)
  ) {
    return {
      recognized: false,
      confidence,
      reason: "Hero cards were not both clearly visible.",
    };
  }

  if (!REPLAY_BOARD_COUNTS.has(boardCards.length)) {
    return {
      recognized: false,
      confidence,
      reason: "Community cards were incomplete or unclear.",
    };
  }

  if (
    expectedBoardCount !== null &&
    REPLAY_BOARD_COUNTS.has(expectedBoardCount) &&
    boardCards.length !== expectedBoardCount
  ) {
    return {
      recognized: false,
      confidence,
      reason: "Vision result did not match the visible board-card count.",
    };
  }

  if (
    lockedHeroCards.length === 2 &&
    (heroCards[0] !== lockedHeroCards[0] || heroCards[1] !== lockedHeroCards[1])
  ) {
    return {
      recognized: false,
      confidence,
      reason: "Vision changed previously confirmed Hero cards mid-hand.",
    };
  }

  if (
    lockedBoardCards.length > boardCards.length ||
    lockedBoardCards.some((card, index) => boardCards[index] !== card)
  ) {
    return {
      recognized: false,
      confidence,
      reason: "Vision changed a previously confirmed community card.",
    };
  }

  const allCards = [...heroCards, ...boardCards];
  if (new Set(allCards).size !== allCards.length) {
    return {
      recognized: false,
      confidence,
      reason: "Vision result contained a duplicate card.",
    };
  }

  const flop = boardCards.length >= 3 ? boardCards.slice(0, 3) : [];
  const turn = boardCards.length >= 4 ? boardCards[3] : null;
  const river = boardCards.length >= 5 ? boardCards[4] : null;
  const street =
    boardCards.length === 5
      ? "river"
      : boardCards.length === 4
        ? "turn"
        : boardCards.length === 3
          ? "flop"
          : "preflop";

  return {
    recognized: true,
    confidence,
    confirmationRequired: false,
    manualReviewSuggested: confidence !== "high",
    heroCards: {
      card1: heroCards[0],
      card2: heroCards[1],
    },
    board: {
      flop,
      turn,
      river,
    },
    boardCount: boardCards.length,
    street,
    ...(readHeroStack
      ? {
          heroStackBehindBB,
          stackConfidence:
            heroStackBehindBB === null ? "low" : stackConfidence,
        }
      : {}),
  };
}

export async function recognizeReplayCards({
  boardImageDataUrl,
  heroImageDataUrl,
  imageDataUrl,
  expectedBoardCount = null,
  readHeroStack = false,
  knownHeroCards = [],
  knownBoardCards = [],
} = {}) {
  const model = ALLOWED_VISION_MODELS.has(process.env.REPLAY_VISION_MODEL)
    ? process.env.REPLAY_VISION_MODEL
    : DEFAULT_VISION_MODEL;
  const boardCountHint = REPLAY_BOARD_COUNTS.has(expectedBoardCount)
    ? `A local shape detector sees exactly ${expectedBoardCount} community cards. Return that many boardCards or use low confidence.`
    : "Return only the community cards that are visibly face-up.";
  const lockedCardHint =
    knownHeroCards.length || knownBoardCards.length
      ? `Cards locked from an earlier stable frame in this same hand: Hero ${
          knownHeroCards.join(" ") || "not locked"
        }; board ${knownBoardCards.join(" ") || "none yet"}. Verify them against the new crops. If a locked card appears different or unclear, use low confidence rather than changing it.`
      : "There are no locked cards. Read every visible rank and suit directly from the crops.";
  const shouldReadHeroStack = Boolean(
    readHeroStack && expectedBoardCount === 0,
  );
  const stackHint = shouldReadHeroStack
    ? "A labelled HERO STACK panel appears below the Hero cards. Transcribe the numeric chips-behind value immediately followed by BB. Return the number without the BB suffix. If the complete number, decimal point, or BB suffix is unclear, return null and stackConfidence low. This stack task is independent: never lower card confidence or omit readable cards because the stack is unclear."
    : "Do not inspect, infer, or return any player stack value.";
  const responseShape = shouldReadHeroStack
    ? `{
  "heroCards": ["As", "Kd"],
  "boardCards": [],
  "confidence": "high",
  "heroStackBB": 67.6,
  "stackConfidence": "high"
}`
    : `{
  "heroCards": ["As", "Kd"],
  "boardCards": ["7h", "Tc", "2s"],
  "confidence": "high"
}`;
  const imageContent = boardImageDataUrl && heroImageDataUrl
    ? [
        { type: "text", text: "First image: COMMUNITY BOARD crop." },
        {
          type: "image_url",
          image_url: { url: boardImageDataUrl, detail: "high" },
        },
        {
          type: "text",
          text: shouldReadHeroStack
            ? "Second image: HERO HOLE CARDS crop with a labelled HERO STACK panel below."
            : "Second image: HERO HOLE CARDS crop.",
        },
        {
          type: "image_url",
          image_url: { url: heroImageDataUrl, detail: "high" },
        },
      ]
    : [
        { type: "text", text: "One composite image containing labelled board and Hero crops." },
        {
          type: "image_url",
          image_url: { url: imageDataUrl, detail: "high" },
        },
      ];

  const completion = await getClient().chat.completions.create({
    model,
    temperature: 0,
    max_tokens: shouldReadHeroStack ? 220 : 180,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: shouldReadHeroStack
          ? "poker_replay_cards_and_stack"
          : "poker_replay_cards",
        strict: true,
        schema: shouldReadHeroStack
          ? REPLAY_CARD_AND_STACK_RESPONSE_SCHEMA
          : REPLAY_CARD_RESPONSE_SCHEMA,
      },
    },
    messages: [
      {
        role: "system",
        content: `You transcribe playing cards from tightly cropped PokerCraft replay images.
Read only the COMMUNITY BOARD, HERO HOLE CARDS, and any explicitly labelled HERO STACK panel. Never read opponent cards, avatars, card backs, names, or anything outside the labelled crops.
Return JSON with this exact shape:
${responseShape}
Rules:
- Card codes use rank A,K,Q,J,T,9..2 followed by suit h,d,c,s.
- Use T, never 10, for a ten.
- Read the small rank and suit marks in the upper-left corner of each face-up card; do not identify cards from decorative artwork or color alone.
${REPLAY_HERO_VISIBILITY_GUIDANCE}
- heroCards must contain exactly two cards when both are clearly visible; otherwise return an empty array and low confidence.
- boardCards must be left-to-right and contain exactly 0, 3, 4, or 5 cards.
- Do not infer, complete, or repeat hidden cards.
- Use high confidence only when every requested rank and suit is unambiguous.
- Use medium confidence when all cards can be read but one glyph is slightly soft.
- Use low confidence only when at least one requested card cannot be transcribed to a valid code; do not return a complete valid snapshot with low confidence.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${boardCountHint}\n${lockedCardHint}\n${stackHint}`,
          },
          ...imageContent,
        ],
      },
    ],
  });

  const parsed = safeJsonParse(completion.choices?.[0]?.message?.content || "");
  const normalized = normalizeReplayCardRecognition(parsed, expectedBoardCount, {
    knownHeroCards,
    knownBoardCards,
    readHeroStack: shouldReadHeroStack,
  });
  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;
  return { ...normalized, usage, model };
}

export const __replayVisionTestables = {
  normalizeReplayCardCode,
  normalizeReplayCardRecognition,
  replayHeroVisibilityGuidance: REPLAY_HERO_VISIBILITY_GUIDANCE,
};

function studySpotClassificationResponseSchema(candidateIds) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      classifications: {
        type: "array",
        maxItems: candidateIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            candidateId: { type: "string", enum: candidateIds },
            keep: { type: "boolean" },
            type: { type: "string", enum: STUDY_SPOT_TYPES },
            category: { type: "string", enum: STUDY_SPOT_CATEGORIES },
            tags: {
              type: "array",
              maxItems: 5,
              items: {
                type: "string",
                enum: Object.values(STUDY_SPOT_TAGS).flat(),
              },
            },
            title: { type: "string", maxLength: 90 },
            whyStudyThis: { type: "string", maxLength: 280 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            strategicImportance: { type: "number", minimum: 0, maximum: 1 },
            severity: { type: "number", minimum: 0, maximum: 1 },
          },
          required: [
            "candidateId",
            "keep",
            "type",
            "category",
            "tags",
            "title",
            "whyStudyThis",
            "confidence",
            "strategicImportance",
            "severity",
          ],
        },
      },
    },
    required: ["classifications"],
  };
}

export async function classifyStudySpotCandidatesWithAi(
  candidates,
  requestedModel = DEFAULT_MODEL,
) {
  const compactCandidates = (Array.isArray(candidates) ? candidates : [])
    .slice(0, 20)
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      detector: candidate.detector,
      street: candidate.street,
      actionTaken: candidate.actionTaken,
      proposedType: candidate.type,
      proposedCategory: candidate.category,
      proposedTags: candidate.tags,
      deterministicSummary: candidate.summary,
      deterministicReason: candidate.whyStudyThis,
      context: candidate.handContext,
    }));
  const candidateIds = compactCandidates
    .map((candidate) => String(candidate.candidateId || "").trim())
    .filter(Boolean);
  if (candidateIds.length === 0) {
    return { classifications: [], usage: null, model: requestedModel };
  }

  const { parsed, completion } = await completePrompt({
    model: requestedModel,
    max_tokens: 2600,
    temperature: 0.1,
    top_p: 0.8,
    responseSchemaName: "study_spot_classification",
    responseSchema: studySpotClassificationResponseSchema(candidateIds),
    system: `You classify post-session poker tournament study opportunities.
You receive deterministic candidate decision nodes extracted from parsed hand histories.

Your job:
1. Keep only candidates with genuine study value.
2. Assign one allowed type, category, and only relevant allowed tags.
3. Write a short neutral title and a concise explanation beginning from why the decision is worth studying.
4. Score confidence, strategic importance, and severity from 0 to 1.

Rules:
- This is not a full hand review. Do not provide a recommended action or street-by-street coaching.
- Do not invent cards, stacks, positions, actions, board cards, opponent reads, ICM facts, or solver outputs.
- Prefer close_decision or interesting_spot when correctness is uncertain.
- Use mistake only when the supplied evidence strongly supports it.
- A candidate can be valuable without being wrong.
- Do not mention learning articles or resources.
- Return each candidate ID at most once.`,
    user: JSON.stringify({ candidates: compactCandidates }),
  });

  if (!parsed || !Array.isArray(parsed.classifications)) {
    throw new Error("Study Spot classifier returned an invalid response.");
  }
  const usage = completion?.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;
  const resolvedModel = completion?.model || requestedModel;
  return {
    classifications: parsed.classifications,
    usage,
    model: resolvedModel,
  };
}

export const __studySpotClassifierTestables = {
  studySpotClassificationResponseSchema,
};

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
  const deterministicIntelligence =
    handContext?.deterministicIntelligence &&
    typeof handContext.deterministicIntelligence === "object"
      ? handContext.deterministicIntelligence
      : buildDeterministicIntelligence({
          hand: handContext,
          validatedHandState: handState,
          handStateValidation,
        });
  const enrichedHandContext = {
    ...handContext,
    handClassification,
    decisionEvaluation,
    deterministicIntelligence,
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
    const presented = finalizeCoachingPresentation(base, enrichedHandContext);
    return await enrichReviewWithStreetAi(
      presented,
      enrichedHandContext,
      instruction,
      model,
    );
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
      return await enrichReviewWithStreetAi(
        withSummary,
        enrichedHandContext,
        instruction,
        model,
      );
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
    return await enrichReviewWithStreetAi(
      withSummary,
      enrichedHandContext,
      instruction,
      model,
    );
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
  const withSummary = attachValidationSummary(
    presentedFallback,
    summarizeFindings(lastFindings),
  );
  return await enrichReviewWithStreetAi(
    withSummary,
    enrichedHandContext,
    instruction,
    model,
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

async function runReplayAnalyst(context = {}, instruction, model) {
  const decisionNode =
    context?.decisionNode && typeof context.decisionNode === "object"
      ? context.decisionNode
      : {};
  const legalActions = Array.isArray(decisionNode?.legalActions)
    ? decisionNode.legalActions
    : Array.isArray(context?.legalActions)
      ? context.legalActions
      : [];
  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Hero cards are required for replay analysis.",
      confidence: "low",
      reasoning: "Hero cards are missing.",
      assumptions: ["hero_cards_missing"],
      alternative_action: null,
      alternative_sizing: null,
      legal_actions: legalActions,
      usage: null,
    };
  }

  const handFeatures = describeHandFeatures(context?.heroCards, context?.board);
  const preflopBaseline = buildLivePreflopGuidance(context);
  const stageLens = selectedTournamentStageGuidance(context);
  const bountyLens = selectedBountyTournamentGuidance(context);
  const compactContext = {
    decision: decisionNode,
    heroHand: readable,
    board: context?.board || null,
    handFeatures: handFeatures || null,
    previousActions: Array.isArray(context?.previousActions)
      ? context.previousActions.slice(-16)
      : [],
    actionHistory: Array.isArray(context?.history)
      ? context.history.slice(-20)
      : [],
    opponentProfile: context?.villainType || "unknown",
    stakeTier: context?.stakeTier || "unknown",
    preflopBaseline,
    stageLens,
    bountyLens,
  };

  const system = `You are Replay Analyst, a state-first poker decision coach.
Use GTO-informed range logic with practical population exploits, but never claim solver precision or exact equilibrium frequencies.
The decision object is the source of truth. Recommend only an action listed in decision.legalActions.
Use exact seats, relative position, player count, action order, board, effective stack, pot, SPR, facing amount, and opponent profile when supplied.
Do not invent missing bet sizes, positions, players, cards, stack values, pot odds, or prior actions.
If important fields appear in decision.missingInformation, lower confidence and list the assumptions explicitly.
Distinguish recommendation from the actual historical action; never use future actions or cards to justify the current node.
${LIVE_STACK_LEVERAGE_RULES}
${LIVE_MADE_HAND_SAFETY_RULES}
${preflopBaseline ? LIVE_PREFLOP_POSITION_RULES : ""}
${stageLens ? TOURNAMENT_STAGE_LIFECYCLE_RULES : ""}
${bountyLens ? BOUNTY_TOURNAMENT_LIFECYCLE_RULES : ""}
Respond only with strict JSON and no markdown.

Output JSON:
{
  "hero_action": "one legal action",
  "sizing": "concrete size or empty string",
  "sizing_bb": 2.5,
  "confidence": "low|medium|high",
  "reasoning": "concise strategic reason",
  "assumptions": ["short assumption"],
  "alternative_action": "another legal action or empty string",
  "alternative_sizing": "concrete size or empty string",
  "flavor_text": "short actionable coaching line"
}

Rules:
- When facing a wager, never recommend check or bet.
- When no wager is faced postflop, never recommend call or fold.
- Preflop labels open, 3-bet, and 4-bet must match the supplied legal actions.
- Use jam only when stack depth and leverage make it strategically coherent.
- Sizing must respect pot size, facing amount, and effective stack when known.
- sizing_bb is the total numeric BB size for an open/bet/raise/call; use null for check or fold.
- Multiway pots require tighter bluffing and bluff-catching thresholds.
- On preflop nodes, apply preflopBaseline before generic hand-strength labels; do not call a positional open or priced blind defend "too loose" merely because the holding is non-premium.
- A recommendation can be mixed or close, but hero_action must be the best baseline action and alternative_action the main credible alternative.`;

  const user = `Decision context:
${JSON.stringify(compactContext, null, 2)}

Instruction: ${
    instruction ||
    "Recommend the best baseline action, a concrete size, confidence, and one credible alternative."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.1,
    top_p: 0.5,
    max_tokens: 280,
    model,
    ...structuredLiveDecisionConfig(legalActions, "replay_analyst_decision"),
  });

  return buildResponse(
    parsed,
    completion,
    "Use the complete decision state and choose the highest-EV legal baseline.",
    liveCoachFallbackAction(legalActions, preflopBaseline),
    legalActions,
    context,
  );
}

async function runChaosCoach(context = {}, instruction, model) {
  const styleTone = buildStyleTone(context?.style);
  const stageLens = selectedTournamentStageGuidance(context);
  const bountyLens = selectedBountyTournamentGuidance(context);
  const system = `You are ChaosCoach - a strategy-first poker coach with high-energy presentation.
Use supplied hole cards, board cards, legal actions, position, pot, sizing and stacks before adding personality.
Never recommend an action outside context.decisionNode.legalActions.
Do not invent missing cards, math, positions, or odds; lower confidence when state is incomplete.
${LIVE_STACK_LEVERAGE_RULES}
${LIVE_MADE_HAND_SAFETY_RULES}
${buildLivePreflopGuidance(context) ? LIVE_PREFLOP_POSITION_RULES : ""}
${stageLens ? TOURNAMENT_STAGE_LIFECYCLE_RULES : ""}
${bountyLens ? BOUNTY_TOURNAMENT_LIFECYCLE_RULES : ""}
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
  "flavor_text": "string",
  "confidence": "low|medium|high",
  "reasoning": "string",
  "assumptions": [],
  "alternative_action": "string",
  "alternative_sizing": "string"
}

Rules:
- hero_action: choose only from context.decisionNode.legalActions.
- sizing: use a strategically coherent concrete size.
- flavor_text: short, hype-driven, max 20 words. Lean into Rounders quotes, iconic poker lines, or needle the hero for being too soft. Rotate phrasing.
- reasoning: concise strategic justification grounded in the decision state.
- If context.history is present, use it to maintain narrative consistency (keep sizing vibe, mix traps after heavy aggression). Do not repeat the history; just use the signal in the next JSON output.`;

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
  const chaosContext = {
    ...(context || {}),
    preflopBaseline: buildLivePreflopGuidance(context),
    stageLens,
    bountyLens,
  };

  const user = `Context: ${JSON.stringify(chaosContext, null, 2)}
${historyHint ? `History hint: ${historyHint}\n` : ""}
Instruction: ${
    instruction ||
    "Recommend the strongest legal baseline action, then present it with concise ChaosCoach energy."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.6,
    top_p: 0.85,
    max_tokens: 120,
    model,
  });

  return buildResponse(
    parsed,
    completion,
    "Choose the strongest legal line and apply pressure only when the state supports it.",
    "check",
    context?.decisionNode?.legalActions,
    context,
  );
}

async function runCashGameCrusher(context = {}, instruction, model) {
  const stacks = stackSnapshot(context);
  const stackDepthAssumed = stacks.effective === null && stacks.hero === null;
  const effective = stacks.effective ?? stacks.hero ?? 100;
  const villainType = String(context?.villainType || "balanced");
  const villainNotes = {
    balanced: "Balanced regular - pressure capped ranges, respect reraises.",
    nit: "Nitty villain - bluff scare cards, fold to aggression, isolate limps.",
    station:
      "Calling station - bet big for value, keep bluffing frequency low.",
    maniac:
      "Maniac - let them hang themselves, 3-bet premiums, pot control marginal.",
    fishy: "Loose-passive fish - iso wide, overbet value, deny equity.",
  };
  const villainPlan = villainNotes[villainType] || villainNotes.balanced;
  const posCategory = positionCategory(context?.heroSeat);
  const { compact, readable } = formatHeroHand(context);
  const handFeatures = describeHandFeatures(context?.heroCards, context?.board);
  const handCategory = compact ? categorizeRangeHand(compact) : null;
  const handTier = handCategory?.tier || "unknown";
  const isWeakHand = ["trash", "marginal"].includes(handTier);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);
  const decisionNode =
    context?.decisionNode && typeof context.decisionNode === "object"
      ? context.decisionNode
      : {};
  const legalActions = Array.isArray(decisionNode?.legalActions)
    ? decisionNode.legalActions
    : Array.isArray(context?.legalActions)
      ? context.legalActions
      : [];
  const preflopBaseline = buildLivePreflopGuidance(context);
  const street = String(decisionNode?.street || context?.street || "").toLowerCase();
  const decisionKind = String(decisionNode?.decisionKind || "").toLowerCase();
  const sourceGameType = String(
    decisionNode?.gameType || context?.gameType || context?.format || "unknown",
  ).toLowerCase();
  const formatConflict = !["", "unknown", "cash"].includes(sourceGameType);

  const stackNote =
    stackDepthAssumed
      ? "Effective stack was not supplied - use a provisional 100 BB cash baseline and lower confidence."
      : effective >= 140
      ? `Deep stack ${effective} BB - room for triple-barrels and check-raise traps.`
      : effective <= 60
        ? `Effective stack ${effective} BB - cash EV still applies; let SPR and commitment, not tournament survival, drive aggression.`
        : `Effective stack ${effective} BB - standard 100 BB cash depth.`;
  const multiOpened =
    ["facing_open_callers", "facing_open_and_3bet"].includes(decisionKind) ||
    previous.some((code) =>
      /preflop_multiple_villains_opened|preflop_open_and_3bet_to_me/.test(
        String(code),
      ),
    );
  const multiwayNote = multiOpened
    ? "Preflop: multiple villains entered before hero - expect multiway pots."
    : null;
  const facingPreflopAggression =
    street === "preflop" &&
    ([
      "facing_open",
      "facing_open_callers",
      "facing_open_and_3bet",
      "facing_3bet",
      "facing_4bet",
    ].includes(decisionKind) ||
      previous.some((code) =>
        /preflop_opened_to_me|preflop_multiple_villains_opened|preflop_open_and_3bet_to_me|preflop_faced_3bet|preflop_faced_4bet/.test(
          String(code),
        ),
      ));
  const weakHandFacingPreflopAggression = isWeakHand && facingPreflopAggression;
  const fallbackAction = cashGameFallbackAction({
    legalActions,
    preflopGuidance: preflopBaseline,
    weakHandFacingPreflopAggression,
  });
  const weakHandNote =
    weakHandFacingPreflopAggression
      ? "Preflop hand tier is weak against aggression; continue only when position, price, implied odds, and the opponent range create a clear cash-EV case."
      : null;

  const focusLines = [
    "Mode: cash game. Optimize repeatable long-run monetary EV, never tournament survival or payout equity.",
    formatConflict
      ? `Source format was labelled ${sourceGameType}; Cash Game Crusher overrides that stale/conflicting label and must disclose the cash-mode assumption.`
      : "Source format is cash or unspecified; no ICM applies.",
    stackNote,
    context?.stakeTier ? `Stake tier: ${String(context.stakeTier)}` : "",
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
    coachingMode: "cash",
    sourceGameType,
    formatConflict,
    street: street || context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    playersInHand: decisionNode?.playersInHand ?? context?.playersInHand,
    anteBB: context?.anteBB,
    stakeTier: context?.stakeTier,
    preflopLimpers: context?.preflopLimpers,
    preflopCallers: context?.preflopCallers,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    villainType,
    heroHand: compact,
    heroCards: context?.heroCards,
    board: context?.board,
    handFeatures: handFeatures || undefined,
    decisionNode,
    preflopBaseline,
    relativePosition: context?.relativePosition,
    potSize: context?.potSize,
    stacks: {
      hero: stacks.hero,
      villain: stacks.villain,
      effective,
    },
    multiVillainsOpened: multiOpened,
    handTier,
    tendencies: context?.tendencies,
    assumptions: [
      ...(stackDepthAssumed ? ["effective_stack_assumed_100bb"] : []),
      ...(formatConflict ? ["cash_persona_overrides_format_label"] : []),
    ],
  };

  const system = `You are Cash Game Crusher, a state-first cash poker decision coach.
Use GTO-informed range construction with practical, sample-aware population exploits. Never claim solver precision or exact frequencies without solver data.
The decisionNode object is the source of truth. Recommend only an action listed in decisionNode.legalActions.
Use exact seats, relative position, player count, action order, board, pot, facing amount, SPR, effective stack, and opponent profile when supplied.
Do not invent cards, positions, ranges, rake numbers, bet sizes, pot odds, stack values, or prior actions. Lower confidence and list assumptions when important information is missing.
This persona is cash-only. If sourceGameType conflicts, apply cash strategy and include cash_persona_overrides_format_label in assumptions; never blend in MTT advice.
${CASH_GAME_LIFECYCLE_RULES}
${LIVE_STACK_LEVERAGE_RULES}
${LIVE_MADE_HAND_SAFETY_RULES}
${preflopBaseline ? LIVE_PREFLOP_POSITION_RULES : ""}
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "one legal action",
  "sizing": "concrete cash-game size or empty string",
  "sizing_bb": 6.5,
  "confidence": "low|medium|high",
  "reasoning": "concise hand-and-range justification with lifecycle plan",
  "assumptions": ["short assumption"],
  "alternative_action": "another legal action or empty string",
  "alternative_sizing": "concrete size or empty string",
  "flavor_text": "short actionable cash coaching line"
}

Rules:
- hero_action: choose only from decisionNode.legalActions.
- When facing a wager, never recommend check or bet. When no wager is faced postflop, never recommend call or fold.
- sizing must state the total BB amount for an open or raise and the bet amount/percentage for a postflop bet. sizing_bb is the total numeric BB size for an open, raise, bet, or call; use null for check or fold.
- The reasoning must distinguish the exact-hand recommendation from the broader betting/continuing range and include the conditional next-street plan. Do not claim a hand is a range bet merely because this combo is strong.
- Use assumptions from cashContext and add any decisionNode.missingInformation that materially changes the answer.
- If the effective stack is missing, use the stated 100 BB baseline only provisionally and set confidence low.
- If a preflop hand is weak against aggression, default to fold unless price, position, implied odds, and opponent range provide a clear profitable continue. An over-limp is a call, never a response to a raise.
- Multiway pots tighten both bluffs and thin value. Large river aggression from low-stakes passive profiles requires stronger bluff-catchers than a balanced baseline.
- The alternative must be the main credible range branch, not an arbitrary legal action.
- flavor_text: no hype, max 20 words, and name the cash-specific driver such as value target, rake, SPR, range cap, or blocker.`;

  const user = `Context: ${JSON.stringify(cashContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the most profitable cash-game line given deep-stack dynamics and villain profile."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.15,
    top_p: 0.6,
    max_tokens: 320,
    model,
    ...structuredLiveDecisionConfig(legalActions, "cash_game_crusher_decision"),
  });

  return buildResponse(
    parsed,
    completion,
    "Extract max value from the cash table.",
    fallbackAction,
    legalActions,
    context,
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
  const handFeatures = describeHandFeatures(context?.heroCards, context?.board);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);
  const stacks = stackSnapshot(context);
  const stageLens = selectedTournamentStageGuidance(context);
  const bountyLens = selectedBountyTournamentGuidance(context);
  const decisionKind = String(
    context?.decisionNode?.decisionKind || "",
  ).toLowerCase();
  const multiOpened =
    ["facing_open_callers", "facing_open_and_3bet"].includes(decisionKind) ||
    previous.some((code) =>
      /preflop_multiple_villains_opened|preflop_open_and_3bet_to_me/.test(
        String(code),
      ),
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
    board: context?.board,
    handFeatures: handFeatures || undefined,
    decisionNode: context?.decisionNode,
    preflopBaseline: buildLivePreflopGuidance(context),
    relativePosition: context?.relativePosition,
    potSize: context?.potSize,
    stacks,
    multiVillainsOpened: multiOpened,
    stageLens,
    bountyLens,
  };

  const system = `You are Exploit Detective - a heads-up poker specialist who tailors lines to villain tendencies.
Reference specific leaks (over-folding, calling wide, over-aggression) and adjust aggression, sizing, and trap frequency accordingly.
${LIVE_STACK_LEVERAGE_RULES}
${LIVE_MADE_HAND_SAFETY_RULES}
${buildLivePreflopGuidance(context) ? LIVE_PREFLOP_POSITION_RULES : ""}
${stageLens ? TOURNAMENT_STAGE_LIFECYCLE_RULES : ""}
${bountyLens ? BOUNTY_TOURNAMENT_LIFECYCLE_RULES : ""}
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose only from decisionNode.legalActions.
- sizing: give precise exploit sizing (e.g., "65% pot value bet", "small 2.2x stab", "overbet scare card").
- flavor_text: <= 20 words, call out the exploit rationale (e.g., "value vs station", "pressure the nit's cap").
- Discuss plan vs likely villain reactions (calls, raises, folds) in the line description.
- Use decisionNode.playersInHand; do not assume heads-up when it is multiway.`;

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
    "check",
    context?.decisionNode?.legalActions,
    context,
  );
}

async function runShortStackNinja(context = {}, instruction, model) {
  const stacks = stackSnapshot(context);
  const decisionNode =
    context?.decisionNode && typeof context.decisionNode === "object"
      ? context.decisionNode
      : {};
  const legalActions = Array.isArray(decisionNode?.legalActions)
    ? decisionNode.legalActions
    : Array.isArray(context?.legalActions)
      ? context.legalActions
      : [];
  const preflopBaseline = buildLivePreflopGuidance(context);
  const stageLens = selectedTournamentStageGuidance(context);
  const bountyLens = selectedBountyTournamentGuidance(context);
  if (!stacks.hero && !stacks.effective) {
    return buildIncompleteLiveCoachResponse({
      flavorText: "Need hero stack in BB for Short-Stack Ninja advice.",
      reasoning: "Effective stack depth is required to distinguish jam, raise, call, and fold thresholds.",
      assumptions: ["effective_stack_missing"],
      legalActions,
    });
  }

  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return buildIncompleteLiveCoachResponse({
      flavorText: "Select hero cards for Short-Stack Ninja.",
      reasoning: "Hole cards are required to place this combo inside a short-stack continuing range.",
      assumptions: ["hero_cards_missing"],
      legalActions,
    });
  }
  const descriptor = compact ? describeHand(compact) : null;
  const handFeatures = describeHandFeatures(context?.heroCards, context?.board);
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
    board: context?.board,
    handFeatures: handFeatures || undefined,
    decisionNode,
    preflopBaseline,
    relativePosition: context?.relativePosition,
    potSize: context?.potSize,
    stacks,
    actionContext: actionInfo,
    stageLens,
    bountyLens,
  };

  const system = `You are Short-Stack Ninja, a state-first short-stack tournament poker coach.
  Specialize in effective stacks of 20 BB or less, and call out when depth is beyond that zone.
Use GTO-informed push/fold, raise/fold, raise/call, flat, blocker, and fold-equity logic without claiming exact chart frequencies or calculations that were not supplied.
The decisionNode object is the source of truth. Recommend only an action listed in decisionNode.legalActions.
Use position, action order, pot, antes, facing size, effective stack, players remaining, and opponent ranges when supplied. Never invent payout pressure, cards, positions, sizes, or fold equity.
${LIVE_STACK_LEVERAGE_RULES}
${LIVE_MADE_HAND_SAFETY_RULES}
${preflopBaseline ? LIVE_PREFLOP_POSITION_RULES : ""}
${stageLens ? TOURNAMENT_STAGE_LIFECYCLE_RULES : ""}
${bountyLens ? BOUNTY_TOURNAMENT_LIFECYCLE_RULES : ""}
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "one legal action",
  "sizing": "concrete size or empty string",
  "sizing_bb": 12,
  "confidence": "low|medium|high",
  "reasoning": "concise short-stack range justification and response plan",
  "assumptions": ["short assumption"],
  "alternative_action": "another legal action or empty string",
  "alternative_sizing": "concrete size or empty string",
  "flavor_text": "short tactical coaching line"
}

Rules:
- hero_action: choose only from decisionNode.legalActions.
- When facing a wager, never recommend check or bet. When no wager is faced postflop, never recommend call or fold.
- Emphasize jam/fold/induce logic, but retain non-all-in opens, flats, and raise-folds when stack depth, price, and range construction support them. If recommending a non-all-in raise, state the plan versus a shove.
- sizing must be precise. sizing_bb is the total numeric BB size for an open, raise, bet, or call; use null for check or fold and decisionNode.maxHeroTotalToBB for a jam when known.
- reasoning must place Hero's exact combo inside a position- and action-specific range, identify the main fold-equity/blocker driver, and give the conditional plan versus calls or reshoves.
- Use decisionNode.missingInformation as assumptions when it materially changes the answer and lower confidence accordingly.
- Apply ICM, ladder pressure, or survival premiums only when explicit payout/stage information is supplied. Otherwise use tournament chip-EV and say that ICM is unknown rather than inventing it.
- At more than 20 BB effective, call out that pure shove/fold is too narrow and prefer a normal range strategy where legal.
- Default to folding trash hands with <12 BB when facing raises unless blockers or antes justify aggression.
- The alternative must be the main credible range branch, not an arbitrary legal action.
- flavor_text: <= 18 words, concise and tactical, referencing stack depth, fold equity, blockers, or explicit ICM. No hype.`;

  const user = `Context: ${JSON.stringify(shortContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the optimal short-stack line using shove/fold logic and plan for villain reactions."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.15,
    top_p: 0.6,
    max_tokens: 300,
    model,
    ...structuredLiveDecisionConfig(legalActions, "short_stack_ninja_decision"),
  });

  return buildResponse(
    parsed,
    completion,
    "Stay sharp with shove-or-fold discipline.",
    liveCoachFallbackAction(legalActions, preflopBaseline),
    legalActions,
    context,
  );
}

async function runRangeProfessor(context = {}, instruction, model) {
  const decisionNode =
    context?.decisionNode && typeof context.decisionNode === "object"
      ? context.decisionNode
      : {};
  const legalActions = Array.isArray(decisionNode?.legalActions)
    ? decisionNode.legalActions
    : Array.isArray(context?.legalActions)
      ? context.legalActions
      : [];
  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return buildIncompleteLiveCoachResponse({
      flavorText: "Select hero cards for Range Professor.",
      reasoning: "Hole cards are required to place this combo inside the relevant betting or continuing range.",
      assumptions: ["hero_cards_missing"],
      legalActions,
    });
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
  const format = String(
    decisionNode?.gameType || context?.gameType || context?.format || "unknown",
  );
  const stacks = stackSnapshot(context);
  const preflopBaseline = buildLivePreflopGuidance(context);
  const stageLens = selectedTournamentStageGuidance(context);
  const bountyLens = selectedBountyTournamentGuidance(context);
  const effectiveStack = stacks.effective ?? stacks.hero ?? null;
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
        ? "Stakes: Unknown - use a balanced baseline without claiming exact solver frequencies."
        : "",
    relativePosition === "ip"
      ? "In position: leverage informational advantage to mix flats and controlled aggression."
      : relativePosition === "oop"
        ? "Out of position: temper barreling frequency, protect checking ranges, lean on bluff-catchers judiciously."
        : "",
    format === "tournament"
      ? stackBucket === "deep"
        ? "Tournament context, deep stack (60bb+): retain high-SPR range construction and positional opens; do not infer an early tournament stage from depth."
        : stackBucket === "medium"
          ? "Tournament context, medium stack (30-60bb): use selective steals and coherent commitment plans; stage pressure is a separate input."
          : stackBucket === "short"
            ? "Tournament context, short stack (<30bb): preserve fold equity and use stack-coherent opens or jams without inferring a late stage."
            : "Tournament context: adjust ranges based on stack depth."
      : "",
    stageLens
      ? `Tournament stage: ${stageLens.label}; coverage role: ${stageLens.coverageRole}; risk premium: ${stageLens.riskPremium}.`
      : "",
    bountyLens
      ? `Bounty context: ${bountyLens.label}; coverage role: ${bountyLens.coverageRole}; adjustment is qualitative because no bounty amount was supplied.`
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
    preflopBaseline,
    stackBucket,
    relativePosition,
    decisionNode,
    potSize: context?.potSize,
    heroProfile: {
      riskTolerance: "medium",
      style: "balanced_position_aware",
      guidance:
        "Use position-appropriate aggression and defend frequencies preflop; apply pot control postflop when nut or range advantage is unclear.",
    },
    stakeTier: stakeTier,
    stakeGuidance: stakeGuide ? stakeGuide.note : undefined,
    stageLens,
    bountyLens,
  };

  const system = `You are Range Professor, a state-first poker range-construction coach.
Evaluate the exact hand as one combo inside position- and action-specific ranges, using blockers, board texture, stack depth, sizing, and positional awareness.
Use GTO-informed baselines without claiming solver precision or exact equilibrium frequencies. Label exploitative deviations and tie them to supplied opponent or population evidence.
The decisionNode object is the source of truth. Recommend only an action listed in decisionNode.legalActions.
Do not invent missing cards, positions, player counts, pot odds, bet sizes, ranges, stack values, ICM pressure, or prior actions. Lower confidence and list material assumptions.
${LIVE_STACK_LEVERAGE_RULES}
${LIVE_MADE_HAND_SAFETY_RULES}
${preflopBaseline ? LIVE_PREFLOP_POSITION_RULES : ""}
${stageLens ? TOURNAMENT_STAGE_LIFECYCLE_RULES : ""}
${bountyLens ? BOUNTY_TOURNAMENT_LIFECYCLE_RULES : ""}
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "one legal action",
  "sizing": "concrete size or empty string",
  "sizing_bb": 5.5,
  "confidence": "low|medium|high",
  "reasoning": "concise exact-combo and range-construction justification",
  "assumptions": ["short assumption"],
  "alternative_action": "another legal action or empty string",
  "alternative_sizing": "concrete size or empty string",
  "flavor_text": "short analytical coaching line"
}

Rules:
- hero_action: choose only from decisionNode.legalActions.
- When facing a wager, never recommend check or bet. When no wager is faced postflop, never recommend call or fold.
- sizing must be tied to the whole range strategy. sizing_bb is the total numeric BB size for an open, raise, bet, or call; use null for check or fold.
- reasoning must distinguish the exact-combo decision from the broader value, bluff/semi-bluff, checking, calling, and folding regions when the known state supports those claims. Name whether the strategy is merged, polarized, range-betting, or check-heavy where relevant.
- Use decisionNode.missingInformation as assumptions when it materially affects range construction, and lower confidence accordingly.
- The alternative must be the main credible range branch or mixed-strategy counterpart, not an arbitrary legal action.
- flavor_text: <= 22 words, analytical, reference range or blocker insights when useful, no hype.
- Consider hero hand ${readable} and anticipate likely villain responses for the next decisions.
- When board cards are present, state hero's current made hand class (e.g. top pair, two pair, set, straight) before discussing draw potential.
- Use solver-baseline lines first; call out exploitative departures and rationale when you recommend them.
- On preflop nodes, apply preflopBaseline before the generic tier label. A hand labelled marginal or trash in isolation may still be a standard BTN/CO open or priced blind defend.
- Pair plus strong draw combinations (e.g. pair + flush draw or pair + open-ended) typically continue versus single raises; only fold with clear GTO justification (stack, range disadvantage, extreme sizing).
- When the board shows three or more of a suit, tighten calling frequencies without that suit blocker; default to folding two-pair or weaker versus large raises unless blockers or sizing justify a hero call.
- Preflop: protect a calling range. In position versus 3-bets, mix flats with suited broadways, pocket pairs, and Axs; out of position, defend with suited broadways/pairs that play well post-flop while keeping 4-bet traps for premiums.
- Hero profile: balanced and position-aware; use controlled aggression postflop, but do not suppress routine late-position opens, steals, calls, or blind defenses merely to reduce variance.
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
    temperature: 0.15,
    top_p: 0.6,
    max_tokens: 320,
    model,
    ...structuredLiveDecisionConfig(legalActions, "range_professor_decision"),
  });

  return buildResponse(
    parsed,
    completion,
    "Balance range discipline.",
    liveCoachFallbackAction(legalActions, preflopBaseline),
    legalActions,
    context,
  );
}

