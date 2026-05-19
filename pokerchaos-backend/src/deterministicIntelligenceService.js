const STREETS = ["preflop", "flop", "turn", "river"];
const AGGRESSIVE_ACTIONS = new Set(["bet", "raise", "jam"]);
const PASSIVE_ACTIONS = new Set(["check", "call", "fold"]);
const CONTRIBUTION_ACTIONS = new Set([
  "post_ante",
  "post_small_blind",
  "post_big_blind",
  "call",
  "bet",
  "raise",
  "jam",
]);

const TAG_LABELS = {
  pressure_leak: "Pressure Leak",
  missed_jam: "Missed Jam",
  thin_value: "Thin Value",
  overfold_river: "Overfold River",
  hero_call: "Hero Call",
  icm_pressure: "ICM Pressure",
  sizing_leak: "Sizing Leak",
  pot_control: "Pot Control",
  delayed_cbet: "Delayed C-Bet",
  small_cbet: "Small C-Bet",
  probe_bet: "Probe Bet",
};

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

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeStreet(rawStreet) {
  const street = String(rawStreet || "")
    .trim()
    .toLowerCase();
  return STREETS.includes(street) ? street : null;
}

function sprTier(spr) {
  const value = toFiniteOrNull(spr);
  if (value === null) return "unknown";
  if (value <= 1) return "all_in";
  if (value <= 3) return "low";
  if (value <= 6) return "medium";
  return "high";
}

function pressureLevelFromScore(score) {
  if (score >= 3) return "extreme";
  if (score >= 2) return "high";
  if (score >= 1) return "medium";
  return "low";
}

function commitmentLevel(ratio) {
  const value = toFiniteOrNull(ratio);
  if (value === null || value <= 0) return "low";
  if (value >= 0.66) return "high";
  if (value >= 0.33) return "medium";
  return "low";
}

function computeContribution(action, currentCommitted) {
  const type = String(action?.type || "").trim().toLowerCase();
  if (!CONTRIBUTION_ACTIONS.has(type)) return 0;
  if (type === "raise" || type === "jam") {
    const toAmount = toFiniteOrNull(action?.toAmount);
    if (toAmount !== null) {
      const delta = toAmount - Number(currentCommitted || 0);
      return delta > 0 ? delta : 0;
    }
  }
  const amount = toFiniteOrNull(action?.amount);
  return amount !== null && amount > 0 ? amount : 0;
}

function streetDefaults(street) {
  return {
    street,
    start_pot: 0,
    end_pot: 0,
    pot_growth: 0,
    hero_actions: 0,
    hero_aggressive_actions: 0,
    villain_aggressive_actions: 0,
    has_all_in: false,
    max_hero_aggressive_ratio: null,
    max_hero_facing_ratio: null,
    hero_contribution: 0,
    hero_cumulative_commit_ratio: 0,
    commitment_level: "low",
    aggression_shift: 0,
    strategic_tags: [],
    pressure_score: 0,
    pressure_level: "low",
    spr_tier: "unknown",
    first_aggressor: null,
    hero_last_action: null,
  };
}

function createEmptyDeterministicIntelligence() {
  return {
    hand_headline_candidates: ["Street-by-street review ready"],
    strategic_tags: [],
    aggression_profile: {
      hero_aggressive_actions: 0,
      villain_aggressive_actions: 0,
      aggression_delta_bb: 0,
      passive_vs_aggressive_profile: "balanced",
    },
    pressure_profile: {
      by_street: [],
      all_in_street: null,
      pressure_shift_street: null,
      high_pressure_street: null,
    },
    spr_profile: {
      decision_spr: null,
      decision_spr_tier: "unknown",
      by_street: [],
    },
    mistake_candidates: [],
    street_summaries: STREETS.map((street) => ({
      street,
      spr_tier: "unknown",
      pressure_level: "low",
      commitment_level: "low",
      aggression_shift: 0,
      strategic_tags: [],
    })),
    replay_annotations: STREETS.map((street) => ({
      street,
      pressure_level: "low",
      commitment_level: "low",
      aggression_shift: 0,
      strategic_tags: [],
    })),
    audit_alignment: {
      by_street: [],
    },
  };
}

function parseCardCodeSafe(code) {
  const card = String(code || "").trim();
  if (!/^[2-9TJQKA][cdhs]$/i.test(card)) return null;
  const rank = card[0].toUpperCase();
  const suit = card[1].toLowerCase();
  const value = RANK_VALUES[rank] || 0;
  if (!value) return null;
  return { rank, suit, value };
}

