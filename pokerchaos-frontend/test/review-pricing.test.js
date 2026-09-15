import assert from "node:assert/strict";
import test from "node:test";
import {
  getAvailableReviewCredits,
  REVIEW_MONTHLY_CREDITS,
  REVIEW_PLAN_PRICE,
  REVIEW_TOPUP_CREDITS,
  REVIEW_TOPUP_PRICE,
  REVIEW_TRIAL_CREDITS,
} from "../src/lib/reviewPricing.js";

test("published Review pricing matches the implemented allowances", () => {
  assert.equal(REVIEW_PLAN_PRICE, "£12/month");
  assert.equal(REVIEW_MONTHLY_CREDITS, 100);
  assert.equal(REVIEW_TRIAL_CREDITS, 5);
  assert.equal(REVIEW_TOPUP_PRICE, "£5");
  assert.equal(REVIEW_TOPUP_CREDITS, 30);
});

test("available credits follow the active billing bucket and admin bypass", () => {
  const credits = { trial: { remaining: 3 }, paid: { remaining: 72 } };
  assert.equal(getAvailableReviewCredits({ credits }), 3);
  assert.equal(getAvailableReviewCredits({ credits, hasActiveSubscription: true }), 72);
  assert.equal(getAvailableReviewCredits({ credits, unlimited: true }), null);
});
