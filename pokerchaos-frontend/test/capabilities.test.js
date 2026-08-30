import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessCapability,
  getCapabilityState,
  getCapabilityStatusLabel,
} from "../src/lib/capabilities.js";

test("explicit capability states drive frontend access", () => {
  const entitlements = {
    capabilities: {
      study_spots: "enabled",
      tournament_review: "trial",
      coach: "disabled",
    },
  };

  assert.equal(canAccessCapability(entitlements, "study_spots"), true);
  assert.equal(canAccessCapability(entitlements, "tournament_review"), true);
  assert.equal(canAccessCapability(entitlements, "coach"), false);
  assert.equal(getCapabilityStatusLabel(entitlements, "study_spots"), "Free");
  assert.equal(getCapabilityStatusLabel(entitlements, "coach"), "Coming later");
});

test("legacy entitlement fallback never enables Coach", () => {
  const entitlements = {
    features: { review: true, coach: true },
    billing: { hasActiveSubscription: false },
  };

  assert.equal(getCapabilityState(entitlements, "tournament_review"), "trial");
  assert.equal(getCapabilityState(entitlements, "coach"), "disabled");
  assert.equal(canAccessCapability(entitlements, "coach"), false);
});

test("explicit server Coach capability enables the developer route", () => {
  const entitlements = {
    capabilities: { coach: "active" },
  };
  assert.equal(getCapabilityState(entitlements, "coach"), "active");
  assert.equal(canAccessCapability(entitlements, "coach"), true);
  assert.equal(getCapabilityStatusLabel(entitlements, "coach"), "Included");
});