function classifyPreflopHandArchetype(heroCards = []) {
  const cards = Array.isArray(heroCards) ? heroCards.map(parseCardCodeSafe).filter(Boolean) : [];
  if (cards.length !== 2) return "unknown";
  const [c1, c2] = cards;
  const suited = c1.suit === c2.suit;
  const pair = c1.rank === c2.rank;
  const hi = Math.max(c1.value, c2.value);
  const lo = Math.min(c1.value, c2.value);
  const gap = hi - lo;

  if (pair) {
    if (hi >= 11) return "strong_pair";
    if (hi >= 7) return "medium_pair";
    return "small_pair";
  }
  if (suited && gap === 1 && hi >= 9) return "suited_connector";
  if (suited && gap >= 2 && gap <= 3 && hi >= 8) return "suited_gapper";
  if (suited && hi >= 10 && lo >= 10) return "suited_broadway";
  if (suited && hi === 14) return "suited_ace_x";
  if (!suited && hi >= 12 && lo >= 10) return "offsuit_broadway";
  if (!suited && hi <= 9 && lo <= 7) return "weak_offsuit";
  return suited ? "suited_marginal" : "offsuit_marginal";
}

function positionBucket(position = "") {
  const pos = String(position || "").trim().toUpperCase();
  if (["UTG", "UTG+1", "UTG+2", "LJ"].includes(pos)) return "early";
  if (["HJ"].includes(pos)) return "middle";
  if (["CO", "BTN"].includes(pos)) return "late";
  if (["SB", "BB"].includes(pos)) return "blind";
  return "unknown";
}

function firstPreflopDecisionSpot(hand = {}) {
  const heroName = String(hand?.heroName || "Hero").trim() || "Hero";
  const heroPos = String(hand?.heroPosition || "").trim().toUpperCase();
  const preflop = Array.isArray(hand?.actionsByStreet?.preflop)
    ? hand.actionsByStreet.preflop
    : [];
  const actionable = preflop.filter((row) =>
    ["fold", "call", "raise", "jam", "check", "bet"].includes(
      String(row?.type || "").trim().toLowerCase(),
    ),
  );
  const heroIdx = actionable.findIndex((row) => String(row?.player || "") === heroName);
  if (heroIdx < 0) return null;
  const heroRow = actionable[heroIdx];
  const prior = actionable.slice(0, heroIdx);
  const priorAggressive = prior.filter((row) =>
    ["raise", "jam", "bet"].includes(String(row?.type || "").trim().toLowerCase()),
  );
  const priorCalls = prior.filter(
    (row) => String(row?.type || "").trim().toLowerCase() === "call",
  );
  const priorHeroVoluntary = prior.some(
    (row) =>
      String(row?.player || "") === heroName &&
      ["fold", "call", "raise", "jam", "check", "bet"].includes(
        String(row?.type || "").trim().toLowerCase(),
      ),
  );
  const facingOpen = priorAggressive.length >= 1;
  const multiwayOpen = priorAggressive.length >= 1 && priorCalls.length >= 1;

  let spot = "preflop_general";
  if (!facingOpen && !priorHeroVoluntary) {
    spot = "first_in_open_spot";
  } else if (heroPos === "BB" && facingOpen && !priorHeroVoluntary) {
    spot = "bb_defend_vs_open";
  } else if (heroPos === "SB" && facingOpen && !priorHeroVoluntary) {
    spot = "sb_defend_vs_open";
  } else if (facingOpen && multiwayOpen) {
    spot = "isolation_or_squeeze_response";
  } else if (facingOpen) {
    spot = "facing_open_response";
  }

  return {
    hero_position: heroPos || null,
    spot_classification: spot,
    hero_action: String(heroRow?.type || "").trim().toLowerCase() || "none",
    facing_open: facingOpen,
    multiway_open: multiwayOpen,
  };
}

