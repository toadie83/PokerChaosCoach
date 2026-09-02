import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_STUDY_PLAN_ALLOWANCE_KEY,
  FREE_STUDY_PLAN_ALLOWANCE_LIMIT,
  FREE_STUDY_PLAN_SESSION_KEY,
  loadFreeStudyPlanAllowance,
  loadFreeStudyPlanResult,
  recordFreeStudyPlanUse,
  saveFreeStudyPlanResult,
} from "../src/lib/freeStudyPlanSession.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("free Study Plan result is session-scoped and capped to three suggestions", () => {
  const storage = memoryStorage();
  const spots = [1, 2, 3, 4].map((id) => ({ id: `spot-${id}` }));
  saveFreeStudyPlanResult({
    report: { spots, spotCount: spots.length },
    tournament: { name: "Sunday Test" },
  }, storage);

  assert.ok(storage.getItem(FREE_STUDY_PLAN_SESSION_KEY));
  const result = loadFreeStudyPlanResult(storage);
  assert.deepEqual(result.report.spots.map((spot) => spot.id), ["spot-1", "spot-2", "spot-3"]);
  assert.equal(result.report.spotCount, 3);
  assert.equal(result.tournament.name, "Sunday Test");
});

test("anonymous homepage plans stop after three successful results", () => {
  const storage = memoryStorage();

  assert.deepEqual(loadFreeStudyPlanAllowance(storage), {
    used: 0,
    remaining: FREE_STUDY_PLAN_ALLOWANCE_LIMIT,
    limitReached: false,
  });

  recordFreeStudyPlanUse(storage);
  recordFreeStudyPlanUse(storage);
  const finalAllowance = recordFreeStudyPlanUse(storage);

  assert.deepEqual(finalAllowance, {
    used: 3,
    remaining: 0,
    limitReached: true,
  });
  assert.equal(JSON.parse(storage.getItem(FREE_STUDY_PLAN_ALLOWANCE_KEY)).successfulPlans, 3);
  assert.equal(recordFreeStudyPlanUse(storage).used, 3);
});

test("invalid anonymous allowance storage recovers to a fresh browser allowance", () => {
  const storage = memoryStorage();
  storage.setItem(FREE_STUDY_PLAN_ALLOWANCE_KEY, "not-json");
  assert.equal(loadFreeStudyPlanAllowance(storage).remaining, 3);
});
