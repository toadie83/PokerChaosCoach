import { deriveCoverageRole } from "./tournamentStageService.js";

export const DEFAULT_BOUNTY_MODE = "none";

export const BOUNTY_MODE_CODES = Object.freeze([
  "none",
  "unknown",
  "standard_ko",
  "progressive_ko",
]);

const VALID_BOUNTY_MODES = new Set(BOUNTY_MODE_CODES);

const BOUNTY_PROFILES = Object.freeze({
  unknown: {
    label: "Bounty tournament · type unknown",
    formatAssumption:
      "The knockout format and bounty values are unknown. Use only a small qualitative adjustment in close decisions.",
  },
  standard_ko: {
    label: "Standard knockout",
    formatAssumption:
      "Assume an ordinary fixed knockout incentive, but do not assign it a cash value, chip value, or equity percentage.",
  },
  progressive_ko: {
    label: "Progressive knockout",
    formatAssumption:
      "Individual bounties may differ materially. With no current bounty amount, keep close knockout decisions lower confidence and never assume an average late-stage bounty.",
  },
});

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function normalizeBountyMode(value) {
  const code = String(value || "").trim().toLowerCase();
  return VALID_BOUNTY_MODES.has(code) ? code : DEFAULT_BOUNTY_MODE;
}

function decisionPlayerContext(context = {}) {
  const decision = context?.decisionNode || {};
  const hasSeatData = Array.isArray(decision?.playersYetToActSeats);
  const seats = hasSeatData
    ? decision.playersYetToActSeats.filter(Boolean)
    : [];
  const explicitCount = finiteNonNegative(decision?.playersYetToActCount);
  const playersYetToActCount = explicitCount ?? (hasSeatData ? seats.length : null);
  const playersLiveAtDecision =
    finiteNonNegative(decision?.playersLiveAtDecision) ??
    finiteNonNegative(decision?.playersInHand) ??
    finiteNonNegative(context?.playersInHand) ??
    2;
  return {
    playersYetToActCount,
    playersYetToActSeats: seats.map((seat) => String(seat).toUpperCase()),
    playersLiveAtDecision,
    actionClosed: playersYetToActCount === 0,
    multiway: playersLiveAtDecision > 2,
  };
}

