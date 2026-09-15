export const REVIEW_PLAN_PRICE = "£12/month";
export const REVIEW_MONTHLY_CREDITS = 100;
export const REVIEW_TRIAL_CREDITS = 5;
export const REVIEW_TOPUP_PRICE = "£5";
export const REVIEW_TOPUP_CREDITS = 30;
export const REVIEW_CREDITS_UPDATED_EVENT = "playback:review-credits-updated";

export function getAvailableReviewCredits(billing) {
  if (billing?.unlimited) return null;
  const bucket = billing?.hasActiveSubscription ? "paid" : "trial";
  const value = Number(billing?.credits?.[bucket]?.remaining);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