function buildChartAlignment({
  hand = {},
  validatedHandState = {},
} = {}) {
  const archetype = classifyPreflopHandArchetype(hand?.heroCards);
  const spot = firstPreflopDecisionSpot(hand);
  const posBucket = positionBucket(spot?.hero_position || hand?.heroPosition);
  const effectiveStackBb = toFiniteOrNull(validatedHandState?.effectiveStackBB);
  const shortStack = effectiveStackBb !== null && effectiveStackBb <= 12;
  const mediumStack = effectiveStackBb !== null && effectiveStackBb > 12 && effectiveStackBb <= 25;

  const base = {
    street: "preflop",
    chart_recommendation: null,
    chart_confidence: "low",
    spot_classification: spot?.spot_classification || "preflop_general",
    solver_mix_estimate: null,
    population_adjustment: null,
  };

  if (!spot) {
    return {
      by_street: [],
    };
  }

  if (spot.spot_classification === "first_in_open_spot") {
    const earlyOpenArchetypes = new Set([
      "strong_pair",
      "medium_pair",
      "suited_broadway",
      "offsuit_broadway",
      "suited_ace_x",
    ]);
    const middleOpenArchetypes = new Set([
      ...earlyOpenArchetypes,
      "small_pair",
      "suited_connector",
      "suited_gapper",
    ]);
    const lateOpenArchetypes = new Set([
      ...middleOpenArchetypes,
      "suited_marginal",
      "offsuit_marginal",
    ]);
    const openSet =
      posBucket === "early"
        ? earlyOpenArchetypes
        : posBucket === "middle"
          ? middleOpenArchetypes
          : posBucket === "late" || posBucket === "blind"
            ? lateOpenArchetypes
            : middleOpenArchetypes;
    const isWeakOffsuitTrash = archetype === "weak_offsuit";
    const openQualified = openSet.has(archetype) && !isWeakOffsuitTrash;

    if (openQualified) {
      base.chart_recommendation = "open";
      base.chart_confidence = posBucket === "early" ? "high" : "medium";
      base.solver_mix_estimate =
        archetype === "offsuit_broadway" || archetype === "offsuit_marginal"
          ? "mixed_open"
          : "likely_open";
    } else if (
      posBucket === "late" &&
      ["suited_marginal", "offsuit_marginal"].includes(archetype)
    ) {
      base.chart_recommendation = "mixed_continue";
      base.chart_confidence = "low";
      base.solver_mix_estimate = "mixed_open_fold";
    } else {
      base.chart_recommendation = "fold";
      base.chart_confidence = posBucket === "early" ? "high" : "medium";
      base.solver_mix_estimate = "likely_fold";
    }
  } else if (
    spot.spot_classification === "bb_defend_vs_open" ||
    spot.spot_classification === "sb_defend_vs_open" ||
    spot.spot_classification === "facing_open_response"
  ) {
    if (
      [
        "suited_connector",
        "suited_gapper",
        "suited_broadway",
        "suited_ace_x",
        "medium_pair",
        "small_pair",
      ].includes(archetype)
    ) {
      base.chart_recommendation = "defend";
      base.chart_confidence = shortStack ? "low" : "medium";
      base.solver_mix_estimate = "mixed_continue";
    } else if (archetype === "offsuit_broadway" && !shortStack) {
      base.chart_recommendation = "likely_continue";
      base.chart_confidence = mediumStack ? "medium" : "low";
      base.solver_mix_estimate = "mixed_continue";
    } else {
      base.chart_recommendation = "fold";
      base.chart_confidence = "medium";
      base.solver_mix_estimate = "likely_fold";
    }
  } else {
    base.chart_recommendation = "mixed_continue";
    base.chart_confidence = "low";
    base.solver_mix_estimate = "mixed";
  }

  if (shortStack) {
    base.population_adjustment = "short_stack_tighter_defend";
  } else if (effectiveStackBb !== null && effectiveStackBb >= 35) {
    base.population_adjustment = "deep_stack_wider_realization";
  }

  return {
    by_street: [base],
  };
}

function flattenActions(hand = {}) {
  const events = [];
  for (const street of STREETS) {
    const actions = Array.isArray(hand?.actionsByStreet?.[street])
      ? hand.actionsByStreet[street]
      : [];
    actions.forEach((action, index) => {
      events.push({
        street,
        index,
        player: String(action?.player || "").trim(),
        type: String(action?.type || "").trim().toLowerCase(),
        amount: toFiniteOrNull(action?.amount),
        toAmount: toFiniteOrNull(action?.toAmount),
      });
    });
  }
  return events;
}

