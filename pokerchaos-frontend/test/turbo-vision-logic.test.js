import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TURBO_REGIONS,
  normalizeTurboRegions,
  validTurboRegions,
} from "../src/vision/turboVisionLogic.js";

test("default local tracking regions include valid action, stack and dealer crops", () => {
  assert.equal(validTurboRegions(DEFAULT_TURBO_REGIONS), true);
  for (const region of DEFAULT_TURBO_REGIONS) {
    assert.equal(region.action.length, 4);
    assert.equal(region.stack.length, 4);
    assert.equal(region.dealer.length, 4);
  }
  assert.equal(DEFAULT_TURBO_REGIONS[0].totalPot, null);
});

test("saved v2 regions gain derived action, stack and dealer crops", () => {
  const legacy = DEFAULT_TURBO_REGIONS.map(({ panel, bet, cards }) => ({ panel, bet, cards }));
  const migrated = normalizeTurboRegions(legacy);
  assert.equal(validTurboRegions(migrated), true);
  assert.ok(migrated.every((region) => Array.isArray(region.action) && Array.isArray(region.stack)));
  assert.ok(migrated.every((region) => Array.isArray(region.dealer)));
  assert.equal(migrated[0].totalPot, null);
});

test("an optional global Total Pot crop survives normalization", () => {
  const saved = DEFAULT_TURBO_REGIONS.map((region, seat) => ({
    ...region,
    totalPot: seat === 0 ? [0.42, 0.18, 0.16, 0.05] : null,
  }));
  const migrated = normalizeTurboRegions(saved);
  assert.equal(validTurboRegions(migrated), true);
  assert.deepEqual(migrated[0].totalPot, [0.42, 0.18, 0.16, 0.05]);
  assert.ok(migrated.slice(1).every((region) => region.totalPot === null));
});

test("malformed saved regions fail closed", () => {
  assert.equal(normalizeTurboRegions(null), null);
  assert.equal(normalizeTurboRegions(Array.from({ length: 8 }, () => ({}))), null);
});
