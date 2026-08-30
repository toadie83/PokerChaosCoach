import assert from "node:assert/strict";
import test from "node:test";

import {
  BOUNTY_MODE_OPTIONS,
  DEFAULT_BOUNTY_MODE,
  getBountyModeMeta,
  isBountyTournament,
  normalizeBountyMode,
} from "../src/config/bountyTournamentConfig.js";

test("bounty formats have a safe off default and unique codes", () => {
  assert.equal(DEFAULT_BOUNTY_MODE, "none");
  assert.equal(
    new Set(BOUNTY_MODE_OPTIONS.map((option) => option.code)).size,
    BOUNTY_MODE_OPTIONS.length,
  );
  assert.equal(normalizeBountyMode("not-a-format"), "none");
});

test("standard KO, PKO, and unknown bounty formats are enabled", () => {
  for (const code of ["unknown", "standard_ko", "progressive_ko"]) {
    assert.equal(isBountyTournament(code), true);
    assert.equal(getBountyModeMeta(code).code, code);
  }
  assert.equal(isBountyTournament("none"), false);
});
