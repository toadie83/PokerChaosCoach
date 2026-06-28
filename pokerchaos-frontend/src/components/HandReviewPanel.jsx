import { useEffect, useMemo, useRef, useState } from "react";
import {
  requestBillingCheckoutSession,
  requestBillingPortalSession,
  requestBillingStatus,
  requestBlindDefenseReview,
  requestDeleteSavedTournament,
  requestDeleteTournamentPerformanceSnapshot,
  requestHandHistoryParse,
  requestHandHistoryReview,
  requestIcmSpotReview,
  requestSavedTournament,
  requestSavedTournaments,
  requestSaveTournamentPerformanceSnapshot,
  requestTableHintReview,
  requestTournamentUpload,
  requestTournamentPerformanceSnapshots,
  requestTournamentSummaryReview,
} from "../api/aiService.js";
import HandReviewV2Modal from "./HandReviewV2Modal.jsx";
import TournamentPerformanceChart from "./TournamentPerformanceChart.jsx";
import { resolveHandBbResult } from "../lib/handResult.js";

const CASH_NOTICE_DISMISS_KEY = "pokerchaos_cash_notice_dismissed";
const MIN_VALID_TOURNAMENT_EPOCH = Date.UTC(2000, 0, 1);

function readCashNoticeDismissed() {
  try {
    return window.sessionStorage.getItem(CASH_NOTICE_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCashNoticeDismissed(value) {
  try {
    window.sessionStorage.setItem(CASH_NOTICE_DISMISS_KEY, value ? "1" : "0");
  } catch {
    // Ignore storage write errors; dismissal still works in component state.
  }
}

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

function normalizeReviewConfidence(confidence) {
  const value = String(confidence || "")
    .trim()
    .toLowerCase();
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

function confidenceUiLabel(confidence) {
  const value = normalizeReviewConfidence(confidence);
  if (value === "high") return "High confidence";
  if (value === "low") return "Low confidence";
  return "Moderate confidence";
}

function reviewVerdictLabel(overallScore) {
  const score = Number(overallScore);
  if (!Number.isFinite(score)) return "Spot appears close";
  if (score >= 1) return "Line appears strong";
  if (score <= -1) return "Adjustment recommended";
  return "Spot appears close";
}

function normalizeReviewHeadline(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/street-by-street decision review|street-by-street review/i.test(value)) {
    return "Full Hand Review";
  }
  if (/preflop decision leak/i.test(value)) return "Preflop Pressure Spot";
  if (/flop decision leak/i.test(value)) return "Flop Decision Spot";
  if (/turn decision leak/i.test(value)) return "Tough Turn Decision";
  if (/river decision leak/i.test(value)) return "River Decision Spot";
  return value;
}

function normalizeBiggestLeakCopy(raw, mistakesFound = null) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/no major leak flagged/i.test(value)) {
    const count = Number(mistakesFound);
    if (Number.isFinite(count) && count <= 0) return "Solid overall execution.";
    return "No single dominant issue; review timeline spots.";
  }
  return value;
}

function hasStreetIntelligenceReview(review) {
  if (!review || typeof review !== "object") return false;
  const version = String(review?.review_version || "")
    .trim()
    .toLowerCase();
  const hasStreetReviews = Array.isArray(
    review?.street_intelligence?.street_reviews,
  );
  if (version === "v2_street_intelligence" && hasStreetReviews) return true;
  return hasStreetReviews;
}

function buildV2TileTeaser(review, hand = null) {
  const summary =
    review && typeof review?.street_intelligence?.hand_summary === "object"
      ? review.street_intelligence.hand_summary
      : {};
  const headline =
    normalizeReviewHeadline(summary?.headline) ||
    reviewVerdictLabel(review?.overall_score);
  const biggestLeak =
    normalizeBiggestLeakCopy(
      String(summary?.biggest_leak || "").trim() ||
        String(review?.primary_leak || "").trim(),
      summary?.mistakes_found,
    );
  const handBbResult = resolveHandBbResult(hand || {});
  const line = Array.isArray(review?.street_intelligence?.street_reviews)
    ? review.street_intelligence.street_reviews
        .filter((row) => Number(row?.score) <= -1)
        .slice(0, 2)
        .map((row) => {
          const street = String(row?.street || "").trim().toLowerCase();
          const action = String(row?.action_taken?.action || "").trim();
          if (!street || !action) return "";
          return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${street}`;
        })
        .filter(Boolean)
        .join(", ")
    : "";
  return {
    headline,
    bbLabel: handBbResult.label,
    bbTone: handBbResult.tone,
    line,
    biggestLeak,
  };
}

function isDeveloperQaAccount(entitlements = null) {
  const features = entitlements?.features || {};
  if (features?.developer || features?.admin) return true;
  const emails = Array.isArray(entitlements?.emails) ? entitlements.emails : [];
  return emails.some(
    (email) => String(email || "").trim().toLowerCase() === "frosttrev@gmail.com",
  );
}

function reviewQaSummary(review = {}) {
  const evaluation = review && typeof review?.evaluation === "object" ? review.evaluation : null;
  if (!evaluation) {
    return {
      hasEvaluation: false,
      score: null,
      warningsCount: 0,
      label: "",
    };
  }
  const score = Number(evaluation?.overall_score);
  const warningsFromEvaluation = Array.isArray(evaluation?.warnings)
    ? evaluation.warnings.length
    : 0;
  const warningsFromReport = Array.isArray(review?.evaluation_report?.warnings)
    ? review.evaluation_report.warnings.length
    : 0;
  const warningsCount = Math.max(warningsFromEvaluation, warningsFromReport);
  const scoreLabel = Number.isFinite(score) ? `QA ${Math.round(score)}` : "QA";
  return {
    hasEvaluation: true,
    score: Number.isFinite(score) ? Math.round(score) : null,
    warningsCount,
    label: warningsCount > 0 ? `${scoreLabel} • ⚠ ${warningsCount}` : scoreLabel,
  };
}

const INFRASTRUCTURE_COPY_RULES = [
  {
    pattern: /\bconstrained action set\b/gi,
    replacement: "available options",
  },
  {
    pattern: /\blegal action set\b/gi,
    replacement: "available options",
  },
  {
    pattern: /\bunsupported concept\b/gi,
    replacement: "high-variance concept",
  },
  { pattern: /\bchecks failed\b/gi, replacement: "spot is close" },
  { pattern: /\bdeterministic\b/gi, replacement: "structured" },
  { pattern: /\bschema\b/gi, replacement: "format" },
  { pattern: /\bvalidator\b/gi, replacement: "review pass" },
  { pattern: /\bvalidation\b/gi, replacement: "review" },
  { pattern: /\brecovery\b/gi, replacement: "follow-up" },
  { pattern: /\bnode\b/gi, replacement: "spot" },
];

function sanitizeCoachingCopy(text) {
  let value = String(text || "").trim();
  if (!value) return "";
  for (const { pattern, replacement } of INFRASTRUCTURE_COPY_RULES) {
    value = value.replace(pattern, replacement);
  }
  return value.replace(/\s{2,}/g, " ").trim();
}

function sampleSizeTier(sampleSize) {
  const n = Number(sampleSize);
  if (!Number.isFinite(n) || n <= 0) return "low";
  if (n < 20) return "low";
  if (n < 75) return "medium";
  return "high";
}

function sampleQualityLabel(sampleSize) {
  const tier = sampleSizeTier(sampleSize);
  if (tier === "high") return "Established sample";
  if (tier === "medium") return "Building sample";
  return "Early sample";
}

function summarizeOpponentSampleQuality(opponents) {
  if (!Array.isArray(opponents) || opponents.length === 0) {
    return {
      tier: "low",
      averageHands: 0,
      label: "Sample quality unavailable",
    };
  }
  const hands = opponents.map((player) => Number(player?.handsSeen) || 0);
  const totalHands = hands.reduce((sum, value) => sum + value, 0);
  const averageHands = totalHands / Math.max(1, hands.length);
  return {
    tier: sampleSizeTier(averageHands),
    averageHands,
    label: sampleQualityLabel(averageHands),
  };
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
  const stable = String(hand?.handKey || "").trim();
  if (stable) return stable;
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

function buildCoachLineItem(text, { auditTarget = "", tone = "watch" } = {}) {
  const value = String(text || "").trim();
  if (!value) return null;
  return {
    text: value,
    auditTarget: String(auditTarget || "").trim(),
    tone: tone === "good" ? "good" : "watch",
  };
}

function normalizeCoachLineItem(
  item,
  { fallbackTone = "watch", fallbackAuditTarget = "" } = {},
) {
  if (typeof item === "string") {
    return buildCoachLineItem(item, {
      tone: fallbackTone,
      auditTarget: fallbackAuditTarget,
    });
  }
  if (!item || typeof item !== "object") return null;
  return buildCoachLineItem(item.text, {
    tone: item.tone || fallbackTone,
    auditTarget: item.auditTarget || fallbackAuditTarget,
  });
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
  const addCandidate = (candidate) => {
    if (!candidate || !Number.isFinite(Number(candidate.severity))) return;
    if (Number(candidate.severity) <= 0) return;
    candidates.push(candidate);
  };
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
  const post = postflopDigest?.findings || {};
  const missedIpCbetRate = Number(post?.missedIpCbetFavorable?.ratePct) || 0;
  const missedIpStabRate = Number(post?.missedIpStabFavorable?.ratePct) || 0;
  const lightIpTurnFoldRate = Number(post?.lightIpFoldTurn?.ratePct) || 0;
  const lightIpRiverFoldRate = Number(post?.lightIpFoldRiver?.ratePct) || 0;
  const missedIpValueRaiseRate = Number(post?.missedIpValueRaise?.ratePct) || 0;

  if (pre.noRaiseBeforeHeroSpots >= 12 && openRate < 28) {
    addCandidate({
      key: "opening_low",
      severity: 28 - openRate,
      family: "preflop_passive",
      label: "Passive first-in aggression",
      evidence: `Open rate in no-raise spots is ${rateCountLabel(
        pre.openedWhenNoRaiseBeforeHero,
        pre.noRaiseBeforeHeroSpots,
      )}.`,
      action:
        "Open more first-in hands from CO/BTN/SB to create steal and c-bet opportunities instead of waiting only for premiums.",
      confidence: confidenceFromSample(pre.noRaiseBeforeHeroSpots),
      auditTarget: "preflop_opportunity",
    });
  }

  if (pre.facingOpenSpots >= 12 && defendRate < 32) {
    addCandidate({
      key: "defending_low",
      severity: 32 - defendRate,
      family: "preflop_passive",
      label: "Passive responses versus opens",
      evidence: `Defend rate facing opens is ${rateCountLabel(
        pre.defendedFacingOpen,
        pre.facingOpenSpots,
      )}.`,
      action:
        "Defend wider with calls and 3-bets in BTN/BB so medium-strength holdings are not auto-folded preflop.",
      confidence: confidenceFromSample(pre.facingOpenSpots),
      auditTarget: "blind_defense",
    });
  }

  if (pre.blindFacingOpenSpots >= 12 && blindFoldRate > 66) {
    addCandidate({
      key: "blind_overfold",
      severity: blindFoldRate - 66,
      family: "preflop_passive",
      label: "Blinds are folding too often versus opens",
      evidence: `Blind fold vs open is ${rateCountLabel(
        pre.blindFoldFacingOpen,
        pre.blindFacingOpenSpots,
      )}.`,
      action:
        "Widen BB defend first, then add SB call and 3-bet continues versus late opens with connected and blocker-heavy hands.",
      confidence: confidenceFromSample(pre.blindFacingOpenSpots),
      auditTarget: "blind_defense",
    });
  }

  if (pre.facedReraiseAfterAggressionSpots >= 8 && reraiseFoldRate > 78) {
    addCandidate({
      key: "fold_to_reraise_high",
      severity: reraiseFoldRate - 78,
      family: "preflop_resilience",
      label: "Aggressive lines are too fold-heavy versus 3-bets",
      evidence: `Fold after reraises is ${rateCountLabel(
        pre.foldedAfterFacingReraise,
        pre.facedReraiseAfterAggressionSpots,
      )}.`,
      action:
        "Protect open and 3-bet ranges with clearer continue plans so pressure does not force immediate folds.",
      confidence: confidenceFromSample(pre.facedReraiseAfterAggressionSpots),
      auditTarget: "preflop_opportunity",
    });
  }

  const cbetOpp = Number(post?.missedIpCbetFavorable?.opportunities) || 0;
  const stabOpp = Number(post?.missedIpStabFavorable?.opportunities) || 0;
  const turnFoldOpp = Number(post?.lightIpFoldTurn?.opportunities) || 0;
  const riverFoldOpp = Number(post?.lightIpFoldRiver?.opportunities) || 0;
  const valueRaiseOpp = Number(post?.missedIpValueRaise?.opportunities) || 0;

  if (
    (cbetOpp >= 8 && missedIpCbetRate > 30) ||
    (stabOpp >= 8 && missedIpStabRate > 30)
  ) {
    addCandidate({
      key: "underbluff_ip",
      severity: Math.max(missedIpCbetRate - 30, missedIpStabRate - 30),
      family: "postflop_aggression",
      label: "Underbluffing in favorable in-position flops",
      evidence: `Missed IP c-bet/stab rates are ${rateCountLabel(
        Number(post?.missedIpCbetFavorable?.count) || 0,
        cbetOpp,
      )} and ${rateCountLabel(
        Number(post?.missedIpStabFavorable?.count) || 0,
        stabOpp,
      )}.`,
      action:
        "When checked to on favorable flops, add more one-third-pot c-bets and stabs with backdoors and overcards.",
      confidence: confidenceFromSample(Math.max(cbetOpp, stabOpp)),
      auditTarget: "postflop_ip",
    });
  }

  if (
    (turnFoldOpp >= 8 && lightIpTurnFoldRate > 18) ||
    (riverFoldOpp >= 8 && lightIpRiverFoldRate > 16)
  ) {
    addCandidate({
      key: "bluffcatch_overfold",
      severity: Math.max(lightIpTurnFoldRate - 18, lightIpRiverFoldRate - 16),
      family: "postflop_bluffcatch",
      label: "Overfolding bluff-catchers on later streets",
      evidence: `Likely light folds in position are ${rateCountLabel(
        Number(post?.lightIpFoldTurn?.count) || 0,
        turnFoldOpp,
      )} on turn and ${rateCountLabel(
        Number(post?.lightIpFoldRiver?.count) || 0,
        riverFoldOpp,
      )} on river.`,
      action:
        "Keep more bluff-catch calls by prioritizing blocker effects and missed-draw runouts instead of default-folding late streets.",
      confidence: confidenceFromSample(Math.max(turnFoldOpp, riverFoldOpp)),
      auditTarget: "postflop_ip",
    });
  }

  if (valueRaiseOpp >= 6 && missedIpValueRaiseRate > 25) {
    addCandidate({
      key: "value_raise_missed",
      severity: missedIpValueRaiseRate - 25,
      family: "postflop_value",
      label: "Passive value extraction on turn/river",
      evidence: `Missed in-position value-raises are ${rateCountLabel(
        Number(post?.missedIpValueRaise?.count) || 0,
        valueRaiseOpp,
      )}.`,
      action:
        "Raise more strong top-pair-plus hands versus turn/river bets when ranges are capped or draw-heavy.",
      confidence: confidenceFromSample(valueRaiseOpp),
      auditTarget: "postflop_ip",
    });
  }

  if (
    Number(summary?.enteredHands) >= 15 &&
    Number(summary?.postflopNoShowdownPct) <= 8
  ) {
    addCandidate({
      key: "passive_no_showdown",
      severity: 8 - Number(summary?.postflopNoShowdownPct),
      family: "postflop_aggression",
      label: "Too few pots won without showdown",
      evidence: `Postflop no-showdown win rate is ${percentLabel(
        Number(summary?.postflopNoShowdownPct) || 0,
      )}.`,
      action:
        "Find extra pressure lines in position on favorable boards so opponents fold more before showdown.",
      confidence: confidenceFromSample(Number(summary?.enteredHands)),
      auditTarget: "postflop_ip",
    });
  }

  const sortedCandidates = [...candidates].sort((a, b) => b.severity - a.severity);
  const primary = sortedCandidates[0] || null;
  const secondary =
    sortedCandidates.find(
      (candidate, idx) =>
        idx > 0 && String(candidate.family) !== String(primary?.family),
    ) ||
    sortedCandidates[1] ||
    null;

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

  const metricRows = [
    {
      key: "open_first_in",
      label: "Open first-in",
      count: Number(pre.openedWhenNoRaiseBeforeHero) || 0,
      sample: Number(pre.noRaiseBeforeHeroSpots) || 0,
      signal: openSignal,
      severity:
        pre.noRaiseBeforeHeroSpots < 8 ? 0.2 : Math.max(0, 28 - openRate),
      auditTarget: "preflop_opportunity",
    },
    {
      key: "defend_vs_open",
      label: "Defend vs open",
      count: Number(pre.defendedFacingOpen) || 0,
      sample: Number(pre.facingOpenSpots) || 0,
      signal: defendSignal,
      severity: pre.facingOpenSpots < 8 ? 0.2 : Math.max(0, 32 - defendRate),
      auditTarget: "blind_defense",
    },
    {
      key: "blind_fold_vs_open",
      label: "Blind fold vs open",
      count: Number(pre.blindFoldFacingOpen) || 0,
      sample: Number(pre.blindFacingOpenSpots) || 0,
      signal: blindFoldSignal,
      severity:
        pre.blindFacingOpenSpots < 8 ? 0.2 : Math.max(0, blindFoldRate - 66),
      auditTarget: "blind_defense",
    },
    {
      key: "fold_after_reraise",
      label: "Fold after reraise",
      count: Number(pre.foldedAfterFacingReraise) || 0,
      sample: Number(pre.facedReraiseAfterAggressionSpots) || 0,
      signal: reraiseSignal,
      severity:
        pre.facedReraiseAfterAggressionSpots < 8
          ? 0.2
          : Math.max(0, reraiseFoldRate - 78),
      auditTarget: "preflop_opportunity",
    },
    {
      key: "missed_ip_cbet",
      label: "Missed IP c-bet (favorable flop)",
      count: Number(post?.missedIpCbetFavorable?.count) || 0,
      sample: cbetOpp,
      signal:
        cbetOpp < 8 ? "low sample" : missedIpCbetRate > 30 ? "too high" : "ok",
      severity: cbetOpp < 8 ? 0.1 : Math.max(0, missedIpCbetRate - 30),
      auditTarget: "postflop_ip",
    },
    {
      key: "missed_ip_stab",
      label: "Missed IP stab (favorable flop)",
      count: Number(post?.missedIpStabFavorable?.count) || 0,
      sample: stabOpp,
      signal:
        stabOpp < 8 ? "low sample" : missedIpStabRate > 30 ? "too high" : "ok",
      severity: stabOpp < 8 ? 0.1 : Math.max(0, missedIpStabRate - 30),
      auditTarget: "postflop_ip",
    },
    {
      key: "light_fold_turn",
      label: "Likely light IP turn folds",
      count: Number(post?.lightIpFoldTurn?.count) || 0,
      sample: turnFoldOpp,
      signal:
        turnFoldOpp < 8
          ? "low sample"
          : lightIpTurnFoldRate > 18
            ? "too high"
            : "ok",
      severity: turnFoldOpp < 8 ? 0.1 : Math.max(0, lightIpTurnFoldRate - 18),
      auditTarget: "postflop_ip",
    },
    {
      key: "light_fold_river",
      label: "Likely light IP river folds",
      count: Number(post?.lightIpFoldRiver?.count) || 0,
      sample: riverFoldOpp,
      signal:
        riverFoldOpp < 8
          ? "low sample"
          : lightIpRiverFoldRate > 16
            ? "too high"
            : "ok",
      severity: riverFoldOpp < 8 ? 0.1 : Math.max(0, lightIpRiverFoldRate - 16),
      auditTarget: "postflop_ip",
    },
  ].filter((row) => row.sample > 0);

  const evidenceItems = metricRows
    .sort((a, b) => b.severity - a.severity || b.sample - a.sample)
    .slice(0, 5)
    .map((row) =>
      buildCoachLineItem(
        `${row.label}: ${rateCountLabel(row.count, row.sample)} - ${row.signal}`,
        {
          auditTarget: row.auditTarget,
          tone: row.signal === "ok" ? "good" : "watch",
        },
      ),
    )
    .filter(Boolean);

  const actionItems = [];
  if (primary?.action) {
    actionItems.push(
      buildCoachLineItem(primary.action, {
        auditTarget: primary.auditTarget,
        tone: "good",
      }),
    );
  }
  if (secondary?.action) {
    actionItems.push(
      buildCoachLineItem(secondary.action, {
        auditTarget: secondary.auditTarget,
        tone: "good",
      }),
    );
  }
  const supportingAction = sortedCandidates.find(
    (candidate) =>
      candidate &&
      candidate.key !== primary?.key &&
      candidate.key !== secondary?.key &&
      candidate.action,
  );
  if (supportingAction) {
    actionItems.push(
      buildCoachLineItem(supportingAction.action, {
        auditTarget: supportingAction.auditTarget,
        tone: "good",
      }),
    );
  }
  if (actionItems.length === 0) {
    actionItems.push(
      buildCoachLineItem(
        "No dominant leak signal yet. Keep collecting hands and focus on your largest opportunity buckets.",
        {
          auditTarget: "preflop_opportunity",
          tone: "good",
        },
      ),
    );
  }

  const strongestCandidates = [];
  if (pre.noRaiseBeforeHeroSpots >= 12 && openRate >= 28) {
    strongestCandidates.push("First-in opening discipline");
  }
  if (pre.facingOpenSpots >= 12 && defendRate >= 32) {
    strongestCandidates.push("Facing-open defense coverage");
  }
  if (pre.blindFacingOpenSpots >= 12 && blindFoldRate <= 66) {
    strongestCandidates.push("Blind defense frequency");
  }
  if (
    pre.facedReraiseAfterAggressionSpots >= 8 &&
    reraiseFoldRate > 0 &&
    reraiseFoldRate <= 78
  ) {
    strongestCandidates.push("Response stability versus reraises");
  }

  return {
    rating,
    primaryLeak:
      primary?.label || "No single dominant leak identified in current sample",
    secondaryLeak: secondary?.label || null,
    primaryLeakItem: buildCoachLineItem(
      primary?.label || "No single dominant leak identified in current sample",
      {
        auditTarget: primary?.auditTarget || "",
        tone: "watch",
      },
    ),
    secondaryLeakItem: secondary?.label
      ? buildCoachLineItem(secondary.label, {
          auditTarget: secondary.auditTarget || "",
          tone: "watch",
        })
      : null,
    strongestArea:
      strongestCandidates[0] || "No clear strength signal yet in this sample",
    evidence: evidenceItems.map((item) => item.text),
    evidenceItems,
    actions: actionItems.map((item) => item.text),
    actionItems,
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
    items
      .slice(0, limit)
      .map((line) => ensureSentenceEnding(sanitizeCoachingCopy(line)))
      .filter(Boolean)
      .join(" ");
  const primaryLeak = sanitizeCoachingCopy(review.primary_leak);
  const secondaryLeak = sanitizeCoachingCopy(review.secondary_leak);
  const actions = normalizeInsightLines(review.actions, 8).map(
    sanitizeCoachingCopy,
  );
  const warnings = normalizeInsightLines(review.warnings, 8).map(
    sanitizeCoachingCopy,
  );
  const actionSnippet = joinSentences(actions, 3);
  const warningSnippet = joinSentences(warnings, 2);

  const parts = [];
  if (primaryLeak) {
    parts.push(`Main improvement area: ${ensureSentenceEnding(primaryLeak)}`);
  }
  if (secondaryLeak && !/no secondary leak flagged/i.test(secondaryLeak)) {
    parts.push(`Secondary focus: ${ensureSentenceEnding(secondaryLeak)}`);
  }
  if (actionSnippet) {
    parts.push(`Suggested adjustments: ${actionSnippet}`);
  }
  if (warningSnippet) {
    parts.push(`Context notes: ${warningSnippet}`);
  }
  return parts.join(" ");
}

function buildTableHintParagraph(review) {
  if (!review || typeof review !== "object") return "";
  const plan = sanitizeCoachingCopy(review.table_plan);
  const exploits = normalizeInsightLines(review.priority_exploits, 8)
    .slice(0, 2)
    .map((line) => ensureSentenceEnding(sanitizeCoachingCopy(line)))
    .join(" ");
  const adjustments = normalizeInsightLines(review.next_hour_adjustments, 8)
    .slice(0, 2)
    .map((line) => ensureSentenceEnding(sanitizeCoachingCopy(line)))
    .join(" ");
  const confidence = String(review.confidence || "")
    .trim()
    .toLowerCase();

  const parts = [];
  if (plan) parts.push(ensureSentenceEnding(plan));
  if (exploits) parts.push(`Observed tendencies: ${exploits}`);
  if (adjustments) parts.push(`Practical adjustments: ${adjustments}`);
  if (confidence && ["low", "medium", "high"].includes(confidence)) {
    parts.push(`Confidence: ${confidence}.`);
  }
  return parts.join(" ");
}

const HAND_SORT_OPTIONS = [
  { code: "most_recent", label: "Most recent (default)" },
  { code: "biggest_win", label: "Biggest Win" },
  { code: "biggest_loss", label: "Biggest Loss" },
  { code: "seat_coming_soon", label: "Seat (coming soon)", disabled: true },
];
const MAX_HANDS_PER_AI_REVIEW = 10;
const ANALYZE_LIMIT_HINT_MIN_SELECTION = 5;
const OUTCOME_FILTER_WON_WITHOUT_SHOWDOWN_ANY = "won_without_showdown_any";

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
  if (Number.isFinite(direct) && direct >= MIN_VALID_TOURNAMENT_EPOCH) {
    return direct;
  }
  const parsed = parsePlayedAtEpoch(String(hand?.playedAt || ""));
  return Number.isFinite(parsed) && parsed >= MIN_VALID_TOURNAMENT_EPOCH
    ? parsed
    : null;
}

function isValidTournamentEpoch(epoch) {
  const numeric = Number(epoch);
  return Number.isFinite(numeric) && numeric >= MIN_VALID_TOURNAMENT_EPOCH;
}

function isWonWithoutShowdownOutcome(hand) {
  const code = String(hand?.heroOutcome?.code || "")
    .trim()
    .toLowerCase();
  const label = String(hand?.heroOutcome?.label || "")
    .trim()
    .toLowerCase();
  return (
    code.startsWith("won_without_showdown") ||
    label.includes("won without showdown")
  );
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
      playedAtEpoch: isValidTournamentEpoch(playedAtEpoch)
        ? playedAtEpoch
        : null,
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
  const target = String(position || "")
    .trim()
    .toUpperCase();
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
  const code = String(handCode || "")
    .trim()
    .toUpperCase();
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
  const gap =
    Number.isFinite(v1) && Number.isFinite(v2) ? Math.abs(v1 - v2) : null;
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
  const seat = seats.find(
    (row) => String(row?.player || "").trim() === aggressor,
  );
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
  let nonOpenBlindPressureSpots = 0;

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

    const priorAggressiveActions = preflopActions
      .slice(0, firstHeroDecisionIndex)
      .filter(
        (action) =>
          String(action?.player || "").trim() !== heroName &&
          isPreflopAggressiveAction(action),
      );
    if (priorAggressiveActions.length === 0) continue;

    const firstAggressiveType = normalizeActionType(priorAggressiveActions[0]);
    const hasReraiseBeforeHero = priorAggressiveActions.length > 1;
    const hasJamBeforeHero = priorAggressiveActions.some(
      (action) => normalizeActionType(action) === "jam",
    );
    const facingSingleOpenOnly =
      firstAggressiveType === "raise" &&
      !hasReraiseBeforeHero &&
      !hasJamBeforeHero;

    if (!facingSingleOpenOnly) {
      nonOpenBlindPressureSpots += 1;
      continue;
    }

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

    const aggressor = resolvePreflopAggressorBeforeHero(
      hand,
      firstHeroDecisionIndex,
    );
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
    quickFixes.push("No dominant blind-defense leak in current sample.");
  }

  const confidence = confidenceFromSample(totalBlindDefenseSpots);
  const warnings = [];
  if (totalBlindDefenseSpots < 12) {
    warnings.push(
      "Blind-defense sample is small; treat findings as low confidence.",
    );
  }
  if (nonOpenBlindPressureSpots > 0) {
    warnings.push(
      `${nonOpenBlindPressureSpots} blind spots faced 3-bet/jam pressure before hero and were excluded from open-defense chart counts.`,
    );
  }
  warnings.push(
    "Baseline uses chart heuristics; exploit adjustments can override specific spots.",
  );

  return {
    totalBlindDefenseSpots,
    sbDefenseSpots,
    bbDefenseSpots,
    likelyContinueSpots,
    unknownCardsSpots,
    nonOpenBlindPressureSpots,
    confidence,
    issueCounts,
    handClassRows: categoryRows,
    missedContinues: {
      count: missedContinueEvents.length,
      ...missedSummary,
    },
    blindFolds: {
      count: blindFoldEvents.length,
      shouldDefendCount: blindFoldEvents.filter(
        (event) => event.chartShouldDefend,
      ).length,
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
    Number.isFinite(Number(options?.recentLimit)) &&
    Number(options.recentLimit) > 0
      ? Math.floor(Number(options.recentLimit))
      : 40;
  const levelThreshold =
    Number.isFinite(Number(options?.levelThreshold)) &&
    Number(options.levelThreshold) > 0
      ? Math.floor(Number(options.levelThreshold))
      : 25;
  const sortedRecentHands = list
    .sort(
      (a, b) =>
        (Number(getHandPlayedAtEpoch(b)) || 0) -
        (Number(getHandPlayedAtEpoch(a)) || 0),
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

    const position =
      normalizePositionForRanges(hand?.heroPosition) || "Unknown";
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
        Number.isFinite(Number(sbStack)) &&
        Number.isFinite(bigBlind) &&
        bigBlind > 0
          ? Number(sbStack) / bigBlind
          : null;
      const bbStackBb =
        Number.isFinite(Number(bbStack)) &&
        Number.isFinite(bigBlind) &&
        bigBlind > 0
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
          recommendation:
            "Open or jam more often in this late-position ICM pressure spot.",
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
          recommendation:
            "Tighten opens/jams with short stacks at high levels.",
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
          recommendation:
            "Prefer jam-or-fold decisions over passive calls with short stacks.",
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
          recommendation:
            "Tighten call-offs versus all-ins in high-level ICM spots.",
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
          recommendation:
            "Continue more often versus jams with this hand class.",
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
  if (
    topIssue === "too_tight_icm_defend" ||
    topIssue === "too_tight_jam_fold_icm"
  ) {
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
    stackBbSamples > 0
      ? Number((stackBbTotal / stackBbSamples).toFixed(1))
      : null;
  const summary = summarizeAuditEvents(flaggedEvents);
  const blindFoldSummary = summarizeAuditEvents(blindFoldEvents);
  const blindFoldShouldDefendCount = blindFoldEvents.filter((row) =>
    Boolean(row?.chartShouldDefend),
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

function sortPerformanceSnapshots(snapshots) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .filter((snapshot) => snapshot && typeof snapshot === "object")
    .sort((a, b) => {
      const aDate = new Date(a.tournamentPlayedAt || a.createdAt || 0).getTime();
      const bDate = new Date(b.tournamentPlayedAt || b.createdAt || 0).getTime();
      if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
        return aDate - bDate;
      }
      return String(a.tournamentId || "").localeCompare(
        String(b.tournamentId || ""),
      );
    });
}

export default function HandReviewPanel({ entitlements = null }) {
  const showDeveloperQa = isDeveloperQaAccount(entitlements);
  const [heroName, setHeroName] = useState("Hero");
  const [historyText, setHistoryText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [handLimit, setHandLimit] = useState(200);
  const [preflopHandSet, setPreflopHandSet] = useState("all_hands");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [handSortBy, setHandSortBy] = useState("most_recent");
  const [sourceFileName, setSourceFileName] = useState("");
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [quickReviewHandKey, setQuickReviewHandKey] = useState("");
  const [loadingSummaryReview, setLoadingSummaryReview] = useState(false);
  const [loadingBlindDefenseReview, setLoadingBlindDefenseReview] =
    useState(false);
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
  const [performanceSnapshots, setPerformanceSnapshots] = useState([]);
  const [loadingPerformanceSnapshots, setLoadingPerformanceSnapshots] =
    useState(false);
  const [performanceSnapshotsError, setPerformanceSnapshotsError] =
    useState("");
  const [performanceSaveStatusByTournamentId, setPerformanceSaveStatusByTournamentId] =
    useState({});
  const [savingPerformanceTournamentId, setSavingPerformanceTournamentId] =
    useState("");
  const [removingPerformanceTournamentId, setRemovingPerformanceTournamentId] =
    useState("");
  const [currentTournamentUploadSaved, setCurrentTournamentUploadSaved] =
    useState(false);
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
  const [deletingSavedTournamentId, setDeletingSavedTournamentId] =
    useState("");
  const [parseResult, setParseResult] = useState(null);
  const [reviewsByHandKey, setReviewsByHandKey] = useState({});
  const [expandedReviewLogicKeys, setExpandedReviewLogicKeys] = useState(
    () => new Set(),
  );
  const [summaryReview, setSummaryReview] = useState(null);
  const [blindDefenseReview, setBlindDefenseReview] = useState(null);
  const [icmReview, setIcmReview] = useState(null);
  const [tableHintReview, setTableHintReview] = useState(null);
  const [reviewProgressPct, setReviewProgressPct] = useState(0);
  const [selectedHandKeys, setSelectedHandKeys] = useState(() => new Set());
  const [selectedAuditHandKey, setSelectedAuditHandKey] = useState("");
  const [pendingAuditScrollKey, setPendingAuditScrollKey] = useState("");
  const [pendingAuditSectionKey, setPendingAuditSectionKey] = useState("");
  const [insightsTab, setInsightsTab] = useState("tournament");
  const [opponentFilter, setOpponentFilter] = useState("current_table");
  const [copiedOpponentKey, setCopiedOpponentKey] = useState("");
  const [isParserCollapsed, setIsParserCollapsed] = useState(false);
  const [isParserConfigOpen, setIsParserConfigOpen] = useState(false);
  const [uploadHelpModalOpen, setUploadHelpModalOpen] = useState(false);
  const [activeV2ReviewHandKey, setActiveV2ReviewHandKey] = useState("");
  const [cashNoticeDismissed, setCashNoticeDismissed] = useState(() =>
    readCashNoticeDismissed(),
  );
  const copyTimeoutRef = useRef(null);
  const reviewProgressIntervalRef = useRef(null);
  const handRowRefs = useRef(new Map());
  const auditSectionRefs = useRef(new Map());

  const stopReviewProgress = () => {
    if (reviewProgressIntervalRef.current) {
      clearInterval(reviewProgressIntervalRef.current);
      reviewProgressIntervalRef.current = null;
    }
  };

  const startReviewProgress = (handCount) => {
    stopReviewProgress();
    setReviewProgressPct(1);
    const perHandEstimateMs = 3_000;
    const expectedMs = Math.min(
      90_000,
      Math.max(12_000, (Number(handCount) || 1) * perHandEstimateMs),
    );
    const tickMs = 250;
    const maxWhilePending = 96;
    const steps = Math.max(1, Math.floor(expectedMs / tickMs));
    const increment = (maxWhilePending - 1) / steps;

    reviewProgressIntervalRef.current = setInterval(() => {
      setReviewProgressPct((previous) => {
        if (previous >= maxWhilePending) return previous;
        return Math.min(maxWhilePending, previous + increment);
      });
    }, tickMs);
  };

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

  const loadPerformanceSnapshots = async () => {
    setLoadingPerformanceSnapshots(true);
    setPerformanceSnapshotsError("");
    try {
      const res = await requestTournamentPerformanceSnapshots();
      setPerformanceSnapshots(
        sortPerformanceSnapshots(
          Array.isArray(res?.snapshots) ? res.snapshots : [],
        ),
      );
    } catch (error) {
      setPerformanceSnapshotsError(
        error?.message || "Failed to load performance trend.",
      );
      setPerformanceSnapshots([]);
    } finally {
      setLoadingPerformanceSnapshots(false);
    }
  };

  useEffect(() => {
    loadPerformanceSnapshots();
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
  const gameTypeCounts = useMemo(() => {
    let cash = 0;
    let tournament = 0;
    let unknown = 0;
    for (const hand of parsedHands) {
      const type = String(hand?.gameType || "")
        .trim()
        .toLowerCase();
      if (type === "cash") {
        cash += 1;
      } else if (type === "tournament") {
        tournament += 1;
      } else {
        unknown += 1;
      }
    }
    return { cash, tournament, unknown };
  }, [parsedHands]);
  const shouldShowCashFormatNotice =
    parsedHands.length > 0 &&
    gameTypeCounts.cash > 0 &&
    !cashNoticeDismissed;
  const cashFormatNoticeText =
    gameTypeCounts.tournament > 0
      ? `This parse includes cash hands (${gameTypeCounts.cash}/${parsedHands.length}). Tournament summary metrics may not fully apply. Cash-specific analysis is coming soon.`
      : "This hand set is cash-game. Current summary metrics are tuned for tournament play and may not fully apply. Cash-specific analysis is coming soon.";
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
    let hasWonWithoutShowdown = false;
    for (const hand of parsedHands) {
      const code = String(hand?.heroOutcome?.code || "").trim();
      const label = String(hand?.heroOutcome?.label || "").trim();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, label || code);
      }
      if (isWonWithoutShowdownOutcome(hand)) {
        hasWonWithoutShowdown = true;
      }
    }
    const options = Array.from(byCode.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (!hasWonWithoutShowdown) return options;

    const anyWonNoShowdownOption = {
      code: OUTCOME_FILTER_WON_WITHOUT_SHOWDOWN_ANY,
      label: "Won without showdown",
    };
    const alreadyPresent = options.some(
      (option) => option.code === OUTCOME_FILTER_WON_WITHOUT_SHOWDOWN_ANY,
    );
    if (alreadyPresent) return options;

    const wonAtShowdownIndex = options.findIndex((option) => {
      const code = String(option?.code || "").trim().toLowerCase();
      const label = String(option?.label || "").trim().toLowerCase();
      return code === "won_showdown" || label === "won at showdown";
    });
    if (wonAtShowdownIndex === -1) {
      return [anyWonNoShowdownOption, ...options];
    }
    const next = options.slice();
    next.splice(wonAtShowdownIndex + 1, 0, anyWonNoShowdownOption);
    return next;
  }, [parsedHands]);
  const filteredParsedHands = useMemo(() => {
    const filtered = parsedHands.filter((hand) => {
      if (outcomeFilter === "all") return true;
      if (outcomeFilter === OUTCOME_FILTER_WON_WITHOUT_SHOWDOWN_ANY) {
        return isWonWithoutShowdownOutcome(hand);
      }
      return String(hand?.heroOutcome?.code || "") === outcomeFilter;
    });

    const withSortMeta = filtered.map((hand) => {
      const playedAtEpoch = Number(getHandPlayedAtEpoch(hand));
      const bbResult = resolveHandBbResult(hand);
      return {
        hand,
        playedAtEpoch: Number.isFinite(playedAtEpoch) ? playedAtEpoch : 0,
        bbValue: Number.isFinite(bbResult?.bb) ? Number(bbResult.bb) : 0,
      };
    });

    withSortMeta.sort((a, b) => {
      if (handSortBy === "biggest_win") {
        if (b.bbValue !== a.bbValue) return b.bbValue - a.bbValue;
      } else if (handSortBy === "biggest_loss") {
        if (a.bbValue !== b.bbValue) return a.bbValue - b.bbValue;
      }
      if (b.playedAtEpoch !== a.playedAtEpoch) {
        return b.playedAtEpoch - a.playedAtEpoch;
      }
      return String(a.hand?.handId || "").localeCompare(String(b.hand?.handId || ""));
    });

    return withSortMeta.map((entry) => entry.hand);
  }, [parsedHands, outcomeFilter, handSortBy]);
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
  const selectedUnreviewedHands = selectedHands.filter((hand) => {
    const key = handKey(hand);
    return !reviewsByHandKey[key];
  });
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
    const playedAtEpoch = isValidTournamentEpoch(fileMeta.playedAtEpoch)
      ? Number(fileMeta.playedAtEpoch)
      : parsedTournamentPlayedAtEpoch;
    return {
      tournamentId,
      tournamentName,
      playedAtEpoch: isValidTournamentEpoch(playedAtEpoch)
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
  const selectedUnreviewedCount = selectedUnreviewedHands.length;
  const selectedAlreadyReviewedCount = Math.max(
    0,
    selectedCount - selectedUnreviewedCount,
  );
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
  const postflopIpHighlightItems = useMemo(() => {
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

    return candidates.map((row) =>
      buildCoachLineItem(
        `${row.label}: ${rateCountLabel(row.count, row.opportunities)}.`,
        {
          auditTarget: "postflop_ip",
          tone: "watch",
        },
      ),
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
        [
          ...(tableHintReview?.avoid_traps || []),
          ...(tableHintReview?.sample_warnings || []),
        ],
        7,
      ),
    [tableHintReview],
  );
  const tournamentCoachSummary = useMemo(
    () => buildTournamentCoachSummary(tournamentSummary, postflopIpAuditDigest),
    [tournamentSummary, postflopIpAuditDigest],
  );
  const coachPrimaryLeakItem = useMemo(() => {
    return normalizeCoachLineItem(tournamentCoachSummary?.primaryLeakItem, {
      fallbackTone: "watch",
    });
  }, [tournamentCoachSummary]);
  const coachSecondaryLeakItem = useMemo(() => {
    return normalizeCoachLineItem(tournamentCoachSummary?.secondaryLeakItem, {
      fallbackTone: "watch",
    });
  }, [tournamentCoachSummary]);
  const coachPrimaryAdjustmentItem = useMemo(() => {
    if (!Array.isArray(tournamentCoachSummary?.actionItems)) return null;
    return (
      tournamentCoachSummary.actionItems
        .map((item) =>
          normalizeCoachLineItem(item, {
            fallbackTone: "good",
          }),
        )
        .find(Boolean) || null
    );
  }, [tournamentCoachSummary]);
  const coachSecondaryAdjustments = useMemo(() => {
    if (!Array.isArray(tournamentCoachSummary?.actionItems)) return [];
    return tournamentCoachSummary.actionItems
      .slice(1, 4)
      .map((item) =>
        normalizeCoachLineItem(item, {
          fallbackTone: "good",
        }),
      )
      .filter(Boolean);
  }, [tournamentCoachSummary]);
  const coachSupportingEvidence = useMemo(() => {
    if (!Array.isArray(tournamentCoachSummary?.evidenceItems)) return [];
    return tournamentCoachSummary.evidenceItems
      .slice(0, 5)
      .map((item) =>
        normalizeCoachLineItem(item, {
          fallbackTone: "watch",
        }),
      )
      .filter(Boolean);
  }, [tournamentCoachSummary]);
  const coachStrongestArea = useMemo(() => {
    return String(tournamentCoachSummary?.strongestArea || "").trim();
  }, [tournamentCoachSummary]);
  const savedPerformanceTournamentIds = useMemo(() => {
    return new Set(
      performanceSnapshots
        .map((snapshot) => String(snapshot?.tournamentId || "").trim())
        .filter(Boolean),
    );
  }, [performanceSnapshots]);
  const currentPerformanceTournamentId = String(
    suggestedTournamentMeta.tournamentId || "",
  ).trim();
  const currentPerformanceScore10 = Number(
    tournamentCoachSummary?.rating?.score10,
  );
  const currentPerformanceIsPreliminary = Boolean(
    tournamentCoachSummary?.rating?.prelimNote,
  );
  const canSavePerformanceSnapshot = Boolean(
    currentPerformanceTournamentId &&
      Number.isFinite(currentPerformanceScore10) &&
      tournamentCoachSummary?.rating &&
      !currentPerformanceIsPreliminary,
  );
  const currentPerformanceSaveStatus =
    performanceSaveStatusByTournamentId[currentPerformanceTournamentId] || "";
  const currentPerformanceAlreadySaved =
    Boolean(currentPerformanceTournamentId) &&
    (savedPerformanceTournamentIds.has(currentPerformanceTournamentId) ||
      currentPerformanceSaveStatus === "saved" ||
      currentPerformanceSaveStatus === "duplicate");
  const currentPerformancePayload = useMemo(() => {
    if (!canSavePerformanceSnapshot) return null;
    const playedAtEpoch = Number(suggestedTournamentMeta.playedAtEpoch);
    const scorePct = Number(tournamentCoachSummary?.rating?.scorePct);
    return {
      tournamentId: currentPerformanceTournamentId,
      tournamentName:
        String(suggestedTournamentMeta.tournamentName || "").trim() ||
        `Tournament ${currentPerformanceTournamentId}`,
      tournamentPlayedAt: isValidTournamentEpoch(playedAtEpoch)
        ? new Date(playedAtEpoch).toISOString()
        : null,
      score10: Number(currentPerformanceScore10.toFixed(1)),
      scorePct: Number.isFinite(scorePct) ? Number(scorePct.toFixed(1)) : null,
      sampleHands: Number(tournamentSummary?.sampleHands) || null,
      totalHands: Number(tournamentSummary?.totalHands) || null,
      sourceUploadSaved: Boolean(currentTournamentUploadSaved),
      metadata: {
        biggestImprovement: sanitizeCoachingCopy(
          coachPrimaryLeakItem?.text || tournamentCoachSummary?.primaryLeak || "",
        ),
        mostProfitableAdjustment: sanitizeCoachingCopy(
          coachPrimaryAdjustmentItem?.text || "",
        ),
        strongestArea: sanitizeCoachingCopy(coachStrongestArea),
      },
    };
  }, [
    canSavePerformanceSnapshot,
    coachPrimaryAdjustmentItem,
    coachPrimaryLeakItem,
    coachStrongestArea,
    currentPerformanceScore10,
    currentPerformanceTournamentId,
    currentTournamentUploadSaved,
    currentPerformanceIsPreliminary,
    suggestedTournamentMeta.playedAtEpoch,
    suggestedTournamentMeta.tournamentName,
    tournamentCoachSummary?.primaryLeak,
    tournamentCoachSummary?.rating?.scorePct,
    tournamentSummary?.sampleHands,
    tournamentSummary?.totalHands,
  ]);
  const performanceSaveButtonLabel = savingPerformanceTournamentId
    ? "Saving..."
    : currentPerformanceIsPreliminary
      ? "Performance locked"
    : currentPerformanceSaveStatus === "duplicate"
      ? "Already saved"
      : currentPerformanceAlreadySaved
        ? "Saved to Performance"
        : "Save to Performance";
  const aiPrimaryAction = useMemo(
    () => aiSummaryActions.find(Boolean) || "",
    [aiSummaryActions],
  );
  const aiSecondaryActions = useMemo(
    () => aiSummaryActions.filter(Boolean).slice(1, 4),
    [aiSummaryActions],
  );
  const tableHintConfidence = useMemo(
    () => normalizeReviewConfidence(tableHintReview?.confidence),
    [tableHintReview],
  );
  const tableHintSampleSummary = useMemo(
    () => summarizeOpponentSampleQuality(visibleOpponentPlayers),
    [visibleOpponentPlayers],
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
    if (
      !blindDefenseAudit ||
      Number(blindDefenseAudit.totalBlindDefenseSpots) <= 0
    ) {
      return null;
    }
    return {
      ...blindDefenseAudit,
      handClassRows: Array.isArray(blindDefenseAudit.handClassRows)
        ? blindDefenseAudit.handClassRows
        : [],
      missedContinues: {
        count: Number(blindDefenseAudit?.missedContinues?.count) || 0,
        byPosition: Array.isArray(
          blindDefenseAudit?.missedContinues?.byPosition,
        )
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
        topCombos: Array.isArray(
          blindDefenseAudit?.missedSb3BetPressure?.topCombos,
        )
          ? blindDefenseAudit.missedSb3BetPressure.topCombos
          : [],
        examples: Array.isArray(
          blindDefenseAudit?.missedSb3BetPressure?.examples,
        )
          ? blindDefenseAudit.missedSb3BetPressure.examples
          : [],
      },
      blindFolds: {
        count: Number(blindDefenseAudit?.blindFolds?.count) || 0,
        shouldDefendCount:
          Number(blindDefenseAudit?.blindFolds?.shouldDefendCount) || 0,
      },
    };
  }, [blindDefenseAudit]);
  const hasCurrentTableSelection =
    opponentFilter === "current_table" && visibleOpponentPlayers.length > 0;
  const recentCurrentTableHands = useMemo(() => {
    if (!hasCurrentTableSelection || currentTablePlayerSet.size === 0)
      return [];
    return [...parsedHands]
      .filter((hand) => {
        const seats = Array.isArray(hand?.seats) ? hand.seats : [];
        return seats.some((seat) => {
          const player = String(seat?.player || "").trim();
          return player && currentTablePlayerSet.has(player);
        });
      })
      .sort(
        (a, b) =>
          (Number(getHandPlayedAtEpoch(b)) || 0) -
          (Number(getHandPlayedAtEpoch(a)) || 0),
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
  }, [hasCurrentTableSelection, currentTablePlayerSet, parsedHands]);
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
      stopReviewProgress();
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
    if (
      opponentFilter === "current_table" &&
      visibleOpponentPlayers.length > 0
    ) {
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

  useEffect(() => {
    if (!pendingAuditSectionKey) return;
    if (insightsTab !== "audit") return;
    const section = auditSectionRefs.current.get(pendingAuditSectionKey);
    if (!section) return;
    if (section.tagName === "DETAILS") {
      section.open = true;
    }
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingAuditSectionKey("");
  }, [pendingAuditSectionKey, insightsTab, hasHandAudit]);

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

  const setAuditSectionRef = (sectionKey, node) => {
    const key = String(sectionKey || "").trim();
    if (!key) return;
    if (node) {
      auditSectionRefs.current.set(key, node);
      return;
    }
    auditSectionRefs.current.delete(key);
  };

  const openAuditSection = (sectionKey) => {
    const key = String(sectionKey || "").trim();
    if (!key) return;
    setInsightsTab("audit");
    setPendingAuditSectionKey(key);
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
      setHandSortBy("most_recent");
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
    setHandSortBy("most_recent");
    setSelectedHandKeys(new Set());
    setInsightsTab("tournament");
    setOpponentFilter("current_table");
    setCopiedOpponentKey("");
    setSelectedAuditHandKey("");
    setPendingAuditScrollKey("");
    setQuickReviewHandKey("");
    setActiveV2ReviewHandKey("");
    setPendingTournamentSave(null);
    setCurrentTournamentUploadSaved(false);
  };

  const runParse = async () => {
    if (!canSubmit) return;
    setError("");
    setSaveTournamentError("");
    setSaveTournamentSuccess("");
    setPendingTournamentSave(null);
    setCurrentTournamentUploadSaved(false);
    setLoadingParse(true);
    setQuickReviewHandKey("");
    setActiveV2ReviewHandKey("");
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
      if (!readCashNoticeDismissed()) {
        setCashNoticeDismissed(false);
      }
      if (Array.isArray(res?.hands) && res.hands.length > 0) {
        setIsParserCollapsed(true);
      }
      setOutcomeFilter("all");
      setHandSortBy("most_recent");
      setSelectedHandKeys(new Set());
      setInsightsTab("tournament");
      setOpponentFilter("current_table");
      setCopiedOpponentKey("");
      setSelectedAuditHandKey("");
      setPendingAuditScrollKey("");
      setQuickReviewHandKey("");
      setActiveV2ReviewHandKey("");
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
      const reviewsPayload = {};
      for (const [rawKey, review] of Object.entries(reviewsByHandKey || {})) {
        const key = String(rawKey || "").trim();
        if (!key || !review || typeof review !== "object") continue;
        reviewsPayload[key] = review;
      }
      const payload = {
        historyText,
        heroName: heroName.trim() || "Hero",
        tournamentId: pendingTournamentSave.tournamentId,
        tournamentName:
          String(pendingTournamentSave.tournamentName || "").trim() ||
          undefined,
        reviewsByHandKey:
          Object.keys(reviewsPayload).length > 0 ? reviewsPayload : undefined,
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
      setCurrentTournamentUploadSaved(true);
    } catch (err) {
      setSaveTournamentError(err?.message || "Failed to save tournament.");
    } finally {
      setLoadingTournamentSave(false);
    }
  };

  const savePerformanceSnapshot = async () => {
    if (!canSavePerformanceSnapshot || !currentPerformancePayload) return;
    const tournamentId = currentPerformancePayload.tournamentId;
    if (!tournamentId || savingPerformanceTournamentId) return;
    if (currentPerformanceAlreadySaved) return;

    setSavingPerformanceTournamentId(tournamentId);
    setPerformanceSnapshotsError("");
    setPerformanceSaveStatusByTournamentId((previous) => ({
      ...previous,
      [tournamentId]: "saving",
    }));
    try {
      const res = await requestSaveTournamentPerformanceSnapshot(
        currentPerformancePayload,
      );
      const snapshot = res?.snapshot || null;
      if (snapshot) {
        setPerformanceSnapshots((previous) =>
          sortPerformanceSnapshots([
            ...previous.filter(
              (item) =>
                String(item?.tournamentId || "").trim() !== tournamentId,
            ),
            snapshot,
          ]),
        );
      } else {
        await loadPerformanceSnapshots();
      }
      setPerformanceSaveStatusByTournamentId((previous) => ({
        ...previous,
        [tournamentId]: "saved",
      }));
    } catch (err) {
      if (err?.code === "duplicate_performance_snapshot" || err?.status === 409) {
        setPerformanceSaveStatusByTournamentId((previous) => ({
          ...previous,
          [tournamentId]: "duplicate",
        }));
        await loadPerformanceSnapshots();
      } else {
        setPerformanceSaveStatusByTournamentId((previous) => ({
          ...previous,
          [tournamentId]: "error",
        }));
        setPerformanceSnapshotsError(
          err?.message || "Failed to save performance snapshot.",
        );
      }
    } finally {
      setSavingPerformanceTournamentId("");
    }
  };

  const removePerformanceSnapshot = async (tournamentId) => {
    const id = String(tournamentId || "").trim();
    if (!id || removingPerformanceTournamentId) return;

    setRemovingPerformanceTournamentId(id);
    setPerformanceSnapshotsError("");
    try {
      await requestDeleteTournamentPerformanceSnapshot(id);
      setPerformanceSnapshots((previous) =>
        sortPerformanceSnapshots(
          previous.filter(
            (snapshot) => String(snapshot?.tournamentId || "").trim() !== id,
          ),
        ),
      );
      setPerformanceSaveStatusByTournamentId((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    } catch (err) {
      setPerformanceSnapshotsError(
        err?.message || "Failed to remove performance snapshot.",
      );
    } finally {
      setRemovingPerformanceTournamentId("");
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
      const hydratedReviews =
        tournament.reviewsByHandKey &&
        typeof tournament.reviewsByHandKey === "object"
          ? tournament.reviewsByHandKey
          : {};

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
      setReviewsByHandKey(hydratedReviews);
      setExpandedReviewLogicKeys(new Set());
      setSelectedHandKeys(new Set());
      setOutcomeFilter("all");
      setHandSortBy("most_recent");
      setInsightsTab("tournament");
      setOpponentFilter("current_table");
      setCopiedOpponentKey("");
      setSelectedAuditHandKey("");
      setPendingAuditScrollKey("");
      setPendingTournamentSave(null);
      setCurrentTournamentUploadSaved(true);
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
    if (loadingReview) return;
    if (quickReviewHandKey) return;
    if (selectedCount === 0) {
      setError("Select at least one parsed hand for review.");
      return;
    }
    if (selectedUnreviewedCount === 0) {
      setError(
        "All selected hands are already AI reviewed. Use the per-hand AI review action to re-check a specific hand.",
      );
      return;
    }
    if (selectedUnreviewedCount > MAX_HANDS_PER_AI_REVIEW) {
      setError(
        `You selected ${selectedUnreviewedCount} unreviewed hands. Temporary performance limit: analyze supports up to ${MAX_HANDS_PER_AI_REVIEW} hands at once.`,
      );
      return;
    }
    setError("");
    setShowUpgradePrompt(false);
    setAiAccessErrorCode("");
    setLoadingReview(true);
    startReviewProgress(selectedUnreviewedCount);
    try {
      const reviewPayload = {
        selectedHands: selectedUnreviewedHands,
      };
      if (opponentSnapshot && typeof opponentSnapshot === "object") {
        reviewPayload.opponentSnapshot = opponentSnapshot;
      }
      const res = await requestHandHistoryReview(reviewPayload);
      publishTrialTokenUpdate(res?.summary?.monthlyUsage?.trialRemainingTokens);
      setReviewsByHandKey((previous) => {
        const next = { ...previous };
        for (const item of res?.reviews || []) {
          const key =
            String(item?.handKey || "").trim() || handKey(item?.hand || {});
          if (key) {
            next[key] = item?.review || null;
          }
        }
        return next;
      });
      setShowUpgradePrompt(false);
      setAiAccessErrorCode("");
      setReviewProgressPct(100);
    } catch (err) {
      if (isUpgradeRequiredError(err)) {
        setShowUpgradePrompt(true);
        setAiAccessErrorCode(getErrorCode(err));
        loadBillingStatus();
      }
      setError(err?.message || "Failed to review hands.");
    } finally {
      stopReviewProgress();
      setLoadingReview(false);
      setReviewProgressPct(0);
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
          const key =
            String(item?.handKey || "").trim() || handKey(item?.hand || {});
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
        err?.message || "Failed to review Session Summary with AI.",
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
      setIcmReviewError(err?.message || "Failed to review ICM spots with AI.");
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
      <div className="hand-review-panel hand-review-pane hand-review-pane-left hand-review-panel--utility">
        <div className="hand-review-header">
          <h2>Import Hand History</h2>
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
            <p className="hand-review-parser-intro">
              Upload or paste No limit hold'em hand history to generate session
              and opponent insights.
            </p>

            <div className="hand-review-advanced">
              <button
                type="button"
                className="hand-review-advanced-toggle"
                onClick={() => setIsParserConfigOpen((value) => !value)}
                aria-expanded={isParserConfigOpen}
              >
                {isParserConfigOpen
                  ? "Hide Import Settings"
                  : "Import Settings"}
              </button>
              {isParserConfigOpen ? (
                <div className="hand-review-controls hand-review-controls--config">
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
              ) : null}
            </div>

            <div className="hand-review-inputs">
              <label className="hand-review-file">
                <span className="hand-review-file-label">
                  <span>
                    {sourceFileName || "Import hand history text file"}
                  </span>
                  <button
                    type="button"
                    className="hand-review-help-trigger"
                    onClick={() => setUploadHelpModalOpen(true)}
                    aria-label="How to upload a hand history file"
                    title="How to upload a hand history file"
                  >
                    ?
                  </button>
                </span>
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
                  setHandSortBy("most_recent");
                  setSelectedHandKeys(new Set());
                  setInsightsTab("tournament");
                  setOpponentFilter("current_table");
                  setCopiedOpponentKey("");
                  setSelectedAuditHandKey("");
                  setPendingAuditScrollKey("");
                  setQuickReviewHandKey("");
                  setCurrentTournamentUploadSaved(false);
                }}
                rows={10}
                placeholder="or paste hand history text here"
              />
            </div>

            <div className="hand-review-actions">
              <button
                type="button"
                className="hand-review-action-primary"
                onClick={runParse}
                disabled={!canSubmit || loadingParse}
              >
                {loadingParse ? "Parsing..." : "Parse Hands"}
              </button>
              {parsedHands.length > 0 ? (
                <button
                  type="button"
                  className="hand-review-action-secondary"
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
                  hasActiveSubscription
                    ? openBillingPortal
                    : openUpgradeCheckout
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
                <span className="ai-upgrade-prompt-meta">
                  Checking billing…
                </span>
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
        {shouldShowCashFormatNotice ? (
          <div className="hand-review-cash-notice" role="status">
            <p>{cashFormatNoticeText}</p>
            <div className="hand-review-cash-notice-actions">
              <button
                type="button"
                className="hand-review-cash-notice-dismiss"
                onClick={() => {
                  setCashNoticeDismissed(true);
                  writeCashNoticeDismissed(true);
                }}
              >
                DISMISS
              </button>
            </div>
          </div>
        ) : null}

        {parsedHands.length > 0 ? (
          <div className="hand-review-controls hand-review-controls--filters">
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
              Sort by
              <select
                value={handSortBy}
                onChange={(e) => {
                  setHandSortBy(e.target.value);
                  setSelectedHandKeys(new Set());
                }}
              >
                {HAND_SORT_OPTIONS.map((option) => (
                  <option
                    key={option.code}
                    value={option.code}
                    disabled={Boolean(option.disabled)}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {filteredParsedHands.length > 0 ? (
          <div className="hand-review-selection-tools">
            <button
              type="button"
              className="hand-review-action-quiet"
              onClick={selectAllHands}
            >
              Select all
            </button>
            <button
              type="button"
              className="hand-review-action-quiet"
              onClick={clearSelection}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="hand-review-action-primary"
              onClick={runReview}
              disabled={
                selectedUnreviewedCount === 0 ||
                selectedUnreviewedCount > MAX_HANDS_PER_AI_REVIEW ||
                loadingReview ||
                Boolean(quickReviewHandKey)
              }
            >
              {loadingReview
                ? (() => {
                    const pct = Math.max(
                      1,
                      Math.min(100, Math.round(reviewProgressPct)),
                    );
                    return pct >= 96 ? "Finalising..." : `Reviewing... ${pct}%`;
                  })()
                : quickReviewHandKey
                  ? "Reviewing..."
                  : "Analyze"}
            </button>
          </div>
        ) : null}
        {filteredParsedHands.length > 0 && selectedAlreadyReviewedCount > 0 ? (
          <p className="hand-review-empty">
            Bulk analyze skips {selectedAlreadyReviewedCount} already reviewed hand
            {selectedAlreadyReviewedCount === 1 ? "" : "s"}.
          </p>
        ) : null}
        {filteredParsedHands.length > 0 &&
        selectedCount >= ANALYZE_LIMIT_HINT_MIN_SELECTION ? (
          <p className="hand-review-empty">
            Analyze limit: up to {MAX_HANDS_PER_AI_REVIEW} unreviewed selected
            hands per run (temporary for performance reasons).
          </p>
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
              const isV2Review = hasStreetIntelligenceReview(attachedReview);
              const isReviewLogicExpanded = expandedReviewLogicKeys.has(rowKey);
              const reviewConfidence = normalizeReviewConfidence(
                attachedReview?.confidence,
              );
              const reviewVerdict = reviewVerdictLabel(
                attachedReview?.overall_score,
              );
              const v2Teaser = buildV2TileTeaser(attachedReview || {}, hand);
              const handBbResult = resolveHandBbResult(hand || {});
              const qaSummary = reviewQaSummary(attachedReview || {});
              const handPosition = hand.heroPosition || "Unknown position";
              const heroCardsLabel = formatHeroCards(hand.heroCards);
              const preflopLine =
                (hand.heroPreflop?.actions || [])
                  .map((action) => formatAction(action))
                  .join(", ") || "No decision";
              const reviewState = isQuickReviewLoading
                ? "loading"
                : attachedReview
                  ? "reviewed"
                  : "pending";
              return (
                <article
                  key={rowKey}
                  ref={(node) => setHandRowRef(rowKey, node)}
                  className={`hand-row ${isSelected ? "selected" : ""} ${
                    isAuditTarget ? "audit-target" : ""
                  }`}
                >
                  <div className="hand-row-main">
                    <div className="hand-row-core">
                      <div className="hand-row-primary">
                        <label className="hand-row-select">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleHandSelection(hand)}
                          />
                          <strong className="hand-row-hand-id">
                            {hand.handId}
                          </strong>
                        </label>
                        <span className="hand-row-position-badge">
                          {handPosition}
                        </span>
                      </div>
                      <div className="hand-row-secondary">
                        <span className="hand-row-cards">{heroCardsLabel}</span>
                        <span
                          className={`outcome-pill ${outcomeClass(outcome.code)}`}
                          title={outcome.code || "unknown"}
                        >
                          {outcome.label || "Outcome unknown"}
                          {Number(outcome.wonAmount) > 0
                            ? ` (${outcome.wonAmount})`
                            : ""}
                        </span>
                        {handBbResult.available ? (
                          <span
                            className={`outcome-pill hand-row-bb-pill ${
                              handBbResult.tone === "good"
                                ? "won"
                                : handBbResult.tone === "bad"
                                  ? "lost"
                                  : "unknown"
                            }`}
                            title="Net result in big blinds"
                          >
                            {handBbResult.label}
                          </span>
                        ) : null}
                      </div>
                      <div className="hand-row-tertiary">
                        <div className="hand-row-metadata">
                          <span
                            className="hand-row-meta-item hand-row-meta-item--action"
                            title={`Preflop: ${preflopLine}`}
                          >
                            <span className="hand-row-meta-label">Preflop</span>
                            <span className="hand-row-meta-value">
                              {preflopLine}
                            </span>
                          </span>
                          <span
                            className="hand-row-meta-divider"
                            aria-hidden="true"
                          >
                            •
                          </span>
                          <span className="hand-row-meta-item hand-row-meta-item--time">
                            <span className="hand-row-meta-label">Played</span>
                            <span className="hand-row-meta-value">
                              {hand.playedAt}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="hand-row-side">
                      <button
                        type="button"
                        className={`hand-row-quick-review hand-row-quick-review--${reviewState} ${
                          isQuickReviewLoading ? "loading" : ""
                        }`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (attachedReview && isV2Review) {
                            setActiveV2ReviewHandKey(rowKey);
                            return;
                          }
                          runQuickReview(hand);
                        }}
                        disabled={loadingReview || Boolean(quickReviewHandKey)}
                        title={
                          attachedReview && isV2Review
                            ? "Open detailed review modal"
                            : "Quick AI review this hand"
                        }
                        aria-label={
                          attachedReview && isV2Review
                            ? `Open review for ${hand.handId}`
                            : `Quick AI review ${hand.handId}`
                        }
                      >
                        {isQuickReviewLoading
                          ? "Analyzing..."
                          : attachedReview && isV2Review
                            ? "Open review"
                            : attachedReview
                              ? "AI reviewed"
                            : "AI review"}
                      </button>
                    </div>
                  </div>
                  {attachedReview && isV2Review ? (
                    <div className="hand-row-review-v2-teaser">
                      <div className="hand-row-review-v2-line">
                        <span
                          className={`score-pill review-verdict-pill ${v2Teaser.bbTone || "neutral"}`}
                        >
                          {v2Teaser.bbLabel}
                        </span>
                        <strong>{v2Teaser.headline}</strong>
                        {showDeveloperQa && qaSummary.hasEvaluation ? (
                          <span
                            className={`review-dev-qa-badge ${qaSummary.warningsCount > 0 ? "warn" : "ok"}`}
                            title={
                              qaSummary.warningsCount > 0
                                ? `${qaSummary.warningsCount} QA warning(s)`
                                : "No QA warnings"
                            }
                          >
                            {qaSummary.label}
                          </span>
                        ) : null}
                      </div>
                      {v2Teaser.line ? (
                        <p className="hand-row-review-v2-sub">{v2Teaser.line}</p>
                      ) : v2Teaser.biggestLeak ? (
                        <p className="hand-row-review-v2-sub">
                          {v2Teaser.biggestLeak}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        className="hand-row-open-review"
                        onClick={() => setActiveV2ReviewHandKey(rowKey)}
                      >
                        Open review
                      </button>
                    </div>
                  ) : null}
                  {attachedReview && !isV2Review ? (
                    <div className="hand-row-review">
                      <div className="hand-review-headline">
                        <span
                          className={`score-pill review-verdict-pill ${scoreClass(
                            attachedReview.overall_score,
                          )}`}
                        >
                          Verdict: {reviewVerdict}
                        </span>
                      </div>
                      {attachedReview.what_was_good ? (
                        <div className="hand-review-section">
                          <p className="hand-review-section-label">
                            What was good
                          </p>
                          <p className="hand-review-section-copy">
                            {attachedReview.what_was_good}
                          </p>
                        </div>
                      ) : null}
                      <div className="hand-review-section">
                        <p className="hand-review-section-label">
                          Suggested adjustment
                        </p>
                        <p className="hand-review-section-copy">
                          {attachedReview.better_line}
                        </p>
                      </div>
                      <div className="hand-review-section">
                        <p className="hand-review-section-label">Summary</p>
                        <p className="hand-review-section-copy">
                          {attachedReview.primary_leak}
                        </p>
                      </div>
                      {(attachedReview.what_was_good ||
                        attachedReview.reasoning) && (
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
                                <p>
                                  <span
                                    className={`review-confidence-pill review-confidence-pill--${reviewConfidence}`}
                                  >
                                    {confidenceUiLabel(attachedReview.confidence)}
                                  </span>
                                </p>
                                {attachedReview.reasoning ? (
                                  <p>
                                    <strong>Deep reasoning:</strong>{" "}
                                    {attachedReview.reasoning}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                        </div>
                      )}
                      <details className="hand-review-score-breakdown">
                        <summary>Score breakdown</summary>
                        <div className="hand-review-scores">
                          <span>
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
                        </div>
                      </details>
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

      <div className="hand-review-pane hand-review-pane-right hand-review-pane-right--insights">
        {parsedHands.length === 0 ? (
          <div className="hand-insights hand-insights--performance-empty">
            <TournamentPerformanceChart
              snapshots={performanceSnapshots}
              loading={loadingPerformanceSnapshots}
              error={performanceSnapshotsError}
              onRemoveSnapshot={removePerformanceSnapshot}
              removingSnapshotId={removingPerformanceTournamentId}
            />
          </div>
        ) : null}

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
                  Session Summary
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
                  Session Stats
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
              <div className="tournament-summary tournament-summary--overview">
                <div className="tournament-summary-head">
                  <h3>Session Summary</h3>
                  <span>
                    Sample: {tournamentSummary.sampleHands} returned hands
                  </span>
                </div>
                {tournamentCoachSummary ? (
                  <div className="tournament-coach-summary tournament-coach-summary--hero">
                    <h4>Session Coaching Overview</h4>
                    {tournamentCoachSummary.rating ? (
                      <section className="coach-narrative-section coach-narrative-section--evaluation">
                        <div className="coach-rating-hero">
                          <p className="coach-rating-label">
                            Session verdict
                          </p>
                          <p className="coach-rating-value">
                            {tournamentCoachSummary.rating.score10Label} (
                            {tournamentCoachSummary.rating.scorePctLabel})
                          </p>
                          <div className="performance-save-row">
                            <button
                              type="button"
                              className="performance-save-button"
                              onClick={savePerformanceSnapshot}
                              disabled={
                                !canSavePerformanceSnapshot ||
                                Boolean(savingPerformanceTournamentId) ||
                                currentPerformanceAlreadySaved
                              }
                            >
                              {performanceSaveButtonLabel}
                            </button>
                            {!currentPerformanceTournamentId ? (
                              <span className="performance-save-note">
                                Tournament ID required
                              </span>
                            ) : null}
                            {currentPerformanceIsPreliminary ? (
                              <span className="performance-save-note">
                                Needs 60+ hands for tracking
                              </span>
                            ) : null}
                            {currentPerformanceSaveStatus === "error" ? (
                              <span className="performance-save-note performance-save-note--error">
                                Save failed
                              </span>
                            ) : null}
                          </div>
                          {tournamentCoachSummary.rating.prelimNote ? (
                            <p className="hand-review-empty coach-rating-note">
                              {tournamentCoachSummary.rating.prelimNote}
                            </p>
                          ) : null}
                        </div>
                        {tournamentCoachSummary.rating.topDrags.length > 0 ? (
                          <details className="coach-drags-pill">
                            <summary>
                              Largest score drags (
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
                      </section>
                    ) : null}

                    <section className="coach-narrative-section coach-narrative-section--priority">
                      <div className="coach-leaks-grid">
                        <div className="coach-leak-card coach-leak-card--primary">
                          <span>Biggest improvement area</span>
                          <strong>
                            {coachPrimaryLeakItem?.auditTarget ? (
                              <button
                                type="button"
                                className="coach-inline-link"
                                onClick={() =>
                                  openAuditSection(coachPrimaryLeakItem.auditTarget)
                                }
                              >
                                {sanitizeCoachingCopy(coachPrimaryLeakItem.text)}
                              </button>
                            ) : (
                              sanitizeCoachingCopy(
                                coachPrimaryLeakItem?.text ||
                                  tournamentCoachSummary.primaryLeak,
                              )
                            )}
                          </strong>
                        </div>
                        {coachPrimaryAdjustmentItem ? (
                          <div className="coach-leak-card coach-leak-card--adjustment">
                            <span>Most profitable adjustment</span>
                            <strong>
                              {coachPrimaryAdjustmentItem.auditTarget ? (
                                <button
                                  type="button"
                                  className="coach-inline-link"
                                  onClick={() =>
                                    openAuditSection(
                                      coachPrimaryAdjustmentItem.auditTarget,
                                    )
                                  }
                                >
                                  {sanitizeCoachingCopy(coachPrimaryAdjustmentItem.text)}
                                </button>
                              ) : (
                                sanitizeCoachingCopy(coachPrimaryAdjustmentItem.text)
                              )}
                            </strong>
                          </div>
                        ) : null}
                        {coachStrongestArea ? (
                          <div className="coach-leak-card">
                            <span>Strongest area</span>
                            <strong>{sanitizeCoachingCopy(coachStrongestArea)}</strong>
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {coachSupportingEvidence.length > 0 ? (
                      <section className="coach-narrative-section coach-narrative-section--evidence">
                        <p className="coach-summary-heading">
                          <strong>Key evidence</strong>
                        </p>
                        <div className="tournament-summary-flags coach-summary-flags">
                          {coachSupportingEvidence.map((item, idx) =>
                            item.auditTarget ? (
                              <button
                                type="button"
                                key={`coach-evidence-${idx}`}
                                className={`trend-flag coach-flag-button ${
                                  item.tone || "watch"
                                }`}
                                onClick={() => openAuditSection(item.auditTarget)}
                              >
                                {sanitizeCoachingCopy(item.text)}
                              </button>
                            ) : (
                              <p
                                key={`coach-evidence-${idx}`}
                                className={`trend-flag ${item.tone || "watch"}`}
                              >
                                {sanitizeCoachingCopy(item.text)}
                              </p>
                            ),
                          )}
                        </div>
                      </section>
                    ) : null}

                    {coachSecondaryLeakItem ||
                    coachSecondaryAdjustments.length > 0 ||
                    postflopIpHighlightItems.length > 0 ? (
                      <section className="coach-narrative-section coach-narrative-section--secondary">
                        <p className="coach-summary-heading">
                          <strong>Additional adjustments</strong>
                        </p>
                        <div className="tournament-summary-flags coach-summary-flags">
                          {coachSecondaryLeakItem ? (
                            coachSecondaryLeakItem.auditTarget ? (
                              <button
                                type="button"
                                className={`trend-flag coach-flag-button ${
                                  coachSecondaryLeakItem.tone || "watch"
                                }`}
                                onClick={() =>
                                  openAuditSection(coachSecondaryLeakItem.auditTarget)
                                }
                              >
                                Secondary improvement area:{" "}
                                {sanitizeCoachingCopy(coachSecondaryLeakItem.text)}
                              </button>
                            ) : (
                              <p className={`trend-flag ${coachSecondaryLeakItem.tone || "watch"}`}>
                                Secondary improvement area:{" "}
                                {sanitizeCoachingCopy(coachSecondaryLeakItem.text)}
                              </p>
                            )
                          ) : null}
                          {coachSecondaryAdjustments.map((item, idx) =>
                            item.auditTarget ? (
                              <button
                                type="button"
                                key={`coach-secondary-action-${idx}`}
                                className={`trend-flag coach-flag-button ${
                                  item.tone || "good"
                                }`}
                                onClick={() => openAuditSection(item.auditTarget)}
                              >
                                {sanitizeCoachingCopy(item.text)}
                              </button>
                            ) : (
                              <p
                                key={`coach-secondary-action-${idx}`}
                                className={`trend-flag ${item.tone || "good"}`}
                              >
                                {sanitizeCoachingCopy(item.text)}
                              </p>
                            ),
                          )}
                          {postflopIpHighlightItems.map((item, idx) =>
                            item?.auditTarget ? (
                              <button
                                type="button"
                                key={`postflop-ip-highlight-${idx}`}
                                className={`trend-flag coach-flag-button ${
                                  item.tone || "watch"
                                }`}
                                onClick={() => openAuditSection(item.auditTarget)}
                              >
                                {sanitizeCoachingCopy(item.text)}
                              </button>
                            ) : (
                              <p
                                key={`postflop-ip-highlight-${idx}`}
                                className={`trend-flag ${item?.tone || "watch"}`}
                              >
                                {sanitizeCoachingCopy(item?.text)}
                              </p>
                            ),
                          )}
                        </div>
                      </section>
                    ) : null}
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
                      : "Generate AI Coaching Brief"}
                  </button>
                  {summaryReviewError ? (
                    <p className="hand-review-error">{summaryReviewError}</p>
                  ) : null}
                  {summaryReview ? (
                    <div className="tournament-ai-review-card tournament-ai-review-card--authority">
                      <h4>Coach Brief</h4>
                      <p className="tournament-ai-paragraph">
                        {buildAiSummaryParagraph(summaryReview)}
                      </p>
                      {aiPrimaryAction ? (
                        <div className="ai-briefing-priority">
                          <p className="coach-summary-heading">
                            <strong>Suggested adjustment</strong>
                          </p>
                          <p className="trend-flag good">
                            {ensureSentenceEnding(
                              sanitizeCoachingCopy(aiPrimaryAction),
                            )}
                          </p>
                        </div>
                      ) : null}
                      {aiSecondaryActions.length > 0 ? (
                        <>
                          <p className="coach-summary-heading">
                            <strong>Supporting adjustments</strong>
                          </p>
                          <div className="tournament-summary-flags">
                            {aiSecondaryActions.map((line, idx) => (
                              <p
                                key={`ai-summary-action-${idx}`}
                                className="trend-flag good"
                              >
                                {ensureSentenceEnding(sanitizeCoachingCopy(line))}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : null}
                      {aiSummaryWarnings.length > 0 ? (
                        <>
                          <p className="coach-summary-heading">
                            <strong>Context watch-outs</strong>
                          </p>
                          <div className="tournament-summary-flags">
                            {aiSummaryWarnings.slice(0, 3).map((line, idx) => (
                              <p
                                key={`ai-summary-warning-${idx}`}
                                className="trend-flag watch"
                              >
                                {ensureSentenceEnding(sanitizeCoachingCopy(line))}
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
              <div className="tournament-summary tournament-summary--stats">
                <div className="tournament-summary-head">
                  <h3>Session Stats</h3>
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
                <details
                  className="summary-section"
                  ref={(node) => setAuditSectionRef("preflop_opportunity", node)}
                >
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
                        {sanitizeCoachingCopy(line)}
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

                <details
                  className="summary-section"
                  ref={(node) => setAuditSectionRef("blind_defense", node)}
                >
                  <summary>Biggest Improvement Area: Blind Defence</summary>
                  <p className="hand-review-empty">
                    SB and BB responses versus opens across the full session
                    sample.
                  </p>
                  <div className="tournament-summary-metrics">
                    <span>
                      Blind defense spots:{" "}
                      {blindDefenseAudit.totalBlindDefenseSpots}
                    </span>
                    <span>SB spots: {blindDefenseAudit.sbDefenseSpots}</span>
                    <span>BB spots: {blindDefenseAudit.bbDefenseSpots}</span>
                    <span>
                      Likely continue spots:{" "}
                      {blindDefenseAudit.likelyContinueSpots}
                    </span>
                    <span>
                      Missed likely continues:{" "}
                      {blindDefenseAudit.missedContinues.count}
                    </span>
                    <span>
                      Missed SB 3-bet pressure:{" "}
                      {blindDefenseAudit.missedSb3BetPressure.count}
                    </span>
                    <span>
                      Confidence:{" "}
                      {confidenceLabel(blindDefenseAudit.confidence)}
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
                        {sanitizeCoachingCopy(line)}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-summary-flags">
                    {blindDefenseAudit.warnings.map((line, idx) => (
                      <p
                        key={`blind-warning-${idx}`}
                        className="trend-flag watch"
                      >
                        {sanitizeCoachingCopy(line)}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-ai-review">
                    <button
                      type="button"
                      onClick={runBlindDefenseReview}
                      disabled={
                        loadingBlindDefenseReview || !blindDefenseReviewPayload
                      }
                    >
                      {loadingBlindDefenseReview
                        ? "Reviewing blind defense..."
                        : "Generate Blind Defence Brief"}
                    </button>
                    {blindDefenseReviewError ? (
                      <p className="hand-review-error">
                        {blindDefenseReviewError}
                      </p>
                    ) : null}
                    {blindDefenseReview ? (
                      <div className="tournament-ai-review-card">
                        <p className="tournament-ai-paragraph">
                          {buildAiSummaryParagraph(blindDefenseReview)}
                        </p>
                        {aiBlindDefenseActions.length > 0 ? (
                          <>
                            <p>
                              <strong>Most profitable adjustments:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiBlindDefenseActions
                                .slice(0, 4)
                                .map((line, idx) => (
                                  <p
                                    key={`ai-blind-action-${idx}`}
                                    className="trend-flag good"
                                  >
                                    {ensureSentenceEnding(
                                      sanitizeCoachingCopy(line),
                                    )}
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
                              {aiBlindDefenseWarnings
                                .slice(0, 4)
                                .map((line, idx) => (
                                  <p
                                    key={`ai-blind-warning-${idx}`}
                                    className="trend-flag watch"
                                  >
                                    {ensureSentenceEnding(
                                      sanitizeCoachingCopy(line),
                                    )}
                                  </p>
                                ))}
                            </div>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </details>

                <details
                  className="summary-section"
                  ref={(node) => setAuditSectionRef("icm_spots", node)}
                >
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
                      Unknown hole cards skipped:{" "}
                      {icmSpotAudit.unknownCardsSpots}
                    </span>
                  </div>
                  <div className="tournament-summary-metrics">
                    <span>Open spots: {icmSpotAudit.openSpots}</span>
                    <span>
                      Facing aggression spots:{" "}
                      {icmSpotAudit.facingAggressionSpots}
                    </span>
                    <span>Facing jam spots: {icmSpotAudit.facingJamSpots}</span>
                    <span>
                      Pressure-eligible spots:{" "}
                      {icmSpotAudit.pressureEligibleSpots}
                    </span>
                    <span>
                      Missed stack-pressure spots:{" "}
                      {icmSpotAudit.missedPressureSpots}
                    </span>
                    <span>
                      SB/BB fold spots captured:{" "}
                      {icmSpotAudit.blindFoldSpots.count}
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
                        {sanitizeCoachingCopy(line)}
                      </p>
                    ))}
                  </div>
                  <div className="tournament-summary-flags">
                    {icmSpotAudit.warnings.map((line, idx) => (
                      <p
                        key={`icm-warning-${idx}`}
                        className="trend-flag watch"
                      >
                        {sanitizeCoachingCopy(line)}
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
                        : "Generate ICM Spot Brief"}
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
                              <strong>Suggested adjustments:</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiIcmActions.slice(0, 4).map((line, idx) => (
                                <p
                                  key={`ai-icm-action-${idx}`}
                                  className="trend-flag good"
                                >
                                  {ensureSentenceEnding(
                                    sanitizeCoachingCopy(line),
                                  )}
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
                                <p
                                  key={`ai-icm-warning-${idx}`}
                                  className="trend-flag watch"
                                >
                                  {ensureSentenceEnding(
                                    sanitizeCoachingCopy(line),
                                  )}
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
                            {event.handId}: L{event.level || "?"}{" "}
                            {event.position} {event.handCode}{" "}
                            {event.stackBb !== null
                              ? `(${event.stackBb}bb)`
                              : ""}{" "}
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
                            {event.handId}: L{event.level || "?"}{" "}
                            {event.position} {event.handCode}{" "}
                            {event.stackBb !== null
                              ? `(${event.stackBb}bb)`
                              : ""}{" "}
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

                <details
                  className="summary-section"
                  ref={(node) => setAuditSectionRef("postflop_ip", node)}
                >
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
                        {sanitizeCoachingCopy(line)}
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
                      title="Coaching hint for current table"
                      aria-label="Coaching hint for current table"
                    >
                      <span aria-hidden="true">
                        {loadingTableHintReview ? "..." : "Hint"}
                      </span>
                      <span>
                        {loadingTableHintReview
                          ? "Reviewing table..."
                          : "Generate Table Coaching Hint"}
                      </span>
                    </button>
                    {tableHintReviewError ? (
                      <p className="hand-review-error">
                        {tableHintReviewError}
                      </p>
                    ) : null}
                    {tableHintReview ? (
                      <div className="tournament-ai-review-card tournament-ai-review-card--table">
                        <h4>Current Table Coaching</h4>
                        <div className="table-hint-meta">
                          <span
                            className={`review-confidence-pill review-confidence-pill--${tableHintConfidence}`}
                          >
                            {confidenceUiLabel(tableHintConfidence)}
                          </span>
                          <span
                            className={`review-confidence-pill review-confidence-pill--${tableHintSampleSummary.tier}`}
                          >
                            {tableHintSampleSummary.label}
                            {tableHintSampleSummary.averageHands > 0
                              ? ` (${Math.round(tableHintSampleSummary.averageHands)} hands/player)`
                              : ""}
                          </span>
                        </div>
                        <p className="tournament-ai-paragraph">
                          {buildTableHintParagraph(tableHintReview)}
                        </p>
                        {aiTableHintExploits.length > 0 ? (
                          <>
                            <p className="coach-summary-heading">
                              <strong>Observed tendency</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiTableHintExploits
                                .slice(0, 4)
                                .map((line, idx) => (
                                  <p
                                    key={`ai-table-exploit-${idx}`}
                                    className="trend-flag good"
                                  >
                                    {ensureSentenceEnding(
                                      sanitizeCoachingCopy(line),
                                    )}
                                  </p>
                                ))}
                            </div>
                          </>
                        ) : null}
                        {aiTableHintAdjustments.length > 0 ? (
                          <>
                            <p className="coach-summary-heading">
                              <strong>Practical adjustment</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiTableHintAdjustments
                                .slice(0, 5)
                                .map((line, idx) => (
                                  <p
                                    key={`ai-table-adjustment-${idx}`}
                                    className="trend-flag good"
                                  >
                                    {ensureSentenceEnding(
                                      sanitizeCoachingCopy(line),
                                    )}
                                  </p>
                                ))}
                            </div>
                          </>
                        ) : null}
                        {aiTableHintWarnings.length > 0 ? (
                          <>
                            <p className="coach-summary-heading">
                              <strong>Watch-outs</strong>
                            </p>
                            <div className="tournament-summary-flags">
                              {aiTableHintWarnings
                                .slice(0, 4)
                                .map((line, idx) => (
                                  <p
                                    key={`ai-table-warning-${idx}`}
                                    className="trend-flag watch"
                                  >
                                    {ensureSentenceEnding(
                                      sanitizeCoachingCopy(line),
                                    )}
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
            Parse hands to unlock Session Summary, Stats, Hand Audit, and
            Opponent Snapshot.
          </p>
        )}
      </div>

      {activeV2ReviewHandKey ? (
        <HandReviewV2Modal
          open={Boolean(activeV2ReviewHandKey)}
          onClose={() => setActiveV2ReviewHandKey("")}
          showDeveloperQa={showDeveloperQa}
          hand={
            filteredParsedHands.find(
              (item) => handKey(item) === activeV2ReviewHandKey,
            ) ||
            parsedHands.find((item) => handKey(item) === activeV2ReviewHandKey) ||
            null
          }
          review={reviewsByHandKey[activeV2ReviewHandKey] || null}
        />
      ) : null}

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

      {uploadHelpModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal hand-review-modal">
            <div className="modal-header">
              <h3 className="modal-title">Upload Help</h3>
              <button
                type="button"
                className="hand-review-modal-close"
                onClick={() => setUploadHelpModalOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="modal-body">
              <p>
                If you play on GG Poker, download your tournament hand history
                from PokerCraft in the GG Poker app.
              </p>
              <p>
                If you play Pokerstars, request your tournament hand history in
                the Poker app to have it emailed to you.
              </p>
              <p>
                Extract the hand-history text file to local storage (or copy
                paste the text), then upload it here using{" "}
                <strong>Import hand history text file</strong>.
              </p>
              <p>
                For detailed tournament analysis, click{" "}
                <strong>Parse Hands</strong>. To keep a tournament for future
                analysis, expand the parser and click{" "}
                <strong>Save Tournament</strong>.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setUploadHelpModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

