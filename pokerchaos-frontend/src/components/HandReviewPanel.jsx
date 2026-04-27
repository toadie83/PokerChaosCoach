import { useEffect, useMemo, useRef, useState } from "react";
import {
  requestHandHistoryParse,
  requestHandHistoryReview,
  requestTournamentSummaryReview,
} from "../api/aiService.js";

function formatHeroCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return "Unknown";
  return cards.join(" ");
}

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return "-";
  }
  return Number(score) > 0 ? `+${Number(score)}` : `${Number(score)}`;
}

function formatAction(action) {
  if (!action) return "";
  if (action.type === "raise" && action.toAmount) {
    return `raise to ${action.toAmount}`;
  }
  if (action.type === "jam") {
    if (action.toAmount) return `jam to ${action.toAmount}`;
    if (action.amount) return `jam ${action.amount}`;
    return "jam";
  }
  if (action.amount) {
    return `${action.type} ${action.amount}`;
  }
  return action.type;
}

function formatActionWithPlayer(action) {
  if (!action) return "";
  const player = String(action.player || "").trim();
  const actionLabel = formatAction(action);
  if (!player) return actionLabel;
  return `${player}: ${actionLabel}`;
}

function safePercent(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return (n / d) * 100;
}

function percentLabel(value) {
  return `${value.toFixed(1)}%`;
}

function formatPercentCount(stat) {
  if (!stat || !Number.isFinite(Number(stat.pct)) || Number(stat.total) <= 0) {
    return "n/a";
  }
  return `${percentLabel(Number(stat.pct))} (${Number(stat.count)}/${Number(
    stat.total
  )})`;
}

function formatAggression(aggression) {
  const hasFrequency = Number.isFinite(Number(aggression?.frequencyPct));
  const frequency = hasFrequency
    ? percentLabel(Number(aggression.frequencyPct))
    : "n/a";
  const calls = Number(aggression?.calls) || 0;
  const aggressiveActions = Number(aggression?.aggressiveActions) || 0;
  const factorRaw = aggression?.factor;
  const factor =
    Number.isFinite(Number(factorRaw)) && calls > 0
      ? Number(factorRaw).toFixed(2)
      : calls === 0 && aggressiveActions > 0
      ? "inf"
      : "n/a";
  return `Freq ${frequency} | AF ${factor}`;
}

function formatLatestSeat(latestSeat) {
  const number = Number(latestSeat?.number);
  const position = String(latestSeat?.position || "").trim();
  const hasNumber = Number.isFinite(number) && number > 0;
  if (hasNumber && position) return `Seat ${number} (${position})`;
  if (hasNumber) return `Seat ${number}`;
  if (position) return position;
  return "Seat unknown";
}

function formatChipStack(chips) {
  const value = Number(chips);
  if (!Number.isFinite(value) || value < 0) return "Stack n/a";
  return `Stack ~${Math.round(value).toLocaleString()}`;
}

function extractTendencyLabels(player) {
  if (!Array.isArray(player?.tags)) return [];
  return player.tags
    .map((tag) => String(tag?.label || "").trim())
    .filter(Boolean);
}

function formatPlayNote(player) {
  const text = String(player?.playNote?.text || "").trim();
  if (!text) return null;
  const confidence = String(player?.playNote?.confidence || "")
    .trim()
    .toLowerCase();
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    return `${text} (${confidence} confidence)`;
  }
  return text;
}

function seatCategory(position) {
  const seat = String(position || "").toUpperCase();
  if (!seat) return "unknown";
  if (["BTN", "CO", "HJ"].includes(seat)) return "late";
  if (["LJ", "UTG", "UTG+1", "UTG+2"].includes(seat)) return "early";
  if (["SB", "BB"].includes(seat)) return "blind";
  return "middle";
}

function scoreClass(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "neutral";
  if (numeric >= 1) return "good";
  if (numeric <= -1) return "bad";
  return "neutral";
}

function handKey(hand) {
  const handId = String(hand?.handId || "");
  const playedAt = String(hand?.playedAt || "");
  const tournamentId = String(hand?.tournamentId || "");
  return `${handId}::${playedAt}::${tournamentId}`;
}

function outcomeClass(code) {
  if (typeof code !== "string") return "unknown";
  if (code.startsWith("won_")) return "won";
  if (code.startsWith("folded_")) return "folded";
  if (code.includes("lost")) return "lost";
  return "unknown";
}

function formatBoard(board) {
  const flop = Array.isArray(board?.flop) ? board.flop.filter(Boolean) : [];
  const turn = board?.turn ? [board.turn] : [];
  const river = board?.river ? [board.river] : [];
  const cards = [...flop, ...turn, ...river];
  return cards.length ? cards.join(" ") : "No board dealt (hand ended preflop)";
}

function formatBoardStreet(board, street) {
  if (street === "flop") {
    const flop = Array.isArray(board?.flop) ? board.flop.filter(Boolean) : [];
    return flop.length ? flop.join(" ") : "Not dealt";
  }
  if (street === "turn") {
    return board?.turn || "Not dealt";
  }
  if (street === "river") {
    return board?.river || "Not dealt";
  }
  return "Not dealt";
}

function uniquePlayersForStreet(actions) {
  const seen = new Set();
  for (const action of actions || []) {
    const player = String(action?.player || "").trim();
    if (!player) continue;
    seen.add(player);
  }
  return seen;
}

function streetPlayersLabel(hand) {
  const flopPlayers = uniquePlayersForStreet(hand?.actionsByStreet?.flop || []);
  const turnPlayers = uniquePlayersForStreet(hand?.actionsByStreet?.turn || []);
  const riverPlayers = uniquePlayersForStreet(hand?.actionsByStreet?.river || []);
  if (flopPlayers.size > 0) {
    const multiway = flopPlayers.size > 2 ? "multiway" : "heads-up";
    return `Flop players: ${flopPlayers.size} (${multiway})`;
  }
  if (turnPlayers.size > 0 || riverPlayers.size > 0) {
    const active = Math.max(turnPlayers.size, riverPlayers.size);
    return `Postflop players: ${active}`;
  }
  return "Hand ended preflop";
}

const PRE_FLOP_DECISION_TYPES = new Set([
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "jam",
]);
const PRE_FLOP_AGGRESSIVE_TYPES = new Set(["bet", "raise", "jam"]);

function normalizeActionType(action) {
  return String(action?.type || "")
    .trim()
    .toLowerCase();
}

function isPreflopDecisionAction(action) {
  const type = normalizeActionType(action);
  return PRE_FLOP_DECISION_TYPES.has(type);
}

function isPreflopAggressiveAction(action) {
  const type = normalizeActionType(action);
  return PRE_FLOP_AGGRESSIVE_TYPES.has(type);
}

function rateCountLabel(numerator, denominator) {
  if (!Number.isFinite(Number(denominator)) || Number(denominator) <= 0) {
    return "n/a";
  }
  return `${percentLabel(safePercent(numerator, denominator))} (${numerator}/${denominator})`;
}

function incrementMapCount(map, key) {
  const id = String(key || "").trim() || "Unknown";
  map.set(id, (map.get(id) || 0) + 1);
}

function confidenceFromSample(sampleSize) {
  const n = Number(sampleSize);
  if (!Number.isFinite(n) || n <= 0) return "insufficient";
  if (n >= 30) return "high";
  if (n >= 12) return "medium";
  if (n >= 6) return "low";
  return "insufficient";
}

function confidenceLabel(confidence) {
  if (confidence === "high") return "high confidence";
  if (confidence === "medium") return "medium confidence";
  if (confidence === "low") return "low confidence";
  return "insufficient sample";
}

function formatRateWithConfidence(numerator, denominator) {
  return `${rateCountLabel(numerator, denominator)} - ${confidenceLabel(
    confidenceFromSample(denominator)
  )}`;
}

function buildTournamentCoachSummary(summary) {
  if (!summary?.preflopBreakdown) return null;
  const pre = summary.preflopBreakdown;
  const candidates = [];
  const openRate = safePercent(
    pre.openedWhenNoRaiseBeforeHero,
    pre.noRaiseBeforeHeroSpots
  );
  const defendRate = safePercent(pre.defendedFacingOpen, pre.facingOpenSpots);
  const blindFoldRate = safePercent(
    pre.blindFoldFacingOpen,
    pre.blindFacingOpenSpots
  );
  const reraiseFoldRate = safePercent(
    pre.foldedAfterFacingReraise,
    pre.facedReraiseAfterAggressionSpots
  );

  if (pre.noRaiseBeforeHeroSpots >= 12 && openRate < 28) {
    candidates.push({
      key: "opening_low",
      severity: 28 - openRate,
      label: "Under-opening in first-in spots",
      evidence: `Open rate in no-raise spots is ${rateCountLabel(
        pre.openedWhenNoRaiseBeforeHero,
        pre.noRaiseBeforeHeroSpots
      )}.`,
      action:
        "Increase opens first from late and mid positions before changing marginal defend spots.",
      confidence: confidenceFromSample(pre.noRaiseBeforeHeroSpots),
    });
  }

  if (pre.facingOpenSpots >= 12 && defendRate < 32) {
    candidates.push({
      key: "defending_low",
      severity: 32 - defendRate,
      label: "Overfolding when facing opens",
      evidence: `Defend rate facing opens is ${rateCountLabel(
        pre.defendedFacingOpen,
        pre.facingOpenSpots
      )}.`,
      action:
        "Add more calls and 3-bets in facing-open spots, starting with BB and BTN defenses.",
      confidence: confidenceFromSample(pre.facingOpenSpots),
    });
  }

  if (pre.blindFacingOpenSpots >= 12 && blindFoldRate > 66) {
    candidates.push({
      key: "blind_overfold",
      severity: blindFoldRate - 66,
      label: "Blinds are folding too often versus opens",
      evidence: `Blind fold vs open is ${rateCountLabel(
        pre.blindFoldFacingOpen,
        pre.blindFacingOpenSpots
      )}.`,
      action:
        "Widen BB defend first, then selectively add SB 3-bet/call continues versus late opens.",
      confidence: confidenceFromSample(pre.blindFacingOpenSpots),
    });
  }

  if (pre.facedReraiseAfterAggressionSpots >= 8 && reraiseFoldRate > 78) {
    candidates.push({
      key: "fold_to_reraise_high",
      severity: reraiseFoldRate - 78,
      label: "Likely overfolding after facing reraises",
      evidence: `Fold after reraises is ${rateCountLabel(
        pre.foldedAfterFacingReraise,
        pre.facedReraiseAfterAggressionSpots
      )}.`,
      action:
        "Review open and 3-bet ranges so your aggressive lines do not auto-fold too often to pressure.",
      confidence: confidenceFromSample(pre.facedReraiseAfterAggressionSpots),
    });
  }

  candidates.sort((a, b) => b.severity - a.severity);
  const primary = candidates[0] || null;
  const secondary = candidates[1] || null;

  const openSignal =
    pre.noRaiseBeforeHeroSpots < 8
      ? "low sample"
      : openRate < 28
      ? "too low"
      : "ok";
  const defendSignal =
    pre.facingOpenSpots < 8
      ? "low sample"
      : defendRate < 32
      ? "too low"
      : "ok";
  const blindFoldSignal =
    pre.blindFacingOpenSpots < 8
      ? "low sample"
      : blindFoldRate > 66
      ? "too high"
      : "ok";
  const reraiseSignal =
    pre.facedReraiseAfterAggressionSpots < 8
      ? "low sample"
      : reraiseFoldRate > 78
      ? "too high"
      : "ok";

  const evidence = [
    `Open first-in: ${rateCountLabel(
      pre.openedWhenNoRaiseBeforeHero,
      pre.noRaiseBeforeHeroSpots
    )} - ${openSignal}`,
    `Defend vs open: ${rateCountLabel(
      pre.defendedFacingOpen,
      pre.facingOpenSpots
    )} - ${defendSignal}`,
    `Blind fold vs open: ${rateCountLabel(
      pre.blindFoldFacingOpen,
      pre.blindFacingOpenSpots
    )} - ${blindFoldSignal}`,
  ];
  if (pre.facedReraiseAfterAggressionSpots > 0) {
    evidence.push(
      `Fold after reraise: ${rateCountLabel(
        pre.foldedAfterFacingReraise,
        pre.facedReraiseAfterAggressionSpots
      )} - ${reraiseSignal}`
    );
  }

  const actions = [];
  if (primary?.action) actions.push(primary.action);
  if (secondary?.action) actions.push(secondary.action);
  if (actions.length === 0) {
    actions.push(
      "No dominant leak signal yet. Keep collecting hands and focus on the largest preflop opportunity buckets."
    );
  }

  return {
    primaryLeak:
      primary?.label || "No single dominant leak identified in current sample",
    secondaryLeak: secondary?.label || null,
    evidence: evidence.slice(0, 4),
    actions,
  };
}

