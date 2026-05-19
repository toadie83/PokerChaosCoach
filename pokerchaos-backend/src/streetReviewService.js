const STREET_ORDER = ["preflop", "flop", "turn", "river"];

const CONFIDENCE_TO_SCORE = {
  low: 1,
  medium: 2,
  high: 3,
};

const SCORE_TO_CONFIDENCE = {
  1: "low",
  2: "medium",
  3: "high",
};

const STRONG_LEAK_TAGS = new Set([
  "pressure_leak",
  "sizing_leak",
  "passive_leak",
  "missed_jam",
  "overfold_river",
  "mistake_candidate",
  "likely_punt",
  "stack_off_threshold",
  "missed_aggression",
  "suspicious_sizing",
]);

const SPECULATIVE_LEAK_TAGS = new Set([
  "low_equity",
  "passive_line",
  "preflop_fold",
]);

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStreetActionLabel(rawType) {
  const value = String(rawType || "")
    .trim()
    .toLowerCase();
  if (!value) return "unknown";
  if (value === "raise") return "raise";
  if (value === "jam") return "jam";
  if (value === "bet") return "bet";
  if (value === "call") return "call";
  if (value === "check") return "check";
  if (value === "fold") return "fold";
  if (value === "post_small_blind" || value === "post_big_blind") return "post blind";
  if (value === "post_ante") return "post ante";
  return value;
}

function amountToBbString(amountChips, bigBlind) {
  const amount = toFiniteOrNull(amountChips);
  const bb = toFiniteOrNull(bigBlind);
  if (amount === null || bb === null || bb <= 0) return null;
  return `${(amount / bb).toFixed(1)}bb`;
}

function findHeroStreetAction(hand = {}, street) {
  const streetActions = Array.isArray(hand?.heroActionsByStreet?.[street])
    ? hand.heroActionsByStreet[street]
    : [];
  if (!streetActions.length) {
    return {
      action: "none",
      size: null,
    };
  }
  const lastAction = streetActions[streetActions.length - 1] || {};
  return {
    action: toStreetActionLabel(lastAction?.type),
    sizing:
      amountToBbString(lastAction?.toAmount, hand?.blinds?.bigBlind) ||
      amountToBbString(lastAction?.amount, hand?.blinds?.bigBlind),
    size:
      amountToBbString(lastAction?.toAmount, hand?.blinds?.bigBlind) ||
      amountToBbString(lastAction?.amount, hand?.blinds?.bigBlind),
  };
}

function inferPreferredActionFromLegacyText(legacyReview = {}, fallbackAction = "unknown") {
  const candidateText = [
    legacyReview?.better_line,
    legacyReview?.reasoning,
    legacyReview?.primary_leak,
  ]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");
  const candidates = ["fold", "call", "check", "bet", "raise", "jam", "3-bet", "4-bet"];
  for (const candidate of candidates) {
    if (candidateText.includes(candidate)) {
      return candidate;
    }
  }
  return fallbackAction;
}

function describeBoardTextureForStreet(hand = {}, street) {
  if (street === "preflop") return "No board cards yet.";
  const flop = Array.isArray(hand?.board?.flop) ? hand.board.flop : [];
  const turn = typeof hand?.board?.turn === "string" ? hand.board.turn : null;
  const river = typeof hand?.board?.river === "string" ? hand.board.river : null;
  const cards = [];
  if (flop.length) cards.push(...flop);
  if (street === "turn" || street === "river") {
    if (turn) cards.push(turn);
  }
  if (street === "river") {
    if (river) cards.push(river);
  }
  if (!cards.length) return "Board details unavailable.";
  return cards.join(" ");
}

function scoreForStreet(legacyReview = {}, street) {
  if (street === "preflop") return toFiniteOrNull(legacyReview?.preflop_score);
  if (street === "flop") return toFiniteOrNull(legacyReview?.flop_score);
  if (street === "turn") return toFiniteOrNull(legacyReview?.turn_score);
  if (street === "river") return toFiniteOrNull(legacyReview?.river_score);
  return null;
}

