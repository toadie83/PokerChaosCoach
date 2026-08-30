import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TOURNAMENT_STAGE,
  TOURNAMENT_STAGE_OPTIONS,
  getTournamentStageMeta,
  isIcmSensitiveTournamentStage,
  normalizeTournamentStage,
} from "../src/config/tournamentStageConfig.js";

test("tournament stage catalogue has a stable auto default and unique codes", () => {
  const codes = TOURNAMENT_STAGE_OPTIONS.map((option) => option.code);
  assert.equal(DEFAULT_TOURNAMENT_STAGE, "auto");
  assert.equal(codes[0], DEFAULT_TOURNAMENT_STAGE);
  assert.equal(new Set(codes).size, codes.length);
  assert.deepEqual(codes, [
    "auto",
    "early_reentry",
    "middle_accumulation",
    "bubble_pressure",
    "post_bubble",
    "late_endgame",
  ]);
});

test("unknown tournament stages safely normalize to auto", () => {
  assert.equal(normalizeTournamentStage("bubble_pressure"), "bubble_pressure");
  assert.equal(normalizeTournamentStage("not-a-stage"), "auto");
  assert.equal(normalizeTournamentStage(null), "auto");
  assert.equal(getTournamentStageMeta("late_endgame").shortLabel, "Endgame");
});

test("only bubble and endgame quick-range contexts are ICM sensitive", () => {
  assert.equal(isIcmSensitiveTournamentStage("bubble_pressure"), true);
  assert.equal(isIcmSensitiveTournamentStage("late_endgame"), true);
  assert.equal(isIcmSensitiveTournamentStage("post_bubble"), false);
  assert.equal(isIcmSensitiveTournamentStage("auto"), false);
});