function buildAiSummaryParagraph(review) {
  if (!review || typeof review !== "object") return "";
  const primaryLeak = String(review.primary_leak || "").trim();
  const secondaryLeak = String(review.secondary_leak || "").trim();
  const confidence = confidenceLabel(String(review.confidence || "").trim().toLowerCase());
  const evidence = Array.isArray(review.evidence)
    ? review.evidence.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const actions = Array.isArray(review.actions)
    ? review.actions.map((line) => String(line || "").trim()).filter(Boolean)
    : [];
  const warnings = Array.isArray(review.warnings)
    ? review.warnings.map((line) => String(line || "").trim()).filter(Boolean)
    : [];

  const evidenceSnippet = evidence.slice(0, 3).join(" ");
  const actionSnippet = actions.slice(0, 3).join(" ");
  const warningSnippet = warnings.slice(0, 1).join(" ");

  const parts = [];
  if (primaryLeak) {
    parts.push(`Primary leak: ${primaryLeak}.`);
  }
  if (secondaryLeak && !/no secondary leak flagged/i.test(secondaryLeak)) {
    parts.push(`Secondary leak: ${secondaryLeak}.`);
  }
  parts.push(`Confidence: ${confidence}.`);
  if (evidenceSnippet) {
    parts.push(`Key evidence: ${evidenceSnippet}`);
  }
  if (actionSnippet) {
    parts.push(`Focus next on: ${actionSnippet}`);
  }
  if (warningSnippet) {
    parts.push(`Caution: ${warningSnippet}`);
  }
  return parts.join(" ");
}

const TIME_FILTER_OPTIONS = [
  { code: "all_time", label: "All time", ms: null },
  { code: "last_1h", label: "Last 1 hour", ms: 60 * 60 * 1000 },
  { code: "last_2h", label: "Last 2 hours", ms: 2 * 60 * 60 * 1000 },
];

function parsePlayedAtEpoch(raw) {
  if (typeof raw !== "string") return null;
  const match =
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function getHandPlayedAtEpoch(hand) {
  const direct = Number(hand?.playedAtEpoch);
  if (Number.isFinite(direct)) return direct;
  return parsePlayedAtEpoch(String(hand?.playedAt || ""));
}

const HAND_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const HAND_RANK_INDEX = HAND_RANKS.reduce((map, rank, idx) => {
  map[rank] = idx;
  return map;
}, {});

function expandRangeToken(token) {
  const text = String(token || "").trim().toUpperCase();
  if (!text) return [];

  const pairExact = /^([2-9TJQKA])\1$/.exec(text);
  if (pairExact) return [text];

  const pairPlus = /^([2-9TJQKA])\1\+$/.exec(text);
  if (pairPlus) {
    const startIdx = HAND_RANK_INDEX[pairPlus[1]];
    if (!Number.isFinite(startIdx)) return [];
    return HAND_RANKS.slice(startIdx).map((rank) => `${rank}${rank}`);
  }

  const offsuitOrSuitedExact = /^([2-9TJQKA])([2-9TJQKA])(S|O)$/.exec(text);
  if (offsuitOrSuitedExact) return [text];

  const offsuitOrSuitedPlus = /^([2-9TJQKA])([2-9TJQKA])(S|O)\+$/.exec(text);
  if (offsuitOrSuitedPlus) {
    const hi = offsuitOrSuitedPlus[1];
    const lo = offsuitOrSuitedPlus[2];
    const suitFlag = offsuitOrSuitedPlus[3];
    const hiIdx = HAND_RANK_INDEX[hi];
    const loIdx = HAND_RANK_INDEX[lo];
    if (!Number.isFinite(hiIdx) || !Number.isFinite(loIdx) || loIdx >= hiIdx) {
      return [];
    }
    const expanded = [];
    for (let idx = loIdx; idx < hiIdx; idx += 1) {
      expanded.push(`${hi}${HAND_RANKS[idx]}${suitFlag}`);
    }
    return expanded;
  }

  return [];
}

function makeRangeSet(tokens) {
  const set = new Set();
  for (const token of tokens || []) {
    for (const combo of expandRangeToken(token)) {
      set.add(combo);
    }
  }
  return set;
}

function normalizeHeroHandCode(cards) {
  if (!Array.isArray(cards) || cards.length < 2) return null;
  const c1 = String(cards[0] || "").trim().toUpperCase();
  const c2 = String(cards[1] || "").trim().toUpperCase();
  if (c1.length < 2 || c2.length < 2) return null;
  const r1 = c1[0];
  const r2 = c2[0];
  const s1 = c1[c1.length - 1];
  const s2 = c2[c2.length - 1];
  if (!HAND_RANK_INDEX.hasOwnProperty(r1) || !HAND_RANK_INDEX.hasOwnProperty(r2)) {
    return null;
  }
  if (r1 === r2) return `${r1}${r2}`;
  const firstIsHigher = HAND_RANK_INDEX[r1] > HAND_RANK_INDEX[r2];
  const hi = firstIsHigher ? r1 : r2;
  const lo = firstIsHigher ? r2 : r1;
  const suited = s1 === s2 ? "S" : "O";
  return `${hi}${lo}${suited}`;
}

function normalizePositionForRanges(rawPosition) {
  const pos = String(rawPosition || "").trim().toUpperCase();
  if (!pos) return null;
  if (pos === "UTG+2" || pos === "MP") return "LJ";
  if (pos === "MP+1") return "HJ";
  if (pos === "HIJACK") return "HJ";
  if (pos === "CUTOFF") return "CO";
  if (pos === "DEALER") return "BTN";
  if (pos === "SMALL BLIND") return "SB";
  if (pos === "BIG BLIND") return "BB";
  return pos;
}

function buildPreflopRangeModel() {
  return {
    openRfi: {
      UTG: makeRangeSet(["77+", "AJS+", "KQS", "AQO+", "A5S", "A4S"]),
      "UTG+1": makeRangeSet(["66+", "ATS+", "KJS+", "QJS", "AJO+", "KQO", "A5S", "A4S"]),
      LJ: makeRangeSet(["55+", "A9S+", "KTS+", "QTS+", "JTS", "T9S", "98S", "AJO+", "KQO"]),
      HJ: makeRangeSet([
        "44+",
        "A8S+",
        "KTS+",
        "QTS+",
        "JTS",
        "T9S",
        "98S",
        "87S",
        "ATO+",
        "KQO",
        "QJO",
      ]),
      CO: makeRangeSet([
        "22+",
        "A2S+",
        "K9S+",
        "Q9S+",
        "J9S+",
        "T9S",
        "98S",
        "87S",
        "76S",
        "65S",
        "54S",
        "A8O+",
        "KTO+",
        "QTO+",
        "JTO",
      ]),
      BTN: makeRangeSet([
        "22+",
        "A2S+",
        "K5S+",
        "Q7S+",
        "J7S+",
        "T7S+",
        "97S+",
        "86S+",
        "75S+",
        "64S+",
        "54S",
        "43S",
        "A2O+",
        "K9O+",
        "Q9O+",
        "J9O+",
        "T9O",
      ]),
      SB: makeRangeSet([
        "22+",
        "A2S+",
        "K7S+",
        "Q8S+",
        "J8S+",
        "T8S+",
        "97S+",
        "86S+",
        "75S+",
        "65S",
        "54S",
        "A7O+",
        "KTO+",
        "QTO+",
        "JTO",
      ]),
    },
    defendVsOpen: {
      BB: makeRangeSet([
        "22+",
        "A2S+",
        "A2O+",
        "K5S+",
        "K9O+",
        "Q7S+",
        "Q9O+",
        "J7S+",
        "J9O+",
        "T7S+",
        "T9O",
        "97S+",
        "87S",
        "76S",
        "65S",
        "54S",
      ]),
      SB: makeRangeSet([
        "22+",
        "A2S+",
        "A8O+",
        "K9S+",
        "KTO+",
        "Q9S+",
        "QTO+",
        "J9S+",
        "JTO",
        "T9S",
        "98S",
        "87S",
      ]),
      BTN: makeRangeSet(["55+", "A7S+", "ATO+", "KTS+", "KQO", "QTS+", "JTS", "T9S", "98S"]),
      CO: makeRangeSet(["66+", "ATS+", "AQO+", "KQS", "KJS", "QJS", "JTS", "T9S"]),
      HJ: makeRangeSet(["77+", "AJS+", "AQO+", "KQS", "QJS"]),
      LJ: makeRangeSet(["88+", "AJS+", "AQO+", "KQS"]),
      "UTG+1": makeRangeSet(["TT+", "AQS+", "AKO"]),
      UTG: makeRangeSet(["JJ+", "AKS", "AKO"]),
    },
    continueVs3BetAfterOpen: {
      UTG: makeRangeSet(["QQ+", "AKS", "AKO", "AQS"]),
      "UTG+1": makeRangeSet(["JJ+", "AKS", "AKO", "AQS"]),
      LJ: makeRangeSet(["TT+", "AJS+", "AKO", "AQO", "KQS"]),
      HJ: makeRangeSet(["99+", "ATS+", "AQO+", "KQS"]),
      CO: makeRangeSet(["88+", "ATS+", "AJO+", "KQS", "KJS", "QJS"]),
      BTN: makeRangeSet(["77+", "A9S+", "ATO+", "KTS+", "KQO", "QTS+", "JTS"]),
      SB: makeRangeSet(["88+", "ATS+", "AQO+", "KQS"]),
    },
  };
}

const PRE_FLOP_RANGE_MODEL = buildPreflopRangeModel();

function rangeContains(rangeMap, position, handCode) {
  if (!position || !handCode) return false;
  const set = rangeMap[position];
  if (!set) return false;
  return set.has(handCode);
}

function summarizeAuditEvents(events) {
  const byPosition = new Map();
  const byCombo = new Map();

  for (const event of events || []) {
    const position = String(event?.position || "Unknown");
    const handCode = String(event?.handCode || "Unknown");
    byPosition.set(position, (byPosition.get(position) || 0) + 1);
    const key = `${position}|${handCode}`;
    const state = byCombo.get(key) || {
      position,
      handCode,
      count: 0,
      sampleHandKey: String(event?.handKey || "").trim() || null,
      sampleHandId: String(event?.handId || "").trim() || null,
      samplePlayedAt: String(event?.playedAt || "").trim() || null,
    };
    state.count += 1;
    if (!state.sampleHandKey) {
      state.sampleHandKey = String(event?.handKey || "").trim() || null;
      state.sampleHandId = String(event?.handId || "").trim() || null;
      state.samplePlayedAt = String(event?.playedAt || "").trim() || null;
    }
    byCombo.set(key, state);
  }

  return {
    byPosition: Array.from(byPosition.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position)),
    topCombos: Array.from(byCombo.values())
      .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position))
      .slice(0, 8),
    examples: (events || []).slice(0, 6),
  };
}

