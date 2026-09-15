export const REVIEW_TRIAL_CREDITS = 5;
export const REVIEW_MONTHLY_CREDITS = 100;
export const REVIEW_TOPUP_CREDITS = 30;
export const REVIEW_PLAN_PRICE_PENCE = 1200;
export const REVIEW_TOPUP_PRICE_PENCE = 500;
export const REVIEW_SUMMARY_CREDIT_COST = 5;

export function isConfiguredReviewPriceValid(price) {
  return Boolean(
    price?.active === true &&
      price?.currency === "gbp" &&
      price?.unit_amount === REVIEW_PLAN_PRICE_PENCE &&
      price?.recurring?.interval === "month",
  );
}
