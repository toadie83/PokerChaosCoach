import { useEffect, useMemo, useRef, useState } from "react";
import {
  requestBillingCheckoutSession,
  requestBillingPortalSession,
  requestBillingStatus,
  requestBlindDefenseReview,
  requestDeleteSavedTournament,
  requestHandHistoryParse,
  requestHandHistoryReview,
  requestIcmSpotReview,
  requestSavedTournament,
  requestSavedTournaments,
  requestTableHintReview,
  requestTournamentUpload,
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
    stat.total,
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
  const hasNumber = Number.isFinite(number) && number > 0;
  if (hasNumber) return `Seat ${number}`;
  return "Seat unknown";
}

function formatSeatNumber(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return `Seat ${number}`;
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
  if (
    confidence === "high" ||
    confidence === "medium" ||
    confidence === "low"
  ) {
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
  const riverPlayers = uniquePlayersForStreet(
    hand?.actionsByStreet?.river || [],
  );
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
    confidenceFromSample(denominator),
  )}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildTournamentRating(summary, postflopDigest) {
  if (!summary?.preflopBreakdown) return null;
  const pre = summary.preflopBreakdown;
  const penalties = [];
  const totalHands = Number(summary?.totalHands) || 0;
  const preflopFoldPct = Number(summary?.preflopFoldPct) || 0;
  const preflopFoldThreshold = Number(summary?.preflopFoldWarnThreshold) || 78;

  const addPenalty = (label, points, sample) => {
    const pts = Number(points);
    if (!Number.isFinite(pts) || pts <= 0) return;
    penalties.push({
      label,
      points: Number(pts.toFixed(1)),
      sample: Number(sample) || 0,
    });
  };

  if (totalHands >= 40 && preflopFoldPct > preflopFoldThreshold) {
    addPenalty(
      "High overall preflop fold rate",
      clamp((preflopFoldPct - preflopFoldThreshold) * 1.2, 0, 20),
      totalHands,
    );
  }

  const openSpots = Number(pre.noRaiseBeforeHeroSpots) || 0;
  const openRate = safePercent(pre.openedWhenNoRaiseBeforeHero, openSpots);
  if (openSpots >= 12 && openRate < 28) {
    addPenalty(
      "Under-opening first-in",
      clamp((28 - openRate) * 0.65, 0, 14),
      openSpots,
    );
  }

  const defendSpots = Number(pre.facingOpenSpots) || 0;
  const defendRate = safePercent(pre.defendedFacingOpen, defendSpots);
  if (defendSpots >= 12 && defendRate < 32) {
    addPenalty(
      "Underdefending versus opens",
      clamp((32 - defendRate) * 0.8, 0, 18),
      defendSpots,
    );
  }

  const blindSpots = Number(pre.blindFacingOpenSpots) || 0;
  const blindFoldRate = safePercent(pre.blindFoldFacingOpen, blindSpots);
  if (blindSpots >= 12 && blindFoldRate > 66) {
    addPenalty(
      "Blinds overfolding versus opens",
      clamp((blindFoldRate - 66) * 0.6, 0, 12),
      blindSpots,
    );
  }

  const reraiseSpots = Number(pre.facedReraiseAfterAggressionSpots) || 0;
  const reraiseFoldRate = safePercent(
    pre.foldedAfterFacingReraise,
    reraiseSpots,
  );
  if (reraiseSpots >= 8 && reraiseFoldRate > 78) {
    addPenalty(
      "Overfolding after reraises",
      clamp((reraiseFoldRate - 78) * 0.35, 0, 6),
      reraiseSpots,
    );
  }

  const post = postflopDigest?.findings || {};
  const scorePostMetric = (label, metric, thresholdPct, scale, cap) => {
    const opportunities = Number(metric?.opportunities) || 0;
    const ratePct = Number(metric?.ratePct) || 0;
    if (opportunities < 8 || ratePct <= thresholdPct) return;
    addPenalty(
      label,
      clamp((ratePct - thresholdPct) * scale, 0, cap),
      opportunities,
    );
  };

  scorePostMetric(
    "Missed in-position c-bets (favorable flop)",
    post.missedIpCbetFavorable,
    30,
    0.45,
    8,
  );
  scorePostMetric(
    "Missed in-position stabs (favorable flop)",
    post.missedIpStabFavorable,
    30,
    0.4,
    7,
  );
  scorePostMetric(
    "Likely light in-position turn folds",
    post.lightIpFoldTurn,
    18,
    0.5,
    8,
  );
  scorePostMetric(
    "Likely light in-position river folds",
    post.lightIpFoldRiver,
    16,
    0.5,
    8,
  );
  scorePostMetric(
    "Missed in-position value-raises",
    post.missedIpValueRaise,
    25,
    0.42,
    7,
  );

  const totalPenalty = penalties.reduce((sum, item) => sum + item.points, 0);
  const scorePct = clamp(100 - totalPenalty, 0, 100);
  const score10 = scorePct / 10;
  const sortedPenalties = [...penalties].sort((a, b) => b.points - a.points);
  const isPrelim = totalHands < 60;

  return {
    scorePct: Number(scorePct.toFixed(1)),
    score10: Number(score10.toFixed(1)),
    scorePctLabel: `${scorePct.toFixed(1)}%`,
    score10Label: `${score10.toFixed(1)}/10`,
    prelimNote: isPrelim ? "Preliminary rating (sample under 60 hands)." : "",
    topDrags: sortedPenalties.slice(0, 4).map((item) => ({
      label: item.label,
      points: Number(item.points.toFixed(1)),
      sample: item.sample,
    })),
    totalPenalty: Number(totalPenalty.toFixed(1)),
  };
}