function deriveStreetConfidence(handConfidence, streetScore) {
  const baseline = ["low", "medium", "high"].includes(String(handConfidence || "").toLowerCase())
    ? String(handConfidence || "").toLowerCase()
    : "medium";
  if (!Number.isFinite(Number(streetScore))) return baseline;
  if (Number(streetScore) <= -1) return "medium";
  if (Number(streetScore) >= 1 && baseline !== "low") return "high";
  return baseline;
}

function toPotOddsPct(math = {}) {
  const callAmount = toFiniteOrNull(math?.callAmount);
  const finalPotIfCall = toFiniteOrNull(math?.finalPotIfCall);
  if (callAmount === null || finalPotIfCall === null || finalPotIfCall <= 0) return null;
  return `${Math.round((callAmount / finalPotIfCall) * 100)}%`;
}

function buildStreetMetrics(street, hand = {}, handState = {}) {
  const bigBlind = toFiniteOrNull(hand?.blinds?.bigBlind);
  const decisionStreet = String(handState?.street || "").toLowerCase();
  const atDecisionStreet = decisionStreet === street;
  if (!atDecisionStreet) {
    return {
      pot_size_bb: null,
      spr: null,
      facing_size_bb: null,
      pot_odds: null,
    };
  }
  return {
    pot_size_bb:
      bigBlind && toFiniteOrNull(handState?.potSize) !== null
        ? Number((Number(handState.potSize) / bigBlind).toFixed(2))
        : null,
    spr: toFiniteOrNull(handState?.math?.spr),
    facing_size_bb:
      bigBlind && toFiniteOrNull(handState?.facingBet) !== null
        ? Number((Number(handState.facingBet) / bigBlind).toFixed(2))
        : null,
    pot_odds: toPotOddsPct(handState?.math),
  };
}

export function computeMistakeCount(streetReviews = []) {
  return streetReviews.filter((node) => Number(node?.score) <= -1).length;
}

export function computeAverageConfidence(streetReviews = [], fallback = "medium") {
  const values = streetReviews
    .map((node) => CONFIDENCE_TO_SCORE[String(node?.confidence || "").toLowerCase()] || null)
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return ["low", "medium", "high"].includes(String(fallback || "").toLowerCase())
      ? String(fallback || "").toLowerCase()
      : "medium";
  }
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return SCORE_TO_CONFIDENCE[Math.round(avg)] || "medium";
}

function normalizeStreetReviewNode(node = {}) {
  const tags = Array.isArray(node?.strategic_tags)
    ? node.strategic_tags
    : Array.isArray(node?.tags)
      ? node.tags
      : [];
  return {
    ...node,
    confidence: ["low", "medium", "high"].includes(
      String(node?.confidence || "").toLowerCase(),
    )
      ? String(node.confidence).toLowerCase()
      : "medium",
    strategic_tags: tags,
    tags,
    action_taken: {
      action: String(node?.action_taken?.action || "unknown").trim() || "unknown",
      sizing:
        node?.action_taken?.sizing ??
        node?.action_taken?.size ??
        null,
      size:
        node?.action_taken?.size ??
        node?.action_taken?.sizing ??
        null,
    },
    preferred_action: {
      action:
        String(node?.preferred_action?.action || "unknown").trim() || "unknown",
      sizing:
        node?.preferred_action?.sizing ??
        node?.preferred_action?.size ??
        null,
      size:
        node?.preferred_action?.size ??
        node?.preferred_action?.sizing ??
        null,
    },
  };
}

function isOpenOpportunityNode(node = {}) {
  const decisionType = String(
    node?.decision_type || node?.action_time_state?.decision_type || "",
  )
    .trim()
    .toLowerCase();
  const firstIn = Boolean(
    node?.first_in_opportunity || node?.action_time_state?.open_opportunity,
  );
  const facingRaise = Boolean(
    node?.facing_raise || node?.action_time_state?.facing_raise,
  );
  return decisionType === "open_decision" && firstIn && !facingRaise;
}

