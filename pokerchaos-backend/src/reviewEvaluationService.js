const STREET_ORDER = ["preflop", "flop", "turn", "river"];
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

const DEFAULT_REVIEW_EVAL_THRESHOLDS = {
  minimum_coherence_score: 80,
  maximum_hallucination_risk: 20,
};

function toScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeCard(rawCard) {
  const card = String(rawCard || "").trim();
  if (!/^[2-9TJQKA][cdhs]$/i.test(card)) return null;
  return {
    rank: card[0].toUpperCase(),
    suit: card[1].toLowerCase(),
  };
}

function normalizeHeroCards(heroCards = []) {
  if (!Array.isArray(heroCards) || heroCards.length < 2) return [];
  return heroCards
    .slice(0, 2)
    .map((card) => normalizeCard(card))
    .filter(Boolean);
}

function isSpeculativeDefendableHolding(heroCards = []) {
  const cards = normalizeHeroCards(heroCards);
  if (cards.length !== 2) return false;
  const suited = cards[0].suit === cards[1].suit;
  const v1 = RANK_VALUES[cards[0].rank] || 0;
  const v2 = RANK_VALUES[cards[1].rank] || 0;
  if (!suited) return false;
  const hi = Math.max(v1, v2);
  const lo = Math.min(v1, v2);
  const gap = hi - lo;
  const isSuitedConnector = gap === 1;
  const isSuitedGapper = gap >= 2 && gap <= 3;
  const isSuitedBroadway = hi >= 10 && lo >= 10;
  const isSuitedWheelAce = hi === 14 && lo <= 5;
  return isSuitedConnector || isSuitedGapper || isSuitedBroadway || isSuitedWheelAce;
}

function classifyStartingHandTier(heroCards = []) {
  const cards = normalizeHeroCards(heroCards);
  if (cards.length !== 2) return "unknown";
  const v1 = RANK_VALUES[cards[0].rank] || 0;
  const v2 = RANK_VALUES[cards[1].rank] || 0;
  const suited = cards[0].suit === cards[1].suit;
  const pair = cards[0].rank === cards[1].rank;
  const hi = Math.max(v1, v2);
  const lo = Math.min(v1, v2);
  if (pair && hi >= 12) return "premium"; // QQ+
  if (suited && hi === 14 && lo === 13) return "premium"; // AKs
  if (pair && hi >= 10) return "strong";
  return "other";
}

function isPremiumHoldingContext(node = {}, heroCards = []) {
  const classification =
    node?.classification && typeof node.classification === "object"
      ? node.classification
      : {};
  const tier = String(classification?.hand_tier || "").trim().toLowerCase();
  const pairType = String(classification?.pair_type || "").trim().toLowerCase();
  const madeHandType = String(classification?.made_hand_type || "")
    .trim()
    .toLowerCase();
  if (Boolean(classification?.premium_holding)) return true;
  if (tier === "premium") return true;
  if (pairType === "overpair" || madeHandType === "overpair") return true;
  const street = String(node?.street || "").trim().toLowerCase();
  if (street === "preflop" && classifyStartingHandTier(heroCards) === "premium") return true;
  return false;
}

function hasPremiumExceptionLanguage(text = "") {
  return /\b(icm|bubble|satellite|payout|exploit|population|extreme multiway|multiway all-?in)\b/i.test(
    String(text || ""),
  );
}

function hasPremiumExceptionNodeContext(node = {}) {
  const tags = [
    ...(Array.isArray(node?.strategic_tags) ? node.strategic_tags : []),
    ...(Array.isArray(node?.tags) ? node.tags : []),
  ]
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean);
  const playersRemaining = Array.isArray(node?.action_time_state?.players_remaining)
    ? node.action_time_state.players_remaining.filter(Boolean).length
    : 0;
  const preferredAction = String(node?.preferred_action?.action || "")
    .trim()
    .toLowerCase();
  const hasIcmTag = tags.some((tag) => tag.includes("icm"));
  const hasExtremeMultiwayTag = tags.some(
    (tag) => tag.includes("extreme_multiway") || tag.includes("multiway_all_in"),
  );
  const spr = Number(node?.metrics?.spr);
  const unusualStackConstraint =
    Number.isFinite(spr) &&
    spr > 0 &&
    spr <= 0.3 &&
    preferredAction === "fold";
  return hasIcmTag || hasExtremeMultiwayTag || playersRemaining >= 3 || unusualStackConstraint;
}

