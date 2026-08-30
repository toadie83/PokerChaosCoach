export const DEFAULT_TOURNAMENT_STAGE = "auto";

export const TOURNAMENT_STAGE_CODES = Object.freeze([
  "auto",
  "early_reentry",
  "middle_accumulation",
  "bubble_pressure",
  "post_bubble",
  "late_endgame",
]);

const VALID_TOURNAMENT_STAGES = new Set(TOURNAMENT_STAGE_CODES);

const STAGE_PROFILES = Object.freeze({
  auto: {
    label: "Auto / Standard",
    riskPremium: "unknown",
    objective:
      "Use the supplied decision state without adding a manual tournament-stage assumption.",
    preflop:
      "Use stack-, position-, ante-, action-, and opponent-specific tournament chip-EV baselines. Do not invent bubble or payout pressure.",
    postflop:
      "Let range interaction, position, player count, pot, SPR, and effective stack drive betting and pot control.",
  },
  early_reentry: {
    label: "Early / Re-entry",
    riskPremium: "low_approximate",
    objective:
      "Accumulate through clean value and positional advantage without treating re-entry as permission for marginal stack-offs.",
    preflop:
      "Keep early-position ranges disciplined, favor playable and nut-producing hands when deep, and isolate loose limpers with a value-led range and coherent size.",
    postflop:
      "High SPR increases one-pair caution. Build large pots with robust value and strong draws, trim multiway bluffs, and value bet calling-heavy fields.",
  },
  middle_accumulation: {
    label: "Middle / Accumulation",
    riskPremium: "low_to_moderate_approximate",
    objective:
      "Accumulate selectively as antes and stack compression make passivity more expensive.",
    preflop:
      "Increase position-led steals and selective reshoves, reduce speculative flats as depth falls, and plan opens against stacks capable of jamming.",
    postflop:
      "Lower SPR raises the relative value of strong one-pair hands but leaves less room for aimless calls. Plan commitment and future sizing before investing.",
  },
  bubble_pressure: {
    label: "Bubble Pressure",
    riskPremium: "elevated_unquantified",
    objective:
      "Use stack coverage to apply or respect qualitative bubble pressure without claiming exact ICM.",
    preflop:
      "Calling and call-off ranges often tighten more than first-in ranges. Covering stacks can pressure capped medium stacks; covered stacks should avoid marginal stack-threatening continues; short stacks must preserve fold equity.",
    postflop:
      "Avoid marginal stack-threatening bluff-catches when covered. A covering aggressor may use efficient small pressure where range advantage supports it, but should not bluff opponents who are demonstrably insensitive to the bubble.",
  },
  post_bubble: {
    label: "Post-Bubble / In the Money",
    riskPremium: "reduced_after_bubble_approximate",
    objective:
      "Rebase toward chip accumulation after the bubble while anticipating a temporary increase in short-stack aggression.",
    preflop:
      "Do not retain stone-bubble tightness. Reopen positionally, anticipate reshoves from released short stacks, and enter with a coherent response plan.",
    postflop:
      "Let stack depth and SPR lead again. Exploit opponents who remain too tight, value bet loose callers, and avoid automatic multiway gambles merely because Hero has cashed.",
  },
  late_endgame: {
    label: "Late / Endgame",
    riskPremium: "high_but_unquantified",
    objective:
      "Maximize qualitative payout equity through stack-role-aware pressure while acknowledging that exact payouts and field distribution are missing.",
    preflop:
      "Favor coherent small-open, raise-fold, reshove, and first-in jam strategies over speculative flats. Covering stacks can pressure constrained medium stacks; covered stacks need stronger call-offs.",
    postflop:
      "Shallow SPR often reduces the number of streets, while payout pressure makes marginal calls expensive. Size around stack geometry and avoid inventing final-table risk premiums.",
  },
});

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function normalizeTournamentStage(value) {
  const code = String(value || "").trim().toLowerCase();
  return VALID_TOURNAMENT_STAGES.has(code)
    ? code
    : DEFAULT_TOURNAMENT_STAGE;
}

export function deriveCoverageRole(context = {}) {
  const decision = context?.decisionNode || {};
  const stackInfo = context?.stackInfo || {};
  const hero = finiteNonNegative(
    decision?.startingHeroStackBB,
  ) ?? finiteNonNegative(stackInfo?.heroStarting) ?? finiteNonNegative(context?.heroStackBB);
  const villain = finiteNonNegative(
    decision?.startingOpponentStackBB,
  ) ?? finiteNonNegative(stackInfo?.villainStarting) ?? finiteNonNegative(context?.villainStackBB);

  if (hero === null || villain === null) return "unknown";
  if (hero > villain) return "covers_villain";
  if (hero < villain) return "covered_by_villain";
  return "equal_stacks";
}

export function buildTournamentStageGuidance(context = {}) {
  const gameType = String(
    context?.decisionNode?.gameType || context?.gameType || context?.format || "",
  ).toLowerCase();
  if (gameType !== "tournament") return null;

  const code = normalizeTournamentStage(context?.tournamentStage);
  const profile = STAGE_PROFILES[code];
  const coverageRole = deriveCoverageRole(context);
  const isApproximate = code !== "auto";

  return {
    code,
    label: profile.label,
    source: code === "auto" ? "default" : "user_selected_approximation",
    certainty: isApproximate ? "approximate" : "unspecified",
    riskPremium: profile.riskPremium,
    coverageRole,
    objective: profile.objective,
    preflopAdjustment: profile.preflop,
    postflopAdjustment: profile.postflop,
    guardrails: [
      "Tournament stage modifies the supplied decision; it never overrides legal actions, cards, position, pot odds, effective stack, SPR, or action history.",
      "Stack depth and tournament stage are independent. A deep stack does not prove an early stage, and a short stack does not prove a late stage.",
      "Coverage is only relative to the supplied opponent; do not infer the full table stack distribution.",
      "Without exact payouts, paid places, and players remaining, use qualitative ICM language only and never claim exact risk premiums or solver ranges.",
    ],
  };
}

export const TOURNAMENT_STAGE_LIFECYCLE_RULES = `Tournament-stage lifecycle rules:
- A supplied tournamentStage is an approximate strategic lens across preflop, flop, turn, and river. It is not a solved ICM model.
- Apply stage guidance only to tournament decisions. Cash decisions never use bubble, payout, ladder, survival, or re-entry pressure.
- Stack depth and tournament stage are independent. Effective stack controls available lines and SPR; stage modifies risk tolerance, pressure targets, range shape, and call-off thresholds.
- On bubble and endgame nodes, identify whether Hero covers the supplied opponent before recommending pressure. Never say all players should simply tighten.
- ICM commonly changes calls, defenses, and stack-threatening continues more than first-in opening ranges. Explain the affected range region rather than applying a blanket aggression slider.
- Pot control is not monotonic: early high-SPR one-pair caution differs from bubble risk-premium caution, while late shallow SPR can leave little room for multi-street pot control.
- Use low- and mid-stakes population evidence when supplied: value bet loose callers, trim multiway bluffs, and respect under-bluffed large passive-line aggression.
- Exact payout data, players remaining, paid places, stack distribution, and special formats such as satellites override this approximate standard-MTT lens when explicitly supplied. Explicit bounty guidance combines with this stage lens rather than silently replacing it.`;

export const __tournamentStageTestables = {
  profiles: STAGE_PROFILES,
};