function sanitizeContradictoryOpenDecisionLanguage(text = "", node = {}) {
  let value = String(text || "");
  if (!isOpenOpportunityNode(node)) return value.trim();
  value = value.replace(/\bfacing (?:a )?(?:raise|open|3-?bet|jam)\b/gi, "first-in");
  value = value.replace(/\bversus (?:a )?(?:raise|open|3-?bet|jam)\b/gi, "first-in");
  value = value.replace(/\bdefend(?:ing)? versus open\b/gi, "opening first-in");
  value = value.replace(/\bfold(?:ing)? versus open\b/gi, "folding first-in");
  return value.trim();
}

const PLAYER_FACING_SUMMARY_REPLACEMENTS = [
  {
    pattern:
      /\bthis preflop node was first-in, so it should be evaluated as an opening decision rather than a response to prior aggression\.?/gi,
    replacement: "With no prior action, opening is generally preferred here.",
  },
  {
    pattern: /\bfirst-?in opportunity\b/gi,
    replacement: "spot with no prior action",
  },
  {
    pattern: /\bfirst-?in node\b/gi,
    replacement: "unopened pot spot",
  },
  {
    pattern: /\bresponse-to-aggression\b/gi,
    replacement: "facing action",
  },
  {
    pattern: /\bopening decision\b/gi,
    replacement: "opening spot",
  },
  {
    pattern: /\bresponse node\b/gi,
    replacement: "response spot",
  },
  {
    pattern: /\bsemantic classification\b/gi,
    replacement: "spot context",
  },
  {
    pattern: /\baction-time state\b/gi,
    replacement: "hand context",
  },
  {
    pattern: /\bnormalized street review\b/gi,
    replacement: "street review",
  },
  {
    pattern: /\bdeterministic interpretation\b/gi,
    replacement: "structured read",
  },
  {
    pattern: /\breconstruction\b/gi,
    replacement: "hand read",
  },
  {
    pattern: /\bnode semantics?\b/gi,
    replacement: "spot context",
  },
  {
    pattern: /\bnode\b/gi,
    replacement: "spot",
  },
];

function toPlayerFacingSummaryText(text = "") {
  let value = String(text || "").trim();
  if (!value) return value;
  for (const rule of PLAYER_FACING_SUMMARY_REPLACEMENTS) {
    value = value.replace(rule.pattern, rule.replacement);
  }
  value = value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
  return value;
}

function hasReasonableLineLanguage(text = "") {
  return /\b(reasonable|standard|defensible|acceptable)\b/i.test(String(text || ""));
}

function actionToken(action = "") {
  const raw = String(action || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("raise") || raw.includes("open")) return "raise";
  if (raw.includes("jam")) return "jam";
  if (raw.includes("call")) return "call";
  if (raw.includes("check")) return "check";
  if (raw.includes("fold")) return "fold";
  if (raw.includes("bet")) return "bet";
  return raw;
}

function summarySupportsNodeAsReasonable(summaryText = "", node = {}) {
  const summary = String(summaryText || "").toLowerCase();
  if (!hasReasonableLineLanguage(summary)) return false;
  const street = String(node?.street || "").toLowerCase();
  const action = actionToken(node?.action_taken?.action || node?.preferred_action?.action || "");
  const mentionsStreet = street ? summary.includes(street) : false;
  const mentionsAction = action ? new RegExp(`\\b${action}\\b`, "i").test(summary) : false;
  return mentionsStreet || mentionsAction;
}

function chartQualifiedContinue(node = {}) {
  const audit =
    node?.audit_heuristics ||
    node?.deterministic?.audit_heuristics ||
    null;
  const recommendation = String(audit?.chart_recommendation || "")
    .trim()
    .toLowerCase();
  return ["defend", "likely_continue", "mixed_continue"].includes(recommendation);
}

function mandatoryFoldLanguage(text = "") {
  return /\b(mandatory fold|must fold|always fold|obvious fold|standard fold)\b/i.test(
    String(text || ""),
  );
}

