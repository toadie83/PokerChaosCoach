export const FREE_STUDY_PLAN_SESSION_KEY = "playback_free_study_plan_v1";
export const FREE_STUDY_PLAN_ALLOWANCE_KEY = "playback_free_study_plan_allowance_v1";
export const FREE_STUDY_PLAN_ALLOWANCE_LIMIT = 3;

function normalizeAllowanceCount(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(count, FREE_STUDY_PLAN_ALLOWANCE_LIMIT);
}

export function loadFreeStudyPlanAllowance(storage = globalThis.localStorage) {
  let used = 0;
  try {
    const rawValue = storage?.getItem(FREE_STUDY_PLAN_ALLOWANCE_KEY);
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      used = normalizeAllowanceCount(
        typeof parsed === "number" ? parsed : parsed?.successfulPlans,
      );
    }
  } catch {
    used = 0;
  }
  return {
    used,
    remaining: Math.max(0, FREE_STUDY_PLAN_ALLOWANCE_LIMIT - used),
    limitReached: used >= FREE_STUDY_PLAN_ALLOWANCE_LIMIT,
  };
}

export function recordFreeStudyPlanUse(storage = globalThis.localStorage) {
  const current = loadFreeStudyPlanAllowance(storage);
  const used = Math.min(FREE_STUDY_PLAN_ALLOWANCE_LIMIT, current.used + 1);
  try {
    storage?.setItem(FREE_STUDY_PLAN_ALLOWANCE_KEY, JSON.stringify({
      successfulPlans: used,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // The API limiter remains the abuse-protection backstop when storage is unavailable.
  }
  return {
    used,
    remaining: Math.max(0, FREE_STUDY_PLAN_ALLOWANCE_LIMIT - used),
    limitReached: used >= FREE_STUDY_PLAN_ALLOWANCE_LIMIT,
  };
}

export function saveFreeStudyPlanResult(result, storage = globalThis.sessionStorage) {
  const spots = Array.isArray(result?.report?.spots)
    ? result.report.spots.slice(0, 3)
    : [];
  const value = {
    report: { ...result?.report, spots, spotCount: spots.length },
    tournament: result?.tournament || {},
    receivedAt: new Date().toISOString(),
  };
  storage?.setItem(FREE_STUDY_PLAN_SESSION_KEY, JSON.stringify(value));
  return value;
}

export function loadFreeStudyPlanResult(storage = globalThis.sessionStorage) {
  try {
    const rawResult = storage?.getItem(FREE_STUDY_PLAN_SESSION_KEY);
    if (!rawResult) return null;
    const result = JSON.parse(rawResult);
    if (!result?.report || !Array.isArray(result.report.spots)) return null;
    return result;
  } catch {
    return null;
  }
}