export function buildBountyTournamentGuidance(context = {}) {
  const gameType = String(
    context?.decisionNode?.gameType || context?.gameType || context?.format || "",
  ).toLowerCase();
  const mode = normalizeBountyMode(
    context?.bountyMode || context?.decisionNode?.bountyMode,
  );
  if (gameType !== "tournament" || mode === DEFAULT_BOUNTY_MODE) return null;

  const profile = BOUNTY_PROFILES[mode];
  const decision = context?.decisionNode || {};
  const coverageRole = deriveCoverageRole(context);
  const playerContext = decisionPlayerContext(context);
  const street = String(decision?.street || context?.street || "").toLowerCase();
  const decisionKind = String(decision?.decisionKind || "").toLowerCase();
  const facingAllIn = Boolean(decision?.facingAction?.allIn);
  const legalActions = new Set(
    (Array.isArray(decision?.legalActions) ? decision.legalActions : []).map(
      (action) => String(action || "").toLowerCase(),
    ),
  );
  const effectiveStackBB = finiteNonNegative(decision?.effectiveStackBB);
  const spr = finiteNonNegative(
    decision?.spr ?? decision?.effectiveStackToPotRatio,
  );
  const canCommitNow = legalActions.has("jam") || legalActions.has("call");
  const shallowReshoveCandidate =
    street === "preflop" &&
    Boolean(decision?.facingAction) &&
    legalActions.has("jam") &&
    effectiveStackBB !== null &&
    effectiveStackBB <= 20;
  const lowSprCommitmentCandidate =
    street !== "preflop" &&
    canCommitNow &&
    spr !== null &&
    spr <= 1;
  const materialAtDecision =
    facingAllIn || shallowReshoveCandidate || lowSprCommitmentCandidate;
  const ordinaryPreflopNode =
    street === "preflop" &&
    ["unopened", "facing_open", "facing_open_callers", "facing_3bet"].includes(
      decisionKind,
    ) &&
    !materialAtDecision;
  const directKnockoutOpportunity =
    coverageRole === "covers_villain" && facingAllIn;
  const heroBountyAtRisk =
    ["covered_by_villain", "equal_stacks"].includes(coverageRole) &&
    facingAllIn;

  let decisionAdjustment =
    "Do not alter the normal chip-EV action solely because a bounty is enabled.";
  if (!materialAtDecision) {
    decisionAdjustment = ordinaryPreflopNode
      ? "The bounty is not material to this ordinary preflop node. Preserve the normal chip-EV RFI, call, blind-defence, and non-all-in 3-bet ranges; do not tighten because Hero is covered or the bounty amount is unknown."
      : "No immediate knockout or stack-commitment decision exists. Keep the normal chip-EV action and bluff frequency; bounty format is context only on this node.";
  } else if (directKnockoutOpportunity && playerContext.actionClosed && !playerContext.multiway) {
    decisionAdjustment =
      "Hero covers the all-in opponent and action is closed heads-up. A close chip-EV fold may continue slightly wider for the knockout incentive, but a clear fold remains a fold.";
  } else if (directKnockoutOpportunity) {
    decisionAdjustment =
      "Hero can win the all-in opponent's bounty, but players behind or a multiway pot prevent a simple widening rule. Require robust equity against every live continuing range.";
  } else if (coverageRole === "covers_villain") {
    decisionAdjustment =
      "Hero covers the named opponent, so future all-in and isolation decisions can receive a small knockout incentive; ordinary non-commitment actions should remain range- and pot-driven.";
  } else if (coverageRole === "covered_by_villain") {
    decisionAdjustment =
      "At this commitment node Hero cannot currently win the covering opponent's bounty. Expect the covering player to continue somewhat wider for Hero's bounty, reducing Hero's bluff fold equity only in this marginal commitment branch without tightening unrelated ordinary preflop ranges.";
  } else if (coverageRole === "equal_stacks") {
    decisionAdjustment =
      "The stacks are effectively equal, so knockout eligibility depends on exact commitments. Treat bounty upside as uncertain and avoid widening without a clearly closed all-in node.";
  } else {
    decisionAdjustment =
      "Stack coverage is unknown. Do not widen a call, reshove, or bluff on assumed bounty value.";
  }

  return {
    enabled: true,
    mode,
    label: profile.label,
    amountKnown: false,
    certainty: "qualitative_no_bounty_amount",
    coverageRole,
    facingAllIn,
    materialAtDecision,
    ordinaryPreflopNode,
    shallowReshoveCandidate,
    lowSprCommitmentCandidate,
    directKnockoutOpportunity,
    heroBountyAtRisk,
    ...playerContext,
    formatAssumption: profile.formatAssumption,
    decisionAdjustment,
    guardrails: [
      "Bounty value is not part of potBB, contestablePotBB, or the displayed raw pot-odds percentage. Never add a fictional BB amount or quote a bounty-adjusted equity threshold.",
      "Use the bounty adjustment only to resolve close decisions. It cannot turn a materially losing chip-EV continue into a confident call or jam.",
      "When materialAtDecision is false, preserve normal chip-EV opens, blind defenses, calls, 3-bets, and bluffs. Coverage and a missing bounty amount are not reasons to tighten that ordinary node.",
      "A positive knockout adjustment requires Hero to cover the opponent and be able to eliminate them in this pot.",
      "When Hero is covered, the main adjustment is reduced fold equity because opponents can pursue Hero's bounty; Hero does not gain the covering opponent's bounty by surviving.",
      "Players behind, unknown stacks, and multiway action override simple isolation or call-wider heuristics.",
      "Bubble and final-table payout pressure still applies. Without exact payouts and bounty values, neither ordinary ICM nor bounty value receives a numerical risk premium.",
      "State the missing bounty amount as an assumption and lower confidence when it could change a close all-in decision.",
    ],
  };
}

export const BOUNTY_TOURNAMENT_LIFECYCLE_RULES = `Bounty-tournament rules when no bounty amounts are supplied:
- Treat bounty guidance as a qualitative overlay on the supplied chip-EV decision, never as fabricated pot equity or extra BB in potBB.
- Check bountyLens.materialAtDecision first. When false, use normal chip-EV RFI, defend, call and 3-bet ranges and normal heads-up bluff construction; do not tighten simply because Hero is covered, coverage is unknown, or bounty amounts are missing.
- Apply a positive knockout adjustment only when Hero covers the opponent and can eliminate them in the current pot.
- Widen only close all-in continues, isolations, or reshoves. The cleanest adjustment is heads-up with action closed; a clear chip-EV fold remains a fold.
- If players remain behind or the pot is multiway, evaluate all live ranges and Hero's maximum exposure. Bounty interest is not permission to overjam through covering stacks.
- When the opponent covers Hero at a material commitment node, Hero has no immediate bounty upside against that opponent. Expect somewhat wider calls or reshoves from covering players and reduce marginal bluff aggression only in that affected commitment branch.
- Bounty formats can create wider short-stack shoves, calls, and overcalls, but do not apply a blanket aggression increase to ordinary opens or postflop small pots.
- Keep displayed pot odds raw. Never quote an exact bounty-adjusted equity requirement without the actual bounty and payout inputs.
- Combine bounty incentives with the selected tournament stage. Do not erase bubble or final-table risk premiums, and do not claim solved PKO ICM.
- In reasoning or assumptions, say the bounty adjustment is qualitative and lower confidence when the missing amount could reverse a close commitment decision.`;

export const __bountyTournamentTestables = {
  profiles: BOUNTY_PROFILES,
  decisionPlayerContext,
};