function candidateEvidence(node = {}) {
  const score = Number(node?.score);
  const confidence = String(node?.confidence || "").toLowerCase();
  const tags = Array.isArray(node?.strategic_tags)
    ? node.strategic_tags
    : Array.isArray(node?.tags)
      ? node.tags
      : [];
  const normalizedTags = tags.map((tag) => String(tag || "").trim().toLowerCase());
  const strongTagCount = normalizedTags.filter((tag) => STRONG_LEAK_TAGS.has(tag)).length;
  const speculativeTagCount = normalizedTags.filter((tag) => SPECULATIVE_LEAK_TAGS.has(tag)).length;
  const textBlob = [
    String(node?.analysis?.insight || ""),
    String(node?.analysis?.takeaway || ""),
  ]
    .join(" ")
    .toLowerCase();
  const hasNegativePhrasing =
    /\b(mistake|leak|pun(t)?|overplay|too loose|too passive|too tight|overfold|underbluff|overbluff)\b/i.test(
      textBlob,
    );

  let evidence = 0;
  if (Number.isFinite(score)) {
    if (score <= -2) evidence += 2;
    else if (score <= -1) evidence += 1;
  }
  if (confidence === "high") evidence += 2;
  else if (confidence === "medium") evidence += 1;
  if (strongTagCount > 0) evidence += 1;
  if (hasNegativePhrasing) evidence += 1;

  return {
    evidence,
    strongTagCount,
    speculativeTagCount,
    speculativeOnly: speculativeTagCount > 0 && strongTagCount === 0,
    chartQualifiedContinue: chartQualifiedContinue(node),
  };
}

function contradictionWithReasonableSummary({
  summaryText = "",
  candidateLeakText = "",
} = {}) {
  const summary = String(summaryText || "");
  const leak = String(candidateLeakText || "");
  if (!hasReasonableLineLanguage(summary)) return false;
  if (/\b(mandatory|must|always)\b/i.test(leak)) return true;
  if (/\bpreflop\b/i.test(summary) && /\bpreflop\b/i.test(leak) && /\bfold\b/i.test(leak)) {
    return true;
  }
  if (/\bcall\b/i.test(summary) && /\bfold\b/i.test(leak)) return true;
  return false;
}

