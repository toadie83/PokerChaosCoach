import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTournamentStageGuidance,
  deriveCoverageRole,
  normalizeTournamentStage,
} from "../src/tournamentStageService.js";

const tournamentContext = (overrides = {}) => ({
  tournamentStage: "bubble_pressure",
  gameType: "tournament",
  heroStackBB: 42,
  villainStackBB: 24,
  decisionNode: {
    gameType: "tournament",
    startingHeroStackBB: 42,
    startingOpponentStackBB: 24,
  },
  ...overrides,
});

test("stage guidance derives coverage from total stacks rather than effective stack", () => {
  const context = tournamentContext();
  assert.equal(deriveCoverageRole(context), "covers_villain");
  assert.equal(buildTournamentStageGuidance(context).coverageRole, "covers_villain");

  const covered = tournamentContext({
    heroStackBB: 18,
    villainStackBB: 50,
    decisionNode: {
      gameType: "tournament",
      startingHeroStackBB: 18,
      startingOpponentStackBB: 50,
      effectiveStackBB: 18,
    },
  });
  assert.equal(deriveCoverageRole(covered), "covered_by_villain");
});

test("bubble guidance is qualitative and records missing exact ICM inputs", () => {
  const guidance = buildTournamentStageGuidance(tournamentContext());
  assert.equal(guidance.code, "bubble_pressure");
  assert.equal(guidance.certainty, "approximate");
  assert.match(guidance.preflopAdjustment, /call-off ranges/i);
  assert.ok(guidance.guardrails.some((line) => /exact payouts/i.test(line)));
});

test("cash decisions never receive tournament-stage guidance", () => {
  const guidance = buildTournamentStageGuidance({
    tournamentStage: "late_endgame",
    gameType: "cash",
    decisionNode: { gameType: "cash" },
  });
  assert.equal(guidance, null);
});

test("missing and invalid stage values remain backwards-compatible", () => {
  assert.equal(normalizeTournamentStage(), "auto");
  assert.equal(normalizeTournamentStage("invalid"), "auto");
  assert.equal(
    buildTournamentStageGuidance(tournamentContext({ tournamentStage: undefined })).code,
    "auto",
  );
});

test("each selectable stage supplies distinct preflop and postflop lifecycle guidance", () => {
  const expectations = [
    ["early_reentry", /isolate loose limpers/i, /High SPR/i],
    ["middle_accumulation", /selective reshoves/i, /commitment and future sizing/i],
    ["bubble_pressure", /Calling and call-off ranges/i, /stack-threatening bluff-catches/i],
    ["post_bubble", /Do not retain stone-bubble tightness/i, /stack depth and SPR lead again/i],
    ["late_endgame", /raise-fold, reshove/i, /payout pressure makes marginal calls expensive/i],
  ];

  for (const [stage, preflopPattern, postflopPattern] of expectations) {
    const guidance = buildTournamentStageGuidance(
      tournamentContext({ tournamentStage: stage }),
    );
    assert.equal(guidance.code, stage);
    assert.match(guidance.preflopAdjustment, preflopPattern);
    assert.match(guidance.postflopAdjustment, postflopPattern);
  }
});