function simulateStreetState(hand = {}) {
  const heroName = String(hand?.heroName || "Hero").trim() || "Hero";
  const bigBlind = toFiniteOrNull(hand?.blinds?.bigBlind);
  const heroStack = toFiniteOrNull(hand?.heroStack);
  const heroStackBb =
    bigBlind && heroStack && bigBlind > 0 ? Number((heroStack / bigBlind).toFixed(2)) : null;

  const events = flattenActions(hand);
  const byStreet = new Map(STREETS.map((street) => [street, streetDefaults(street)]));
  const committedByStreet = new Map();
  let currentStreet = "preflop";
  let currentBet = 0;
  let pot = 0;
  let allInStreet = null;
  let heroCumulativeContribution = 0;
  let heroAggressiveContribution = 0;
  let villainAggressiveContribution = 0;
  let heroAggressiveActions = 0;
  let villainAggressiveActions = 0;
  let preflopLastAggressor = null;

  const enrichedEvents = [];
  const resetStreetState = (street) => {
    currentStreet = street;
    currentBet = 0;
    committedByStreet.clear();
    const summary = byStreet.get(street);
    summary.start_pot = pot;
  };

  resetStreetState("preflop");

  for (const event of events) {
    if (event.street !== currentStreet) {
      const prev = byStreet.get(currentStreet);
      prev.end_pot = pot;
      prev.pot_growth = Math.max(0, prev.end_pot - prev.start_pot);
      resetStreetState(event.street);
    }

    const summary = byStreet.get(currentStreet);
    const priorCommitted = committedByStreet.get(event.player) || 0;
    const potBefore = pot;
    const toCall = Math.max(0, currentBet - priorCommitted);
    const contribution = computeContribution(event, priorCommitted);
    const isAggressive = AGGRESSIVE_ACTIONS.has(event.type);
    const isHero = event.player === heroName;
    const ratioToPot =
      isAggressive && contribution > 0 && potBefore > 0
        ? Number((contribution / potBefore).toFixed(2))
        : null;
    const facingRatio =
      isHero && toCall > 0 && potBefore > 0 ? Number((toCall / potBefore).toFixed(2)) : null;

    if (event.type === "bet") {
      currentBet = Math.max(currentBet, contribution);
    } else if (event.type === "raise" || event.type === "jam") {
      if (event.toAmount !== null) {
        currentBet = Math.max(currentBet, event.toAmount);
      }
    }

    if (contribution > 0) {
      committedByStreet.set(event.player, priorCommitted + contribution);
      pot += contribution;
      if (isHero) {
        summary.hero_contribution += contribution;
        heroCumulativeContribution += contribution;
      }
      if (isAggressive && isHero) heroAggressiveContribution += contribution;
      if (isAggressive && !isHero) villainAggressiveContribution += contribution;
    }

    if (isHero && PASSIVE_ACTIONS.has(event.type)) summary.hero_actions += 1;
    if (isHero && isAggressive) {
      summary.hero_actions += 1;
      summary.hero_aggressive_actions += 1;
      heroAggressiveActions += 1;
      summary.hero_last_action = event.type;
    } else if (isHero) {
      summary.hero_last_action = event.type;
    }
    if (!isHero && isAggressive) {
      summary.villain_aggressive_actions += 1;
      villainAggressiveActions += 1;
      if (!summary.first_aggressor) summary.first_aggressor = event.player;
      if (currentStreet === "preflop") preflopLastAggressor = event.player;
    }
    if (isHero && isAggressive && !summary.first_aggressor) {
      summary.first_aggressor = event.player;
      if (currentStreet === "preflop") preflopLastAggressor = event.player;
    }

    if (facingRatio !== null) {
      summary.max_hero_facing_ratio = Math.max(
        summary.max_hero_facing_ratio || 0,
        facingRatio,
      );
    }
    if (ratioToPot !== null && isHero) {
      summary.max_hero_aggressive_ratio = Math.max(
        summary.max_hero_aggressive_ratio || 0,
        ratioToPot,
      );
    }

    if (event.type === "jam" || /all-?in/i.test(String(event.type))) {
      summary.has_all_in = true;
      if (!allInStreet) allInStreet = currentStreet;
    }

    if (heroStack && heroStack > 0) {
      const ratio = heroCumulativeContribution / heroStack;
      summary.hero_cumulative_commit_ratio = Number(ratio.toFixed(3));
      summary.commitment_level = commitmentLevel(ratio);
    }

    enrichedEvents.push({
      ...event,
      isHero,
      isAggressive,
      toCall,
      contribution,
      potBefore,
      ratioToPot,
      facingRatio,
    });
  }

  const finalStreet = byStreet.get(currentStreet);
  if (finalStreet) {
    finalStreet.end_pot = pot;
    finalStreet.pot_growth = Math.max(0, finalStreet.end_pot - finalStreet.start_pot);
  }
  for (const street of STREETS) {
    const summary = byStreet.get(street);
    if (!summary) continue;
    summary.end_pot = Math.max(summary.end_pot, summary.start_pot);
    summary.pot_growth = Math.max(0, summary.end_pot - summary.start_pot);
  }

  return {
    heroName,
    bigBlind,
    heroStackBb,
    byStreet,
    events: enrichedEvents,
    allInStreet,
    heroAggressiveActions,
    villainAggressiveActions,
    heroAggressiveContribution,
    villainAggressiveContribution,
    preflopLastAggressor,
  };
}