function boardCardsForStreet(hand = {}, street = "preflop") {
  const safeStreet = String(street || "").toLowerCase();
  if (safeStreet === "preflop") return [];
  const cards = [];
  const flop = Array.isArray(hand?.board?.flop) ? hand.board.flop : [];
  for (const card of flop) {
    const normalized = normalizeCard(card);
    if (normalized) cards.push(normalized);
  }
  if (safeStreet === "turn" || safeStreet === "river") {
    const turn = normalizeCard(hand?.board?.turn);
    if (turn) cards.push(turn);
  }
  if (safeStreet === "river") {
    const river = normalizeCard(hand?.board?.river);
    if (river) cards.push(river);
  }
  return cards;
}

function boardProfile(cards = []) {
  if (!Array.isArray(cards) || cards.length < 3) {
    return {
      paired: false,
      monotone: false,
      twoTone: false,
      dynamic: false,
      hasStraightDrawTexture: false,
      texture_bucket: "dry_static",
    };
  }
  const suitCounts = new Map();
  const rankCounts = new Map();
  const values = [];
  cards.forEach((card) => {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
    rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
    values.push(RANK_VALUES[card.rank] || 0);
  });
  const paired = Array.from(rankCounts.values()).some((count) => count >= 2);
  const monotone = Array.from(suitCounts.values()).some((count) => count >= 3);
  const twoTone =
    !monotone &&
    suitCounts.size === 2 &&
    Array.from(suitCounts.values()).some((count) => count >= 2);
  const uniqueValues = Array.from(new Set(values)).sort((a, b) => a - b);
  let longestRun = 1;
  let run = 1;
  for (let i = 1; i < uniqueValues.length; i += 1) {
    if (uniqueValues[i] === uniqueValues[i - 1] + 1) {
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 1;
    }
  }
  const span =
    uniqueValues.length > 1 ? uniqueValues[uniqueValues.length - 1] - uniqueValues[0] : 0;
  const hasStraightDrawTexture =
    longestRun >= 3 || (uniqueValues.length >= 4 && span <= 4);
  const dynamic = monotone || twoTone || hasStraightDrawTexture || paired;
  let textureBucket = "dry_static";
  if (
    monotone ||
    (hasStraightDrawTexture && (twoTone || cards.length >= 4)) ||
    (twoTone && cards.length >= 4)
  ) {
    textureBucket = "wet_draw_heavy";
  } else if (twoTone || hasStraightDrawTexture || paired) {
    textureBucket = "semi_dynamic";
  }
  return {
    paired,
    monotone,
    twoTone,
    dynamic,
    hasStraightDrawTexture,
    texture_bucket: textureBucket,
  };
}

function describedTextureBucket(text = "") {
  const value = String(text || "").toLowerCase();
  const hasDry =
    /\bdry\b/.test(value) ||
    /\bstatic\b/.test(value) ||
    /\bdisconnected\b/.test(value);
  const hasSemi =
    /semi[-\s]?dynamic/.test(value) ||
    /moderately[-\s]?dynamic/.test(value) ||
    /moderately[-\s]?connected/.test(value) ||
    /medium[-\s]?connect(?:ed|ivity)/.test(value) ||
    /somewhat[-\s]?coordinated/.test(value) ||
    /mildly[-\s]?dynamic/.test(value) ||
    /coordinated/.test(value);
  const hasWet =
    /\bwet\b/.test(value) ||
    /draw[-\s]?heavy/.test(value) ||
    /high[-\s]?interaction/.test(value) ||
    /highly[-\s]?connected/.test(value) ||
    /monotone/.test(value);
  if (hasWet) return "wet_draw_heavy";
  if (hasSemi) return "semi_dynamic";
  if (hasDry) return "dry_static";
  return null;
}

