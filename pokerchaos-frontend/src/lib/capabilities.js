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

export function getCapabilityState(entitlements, capabilityKey) {
  const explicit = entitlements?.capabilities?.[capabilityKey];
  if (typeof explicit === "string" && explicit) return explicit;

  if (capabilityKey === CAPABILITY_KEYS.STUDY_SPOTS) {
    return CAPABILITY_STATES.ENABLED;
  }
  if (capabilityKey === CAPABILITY_KEYS.COACH) {
    return CAPABILITY_STATES.DISABLED;
  }
  if (capabilityKey === CAPABILITY_KEYS.TOURNAMENT_REVIEW) {
    if (entitlements?.billing?.hasActiveSubscription) {
      return CAPABILITY_STATES.ACTIVE;
    }
    if (entitlements?.features?.review) return CAPABILITY_STATES.TRIAL;
  }
  return CAPABILITY_STATES.LOCKED;
}

export function canAccessCapability(entitlements, capabilityKey) {
  const state = getCapabilityState(entitlements, capabilityKey);
  if (capabilityKey === CAPABILITY_KEYS.STUDY_SPOTS) {
    return state === CAPABILITY_STATES.ENABLED;
  }
  if (capabilityKey === CAPABILITY_KEYS.TOURNAMENT_REVIEW) {
    return (
      state === CAPABILITY_STATES.TRIAL || state === CAPABILITY_STATES.ACTIVE
    );
  }
  return state === CAPABILITY_STATES.ACTIVE;
}

export function getCapabilityStatusLabel(entitlements, capabilityKey) {
  const state = getCapabilityState(entitlements, capabilityKey);
  if (capabilityKey === CAPABILITY_KEYS.STUDY_SPOTS) return "Free";
  if (state === CAPABILITY_STATES.ACTIVE) return "Included";
  if (state === CAPABILITY_STATES.TRIAL) return "Trial";
  if (state === CAPABILITY_STATES.DISABLED) return "Coming later";
  return "Locked";
}

