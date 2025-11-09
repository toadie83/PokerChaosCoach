import OpenAI from "openai";

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

const VALUE_TO_RANK = Object.entries(RANK_VALUES).reduce((acc, [rank, value]) => {
  acc[value] = rank;
  return acc;
}, {});

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
      (highValue === heroStraight.high &&
        heroStraight.boardOnly &&
        !boardOnly)
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
    !boardNutHigh || heroStraight.high >= boardNutHigh
      ? true
      : false;

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
    (a, b) => b - a
  );
  const boardHigh = sortedBoardValues[0] ?? null;
  const boardSecond = sortedBoardValues[1] ?? null;
  const boardLow = sortedBoardValues[sortedBoardValues.length - 1] ?? null;

  const suitEntries = Array.from(suitCounts.entries());
  const flushSuitEntry = suitEntries.find(([, count]) => count >= 5);
  const hasFlush = Boolean(flushSuitEntry);
  const boardSuitEntries = Array.from(boardSuitCounts.entries()).sort(
    (a, b) => b[1] - a[1]
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
        secondRank
      )}.`;
      detail = `Full house (${describePlural(topRank)} full of ${describePlural(
        secondRank
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
          ? straightDetails.boardNutLabel.replace(
              /^([a-z])/,
              (letter) => letter.toUpperCase()
            )
          : null;
        detail = `${heroLabel} straight`;
        if (straightDetails.hero.boardOnly) {
          summary = `${heroLabel} straight on board.`;
          notes.push("Straight relies entirely on board cards; no kicker edge.");
        } else {
          summary = `${heroLabel} straight.`;
        }
        if (!straightDetails.isNut && boardNutLabel) {
          notes.push(
            `${boardNutLabel} straights remain; avoid treating the hand as the nuts.`
          );
          summary = `${summary.replace(
            /\.$/,
            ""
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
        ([rank, count]) => count >= 2 && heroRanks.has(rank)
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
          " "
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
      " and "
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
            .includes(w)
        )
          ? 1
          : 0),
      0
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
        }`
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
        ", "
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
  fallbackAction = "aggress"
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

export async function getAggressionPrompt(context = {}, instruction) {
  const persona = String(context?.persona || "chaos_shark");
  const requestedModel =
    typeof context?.model === "string" && context.model.trim()
      ? context.model.trim()
      : null;
  const model = requestedModel && ALLOWED_MODELS.has(requestedModel)
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
      note:
        "Population over-calls and under-bluffs; widen thin value bets, trim pure bluffs, punish passive lines.",
    },
    low: {
      label: "Low stakes",
      note:
        "Expect loose preflop calls and passive postflop play; value bet hard, probe capped ranges, distrust big river bluffs.",
    },
    mid: {
      label: "Mid stakes",
      note:
        "Regulars mix balanced aggression; defend enough vs steals, mix blocker-driven bluffs, respect credible multi-barrels.",
    },
    high: {
      label: "High stakes",
      note:
        "Population balances ranges well; default to solver baselines, seize polarized spots, and anticipate double/triple barrels.",
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
    /preflop_multiple_villains_opened/.test(String(code))
  );
  const multiwayNote = multiOpened
    ? "Preflop: multiple villains entered before hero - expect multiway pots."
    : null;
  const facingOpen = previous.some((code) =>
    /preflop_opened_to_me|preflop_multiple_villains_opened|preflop_faced_3bet/.test(
      String(code)
    )
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
    fallbackAction
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
    /preflop_multiple_villains_opened/.test(String(code))
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
    "aggress"
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
    "jam"
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
    context?.branch
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
      note:
        "Population over-calls and under-bluffs; widen thin value bets, trim pure bluffs, punish passive lines.",
    },
    low: {
      label: "Low stakes",
      note:
        "Expect loose preflop calls and passive postflop play; value bet hard, probe capped ranges, distrust big river bluffs.",
    },
    mid: {
      label: "Mid stakes",
      note:
        "Regulars mix balanced aggression; defend enough vs steals, mix blocker-driven bluffs, respect credible multi-barrels.",
    },
    high: {
      label: "High stakes",
      note:
        "Population balances ranges well; default to solver baselines, seize polarized spots, and anticipate double/triple barrels.",
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
