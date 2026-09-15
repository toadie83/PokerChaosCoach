import assert from "node:assert/strict";
import test from "node:test";
import {
  isConfiguredReviewPriceValid,
  REVIEW_MONTHLY_CREDITS,
  REVIEW_PLAN_PRICE_PENCE,
  REVIEW_SUMMARY_CREDIT_COST,
  REVIEW_TOPUP_CREDITS,
  REVIEW_TOPUP_PRICE_PENCE,
  REVIEW_TRIAL_CREDITS,
} from "../src/reviewPricingService.js";

test("Review pricing uses the launched credit allowances", () => {
  assert.equal(REVIEW_TRIAL_CREDITS, 5);
  assert.equal(REVIEW_MONTHLY_CREDITS, 100);
  assert.equal(REVIEW_TOPUP_CREDITS, 30);
  assert.equal(REVIEW_PLAN_PRICE_PENCE, 1200);
  assert.equal(REVIEW_TOPUP_PRICE_PENCE, 500);
  assert.equal(REVIEW_SUMMARY_CREDIT_COST, 5);
});

test("Stripe Review checkout accepts only an active £12 GBP monthly price", () => {
  const valid = {
    active: true,
    currency: "gbp",
    unit_amount: 1200,
    recurring: { interval: "month" },
  };
  assert.equal(isConfiguredReviewPriceValid(valid), true);
  assert.equal(isConfiguredReviewPriceValid({ ...valid, unit_amount: 999 }), false);
  assert.equal(isConfiguredReviewPriceValid({ ...valid, currency: "usd" }), false);
  assert.equal(isConfiguredReviewPriceValid({ ...valid, recurring: null }), false);
  assert.equal(isConfiguredReviewPriceValid({ ...valid, active: false }), false);
});