function detectStreetTags({
  street,
  summary,
  hand,
  handState,
  simulation,
}) {
  const tags = new Set();
  const heroIsPreflopAggressor = simulation.preflopLastAggressor === simulation.heroName;
  const streetEvents = simulation.events.filter((event) => event.street === street);
  const heroEvents = streetEvents.filter((event) => event.isHero);
  const villainEvents = streetEvents.filter((event) => !event.isHero);
  const firstAggressive = streetEvents.find((event) => event.isAggressive);
  const heroFirstAggressive = streetEvents.find((event) => event.isHero && event.isAggressive);
  const decisionStreet = safeStreet(handState?.street);

  if ((summary.max_hero_aggressive_ratio || 0) >= 1.1) tags.add("overbet");
  if (
    summary.max_hero_aggressive_ratio !== null &&
    summary.max_hero_aggressive_ratio > 0 &&
    summary.max_hero_aggressive_ratio <= 0.33
  ) {
    tags.add("underbet");
  }
  if (street === "flop" && heroIsPreflopAggressor) {
    if (
      heroFirstAggressive &&
      heroFirstAggressive.ratioToPot !== null &&
      heroFirstAggressive.ratioToPot <= 0.4
    ) {
      tags.add("small_cbet");
    }
  }
  if (
    street === "turn" &&
    heroIsPreflopAggressor &&
    !simulation.events.some(
      (event) => event.street === "flop" && event.isHero && event.isAggressive,
    ) &&
    heroFirstAggressive
  ) {
    tags.add("delayed_cbet");
  }
  if (
    street === "flop" &&
    !heroIsPreflopAggressor &&
    heroFirstAggressive &&
    firstAggressive &&
    firstAggressive.isHero &&
    villainEvents.every((event) => event.type === "check")
  ) {
    tags.add("probe_bet");
  }
  if (
    street === decisionStreet &&
    sprTier(handState?.math?.spr) === "all_in" &&
    handState?.heroCanRaise &&
    ["call", "check", "fold"].includes(String(summary.hero_last_action || ""))
  ) {
    tags.add("missed_jam");
  }
  if (
    (street === "turn" || street === "river") &&
    summary.hero_last_action === "check" &&
    (summary.start_pot / Math.max(simulation.bigBlind || 1, 1)) >= 12
  ) {
    tags.add("pot_control");
  }
  if (heroEvents.length > 0 && heroEvents.every((event) => PASSIVE_ACTIONS.has(event.type))) {
    tags.add("passive_line");
  }
  if (summary.pressure_level === "high" || summary.pressure_level === "extreme") {
    tags.add("high_pressure_node");
  }
  if (summary.commitment_level === "medium" || summary.commitment_level === "high") {
    tags.add("stack_commitment_point");
  }
  if (
    street === decisionStreet &&
    street === "river" &&
    Array.isArray(handState?.legalActions) &&
    handState.legalActions.length === 2 &&
    handState.legalActions.includes("call") &&
    handState.legalActions.includes("fold")
  ) {
    tags.add("bluff_catcher_node");
  }
  if (
    street === decisionStreet &&
    street === "river" &&
    summary.hero_last_action === "call" &&
    (summary.pressure_level === "high" || summary.pressure_level === "extreme")
  ) {
    tags.add("hero_call");
  }
  if (
    street === "river" &&
    summary.hero_last_action === "fold" &&
    (summary.pressure_level === "high" || summary.pressure_level === "extreme")
  ) {
    tags.add("overfold_river");
  }
  if (
    street === "river" &&
    ["bet", "raise"].includes(String(summary.hero_last_action || "")) &&
    summary.max_hero_aggressive_ratio !== null &&
    summary.max_hero_aggressive_ratio <= 0.5
  ) {
    tags.add("thin_value");
  }
  if (tags.has("overbet") || tags.has("underbet")) tags.add("sizing_leak");

  const effectiveStackBb = toFiniteOrNull(handState?.effectiveStackBB);
  if (
    street === "preflop" &&
    effectiveStackBb !== null &&
    effectiveStackBb <= 15 &&
    (summary.has_all_in || (summary.max_hero_facing_ratio || 0) >= 1)
  ) {
    tags.add("icm_pressure");
  }

  return Array.from(tags.values());
}