function buildPreflopOpportunityAudit(hands) {
  const list = Array.isArray(hands) ? hands : [];
  const missedOpenEvents = [];
  const missedDefendEvents = [];
  const overfoldVs3BetEvents = [];
  const looseOpenEvents = [];
  const looseDefendEvents = [];
  const looseContinueVs3BetEvents = [];

  let rfiSpotsScored = 0;
  let facingOpenSpotsScored = 0;
  let vs3BetSpotsScored = 0;
  let expectedOpenSpots = 0;
  let expectedDefendSpots = 0;
  let expectedContinueVs3BetSpots = 0;
  let unknownCardsSpots = 0;

  for (const hand of list) {
    const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
      ? hand.actionsByStreet.preflop
      : [];
    const heroName = String(hand?.heroName || "").trim();
    if (!heroName || preflopActions.length === 0) continue;

    const position = normalizePositionForRanges(hand?.heroPosition);
    if (!position) continue;

    const handCode = normalizeHeroHandCode(hand?.heroCards);
    if (!handCode) {
      unknownCardsSpots += 1;
      continue;
    }

    let firstHeroDecisionIndex = -1;
    let firstHeroDecision = null;
    for (let i = 0; i < preflopActions.length; i += 1) {
      const action = preflopActions[i];
      if (String(action?.player || "").trim() !== heroName) continue;
      if (!isPreflopDecisionAction(action)) continue;
      firstHeroDecisionIndex = i;
      firstHeroDecision = action;
      break;
    }
    if (firstHeroDecisionIndex < 0 || !firstHeroDecision) continue;

    const firstHeroDecisionType = normalizeActionType(firstHeroDecision);
    const priorOpponentAggression = preflopActions
      .slice(0, firstHeroDecisionIndex)
      .some(
        (action) =>
          String(action?.player || "").trim() !== heroName &&
          isPreflopAggressiveAction(action)
      );

    if (!priorOpponentAggression) {
      rfiSpotsScored += 1;
      const shouldOpen = rangeContains(PRE_FLOP_RANGE_MODEL.openRfi, position, handCode);
      const didOpen = isPreflopAggressiveAction(firstHeroDecision);
      if (shouldOpen) expectedOpenSpots += 1;
      if (shouldOpen && !didOpen) {
        missedOpenEvents.push({
          type: "missed_open",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: firstHeroDecisionType || "unknown",
          recommendation: "Open first in",
        });
      }
      if (!shouldOpen && didOpen) {
        looseOpenEvents.push({
          type: "loose_open",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: firstHeroDecisionType || "unknown",
          recommendation: "Fold or mix lower frequency",
        });
      }

      const heroRfiIndex = preflopActions.findIndex(
        (action, idx) =>
          idx >= firstHeroDecisionIndex &&
          String(action?.player || "").trim() === heroName &&
          isPreflopAggressiveAction(action)
      );
      if (heroRfiIndex >= 0) {
        const opp3BetIndex = preflopActions.findIndex(
          (action, idx) =>
            idx > heroRfiIndex &&
            String(action?.player || "").trim() !== heroName &&
            isPreflopAggressiveAction(action)
        );
        if (opp3BetIndex >= 0) {
          const heroResponse = preflopActions.find(
            (action, idx) =>
              idx > opp3BetIndex &&
              String(action?.player || "").trim() === heroName &&
              isPreflopDecisionAction(action)
          );
          if (heroResponse) {
            vs3BetSpotsScored += 1;
            const responseType = normalizeActionType(heroResponse);
            const shouldContinue = rangeContains(
              PRE_FLOP_RANGE_MODEL.continueVs3BetAfterOpen,
              position,
              handCode
            );
            const didContinue = responseType !== "fold";
            if (shouldContinue) expectedContinueVs3BetSpots += 1;
            if (shouldContinue && !didContinue) {
              overfoldVs3BetEvents.push({
                type: "overfold_vs_3bet",
                handKey: handKey(hand),
                handId: hand?.handId || "Unknown",
                playedAt: hand?.playedAt || "Unknown",
                position,
                handCode,
                actualAction: responseType || "unknown",
                recommendation: "Continue vs 3-bet",
              });
            }
            if (!shouldContinue && didContinue) {
              looseContinueVs3BetEvents.push({
                type: "loose_continue_vs_3bet",
                handKey: handKey(hand),
                handId: hand?.handId || "Unknown",
                playedAt: hand?.playedAt || "Unknown",
                position,
                handCode,
                actualAction: responseType || "unknown",
                recommendation: "Fold more often vs 3-bet",
              });
            }
          }
        }
      }
    } else {
      facingOpenSpotsScored += 1;
      const shouldDefend = rangeContains(
        PRE_FLOP_RANGE_MODEL.defendVsOpen,
        position,
        handCode
      );
      const didDefend = firstHeroDecisionType !== "fold";
      if (shouldDefend) expectedDefendSpots += 1;
      if (shouldDefend && !didDefend) {
        missedDefendEvents.push({
          type: "missed_defend",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: firstHeroDecisionType || "unknown",
          recommendation: "Defend vs open",
        });
      }
      if (!shouldDefend && didDefend) {
        looseDefendEvents.push({
          type: "loose_defend",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: firstHeroDecisionType || "unknown",
          recommendation: "Fold more often",
        });
      }
    }
  }

  const missedOpenSummary = summarizeAuditEvents(missedOpenEvents);
  const missedDefendSummary = summarizeAuditEvents(missedDefendEvents);
  const overfoldVs3BetSummary = summarizeAuditEvents(overfoldVs3BetEvents);
  const looseOpenSummary = summarizeAuditEvents(looseOpenEvents);
  const looseDefendSummary = summarizeAuditEvents(looseDefendEvents);
  const looseContinueVs3BetSummary = summarizeAuditEvents(looseContinueVs3BetEvents);

  const quickFixes = [];
  const topMissedOpenPosition = missedOpenSummary.byPosition[0];
  const topMissedDefendPosition = missedDefendSummary.byPosition[0];
  const topOverfold3BetPosition = overfoldVs3BetSummary.byPosition[0];
  if (topMissedOpenPosition) {
    quickFixes.push(
      `Open more first-in from ${topMissedOpenPosition.position}; ${topMissedOpenPosition.count} chart-qualified opens were missed.`
    );
  }
  if (topMissedDefendPosition) {
    quickFixes.push(
      `Defend more vs opens from ${topMissedDefendPosition.position}; ${topMissedDefendPosition.count} chart-qualified continues were folded.`
    );
  }
  if (topOverfold3BetPosition) {
    quickFixes.push(
      `Continue slightly wider vs 3-bets after opening from ${topOverfold3BetPosition.position}; strong continues are being folded.`
    );
  }
  if (quickFixes.length === 0) {
    quickFixes.push(
      "No dominant passive preflop leak from this chart-based check. Keep collecting volume for stronger signals."
    );
  }

  return {
    rfiSpotsScored,
    facingOpenSpotsScored,
    vs3BetSpotsScored,
    unknownCardsSpots,
    expectedOpenSpots,
    expectedDefendSpots,
    expectedContinueVs3BetSpots,
    missedOpen: {
      count: missedOpenEvents.length,
      ...missedOpenSummary,
    },
    missedDefend: {
      count: missedDefendEvents.length,
      ...missedDefendSummary,
    },
    overfoldVs3Bet: {
      count: overfoldVs3BetEvents.length,
      ...overfoldVs3BetSummary,
    },
    looseOpen: {
      count: looseOpenEvents.length,
      ...looseOpenSummary,
    },
    looseDefend: {
      count: looseDefendEvents.length,
      ...looseDefendSummary,
    },
    looseContinueVs3Bet: {
      count: looseContinueVs3BetEvents.length,
      ...looseContinueVs3BetSummary,
    },
    quickFixes,
  };
}

function hasAuditReference(event) {
  const key = String(event?.handKey || event?.sampleHandKey || "").trim();
  if (key) return true;
  const handId = String(event?.handId || event?.sampleHandId || "").trim();
  const playedAt = String(event?.playedAt || event?.samplePlayedAt || "").trim();
  return Boolean(handId || playedAt);
}

