export const CAPABILITY_KEYS = Object.freeze({
  STUDY_SPOTS: "study_spots",
  TOURNAMENT_REVIEW: "tournament_review",
  COACH: "coach",
});

export const CAPABILITY_STATES = Object.freeze({
  ENABLED: "enabled",
  LOCKED: "locked",
  TRIAL: "trial",
  ACTIVE: "active",
  DISABLED: "disabled",
});

const CAPABILITY_ACCESS_STATES = Object.freeze({
  [CAPABILITY_KEYS.STUDY_SPOTS]: new Set([CAPABILITY_STATES.ENABLED]),
  [CAPABILITY_KEYS.TOURNAMENT_REVIEW]: new Set([
    CAPABILITY_STATES.TRIAL,
    CAPABILITY_STATES.ACTIVE,
  ]),
  [CAPABILITY_KEYS.COACH]: new Set([CAPABILITY_STATES.ACTIVE]),
});

export function resolveCapabilities(entitlements = {}) {
  const billing = entitlements?.billing || {};
  const tournamentReview = billing.hasActiveSubscription || entitlements.admin
    ? CAPABILITY_STATES.ACTIVE
    : entitlements.reviewAi
      ? CAPABILITY_STATES.TRIAL
      : CAPABILITY_STATES.LOCKED;
  const coach =
    entitlements.coach || entitlements.admin || entitlements.developer
      ? CAPABILITY_STATES.ACTIVE
      : CAPABILITY_STATES.DISABLED;

  return Object.freeze({
    [CAPABILITY_KEYS.STUDY_SPOTS]: CAPABILITY_STATES.ENABLED,
    [CAPABILITY_KEYS.TOURNAMENT_REVIEW]: tournamentReview,
    // Coach is unavailable generally; only server-resolved bypasses set it active.
    [CAPABILITY_KEYS.COACH]: coach,
  });
}

export function canAccessCapability(capabilities, capabilityKey) {
  const allowedStates = CAPABILITY_ACCESS_STATES[capabilityKey];
  if (!allowedStates) return false;
  return allowedStates.has(capabilities?.[capabilityKey]);
}

export function getCapabilityDenial(capabilities, capabilityKey) {
  const state = capabilities?.[capabilityKey] || CAPABILITY_STATES.LOCKED;
  return {
    status: 403,
    code:
      state === CAPABILITY_STATES.DISABLED
        ? "CAPABILITY_DISABLED"
        : "CAPABILITY_LOCKED",
    error:
      state === CAPABILITY_STATES.DISABLED
        ? "This capability is not available."
        : "This capability is not enabled for this account.",
    requiredCapability: capabilityKey,
    capabilityState: state,
  };
}

export function createCapabilityGuard(capabilityKey, options = {}) {
  return function capabilityGuard(req, res, next) {
    const capabilities = req.entitlements?.capabilities || {};
    if (canAccessCapability(capabilities, capabilityKey)) return next();
    const denial = getCapabilityDenial(capabilities, capabilityKey);
    options.onDenied?.(req, denial);
    return res.status(denial.status).json({
      error: denial.error,
      code: denial.code,
      requiredCapability: denial.requiredCapability,
      capabilityState: denial.capabilityState,
    });
  };
}