function isExtremeTextureMismatch(describedBucket, actualBucket) {
  if (!describedBucket || !actualBucket) return false;
  if (describedBucket === "dry_static" && actualBucket === "wet_draw_heavy") {
    return true;
  }
  if (describedBucket === "wet_draw_heavy" && actualBucket === "dry_static") {
    return true;
  }
  return false;
}

function normalizeStreetNodes(review = {}) {
  const nodes = Array.isArray(review?.street_intelligence?.street_reviews)
    ? review.street_intelligence.street_reviews
    : [];
  return nodes
    .slice()
    .sort((a, b) => {
      const ai = STREET_ORDER.indexOf(String(a?.street || "").toLowerCase());
      const bi = STREET_ORDER.indexOf(String(b?.street || "").toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
}

function textForStreetNode(node = {}) {
  const analysis = node?.analysis || {};
  return [
    String(analysis?.insight || ""),
    String(analysis?.range_context || ""),
    String(analysis?.board_texture || ""),
    String(analysis?.sizing_commentary || ""),
    String(analysis?.plan_commentary || ""),
    String(analysis?.takeaway || ""),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

function makeFinding({
  severity = "warning",
  category = "coherence",
  code = "generic",
  street = null,
  message = "",
}) {
  return { severity, category, code, street, message };
}

function evaluateFakePrecision(streetNodes = []) {
  const findings = [];
  const fakePrecisionPatterns = [
    /\b\d{1,2}\.\d+%\s+equity\b/i,
    /\b\d{1,2}%\s+equity\b/i,
    /\bexact(?:ly)?\s+\d{1,2}(?:\.\d+)?%\b/i,
    /\bGTO says\b/i,
    /\bsolver (?:says|shows|proves)\b/i,
    /\balways\b/i,
    /\bnever\b/i,
  ];
  streetNodes.forEach((node) => {
    const text = textForStreetNode(node);
    fakePrecisionPatterns.forEach((pattern) => {
      if (!pattern.test(text)) return;
      findings.push(
        makeFinding({
          severity: /always|never|solver|GTO/i.test(String(pattern))
            ? "failure"
            : "warning",
          category: "hallucination_risk",
          code: "fake_precision",
          street: node?.street || null,
          message: "Detected unsupported precision/certainty language.",
        }),
      );
    });
  });
  return findings;
}

function evaluateTerminology(streetNodes = [], hand = {}) {
  const findings = [];
  const heroHand = Array.isArray(hand?.heroCards) ? hand.heroCards : [];
  const speculativeDefendableHeroHand = isSpeculativeDefendableHolding(heroHand);
  const premiumWeakLabelPattern =
    /\b(weak pair|marginal hand|marginal holding|speculative holding|weak showdown value|low showdown value|poor showdown value)\b/i;
  const premiumPassiveFoldPattern =
    /\b(folding is preferred|fold(?:ing)? (?:is )?(?:best|better|preferred)|preserve stack|stack preservation)\b/i;
  streetNodes.forEach((node) => {
    const street = String(node?.street || "").toLowerCase();
    const text = textForStreetNode(node);
    if (street === "preflop" && /\b(top pair|two pair|trips|set|flush|straight)\b/i.test(text)) {
      findings.push(
        makeFinding({
          severity: "warning",
          category: "terminology_accuracy",
          code: "preflop_postflop_terminology",
          street,
          message: "Postflop made-hand terminology used in preflop commentary.",
        }),
      );
    }
    if (/\bpressure opponent'?s bluffs\b/i.test(text)) {
      findings.push(
        makeFinding({
          severity: "failure",
          category: "strategic_correctness",
          code: "bluff_semantics_misuse",
          street,
          message: "Bluff terminology appears strategically inconsistent.",
        }),
      );
    }
    if (/\bair\b/i.test(text) && Array.isArray(heroHand) && heroHand.length === 2) {
      const category = String(node?.classification?.made_hand_category || "");
      if (category && category !== "air") {
        findings.push(
          makeFinding({
            severity: "warning",
            category: "terminology_accuracy",
            code: "air_misclassification",
            street,
            message: "Commentary references air while classification indicates made hand value.",
          }),
        );
      } else if (speculativeDefendableHeroHand) {
        findings.push(
          makeFinding({
            severity: "warning",
            category: "terminology_accuracy",
            code: "air_overuse_speculative_holding",
            street,
            message:
              'Commentary uses "air" for a speculative/defendable suited holding; prefer nuanced terminology.',
          }),
        );
      }
    }
    const premiumSpot = isPremiumHoldingContext(node, heroHand);
    if (
      premiumSpot &&
      (premiumWeakLabelPattern.test(text) || premiumPassiveFoldPattern.test(text)) &&
      !hasPremiumExceptionLanguage(text)
    ) {
      findings.push(
        makeFinding({
          severity: "failure",
          category: "terminology_accuracy",
          code: "premium_hand_misclassification",
          street,
          message:
            "Premium holding was framed with weak/marginal or passive fold-preservation language.",
        }),
      );
    }
  });
  return findings;
}

function evaluatePremiumStrategicAlignment(streetNodes = [], hand = {}) {
  const findings = [];
  const heroHand = Array.isArray(hand?.heroCards) ? hand.heroCards : [];
  const passivityPattern =
    /\b(preserve stack|stack preservation|avoid marginal spots|weak showdown value|low showdown value|poor showdown value|marginal hand|marginal holding)\b/i;

  streetNodes.forEach((node) => {
    const premiumSpot = isPremiumHoldingContext(node, heroHand);
    if (!premiumSpot) return;
    const text = textForStreetNode(node);
    const preferredAction = String(node?.preferred_action?.action || "")
      .trim()
      .toLowerCase();
    const hasException =
      hasPremiumExceptionLanguage(text) || hasPremiumExceptionNodeContext(node);
    const foldByDefault =
      preferredAction === "fold" ||
      /\b(folding is preferred|fold is preferred|default fold|discipline(?:d)? fold)\b/i.test(text);

    if (foldByDefault && !hasException) {
      findings.push(
        makeFinding({
          severity: "failure",
          category: "strategic_correctness",
          code: "premium_action_misalignment",
          street: String(node?.street || "").toLowerCase() || null,
          message: "Premium holding was aligned to a default fold baseline without explicit exception context.",
        }),
      );
    }

    if (passivityPattern.test(text) && !hasException) {
      findings.push(
        makeFinding({
          severity: "failure",
          category: "coherence",
          code: "premium_hand_passivity_conflict",
          street: String(node?.street || "").toLowerCase() || null,
          message: "Premium holding was framed with passive stack-preservation/weak-showdown language.",
        }),
      );
    }
  });

  return findings;
}

function evaluateLanguageRealism(streetNodes = []) {
  const findings = [];
  const fillerPatterns = [
    /\bgather information\b/i,
    /\bsee where (you|we)(?:'re| are) at\b/i,
    /\bkeep(?:s)? options open\b/i,
    /\bavoid unnecessary risk\b/i,
    /\bapply pressure broadly\b/i,
    /\bstay balanced\b/i,
  ];
  const concreteConceptPattern =
    /\b(showdown value|equity realization|fold equity|pot control|range advantage|bluff[-\s]?catch(?:ing|er)?|protection|stack preservation|commitment threshold|range interaction|blocker effects?)\b/i;

  streetNodes.forEach((node) => {
    const text = textForStreetNode(node);
    const hasFiller = fillerPatterns.some((pattern) => pattern.test(text));
    if (!hasFiller) return;
    const hasConcrete = concreteConceptPattern.test(text);
    findings.push(
      makeFinding({
        severity: hasConcrete ? "warning" : "failure",
        category: "poker_language_realism",
        code: "generic_coaching_cliche",
        street: node?.street || null,
        message: hasConcrete
          ? "Generic coaching phrase detected; prefer direct strategic phrasing."
          : "Generic coaching cliché used without concrete strategic context.",
      }),
    );
  });
  return findings;
}

function evaluateBoardTextureLanguage(streetNodes = [], hand = {}) {
  const findings = [];
  streetNodes.forEach((node) => {
    const street = String(node?.street || "").toLowerCase();
    if (street === "preflop") return;
    const text = textForStreetNode(node);
    const cards = boardCardsForStreet(hand, street);
    const profile = boardProfile(cards);
    const bucket = describedTextureBucket(text);
    if (
      bucket === "dry_static" &&
      isExtremeTextureMismatch(bucket, profile.texture_bucket)
    ) {
      findings.push(
        makeFinding({
          severity: "warning",
          category: "terminology_accuracy",
          code: "dry_board_mismatch",
          street,
          message: "Board described as dry while texture appears dynamic.",
        }),
      );
    }
    if (
      bucket === "wet_draw_heavy" &&
      isExtremeTextureMismatch(bucket, profile.texture_bucket)
    ) {
      findings.push(
        makeFinding({
          severity: "warning",
          category: "terminology_accuracy",
          code: "wet_board_mismatch",
          street,
          message: "Board described as wet/dynamic while texture appears static.",
        }),
      );
    }
    // Intentionally tolerant: semi-dynamic / moderate descriptors are soft labels.
    // We only flag clearly opposite extreme language (dry vs wet) to reduce false positives.
  });
  return findings;
}

function evaluateBluffCatcherLogic(streetNodes = []) {
  const findings = [];
  streetNodes.forEach((node) => {
    const text = textForStreetNode(node);
    const isBluffCatcher = Boolean(node?.classification?.bluff_catcher);
    if (!isBluffCatcher) return;
    if (/\bthin value\b|\bvalue[- ]bet\b|\bfor value\b/i.test(text)) {
      findings.push(
        makeFinding({
          severity: "failure",
          category: "strategic_correctness",
          code: "bluff_catcher_as_value_hand",
          street: node?.street || null,
          message:
            "Bluff-catcher node framed as value hand; this is strategically inconsistent.",
        }),
      );
    }
  });
  return findings;
}

function evaluateStrategicConsistency(streetNodes = []) {
  const findings = [];
  streetNodes.forEach((node) => {
    const takenAction = String(node?.action_taken?.action || "")
      .trim()
      .toLowerCase();
    const preferredAction = String(node?.preferred_action?.action || "")
      .trim()
      .toLowerCase();
    const score = Number(node?.score);
    const text = textForStreetNode(node);
    if (
      Number.isFinite(score) &&
      score <= -1 &&
      preferredAction &&
      takenAction &&
      preferredAction === takenAction &&
      !node?.skipped
    ) {
      findings.push(
        makeFinding({
          severity: "warning",
          category: "coherence",
          code: "score_action_contradiction",
          street: node?.street || null,
          message:
            "Negative score despite preferred action matching action taken.",
        }),
      );
    }
    if (/\bjam\b/i.test(text) && /\bavoid commitment\b|\bpot control\b/i.test(text)) {
      findings.push(
        makeFinding({
          severity: "warning",
          category: "coherence",
          code: "aggression_passivity_mismatch",
          street: node?.street || null,
          message: "Aggressive and passive recommendations appear mixed without clear context.",
        }),
      );
    }
  });
  return findings;
}

function evaluateVerbosity(streetNodes = []) {
  const findings = [];
  const tokens = [];
  const nonSignalTokens = new Set([
    "board",
    "range",
    "value",
    "sizing",
    "action",
    "street",
    "pot",
    "pressure",
    "stack",
    "turn",
    "river",
    "flop",
    "preflop",
    "check",
    "call",
    "bet",
    "raise",
    "fold",
  ]);
  streetNodes.forEach((node) => {
    const text = textForStreetNode(node);
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    tokens.push(...words);
    if (words.length > 180) {
      findings.push(
        makeFinding({
          severity: "warning",
          category: "verbosity",
          code: "street_oververbose",
          street: node?.street || null,
          message: "Street commentary may be too verbose for timeline consumption.",
        }),
      );
    }
  });
  const freq = new Map();
  tokens.forEach((token) => {
    if (token.length < 5) return;
    if (nonSignalTokens.has(token)) return;
    freq.set(token, (freq.get(token) || 0) + 1);
  });
  const repeated = Array.from(freq.entries()).filter(([, count]) => count >= 10).length;
  if (repeated > 0) {
    findings.push(
      makeFinding({
        severity: "warning",
        category: "verbosity",
        code: "repeated_concepts",
        street: null,
        message: "Repeated phrasing suggests bloated or generic coaching language.",
      }),
    );
  }
  return findings;
}

function evaluateConfidenceRealism(review = {}, streetNodes = []) {
  const findings = [];
  const reviewConfidence = String(review?.confidence || "").toLowerCase();
  const lowSignalNodes = streetNodes.filter((node) => {
    const isRunout = Boolean(node?.skipped);
    const boardTexture = String(node?.analysis?.board_texture || "")
      .trim()
      .toLowerCase();
    const hasKnownBoard =
      boardTexture.length > 0 &&
      !boardTexture.includes("no board cards") &&
      !boardTexture.includes("board details unavailable");
    return isRunout || !hasKnownBoard;
  });
  if (reviewConfidence === "high" && lowSignalNodes.length >= 2) {
    findings.push(
      makeFinding({
        severity: "warning",
        category: "poker_language_realism",
        code: "overconfident_low_signal",
        street: null,
        message: "High confidence appears overstated relative to available signal quality.",
      }),
    );
  }
  return findings;
}

function categoryScoreFromFindings(findings = [], category, baseline = 100) {
  const scoped = findings.filter((item) => item.category === category);
  let score = baseline;
  scoped.forEach((item) => {
    score -= item.severity === "failure" ? 22 : 10;
  });
  return toScore(score);
}

function hallucinationRiskFromFindings(findings = []) {
  const scoped = findings.filter((item) =>
    ["hallucination_risk", "strategic_correctness", "coherence"].includes(item.category),
  );
  let risk = 6;
  scoped.forEach((item) => {
    risk += item.severity === "failure" ? 12 : 6;
  });
  return toScore(risk);
}

function suggestionsFromFindings(findings = []) {
  const suggestions = [];
  if (findings.some((item) => item.code === "fake_precision")) {
    suggestions.push(
      "Use probabilistic phrasing without unsupported exact equity or solver-certainty claims.",
    );
  }
  if (findings.some((item) => item.code === "dry_board_mismatch" || item.code === "wet_board_mismatch")) {
    suggestions.push(
      "Align board-texture language with card-driven texture features (paired/connected/suited).",
    );
  }
  if (findings.some((item) => item.code === "bluff_catcher_as_value_hand")) {
    suggestions.push(
      "Separate bluff-catcher framing from thin-value narratives in river guidance.",
    );
  }
  if (findings.some((item) => item.code === "street_oververbose" || item.code === "repeated_concepts")) {
    suggestions.push("Compress repeated concepts into one concise actionable takeaway per street.");
  }
  if (findings.some((item) => item.code === "generic_coaching_cliche")) {
    suggestions.push(
      "Replace generic coaching clichés with concrete mechanisms (showdown value, fold equity, range interaction, blocker effects).",
    );
  }
  if (findings.some((item) => item.code === "air_overuse_speculative_holding")) {
    suggestions.push(
      'Reserve "air" for true low-equity misses; use nuanced labels for suited speculative/backdoor-capable holdings.',
    );
  }
  if (findings.some((item) => item.code === "premium_hand_misclassification")) {
    suggestions.push(
      "Preserve premium-hand framing (premium pair/overpair/top-tier value) and avoid weak or default fold-preservation language without explicit ICM/exploit context.",
    );
  }
  if (
    findings.some(
      (item) =>
        item.code === "premium_action_misalignment" ||
        item.code === "premium_hand_passivity_conflict",
    )
  ) {
    suggestions.push(
      "For premium holdings, default to continue/value-aggression baselines and treat fold-passive lines as exception-only (ICM/exploit/extreme pressure).",
    );
  }
  if (!suggestions.length) {
    suggestions.push("Maintain concise, strategically coherent, population-aware coaching tone.");
  }
  return Array.from(new Set(suggestions));
}

export function resolveReviewEvaluationThresholds(overrides = {}) {
  const minimumCoherenceScore = Number(
    overrides?.minimum_coherence_score ?? process.env.REVIEW_QA_MIN_COHERENCE_SCORE,
  );
  const maximumHallucinationRisk = Number(
    overrides?.maximum_hallucination_risk ?? process.env.REVIEW_QA_MAX_HALLUCINATION_RISK,
  );
  return {
    minimum_coherence_score: Number.isFinite(minimumCoherenceScore)
      ? minimumCoherenceScore
      : DEFAULT_REVIEW_EVAL_THRESHOLDS.minimum_coherence_score,
    maximum_hallucination_risk: Number.isFinite(maximumHallucinationRisk)
      ? maximumHallucinationRisk
      : DEFAULT_REVIEW_EVAL_THRESHOLDS.maximum_hallucination_risk,
  };
}

export function evaluatePokerReviewQuality({
  review = {},
  hand = {},
  thresholds = {},
} = {}) {
  const streetNodes = normalizeStreetNodes(review);
  const findings = [
    ...evaluateTerminology(streetNodes, hand),
    ...evaluatePremiumStrategicAlignment(streetNodes, hand),
    ...evaluateLanguageRealism(streetNodes),
    ...evaluateBoardTextureLanguage(streetNodes, hand),
    ...evaluateBluffCatcherLogic(streetNodes),
    ...evaluateStrategicConsistency(streetNodes),
    ...evaluateVerbosity(streetNodes),
    ...evaluateFakePrecision(streetNodes),
    ...evaluateConfidenceRealism(review, streetNodes),
  ];

  const resolvedThresholds = resolveReviewEvaluationThresholds(thresholds);
  const categories = {
    strategic_correctness: categoryScoreFromFindings(findings, "strategic_correctness"),
    poker_language_realism: categoryScoreFromFindings(findings, "poker_language_realism"),
    terminology_accuracy: categoryScoreFromFindings(findings, "terminology_accuracy"),
    hallucination_risk: hallucinationRiskFromFindings(findings),
    verbosity: categoryScoreFromFindings(findings, "verbosity"),
    coherence: categoryScoreFromFindings(findings, "coherence"),
  };

  const failures = findings.filter((item) => item.severity === "failure");
  const warnings = findings.filter((item) => item.severity === "warning");
  if (categories.coherence < resolvedThresholds.minimum_coherence_score) {
    warnings.push(
      makeFinding({
        severity: "warning",
        category: "coherence",
        code: "coherence_threshold_breach",
        street: null,
        message: `Coherence score ${categories.coherence} is below threshold ${resolvedThresholds.minimum_coherence_score}.`,
      }),
    );
  }
  if (categories.hallucination_risk > resolvedThresholds.maximum_hallucination_risk) {
    warnings.push(
      makeFinding({
        severity: "warning",
        category: "hallucination_risk",
        code: "hallucination_threshold_breach",
        street: null,
        message: `Hallucination risk ${categories.hallucination_risk} exceeds threshold ${resolvedThresholds.maximum_hallucination_risk}.`,
      }),
    );
  }

  const scoreBlend = [
    categories.strategic_correctness,
    categories.poker_language_realism,
    categories.terminology_accuracy,
    categories.verbosity,
    categories.coherence,
    100 - categories.hallucination_risk,
  ];
  const overallScore = toScore(
    scoreBlend.reduce((sum, value) => sum + value, 0) / Math.max(1, scoreBlend.length),
  );

  return {
    evaluation: {
      overall_score: overallScore,
      categories,
      failures,
      warnings,
      suggestions: suggestionsFromFindings([...failures, ...warnings]),
      thresholds: resolvedThresholds,
      generated_at: new Date().toISOString(),
    },
  };
}

export function attachReviewEvaluation({
  review = {},
  hand = {},
  thresholds = {},
  includeDetailedReport = false,
} = {}) {
  const report = evaluatePokerReviewQuality({
    review,
    hand,
    thresholds,
  });
  const out = {
    ...review,
    evaluation: report.evaluation,
  };
  if (!includeDetailedReport) return out;
  return {
    ...out,
    evaluation_report: {
      failures: report.evaluation.failures,
      warnings: report.evaluation.warnings,
      suggestions: report.evaluation.suggestions,
    },
  };
}

