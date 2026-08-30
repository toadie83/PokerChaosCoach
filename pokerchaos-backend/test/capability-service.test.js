import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_KEYS,
  CAPABILITY_STATES,
  canAccessCapability,
  createCapabilityGuard,
  getCapabilityDenial,
  resolveCapabilities,
} from "../src/capabilityService.js";

test("registered users always receive Study Spots access", () => {
  const capabilities = resolveCapabilities({});

  assert.equal(
    capabilities[CAPABILITY_KEYS.STUDY_SPOTS],
    CAPABILITY_STATES.ENABLED,
  );
  assert.equal(canAccessCapability(capabilities, "study_spots"), true);
});

test("Tournament Review maps billing and trial access to explicit states", () => {
  assert.equal(
    resolveCapabilities({})[CAPABILITY_KEYS.TOURNAMENT_REVIEW],
    CAPABILITY_STATES.LOCKED,
  );
  assert.equal(
    resolveCapabilities({ reviewAi: true })[
      CAPABILITY_KEYS.TOURNAMENT_REVIEW
    ],
    CAPABILITY_STATES.TRIAL,
  );
  assert.equal(
    resolveCapabilities({ billing: { hasActiveSubscription: true } })[
      CAPABILITY_KEYS.TOURNAMENT_REVIEW
    ],
    CAPABILITY_STATES.ACTIVE,
  );
  assert.equal(
    resolveCapabilities({ admin: true })[CAPABILITY_KEYS.TOURNAMENT_REVIEW],
    CAPABILITY_STATES.ACTIVE,
  );
});

test("Coach stays disabled for ordinary and billing-only users", () => {
  for (const entitlements of [
    {},
    { billing: { hasActiveSubscription: true } },
  ]) {
    const capabilities = resolveCapabilities(entitlements);
    assert.equal(capabilities[CAPABILITY_KEYS.COACH], "disabled");
    assert.equal(canAccessCapability(capabilities, "coach"), false);
    assert.equal(getCapabilityDenial(capabilities, "coach").code, "CAPABILITY_DISABLED");
  }
});

test("Coach is active only for server-resolved developer bypasses", () => {
  for (const entitlements of [
    { coach: true },
    { admin: true },
    { developer: true },
  ]) {
    const capabilities = resolveCapabilities(entitlements);
    assert.equal(capabilities[CAPABILITY_KEYS.COACH], "active");
    assert.equal(canAccessCapability(capabilities, "coach"), true);
  }
});

test("unknown capabilities fail closed", () => {
  const capabilities = resolveCapabilities({ reviewAi: true });
  assert.equal(canAccessCapability(capabilities, "unknown"), false);
});

function invokeGuard(capabilities, capabilityKey) {
  let nextCalled = false;
  let responseStatus = null;
  let responseBody = null;
  const req = { entitlements: { capabilities } };
  const res = {
    status(value) {
      responseStatus = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return value;
    },
  };
  createCapabilityGuard(capabilityKey)(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, responseStatus, responseBody };
}

test("capability middleware rejects disabled Coach and locked Review directly", () => {
  const capabilities = resolveCapabilities({});

  const coach = invokeGuard(capabilities, CAPABILITY_KEYS.COACH);
  assert.equal(coach.nextCalled, false);
  assert.equal(coach.responseStatus, 403);
  assert.equal(coach.responseBody.code, "CAPABILITY_DISABLED");

  const review = invokeGuard(capabilities, CAPABILITY_KEYS.TOURNAMENT_REVIEW);
  assert.equal(review.nextCalled, false);
  assert.equal(review.responseStatus, 403);
  assert.equal(review.responseBody.code, "CAPABILITY_LOCKED");
});

test("capability middleware admits enabled Study Spots and entitled Review", () => {
  const free = invokeGuard(resolveCapabilities({}), CAPABILITY_KEYS.STUDY_SPOTS);
  assert.equal(free.nextCalled, true);

  const trial = invokeGuard(
    resolveCapabilities({ reviewAi: true }),
    CAPABILITY_KEYS.TOURNAMENT_REVIEW,
  );
  assert.equal(trial.nextCalled, true);

  const coach = invokeGuard(
    resolveCapabilities({ developer: true }),
    CAPABILITY_KEYS.COACH,
  );
  assert.equal(coach.nextCalled, true);
});
