import assert from "node:assert/strict";
import test from "node:test";

import { buildCoachRefreshState } from "../src/lib/coachRefresh.js";

test("Coach refresh preserves the original decision while applying current configuration", () => {
  const original = {
    street: "preflop",
    lastEvent: "opened_to_me",
    nextActor: "hero",
    history: [{ actor: "opp", action: "open", toAmountBB: 2 }],
    heroCards: { card1: "As", card2: "Qd" },
    heroStackBB: 30,
    tournamentStage: "early_reentry",
    bountyMode: "none",
  };
  const current = {
    street: "preflop",
    lastEvent: "hero_fold",
    nextActor: "complete",
    history: [...original.history, { actor: "hero", action: "fold" }],
    heroCards: { card1: "As", card2: "Qd" },
    heroStackBB: 31.5,
    tournamentStage: "bubble_pressure",
    bountyMode: "progressive_ko",
    chaosMode: true,
  };

  const refreshed = buildCoachRefreshState(original, current);
  assert.equal(refreshed.lastEvent, "opened_to_me");
  assert.equal(refreshed.nextActor, "hero");
  assert.deepEqual(refreshed.history, original.history);
  assert.equal(refreshed.heroStackBB, 31.5);
  assert.equal(refreshed.tournamentStage, "bubble_pressure");
  assert.equal(refreshed.bountyMode, "progressive_ko");
  assert.equal(refreshed.chaosMode, true);

  current.heroCards.card1 = "2c";
  assert.deepEqual(refreshed.heroCards, { card1: "As", card2: "Qd" });
});

test("Coach refresh requires a preserved decision snapshot", () => {
  assert.equal(buildCoachRefreshState(null, {}), null);
});