function deriveHeadlineCandidates({ handTags = [], streetSummaries = [], heroOutcome = {} }) {
  const headlines = [];
  const hasTag = (code) => handTags.includes(code);
  const turnJam = streetSummaries.find(
    (summary) =>
      summary.street === "turn" &&
      (summary.strategic_tags.includes("stack_commitment_point") ||
        summary.strategic_tags.includes("high_pressure_node")),
  );
  const flopUnderbet = streetSummaries.find(
    (summary) => summary.street === "flop" && summary.strategic_tags.includes("underbet"),
  );
  if (turnJam && flopUnderbet) headlines.push("Jam Turn, Trim Flop");
  if (hasTag("missed_jam")) headlines.push("Missed Jam Spot");
  if (hasTag("overfold_river")) headlines.push("Missed River Call");
  if (hasTag("pressure_leak")) headlines.push("Pressure Leak");
  if (hasTag("sizing_leak")) headlines.push("Sizing Leak");
  if (hasTag("thin_value")) headlines.push("Thin Value");
  if (hasTag("hero_call")) headlines.push("Hero Call");
  if (hasTag("pot_control")) headlines.push("Pot Control");

  const outcomeCode = String(heroOutcome?.code || "").toLowerCase();
  if (!headlines.length) {
    if (outcomeCode.includes("won")) headlines.push("Good Discipline");
    else headlines.push("High-Pressure Decision");
  }
  headlines.push("Street-by-street review ready");
  return Array.from(new Set(headlines)).slice(0, 5);
}

function deriveMistakeCandidates({ handTags = [], streetSummaries = [], handState = {}, heroOutcome = {} }) {
  const candidates = [];
  const add = (candidate) => candidates.push(candidate);
  const hasTag = (code) => handTags.includes(code);
  const decisionStreet = safeStreet(handState?.street);
  const outcomeCode = String(heroOutcome?.code || "").toLowerCase();
  const decisionSummary = streetSummaries.find((summary) => summary.street === decisionStreet);

  if (hasTag("missed_jam")) {
    add({
      code: "missed_aggression",
      street: decisionStreet || "preflop",
      severity: "medium",
      label: "Missed aggression in low SPR spot",
      reason: "Stack depth and pressure suggested a commit-or-fold node.",
    });
  }
  if (hasTag("sizing_leak")) {
    add({
      code: "suspicious_sizing",
      street: decisionStreet || "flop",
      severity: "low",
      label: "Suspicious sizing",
      reason: "Sizing diverged from common pressure/value ranges.",
    });
  }
  if (
    hasTag("pressure_leak") ||
    streetSummaries.filter((summary) => summary.strategic_tags.includes("passive_line")).length >= 2
  ) {
    add({
      code: "passive_leak",
      street: decisionStreet || "turn",
      severity: "medium",
      label: "Passive leak across pressure nodes",
      reason: "Multiple passive decisions under pressure reduced leverage.",
    });
  }
  if (
    decisionSummary &&
    decisionSummary.street === "preflop" &&
    decisionSummary.pressure_level === "extreme" &&
    String(decisionSummary.hero_last_action || "") === "call" &&
    !outcomeCode.includes("won")
  ) {
    add({
      code: "stack_off_threshold",
      street: "preflop",
      severity: "medium",
      label: "Questionable stack-off threshold",
      reason: "Calling heavy preflop pressure likely over-committed stack depth.",
    });
  }
  if (
    decisionSummary &&
    ["jam", "raise"].includes(String(decisionSummary.hero_last_action || "")) &&
    toFiniteOrNull(handState?.effectiveStackBB) !== null &&
    Number(handState.effectiveStackBB) > 25 &&
    !outcomeCode.includes("won")
  ) {
    add({
      code: "likely_punt",
      street: decisionSummary.street,
      severity: "medium",
      label: "Potential punt candidate",
      reason: "Large stack commitment with deep stack depth appears high variance.",
    });
  }

  return candidates.slice(0, 5);
}

function labelStrategicTags(tagCodes = []) {
  return Array.from(
    new Set(
      tagCodes
        .map((code) => TAG_LABELS[code] || null)
        .filter(Boolean),
    ),
  );
}

