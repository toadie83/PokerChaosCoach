import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNTY_TOURNAMENT_LIFECYCLE_RULES,
  buildBountyTournamentGuidance,
  normalizeBountyMode,
} from "../src/bountyTournamentService.js";

const bountyContext = (overrides = {}) => ({
  bountyMode: "progressive_ko",
  gameType: "tournament",
  heroStackBB: 35,
  villainStackBB: 8,
  decisionNode: {
    gameType: "tournament",
    startingHeroStackBB: 35,
    startingOpponentStackBB: 8,
    playersInHand: 2,
    playersLiveAtDecision: 2,
    playersYetToActCount: 0,
    playersYetToActSeats: [],
    facingAction: { type: "jam", actorSeat: "BTN", allIn: true },
  },
  ...overrides,
});

test("closed heads-up all-in receives a conservative knockout adjustment", () => {
  const guidance = buildBountyTournamentGuidance(bountyContext());
  assert.equal(guidance.mode, "progressive_ko");
  assert.equal(guidance.coverageRole, "covers_villain");
  assert.equal(guidance.directKnockoutOpportunity, true);
  assert.equal(guidance.actionClosed, true);
  assert.match(guidance.decisionAdjustment, /close chip-EV fold may continue slightly wider/i);
  assert.equal(guidance.amountKnown, false);
});

test("ordinary bounty preflop nodes preserve normal chip-EV ranges", () => {
  const guidance = buildBountyTournamentGuidance({
    bountyMode: "progressive_ko",
    gameType: "tournament",
    heroStackBB: 35,
    villainStackBB: 60,
    decisionNode: {
      street: "preflop",
      decisionKind: "unopened",
      gameType: "tournament",
      startingHeroStackBB: 35,
      startingOpponentStackBB: 60,
      effectiveStackBB: 35,
      legalActions: ["fold", "open", "jam"],
      playersYetToActCount: 4,
    },
  });

  assert.equal(guidance.coverageRole, "covered_by_villain");
  assert.equal(guidance.materialAtDecision, false);
  assert.equal(guidance.ordinaryPreflopNode, true);
  assert.match(guidance.decisionAdjustment, /preserve the normal chip-EV RFI/i);
  assert.match(guidance.decisionAdjustment, /do not tighten/i);
});

test("a shallow reshove decision keeps bounty materiality available", () => {
  const guidance = buildBountyTournamentGuidance({
    bountyMode: "standard_ko",
    gameType: "tournament",
    heroStackBB: 18,
    villainStackBB: 12,
    decisionNode: {
      street: "preflop",
      decisionKind: "facing_open",
      gameType: "tournament",
      startingHeroStackBB: 18,
      startingOpponentStackBB: 12,
      effectiveStackBB: 12,
      legalActions: ["fold", "call", "3-bet", "jam"],
      facingAction: { type: "open", actorSeat: "CO", toAmountBB: 2 },
      playersYetToActCount: 0,
    },
  });

  assert.equal(guidance.materialAtDecision, true);
  assert.equal(guidance.shallowReshoveCandidate, true);
});

test("players behind prevent a simple bounty isolation rule", () => {
  const guidance = buildBountyTournamentGuidance(
    bountyContext({
      decisionNode: {
        gameType: "tournament",
        startingHeroStackBB: 50,
        startingOpponentStackBB: 15,
        playersInHand: 2,
        playersLiveAtDecision: 4,
        playersYetToActCount: 2,
        playersYetToActSeats: ["SB", "BB"],
        facingAction: { type: "jam", actorSeat: "CO", allIn: true },
      },
    }),
  );
  assert.equal(guidance.actionClosed, false);
  assert.equal(guidance.multiway, true);
  assert.match(guidance.decisionAdjustment, /prevent a simple widening rule/i);
  assert.match(guidance.decisionAdjustment, /every live continuing range/i);
});

test("covered Hero receives no fictional bounty upside", () => {
  const guidance = buildBountyTournamentGuidance(
    bountyContext({
      heroStackBB: 12,
      villainStackBB: 40,
      decisionNode: {
        gameType: "tournament",
        startingHeroStackBB: 12,
        startingOpponentStackBB: 40,
        playersInHand: 2,
        playersYetToActCount: 0,
        facingAction: { type: "jam", actorSeat: "BB", allIn: true },
      },
    }),
  );
  assert.equal(guidance.coverageRole, "covered_by_villain");
  assert.equal(guidance.directKnockoutOpportunity, false);
  assert.equal(guidance.heroBountyAtRisk, true);
  assert.match(guidance.decisionAdjustment, /cannot currently win/i);
  assert.match(guidance.decisionAdjustment, /reducing Hero's bluff fold equity/i);
});

test("cash and disabled bounty contexts receive no bounty guidance", () => {
  assert.equal(
    buildBountyTournamentGuidance(bountyContext({ bountyMode: "none" })),
    null,
  );
  assert.equal(
    buildBountyTournamentGuidance({
      bountyMode: "standard_ko",
      gameType: "cash",
      decisionNode: { gameType: "cash" },
    }),
    null,
  );
  assert.equal(normalizeBountyMode("invalid"), "none");
});

test("bounty rules preserve raw pot odds and acknowledge unknown amounts", () => {
  assert.match(BOUNTY_TOURNAMENT_LIFECYCLE_RULES, /never as fabricated pot equity/i);
  assert.match(BOUNTY_TOURNAMENT_LIFECYCLE_RULES, /Keep displayed pot odds raw/i);
  assert.match(BOUNTY_TOURNAMENT_LIFECYCLE_RULES, /players remain behind/i);
  assert.match(BOUNTY_TOURNAMENT_LIFECYCLE_RULES, /lower confidence/i);
  assert.match(BOUNTY_TOURNAMENT_LIFECYCLE_RULES, /materialAtDecision/i);
  assert.match(BOUNTY_TOURNAMENT_LIFECYCLE_RULES, /normal chip-EV RFI/i);
});