function buildTournamentCoachSummary(summary, postflopDigest) {
  if (!summary?.preflopBreakdown) return null;
  const pre = summary.preflopBreakdown;
  const rating = buildTournamentRating(summary, postflopDigest);
  const candidates = [];
  const openRate = safePercent(
    pre.openedWhenNoRaiseBeforeHero,
    pre.noRaiseBeforeHeroSpots,
  );
  const defendRate = safePercent(pre.defendedFacingOpen, pre.facingOpenSpots);
  const blindFoldRate = safePercent(
    pre.blindFoldFacingOpen,
    pre.blindFacingOpenSpots,
  );
  const reraiseFoldRate = safePercent(
    pre.foldedAfterFacingReraise,
    pre.facedReraiseAfterAggressionSpots,
  );

  if (pre.noRaiseBeforeHeroSpots >= 12 && openRate < 28) {
    candidates.push({
      key: "opening_low",
      severity: 28 - openRate,
      label: "Under-opening in first-in spots",
      evidence: `Open rate in no-raise spots is ${rateCountLabel(
        pre.openedWhenNoRaiseBeforeHero,
        pre.noRaiseBeforeHeroSpots,
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
        pre.facingOpenSpots,
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
        pre.blindFacingOpenSpots,
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
        pre.facedReraiseAfterAggressionSpots,
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
    pre.facingOpenSpots < 8 ? "low sample" : defendRate < 32 ? "too low" : "ok";
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
      pre.noRaiseBeforeHeroSpots,
    )} - ${openSignal}`,
    `Defend vs open: ${rateCountLabel(
      pre.defendedFacingOpen,
      pre.facingOpenSpots,
    )} - ${defendSignal}`,
    `Blind fold vs open: ${rateCountLabel(
      pre.blindFoldFacingOpen,
      pre.blindFacingOpenSpots,
    )} - ${blindFoldSignal}`,
  ];
  if (pre.facedReraiseAfterAggressionSpots > 0) {
    evidence.push(
      `Fold after reraise: ${rateCountLabel(
        pre.foldedAfterFacingReraise,
        pre.facedReraiseAfterAggressionSpots,
      )} - ${reraiseSignal}`,
    );
  }

  const actions = [];
  if (primary?.action) actions.push(primary.action);
  if (secondary?.action) actions.push(secondary.action);
  if (actions.length === 0) {
    actions.push(
      "No dominant leak signal yet. Keep collecting hands and focus on the largest preflop opportunity buckets.",
    );
  }

  return {
    rating,
    primaryLeak:
      primary?.label || "No single dominant leak identified in current sample",
    secondaryLeak: secondary?.label || null,
    evidence: evidence.slice(0, 4),
    actions,
  };
}

function ensureSentenceEnding(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function normalizeInsightLines(items, max = 8) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

function buildAiSummaryParagraph(review) {
  if (!review || typeof review !== "object") return "";
  const joinSentences = (items, limit) =>
    items.slice(0, limit).map(ensureSentenceEnding).filter(Boolean).join(" ");
  const primaryLeak = String(review.primary_leak || "").trim();
  const secondaryLeak = String(review.secondary_leak || "").trim();
  const actions = normalizeInsightLines(review.actions, 8);
  const warnings = normalizeInsightLines(review.warnings, 8);
  const actionSnippet = joinSentences(actions, 3);
  const warningSnippet = joinSentences(warnings, 2);

  const parts = [];
  if (primaryLeak) {
    parts.push(`Primary leak: ${ensureSentenceEnding(primaryLeak)}`);
  }
  if (secondaryLeak && !/no secondary leak flagged/i.test(secondaryLeak)) {
    parts.push(`Secondary leak: ${ensureSentenceEnding(secondaryLeak)}`);
  }
  if (actionSnippet) {
    parts.push(`Priority fixes: ${actionSnippet}`);
  }
  if (warningSnippet) {
    parts.push(`Watch-outs: ${warningSnippet}`);
  }
  return parts.join(" ");
}

function buildTableHintParagraph(review) {
  if (!review || typeof review !== "object") return "";
  const plan = String(review.table_plan || "").trim();
  const exploits = normalizeInsightLines(review.priority_exploits, 8)
    .slice(0, 2)
    .map(ensureSentenceEnding)
    .join(" ");
  const adjustments = normalizeInsightLines(review.next_hour_adjustments, 8)
    .slice(0, 2)
    .map(ensureSentenceEnding)
    .join(" ");
  const confidence = String(review.confidence || "").trim().toLowerCase();

  const parts = [];
  if (plan) parts.push(ensureSentenceEnding(plan));
  if (exploits) parts.push(`Priority exploits: ${exploits}`);
  if (adjustments) parts.push(`Next-hour adjustments: ${adjustments}`);
  if (confidence && ["low", "medium", "high"].includes(confidence)) {
    parts.push(`Confidence: ${confidence}.`);
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
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
    raw.trim(),
  );
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

function stripFileExtension(fileName) {
  const value = String(fileName || "").trim();
  if (!value) return "";
  return value.replace(/\.[^.]+$/, "");
}

function parseTournamentMetaFromFileName(fileName) {
  const base = stripFileExtension(fileName);
  if (!base) {
    return {
      tournamentId: "",
      tournamentName: "",
      playedAtEpoch: null,
    };
  }

  const idAndNameMatch = /^([A-Za-z]{2}\d{8}-\d{4})\s*-\s*(.+)$/.exec(base);
  if (idAndNameMatch) {
    const rawId = String(idAndNameMatch[1] || "").trim();
    const rawName = String(idAndNameMatch[2] || "").trim();
    const idDateMatch = /^[A-Za-z]{2}(\d{8})-(\d{4})$/.exec(rawId);
    let playedAtEpoch = null;
    if (idDateMatch) {
      const dateToken = idDateMatch[1];
      const timeToken = idDateMatch[2];
      const year = Number(dateToken.slice(0, 4));
      const month = Number(dateToken.slice(4, 6));
      const day = Number(dateToken.slice(6, 8));
      const hour = Number(timeToken.slice(0, 2));
      const minute = Number(timeToken.slice(2, 4));
      playedAtEpoch = Date.UTC(year, month - 1, day, hour, minute, 0);
    }
    return {
      tournamentId: rawId,
      tournamentName: rawName,
      playedAtEpoch: Number.isFinite(playedAtEpoch) ? playedAtEpoch : null,
    };
  }

  return {
    tournamentId: "",
    tournamentName: base,
    playedAtEpoch: null,
  };
}

function formatDateTimeLabelFromEpoch(epoch) {
  const value = Number(epoch);
  if (!Number.isFinite(value)) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLabel(value) {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "number") return formatDateTimeLabelFromEpoch(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HAND_RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K",
  "A",
];
const HAND_RANK_INDEX = HAND_RANKS.reduce((map, rank, idx) => {
  map[rank] = idx;
  return map;
}, {});

function expandRangeToken(token) {
  const text = String(token || "")
    .trim()
    .toUpperCase();
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
  const c1 = String(cards[0] || "")
    .trim()
    .toUpperCase();
  const c2 = String(cards[1] || "")
    .trim()
    .toUpperCase();
  if (c1.length < 2 || c2.length < 2) return null;
  const r1 = c1[0];
  const r2 = c2[0];
  const s1 = c1[c1.length - 1];
  const s2 = c2[c2.length - 1];
  if (
    !HAND_RANK_INDEX.hasOwnProperty(r1) ||
    !HAND_RANK_INDEX.hasOwnProperty(r2)
  ) {
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
  const pos = String(rawPosition || "")
    .trim()
    .toUpperCase();
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
      "UTG+1": makeRangeSet([
        "66+",
        "ATS+",
        "KJS+",
        "QJS",
        "AJO+",
        "KQO",
        "A5S",
        "A4S",
      ]),
      LJ: makeRangeSet([
        "55+",
        "A9S+",
        "KTS+",
        "QTS+",
        "JTS",
        "T9S",
        "98S",
        "AJO+",
        "KQO",
      ]),
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
      BTN: makeRangeSet([
        "55+",
        "A7S+",
        "ATO+",
        "KTS+",
        "KQO",
        "QTS+",
        "JTS",
        "T9S",
        "98S",
      ]),
      CO: makeRangeSet([
        "66+",
        "ATS+",
        "AQO+",
        "KQS",
        "KJS",
        "QJS",
        "JTS",
        "T9S",
      ]),
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
const ICM_TIGHT_OPEN_RANGE_MODEL = {
  UTG: makeRangeSet(["99+", "AJS+", "AQO+", "KQS"]),
  "UTG+1": makeRangeSet(["88+", "AJS+", "AQO+", "KQS"]),
  LJ: makeRangeSet(["77+", "ATS+", "AQO+", "KQS", "QJS"]),
  HJ: makeRangeSet(["66+", "ATS+", "AJO+", "KQS", "KJS", "QJS"]),
  CO: makeRangeSet(["55+", "A9S+", "ATO+", "KTS+", "KQO", "QTS+", "JTS"]),
  BTN: makeRangeSet(["44+", "A8S+", "ATO+", "KTS+", "KQO", "QTS+", "JTS"]),
  SB: makeRangeSet(["66+", "ATS+", "AJO+", "KQS", "KJS", "QJS"]),
};
const ICM_JAM_CALL_RANGE_MODEL = {
  UTG: makeRangeSet(["JJ+", "AKS", "AKO", "AQS"]),
  "UTG+1": makeRangeSet(["JJ+", "AKS", "AKO", "AQS"]),
  LJ: makeRangeSet(["TT+", "AKS", "AKO", "AQS"]),
  HJ: makeRangeSet(["99+", "AKS", "AKO", "AQS", "AJS"]),
  CO: makeRangeSet(["99+", "AKS", "AKO", "AQS", "AJS"]),
  BTN: makeRangeSet(["88+", "AJS+", "AQO+", "KQS"]),
  SB: makeRangeSet(["99+", "AKS", "AKO", "AQS"]),
  BB: makeRangeSet(["88+", "AJS+", "AQO+", "KQS"]),
};

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
      .sort(
        (a, b) => b.count - a.count || a.position.localeCompare(b.position),
      ),
    topCombos: Array.from(byCombo.values())
      .sort((a, b) => b.count - a.count || a.position.localeCompare(b.position))
      .slice(0, 8),
    examples: (events || []).slice(0, 6),
  };
}

function parseLevelNumber(rawLevel) {
  const match = /(\d+)/.exec(String(rawLevel || "").trim());
  if (!match) return null;
  const level = Number(match[1]);
  return Number.isFinite(level) ? level : null;
}

function getSeatStackByPosition(hand, position) {
  const seats = Array.isArray(hand?.seats) ? hand.seats : [];
  const target = String(position || "").trim().toUpperCase();
  if (!target) return null;
  for (const seat of seats) {
    const seatPos = normalizePositionForRanges(seat?.position);
    if (seatPos !== target) continue;
    const chips = Number(seat?.chips);
    if (!Number.isFinite(chips) || chips <= 0) return null;
    return chips;
  }
  return null;
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
          isPreflopAggressiveAction(action),
      );

    if (!priorOpponentAggression) {
      rfiSpotsScored += 1;
      const shouldOpen = rangeContains(
        PRE_FLOP_RANGE_MODEL.openRfi,
        position,
        handCode,
      );
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
          isPreflopAggressiveAction(action),
      );
      if (heroRfiIndex >= 0) {
        const opp3BetIndex = preflopActions.findIndex(
          (action, idx) =>
            idx > heroRfiIndex &&
            String(action?.player || "").trim() !== heroName &&
            isPreflopAggressiveAction(action),
        );
        if (opp3BetIndex >= 0) {
          const heroResponse = preflopActions.find(
            (action, idx) =>
              idx > opp3BetIndex &&
              String(action?.player || "").trim() === heroName &&
              isPreflopDecisionAction(action),
          );
          if (heroResponse) {
            vs3BetSpotsScored += 1;
            const responseType = normalizeActionType(heroResponse);
            const shouldContinue = rangeContains(
              PRE_FLOP_RANGE_MODEL.continueVs3BetAfterOpen,
              position,
              handCode,
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
        handCode,
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
  const looseContinueVs3BetSummary = summarizeAuditEvents(
    looseContinueVs3BetEvents,
  );

  const quickFixes = [];
  const topMissedOpenPosition = missedOpenSummary.byPosition[0];
  const topMissedDefendPosition = missedDefendSummary.byPosition[0];
  const topOverfold3BetPosition = overfoldVs3BetSummary.byPosition[0];
  if (topMissedOpenPosition) {
    quickFixes.push(
      `Open more first-in from ${topMissedOpenPosition.position}; ${topMissedOpenPosition.count} chart-qualified opens were missed.`,
    );
  }
  if (topMissedDefendPosition) {
    quickFixes.push(
      `Defend more vs opens from ${topMissedDefendPosition.position}; ${topMissedDefendPosition.count} chart-qualified continues were folded.`,
    );
  }
  if (topOverfold3BetPosition) {
    quickFixes.push(
      `Continue slightly wider vs 3-bets after opening from ${topOverfold3BetPosition.position}; strong continues are being folded.`,
    );
  }
  if (quickFixes.length === 0) {
    quickFixes.push(
      "No dominant passive preflop leak from this chart-based check. Keep collecting volume for stronger signals.",
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

function rankValueFromCode(rank) {
  const idx = HAND_RANK_INDEX[String(rank || "").toUpperCase()];
  return Number.isFinite(idx) ? idx + 2 : null;
}

function classifyBlindDefenseHand(handCode) {
  const code = String(handCode || "").trim().toUpperCase();
  if (!code) return "Unknown";
  if (/^([2-9TJQKA])\1$/.test(code)) return "Pocket pairs";

  const match = /^([2-9TJQKA])([2-9TJQKA])(S|O)$/.exec(code);
  if (!match) return "Other offsuit/suited";
  const r1 = match[1];
  const r2 = match[2];
  const suitFlag = match[3];
  const v1 = rankValueFromCode(r1);
  const v2 = rankValueFromCode(r2);
  const highCards = new Set(["T", "J", "Q", "K", "A"]);
  const bothBroadway = highCards.has(r1) && highCards.has(r2);
  const gap = Number.isFinite(v1) && Number.isFinite(v2) ? Math.abs(v1 - v2) : null;
  const hasAce = r1 === "A" || r2 === "A";

  if (suitFlag === "S" && gap === 1) return "Suited connectors";
  if (suitFlag === "S" && bothBroadway) return "Suited broadways";
  if (suitFlag === "O" && bothBroadway) return "Offsuit broadways";
  if (suitFlag === "S" && hasAce) return "Suited Ax";
  if (suitFlag === "O" && hasAce) return "Offsuit Ax";
  if (suitFlag === "S") return "Suited gappers/other";
  return "Offsuit non-broadway";
}

function resolvePreflopAggressorBeforeHero(hand, heroDecisionIndex) {
  const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
    ? hand.actionsByStreet.preflop
    : [];
  let aggressor = null;
  for (let i = 0; i < preflopActions.length; i += 1) {
    if (i >= heroDecisionIndex) break;
    const action = preflopActions[i];
    if (!isPreflopAggressiveAction(action)) continue;
    const player = String(action?.player || "").trim();
    if (!player) continue;
    aggressor = player;
  }
  if (!aggressor) return null;
  const seats = Array.isArray(hand?.seats) ? hand.seats : [];
  const seat = seats.find((row) => String(row?.player || "").trim() === aggressor);
  return {
    player: aggressor,
    position: normalizePositionForRanges(seat?.position) || "Unknown",
  };
}

const BLIND_SB_3BET_PRESSURE_RANGE = makeRangeSet([
  "77+",
  "A9S+",
  "AJO+",
  "KTS+",
  "KQO",
  "QTS+",
  "JTS",
]);

function buildBlindDefenseAudit(hands) {
  const list = Array.isArray(hands) ? hands : [];
  const missedContinueEvents = [];
  const blindFoldEvents = [];
  const categoryCounts = new Map();
  const sb3BetCandidateEvents = [];
  const byIssue = new Map();

  let totalBlindDefenseSpots = 0;
  let sbDefenseSpots = 0;
  let bbDefenseSpots = 0;
  let unknownCardsSpots = 0;
  let likelyContinueSpots = 0;

  for (const hand of list) {
    const heroName = String(hand?.heroName || "").trim();
    const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
      ? hand.actionsByStreet.preflop
      : [];
    if (!heroName || preflopActions.length === 0) continue;

    const position = normalizePositionForRanges(hand?.heroPosition);
    if (position !== "SB" && position !== "BB") continue;

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

    const priorAggression = preflopActions
      .slice(0, firstHeroDecisionIndex)
      .some(
        (action) =>
          String(action?.player || "").trim() !== heroName &&
          isPreflopAggressiveAction(action),
      );
    if (!priorAggression) continue;

    totalBlindDefenseSpots += 1;
    if (position === "SB") sbDefenseSpots += 1;
    if (position === "BB") bbDefenseSpots += 1;

    const handCode = normalizeHeroHandCode(hand?.heroCards);
    if (!handCode) {
      unknownCardsSpots += 1;
      continue;
    }

    const firstType = normalizeActionType(firstHeroDecision);
    const didFold = firstType === "fold";
    const shouldDefend = rangeContains(
      PRE_FLOP_RANGE_MODEL.defendVsOpen,
      position,
      handCode,
    );
    if (shouldDefend) likelyContinueSpots += 1;

    const baseEvent = {
      handKey: handKey(hand),
      handId: hand?.handId || "Unknown",
      playedAt: hand?.playedAt || "Unknown",
      level: parseLevelNumber(hand?.level),
      position,
      handCode,
      handClass: classifyBlindDefenseHand(handCode),
      actualAction: firstType || "unknown",
    };

    if (didFold) {
      blindFoldEvents.push({
        ...baseEvent,
        type: "blind_fold",
        chartShouldDefend: shouldDefend,
        recommendation: shouldDefend
          ? "Likely continue candidate (call or 3-bet mix)."
          : "Likely standard fold unless exploitative read says otherwise.",
      });
    }

    if (!(shouldDefend && didFold)) continue;

    categoryCounts.set(
      baseEvent.handClass,
      (categoryCounts.get(baseEvent.handClass) || 0) + 1,
    );
    missedContinueEvents.push({
      ...baseEvent,
      type: "missed_blind_continue",
      recommendation: "Likely defend candidate was folded.",
    });

    const aggressor = resolvePreflopAggressorBeforeHero(hand, firstHeroDecisionIndex);
    const openerPos = String(aggressor?.position || "").trim();
    const lateOpen = openerPos === "CO" || openerPos === "BTN";
    const sb3BetCandidate =
      position === "SB" &&
      lateOpen &&
      BLIND_SB_3BET_PRESSURE_RANGE.has(handCode);
    if (sb3BetCandidate) {
      sb3BetCandidateEvents.push({
        ...baseEvent,
        type: "missed_sb_3bet_pressure",
        openerPosition: openerPos,
        recommendation:
          "SB vs late open: likely 3-bet pressure candidate was folded.",
      });
      byIssue.set(
        "missed_sb_3bet_pressure",
        (byIssue.get("missed_sb_3bet_pressure") || 0) + 1,
      );
    } else {
      byIssue.set(
        "missed_blind_continue",
        (byIssue.get("missed_blind_continue") || 0) + 1,
      );
    }
  }

  const missedSummary = summarizeAuditEvents(missedContinueEvents);
  const blindFoldSummary = summarizeAuditEvents(blindFoldEvents);
  const sb3BetSummary = summarizeAuditEvents(sb3BetCandidateEvents);
  const categoryRows = Array.from(categoryCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
  const issueCounts = Object.fromEntries(
    Array.from(byIssue.entries()).sort((a, b) => b[1] - a[1]),
  );

  const quickFixes = [];
  const topCategory = categoryRows[0];
  if (topCategory) {
    quickFixes.push(
      `Most missed blind continues are in ${topCategory.label.toLowerCase()} (${topCategory.count}). Drill these first.`,
    );
  }
  if (sb3BetCandidateEvents.length > 0) {
    quickFixes.push(
      `SB pressure vs late opens is underused (${sb3BetCandidateEvents.length} likely 3-bet spots folded).`,
    );
  }
  if (quickFixes.length === 0) {
    quickFixes.push(
      "No dominant blind-defense leak in current sample.",
    );
  }

  const confidence = confidenceFromSample(totalBlindDefenseSpots);
  const warnings = [];
  if (totalBlindDefenseSpots < 12) {
    warnings.push("Blind-defense sample is small; treat findings as low confidence.");
  }
  warnings.push("Baseline uses chart heuristics; exploit adjustments can override specific spots.");

  return {
    totalBlindDefenseSpots,
    sbDefenseSpots,
    bbDefenseSpots,
    likelyContinueSpots,
    unknownCardsSpots,
    confidence,
    issueCounts,
    handClassRows: categoryRows,
    missedContinues: {
      count: missedContinueEvents.length,
      ...missedSummary,
    },
    blindFolds: {
      count: blindFoldEvents.length,
      shouldDefendCount: blindFoldEvents.filter((event) => event.chartShouldDefend).length,
      ...blindFoldSummary,
    },
    missedSb3BetPressure: {
      count: sb3BetCandidateEvents.length,
      ...sb3BetSummary,
    },
    quickFixes,
    warnings,
  };
}

function buildIcmSpotAudit(hands, options = {}) {
  const list = Array.isArray(hands) ? [...hands] : [];
  const recentLimit =
    Number.isFinite(Number(options?.recentLimit)) && Number(options.recentLimit) > 0
      ? Math.floor(Number(options.recentLimit))
      : 40;
  const levelThreshold =
    Number.isFinite(Number(options?.levelThreshold)) &&
    Number(options.levelThreshold) > 0
      ? Math.floor(Number(options.levelThreshold))
      : 25;
  const sortedRecentHands = list
    .sort(
      (a, b) => (Number(getHandPlayedAtEpoch(b)) || 0) - (Number(getHandPlayedAtEpoch(a)) || 0),
    )
    .slice(0, recentLimit);
  const levelFilteredHands = sortedRecentHands.filter((hand) => {
    const levelNumber = parseLevelNumber(hand?.level);
    return Number.isFinite(levelNumber) && levelNumber >= levelThreshold;
  });
  const flaggedEvents = [];
  const blindFoldEvents = [];
  const byType = new Map();
  let unknownCardsSpots = 0;
  let openSpots = 0;
  let facingAggressionSpots = 0;
  let facingJamSpots = 0;
  let pressureEligibleSpots = 0;
  let missedPressureSpots = 0;
  let stackBbSamples = 0;
  let stackBbTotal = 0;

  const pushFlag = (event) => {
    flaggedEvents.push(event);
    const key = String(event?.type || "other");
    byType.set(key, (byType.get(key) || 0) + 1);
  };

  for (const hand of levelFilteredHands) {
    const heroName = String(hand?.heroName || "").trim();
    const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
      ? hand.actionsByStreet.preflop
      : [];
    if (!heroName || preflopActions.length === 0) continue;

    const position = normalizePositionForRanges(hand?.heroPosition) || "Unknown";
    const handCode = normalizeHeroHandCode(hand?.heroCards);
    if (!handCode) {
      unknownCardsSpots += 1;
      continue;
    }

    const bigBlind = Number(hand?.blinds?.bigBlind);
    const heroStack = Number(hand?.heroStack);
    const heroStackBb =
      Number.isFinite(bigBlind) &&
      bigBlind > 0 &&
      Number.isFinite(heroStack) &&
      heroStack > 0
        ? heroStack / bigBlind
        : null;
    if (Number.isFinite(heroStackBb)) {
      stackBbTotal += Number(heroStackBb);
      stackBbSamples += 1;
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

    const firstType = normalizeActionType(firstHeroDecision);
    const didAggress = isPreflopAggressiveAction(firstHeroDecision);
    const priorActions = preflopActions.slice(0, firstHeroDecisionIndex);
    const priorAggression = priorActions.some(
      (action) =>
        String(action?.player || "").trim() !== heroName &&
        isPreflopAggressiveAction(action),
    );
    const priorJam = priorActions.some(
      (action) =>
        String(action?.player || "").trim() !== heroName &&
        normalizeActionType(action) === "jam",
    );

    const levelNumber = parseLevelNumber(hand?.level);
    const baseEvent = {
      handKey: handKey(hand),
      handId: hand?.handId || "Unknown",
      playedAt: hand?.playedAt || "Unknown",
      level: Number.isFinite(levelNumber) ? levelNumber : null,
      position,
      handCode,
      stackBb:
        Number.isFinite(heroStackBb) && heroStackBb > 0
          ? Number(heroStackBb.toFixed(1))
          : null,
      actualAction: firstType || "unknown",
    };

    if (!priorAggression) {
      openSpots += 1;
      const shouldOpenIcm = rangeContains(
        ICM_TIGHT_OPEN_RANGE_MODEL,
        position,
        handCode,
      );
      const latePositions = new Set(["CO", "BTN", "SB"]);
      const inLatePosition = latePositions.has(position);
      const sbStack = getSeatStackByPosition(hand, "SB");
      const bbStack = getSeatStackByPosition(hand, "BB");
      const sbStackBb =
        Number.isFinite(Number(sbStack)) && Number.isFinite(bigBlind) && bigBlind > 0
          ? Number(sbStack) / bigBlind
          : null;
      const bbStackBb =
        Number.isFinite(Number(bbStack)) && Number.isFinite(bigBlind) && bigBlind > 0
          ? Number(bbStack) / bigBlind
          : null;
      const coversSb =
        Number.isFinite(heroStack) && Number.isFinite(Number(sbStack))
          ? heroStack >= Number(sbStack) * 1.2
          : false;
      const coversBb =
        Number.isFinite(heroStack) && Number.isFinite(Number(bbStack))
          ? heroStack >= Number(bbStack) * 1.2
          : false;
      const shortBlindPresent =
        (Number.isFinite(sbStackBb) && sbStackBb <= 18) ||
        (Number.isFinite(bbStackBb) && bbStackBb <= 18);
      const pressureEligible =
        inLatePosition &&
        Number.isFinite(heroStackBb) &&
        heroStackBb >= 10 &&
        heroStackBb <= 35 &&
        shortBlindPresent &&
        (coversSb || coversBb);
      if (pressureEligible) {
        pressureEligibleSpots += 1;
      }

      if (
        shouldOpenIcm &&
        !didAggress &&
        !pressureEligible &&
        inLatePosition &&
        Number.isFinite(heroStackBb) &&
        heroStackBb >= 10 &&
        heroStackBb <= 30
      ) {
        pushFlag({
          ...baseEvent,
          type: "missed_icm_pressure",
          recommendation: "Open or jam more often in this late-position ICM pressure spot.",
          reason:
            "Late-position pressure spot was passed despite a chart-qualified open hand.",
        });
      }
      if (shouldOpenIcm && !didAggress && pressureEligible) {
        missedPressureSpots += 1;
        pushFlag({
          ...baseEvent,
          type: "missed_stack_pressure",
          recommendation:
            "Apply more preflop pressure here: you cover at least one short blind from a late position.",
          reason:
            "Late-position stack leverage over short blinds was available but not used.",
        });
      }

      if (
        !shouldOpenIcm &&
        didAggress &&
        Number.isFinite(heroStackBb) &&
        heroStackBb <= 18
      ) {
        pushFlag({
          ...baseEvent,
          type: "too_loose_icm_open",
          recommendation: "Tighten opens/jams with short stacks at high levels.",
          reason:
            "Short-stack ICM proxy suggests this open/jam is too loose for late-stage pressure dynamics.",
        });
      }

      if (
        shouldOpenIcm &&
        firstType === "call" &&
        Number.isFinite(heroStackBb) &&
        heroStackBb <= 12
      ) {
        pushFlag({
          ...baseEvent,
          type: "passive_short_stack_line",
          recommendation: "Prefer jam-or-fold decisions over passive calls with short stacks.",
          reason:
            "Short-stack preflop line was passive in a spot that is usually jam/fold under ICM pressure.",
        });
      }
      continue;
    }

    facingAggressionSpots += 1;
    if (priorJam) facingJamSpots += 1;

    const shouldDefendVsOpen = rangeContains(
      PRE_FLOP_RANGE_MODEL.defendVsOpen,
      position,
      handCode,
    );
    if ((position === "SB" || position === "BB") && firstType === "fold") {
      blindFoldEvents.push({
        ...baseEvent,
        type: "blind_fold_vs_open",
        recommendation: shouldDefendVsOpen
          ? "Likely continue candidate (call/3-bet mix) rather than fold."
          : "Likely standard fold unless exploit suggests otherwise.",
        chartShouldDefend: shouldDefendVsOpen,
      });
    }
    if (
      shouldDefendVsOpen &&
      firstType === "fold" &&
      Number.isFinite(heroStackBb) &&
      heroStackBb >= 12 &&
      heroStackBb <= 25 &&
      (position === "BB" || position === "SB")
    ) {
      pushFlag({
        ...baseEvent,
        type: "too_tight_icm_defend",
        recommendation:
          "Defend slightly wider from blinds against opens when stack depth allows.",
        reason:
          "Blind defense folded a hand that is usually defendable at this stack depth.",
      });
    }

    if (priorJam) {
      const shouldContinueVsJam = rangeContains(
        ICM_JAM_CALL_RANGE_MODEL,
        position,
        handCode,
      );
      if (
        firstType !== "fold" &&
        !shouldContinueVsJam &&
        Number.isFinite(heroStackBb) &&
        heroStackBb <= 24
      ) {
        pushFlag({
          ...baseEvent,
          type: "loose_jam_call_icm",
          recommendation: "Tighten call-offs versus all-ins in high-level ICM spots.",
          reason:
            "All-in continue appears too loose for this late-stage stack depth.",
        });
      } else if (
        firstType === "fold" &&
        shouldContinueVsJam &&
        Number.isFinite(heroStackBb) &&
        heroStackBb <= 20
      ) {
        pushFlag({
          ...baseEvent,
          type: "too_tight_jam_fold_icm",
          recommendation: "Continue more often versus jams with this hand class.",
          reason:
            "Folded a likely continue hand in a late-stage all-in confrontation.",
        });
      }
    }
  }

  const typeSummary = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);
  const topIssue = typeSummary[0]?.[0] || "";
  const quickFixes = [];
  if (topIssue === "missed_icm_pressure") {
    quickFixes.push(
      "Apply more late-position pressure with chart-qualified opens/jams between roughly 10-30 BB.",
    );
  }
  if (topIssue === "missed_stack_pressure") {
    quickFixes.push(
      "When you cover short blinds from CO/BTN/SB, increase pressure frequency with your stronger opens.",
    );
  }
  if (topIssue === "too_loose_icm_open" || topIssue === "loose_jam_call_icm") {
    quickFixes.push(
      "Tighten high-variance opens and call-offs at short to medium stacks in late levels.",
    );
  }
  if (topIssue === "too_tight_icm_defend" || topIssue === "too_tight_jam_fold_icm") {
    quickFixes.push(
      "Avoid overfolding defend/call spots that remain profitable at current stack depths.",
    );
  }
  if (quickFixes.length === 0) {
    quickFixes.push(
      "No dominant ICM-style leak in the current last-40 late-level sample.",
    );
  }

  const avgStackBb =
    stackBbSamples > 0 ? Number((stackBbTotal / stackBbSamples).toFixed(1)) : null;
  const summary = summarizeAuditEvents(flaggedEvents);
  const blindFoldSummary = summarizeAuditEvents(blindFoldEvents);
  const blindFoldShouldDefendCount = blindFoldEvents.filter(
    (row) => Boolean(row?.chartShouldDefend),
  ).length;
  const confidence = confidenceFromSample(levelFilteredHands.length);
  const warnings = [
    "This is a heuristic ICM proxy (no payout ladder or remaining-field payouts yet).",
    "Use it to prioritize review spots; treat edge cases as medium/low confidence.",
  ];

  return {
    recentLimit,
    levelThreshold,
    recentHandsSampled: sortedRecentHands.length,
    lateLevelHands: levelFilteredHands.length,
    openSpots,
    facingAggressionSpots,
    facingJamSpots,
    pressureEligibleSpots,
    missedPressureSpots,
    unknownCardsSpots,
    avgHeroStackBb: avgStackBb,
    confidence,
    issueCounts: Object.fromEntries(typeSummary),
    blindFoldSpots: {
      count: blindFoldEvents.length,
      shouldDefendCount: blindFoldShouldDefendCount,
      ...blindFoldSummary,
    },
    flagged: {
      count: flaggedEvents.length,
      ...summary,
    },
    quickFixes,
    warnings,
  };
}

const POST_FLOP_DECISION_TYPES = new Set([
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "jam",
]);
const POST_FLOP_AGGRESSIVE_TYPES = new Set(["bet", "raise", "jam"]);

function isPostflopDecisionAction(action) {
  const type = normalizeActionType(action);
  return POST_FLOP_DECISION_TYPES.has(type);
}

function isPostflopAggressiveAction(action) {
  const type = normalizeActionType(action);
  return POST_FLOP_AGGRESSIVE_TYPES.has(type);
}

function parseCardToken(token) {
  const text = String(token || "")
    .trim()
    .toUpperCase();
  if (text.length < 2) return null;
  const rank = text[0];
  const suit = text[text.length - 1];
  if (!HAND_RANK_INDEX.hasOwnProperty(rank)) return null;
  return { rank, suit };
}

function parseCardList(cards) {
  if (!Array.isArray(cards)) return [];
  return cards.map(parseCardToken).filter(Boolean);
}

function hasHeroPairOrBetter(heroCards, boardCards) {
  if (!Array.isArray(heroCards) || heroCards.length < 2) return false;
  const hero = parseCardList(heroCards);
  const board = parseCardList(boardCards);
  if (hero.length < 2 || board.length === 0) return false;
  if (hero[0].rank === hero[1].rank) return true;
  const boardRanks = new Set(board.map((card) => card.rank));
  return boardRanks.has(hero[0].rank) || boardRanks.has(hero[1].rank);
}

function hasFlushDraw(heroCards, boardCards) {
  const hero = parseCardList(heroCards);
  const board = parseCardList(boardCards);
  if (hero.length < 2 || board.length < 3) return false;
  const suitCounts = new Map();
  for (const card of [...hero, ...board]) {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
  }
  for (const [suit, count] of suitCounts.entries()) {
    if (count < 4) continue;
    const heroHasSuit = hero.some((card) => card.suit === suit);
    const boardHasTwoSuit =
      board.filter((card) => card.suit === suit).length >= 2;
    if (heroHasSuit && boardHasTwoSuit) return true;
  }
  return false;
}

function rankValueSet(cards) {
  const parsed = parseCardList(cards);
  const values = new Set();
  for (const card of parsed) {
    const value = HAND_RANK_INDEX[card.rank] + 2;
    values.add(value);
    if (value === 14) values.add(1);
  }
  return values;
}

function hasMadeStraight(values) {
  for (let start = 1; start <= 10; start += 1) {
    if (
      values.has(start) &&
      values.has(start + 1) &&
      values.has(start + 2) &&
      values.has(start + 3) &&
      values.has(start + 4)
    ) {
      return true;
    }
  }
  return false;
}

function hasOpenEndedStraightDraw(heroCards, boardCards) {
  const values = rankValueSet([...(heroCards || []), ...(boardCards || [])]);
  if (values.size < 4) return false;
  if (hasMadeStraight(values)) return false;
  for (let start = 2; start <= 10; start += 1) {
    if (
      values.has(start) &&
      values.has(start + 1) &&
      values.has(start + 2) &&
      values.has(start + 3)
    ) {
      return true;
    }
  }
  return false;
}

function hasStrongFlopDraw(heroCards, flopCards) {
  return (
    hasFlushDraw(heroCards, flopCards) ||
    hasOpenEndedStraightDraw(heroCards, flopCards)
  );
}

function isFavorableFlopBoard(flopCards) {
  const flop = parseCardList(flopCards);
  if (flop.length < 3) return false;
  const ranks = flop.map((card) => HAND_RANK_INDEX[card.rank] + 2);
  const suits = new Set(flop.map((card) => card.suit));
  const rankCounts = new Map();
  for (const value of ranks) {
    rankCounts.set(value, (rankCounts.get(value) || 0) + 1);
  }
  const isPaired = Array.from(rankCounts.values()).some((count) => count >= 2);
  const hasHighCard = ranks.some((value) => value >= 12);
  const isRainbow = suits.size === 3;
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  let maxAdjacentRun = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run += 1;
      maxAdjacentRun = Math.max(maxAdjacentRun, run);
    } else {
      run = 1;
    }
  }
  const isDry = isRainbow && maxAdjacentRun <= 2;
  return isPaired || hasHighCard || isDry;
}

function getBoardCardsToStreet(board, street) {
  const flop = Array.isArray(board?.flop) ? board.flop.filter(Boolean) : [];
  const turn = board?.turn ? [board.turn] : [];
  const river = board?.river ? [board.river] : [];
  if (street === "flop") return [...flop];
  if (street === "turn") return [...flop, ...turn];
  if (street === "river") return [...flop, ...turn, ...river];
  return [...flop, ...turn, ...river];
}

function hasStrongMadeHand(heroCards, boardCards) {
  const hero = parseCardList(heroCards);
  const board = parseCardList(boardCards);
  if (hero.length < 2 || board.length < 3) return false;
  const rankCounts = new Map();
  for (const card of [...hero, ...board]) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
  }
  let pairRanks = 0;
  for (const count of rankCounts.values()) {
    if (count >= 3) return true;
    if (count >= 2) pairRanks += 1;
  }
  return pairRanks >= 2;
}

function findLastPreflopAggressor(preflopActions, heroName) {
  const actions = Array.isArray(preflopActions) ? preflopActions : [];
  let aggressor = null;
  for (const action of actions) {
    if (!isPreflopAggressiveAction(action)) continue;
    const player = String(action?.player || "").trim();
    if (!player) continue;
    aggressor = player;
  }
  if (!aggressor) return null;
  if (aggressor === heroName) return "hero";
  return "villain";
}

function buildPostflopInPositionAudit(hands) {
  const list = Array.isArray(hands) ? hands : [];
  const missedIpCbetFavorableEvents = [];
  const missedIpStabFavorableEvents = [];
  const lightIpFoldFlopEvents = [];
  const lightIpFoldTurnEvents = [];
  const lightIpFoldRiverEvents = [];
  const missedIpValueRaiseEvents = [];

  let ipHeadsUpFlopSpots = 0;
  let ipHeadsUpTurnSpots = 0;
  let ipHeadsUpRiverSpots = 0;
  let ipCbetOpportunities = 0;
  let ipStabOpportunities = 0;
  let ipFacingFlopBetSpots = 0;
  let ipFacingTurnBetSpots = 0;
  let ipFacingRiverBetSpots = 0;
  let ipStrongMadeFacingTurnRiverBetSpots = 0;
  let unknownCardsSpots = 0;

  for (const hand of list) {
    const heroName = String(hand?.heroName || "").trim();
    if (!heroName) continue;
    const heroCards = Array.isArray(hand?.heroCards) ? hand.heroCards : [];
    const handCode = normalizeHeroHandCode(heroCards) || "Unknown";
    if (heroCards.length < 2) {
      unknownCardsSpots += 1;
      continue;
    }

    const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
      ? hand.actionsByStreet.preflop
      : [];
    const flopActions = Array.isArray(hand?.actionsByStreet?.flop)
      ? hand.actionsByStreet.flop
      : [];
    if (flopActions.length === 0) continue;

    const flopDecisionActions = flopActions.filter(isPostflopDecisionAction);
    if (flopDecisionActions.length === 0) continue;

    const playersOnFlop = uniquePlayersForStreet(flopDecisionActions);
    if (playersOnFlop.size !== 2 || !playersOnFlop.has(heroName)) continue;

    const firstDecisionIndex = flopActions.findIndex(isPostflopDecisionAction);
    if (firstDecisionIndex < 0) continue;
    const firstDecision = flopActions[firstDecisionIndex];
    const firstDecisionPlayer = String(firstDecision?.player || "").trim();
    if (!firstDecisionPlayer || firstDecisionPlayer === heroName) continue;

    const heroFirstDecision = flopActions.find(
      (action, idx) =>
        idx > firstDecisionIndex &&
        String(action?.player || "").trim() === heroName &&
        isPostflopDecisionAction(action),
    );
    if (!heroFirstDecision) continue;

    ipHeadsUpFlopSpots += 1;
    const firstDecisionType = normalizeActionType(firstDecision);
    const heroDecisionType = normalizeActionType(heroFirstDecision);
    const position =
      normalizePositionForRanges(hand?.heroPosition) || "Unknown";
    const flopCards = Array.isArray(hand?.board?.flop)
      ? hand.board.flop.filter(Boolean)
      : [];
    const favorableFlop = isFavorableFlopBoard(flopCards);
    const lastPreflopAggressor = findLastPreflopAggressor(
      preflopActions,
      heroName,
    );
    const isCbetSpot = lastPreflopAggressor === "hero";
    const isStabSpot = lastPreflopAggressor === "villain";

    if (firstDecisionType === "check") {
      if (isCbetSpot) {
        ipCbetOpportunities += 1;
        if (heroDecisionType === "check" && favorableFlop) {
          missedIpCbetFavorableEvents.push({
            type: "missed_ip_cbet_favorable",
            handKey: handKey(hand),
            handId: hand?.handId || "Unknown",
            playedAt: hand?.playedAt || "Unknown",
            position,
            handCode,
            actualAction: heroDecisionType,
            recommendation: "Bet flop in position more often",
          });
        }
      } else if (isStabSpot) {
        ipStabOpportunities += 1;
        if (heroDecisionType === "check" && favorableFlop) {
          missedIpStabFavorableEvents.push({
            type: "missed_ip_stab_favorable",
            handKey: handKey(hand),
            handId: hand?.handId || "Unknown",
            playedAt: hand?.playedAt || "Unknown",
            position,
            handCode,
            actualAction: heroDecisionType,
            recommendation: "Take delayed/stab aggression in position",
          });
        }
      }
    }

    if (isPostflopAggressiveAction(firstDecision)) {
      ipFacingFlopBetSpots += 1;
      const hasPairOrBetter = hasHeroPairOrBetter(heroCards, flopCards);
      const hasStrongDraw = hasStrongFlopDraw(heroCards, flopCards);
      if (heroDecisionType === "fold" && (hasPairOrBetter || hasStrongDraw)) {
        lightIpFoldFlopEvents.push({
          type: "light_ip_fold_flop",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: heroDecisionType,
          recommendation: "Continue more often with pair/draw in position",
        });
      }
    }

    for (const street of ["turn", "river"]) {
      const streetActions = Array.isArray(hand?.actionsByStreet?.[street])
        ? hand.actionsByStreet[street]
        : [];
      if (streetActions.length === 0) continue;

      const streetDecisionActions = streetActions.filter(
        isPostflopDecisionAction,
      );
      if (streetDecisionActions.length === 0) continue;

      const playersOnStreet = uniquePlayersForStreet(streetDecisionActions);
      if (playersOnStreet.size !== 2 || !playersOnStreet.has(heroName))
        continue;

      const streetFirstDecisionIndex = streetActions.findIndex(
        isPostflopDecisionAction,
      );
      if (streetFirstDecisionIndex < 0) continue;
      const streetFirstDecision = streetActions[streetFirstDecisionIndex];
      const streetFirstPlayer = String(
        streetFirstDecision?.player || "",
      ).trim();
      if (!streetFirstPlayer || streetFirstPlayer === heroName) continue;

      const heroStreetDecision = streetActions.find(
        (action, idx) =>
          idx > streetFirstDecisionIndex &&
          String(action?.player || "").trim() === heroName &&
          isPostflopDecisionAction(action),
      );
      if (!heroStreetDecision) continue;

      if (street === "turn") ipHeadsUpTurnSpots += 1;
      if (street === "river") ipHeadsUpRiverSpots += 1;

      if (!isPostflopAggressiveAction(streetFirstDecision)) continue;

      if (street === "turn") ipFacingTurnBetSpots += 1;
      if (street === "river") ipFacingRiverBetSpots += 1;

      const heroStreetDecisionType = normalizeActionType(heroStreetDecision);
      const boardToStreet = getBoardCardsToStreet(hand?.board, street);
      const hasPairOrBetter = hasHeroPairOrBetter(heroCards, boardToStreet);
      const hasStrongDraw =
        street === "turn" ? hasStrongFlopDraw(heroCards, boardToStreet) : false;
      const strongMadeHand = hasStrongMadeHand(heroCards, boardToStreet);

      if (
        street === "turn" &&
        heroStreetDecisionType === "fold" &&
        (hasPairOrBetter || hasStrongDraw)
      ) {
        lightIpFoldTurnEvents.push({
          type: "light_ip_fold_turn",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: heroStreetDecisionType,
          recommendation:
            "Defend turn bets in position more often with pair/draw equity",
        });
      }

      if (
        street === "river" &&
        heroStreetDecisionType === "fold" &&
        strongMadeHand
      ) {
        lightIpFoldRiverEvents.push({
          type: "light_ip_fold_river",
          handKey: handKey(hand),
          handId: hand?.handId || "Unknown",
          playedAt: hand?.playedAt || "Unknown",
          position,
          handCode,
          actualAction: heroStreetDecisionType,
          recommendation:
            "Recheck river folds with strong made hands in position",
        });
      }

      if (strongMadeHand) {
        ipStrongMadeFacingTurnRiverBetSpots += 1;
        if (heroStreetDecisionType === "call") {
          missedIpValueRaiseEvents.push({
            type: `missed_ip_value_raise_${street}`,
            handKey: handKey(hand),
            handId: hand?.handId || "Unknown",
            playedAt: hand?.playedAt || "Unknown",
            position,
            handCode,
            actualAction: heroStreetDecisionType,
            recommendation: `Consider value-raise on ${street} versus bet with strong made hands`,
          });
        }
      }
    }
  }

  const missedIpCbetFavorable = summarizeAuditEvents(
    missedIpCbetFavorableEvents,
  );
  const missedIpStabFavorable = summarizeAuditEvents(
    missedIpStabFavorableEvents,
  );
  const lightIpFoldFlop = summarizeAuditEvents(lightIpFoldFlopEvents);
  const lightIpFoldTurn = summarizeAuditEvents(lightIpFoldTurnEvents);
  const lightIpFoldRiver = summarizeAuditEvents(lightIpFoldRiverEvents);
  const missedIpValueRaise = summarizeAuditEvents(missedIpValueRaiseEvents);

  const quickFixes = [];
  const topCbetPos = missedIpCbetFavorable.byPosition[0];
  const topStabPos = missedIpStabFavorable.byPosition[0];
  const topFlopFoldPos = lightIpFoldFlop.byPosition[0];
  const topTurnFoldPos = lightIpFoldTurn.byPosition[0];
  const topRiverFoldPos = lightIpFoldRiver.byPosition[0];
  const topValueRaisePos = missedIpValueRaise.byPosition[0];
  if (topCbetPos) {
    quickFixes.push(
      `Increase flop c-bet frequency in position from ${topCbetPos.position}; favorable boards are getting checked too often.`,
    );
  }
  if (topStabPos) {
    quickFixes.push(
      `Stab more in-position after villain checks from ${topStabPos.position}; passivity is giving up EV.`,
    );
  }
  if (topFlopFoldPos) {
    quickFixes.push(
      `Defend flop bets in position more often from ${topFlopFoldPos.position} when holding pair/draw equity.`,
    );
  }
  if (topTurnFoldPos) {
    quickFixes.push(
      `Defend turn bets in position more often from ${topTurnFoldPos.position} when your hand retains equity.`,
    );
  }
  if (topRiverFoldPos) {
    quickFixes.push(
      `Review river folds in position from ${topRiverFoldPos.position}; strong made hands may be overfolding.`,
    );
  }
  if (topValueRaisePos) {
    quickFixes.push(
      `Add more value-raises in position from ${topValueRaisePos.position} when strong made hands face turn/river bets.`,
    );
  }
  if (quickFixes.length === 0) {
    quickFixes.push(
      "No dominant postflop in-position leak found in this MVP heads-up sample.",
    );
  }

  return {
    scope: "heads_up_flop_turn_river_only",
    ipHeadsUpFlopSpots,
    ipHeadsUpTurnSpots,
    ipHeadsUpRiverSpots,
    ipCbetOpportunities,
    ipStabOpportunities,
    ipFacingFlopBetSpots,
    ipFacingTurnBetSpots,
    ipFacingRiverBetSpots,
    ipStrongMadeFacingTurnRiverBetSpots,
    unknownCardsSpots,
    missedIpCbetFavorable: {
      count: missedIpCbetFavorableEvents.length,
      ...missedIpCbetFavorable,
    },
    missedIpStabFavorable: {
      count: missedIpStabFavorableEvents.length,
      ...missedIpStabFavorable,
    },
    lightIpFoldFlop: {
      count: lightIpFoldFlopEvents.length,
      ...lightIpFoldFlop,
    },
    lightIpFoldTurn: {
      count: lightIpFoldTurnEvents.length,
      ...lightIpFoldTurn,
    },
    lightIpFoldRiver: {
      count: lightIpFoldRiverEvents.length,
      ...lightIpFoldRiver,
    },
    missedIpValueRaise: {
      count: missedIpValueRaiseEvents.length,
      ...missedIpValueRaise,
    },
    quickFixes,
  };
}

function hasAuditReference(event) {
  const key = String(event?.handKey || event?.sampleHandKey || "").trim();
  if (key) return true;
  const handId = String(event?.handId || event?.sampleHandId || "").trim();
  const playedAt = String(
    event?.playedAt || event?.samplePlayedAt || "",
  ).trim();
  return Boolean(handId || playedAt);
}

function getErrorCode(error) {
  if (!error) return "";
  const direct = String(error?.code || "").trim();
  if (direct) return direct;
  const payloadCode = String(error?.payload?.code || "").trim();
  if (payloadCode) return payloadCode;
  return "";
}

function isUpgradeRequiredError(error) {
  const code = getErrorCode(error);
  return (
    code === "AI_TRIAL_TOKENS_EXHAUSTED" ||
    code === "AI_TRIAL_TOKENS_INSUFFICIENT" ||
    code === "AI_MONTHLY_TOKEN_LIMIT_REACHED"
  );
}

function publishTrialTokenUpdate(remainingTokens) {
  if (typeof window === "undefined") return;
  const numeric = Number(remainingTokens);
  if (!Number.isFinite(numeric) || numeric < 0) return;
  window.dispatchEvent(
    new CustomEvent("pcc:trial-tokens-updated", {
      detail: { remainingTokens: numeric },
    }),
  );
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
  const [loadingBlindDefenseReview, setLoadingBlindDefenseReview] = useState(false);
  const [loadingIcmReview, setLoadingIcmReview] = useState(false);
  const [loadingTableHintReview, setLoadingTableHintReview] = useState(false);
  const [loadingTournamentSave, setLoadingTournamentSave] = useState(false);
  const [error, setError] = useState("");
  const [summaryReviewError, setSummaryReviewError] = useState("");
  const [blindDefenseReviewError, setBlindDefenseReviewError] = useState("");
  const [icmReviewError, setIcmReviewError] = useState("");
  const [tableHintReviewError, setTableHintReviewError] = useState("");
  const [saveTournamentError, setSaveTournamentError] = useState("");
  const [saveTournamentSuccess, setSaveTournamentSuccess] = useState("");
  const [pendingTournamentSave, setPendingTournamentSave] = useState(null);
  const [savedTournamentModalOpen, setSavedTournamentModalOpen] =
    useState(false);
  const [loadingSavedTournaments, setLoadingSavedTournaments] = useState(false);
  const [savedTournaments, setSavedTournaments] = useState([]);
  const [savedTournamentError, setSavedTournamentError] = useState("");
  const [billingStatus, setBillingStatus] = useState(null);
  const [billingStatusError, setBillingStatusError] = useState("");
  const [loadingBillingStatus, setLoadingBillingStatus] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState("");
  const [billingActionError, setBillingActionError] = useState("");
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [aiAccessErrorCode, setAiAccessErrorCode] = useState("");
  const [selectedSavedTournamentId, setSelectedSavedTournamentId] =
    useState("");
  const [loadingSavedTournamentId, setLoadingSavedTournamentId] = useState("");
  const [deletingSavedTournamentId, setDeletingSavedTournamentId] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [reviewsByHandKey, setReviewsByHandKey] = useState({});
  const [expandedReviewLogicKeys, setExpandedReviewLogicKeys] = useState(
    () => new Set(),
  );
  const [summaryReview, setSummaryReview] = useState(null);
  const [blindDefenseReview, setBlindDefenseReview] = useState(null);
  const [icmReview, setIcmReview] = useState(null);
  const [tableHintReview, setTableHintReview] = useState(null);
  const [selectedHandKeys, setSelectedHandKeys] = useState(() => new Set());
  const [selectedAuditHandKey, setSelectedAuditHandKey] = useState("");
  const [pendingAuditScrollKey, setPendingAuditScrollKey] = useState("");
  const [insightsTab, setInsightsTab] = useState("tournament");
  const [opponentFilter, setOpponentFilter] = useState("current_table");
  const [copiedOpponentKey, setCopiedOpponentKey] = useState("");
  const [isParserCollapsed, setIsParserCollapsed] = useState(false);
  const copyTimeoutRef = useRef(null);
  const handRowRefs = useRef(new Map());

  const canSubmit = historyText.trim().length > 0;
  const hasActiveSubscription = Boolean(
    billingStatus?.subscription?.status &&
      String(billingStatus.subscription.status).toLowerCase() === "active",
  );
  const trialRemainingTokens = Number(
    billingStatus?.trial?.remainingTokens || 0,
  );
  const aiUpgradePromptMessage = useMemo(() => {
    if (aiAccessErrorCode === "AI_MONTHLY_TOKEN_LIMIT_REACHED") {
      return hasActiveSubscription
        ? "Your monthly AI token limit is reached. Manage your plan to continue."
        : "Your current AI limit is reached. Upgrade to continue AI reviews.";
    }
    if (aiAccessErrorCode === "AI_TRIAL_TOKENS_INSUFFICIENT") {
      return "This request is larger than your remaining trial credits. Upgrade to continue.";
    }
    if (aiAccessErrorCode === "AI_TRIAL_TOKENS_EXHAUSTED") {
      return "Your free AI trial credits are used. Upgrade to continue AI reviews.";
    }
    return "AI access is limited for this account. Upgrade or manage your plan to continue.";
  }, [aiAccessErrorCode, hasActiveSubscription]);

  const loadBillingStatus = async () => {
    setLoadingBillingStatus(true);
    setBillingStatusError("");
    try {
      const status = await requestBillingStatus();
      setBillingStatus(status || null);
    } catch (error) {
      setBillingStatusError(
        error?.message || "Failed to load billing subscription status.",
      );
    } finally {
      setLoadingBillingStatus(false);
    }
  };

  useEffect(() => {
    loadBillingStatus();
  }, []);

  const openUpgradeCheckout = async () => {
    if (billingActionLoading) return;
    setBillingActionError("");
    setBillingActionLoading("checkout");
    try {
      const session = await requestBillingCheckoutSession({});
      const url = String(session?.url || "").trim();
      if (!url) {
        throw new Error("Checkout URL was not returned by the server.");
      }
      window.location.assign(url);
    } catch (error) {
      setBillingActionError(error?.message || "Failed to start checkout.");
    } finally {
      setBillingActionLoading("");
    }
  };

  const openBillingPortal = async () => {
    if (billingActionLoading) return;
    setBillingActionError("");
    setBillingActionLoading("portal");
    try {
      const session = await requestBillingPortalSession({});
      const url = String(session?.url || "").trim();
      if (!url) {
        throw new Error("Portal URL was not returned by the server.");
      }
      window.location.assign(url);
    } catch (error) {
      setBillingActionError(
        error?.message || "Failed to open billing subscription portal.",
      );
    } finally {
      setBillingActionLoading("");
    }
  };

  const parsedHands = Array.isArray(parseResult?.hands)
    ? parseResult.hands
    : [];
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
          .filter(Boolean),
      ),
    [currentTableGuessPlayers],
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
  const latestParsedHand = useMemo(() => {
    return parsedHands.reduce((best, hand) => {
      if (!best) return hand;
      const bestEpoch = Number(getHandPlayedAtEpoch(best)) || 0;
      const handEpoch = Number(getHandPlayedAtEpoch(hand)) || 0;
      return handEpoch > bestEpoch ? hand : best;
    }, null);
  }, [parsedHands]);
  const currentHeroSeatLabel = useMemo(() => {
    if (!latestParsedHand) return "Seat unknown";
    return formatSeatNumber(latestParsedHand?.heroSeat);
  }, [latestParsedHand]);
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
    selectedHandKeys.has(handKey(hand)),
  );
  const detectedTournamentIds = useMemo(() => {
    const ids = new Set();
    for (const hand of parsedHands) {
      const id = String(hand?.tournamentId || "").trim();
      if (id) ids.add(id);
    }
    return Array.from(ids).sort();
  }, [parsedHands]);
  const inferredTournamentId =
    detectedTournamentIds.length === 1 ? detectedTournamentIds[0] : "";
  const parsedTournamentPlayedAtEpoch = useMemo(() => {
    const epochs = parsedHands
      .map((hand) => Number(getHandPlayedAtEpoch(hand)))
      .filter((value) => Number.isFinite(value));
    if (!epochs.length) return null;
    return Math.min(...epochs);
  }, [parsedHands]);
  const fileMeta = useMemo(
    () => parseTournamentMetaFromFileName(sourceFileName),
    [sourceFileName],
  );
  const suggestedTournamentMeta = useMemo(() => {
    const tournamentId = inferredTournamentId || fileMeta.tournamentId || "";
    const tournamentName =
      fileMeta.tournamentName ||
      (sourceFileName ? stripFileExtension(sourceFileName) : "") ||
      (tournamentId ? `Tournament ${tournamentId}` : "Tournament upload");
    const playedAtEpoch = Number.isFinite(Number(fileMeta.playedAtEpoch))
      ? Number(fileMeta.playedAtEpoch)
      : parsedTournamentPlayedAtEpoch;
    return {
      tournamentId,
      tournamentName,
      playedAtEpoch: Number.isFinite(Number(playedAtEpoch))
        ? Number(playedAtEpoch)
        : null,
    };
  }, [
    fileMeta.playedAtEpoch,
    fileMeta.tournamentId,
    fileMeta.tournamentName,
    inferredTournamentId,
    parsedTournamentPlayedAtEpoch,
    sourceFileName,
  ]);
  const selectedCount = selectedHands.length;
  const reviewedCount = parsedHands.reduce(
    (count, hand) => (reviewsByHandKey[handKey(hand)] ? count + 1 : count),
    0,
  );
  const tournamentSummary = useMemo(() => {
    if (!parseResult?.summary) return null;
    const totalHands =
      Number(parseResult.summary.totalHands) || parsedHands.length || 0;
    const summaryPreflopFolds = Number(
      parseResult.summary.heroFoldedPreflopCount,
    );
    const summaryEnteredPreflop = Number(
      parseResult.summary.heroEnteredPreflopCount,
    );
    const preflopFolds =
      Number.isFinite(summaryPreflopFolds) && summaryPreflopFolds >= 0
        ? summaryPreflopFolds
        : parsedHands.filter(
            (hand) =>
              String(hand?.heroOutcome?.code || "") === "folded_preflop",
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
              isPreflopAggressiveAction(action),
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
              isPreflopAggressiveAction(action),
          );
          if (oppRaiseAfterCallIndex >= 0) {
            callThenFacedRaiseSpots += 1;
            const foldedAfterRaise = preflopActions.some(
              (action, idx) =>
                idx > oppRaiseAfterCallIndex &&
                String(action?.player || "").trim() === heroNameForHand &&
                normalizeActionType(action) === "fold",
            );
            if (foldedAfterRaise) callThenFoldedToRaise += 1;
          }
        }
      }

      const heroAggressiveIndex = preflopActions.findIndex(
        (action) =>
          String(action?.player || "").trim() === heroNameForHand &&
          isPreflopAggressiveAction(action),
      );
      if (heroAggressiveIndex >= 0) {
        const oppReraiseIndex = preflopActions.findIndex(
          (action, idx) =>
            idx > heroAggressiveIndex &&
            String(action?.player || "").trim() !== heroNameForHand &&
            isPreflopAggressiveAction(action),
        );
        if (oppReraiseIndex >= 0) {
          facedReraiseAfterAggressionSpots += 1;
          const heroFoldedAfterReraise = preflopActions.some(
            (action, idx) =>
              idx > oppReraiseIndex &&
              String(action?.player || "").trim() === heroNameForHand &&
              normalizeActionType(action) === "fold",
          );
          if (heroFoldedAfterReraise) foldedAfterFacingReraise += 1;
        }
      }
    }

    const showdownSamples = wonShowdown + lostShowdown;
    const enteredPct = safePercent(enteredHands, totalHands);
    const preflopFoldPct = safePercent(preflopFolds, totalHands);
    const noShowdownWinPct = safePercent(wonNoShowdown, enteredHands);
    const postflopNoShowdownPct = safePercent(
      wonNoShowdownPostflop,
      enteredHands,
    );
    const showdownWinPct = safePercent(wonShowdown, showdownSamples);
    const lateStreetFoldPct = safePercent(
      foldedTurn + foldedRiver,
      foldedFlop + foldedTurn + foldedRiver,
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
    preflopFoldWarnThreshold = Math.max(
      72,
      Math.min(84, preflopFoldWarnThreshold),
    );

    const flags = [];
    if (totalHands >= 40 && preflopFoldPct > preflopFoldWarnThreshold) {
      flags.push({
        level: "watch",
        text: `Preflop fold rate is high for this sample/context (${percentLabel(
          preflopFoldPct,
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
    if (foldedFlop + foldedTurn + foldedRiver >= 8 && lateStreetFoldPct >= 65) {
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
    [parsedHands],
  );
  const blindDefenseAudit = useMemo(
    () => buildBlindDefenseAudit(parsedHands),
    [parsedHands],
  );
  const icmSpotAudit = useMemo(
    () =>
      buildIcmSpotAudit(parsedHands, {
        recentLimit: 40,
        levelThreshold: 25,
      }),
    [parsedHands],
  );
  const postflopInPositionAudit = useMemo(
    () => buildPostflopInPositionAudit(parsedHands),
    [parsedHands],
  );
  const postflopIpAuditDigest = useMemo(() => {
    const audit = postflopInPositionAudit || {};
    return {
      scope: String(audit?.scope || "unknown"),
      spots: {
        headsUpFlop: Number(audit?.ipHeadsUpFlopSpots) || 0,
        headsUpTurn: Number(audit?.ipHeadsUpTurnSpots) || 0,
        headsUpRiver: Number(audit?.ipHeadsUpRiverSpots) || 0,
      },
      findings: {
        missedIpCbetFavorable: {
          count: Number(audit?.missedIpCbetFavorable?.count) || 0,
          opportunities: Number(audit?.ipCbetOpportunities) || 0,
          ratePct: safePercent(
            Number(audit?.missedIpCbetFavorable?.count) || 0,
            Number(audit?.ipCbetOpportunities) || 0,
          ),
        },
        missedIpStabFavorable: {
          count: Number(audit?.missedIpStabFavorable?.count) || 0,
          opportunities: Number(audit?.ipStabOpportunities) || 0,
          ratePct: safePercent(
            Number(audit?.missedIpStabFavorable?.count) || 0,
            Number(audit?.ipStabOpportunities) || 0,
          ),
        },
        lightIpFoldFlop: {
          count: Number(audit?.lightIpFoldFlop?.count) || 0,
          opportunities: Number(audit?.ipFacingFlopBetSpots) || 0,
          ratePct: safePercent(
            Number(audit?.lightIpFoldFlop?.count) || 0,
            Number(audit?.ipFacingFlopBetSpots) || 0,
          ),
        },
        lightIpFoldTurn: {
          count: Number(audit?.lightIpFoldTurn?.count) || 0,
          opportunities: Number(audit?.ipFacingTurnBetSpots) || 0,
          ratePct: safePercent(
            Number(audit?.lightIpFoldTurn?.count) || 0,
            Number(audit?.ipFacingTurnBetSpots) || 0,
          ),
        },
        lightIpFoldRiver: {
          count: Number(audit?.lightIpFoldRiver?.count) || 0,
          opportunities: Number(audit?.ipFacingRiverBetSpots) || 0,
          ratePct: safePercent(
            Number(audit?.lightIpFoldRiver?.count) || 0,
            Number(audit?.ipFacingRiverBetSpots) || 0,
          ),
        },
        missedIpValueRaise: {
          count: Number(audit?.missedIpValueRaise?.count) || 0,
          opportunities:
            Number(audit?.ipStrongMadeFacingTurnRiverBetSpots) || 0,
          ratePct: safePercent(
            Number(audit?.missedIpValueRaise?.count) || 0,
            Number(audit?.ipStrongMadeFacingTurnRiverBetSpots) || 0,
          ),
        },
      },
      quickFixes: Array.isArray(audit?.quickFixes)
        ? audit.quickFixes.filter(Boolean).slice(0, 3)
        : [],
    };
  }, [postflopInPositionAudit]);
  const postflopIpHighlights = useMemo(() => {
    const f = postflopIpAuditDigest?.findings || {};
    const candidates = [
      {
        label: "Missed IP c-bet (favorable flop)",
        count: Number(f?.missedIpCbetFavorable?.count) || 0,
        opportunities: Number(f?.missedIpCbetFavorable?.opportunities) || 0,
      },
      {
        label: "Missed IP stab (favorable flop)",
        count: Number(f?.missedIpStabFavorable?.count) || 0,
        opportunities: Number(f?.missedIpStabFavorable?.opportunities) || 0,
      },
      {
        label: "Likely light IP flop folds",
        count: Number(f?.lightIpFoldFlop?.count) || 0,
        opportunities: Number(f?.lightIpFoldFlop?.opportunities) || 0,
      },
      {
        label: "Likely light IP turn folds",
        count: Number(f?.lightIpFoldTurn?.count) || 0,
        opportunities: Number(f?.lightIpFoldTurn?.opportunities) || 0,
      },
      {
        label: "Likely light IP river folds",
        count: Number(f?.lightIpFoldRiver?.count) || 0,
        opportunities: Number(f?.lightIpFoldRiver?.opportunities) || 0,
      },
      {
        label: "Missed IP value-raises",
        count: Number(f?.missedIpValueRaise?.count) || 0,
        opportunities: Number(f?.missedIpValueRaise?.opportunities) || 0,
      },
    ]
      .filter((row) => row.count > 0 && row.opportunities > 0)
      .sort(
        (a, b) =>
          safePercent(b.count, b.opportunities) -
            safePercent(a.count, a.opportunities) || b.count - a.count,
      )
      .slice(0, 3);

    return candidates.map(
      (row) => `${row.label}: ${rateCountLabel(row.count, row.opportunities)}.`,
    );
  }, [postflopIpAuditDigest]);
  const aiSummaryActions = useMemo(
    () => normalizeInsightLines(summaryReview?.actions, 6),
    [summaryReview],
  );
  const aiSummaryWarnings = useMemo(
    () => normalizeInsightLines(summaryReview?.warnings, 6),
    [summaryReview],
  );
  const aiBlindDefenseActions = useMemo(
    () => normalizeInsightLines(blindDefenseReview?.actions, 6),
    [blindDefenseReview],
  );
  const aiBlindDefenseWarnings = useMemo(
    () => normalizeInsightLines(blindDefenseReview?.warnings, 6),
    [blindDefenseReview],
  );
  const aiIcmActions = useMemo(
    () => normalizeInsightLines(icmReview?.actions, 6),
    [icmReview],
  );
  const aiIcmWarnings = useMemo(
    () => normalizeInsightLines(icmReview?.warnings, 6),
    [icmReview],
  );
  const aiTableHintExploits = useMemo(
    () => normalizeInsightLines(tableHintReview?.priority_exploits, 6),
    [tableHintReview],
  );
  const aiTableHintAdjustments = useMemo(
    () => normalizeInsightLines(tableHintReview?.next_hour_adjustments, 7),
    [tableHintReview],
  );
  const aiTableHintWarnings = useMemo(
    () =>
      normalizeInsightLines(
        [...(tableHintReview?.avoid_traps || []), ...(tableHintReview?.sample_warnings || [])],
        7,
      ),
    [tableHintReview],
  );
  const tournamentCoachSummary = useMemo(
    () => buildTournamentCoachSummary(tournamentSummary, postflopIpAuditDigest),
    [tournamentSummary, postflopIpAuditDigest],
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
      postflopIpAudit: postflopIpAuditDigest,
      tournamentRating: tournamentCoachSummary?.rating || null,
      topStatuses: tournamentSummary.topStatuses,
    };
  }, [tournamentSummary, postflopIpAuditDigest, tournamentCoachSummary]);
  const icmReviewPayload = useMemo(() => {
    if (!icmSpotAudit || Number(icmSpotAudit?.lateLevelHands) <= 0) return null;
    return {
      ...icmSpotAudit,
      flagged: {
        count: Number(icmSpotAudit?.flagged?.count) || 0,
        byPosition: Array.isArray(icmSpotAudit?.flagged?.byPosition)
          ? icmSpotAudit.flagged.byPosition
          : [],
        topCombos: Array.isArray(icmSpotAudit?.flagged?.topCombos)
          ? icmSpotAudit.flagged.topCombos
          : [],
        examples: Array.isArray(icmSpotAudit?.flagged?.examples)
          ? icmSpotAudit.flagged.examples
          : [],
      },
    };
  }, [icmSpotAudit]);
  const blindDefenseReviewPayload = useMemo(() => {
    if (!blindDefenseAudit || Number(blindDefenseAudit.totalBlindDefenseSpots) <= 0) {
      return null;
    }
    return {
      ...blindDefenseAudit,
      handClassRows: Array.isArray(blindDefenseAudit.handClassRows)
        ? blindDefenseAudit.handClassRows
        : [],
      missedContinues: {
        count: Number(blindDefenseAudit?.missedContinues?.count) || 0,
        byPosition: Array.isArray(blindDefenseAudit?.missedContinues?.byPosition)
          ? blindDefenseAudit.missedContinues.byPosition
          : [],
        topCombos: Array.isArray(blindDefenseAudit?.missedContinues?.topCombos)
          ? blindDefenseAudit.missedContinues.topCombos
          : [],
        examples: Array.isArray(blindDefenseAudit?.missedContinues?.examples)
          ? blindDefenseAudit.missedContinues.examples
          : [],
      },
      missedSb3BetPressure: {
        count: Number(blindDefenseAudit?.missedSb3BetPressure?.count) || 0,
        topCombos: Array.isArray(blindDefenseAudit?.missedSb3BetPressure?.topCombos)
          ? blindDefenseAudit.missedSb3BetPressure.topCombos
          : [],
        examples: Array.isArray(blindDefenseAudit?.missedSb3BetPressure?.examples)
          ? blindDefenseAudit.missedSb3BetPressure.examples
          : [],
      },
      blindFolds: {
        count: Number(blindDefenseAudit?.blindFolds?.count) || 0,
        shouldDefendCount: Number(blindDefenseAudit?.blindFolds?.shouldDefendCount) || 0,
      },
    };
  }, [blindDefenseAudit]);
  const hasCurrentTableSelection =
    opponentFilter === "current_table" && visibleOpponentPlayers.length > 0;
  const recentCurrentTableHands = useMemo(() => {
    if (!hasCurrentTableSelection || currentTablePlayerSet.size === 0) return [];
    return [...parsedHands]
      .filter((hand) => {
        const seats = Array.isArray(hand?.seats) ? hand.seats : [];
        return seats.some((seat) => {
          const player = String(seat?.player || "").trim();
          return player && currentTablePlayerSet.has(player);
        });
      })
      .sort(
        (a, b) => (Number(getHandPlayedAtEpoch(b)) || 0) - (Number(getHandPlayedAtEpoch(a)) || 0),
      )
      .slice(0, 40)
      .map((hand) => {
        const tableId = String(hand?.table?.id || "").trim() || null;
        const seatCount = Array.isArray(hand?.seats) ? hand.seats.length : 0;
        const opponentsInHand = (Array.isArray(hand?.seats) ? hand.seats : [])
          .map((seat) => String(seat?.player || "").trim())
          .filter(
            (player) =>
              player &&
              player !== String(hand?.heroName || "").trim() &&
              currentTablePlayerSet.has(player),
          );
        return {
          handId: String(hand?.handId || "").trim() || null,
          playedAt: String(hand?.playedAt || "").trim() || null,
          tableId,
          seatCount,
          heroPosition: String(hand?.heroPosition || "").trim() || null,
          heroOutcome: {
            code: String(hand?.heroOutcome?.code || "").trim() || null,
            label: String(hand?.heroOutcome?.label || "").trim() || null,
          },
          opponentsInHand,
        };
      });
  }, [
    hasCurrentTableSelection,
    currentTablePlayerSet,
    parsedHands,
  ]);
  const tableHintPayload = useMemo(() => {
    if (!hasCurrentTableSelection) return null;
    const tablePlayers = visibleOpponentPlayers.map((player) => {
      const playerId = String(player?.player || "").trim() || null;
      const seatLabelRaw = formatLatestSeat(player?.latestSeat);
      const seatLabel =
        seatLabelRaw && seatLabelRaw !== "Seat unknown" ? seatLabelRaw : null;
      return {
        player: playerId,
        seatLabel,
        handsSeen: Number(player?.handsSeen) || 0,
        latestSeat: player?.latestSeat || null,
        latestStack: Number.isFinite(Number(player?.latestStack))
          ? Number(player.latestStack)
          : null,
        enteredPot: player?.enteredPot || null,
        foldedPreflop: player?.foldedPreflop || null,
        preflopRaise: player?.preflopRaise || null,
        foldToPreflopRaise: player?.foldToPreflopRaise || null,
        postflopAggression: player?.postflopAggression || null,
        tags: Array.isArray(player?.tags)
          ? player.tags
              .map((tag) => String(tag?.label || tag?.code || "").trim())
              .filter(Boolean)
          : [],
        playNote: player?.playNote || null,
        lastSeenAt: String(player?.lastSeenAt || "").trim() || null,
      };
    });

    return {
      tableContext: {
        tableId: String(currentTableGuess?.tableId || "").trim() || null,
        maxPlayers: Number.isFinite(Number(currentTableGuess?.maxPlayers))
          ? Number(currentTableGuess.maxPlayers)
          : null,
        playedAt: String(currentTableGuess?.playedAt || "").trim() || null,
        activeOpponents: tablePlayers.length,
        players: Array.isArray(currentTableGuess?.players)
          ? currentTableGuess.players
          : [],
        recentHands: recentCurrentTableHands,
      },
      opponents: tablePlayers,
      sessionSummary: tournamentSummaryPayload || undefined,
    };
  }, [
    hasCurrentTableSelection,
    visibleOpponentPlayers,
    currentTableGuess,
    recentCurrentTableHands,
    tournamentSummaryPayload,
  ]);

  const parsePayload = useMemo(
    () => ({
      historyText,
      heroName: heroName.trim() || "Hero",
      includeOnlyHeroDidNotFoldPreflop:
        preflopHandSet === "exclude_preflop_folds",
      sort: sortOrder,
      limit: Math.max(1, Math.min(500, Number(handLimit) || 200)),
    }),
    [historyText, heroName, sortOrder, handLimit, preflopHandSet],
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
    if (opponentFilter === "current_table" && visibleOpponentPlayers.length > 0) {
      return;
    }
    if (tableHintReview || tableHintReviewError) {
      setTableHintReview(null);
      setTableHintReviewError("");
    }
  }, [
    opponentFilter,
    visibleOpponentPlayers.length,
    tableHintReview,
    tableHintReviewError,
  ]);

  useEffect(() => {
    if (Number(icmSpotAudit?.lateLevelHands) > 0) return;
    if (icmReview || icmReviewError) {
      setIcmReview(null);
      setIcmReviewError("");
    }
  }, [icmSpotAudit?.lateLevelHands, icmReview, icmReviewError]);

  useEffect(() => {
    if (Number(blindDefenseAudit?.totalBlindDefenseSpots) > 0) return;
    if (blindDefenseReview || blindDefenseReviewError) {
      setBlindDefenseReview(null);
      setBlindDefenseReviewError("");
    }
  }, [
    blindDefenseAudit?.totalBlindDefenseSpots,
    blindDefenseReview,
    blindDefenseReviewError,
  ]);

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

  const copyOpponentTendencies = async (
    playerKey,
    tendencyLabels,
    playNoteLine,
  ) => {
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
    const eventHandId = String(
      event?.handId || event?.sampleHandId || "",
    ).trim();
    const eventPlayedAt = String(
      event?.playedAt || event?.samplePlayedAt || "",
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

    const visibleNow = filteredParsedHands.some(
      (hand) => handKey(hand) === key,
    );
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
    setSaveTournamentError("");
    setSaveTournamentSuccess("");
    setParseResult(null);
    setReviewsByHandKey({});
    setExpandedReviewLogicKeys(new Set());
    setSummaryReview(null);
    setSummaryReviewError("");
    setBlindDefenseReview(null);
    setBlindDefenseReviewError("");
    setIcmReview(null);
    setIcmReviewError("");
    setTableHintReview(null);
    setTableHintReviewError("");
    setOutcomeFilter("all");
    setTimeFilter("all_time");
    setSelectedHandKeys(new Set());
    setInsightsTab("tournament");
    setOpponentFilter("current_table");
    setCopiedOpponentKey("");
    setSelectedAuditHandKey("");
    setPendingAuditScrollKey("");
    setQuickReviewHandKey("");
    setPendingTournamentSave(null);
  };

  const runParse = async () => {
    if (!canSubmit) return;
    setError("");
    setSaveTournamentError("");
    setSaveTournamentSuccess("");
    setPendingTournamentSave(null);
    setLoadingParse(true);
    setQuickReviewHandKey("");
    setReviewsByHandKey({});
    setExpandedReviewLogicKeys(new Set());
    setSummaryReview(null);
    setSummaryReviewError("");
    setBlindDefenseReview(null);
    setBlindDefenseReviewError("");
    setIcmReview(null);
    setIcmReviewError("");
    setTableHintReview(null);
    setTableHintReviewError("");
    try {
      const res = await requestHandHistoryParse(parsePayload);
      setParseResult(res);
      if (Array.isArray(res?.hands) && res.hands.length > 0) {
        setIsParserCollapsed(true);
      }
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

  const promptSaveTournament = async () => {
    const trimmedHistory = historyText.trim();
    if (!trimmedHistory) {
      setSaveTournamentError(
        "Paste or load a hand-history file before saving.",
      );
      return;
    }

    const resolvedTournamentId = String(
      suggestedTournamentMeta.tournamentId || "",
    ).trim();
    if (!resolvedTournamentId && detectedTournamentIds.length > 1) {
      setSaveTournamentError(
        "Multiple tournament IDs detected in this upload. Keep one tournament per save.",
      );
      return;
    }
    if (!resolvedTournamentId) {
      setSaveTournamentError(
        "Could not detect a tournament ID. Load a file that includes one.",
      );
      return;
    }

    setSaveTournamentError("");
    setSaveTournamentSuccess("");
    setPendingTournamentSave({
      tournamentId: resolvedTournamentId,
      tournamentName: String(
        suggestedTournamentMeta.tournamentName || "",
      ).trim(),
      playedAtEpoch: suggestedTournamentMeta.playedAtEpoch,
    });
  };

  const saveTournament = async () => {
    if (!pendingTournamentSave) {
      setSaveTournamentError("Open Save Tournament first to confirm details.");
      return;
    }

    setSaveTournamentError("");
    setSaveTournamentSuccess("");
    setLoadingTournamentSave(true);
    try {
      const payload = {
        historyText,
        heroName: heroName.trim() || "Hero",
        tournamentId: pendingTournamentSave.tournamentId,
        tournamentName:
          String(pendingTournamentSave.tournamentName || "").trim() ||
          undefined,
      };

      const res = await requestTournamentUpload(payload);
      const savedId = String(res?.saved?.tournamentId || "").trim();
      if (savedId) {
        setSaveTournamentSuccess(
          `Saved tournament ${savedId}. Future uploads with this ID will overwrite.`,
        );
      } else {
        setSaveTournamentSuccess(
          "Tournament saved. Future uploads with the same ID will overwrite.",
        );
      }
      setPendingTournamentSave(null);
    } catch (err) {
      setSaveTournamentError(err?.message || "Failed to save tournament.");
    } finally {
      setLoadingTournamentSave(false);
    }
  };

  const openSavedTournamentModal = async () => {
    setSavedTournamentModalOpen(true);
    setSavedTournamentError("");
    setSelectedSavedTournamentId("");
    setLoadingSavedTournaments(true);
    try {
      const res = await requestSavedTournaments();
      const tournaments = Array.isArray(res?.tournaments)
        ? res.tournaments
        : [];
      setSavedTournaments(tournaments);
      setSelectedSavedTournamentId("");
    } catch (err) {
      setSavedTournamentError(
        err?.message || "Failed to load saved tournaments.",
      );
      setSavedTournaments([]);
    } finally {
      setLoadingSavedTournaments(false);
    }
  };

  const closeSavedTournamentModal = () => {
    if (loadingSavedTournamentId || deletingSavedTournamentId) return;
    setSavedTournamentModalOpen(false);
    setSavedTournamentError("");
    setSelectedSavedTournamentId("");
  };

  const loadSavedTournament = async (tournamentId) => {
    const id = String(tournamentId || "").trim();
    if (!id) return;
    setSavedTournamentError("");
    setLoadingSavedTournamentId(id);
    try {
      const res = await requestSavedTournament(id);
      const tournament = res?.tournament || {};
      const hands = Array.isArray(tournament.hands) ? tournament.hands : [];
      const opponents =
        tournament.opponents && typeof tournament.opponents === "object"
          ? tournament.opponents
          : null;
      const summary =
        tournament.summary && typeof tournament.summary === "object"
          ? tournament.summary
          : null;

      setParseResult({
        summary: summary || {
          totalHands: hands.length,
          filteredHands: hands.length,
          returnedHands: hands.length,
        },
        hands,
        opponents,
      });

      setHistoryText(String(tournament.historyText || historyText || ""));
      setSourceFileName(
        tournament.tournamentName
          ? `${tournament.tournamentId} - ${tournament.tournamentName}.txt`
          : `${tournament.tournamentId}.txt`,
      );
      setError("");
      setSaveTournamentError("");
      setSaveTournamentSuccess("");
      setSummaryReview(null);
      setSummaryReviewError("");
      setBlindDefenseReview(null);
      setBlindDefenseReviewError("");
      setIcmReview(null);
      setIcmReviewError("");
      setTableHintReview(null);
      setTableHintReviewError("");
      setReviewsByHandKey({});
      setExpandedReviewLogicKeys(new Set());
      setSelectedHandKeys(new Set());
      setOutcomeFilter("all");
      setTimeFilter("all_time");
      setInsightsTab("tournament");
      setOpponentFilter("current_table");
      setCopiedOpponentKey("");
      setSelectedAuditHandKey("");
      setPendingAuditScrollKey("");
      setPendingTournamentSave(null);
      setSavedTournamentModalOpen(false);
    } catch (err) {
      setSavedTournamentError(
        err?.message || "Failed to load saved tournament.",
      );
    } finally {
      setLoadingSavedTournamentId("");
    }
  };

  const loadSelectedSavedTournament = async () => {
    if (!selectedSavedTournamentId || loadingSavedTournamentId) return;
    await loadSavedTournament(selectedSavedTournamentId);
  };

  const deleteSelectedSavedTournament = async () => {
    const id = String(selectedSavedTournamentId || "").trim();
    if (!id || deletingSavedTournamentId || loadingSavedTournamentId) return;

    const confirmed = window.confirm(
      `Delete saved tournament ${id}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSavedTournamentError("");
    setDeletingSavedTournamentId(id);
    try {
      await requestDeleteSavedTournament(id);
      setSavedTournaments((previous) =>
        previous.filter(
          (item) => String(item?.tournamentId || "").trim() !== id,
        ),
      );
      setSelectedSavedTournamentId("");
    } catch (err) {
      setSavedTournamentError(
        err?.message || "Failed to delete saved tournament.",
      );
    } finally {
      setDeletingSavedTournamentId("");
    }
  };

  const runReview = async () => {
    if (quickReviewHandKey) return;
    if (selectedCount === 0) {
      setError("Select at least one parsed hand for review.");
      return;
    }
    setError("");
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setLoadingReview(true);
    try {
      const reviewPayload = {
        selectedHands,
      };
      if (opponentSnapshot && typeof opponentSnapshot === "object") {
        reviewPayload.opponentSnapshot = opponentSnapshot;
      }
      const res = await requestHandHistoryReview(reviewPayload);
      publishTrialTokenUpdate(res?.summary?.monthlyUsage?.trialRemainingTokens);
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
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
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
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setQuickReviewHandKey(singleKey);
    try {
      const reviewPayload = {
        selectedHands: [hand],
      };
      if (opponentSnapshot && typeof opponentSnapshot === "object") {
        reviewPayload.opponentSnapshot = opponentSnapshot;
      }
      const res = await requestHandHistoryReview(reviewPayload);
      publishTrialTokenUpdate(res?.summary?.monthlyUsage?.trialRemainingTokens);
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
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
      setError(err?.message || "Failed to review hand.");
    } finally {
      setQuickReviewHandKey("");
    }
  };

  const runSummaryReview = async () => {
    if (!tournamentSummaryPayload) {
      setSummaryReviewError(
        "Parse hands first before requesting summary review.",
      );
      return;
    }
    setSummaryReviewError("");
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setLoadingSummaryReview(true);
    try {
      const res = await requestTournamentSummaryReview({
        summary: tournamentSummaryPayload,
      });
      publishTrialTokenUpdate(res?.monthlyUsage?.trialRemainingTokens);
      setSummaryReview(res?.review || null);
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
      setSummaryReviewError(
        err?.message || "Failed to review tournament summary with AI.",
      );
    } finally {
      setLoadingSummaryReview(false);
    }
  };

  const runBlindDefenseReview = async () => {
    if (!blindDefenseReviewPayload) {
      setBlindDefenseReviewError(
        "Need blind defense spots first before requesting AI review.",
      );
      return;
    }
    setBlindDefenseReviewError("");
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setLoadingBlindDefenseReview(true);
    try {
      const res = await requestBlindDefenseReview({
        blindDefenseSummary: blindDefenseReviewPayload,
      });
      publishTrialTokenUpdate(res?.monthlyUsage?.trialRemainingTokens);
      setBlindDefenseReview(res?.review || null);
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
      setBlindDefenseReviewError(
        err?.message || "Failed to review blind defense spots with AI.",
      );
    } finally {
      setLoadingBlindDefenseReview(false);
    }
  };

  const runIcmReview = async () => {
    if (!icmReviewPayload) {
      setIcmReviewError(
        "Need late-stage hands first (Level 25+) before requesting ICM review.",
      );
      return;
    }
    setIcmReviewError("");
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setLoadingIcmReview(true);
    try {
      const res = await requestIcmSpotReview({
        icmSummary: icmReviewPayload,
      });
      publishTrialTokenUpdate(res?.monthlyUsage?.trialRemainingTokens);
      setIcmReview(res?.review || null);
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
      setIcmReviewError(
        err?.message || "Failed to review ICM spots with AI.",
      );
    } finally {
      setLoadingIcmReview(false);
    }
  };

  const runTableHintReview = async () => {
    if (!tableHintPayload || !hasCurrentTableSelection) {
      setTableHintReviewError(
        "Select Current table with visible opponents before requesting this hint.",
      );
      return;
    }
    setTableHintReviewError("");
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setLoadingTableHintReview(true);
    try {
      const res = await requestTableHintReview(tableHintPayload);
      publishTrialTokenUpdate(res?.monthlyUsage?.trialRemainingTokens);
      setTableHintReview(res?.review || null);
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
      setTableHintReviewError(
        err?.message || "Failed to generate current table hint with AI.",
      );
    } finally {
      setLoadingTableHintReview(false);
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
      new Set(filteredParsedHands.map((hand) => handKey(hand))),
    );
  };

  const clearSelection = () => {
    setSelectedHandKeys(new Set());
  };

  const toggleReviewLogic = (rowKey) => {
    if (!rowKey) return;
    setExpandedReviewLogicKeys((previous) => {
      const next = new Set(previous);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  return (
    <section className="hand-review-workspace">
      <div className="hand-review-panel hand-review-pane hand-review-pane-left">
        <div className="hand-review-header">
          <h2>Hand Review</h2>
          <p>
            Upload or paste GG tournament history, then choose whether to
            include all preflop outcomes or exclude preflop folds.
          </p>
        </div>

        <div className="hand-review-parser-head">
          <button
            type="button"
            className="hand-review-parser-toggle"
            onClick={() => setIsParserCollapsed((value) => !value)}
          >
            {isParserCollapsed ? "Expand parser" : "Collapse parser"}
          </button>
        </div>

        {!isParserCollapsed ? (
          <>
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
                <span>{sourceFileName || "Import hand history text file"}</span>
                <input
                  type="file"
                  accept=".txt,.log"
                  onChange={handleFileChange}
                />
              </label>
              <div className="hand-review-upload-choice">
                <span>or</span>
                <button type="button" onClick={openSavedTournamentModal}>
                  Load saved tournament
                </button>
              </div>
              <textarea
                value={historyText}
                onChange={(e) => {
                  setHistoryText(e.target.value);
                  setError("");
                  setSaveTournamentError("");
                  setSaveTournamentSuccess("");
                  setPendingTournamentSave(null);
                  setReviewsByHandKey({});
                  setExpandedReviewLogicKeys(new Set());
                  setSummaryReview(null);
                  setSummaryReviewError("");
                  setBlindDefenseReview(null);
                  setBlindDefenseReviewError("");
                  setIcmReview(null);
                  setIcmReviewError("");
                  setTableHintReview(null);
                  setTableHintReviewError("");
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
              <button
                type="button"
                onClick={runParse}
                disabled={!canSubmit || loadingParse}
              >
                {loadingParse ? "Parsing..." : "Parse Hands"}
              </button>
              {parsedHands.length > 0 ? (
                <button
                  type="button"
                  onClick={promptSaveTournament}
                  disabled={loadingTournamentSave || loadingParse || !canSubmit}
                >
                  Save Tournament
                </button>
              ) : null}
            </div>

            {detectedTournamentIds.length > 1 ? (
              <p className="hand-review-empty">
                Detected tournament IDs: {detectedTournamentIds.join(", ")}
              </p>
            ) : null}

            {saveTournamentError ? (
              <p className="hand-review-error">{saveTournamentError}</p>
            ) : null}
            {saveTournamentSuccess ? (
              <p className="hand-review-success">{saveTournamentSuccess}</p>
            ) : null}
          </>
        ) : (
          <p className="hand-review-empty">
            Parser collapsed. Expand to load another hand-history file or paste
            text.
          </p>
        )}

        {error ? <p className="hand-review-error">{error}</p> : null}
        {showUpgradePrompt ? (
          <div className="ai-upgrade-prompt">
            <p>{aiUpgradePromptMessage}</p>
            <div className="ai-upgrade-prompt-actions">
              <button
                type="button"
                onClick={
                  hasActiveSubscription ? openBillingPortal : openUpgradeCheckout
                }
                disabled={Boolean(billingActionLoading)}
              >
                {billingActionLoading === "checkout"
                  ? "Opening checkout..."
                  : billingActionLoading === "portal"
                    ? "Opening portal..."
                    : hasActiveSubscription
                      ? "Manage plan"
                      : "Upgrade AI"}
              </button>
              {loadingBillingStatus ? (
                <span className="ai-upgrade-prompt-meta">Checking billing…</span>
              ) : null}
              {!hasActiveSubscription ? (
                <span className="ai-upgrade-prompt-meta">
                  Trial tokens left:{" "}
                  {Number.isFinite(trialRemainingTokens)
                    ? trialRemainingTokens.toLocaleString()
                    : "0"}
                </span>
              ) : null}
            </div>
            {billingActionError ? (
              <p className="hand-review-error">{billingActionError}</p>
            ) : null}
            {billingStatusError ? (
              <p className="hand-review-error">{billingStatusError}</p>
            ) : null}
          </div>
        ) : null}

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
              disabled={
                selectedCount === 0 ||
                loadingReview ||
                Boolean(quickReviewHandKey)
              }
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
              const isReviewLogicExpanded = expandedReviewLogicKeys.has(rowKey);
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
                      {Number(outcome.wonAmount) > 0
                        ? ` (${outcome.wonAmount})`
                        : ""}
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
                            attachedReview.overall_score,
                          )}`}
                        >
                          Overall {formatScore(attachedReview.overall_score)}
                        </span>
                        <span>
                          Pre {formatScore(attachedReview.preflop_score)}
                        </span>
                        <span>
                          Flop {formatScore(attachedReview.flop_score)}
                        </span>
                        <span>
                          Turn {formatScore(attachedReview.turn_score)}
                        </span>
                        <span>
                          River {formatScore(attachedReview.river_score)}
                        </span>
                        <span>
                          Confidence {attachedReview.confidence || "medium"}
                        </span>
                      </div>
                      <p>
                        <strong>Summary:</strong> {attachedReview.primary_leak}
                      </p>
                      <p>
                        <strong>Better line:</strong>{" "}
                        {attachedReview.better_line}
                      </p>
                      {(attachedReview.what_was_good || attachedReview.reasoning) && (
                        <div className="hand-review-logic">
                          <button
                            type="button"
                            className="hand-review-logic-toggle"
                            onClick={() => toggleReviewLogic(rowKey)}
                          >
                            {isReviewLogicExpanded
                              ? "Hide full logic"
                              : "Reveal full logic"}
                          </button>
                          {isReviewLogicExpanded ? (
                            <div className="hand-review-logic-body">
                              {attachedReview.what_was_good ? (
                                <p>
                                  <strong>What was good:</strong>{" "}
                                  {attachedReview.what_was_good}
                                </p>
                              ) : null}
                              {attachedReview.reasoning ? (
                                <p>
                                  <strong>Reasoning:</strong>{" "}
                                  {attachedReview.reasoning}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                  <details className="hand-breakdown">
                    <summary>Hand breakdown</summary>
                    <div className="hand-breakdown-body">
                      <p>
                        <strong>Hero cards:</strong>{" "}
                        {formatHeroCards(hand.heroCards)}
                      </p>
                      <p>
                        <strong>Board:</strong> {formatBoard(hand.board)}
                      </p>
                      <p>
                        <strong>Flop:</strong>{" "}
                        {formatBoardStreet(hand.board, "flop")}
                      </p>
                      <p>
                        <strong>Turn:</strong>{" "}
                        {formatBoardStreet(hand.board, "turn")}
                      </p>
                      <p>
                        <strong>River:</strong>{" "}
                        {formatBoardStreet(hand.board, "river")}
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
                          (hand.actionsByStreet?.preflop || []).map(
                            (action, idx) => (
                              <span key={`pre-${idx}`}>
                                {formatActionWithPlayer(action)}
                              </span>
                            ),
                          )
                        ) : (
                          <span>No actions captured.</span>
                        )}
                      </div>
                      {(hand.actionsByStreet?.flop || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Flop</strong>
                          {(hand.actionsByStreet?.flop || []).map(
                            (action, idx) => (
                              <span key={`flop-${idx}`}>
                                {formatActionWithPlayer(action)}
                              </span>
                            ),
                          )}
                        </div>
                      ) : null}
                      {(hand.actionsByStreet?.turn || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Turn</strong>
                          {(hand.actionsByStreet?.turn || []).map(
                            (action, idx) => (
                              <span key={`turn-${idx}`}>
                                {formatActionWithPlayer(action)}
                              </span>
                            ),
                          )}
                        </div>
                      ) : null}
                      {(hand.actionsByStreet?.river || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>River</strong>
                          {(hand.actionsByStreet?.river || []).map(
                            (action, idx) => (
                              <span key={`river-${idx}`}>
                                {formatActionWithPlayer(action)}
                              </span>
                            ),
                          )}
                        </div>
                      ) : null}
                      {Array.isArray(hand.showdown?.revealedCards) &&
                      hand.showdown.revealedCards.length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Revealed cards</strong>
                          {hand.showdown.revealedCards.map((entry, idx) => (
                            <span key={`show-${idx}`}>
                              {entry.player}:{" "}
                              {(entry.cards || []).join(" ") || "Unknown"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        ) : null}

        {parsedHands.length > 0 && filteredParsedHands.length === 0 ? (
          <p className="hand-review-empty">
            No parsed hands match the selected outcome status.
          </p>
        ) : null}
      </div>

      <div className="hand-review-pane hand-review-pane-right">
        {hasTournamentSummary || hasHandAudit || hasOpponentSnapshot ? (
          <div className="hand-insights">
            <div
              className="hand-insights-tabs"
              role="tablist"
              aria-label="Insights tabs"
            >
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
                    {tournamentCoachSummary.rating ? (
                      <>
                        <p>
                          <strong>Tournament rating:</strong>{" "}
                          {tournamentCoachSummary.rating.score10Label} (
                          {tournamentCoachSummary.rating.scorePctLabel})
                        </p>
                        {tournamentCoachSummary.rating.prelimNote ? (
                          <p className="hand-review-empty">
                            {tournamentCoachSummary.rating.prelimNote}
                          </p>
                        ) : null}
                        {tournamentCoachSummary.rating.topDrags.length > 0 ? (
                          <details className="coach-drags-pill">
                            <summary>
                              Biggest drags (
                              {tournamentCoachSummary.rating.topDrags.length})
                            </summary>
                            <div className="tournament-summary-flags">
                              {tournamentCoachSummary.rating.topDrags.map(
                                (drag, idx) => (
                                  <p
                                    key={`coach-rating-drag-${idx}`}
                                    className="trend-flag watch"
                                  >
                                    {drag.label}: -{drag.points.toFixed(1)}{" "}
                                    points
                                  </p>
                                ),
                              )}
                            </div>
                          </details>
                        ) : null}
                      </>
                    ) : null}
                    <p>
                      <strong>Primary leak:</strong>{" "}
                      {tournamentCoachSummary.primaryLeak}
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
                        <p
                          key={`coach-evidence-${idx}`}
                          className="trend-flag watch"
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                    <p>
                      <strong>Quick fixes:</strong>
                    </p>
                    <div className="tournament-summary-flags">
                      {tournamentCoachSummary.actions.map((line, idx) => (
                        <p
                          key={`coach-action-${idx}`}
                          className="trend-flag good"
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {postflopIpHighlights.length > 0 ? (
                  <div className="tournament-coach-summary">
                    <h4>Postflop IP Highlights</h4>
                    <div className="tournament-summary-flags">
                      {postflopIpHighlights.map((line, idx) => (
                        <p
                          key={`postflop-ip-highlight-${idx}`}
                          className="trend-flag watch"
                        >
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
                      {aiSummaryActions.length > 0 ? (
                        <>
                          <p>
                            <strong>Priority fixes:</strong>
                          </p>
                          <div className="tournament-summary-flags">
                            {aiSummaryActions.slice(0, 4).map((line, idx) => (
                              <p
                                key={`ai-summary-action-${idx}`}
                                className="trend-flag good"
                              >
                                {ensureSentenceEnding(line)}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {aiSummaryWarnings.length > 0 ? (
                        <>
                          <p>
                            <strong>Watch-outs:</strong>
                          </p>
                          <div className="tournament-summary-flags">
                            {aiSummaryWarnings.slice(0, 3).map((line, idx) => (
                              <p
                                key={`ai-summary-warning-${idx}`}
                                className="trend-flag watch"
                              >
                                {ensureSentenceEnding(line)}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : null}
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
                      Entered pot: {percentLabel(tournamentSummary.enteredPct)}{" "}
                      ({tournamentSummary.enteredHands}/
                      {tournamentSummary.totalHands})
                    </span>
                    <span>
                      Folded preflop:{" "}
                      {percentLabel(tournamentSummary.preflopFoldPct)} (
                      {tournamentSummary.preflopFolds}/
                      {tournamentSummary.totalHands})
                    </span>
                    <span>
                      Preflop fold warning threshold:{" "}
                      {percentLabel(tournamentSummary.preflopFoldWarnThreshold)}
                      {tournamentSummary.totalHands < 40
                        ? " (inactive under 40-hand sample)"
                        : ""}
                    </span>
                    <span>
                      Seat distribution (late/early/blinds):{" "}
                      {tournamentSummary.enteredLate}/
                      {tournamentSummary.enteredEarly}/
                      {tournamentSummary.enteredBlind}
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
                        tournamentSummary.preflopBreakdown
                          .openedWhenNoRaiseBeforeHero,
                        tournamentSummary.preflopBreakdown
                          .noRaiseBeforeHeroSpots,
                      )}
                    </span>
                  </div>
                  {tournamentSummary.preflopBreakdown.openByPositionRows.filter(
                    (row) => row.spots >= 6,
                  ).length > 0 ? (
                    <div className="tournament-summary-statuses">
                      {tournamentSummary.preflopBreakdown.openByPositionRows
                        .filter((row) => row.spots >= 6)
                        .map((row) => (
                          <span key={`open-${row.position}`}>
                            Open {row.position}:{" "}
                            {formatRateWithConfidence(row.opens, row.spots)}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <p className="hand-review-empty">
                      Not enough opening samples by position yet (need at least
                      6).
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
                        tournamentSummary.preflopBreakdown.facingOpenSpots,
                      )}
                    </span>
                    <span>
                      Blind folds vs open (SB+BB):{" "}
                      {formatRateWithConfidence(
                        tournamentSummary.preflopBreakdown.blindFoldFacingOpen,
                        tournamentSummary.preflopBreakdown.blindFacingOpenSpots,
                      )}
                    </span>
                    <span>
                      SB folds vs open:{" "}
                      {formatRateWithConfidence(
                        tournamentSummary.preflopBreakdown.sbFoldFacingOpen,
                        tournamentSummary.preflopBreakdown.sbFacingOpenSpots,
                      )}
                    </span>
                    <span>
                      BB folds vs open:{" "}
                      {formatRateWithConfidence(
                        tournamentSummary.preflopBreakdown.bbFoldFacingOpen,
                        tournamentSummary.preflopBreakdown.bbFacingOpenSpots,
                      )}
                    </span>
                  </div>
                  {tournamentSummary.preflopBreakdown.defendByPositionRows.filter(
                    (row) => row.spots >= 6,
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
                      Not enough defend samples by position yet (need at least
                      6).
                    </p>
                  )}
                </details>

                <details className="summary-section">
                  <summary>Vs Reraise</summary>
                  <div className="tournament-summary-metrics">
                    <span>
                      Faced reraise after aggression - folded:{" "}
                      {formatRateWithConfidence(
                        tournamentSummary.preflopBreakdown
                          .foldedAfterFacingReraise,
                        tournamentSummary.preflopBreakdown
                          .facedReraiseAfterAggressionSpots,
                      )}
                    </span>
                    <span>
                      Called then faced raise - folded:{" "}
                      {formatRateWithConfidence(
                        tournamentSummary.preflopBreakdown
                          .callThenFoldedToRaise,
                        tournamentSummary.preflopBreakdown
                          .callThenFacedRaiseSpots,
                      )}
                    </span>
                  </div>
                </details>

                <details className="summary-section">
                  <summary>Postflop And Outcomes</summary>
                  <div className="tournament-summary-metrics">
                    <span>
                      Won without showdown:{" "}
                      {percentLabel(tournamentSummary.noShowdownWinPct)} of
                      entered
                    </span>
                    <span>
                      Postflop no-showdown wins:{" "}
                      {percentLabel(tournamentSummary.postflopNoShowdownPct)} of
                      entered
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
                      <p
                        key={`flag-${idx}`}
                        className={`trend-flag ${flag.level}`}
                      >
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
                    <p className="hand-review-empty">
                      No status counts available.
                    </p>
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
                    <span>
                      RFI spots scored: {preflopOpportunityAudit.rfiSpotsScored}
                    </span>
                    <span>
                      Facing-open spots scored:{" "}
                      {preflopOpportunityAudit.facingOpenSpotsScored}
                    </span>
                    <span>
                      Vs 3-bet spots scored:{" "}
                      {preflopOpportunityAudit.vs3BetSpotsScored}
                    </span>
                    <span>
                      Missing hole cards:{" "}
                      {preflopOpportunityAudit.unknownCardsSpots}
                    </span>
                  </div>
                  <div className="tournament-summary-metrics">
                    <span>
                      Missed opens (chart-qualified):{" "}
                      {preflopOpportunityAudit.missedOpen.count}/
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
                      {preflopOpportunityAudit.missedOpen.topCombos.map(
                        (row) => (
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
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="hand-review-empty">
                      No repeated missed open combos flagged.
                    </p>
                  )}

                  <p>
                    <strong>Top missed defends:</strong>
                  </p>
                  {preflopOpportunityAudit.missedDefend.topCombos.length > 0 ? (
                    <div className="tournament-summary-statuses">
                      {preflopOpportunityAudit.missedDefend.topCombos.map(
                        (row) => (
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
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="hand-review-empty">
                      No repeated missed defend combos flagged.
                    </p>
                  )}

                  <p>
                    <strong>Top overfolds vs 3-bet:</strong>
                  </p>
                  {preflopOpportunityAudit.overfoldVs3Bet.topCombos.length >
                  0 ? (
                    <div className="tournament-summary-statuses">
                      {preflopOpportunityAudit.overfoldVs3Bet.topCombos.map(
                        (row) => (
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
                        ),
                      )}
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
                        {preflopOpportunityAudit.missedOpen.examples.map(
                          (event) => (
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
                              {event.handId}: {event.position} {event.handCode}{" "}
                              {event.actualAction} - {event.recommendation}
                            </button>
                          ),
                        )}
                      </div>
                    </>
                  ) : null}
                </details>

                <details className="summary-section">
                  <summary>Blind Defence (Full Tournament)</summary>
                  <p className="hand-review-empty">
                    Blind-focused audit for SB/BB versus opens across the full
                    parsed tournament sample.
                  </p>
                  <div className="tournament-summary-metrics">
                    <span>
                      Blind defense spots: {blindDefenseAudit.totalBlindDefenseSpots}
                    </span>
                    <span>SB spots: {blindDefenseAudit.sbDefenseSpots}</span>
                    <span>BB spots: {blindDefenseAudit.bbDefenseSpots}</span>
                    <span>
                      Likely continue spots: {blindDefenseAudit.likelyContinueSpots}
                    </span>
                    <span>
                      Missed likely continues: {blindDefenseAudit.missedContinues.count}
                    </span>
                    <span>
                      Missed SB 3-bet pressure:{" "}
                      {blindDefenseAudit.missedSb3BetPressure.count}
                    </span>
                    <span>
                      Confidence: {confidenceLabel(blindDefenseAudit.confidence)}
                    </span>
                  </div>
                  {blindDefenseAudit.handClassRows.length > 0 ? (
                    <>
                      <p>
                        <strong>Missed-continue hand classes:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {blindDefenseAudit.handClassRows.map((row) => (
                          <span key={`blind-class-${row.label}`}>
                            {row.label}: {row.count}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {blindDefenseAudit.missedContinues.topCombos.length > 0 ? (
                    <>
                      <p>
                        <strong>Likely continue combos you folded:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {blindDefenseAudit.missedContinues.topCombos
                          .slice(0, 8)
                          .map((row) => (
                            <button
                              type="button"
                              key={`blind-missed-continue-${row.position}-${row.handCode}`}
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
                    </>
                  ) : (
                    <p className="hand-review-empty">
                      No repeated blind-continue misses flagged.
                    </p>
                  )}
                  <div className="tournament-summary-flags">
                    {blindDefenseAudit.quickFixes.map((line, idx) => (
                      <p
                        key={`blind-fix-${idx}`}
                        className={`trend-flag ${
                          line.startsWith("No dominant") ? "good" : "watch"
                        }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-summary-flags">
                    {blindDefenseAudit.warnings.map((line, idx) => (
                      <p key={`blind-warning-${idx}`} className="trend-flag watch">
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-ai-review">
                    <button
                      type="button"
                      onClick={runBlindDefenseReview}
                      disabled={loadingBlindDefenseReview || !blindDefenseReviewPayload}
                    >
                      {loadingBlindDefenseReview
                        ? "Reviewing blind defense..."
                        : "AI Review Blind Defence"}
                    </button>
                    {blindDefenseReviewError ? (
                      <p className="hand-review-error">{blindDefenseReviewError}</p>
                    ) : null}
                    {blindDefenseReview ? (
                      <div className="tournament-ai-review-card">
                        <p className="tournament-ai-paragraph">
                          {buildAiSummaryParagraph(blindDefenseReview)}
                        </p>
                        {aiBlindDefenseActions.length > 0 ? (
                          <>
                            <p>
                              <strong>Priority fixes:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiBlindDefenseActions.slice(0, 4).map((line, idx) => (
                                <p key={`ai-blind-action-${idx}`} className="trend-flag good">
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                        {aiBlindDefenseWarnings.length > 0 ? (
                          <>
                            <p>
                              <strong>Watch-outs:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiBlindDefenseWarnings.slice(0, 4).map((line, idx) => (
                                <p key={`ai-blind-warning-${idx}`} className="trend-flag watch">
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </details>

                <details className="summary-section">
                  <summary>ICM Spots (Last 40 Hands, Level 25+)</summary>
                  <p className="hand-review-empty">
                    Heuristic late-stage ICM proxy focused on preflop pressure,
                    defend, and all-in continue spots.
                  </p>
                  <div className="tournament-summary-metrics">
                    <span>
                      Recent hands sampled: {icmSpotAudit.recentHandsSampled}/
                      {icmSpotAudit.recentLimit}
                    </span>
                    <span>
                      Late-level hands (L{icmSpotAudit.levelThreshold}+):{" "}
                      {icmSpotAudit.lateLevelHands}
                    </span>
                    <span>Flagged spots: {icmSpotAudit.flagged.count}</span>
                    <span>
                      Confidence: {confidenceLabel(icmSpotAudit.confidence)}
                    </span>
                    <span>
                      Avg hero stack:{" "}
                      {icmSpotAudit.avgHeroStackBb !== null
                        ? `${icmSpotAudit.avgHeroStackBb} BB`
                        : "n/a"}
                    </span>
                    <span>
                      Unknown hole cards skipped: {icmSpotAudit.unknownCardsSpots}
                    </span>
                  </div>
                  <div className="tournament-summary-metrics">
                    <span>Open spots: {icmSpotAudit.openSpots}</span>
                    <span>
                      Facing aggression spots: {icmSpotAudit.facingAggressionSpots}
                    </span>
                    <span>
                      Facing jam spots: {icmSpotAudit.facingJamSpots}
                    </span>
                    <span>
                      Pressure-eligible spots: {icmSpotAudit.pressureEligibleSpots}
                    </span>
                    <span>
                      Missed stack-pressure spots: {icmSpotAudit.missedPressureSpots}
                    </span>
                    <span>
                      SB/BB fold spots captured: {icmSpotAudit.blindFoldSpots.count}
                    </span>
                    <span>
                      SB/BB folds that were likely continues:{" "}
                      {icmSpotAudit.blindFoldSpots.shouldDefendCount}
                    </span>
                  </div>
                  {Object.entries(icmSpotAudit.issueCounts || {}).length > 0 ? (
                    <>
                      <p>
                        <strong>Top issue buckets:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {Object.entries(icmSpotAudit.issueCounts || {})
                          .slice(0, 5)
                          .map(([type, count]) => (
                            <span key={`icm-issue-${type}`}>
                              {type.replace(/_/g, " ")}: {count}
                            </span>
                          ))}
                      </div>
                    </>
                  ) : null}
                  <div className="tournament-summary-flags">
                    {icmSpotAudit.quickFixes.map((line, idx) => (
                      <p
                        key={`icm-fix-${idx}`}
                        className={`trend-flag ${
                          line.startsWith("No dominant") ? "good" : "watch"
                        }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-summary-flags">
                    {icmSpotAudit.warnings.map((line, idx) => (
                      <p key={`icm-warning-${idx}`} className="trend-flag watch">
                        {line}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-ai-review">
                    <button
                      type="button"
                      onClick={runIcmReview}
                      disabled={loadingIcmReview || !icmReviewPayload}
                    >
                      {loadingIcmReview
                        ? "Reviewing ICM spots..."
                        : "AI Review ICM Spots"}
                    </button>
                    {icmReviewError ? (
                      <p className="hand-review-error">{icmReviewError}</p>
                    ) : null}
                    {icmReview ? (
                      <div className="tournament-ai-review-card">
                        <p className="tournament-ai-paragraph">
                          {buildAiSummaryParagraph(icmReview)}
                        </p>
                        {aiIcmActions.length > 0 ? (
                          <>
                            <p>
                              <strong>Priority fixes:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiIcmActions.slice(0, 4).map((line, idx) => (
                                <p key={`ai-icm-action-${idx}`} className="trend-flag good">
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                        {aiIcmWarnings.length > 0 ? (
                          <>
                            <p>
                              <strong>Watch-outs:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiIcmWarnings.slice(0, 4).map((line, idx) => (
                                <p key={`ai-icm-warning-${idx}`} className="trend-flag watch">
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {icmSpotAudit.blindFoldSpots.examples.length > 0 ? (
                    <>
                      <p>
                        <strong>Sample SB/BB fold spots:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {icmSpotAudit.blindFoldSpots.examples.map((event) => (
                          <button
                            type="button"
                            key={`icm-blind-fold-${event.handId}-${event.playedAt}`}
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
                            {event.handId}: L{event.level || "?"} {event.position}{" "}
                            {event.handCode}{" "}
                            {event.stackBb !== null ? `(${event.stackBb}bb)` : ""}{" "}
                            fold -{" "}
                            {event.chartShouldDefend
                              ? "likely continue"
                              : "likely standard fold"}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {icmSpotAudit.flagged.examples.length > 0 ? (
                    <>
                      <p>
                        <strong>Example flagged ICM spots:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {icmSpotAudit.flagged.examples.map((event) => (
                          <button
                            type="button"
                            key={`icm-spot-${event.handId}-${event.playedAt}-${event.type}`}
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
                            {event.handId}: L{event.level || "?"} {event.position}{" "}
                            {event.handCode}{" "}
                            {event.stackBb !== null ? `(${event.stackBb}bb)` : ""}{" "}
                            {event.actualAction} - {event.recommendation}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="hand-review-empty">
                      No concrete ICM-style spots flagged in the current last-40
                      late-level sample.
                    </p>
                  )}
                </details>

                <details className="summary-section">
                  <summary>Postflop In Position Audit (MVP)</summary>
                  <p className="hand-review-empty">
                    Scope: heads-up flop/turn/river spots where hero acts in
                    position.
                  </p>
                  <div className="tournament-summary-metrics">
                    <span>
                      IP HU flop spots scored:{" "}
                      {postflopInPositionAudit.ipHeadsUpFlopSpots}
                    </span>
                    <span>
                      IP HU turn spots scored:{" "}
                      {postflopInPositionAudit.ipHeadsUpTurnSpots}
                    </span>
                    <span>
                      IP HU river spots scored:{" "}
                      {postflopInPositionAudit.ipHeadsUpRiverSpots}
                    </span>
                    <span>
                      IP c-bet opportunities:{" "}
                      {postflopInPositionAudit.ipCbetOpportunities}
                    </span>
                    <span>
                      IP stab opportunities:{" "}
                      {postflopInPositionAudit.ipStabOpportunities}
                    </span>
                  </div>
                  <div className="tournament-summary-metrics">
                    <span>
                      IP spots facing flop bet:{" "}
                      {postflopInPositionAudit.ipFacingFlopBetSpots}
                    </span>
                    <span>
                      IP spots facing turn bet:{" "}
                      {postflopInPositionAudit.ipFacingTurnBetSpots}
                    </span>
                    <span>
                      IP spots facing river bet:{" "}
                      {postflopInPositionAudit.ipFacingRiverBetSpots}
                    </span>
                    <span>
                      Strong made vs turn/river bet spots:{" "}
                      {
                        postflopInPositionAudit.ipStrongMadeFacingTurnRiverBetSpots
                      }
                    </span>
                  </div>
                  <div className="tournament-summary-metrics">
                    <span>
                      Missed IP c-bet on favorable flop:{" "}
                      {rateCountLabel(
                        postflopInPositionAudit.missedIpCbetFavorable.count,
                        postflopInPositionAudit.ipCbetOpportunities,
                      )}
                    </span>
                    <span>
                      Missed IP stab on favorable flop:{" "}
                      {rateCountLabel(
                        postflopInPositionAudit.missedIpStabFavorable.count,
                        postflopInPositionAudit.ipStabOpportunities,
                      )}
                    </span>
                    <span>
                      Likely light IP flop folds:{" "}
                      {rateCountLabel(
                        postflopInPositionAudit.lightIpFoldFlop.count,
                        postflopInPositionAudit.ipFacingFlopBetSpots,
                      )}
                    </span>
                    <span>
                      Likely light IP turn folds:{" "}
                      {rateCountLabel(
                        postflopInPositionAudit.lightIpFoldTurn.count,
                        postflopInPositionAudit.ipFacingTurnBetSpots,
                      )}
                    </span>
                    <span>
                      Likely light IP river folds:{" "}
                      {rateCountLabel(
                        postflopInPositionAudit.lightIpFoldRiver.count,
                        postflopInPositionAudit.ipFacingRiverBetSpots,
                      )}
                    </span>
                    <span>
                      Missed IP value-raises (turn/river):{" "}
                      {rateCountLabel(
                        postflopInPositionAudit.missedIpValueRaise.count,
                        postflopInPositionAudit.ipStrongMadeFacingTurnRiverBetSpots,
                      )}
                    </span>
                    <span>
                      Missing hole cards:{" "}
                      {postflopInPositionAudit.unknownCardsSpots}
                    </span>
                  </div>
                  <div className="tournament-summary-flags">
                    {postflopInPositionAudit.quickFixes.map((line, idx) => (
                      <p
                        key={`postflop-audit-fix-${idx}`}
                        className={`trend-flag ${
                          line.startsWith("No dominant") ? "good" : "watch"
                        }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>

                  {postflopInPositionAudit.missedIpCbetFavorable.topCombos
                    .length > 0 ? (
                    <>
                      <p>
                        <strong>Top missed IP c-bets (favorable flop):</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.missedIpCbetFavorable.topCombos.map(
                          (row) => (
                            <button
                              type="button"
                              key={`postflop-cbet-${row.position}-${row.handCode}`}
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
                          ),
                        )}
                      </div>
                    </>
                  ) : null}

                  {postflopInPositionAudit.missedIpStabFavorable.topCombos
                    .length > 0 ? (
                    <>
                      <p>
                        <strong>Top missed IP stabs (favorable flop):</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.missedIpStabFavorable.topCombos.map(
                          (row) => (
                            <button
                              type="button"
                              key={`postflop-stab-${row.position}-${row.handCode}`}
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
                          ),
                        )}
                      </div>
                    </>
                  ) : null}

                  {postflopInPositionAudit.lightIpFoldFlop.topCombos.length >
                  0 ? (
                    <>
                      <p>
                        <strong>Top likely light IP flop folds:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.lightIpFoldFlop.topCombos.map(
                          (row) => (
                            <button
                              type="button"
                              key={`postflop-flop-fold-${row.position}-${row.handCode}`}
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
                          ),
                        )}
                      </div>
                    </>
                  ) : null}

                  {postflopInPositionAudit.lightIpFoldTurn.topCombos.length >
                  0 ? (
                    <>
                      <p>
                        <strong>Top likely light IP turn folds:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.lightIpFoldTurn.topCombos.map(
                          (row) => (
                            <button
                              type="button"
                              key={`postflop-turn-fold-${row.position}-${row.handCode}`}
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
                          ),
                        )}
                      </div>
                    </>
                  ) : null}

                  {postflopInPositionAudit.lightIpFoldRiver.topCombos.length >
                  0 ? (
                    <>
                      <p>
                        <strong>Top likely light IP river folds:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.lightIpFoldRiver.topCombos.map(
                          (row) => (
                            <button
                              type="button"
                              key={`postflop-river-fold-${row.position}-${row.handCode}`}
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
                          ),
                        )}
                      </div>
                    </>
                  ) : null}

                  {postflopInPositionAudit.missedIpValueRaise.topCombos.length >
                  0 ? (
                    <>
                      <p>
                        <strong>
                          Top missed IP value-raises (turn/river):
                        </strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.missedIpValueRaise.topCombos.map(
                          (row) => (
                            <button
                              type="button"
                              key={`postflop-value-raise-${row.position}-${row.handCode}`}
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
                          ),
                        )}
                      </div>
                    </>
                  ) : null}

                  {postflopInPositionAudit.missedIpValueRaise.examples.length >
                  0 ? (
                    <>
                      <p>
                        <strong>Example missed IP value-raises:</strong>
                      </p>
                      <div className="tournament-summary-statuses">
                        {postflopInPositionAudit.missedIpValueRaise.examples.map(
                          (event) => (
                            <button
                              type="button"
                              key={`postflop-value-raise-example-${event.handId}-${event.playedAt}`}
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
                              {event.handId}: {event.position} {event.handCode}{" "}
                              {event.actualAction} - {event.recommendation}
                            </button>
                          ),
                        )}
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
                    {opponentSnapshot?.totalOpponents || opponentPlayers.length}{" "}
                    players across {opponentSnapshot?.totalHandsTracked || 0}{" "}
                    hands
                  </span>
                </div>
                <div className="opponent-snapshot-toolbar">
                  <label>
                    View
                    <select
                      value={opponentFilter}
                      onChange={(event) =>
                        setOpponentFilter(event.target.value)
                      }
                    >
                      <option value="all">All opponents</option>
                      <option value="current_table">
                        Current table (best guess)
                      </option>
                    </select>
                  </label>
                  <p className="opponent-snapshot-note">
                    Best guess uses latest hand
                    {currentTableGuess?.playedAt
                      ? ` (${currentTableGuess.playedAt})`
                      : ""}
                    .
                  </p>
                  {opponentFilter === "current_table" ? (
                    <p className="opponent-snapshot-note">
                      Hero seat: {currentHeroSeatLabel}.
                    </p>
                  ) : null}
                </div>
                {opponentFilter === "current_table" ? (
                  <div className="opponent-table-ai-review">
                    <button
                      type="button"
                      className={`opponent-ai-hint-button ${
                        loadingTableHintReview ? "loading" : ""
                      }`}
                      onClick={runTableHintReview}
                      disabled={loadingTableHintReview || !tableHintPayload}
                      title="AI hint for current table"
                      aria-label="AI hint for current table"
                    >
                      <span aria-hidden="true">
                        {loadingTableHintReview ? "..." : "⚡"}
                      </span>
                      <span>
                        {loadingTableHintReview
                          ? "Reviewing table..."
                          : "AI Table Hint"}
                      </span>
                    </button>
                    {tableHintReviewError ? (
                      <p className="hand-review-error">{tableHintReviewError}</p>
                    ) : null}
                    {tableHintReview ? (
                      <div className="tournament-ai-review-card">
                        <p className="tournament-ai-paragraph">
                          {buildTableHintParagraph(tableHintReview)}
                        </p>
                        {aiTableHintExploits.length > 0 ? (
                          <>
                            <p>
                              <strong>Priority exploits:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiTableHintExploits.slice(0, 4).map((line, idx) => (
                                <p
                                  key={`ai-table-exploit-${idx}`}
                                  className="trend-flag good"
                                >
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                        {aiTableHintAdjustments.length > 0 ? (
                          <>
                            <p>
                              <strong>Next hour adjustments:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiTableHintAdjustments.slice(0, 5).map((line, idx) => (
                                <p
                                  key={`ai-table-adjustment-${idx}`}
                                  className="trend-flag good"
                                >
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                        {aiTableHintWarnings.length > 0 ? (
                          <>
                            <p>
                              <strong>Watch-outs:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiTableHintWarnings.slice(0, 4).map((line, idx) => (
                                <p
                                  key={`ai-table-warning-${idx}`}
                                  className="trend-flag watch"
                                >
                                  {ensureSentenceEnding(line)}
                                </p>
                              ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="opponent-snapshot-list">
                  {visibleOpponentPlayers.map((player) => {
                    const tendencyLabels = extractTendencyLabels(player);
                    const playNoteLine = formatPlayNote(player);
                    return (
                      <article
                        key={player.player}
                        className="opponent-snapshot-row"
                      >
                        <div className="opponent-snapshot-row-head">
                          <strong>{formatLatestSeat(player.latestSeat)}</strong>
                          <span>{player.player}</span>
                          <span>{player.handsSeen} hands</span>
                          <span>{formatChipStack(player.latestStack)}</span>
                          {player.lastSeenAt ? (
                            <span>Last: {player.lastSeenAt}</span>
                          ) : null}
                          <button
                            type="button"
                            className="opponent-copy-button"
                            onClick={() =>
                              copyOpponentTendencies(
                                player.player,
                                tendencyLabels,
                                playNoteLine,
                              )
                            }
                            disabled={
                              tendencyLabels.length === 0 && !playNoteLine
                            }
                          >
                            {copiedOpponentKey === player.player
                              ? "Copied"
                              : "Copy tendencies"}
                          </button>
                        </div>
                        <div className="opponent-snapshot-metrics">
                          <span>
                            Entered pot: {formatPercentCount(player.enteredPot)}
                          </span>
                          <span>
                            Folded preflop:{" "}
                            {formatPercentCount(player.foldedPreflop)}
                          </span>
                          <span>
                            Raised preflop:{" "}
                            {formatPercentCount(player.preflopRaise)}
                          </span>
                          <span>
                            Fold to preflop raise:{" "}
                            {formatPercentCount(player.foldToPreflopRaise)}
                          </span>
                          <span>
                            Postflop aggression:{" "}
                            {formatAggression(player.postflopAggression)}
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
                              <span
                                key={`${player.player}-${label}`}
                                className="opponent-tag"
                              >
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
        ) : (
          <p className="hand-review-empty">
            Parse hands to unlock Tournament Summary, Stats, Audit, and Opponent
            Snapshot.
          </p>
        )}
      </div>

      {pendingTournamentSave ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal hand-review-modal">
            <div className="modal-header">
              <h3 className="modal-title">Confirm Tournament Save</h3>
              <button
                type="button"
                className="hand-review-modal-close"
                onClick={() => setPendingTournamentSave(null)}
                disabled={loadingTournamentSave}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p>
                <strong>Tournament ID:</strong>{" "}
                {pendingTournamentSave.tournamentId}
              </p>
              <p>
                <strong>Tournament name:</strong>{" "}
                {pendingTournamentSave.tournamentName || "Tournament upload"}
              </p>
              <p>
                <strong>Date:</strong>{" "}
                {formatDateTimeLabelFromEpoch(
                  pendingTournamentSave.playedAtEpoch,
                )}
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={saveTournament}
                disabled={loadingTournamentSave}
              >
                {loadingTournamentSave ? "Saving..." : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => setPendingTournamentSave(null)}
                disabled={loadingTournamentSave}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {savedTournamentModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal hand-review-modal">
            <div className="modal-header">
              <h3 className="modal-title">Load Saved Tournament</h3>
            </div>
            <div className="modal-body">
              {loadingSavedTournaments ? (
                <p className="hand-review-empty">
                  Loading saved tournaments...
                </p>
              ) : null}
              {savedTournamentError ? (
                <p className="hand-review-error">{savedTournamentError}</p>
              ) : null}
              {!loadingSavedTournaments &&
              !savedTournamentError &&
              savedTournaments.length === 0 ? (
                <p className="hand-review-empty">No saved tournaments yet.</p>
              ) : null}
              {!loadingSavedTournaments && savedTournaments.length > 0 ? (
                <div className="hand-review-saved-list">
                  {savedTournaments.map((item) => {
                    const id = String(item?.tournamentId || "").trim();
                    const name = String(item?.tournamentName || "").trim();
                    const playedAt = item?.tournamentPlayedAt || null;
                    const handCount = Number(item?.summary?.totalHands) || 0;
                    const isSelected = selectedSavedTournamentId === id;
                    return (
                      <label
                        key={id}
                        className={`hand-review-saved-item ${
                          isSelected ? "selected" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelectedSavedTournamentId((prev) =>
                              prev === id ? "" : id,
                            )
                          }
                          disabled={
                            Boolean(loadingSavedTournamentId) ||
                            Boolean(deletingSavedTournamentId)
                          }
                        />
                        <span className="hand-review-saved-file">
                          {id} - {name || "Tournament upload"}{" "}
                          <span className="hand-review-saved-file-meta">
                            ({formatDateTimeLabel(playedAt)} | {handCount}{" "}
                            hands)
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={closeSavedTournamentModal}
                disabled={
                  Boolean(loadingSavedTournamentId) ||
                  Boolean(deletingSavedTournamentId)
                }
              >
                Close
              </button>
              <button
                type="button"
                className="danger-action"
                onClick={deleteSelectedSavedTournament}
                disabled={
                  Boolean(loadingSavedTournamentId) ||
                  Boolean(deletingSavedTournamentId) ||
                  !selectedSavedTournamentId
                }
              >
                {deletingSavedTournamentId ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={loadSelectedSavedTournament}
                disabled={
                  Boolean(loadingSavedTournamentId) ||
                  Boolean(deletingSavedTournamentId) ||
                  !selectedSavedTournamentId
                }
              >
                {loadingSavedTournamentId ? "Loading..." : "Load"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