function summarizeHandLevel({
  hand,
  handState,
  simulation,
  streetSummaries,
}) {
  const bigBlind = simulation.bigBlind || 1;
  const heroWonAmount = toFiniteOrNull(hand?.heroResult?.wonAmount) || 0;
  const heroTotalContribution = streetSummaries.reduce(
    (sum, summary) => sum + (toFiniteOrNull(summary.hero_contribution) || 0),
    0,
  );
  const bbWonLost = Number(((heroWonAmount - heroTotalContribution) / Math.max(bigBlind, 1)).toFixed(2));
  const biggestPotStreet = streetSummaries
    .slice()
    .sort((a, b) => (toFiniteOrNull(b.end_pot) || 0) - (toFiniteOrNull(a.end_pot) || 0))[0]?.street;
  const pressureShiftStreet = streetSummaries
    .slice()
    .sort((a, b) => Math.abs(b.aggression_shift) - Math.abs(a.aggression_shift))[0]?.street;
  const passiveVsAggressiveProfile =
    simulation.heroAggressiveActions === 0
      ? "passive"
      : simulation.heroAggressiveActions >= 3
        ? "aggressive"
        : "balanced";

  return {
    aggression_delta_bb: Number(
      (
        (simulation.heroAggressiveContribution - simulation.villainAggressiveContribution) /
        Math.max(bigBlind, 1)
      ).toFixed(2),
    ),
    biggest_pot_street: biggestPotStreet || null,
    all_in_street: simulation.allInStreet,
    showdown_reached: Boolean(hand?.hadShowdown),
    showdown_result: String(hand?.heroOutcome?.code || "unknown"),
    bb_won_lost: bbWonLost,
    passive_vs_aggressive_profile: passiveVsAggressiveProfile,
    pressure_shift_street: pressureShiftStreet || null,
    decision_street: safeStreet(handState?.street),
  };
}