export default function HandReviewPanel() {
  const [heroName, setHeroName] = useState("Hero");
  const [historyText, setHistoryText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [handLimit, setHandLimit] = useState(200);
  const [preflopHandSet, setPreflopHandSet] = useState("all_hands");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all_time");
  const [sourceFileName, setSourceFileName] = useState("");
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [quickReviewHandKey, setQuickReviewHandKey] = useState("");
  const [loadingSummaryReview, setLoadingSummaryReview] = useState(false);
  const [error, setError] = useState("");
  const [summaryReviewError, setSummaryReviewError] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [reviewsByHandKey, setReviewsByHandKey] = useState({});
  const [summaryReview, setSummaryReview] = useState(null);
  const [selectedHandKeys, setSelectedHandKeys] = useState(() => new Set());
  const [selectedAuditHandKey, setSelectedAuditHandKey] = useState("");
  const [pendingAuditScrollKey, setPendingAuditScrollKey] = useState("");
  const [insightsTab, setInsightsTab] = useState("tournament");
  const [opponentFilter, setOpponentFilter] = useState("current_table");
  const [copiedOpponentKey, setCopiedOpponentKey] = useState("");
  const copyTimeoutRef = useRef(null);
  const handRowRefs = useRef(new Map());

  const canSubmit = historyText.trim().length > 0;
  const parsedHands = Array.isArray(parseResult?.hands) ? parseResult.hands : [];
  const opponentSnapshot = parseResult?.opponents || null;
  const opponentPlayers = Array.isArray(opponentSnapshot?.players)
    ? opponentSnapshot.players
    : [];
  const currentTableGuess = opponentSnapshot?.currentTableGuess || null;
  const currentTableGuessPlayers = Array.isArray(currentTableGuess?.players)
    ? currentTableGuess.players
    : [];
  const currentTablePlayerSet = useMemo(
    () =>
      new Set(
        currentTableGuessPlayers
          .map((seat) => String(seat?.player || "").trim())
          .filter(Boolean)
      ),
    [currentTableGuessPlayers]
  );
  const currentTableSeatByPlayer = useMemo(() => {
    const map = new Map();
    for (const seat of currentTableGuessPlayers) {
      const player = String(seat?.player || "").trim();
      const number = Number(seat?.seat);
      if (!player || !Number.isFinite(number)) continue;
      map.set(player, number);
    }
    return map;
  }, [currentTableGuessPlayers]);
  const visibleOpponentPlayers = useMemo(() => {
    if (opponentFilter !== "current_table") return opponentPlayers;
    return opponentPlayers
      .filter((player) => {
        const id = String(player?.player || "").trim();
        return id && currentTablePlayerSet.has(id);
      })
      .sort((a, b) => {
        const aId = String(a?.player || "").trim();
        const bId = String(b?.player || "").trim();
        const aSeat = Number(currentTableSeatByPlayer.get(aId));
        const bSeat = Number(currentTableSeatByPlayer.get(bId));
        const aHasSeat = Number.isFinite(aSeat);
        const bHasSeat = Number.isFinite(bSeat);

        if (aHasSeat && bHasSeat && aSeat !== bSeat) return aSeat - bSeat;
        if (aHasSeat && !bHasSeat) return -1;
        if (!aHasSeat && bHasSeat) return 1;
        return aId.localeCompare(bId);
      });
  }, [
    opponentFilter,
    opponentPlayers,
    currentTablePlayerSet,
    currentTableSeatByPlayer,
  ]);
  const outcomeOptions = useMemo(() => {
    const byCode = new Map();
    for (const hand of parsedHands) {
      const code = String(hand?.heroOutcome?.code || "").trim();
      const label = String(hand?.heroOutcome?.label || "").trim();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, label || code);
      }
    }
    return Array.from(byCode.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [parsedHands]);
  const filteredParsedHands = useMemo(() => {
    const timeOption =
      TIME_FILTER_OPTIONS.find((option) => option.code === timeFilter) ||
      TIME_FILTER_OPTIONS[0];
    const cutoffEpoch =
      Number.isFinite(Number(timeOption.ms)) && Number(timeOption.ms) > 0
        ? Date.now() - Number(timeOption.ms)
        : null;

    return parsedHands.filter((hand) => {
      if (
        outcomeFilter !== "all" &&
        String(hand?.heroOutcome?.code || "") !== outcomeFilter
      ) {
        return false;
      }
      if (cutoffEpoch === null) return true;
      const playedAtEpoch = getHandPlayedAtEpoch(hand);
      if (!Number.isFinite(Number(playedAtEpoch))) return false;
      return Number(playedAtEpoch) >= cutoffEpoch;
    });
  }, [parsedHands, outcomeFilter, timeFilter]);
  const parsedHandByKey = useMemo(() => {
    const map = new Map();
    for (const hand of parsedHands) {
      map.set(handKey(hand), hand);
    }
    return map;
  }, [parsedHands]);
  const selectedHands = filteredParsedHands.filter((hand) =>
    selectedHandKeys.has(handKey(hand))
  );
  const selectedCount = selectedHands.length;
  const reviewedCount = parsedHands.reduce(
    (count, hand) => (reviewsByHandKey[handKey(hand)] ? count + 1 : count),
    0
  );
  const tournamentSummary = useMemo(() => {
    if (!parseResult?.summary) return null;
    const totalHands = Number(parseResult.summary.totalHands) || parsedHands.length || 0;
    const summaryPreflopFolds = Number(parseResult.summary.heroFoldedPreflopCount);
    const summaryEnteredPreflop = Number(parseResult.summary.heroEnteredPreflopCount);
    const preflopFolds =
      Number.isFinite(summaryPreflopFolds) && summaryPreflopFolds >= 0
        ? summaryPreflopFolds
        : parsedHands.filter(
            (hand) => String(hand?.heroOutcome?.code || "") === "folded_preflop"
          ).length;
    const enteredHands =
      Number.isFinite(summaryEnteredPreflop) && summaryEnteredPreflop >= 0
        ? summaryEnteredPreflop
        : Math.max(0, totalHands - preflopFolds);

    let wonShowdown = 0;
    let lostShowdown = 0;
    let wonNoShowdown = 0;
    let wonNoShowdownPostflop = 0;
    let foldedFlop = 0;
    let foldedTurn = 0;
    let foldedRiver = 0;
    let enteredLate = 0;
    let enteredEarly = 0;
    let enteredBlind = 0;
    let stackBbSum = 0;
    let stackBbCount = 0;
    let noRaiseBeforeHeroSpots = 0;
    let openedWhenNoRaiseBeforeHero = 0;
    let facingOpenSpots = 0;
    let defendedFacingOpen = 0;
    let blindFacingOpenSpots = 0;
    let blindFoldFacingOpen = 0;
    let sbFacingOpenSpots = 0;
    let sbFoldFacingOpen = 0;
    let bbFacingOpenSpots = 0;
    let bbFoldFacingOpen = 0;
    let facedReraiseAfterAggressionSpots = 0;
    let foldedAfterFacingReraise = 0;
    let callThenFacedRaiseSpots = 0;
    let callThenFoldedToRaise = 0;
    const openSpotByPosition = new Map();
    const opensByPosition = new Map();
    const defendSpotByPosition = new Map();
    const defendsByPosition = new Map();

    const statusCounts = new Map();
    for (const hand of parsedHands) {
      const code = String(hand?.heroOutcome?.code || "unknown");
      statusCounts.set(code, (statusCounts.get(code) || 0) + 1);
      if (code === "won_showdown") wonShowdown += 1;
      if (code === "lost_showdown") lostShowdown += 1;
      if (code.startsWith("won_no_showdown_")) {
        wonNoShowdown += 1;
        if (
          code.endsWith("_flop") ||
          code.endsWith("_turn") ||
          code.endsWith("_river")
        ) {
          wonNoShowdownPostflop += 1;
        }
      }
      if (code === "folded_flop") foldedFlop += 1;
      if (code === "folded_turn") foldedTurn += 1;
      if (code === "folded_river") foldedRiver += 1;

      const category = seatCategory(hand?.heroPosition);
      if (category === "late") enteredLate += 1;
      if (category === "early") enteredEarly += 1;
      if (category === "blind") enteredBlind += 1;

      const heroStack = Number(hand?.heroStack);
      const bigBlind = Number(hand?.blinds?.bigBlind);
      if (
        Number.isFinite(heroStack) &&
        heroStack > 0 &&
        Number.isFinite(bigBlind) &&
        bigBlind > 0
      ) {
        stackBbSum += heroStack / bigBlind;
        stackBbCount += 1;
      }

      const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
        ? hand.actionsByStreet.preflop
        : [];
      const heroNameForHand = String(hand?.heroName || "Hero").trim() || "Hero";
      const heroPosition = String(hand?.heroPosition || "").trim() || "Unknown";

      let firstHeroDecisionIndex = -1;
      let firstHeroDecision = null;
      for (let i = 0; i < preflopActions.length; i += 1) {
        const action = preflopActions[i];
        const player = String(action?.player || "").trim();
        if (player !== heroNameForHand) continue;
        if (!isPreflopDecisionAction(action)) continue;
        firstHeroDecisionIndex = i;
        firstHeroDecision = action;
        break;
      }

      if (firstHeroDecisionIndex >= 0 && firstHeroDecision) {
        const priorOpponentAggression = preflopActions
          .slice(0, firstHeroDecisionIndex)
          .some(
            (action) =>
              String(action?.player || "").trim() !== heroNameForHand &&
              isPreflopAggressiveAction(action)
          );

        if (priorOpponentAggression) {
          facingOpenSpots += 1;
          incrementMapCount(defendSpotByPosition, heroPosition);
          if (normalizeActionType(firstHeroDecision) !== "fold") {
            defendedFacingOpen += 1;
            incrementMapCount(defendsByPosition, heroPosition);
          }
          if (heroPosition === "SB" || heroPosition === "BB") {
            blindFacingOpenSpots += 1;
            if (normalizeActionType(firstHeroDecision) === "fold") {
              blindFoldFacingOpen += 1;
            }
            if (heroPosition === "SB") {
              sbFacingOpenSpots += 1;
              if (normalizeActionType(firstHeroDecision) === "fold") {
                sbFoldFacingOpen += 1;
              }
            } else {
              bbFacingOpenSpots += 1;
              if (normalizeActionType(firstHeroDecision) === "fold") {
                bbFoldFacingOpen += 1;
              }
            }
          }
        } else {
          noRaiseBeforeHeroSpots += 1;
          incrementMapCount(openSpotByPosition, heroPosition);
          if (isPreflopAggressiveAction(firstHeroDecision)) {
            openedWhenNoRaiseBeforeHero += 1;
            incrementMapCount(opensByPosition, heroPosition);
          }
        }

        const firstHeroDecisionType = normalizeActionType(firstHeroDecision);
        if (firstHeroDecisionType === "call") {
          const oppRaiseAfterCallIndex = preflopActions.findIndex(
            (action, idx) =>
              idx > firstHeroDecisionIndex &&
              String(action?.player || "").trim() !== heroNameForHand &&
              isPreflopAggressiveAction(action)
          );
          if (oppRaiseAfterCallIndex >= 0) {
            callThenFacedRaiseSpots += 1;
            const foldedAfterRaise = preflopActions.some(
              (action, idx) =>
                idx > oppRaiseAfterCallIndex &&
                String(action?.player || "").trim() === heroNameForHand &&
                normalizeActionType(action) === "fold"
            );
            if (foldedAfterRaise) callThenFoldedToRaise += 1;
          }
        }
      }

      const heroAggressiveIndex = preflopActions.findIndex(
        (action) =>
          String(action?.player || "").trim() === heroNameForHand &&
          isPreflopAggressiveAction(action)
      );
      if (heroAggressiveIndex >= 0) {
        const oppReraiseIndex = preflopActions.findIndex(
          (action, idx) =>
            idx > heroAggressiveIndex &&
            String(action?.player || "").trim() !== heroNameForHand &&
            isPreflopAggressiveAction(action)
        );
        if (oppReraiseIndex >= 0) {
          facedReraiseAfterAggressionSpots += 1;
          const heroFoldedAfterReraise = preflopActions.some(
            (action, idx) =>
              idx > oppReraiseIndex &&
              String(action?.player || "").trim() === heroNameForHand &&
              normalizeActionType(action) === "fold"
          );
          if (heroFoldedAfterReraise) foldedAfterFacingReraise += 1;
        }
      }
    }

    const showdownSamples = wonShowdown + lostShowdown;
    const enteredPct = safePercent(enteredHands, totalHands);
    const preflopFoldPct = safePercent(preflopFolds, totalHands);
    const noShowdownWinPct = safePercent(wonNoShowdown, enteredHands);
    const postflopNoShowdownPct = safePercent(wonNoShowdownPostflop, enteredHands);
    const showdownWinPct = safePercent(wonShowdown, showdownSamples);
    const lateStreetFoldPct = safePercent(
      foldedTurn + foldedRiver,
      foldedFlop + foldedTurn + foldedRiver
    );
    const enteredLatePct = safePercent(enteredLate, enteredHands);
    const avgEntryStackBb = stackBbCount > 0 ? stackBbSum / stackBbCount : null;

    let preflopFoldWarnThreshold = 78;
    if (avgEntryStackBb !== null && avgEntryStackBb < 18) {
      preflopFoldWarnThreshold = 82;
    } else if (avgEntryStackBb !== null && avgEntryStackBb > 45) {
      preflopFoldWarnThreshold = 76;
    }
    if (enteredLatePct >= 45) {
      preflopFoldWarnThreshold -= 2;
    }
    if (enteredEarly >= enteredLate + 4) {
      preflopFoldWarnThreshold += 2;
    }
    preflopFoldWarnThreshold = Math.max(72, Math.min(84, preflopFoldWarnThreshold));

    const flags = [];
    if (totalHands >= 40 && preflopFoldPct > preflopFoldWarnThreshold) {
      flags.push({
        level: "watch",
        text: `Preflop fold rate is high for this sample/context (${percentLabel(
          preflopFoldPct
        )} vs ~${percentLabel(preflopFoldWarnThreshold)} threshold).`,
      });
    }
    if (postflopNoShowdownPct <= 8 && enteredHands >= 15) {
      flags.push({
        level: "watch",
        text: "Postflop no-showdown wins are low. Pressure opportunities may be missed.",
      });
    }
    if (showdownSamples >= 8 && showdownWinPct < 42) {
      flags.push({
        level: "watch",
        text: "Showdown conversion is weak. Review bluff-catch calls and thin value lines.",
      });
    }
    if (
      foldedFlop + foldedTurn + foldedRiver >= 8 &&
      lateStreetFoldPct >= 65
    ) {
      flags.push({
        level: "watch",
        text: "Most postflop folds happen late. Check turn/river over-fold patterns.",
      });
    }
    if (flags.length === 0 && totalHands > 0) {
      flags.push({
        level: "good",
        text: "No major status-level leak signal in this sample.",
      });
    }

    const openByPositionRows = Array.from(openSpotByPosition.entries())
      .map(([position, spots]) => ({
        position,
        spots,
        opens: opensByPosition.get(position) || 0,
      }))
      .sort((a, b) => b.spots - a.spots || a.position.localeCompare(b.position))
      .slice(0, 8);

    const defendByPositionRows = Array.from(defendSpotByPosition.entries())
      .map(([position, spots]) => ({
        position,
        spots,
        defends: defendsByPosition.get(position) || 0,
      }))
      .sort((a, b) => b.spots - a.spots || a.position.localeCompare(b.position))
      .slice(0, 8);

    return {
      sampleHands: parsedHands.length,
      totalHands,
      enteredHands,
      preflopFolds,
      enteredPct,
      preflopFoldPct,
      preflopFoldWarnThreshold,
      noShowdownWinPct,
      postflopNoShowdownPct,
      wonShowdown,
      lostShowdown,
      showdownSamples,
      showdownWinPct,
      foldedFlop,
      foldedTurn,
      foldedRiver,
      lateStreetFoldPct,
      enteredLate,
      enteredEarly,
      enteredBlind,
      enteredLatePct,
      avgEntryStackBb,
      flags,
      preflopBreakdown: {
        noRaiseBeforeHeroSpots,
        openedWhenNoRaiseBeforeHero,
        facingOpenSpots,
        defendedFacingOpen,
        blindFacingOpenSpots,
        blindFoldFacingOpen,
        sbFacingOpenSpots,
        sbFoldFacingOpen,
        bbFacingOpenSpots,
        bbFoldFacingOpen,
        facedReraiseAfterAggressionSpots,
        foldedAfterFacingReraise,
        callThenFacedRaiseSpots,
        callThenFoldedToRaise,
        openByPositionRows,
        defendByPositionRows,
      },
      topStatuses: Array.from(statusCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    };
  }, [parseResult?.summary, parsedHands]);
  const preflopOpportunityAudit = useMemo(
    () => buildPreflopOpportunityAudit(parsedHands),
    [parsedHands]
  );
  const tournamentCoachSummary = useMemo(
    () => buildTournamentCoachSummary(tournamentSummary),
    [tournamentSummary]
  );
  const tournamentSummaryPayload = useMemo(() => {
    if (!tournamentSummary) return null;
    return {
      sampleHands: tournamentSummary.sampleHands,
      totalHands: tournamentSummary.totalHands,
      enteredHands: tournamentSummary.enteredHands,
      preflopFolds: tournamentSummary.preflopFolds,
      enteredPct: tournamentSummary.enteredPct,
      preflopFoldPct: tournamentSummary.preflopFoldPct,
      preflopFoldWarnThreshold: tournamentSummary.preflopFoldWarnThreshold,
      noShowdownWinPct: tournamentSummary.noShowdownWinPct,
      postflopNoShowdownPct: tournamentSummary.postflopNoShowdownPct,
      showdownWinPct: tournamentSummary.showdownWinPct,
      foldedFlop: tournamentSummary.foldedFlop,
      foldedTurn: tournamentSummary.foldedTurn,
      foldedRiver: tournamentSummary.foldedRiver,
      avgEntryStackBb: tournamentSummary.avgEntryStackBb,
      preflopBreakdown: tournamentSummary.preflopBreakdown,
      topStatuses: tournamentSummary.topStatuses,
    };
  }, [tournamentSummary]);

  const parsePayload = useMemo(
    () => ({
      historyText,
      heroName: heroName.trim() || "Hero",
      includeOnlyHeroDidNotFoldPreflop:
        preflopHandSet === "exclude_preflop_folds",
      sort: sortOrder,
      limit: Math.max(1, Math.min(500, Number(handLimit) || 200)),
    }),
    [historyText, heroName, sortOrder, handLimit, preflopHandSet]
  );
  const hasTournamentSummary = Boolean(tournamentSummary);
  const hasHandAudit = parsedHands.length > 0;
  const hasOpponentSnapshot = opponentPlayers.length > 0;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (insightsTab === "tournament" && hasTournamentSummary) return;
    if (insightsTab === "stats" && hasTournamentSummary) return;
    if (insightsTab === "audit" && hasHandAudit) return;
    if (insightsTab === "opponents" && hasOpponentSnapshot) return;
    if (hasTournamentSummary) {
      setInsightsTab("tournament");
      return;
    }
    if (hasHandAudit) {
      setInsightsTab("audit");
      return;
    }
    if (hasOpponentSnapshot) {
      setInsightsTab("opponents");
    }
  }, [insightsTab, hasTournamentSummary, hasHandAudit, hasOpponentSnapshot]);

  useEffect(() => {
    if (!selectedAuditHandKey) return;
    if (parsedHandByKey.has(selectedAuditHandKey)) return;
    setSelectedAuditHandKey("");
  }, [parsedHandByKey, selectedAuditHandKey]);

  useEffect(() => {
    if (!pendingAuditScrollKey) return;
    const row = handRowRefs.current.get(pendingAuditScrollKey);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    setPendingAuditScrollKey("");
  }, [pendingAuditScrollKey, filteredParsedHands]);

  const copyOpponentTendencies = async (playerKey, tendencyLabels, playNoteLine) => {
    const labels = Array.isArray(tendencyLabels)
      ? tendencyLabels.filter(Boolean)
      : [];
    const note = String(playNoteLine || "").trim();
    const lines = [...labels];
    if (note) lines.push(`Play note: ${note}`);
    if (lines.length === 0) return;
    const text = lines.join("\n");

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "readonly");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedOpponentKey(playerKey);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedOpponentKey("");
      }, 1600);
    } catch {
      setError("Failed to copy tendencies to clipboard.");
    }
  };

  const resolveAuditHand = (event) => {
    const key = String(event?.handKey || event?.sampleHandKey || "").trim();
    if (key && parsedHandByKey.has(key)) {
      return parsedHandByKey.get(key) || null;
    }
    const eventHandId = String(event?.handId || event?.sampleHandId || "").trim();
    const eventPlayedAt = String(
      event?.playedAt || event?.samplePlayedAt || ""
    ).trim();
    if (!eventHandId && !eventPlayedAt) return null;
    return (
      parsedHands.find((hand) => {
        const handId = String(hand?.handId || "").trim();
        const playedAt = String(hand?.playedAt || "").trim();
        if (eventHandId && eventPlayedAt) {
          return handId === eventHandId && playedAt === eventPlayedAt;
        }
        if (eventHandId) return handId === eventHandId;
        return playedAt === eventPlayedAt;
      }) || null
    );
  };

  const setHandRowRef = (rowKey, node) => {
    if (!rowKey) return;
    if (node) {
      handRowRefs.current.set(rowKey, node);
      return;
    }
    handRowRefs.current.delete(rowKey);
  };

  const openAuditHand = (event) => {
    const resolvedHand = resolveAuditHand(event);
    if (!resolvedHand) {
      setError("Could not locate this hand in the current parsed sample.");
      return;
    }
    const key = handKey(resolvedHand);
    setSelectedAuditHandKey(key);
    setError("");

    const visibleNow = filteredParsedHands.some((hand) => handKey(hand) === key);
    if (!visibleNow) {
      setOutcomeFilter("all");
      setTimeFilter("all_time");
      setSelectedHandKeys(new Set());
    }
    setPendingAuditScrollKey(key);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setHistoryText(text || "");
    setSourceFileName(file.name || "");
    setError("");
    setParseResult(null);
    setReviewsByHandKey({});
    setSummaryReview(null);
    setSummaryReviewError("");
    setOutcomeFilter("all");
    setTimeFilter("all_time");
    setSelectedHandKeys(new Set());
    setInsightsTab("tournament");
    setOpponentFilter("current_table");
    setCopiedOpponentKey("");
    setSelectedAuditHandKey("");
    setPendingAuditScrollKey("");
    setQuickReviewHandKey("");
  };

  const runParse = async () => {
    if (!canSubmit) return;
    setError("");
    setLoadingParse(true);
    setQuickReviewHandKey("");
    setReviewsByHandKey({});
    setSummaryReview(null);
    setSummaryReviewError("");
    try {
      const res = await requestHandHistoryParse(parsePayload);
      setParseResult(res);
      setOutcomeFilter("all");
      setTimeFilter("all_time");
      setSelectedHandKeys(new Set());
      setInsightsTab("tournament");
      setOpponentFilter("current_table");
      setCopiedOpponentKey("");
      setSelectedAuditHandKey("");
      setPendingAuditScrollKey("");
      setQuickReviewHandKey("");
    } catch (err) {
      setError(err?.message || "Failed to parse hand history.");
    } finally {
      setLoadingParse(false);
    }
  };

  const runReview = async () => {
    if (quickReviewHandKey) return;
    if (selectedCount === 0) {
      setError("Select at least one parsed hand for review.");
      return;
    }
    setError("");
    setLoadingReview(true);
    try {
      const reviewPayload = {
        selectedHands,
      };
      if (opponentSnapshot && typeof opponentSnapshot === "object") {
        reviewPayload.opponentSnapshot = opponentSnapshot;
      }
      const res = await requestHandHistoryReview(reviewPayload);
      setReviewsByHandKey((previous) => {
        const next = { ...previous };
        for (const item of res?.reviews || []) {
          const key = handKey(item?.hand || {});
          if (key) {
            next[key] = item?.review || null;
          }
        }
        return next;
      });
    } catch (err) {
      setError(err?.message || "Failed to review hands.");
    } finally {
      setLoadingReview(false);
    }
  };

  const runQuickReview = async (hand) => {
    if (loadingReview || quickReviewHandKey) return;
    const singleKey = handKey(hand);
    if (!singleKey) return;
    setError("");
    setQuickReviewHandKey(singleKey);
    try {
      const reviewPayload = {
        selectedHands: [hand],
      };
      if (opponentSnapshot && typeof opponentSnapshot === "object") {
        reviewPayload.opponentSnapshot = opponentSnapshot;
      }
      const res = await requestHandHistoryReview(reviewPayload);
      setReviewsByHandKey((previous) => {
        const next = { ...previous };
        for (const item of res?.reviews || []) {
          const key = handKey(item?.hand || {});
          if (key) {
            next[key] = item?.review || null;
          }
        }
        return next;
      });
    } catch (err) {
      setError(err?.message || "Failed to review hand.");
    } finally {
      setQuickReviewHandKey("");
    }
  };

  const runSummaryReview = async () => {
    if (!tournamentSummaryPayload) {
      setSummaryReviewError("Parse hands first before requesting summary review.");
      return;
    }
    setSummaryReviewError("");
    setLoadingSummaryReview(true);
    try {
      const res = await requestTournamentSummaryReview({
        summary: tournamentSummaryPayload,
      });
      setSummaryReview(res?.review || null);
    } catch (err) {
      setSummaryReviewError(
        err?.message || "Failed to review tournament summary with AI."
      );
    } finally {
      setLoadingSummaryReview(false);
    }
  };

  const toggleHandSelection = (hand) => {
    const key = handKey(hand);
    setSelectedHandKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllHands = () => {
    setSelectedHandKeys(
      new Set(filteredParsedHands.map((hand) => handKey(hand)))
    );
  };

  const clearSelection = () => {
    setSelectedHandKeys(new Set());
  };

  return (
    <section className="hand-review-panel">
      <div className="hand-review-header">
        <h2>Hand Review</h2>
        <p>
          Upload or paste GG tournament history, then choose whether to include
          all preflop outcomes or exclude preflop folds.
        </p>
      </div>

      <div className="hand-review-controls">
        <label>
          Hero name
          <input
            type="text"
            value={heroName}
            onChange={(e) => setHeroName(e.target.value)}
            placeholder="Hero"
          />
        </label>
        <label>
          Sort
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label>
          Parse limit
          <input
            type="number"
            min={1}
            max={500}
            value={handLimit}
            onChange={(e) => setHandLimit(e.target.value)}
          />
        </label>
        <label>
          Hand set
          <select
            value={preflopHandSet}
            onChange={(e) => setPreflopHandSet(e.target.value)}
          >
            <option value="all_hands">Include all hands</option>
            <option value="exclude_preflop_folds">
              Exclude hero preflop folds
            </option>
          </select>
        </label>
      </div>

      <div className="hand-review-inputs">
        <label className="hand-review-file">
          <span>{sourceFileName || "Choose hand history text file"}</span>
          <input type="file" accept=".txt,.log" onChange={handleFileChange} />
        </label>
        <textarea
          value={historyText}
          onChange={(e) => {
            setHistoryText(e.target.value);
            setError("");
            setReviewsByHandKey({});
            setSummaryReview(null);
            setSummaryReviewError("");
            setOutcomeFilter("all");
            setTimeFilter("all_time");
            setSelectedHandKeys(new Set());
            setInsightsTab("tournament");
            setOpponentFilter("current_table");
            setCopiedOpponentKey("");
            setSelectedAuditHandKey("");
            setPendingAuditScrollKey("");
            setQuickReviewHandKey("");
          }}
          rows={10}
          placeholder="Paste GG hand history text here"
        />
      </div>

      <div className="hand-review-actions">
        <button type="button" onClick={runParse} disabled={!canSubmit || loadingParse}>
          {loadingParse ? "Parsing..." : "Parse Hands"}
        </button>
      </div>

      {error ? <p className="hand-review-error">{error}</p> : null}

      {parseResult?.summary ? (
        <div className="hand-review-summary">
          <span>Total: {parseResult.summary.totalHands}</span>
          <span>Filtered: {parseResult.summary.filteredHands}</span>
          <span>Returned: {parseResult.summary.returnedHands}</span>
          <span>Visible: {filteredParsedHands.length}</span>
          <span>Selected: {selectedCount}</span>
          <span>Reviewed: {reviewedCount}</span>
        </div>
      ) : null}

      {hasTournamentSummary || hasHandAudit || hasOpponentSnapshot ? (
        <div className="hand-insights">
          <div className="hand-insights-tabs" role="tablist" aria-label="Insights tabs">
            {hasTournamentSummary ? (
              <button
                type="button"
                role="tab"
                aria-selected={insightsTab === "tournament"}
                className={`hand-insights-tab ${
                  insightsTab === "tournament" ? "active" : ""
                }`}
                onClick={() => setInsightsTab("tournament")}
              >
                Tournament Summary
              </button>
            ) : null}
            {hasTournamentSummary ? (
              <button
                type="button"
                role="tab"
                aria-selected={insightsTab === "stats"}
                className={`hand-insights-tab ${
                  insightsTab === "stats" ? "active" : ""
                }`}
                onClick={() => setInsightsTab("stats")}
              >
                Tournament Stats
              </button>
            ) : null}
            {hasHandAudit ? (
              <button
                type="button"
                role="tab"
                aria-selected={insightsTab === "audit"}
                className={`hand-insights-tab ${
                  insightsTab === "audit" ? "active" : ""
                }`}
                onClick={() => setInsightsTab("audit")}
              >
                Hand Audit
              </button>
            ) : null}
            {hasOpponentSnapshot ? (
              <button
                type="button"
                role="tab"
                aria-selected={insightsTab === "opponents"}
                className={`hand-insights-tab ${
                  insightsTab === "opponents" ? "active" : ""
                }`}
                onClick={() => setInsightsTab("opponents")}
              >
                Opponent Snapshot
              </button>
            ) : null}
          </div>

          {insightsTab === "tournament" && hasTournamentSummary ? (
            <div className="tournament-summary">
              <div className="tournament-summary-head">
                <h3>Tournament Summary</h3>
                <span>
                  Sample: {tournamentSummary.sampleHands} returned hands
                </span>
              </div>
              {tournamentCoachSummary ? (
                <div className="tournament-coach-summary">
                  <h4>Coach Summary</h4>
                  <p>
                    <strong>Primary leak:</strong> {tournamentCoachSummary.primaryLeak}
                  </p>
                  {tournamentCoachSummary.secondaryLeak ? (
                    <p>
                      <strong>Secondary leak:</strong>{" "}
                      {tournamentCoachSummary.secondaryLeak}
                    </p>
                  ) : null}
                  <p>
                    <strong>Key stats:</strong>
                  </p>
                  <div className="tournament-summary-flags">
                    {tournamentCoachSummary.evidence.map((line, idx) => (
                      <p key={`coach-evidence-${idx}`} className="trend-flag watch">
                        {line}
                      </p>
                    ))}
                  </div>
                  <p>
                    <strong>Quick fixes:</strong>
                  </p>
                  <div className="tournament-summary-flags">
                    {tournamentCoachSummary.actions.map((line, idx) => (
                      <p key={`coach-action-${idx}`} className="trend-flag good">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="tournament-ai-review">
                <button
                  type="button"
                  onClick={runSummaryReview}
                  disabled={loadingSummaryReview || !tournamentSummaryPayload}
                >
                  {loadingSummaryReview
                    ? "Reviewing summary..."
                    : "AI Review Summary"}
                </button>
                {summaryReviewError ? (
                  <p className="hand-review-error">{summaryReviewError}</p>
                ) : null}
                {summaryReview ? (
                  <div className="tournament-ai-review-card">
                    <p className="tournament-ai-paragraph">
                      {buildAiSummaryParagraph(summaryReview)}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {insightsTab === "stats" && hasTournamentSummary ? (
            <div className="tournament-summary">
              <div className="tournament-summary-head">
                <h3>Tournament Stats</h3>
                <span>
                  Sample: {tournamentSummary.sampleHands} returned hands
                </span>
              </div>
              <details className="summary-section">
                <summary>Core KPIs</summary>
                <div className="tournament-summary-metrics">
                  <span>
                    Entered pot: {percentLabel(tournamentSummary.enteredPct)} (
                    {tournamentSummary.enteredHands}/{tournamentSummary.totalHands})
                  </span>
                  <span>
                    Folded preflop:{" "}
                    {percentLabel(tournamentSummary.preflopFoldPct)} (
                    {tournamentSummary.preflopFolds}/{tournamentSummary.totalHands})
                  </span>
                  <span>
                    Preflop fold warning threshold:{" "}
                    {percentLabel(tournamentSummary.preflopFoldWarnThreshold)}
                    {tournamentSummary.totalHands < 40
                      ? " (inactive under 40-hand sample)"
                      : ""}
                  </span>
                  <span>
                    Seat distribution (late/early/blinds): {tournamentSummary.enteredLate}/
                    {tournamentSummary.enteredEarly}/{tournamentSummary.enteredBlind}
                  </span>
                  <span>
                    Avg entry stack:{" "}
                    {tournamentSummary.avgEntryStackBb !== null
                      ? `${tournamentSummary.avgEntryStackBb.toFixed(1)} BB`
                      : "n/a"}
                  </span>
                </div>
              </details>

              <details className="summary-section">
                <summary>Opening</summary>
                <div className="tournament-summary-metrics">
                  <span>
                    No-raise spots - raised:{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.openedWhenNoRaiseBeforeHero,
                      tournamentSummary.preflopBreakdown.noRaiseBeforeHeroSpots
                    )}
                  </span>
                </div>
                {tournamentSummary.preflopBreakdown.openByPositionRows.filter(
                  (row) => row.spots >= 6
                ).length > 0 ? (
                  <div className="tournament-summary-statuses">
                    {tournamentSummary.preflopBreakdown.openByPositionRows
                      .filter((row) => row.spots >= 6)
                      .map((row) => (
                        <span key={`open-${row.position}`}>
                          Open {row.position}: {formatRateWithConfidence(row.opens, row.spots)}
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="hand-review-empty">
                    Not enough opening samples by position yet (need at least 6).
                  </p>
                )}
              </details>

              <details className="summary-section">
                <summary>Defending</summary>
                <div className="tournament-summary-metrics">
                  <span>
                    Facing-open spots - defended:{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.defendedFacingOpen,
                      tournamentSummary.preflopBreakdown.facingOpenSpots
                    )}
                  </span>
                  <span>
                    Blind folds vs open (SB+BB):{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.blindFoldFacingOpen,
                      tournamentSummary.preflopBreakdown.blindFacingOpenSpots
                    )}
                  </span>
                  <span>
                    SB folds vs open:{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.sbFoldFacingOpen,
                      tournamentSummary.preflopBreakdown.sbFacingOpenSpots
                    )}
                  </span>
                  <span>
                    BB folds vs open:{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.bbFoldFacingOpen,
                      tournamentSummary.preflopBreakdown.bbFacingOpenSpots
                    )}
                  </span>
                </div>
                {tournamentSummary.preflopBreakdown.defendByPositionRows.filter(
                  (row) => row.spots >= 6
                ).length > 0 ? (
                  <div className="tournament-summary-statuses">
                    {tournamentSummary.preflopBreakdown.defendByPositionRows
                      .filter((row) => row.spots >= 6)
                      .map((row) => (
                        <span key={`defend-${row.position}`}>
                          Defend {row.position}:{" "}
                          {formatRateWithConfidence(row.defends, row.spots)}
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="hand-review-empty">
                    Not enough defend samples by position yet (need at least 6).
                  </p>
                )}
              </details>

              <details className="summary-section">
                <summary>Vs Reraise</summary>
                <div className="tournament-summary-metrics">
                  <span>
                    Faced reraise after aggression - folded:{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.foldedAfterFacingReraise,
                      tournamentSummary.preflopBreakdown.facedReraiseAfterAggressionSpots
                    )}
                  </span>
                  <span>
                    Called then faced raise - folded:{" "}
                    {formatRateWithConfidence(
                      tournamentSummary.preflopBreakdown.callThenFoldedToRaise,
                      tournamentSummary.preflopBreakdown.callThenFacedRaiseSpots
                    )}
                  </span>
                </div>
              </details>

              <details className="summary-section">
                <summary>Postflop And Outcomes</summary>
                <div className="tournament-summary-metrics">
                  <span>
                    Won without showdown:{" "}
                    {percentLabel(tournamentSummary.noShowdownWinPct)} of entered
                  </span>
                  <span>
                    Postflop no-showdown wins:{" "}
                    {percentLabel(tournamentSummary.postflopNoShowdownPct)} of entered
                  </span>
                  <span>
                    Showdown win rate:{" "}
                    {tournamentSummary.showdownSamples > 0
                      ? percentLabel(tournamentSummary.showdownWinPct)
                      : "n/a"}
                  </span>
                  <span>
                    Late-street fold share:{" "}
                    {tournamentSummary.foldedFlop +
                      tournamentSummary.foldedTurn +
                      tournamentSummary.foldedRiver >
                    0
                      ? percentLabel(tournamentSummary.lateStreetFoldPct)
                      : "n/a"}
                  </span>
                </div>
                <div className="tournament-summary-flags">
                  {tournamentSummary.flags.map((flag, idx) => (
                    <p key={`flag-${idx}`} className={`trend-flag ${flag.level}`}>
                      {flag.text}
                    </p>
                  ))}
                </div>
              </details>

              <details className="summary-section">
                <summary>Raw Status Counts</summary>
                {tournamentSummary.topStatuses.length > 0 ? (
                  <div className="tournament-summary-statuses">
                    {tournamentSummary.topStatuses.map(([status, count]) => (
                      <span key={status}>
                        {status}: {count}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="hand-review-empty">No status counts available.</p>
                )}
              </details>
            </div>
          ) : null}

          {insightsTab === "audit" && hasHandAudit ? (
            <div className="tournament-summary">
              <div className="tournament-summary-head">
                <h3>Hand Audit</h3>
                <span>Sample: {parsedHands.length} parsed hands</span>
              </div>
              <details className="summary-section">
                <summary>Preflop Opportunity Audit (MVP)</summary>
                <div className="tournament-summary-metrics">
                  <span>RFI spots scored: {preflopOpportunityAudit.rfiSpotsScored}</span>
                  <span>
                    Facing-open spots scored: {preflopOpportunityAudit.facingOpenSpotsScored}
                  </span>
                  <span>
                    Vs 3-bet spots scored: {preflopOpportunityAudit.vs3BetSpotsScored}
                  </span>
                  <span>
                    Missing hole cards: {preflopOpportunityAudit.unknownCardsSpots}
                  </span>
                </div>
                <div className="tournament-summary-metrics">
                  <span>
                    Missed opens (chart-qualified): {preflopOpportunityAudit.missedOpen.count}/
                    {preflopOpportunityAudit.expectedOpenSpots}
                  </span>
                  <span>
                    Missed defends (chart-qualified):{" "}
                    {preflopOpportunityAudit.missedDefend.count}/
                    {preflopOpportunityAudit.expectedDefendSpots}
                  </span>
                  <span>
                    Overfold vs 3-bet (chart-qualified):{" "}
                    {preflopOpportunityAudit.overfoldVs3Bet.count}/
                    {preflopOpportunityAudit.expectedContinueVs3BetSpots}
                  </span>
                </div>
                <div className="tournament-summary-flags">
                  {preflopOpportunityAudit.quickFixes.map((line, idx) => (
                    <p
                      key={`audit-fix-${idx}`}
                      className={`trend-flag ${
                        line.startsWith("No dominant") ? "good" : "watch"
                      }`}
                    >
                      {line}
                    </p>
                  ))}
                </div>

                <p>
                  <strong>Top missed opens:</strong>
                </p>
                {preflopOpportunityAudit.missedOpen.topCombos.length > 0 ? (
                  <div className="tournament-summary-statuses">
                    {preflopOpportunityAudit.missedOpen.topCombos.map((row) => (
                      <button
                        type="button"
                        key={`missed-open-${row.position}-${row.handCode}`}
                        className={`audit-chip-button ${
                          selectedAuditHandKey &&
                          row.sampleHandKey &&
                          selectedAuditHandKey === row.sampleHandKey
                            ? "active"
                            : ""
                        }`}
                        onClick={() => openAuditHand(row)}
                        disabled={!hasAuditReference(row)}
                      >
                        {row.handCode} ({row.position}) x{row.count}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hand-review-empty">No repeated missed open combos flagged.</p>
                )}

                <p>
                  <strong>Top missed defends:</strong>
                </p>
                {preflopOpportunityAudit.missedDefend.topCombos.length > 0 ? (
                  <div className="tournament-summary-statuses">
                    {preflopOpportunityAudit.missedDefend.topCombos.map((row) => (
                      <button
                        type="button"
                        key={`missed-defend-${row.position}-${row.handCode}`}
                        className={`audit-chip-button ${
                          selectedAuditHandKey &&
                          row.sampleHandKey &&
                          selectedAuditHandKey === row.sampleHandKey
                            ? "active"
                            : ""
                        }`}
                        onClick={() => openAuditHand(row)}
                        disabled={!hasAuditReference(row)}
                      >
                        {row.handCode} ({row.position}) x{row.count}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hand-review-empty">No repeated missed defend combos flagged.</p>
                )}

                <p>
                  <strong>Top overfolds vs 3-bet:</strong>
                </p>
                {preflopOpportunityAudit.overfoldVs3Bet.topCombos.length > 0 ? (
                  <div className="tournament-summary-statuses">
                    {preflopOpportunityAudit.overfoldVs3Bet.topCombos.map((row) => (
                      <button
                        type="button"
                        key={`missed-3bet-${row.position}-${row.handCode}`}
                        className={`audit-chip-button ${
                          selectedAuditHandKey &&
                          row.sampleHandKey &&
                          selectedAuditHandKey === row.sampleHandKey
                            ? "active"
                            : ""
                        }`}
                        onClick={() => openAuditHand(row)}
                        disabled={!hasAuditReference(row)}
                      >
                        {row.handCode} ({row.position}) x{row.count}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hand-review-empty">
                    No repeated overfold-vs-3-bet combos flagged.
                  </p>
                )}

                {preflopOpportunityAudit.missedOpen.examples.length > 0 ? (
                  <>
                    <p>
                      <strong>Example missed opens:</strong>
                    </p>
                    <div className="tournament-summary-statuses">
                      {preflopOpportunityAudit.missedOpen.examples.map((event) => (
                        <button
                          type="button"
                          key={`missed-open-example-${event.handId}-${event.playedAt}`}
                          className={`audit-chip-button ${
                            selectedAuditHandKey &&
                            event.handKey &&
                            selectedAuditHandKey === event.handKey
                              ? "active"
                              : ""
                          }`}
                          onClick={() => openAuditHand(event)}
                          disabled={!hasAuditReference(event)}
                        >
                          {event.handId}: {event.position} {event.handCode} {event.actualAction} -{" "}
                          {event.recommendation}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </details>
            </div>
          ) : null}

          {insightsTab === "opponents" && hasOpponentSnapshot ? (
            <div className="opponent-snapshot">
              <div className="opponent-snapshot-head">
                <h3>Opponent Snapshot</h3>
                <span>
                  {visibleOpponentPlayers.length}/
                  {opponentSnapshot?.totalOpponents || opponentPlayers.length} players
                  across {opponentSnapshot?.totalHandsTracked || 0} hands
                </span>
              </div>
              <div className="opponent-snapshot-toolbar">
                <label>
                  View
                  <select
                    value={opponentFilter}
                    onChange={(event) => setOpponentFilter(event.target.value)}
                  >
                    <option value="all">All opponents</option>
                    <option value="current_table">Current table (best guess)</option>
                  </select>
                </label>
                <p className="opponent-snapshot-note">
                  Best guess uses latest hand
                  {currentTableGuess?.playedAt ? ` (${currentTableGuess.playedAt})` : ""}.
                </p>
              </div>
              <div className="opponent-snapshot-list">
                {visibleOpponentPlayers.map((player) => {
                  const tendencyLabels = extractTendencyLabels(player);
                  const playNoteLine = formatPlayNote(player);
                  return (
                    <article key={player.player} className="opponent-snapshot-row">
                      <div className="opponent-snapshot-row-head">
                        <strong>{player.player}</strong>
                        <span>{player.handsSeen} hands</span>
                        <span>{formatLatestSeat(player.latestSeat)}</span>
                        <span>{formatChipStack(player.latestStack)}</span>
                        {player.lastSeenAt ? <span>Last: {player.lastSeenAt}</span> : null}
                        <button
                          type="button"
                          className="opponent-copy-button"
                          onClick={() =>
                            copyOpponentTendencies(
                              player.player,
                              tendencyLabels,
                              playNoteLine
                            )
                          }
                          disabled={tendencyLabels.length === 0 && !playNoteLine}
                        >
                          {copiedOpponentKey === player.player
                            ? "Copied"
                            : "Copy tendencies"}
                        </button>
                      </div>
                      <div className="opponent-snapshot-metrics">
                        <span>Entered pot: {formatPercentCount(player.enteredPot)}</span>
                        <span>
                          Folded preflop: {formatPercentCount(player.foldedPreflop)}
                        </span>
                        <span>
                          Raised preflop: {formatPercentCount(player.preflopRaise)}
                        </span>
                        <span>
                          Fold to preflop raise:{" "}
                          {formatPercentCount(player.foldToPreflopRaise)}
                        </span>
                        <span>
                          Postflop aggression: {formatAggression(player.postflopAggression)}
                        </span>
                      </div>
                      {playNoteLine ? (
                        <p className="opponent-play-note">
                          <strong>Play note:</strong> {playNoteLine}
                        </p>
                      ) : null}
                      {tendencyLabels.length > 0 ? (
                        <div className="opponent-snapshot-tags">
                          {tendencyLabels.map((label) => (
                            <span key={`${player.player}-${label}`} className="opponent-tag">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {visibleOpponentPlayers.length === 0 ? (
                  <p className="hand-review-empty">
                    No opponents match the current filter.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {parsedHands.length > 0 ? (
        <div className="hand-review-controls">
          <label>
            Outcome status
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setSelectedHandKeys(new Set());
              }}
            >
              <option value="all">All statuses</option>
              {outcomeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time window
            <select
              value={timeFilter}
              onChange={(e) => {
                setTimeFilter(e.target.value);
                setSelectedHandKeys(new Set());
              }}
            >
              {TIME_FILTER_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {filteredParsedHands.length > 0 ? (
        <div className="hand-review-selection-tools">
          <button type="button" onClick={selectAllHands}>
            Select all
          </button>
          <button type="button" onClick={clearSelection}>
            Clear selection
          </button>
          <button
            type="button"
            onClick={runReview}
            disabled={selectedCount === 0 || loadingReview || Boolean(quickReviewHandKey)}
          >
            {loadingReview || quickReviewHandKey
              ? "Reviewing..."
              : `Analyze Selected (${selectedCount})`}
          </button>
        </div>
      ) : null}

      {filteredParsedHands.length > 0 ? (
        <div className="hand-review-list">
          {filteredParsedHands.map((hand) => {
            const rowKey = handKey(hand);
            const outcome = hand.heroOutcome || {};
            const isSelected = selectedHandKeys.has(rowKey);
            const isAuditTarget = selectedAuditHandKey === rowKey;
            const isQuickReviewLoading = quickReviewHandKey === rowKey;
            const attachedReview = reviewsByHandKey[rowKey];
            return (
            <article
              key={rowKey}
              ref={(node) => setHandRowRef(rowKey, node)}
              className={`hand-row ${isSelected ? "selected" : ""} ${
                isAuditTarget ? "audit-target" : ""
              }`}
            >
              <div className="hand-row-head">
                <div className="hand-row-id">
                  <label className="hand-row-select">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleHandSelection(hand)}
                    />
                    <strong>{hand.handId}</strong>
                  </label>
                  <button
                    type="button"
                    className={`hand-row-quick-review ${
                      isQuickReviewLoading ? "loading" : ""
                    }`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      runQuickReview(hand);
                    }}
                    disabled={loadingReview || Boolean(quickReviewHandKey)}
                    title="Quick AI review this hand"
                    aria-label={`Quick AI review ${hand.handId}`}
                  >
                    {isQuickReviewLoading ? "..." : "⚡"}
                  </button>
                </div>
                <span>{hand.playedAt}</span>
              </div>
              <div className="hand-row-meta">
                <span>{hand.heroPosition || "Unknown position"}</span>
                <span>Cards: {formatHeroCards(hand.heroCards)}</span>
                <span
                  className={`outcome-pill ${outcomeClass(outcome.code)}`}
                  title={outcome.code || "unknown"}
                >
                  {outcome.label || "Outcome unknown"}
                  {Number(outcome.wonAmount) > 0 ? ` (${outcome.wonAmount})` : ""}
                </span>
                <span>
                  Preflop:{" "}
                  {(hand.heroPreflop?.actions || [])
                    .map((action) => formatAction(action))
                    .join(", ") || "No decision"}
                </span>
              </div>
              {attachedReview ? (
                <div className="hand-row-review">
                  <div className="hand-review-scores">
                    <span
                      className={`score-pill ${scoreClass(
                        attachedReview.overall_score
                      )}`}
                    >
                      Overall {formatScore(attachedReview.overall_score)}
                    </span>
                    <span>Pre {formatScore(attachedReview.preflop_score)}</span>
                    <span>Flop {formatScore(attachedReview.flop_score)}</span>
                    <span>Turn {formatScore(attachedReview.turn_score)}</span>
                    <span>River {formatScore(attachedReview.river_score)}</span>
                    <span>
                      Confidence {attachedReview.confidence || "medium"}
                    </span>
                  </div>
                  <p>
                    <strong>Leak:</strong> {attachedReview.primary_leak}
                  </p>
                  <p>
                    <strong>Better line:</strong> {attachedReview.better_line}
                  </p>
                  <details className="hand-breakdown">
                    <summary>Hand breakdown</summary>
                    <div className="hand-breakdown-body">
                      <p>
                        <strong>Hero cards:</strong> {formatHeroCards(hand.heroCards)}
                      </p>
                      <p>
                        <strong>Board:</strong> {formatBoard(hand.board)}
                      </p>
                      <p>
                        <strong>Flop:</strong> {formatBoardStreet(hand.board, "flop")}
                      </p>
                      <p>
                        <strong>Turn:</strong> {formatBoardStreet(hand.board, "turn")}
                      </p>
                      <p>
                        <strong>River:</strong> {formatBoardStreet(hand.board, "river")}
                      </p>
                      <p>
                        <strong>Context:</strong> {streetPlayersLabel(hand)}
                      </p>
                      <p>
                        <strong>Blinds:</strong>{" "}
                        {hand.blinds?.smallBlind || "?"}/
                        {hand.blinds?.bigBlind || "?"}
                        {hand.blinds?.ante ? ` (${hand.blinds.ante} ante)` : ""}
                      </p>
                      <div className="hand-breakdown-street">
                        <strong>Preflop</strong>
                        {(hand.actionsByStreet?.preflop || []).length > 0 ? (
                          (hand.actionsByStreet?.preflop || []).map((action, idx) => (
                            <span key={`pre-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))
                        ) : (
                          <span>No actions captured.</span>
                        )}
                      </div>
                      {(hand.actionsByStreet?.flop || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Flop</strong>
                          {(hand.actionsByStreet?.flop || []).map((action, idx) => (
                            <span key={`flop-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(hand.actionsByStreet?.turn || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Turn</strong>
                          {(hand.actionsByStreet?.turn || []).map((action, idx) => (
                            <span key={`turn-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(hand.actionsByStreet?.river || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>River</strong>
                          {(hand.actionsByStreet?.river || []).map((action, idx) => (
                            <span key={`river-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {Array.isArray(hand.showdown?.revealedCards) &&
                      hand.showdown.revealedCards.length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Revealed cards</strong>
                          {hand.showdown.revealedCards.map((entry, idx) => (
                            <span key={`show-${idx}`}>
                              {entry.player}: {(entry.cards || []).join(" ") || "Unknown"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : null}
            </article>
          )})}
        </div>
      ) : null}

      {parsedHands.length > 0 && filteredParsedHands.length === 0 ? (
        <p className="hand-review-empty">
          No parsed hands match the selected outcome status.
        </p>
      ) : null}
    </section>
  );
}