function promotedMistakeNodes(normalized = [], legacyReview = {}) {
  const summaryText = String(legacyReview?.what_was_good || "").trim();
  return normalized
    .filter((node) => Number(node?.score) <= -1 && !node?.skipped)
    .map((node) => {
      const evidence = candidateEvidence(node);
      return { node, evidence };
    })
    .filter(({ node, evidence }) => {
      if (evidence.evidence < 2) return false;
      if (evidence.speculativeOnly && evidence.evidence < 4) return false;
      const leakText = String(node?.analysis?.takeaway || node?.analysis?.insight || "");
      if (
        evidence.chartQualifiedContinue &&
        mandatoryFoldLanguage(leakText) &&
        evidence.evidence < 4
      ) {
        return false;
      }
      if (
        summarySupportsNodeAsReasonable(summaryText, node) &&
        contradictionWithReasonableSummary({
          summaryText,
          candidateLeakText: leakText,
        }) &&
        evidence.evidence < 4
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (b.evidence.evidence !== a.evidence.evidence) {
        return b.evidence.evidence - a.evidence.evidence;
      }
      return Number(a.node?.score) - Number(b.node?.score);
    });
}

export function computeHeadlineCandidates({ streetReviews = [], biggestLeak = "" } = {}) {
  const normalized = streetReviews.map(normalizeStreetReviewNode);
  const allTags = new Set(
    normalized.flatMap((node) =>
      Array.isArray(node?.strategic_tags)
        ? node.strategic_tags
        : Array.isArray(node?.tags)
          ? node.tags
          : [],
    ),
  );
  const worstStreet = normalized
    .filter((node) => Number.isFinite(Number(node?.score)))
    .sort((a, b) => Number(a.score) - Number(b.score))[0];
  const leak = String(biggestLeak || "").trim();
  const candidates = [];

  const hasTag = (code) => allTags.has(code);
  if (hasTag("overfold_river") || hasTag("bluff_catcher_node")) {
    candidates.push("River Bluff Catch Spot");
  } else if (hasTag("missed_jam") || hasTag("stack_off_threshold")) {
    candidates.push("Preflop Stack-Off Spot");
  } else if (hasTag("thin_value")) {
    candidates.push("Thin Value Decision");
  } else if (hasTag("hero_call")) {
    candidates.push("Hero Call Spot");
  } else if (hasTag("pressure_leak") || hasTag("high_pressure_node")) {
    candidates.push("Pressure Decision Spot");
  } else if (hasTag("sizing_leak") || hasTag("suspicious_sizing")) {
    candidates.push("Sizing Decision Spot");
  } else if (hasTag("passive_line") || hasTag("passive_leak")) {
    candidates.push("Passive Line Review");
  }

  if (worstStreet && Number(worstStreet.score) <= -1) {
    const byStreet = {
      preflop: "Preflop Pressure Spot",
      flop: "Flop Decision Spot",
      turn: "Tough Turn Decision",
      river: "River Decision Spot",
    };
    const streetKey = String(worstStreet?.street || "").trim().toLowerCase();
    candidates.push(byStreet[streetKey] || "Key Decision Spot");
  }
  if (leak && !/no major leak flagged/i.test(leak)) {
    const friendlyLeak = leak
      .replace(/\bleak(s)?\b/gi, "focus area")
      .replace(/\bmistake(s)?\b/gi, "adjustment")
      .trim();
    candidates.push(
      friendlyLeak.length > 48 ? `${friendlyLeak.slice(0, 45)}...` : friendlyLeak,
    );
  }
  if (/no major leak flagged/i.test(leak)) {
    candidates.push("Solid Overall Execution");
  }
  candidates.push("Full Hand Review");
  return candidates;
}

export function aggregateStreetReviewSummary(
  legacyReview = {},
  streetReviews = [],
  options = {},
) {
  const normalized = streetReviews.map(normalizeStreetReviewNode);
  const biggestLeak =
    toPlayerFacingSummaryText(String(legacyReview?.primary_leak || "").trim()) ||
    "No major leak flagged.";
  const headlineCandidates = computeHeadlineCandidates({
    streetReviews: normalized,
    biggestLeak,
  });
  const mistakeOverride = Number(options?.mistakesFoundOverride);
  const headlineOverride = String(options?.headlineOverride || "").trim();
  const strategicSummaryOverride = String(options?.strategicSummaryOverride || "").trim();
  const primaryAdjustmentOverride = String(options?.primaryAdjustmentOverride || "").trim();
  return {
    overall_score: toFiniteOrNull(legacyReview?.overall_score),
    confidence: computeAverageConfidence(normalized, legacyReview?.confidence),
    headline: headlineOverride || headlineCandidates[0] || "Street-by-street decision review",
    biggest_leak: biggestLeak,
    strategic_summary:
      toPlayerFacingSummaryText(strategicSummaryOverride) ||
      toPlayerFacingSummaryText(String(legacyReview?.what_was_good || "").trim()) ||
      "No additional summary provided.",
    primary_adjustment:
      toPlayerFacingSummaryText(primaryAdjustmentOverride) ||
      toPlayerFacingSummaryText(String(legacyReview?.better_line || "").trim()) ||
      "No adjustment provided.",
    mistakes_found:
      Number.isFinite(mistakeOverride) && mistakeOverride >= 0
        ? Math.floor(mistakeOverride)
        : computeMistakeCount(normalized),
  };
}

function deriveSourceOfTruthSummaryCopy({
  normalized = [],
  promoted = [],
  handSummary = {},
  legacyReview = {},
} = {}) {
  const promotedNodes = promoted.map((item) => item?.node).filter(Boolean);
  const firstOpenOpportunity = normalized.find((node) => isOpenOpportunityNode(node) && !node?.skipped);
  const anchor =
    promotedNodes[0] ||
    firstOpenOpportunity ||
    normalized.find((node) => !node?.skipped && Number.isFinite(Number(node?.score))) ||
    null;

  if (anchor && isOpenOpportunityNode(anchor)) {
    const tookFold = String(anchor?.action_taken?.action || "").toLowerCase() === "fold";
    const preferredRaise = String(anchor?.preferred_action?.action || "").toLowerCase().includes("raise");
    const strategicSummary = tookFold && preferredRaise
      ? "Folding with no prior action in front is somewhat tight; opening is generally preferred."
      : "With no prior action, this was a good spot to consider opening.";
    return {
      what_was_good: toPlayerFacingSummaryText(strategicSummary),
      better_line:
        toPlayerFacingSummaryText(
          "When action folds to you, prefer your standard open based on position and stack depth.",
        ),
      primary_leak:
        toPlayerFacingSummaryText(String(handSummary?.biggest_leak || "").trim()) ||
        "No major leak flagged.",
      reasoning:
        toPlayerFacingSummaryText(
          "No one entered the pot before hero acted, so opening tends to perform better than folding too often.",
        ),
    };
  }

  const anchorInsight = sanitizeContradictoryOpenDecisionLanguage(
    String(anchor?.analysis?.insight || "").trim(),
    anchor,
  );
  const anchorTakeaway = sanitizeContradictoryOpenDecisionLanguage(
    String(anchor?.analysis?.takeaway || "").trim(),
    anchor,
  );
  const anchorPlan = sanitizeContradictoryOpenDecisionLanguage(
    String(anchor?.analysis?.plan_commentary || "").trim(),
    anchor,
  );

  return {
    what_was_good: toPlayerFacingSummaryText(
      anchorInsight ||
        String(handSummary?.strategic_summary || "").trim() ||
        String(legacyReview?.what_was_good || "").trim(),
    ) ||
      "No additional summary provided.",
    better_line: toPlayerFacingSummaryText(
      anchorPlan ||
        String(handSummary?.primary_adjustment || "").trim() ||
        String(legacyReview?.better_line || "").trim(),
    ) ||
      "No adjustment provided.",
    primary_leak: toPlayerFacingSummaryText(
      String(handSummary?.biggest_leak || "").trim() ||
        sanitizeContradictoryOpenDecisionLanguage(
          String(legacyReview?.primary_leak || "").trim(),
          anchor,
        ),
    ) ||
      "No major leak flagged.",
    reasoning: toPlayerFacingSummaryText(
      anchorTakeaway ||
        sanitizeContradictoryOpenDecisionLanguage(
          String(legacyReview?.reasoning || "").trim(),
          anchor,
        ),
    ) ||
      "The summary reflects the final street-by-street coaching view.",
  };
}

export function buildStreetReviewsFromLegacyReview(legacyReview = {}, handContext = {}) {
  const hand = handContext?.hand || handContext || {};
  const handState = handContext?.validatedHandState || {};
  return STREET_ORDER.map((street) => {
    const score = scoreForStreet(legacyReview, street);
    const actionTaken = findHeroStreetAction(hand, street);
    const preferredAction = inferPreferredActionFromLegacyText(
      legacyReview,
      actionTaken.action,
    );
    const streetConfidence = deriveStreetConfidence(legacyReview?.confidence, score);
    const takeaway =
      Number(score) <= -1
        ? String(legacyReview?.primary_leak || "").trim() || "Adjust this street decision."
        : String(legacyReview?.what_was_good || "").trim() || "Solid execution on this street.";
    const tags = [];
    if (Number(score) <= -1) tags.push("mistake_candidate");
    if (Number(score) >= 1) tags.push("well_played");
    if (street === String(handState?.street || "").toLowerCase()) tags.push("hero_decision_street");

    return {
      street,
      score,
      action_taken: actionTaken,
      preferred_action: {
        action: preferredAction,
        sizing: null,
        size: null,
      },
      metrics: buildStreetMetrics(street, hand, handState),
      analysis: {
        // TODO(street-ai-prompts): replace these seed fields with per-street AI coaching output.
        insight:
          Number(score) <= -1
            ? String(legacyReview?.primary_leak || "").trim()
            : String(legacyReview?.what_was_good || "").trim(),
        range_context: "Range context placeholder for this street.",
        // TODO(deterministic-layer): inject deterministic board texture, pressure, and sizing diagnostics.
        board_texture: describeBoardTextureForStreet(hand, street),
        sizing_commentary: String(legacyReview?.reasoning || "").trim(),
        plan_commentary: String(legacyReview?.better_line || "").trim(),
        takeaway,
      },
      // TODO(timeline-ui): frontend timeline cards will consume tags, metrics, and takeaway fields.
      strategic_tags: tags,
      tags,
      confidence: streetConfidence,
    };
  });
}

export function buildStreetReviewAggregate(legacyReview = {}, handContext = {}) {
  const streetReviews = buildStreetReviewsFromLegacyReview(
    legacyReview,
    handContext,
  ).map(normalizeStreetReviewNode);
  return buildStreetReviewAggregateFromStreetReviews({
    legacyReview,
    streetReviews,
  });
}

export function buildStreetReviewAggregateFromStreetReviews({
  legacyReview = {},
  streetReviews = [],
} = {}) {
  const normalized = streetReviews.map(normalizeStreetReviewNode);
  const chartAlignedContinueExists = normalized.some((node) => chartQualifiedContinue(node));
  const promoted = promotedMistakeNodes(normalized, legacyReview);
  const topPromoted = promoted[0]?.node || null;
  const legacyPrimaryLeak = String(legacyReview?.primary_leak || "").trim();
  const contradictoryLegacyLeak =
    contradictionWithReasonableSummary({
      summaryText: legacyReview?.what_was_good,
      candidateLeakText: legacyPrimaryLeak,
    }) && hasReasonableLineLanguage(String(legacyReview?.what_was_good || ""));
  const contradictoryWithChart =
    chartAlignedContinueExists && mandatoryFoldLanguage(legacyPrimaryLeak);
  const biggestLeakFallback = topPromoted
    ? String(topPromoted?.analysis?.takeaway || topPromoted?.analysis?.insight || "").trim()
    : contradictoryLegacyLeak || contradictoryWithChart
      ? "No major leak flagged."
      : legacyPrimaryLeak || "No major leak flagged.";
  const primaryAdjustmentSeed = String(
    topPromoted?.analysis?.plan_commentary ||
      topPromoted?.analysis?.takeaway ||
      legacyReview?.better_line ||
      "",
  ).trim();
  const strategicSummarySeed = String(
    topPromoted?.analysis?.insight ||
      legacyReview?.what_was_good ||
      "",
  ).trim();
  const summarySeed = {
    ...legacyReview,
    primary_leak: String(biggestLeakFallback || "").trim(),
    better_line: primaryAdjustmentSeed || String(legacyReview?.better_line || "").trim(),
    what_was_good: strategicSummarySeed || String(legacyReview?.what_was_good || "").trim(),
  };
  const handSummary = aggregateStreetReviewSummary(summarySeed, normalized, {
    mistakesFoundOverride: promoted.length,
    headlineOverride:
      promoted.length === 0 ? "Full Hand Review" : undefined,
    strategicSummaryOverride: strategicSummarySeed,
    primaryAdjustmentOverride: primaryAdjustmentSeed,
  });
  const keyMistakes = promoted
    .map(({ node }) => node)
    .map(
      (node) =>
        `${String(node?.street || "").toUpperCase()}: ${String(node?.analysis?.takeaway || "").trim()}`,
    )
    .filter(Boolean)
    .slice(0, 4);
  const tags = Array.from(
    new Set(
      normalized
        .flatMap((node) =>
          Array.isArray(node?.strategic_tags)
            ? node.strategic_tags
            : Array.isArray(node?.tags)
              ? node.tags
              : [],
        )
        .filter(Boolean),
    ),
  );
  const sourceOfTruthSummary = deriveSourceOfTruthSummaryCopy({
    normalized,
    promoted,
    handSummary,
    legacyReview,
  });

  return {
    hand_summary: handSummary,
    street_reviews: normalized,
    tags,
    key_mistakes: keyMistakes,
    source_of_truth_summary: sourceOfTruthSummary,
  };
}