export function buildDeterministicIntelligence({
  hand = {},
  validatedHandState = {},
  handStateValidation = {},
} = {}) {
  const simulation = simulateStreetState(hand);
  if (!simulation) return createEmptyDeterministicIntelligence();

  const streetSummaries = STREETS.map((street) => {
    const summary = {
      ...streetDefaults(street),
      ...(simulation.byStreet.get(street) || {}),
    };
    const decisionStreet = safeStreet(validatedHandState?.street);
    const decisionSpr =
      decisionStreet === street ? toFiniteOrNull(validatedHandState?.math?.spr) : null;
    const fallbackSpr =
      simulation.heroStackBb && simulation.bigBlind && summary.start_pot > 0
        ? Number(((simulation.heroStackBb * simulation.bigBlind) / summary.start_pot).toFixed(2))
        : null;
    const resolvedSpr = decisionSpr !== null ? decisionSpr : fallbackSpr;
    const resolvedSprTier = sprTier(resolvedSpr);
    summary.spr_tier = resolvedSprTier;

    let pressureScore = 0;
    if (summary.has_all_in) pressureScore += 2;
    if ((summary.max_hero_facing_ratio || 0) >= 1) pressureScore += 2;
    else if ((summary.max_hero_facing_ratio || 0) >= 0.5) pressureScore += 1;
    if (resolvedSprTier === "all_in" || resolvedSprTier === "low") pressureScore += 1;
    summary.pressure_score = pressureScore;
    summary.pressure_level = pressureLevelFromScore(pressureScore);

    summary.strategic_tags = detectStreetTags({
      street,
      summary,
      hand,
      handState: validatedHandState,
      simulation,
    });
    return summary;
  });

  for (let index = 0; index < streetSummaries.length; index += 1) {
    const current = streetSummaries[index];
    const prev = index > 0 ? streetSummaries[index - 1] : null;
    const currentDelta = current.hero_aggressive_actions - current.villain_aggressive_actions;
    const prevDelta = prev
      ? prev.hero_aggressive_actions - prev.villain_aggressive_actions
      : 0;
    current.aggression_shift = currentDelta - prevDelta;
  }

  const firstCommitStreet = streetSummaries.find(
    (summary) => summary.commitment_level === "medium" || summary.commitment_level === "high",
  )?.street;
  if (firstCommitStreet) {
    const entry = streetSummaries.find((summary) => summary.street === firstCommitStreet);
    if (entry && !entry.strategic_tags.includes("stack_commitment_point")) {
      entry.strategic_tags.push("stack_commitment_point");
    }
  }

  const allTagCodes = Array.from(
    new Set(streetSummaries.flatMap((summary) => summary.strategic_tags || [])),
  );
  const hasPressureLeak =
    streetSummaries.some(
      (summary) =>
        (summary.pressure_level === "high" || summary.pressure_level === "extreme") &&
        summary.strategic_tags.includes("passive_line"),
    ) || allTagCodes.includes("missed_jam");
  if (hasPressureLeak && !allTagCodes.includes("pressure_leak")) {
    allTagCodes.push("pressure_leak");
  }

  const handLevel = summarizeHandLevel({
    hand,
    handState: validatedHandState,
    simulation,
    streetSummaries,
  });

  const mistakeCandidates = deriveMistakeCandidates({
    handTags: allTagCodes,
    streetSummaries,
    handState: validatedHandState,
    heroOutcome: hand?.heroOutcome,
  });
  const replayAnnotations = streetSummaries.map((summary) => ({
    street: summary.street,
    pressure_level: summary.pressure_level,
    commitment_level: summary.commitment_level,
    aggression_shift: summary.aggression_shift,
    strategic_tags: summary.strategic_tags,
  }));

  const strategicTags = labelStrategicTags(allTagCodes);
  const headlines = deriveHeadlineCandidates({
    handTags: allTagCodes,
    streetSummaries,
    heroOutcome: hand?.heroOutcome,
  });

  const decisionSpr = toFiniteOrNull(validatedHandState?.math?.spr);
  const highPressureStreet = streetSummaries.find(
    (summary) => summary.pressure_level === "high" || summary.pressure_level === "extreme",
  )?.street;
  const pressureShiftStreet = streetSummaries
    .slice()
    .sort((a, b) => b.pressure_score - a.pressure_score)[0]?.street;

  const out = {
    hand_headline_candidates: headlines,
    strategic_tags: strategicTags,
    aggression_profile: {
      hero_aggressive_actions: simulation.heroAggressiveActions,
      villain_aggressive_actions: simulation.villainAggressiveActions,
      aggression_delta_bb: handLevel.aggression_delta_bb,
      passive_vs_aggressive_profile: handLevel.passive_vs_aggressive_profile,
    },
    pressure_profile: {
      by_street: streetSummaries.map((summary) => ({
        street: summary.street,
        pressure_level: summary.pressure_level,
        has_all_in: summary.has_all_in,
        facing_pressure_ratio: summary.max_hero_facing_ratio,
      })),
      all_in_street: handLevel.all_in_street,
      pressure_shift_street: pressureShiftStreet || handLevel.pressure_shift_street,
      high_pressure_street: highPressureStreet || null,
    },
    spr_profile: {
      decision_spr: decisionSpr,
      decision_spr_tier: sprTier(decisionSpr),
      by_street: streetSummaries.map((summary) => ({
        street: summary.street,
        spr_tier: summary.spr_tier,
      })),
    },
    mistake_candidates: mistakeCandidates,
    street_summaries: streetSummaries.map((summary) => ({
      street: summary.street,
      spr_tier: summary.spr_tier,
      pressure_level: summary.pressure_level,
      commitment_level: summary.commitment_level,
      aggression_shift: summary.aggression_shift,
      strategic_tags: summary.strategic_tags,
      hero_last_action: summary.hero_last_action,
      pot_start_bb:
        simulation.bigBlind && simulation.bigBlind > 0
          ? Number((summary.start_pot / simulation.bigBlind).toFixed(2))
          : null,
      pot_end_bb:
        simulation.bigBlind && simulation.bigBlind > 0
          ? Number((summary.end_pot / simulation.bigBlind).toFixed(2))
          : null,
      pot_growth_bb:
        simulation.bigBlind && simulation.bigBlind > 0
          ? Number((summary.pot_growth / simulation.bigBlind).toFixed(2))
          : null,
    })),
    replay_annotations: replayAnnotations,
    audit_alignment: buildChartAlignment({
      hand,
      validatedHandState,
    }),
    hand_metadata: {
      biggest_pot_street: handLevel.biggest_pot_street,
      showdown_reached: handLevel.showdown_reached,
      showdown_result: handLevel.showdown_result,
      bb_won_lost: handLevel.bb_won_lost,
      passive_vs_aggressive_profile: handLevel.passive_vs_aggressive_profile,
      pressure_shift_street: handLevel.pressure_shift_street,
    },
  };

  const auditByStreet = new Map(
    (Array.isArray(out?.audit_alignment?.by_street) ? out.audit_alignment.by_street : [])
      .map((entry) => [String(entry?.street || "").trim().toLowerCase(), entry]),
  );
  out.street_summaries = out.street_summaries.map((summary) => ({
    ...summary,
    audit_heuristics: auditByStreet.get(String(summary?.street || "").toLowerCase()) || null,
  }));

  // TODO(solver-enrichment): blend solver baseline deltas into mistake_candidates once available.
  // TODO(population-exploits): add pool-frequency priors to pressure and sizing tags.
  // TODO(player-profiling): condition tag severity with player-specific tendencies over time.
  // TODO(ai-prompt-augmentation): pipe deterministic_intelligence into future per-street prompt context.

  if (handStateValidation && handStateValidation.isValid === false) {
    out.mistake_candidates = out.mistake_candidates.slice(0, 2);
  }
  if (!Array.isArray(out.audit_alignment?.by_street)) {
    out.audit_alignment = { by_street: [] };
  }
  return out;
}

export { createEmptyDeterministicIntelligence };
