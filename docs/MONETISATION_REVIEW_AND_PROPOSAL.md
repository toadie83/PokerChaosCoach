# Playback Poker monetisation review and proposal

Reviewed and implemented in the application on 14 September 2026. Provider bills were not inspected, and the configured Stripe subscription Price could not be verified from this environment. The £12 checkout is therefore guarded by a runtime price check.

## Current model and presentation

- `pokerchaos-backend/src/index.js` defaults to a one-time 100,000-token trial and a 2,000,000-token calendar-month ceiling per user. Environment settings can override both. Checkout sells one subscription through `STRIPE_PRICE_ID`; the repository does not establish its live price.
- `ensureAiQuota` checks estimated request tokens, then `trackAiUsage` records actual usage after the request. This is a useful starting point, but it is not an atomic reservation: concurrent requests and underestimated output can exceed the apparent balance.
- Trial and subscription access unlock AI Tournament Review. Coach requires a separate server entitlement; paying for Review does not enable it. Admin/developer overrides and `COACH_ALLOW_ALL` also exist, so production configuration matters.
- The homepage described Review as “Advanced / Tier 1” and Coach as unavailable. Tools Hub gave Coach no action. The Coach route was an empty “Coming later” page.
- The trial modal hardcoded 100,000 tokens / approximately 20 reviews despite configurable backend limits. “All non-AI features remain free forever” gave away future packaging flexibility. “Low-cost subscription” undersold analysis without explaining the allowance.
- Free Study Spots is not cost-free to operate. Authenticated analyse/retry routes record AI usage without consuming trial credits and do not call the review quota check. Public study-plan analysis has a default three-per-day rate limit, but logs its AI usage rather than recording it through the account usage ledger. Rate limiting alone is not an aggregate spend budget.
- Coach's `/prompts` and `/replay-vision/cards` routes enforce access but do not use `ensureAiQuota` or `trackAiUsage`. Approved early-access users could therefore create costs outside the existing review allowance.
- `calculateUsageCost` applies fixed GPT-4.1-mini input/output rates to usage regardless of the actual model; the configured review default is different. These accounting totals must not be treated as dependable profitability data.
- The Stripe webhook handler accepts parsed JSON when its signature or signing secret is absent. Before launching new paid allowances, make signature verification mandatory: subscription state is an access-control boundary.

## Recommended launch model

Sell better study outcomes with a defined allowance. Keep vendor tokens as an internal cost measure; show users understandable review credits and the exact price of each action before they run it.

| Offer | Proposed price | Included access | Boundary |
| --- | --- | --- | --- |
| Free | £0 | Basic import/replay/filtering, sample lessons, a useful preview showing three study spots; five AI review credits once after verified signup | No recurring free AI grant; ongoing AI review requires payment |
| Review | £12/month | 100 review credits per billing month, detailed review tools, saved study history and full review results | Credits reset at renewal, no rollover, no automatic overage; Coach excluded |
| Review top-up | £5 | 30 additional review credits for active Review customers | Explicit purchase; expires with the current subscription period |
| Coach early access | Individually quoted | Separately approved Coach access with a written, prepaid usage allowance | Never unlimited; no access merely for emailing or buying Review; stop at the agreed cap |

These are initial test prices. The application now publishes and enforces them. Existing active subscriptions receive the Review allowance at their next resolved billing period. Customer-facing credits align with Stripe renewal dates; the internal token safety cap remains calendar-month based.

Suggested credit menu: one standard hand review = one credit; a bounded tournament summary = five credits. Batch hand review costs the displayed number of hands. Regenerations and optional deeper analysis are new, explicitly priced actions. A previously saved identical result is free to reopen. Limit accepted input and output per operation; oversized work gets a new quote before execution. This menu must be benchmarked before it becomes a promise.

For Coach, quote against expected sessions and measured cost, initially with a small pilot cohort. An internal starting hypothesis is £39/month with no more than £8 of provider cost included, but offer a bespoke quote until workload measurements support a public price. Agree a comprehensible allowance such as a defined number of bounded analyses; do not promise session hours while request frequency and vision usage remain uncontrolled.

## Unit economics and cost controls

Use actual provider cost per operation, including input, output, cached input where applicable, image analysis, retries and repair/QA calls. Use the model actually returned by the provider, not the requested model label. Maintain a versioned rate table and reconcile it with provider billing. Unknown rates should block new paid AI jobs until configured, rather than record zero cost.

Target AI spend at or below 20% of net receipts as an initial operating rule. Net receipts means money after taxes, payment fees and refunds; hosting and support must also fit the remaining margin. For illustration only, £10 net receipts gives a £2 AI budget, making 100 credits viable only if the fully loaded cost per credit is at most £0.02 at the chosen safety percentile. Benchmark at least 100 representative jobs across short/long histories and retries. Reduce allowances or raise prices if the measured economics miss this target.

Implement these controls before switching on the proposed commercial model:

1. Reserve both user credits and worst-case provider cost transactionally before dispatch. Use a persistent ledger and idempotency keys across workers. Reconcile actual spend afterwards, release unused reservations, and retain provider cost even when a failed job is refunded to the user. A disconnected browser does not erase a running job's reservation.
2. Apply this accounting to every paid AI entry point, including Coach and vision. Keep separate Review and Coach balances. No subscription, client flag or public “contact” link grants Coach access.
3. Give free analysis its own persistent account/IP limits and a global daily budget. Prefer deterministic free preview selection plus cached classification; when free AI budget is exhausted, return a useful local preview or a clear retry message. Preserve normal reading and replay access.
4. Enforce bounded inputs, provider output limits, one active expensive job per account, limited retries and model allowlists. Cache identical requests using user, hand/history, prompt version and model as appropriate; preserve private-data isolation.
5. Add an operator-controlled global spend ceiling and kill switch. Suggested pilot budgets are £2/day for all free acquisition AI and £10/day aggregate, adjustable only after reviewing conversion and measured cost. These are proposed internal limits, not current protections. A daily budget is not a substitute for reservations.
6. Verify every Stripe webhook signature; process events idempotently and handle out-of-order deliveries. Grant credits only after verified successful payment, once per invoice. Handle cancellations, refunds and failed payments explicitly.
7. Show remaining credits and renewal date, cost before confirmation, an 80% usage notice, and a hard stop at zero. Allow manual top-up or waiting for renewal. Never imply the billing portal automatically increases the current hard-coded cap.

Track free-to-paid conversion, cost per free activated user, cost and margin per paying user, 95th-percentile cost per action, duplicate/retry spend, exhausted allowances and Coach quote acceptance. Adjust the trial and allowance based on conversion and margin together.

## User journey and wording

Homepage: “Start free: find your next study spots. Go deeper with paid AI review.” Show the free preview boundary next to its CTA once that boundary is enforced. Display Review's actual price and included allowance next to the purchase action; Stripe Checkout confirms payment terms.

Before AI work: “Review 3 hands · 3 credits. 17 credits remaining.” At exhaustion: “You've used this month's review allowance. Your credits renew on [date]. Buy a top-up or continue using your saved reviews.” Trial exhaustion uses a paid Review CTA instead of telling users to wait for a trial reset.

Coach: “Coach uses substantial AI token resources for personalised analysis, so early access is priced separately according to expected usage. It is not included in Tournament Review or its trial.” Action: “Contact me — request early access.” Recipient: `qacopilotdev@gmail.com`. Ask for account email, intended use and expected sessions. Explain that pricing and an allowance are agreed before activation.

## Implemented in this change

- Replaced the empty Coach page with the explanation, email CTA, visible fallback email address and approval expectations.
- Added a homepage email action and a Tools Hub route to the Coach access page; changed its status to “Paid early access.”
- Kept the existing server access gate and added actionable contact/pricing text to Coach API denials. Existing explicit approved/admin/developer access continues to work.
- Removed “Tier 1,” the fixed trial review-count promise, “low-cost,” and the blanket “free forever” claim from the relevant UI. Clarified that paid Review remains usage-limited and excludes Coach.

The contact action is a prefilled `mailto:` draft. It opens the visitor's email client; the visitor sends the request. It does not send email silently, collect a waitlist, create a subscription or grant access.

## Deployment configuration still required

The application implements five trial credits, 100 credits per Stripe billing period, one credit per reviewed hand, five credits per summary analysis, and a £5 Checkout top-up for 30 credits. Reservations are atomic and failed provider calls refund the reserved credits. Admins bypass both product credits and the internal token ceiling while their actual usage is still recorded. Top-up grants are idempotent by Stripe event ID, and unsigned webhooks are rejected.

Before deployment, configure `STRIPE_PRICE_ID` as an active £12 GBP monthly recurring Price. Checkout verifies those properties and refuses a mismatch. Verify the payment lifecycle in Stripe test mode, run the database initializer, and then deploy. The code generates the £5 one-time top-up line item directly. Keep `COACH_ALLOW_ALL=false` in production and grant individual access through the existing server allowlist after agreeing payment and limits.

Stripe supports usage billing and prepaid billing credits, but its credit grants apply to metered subscription items and billing reconciliation; they do not replace a pre-dispatch application access ledger. For this launch, a fixed subscription plus an application credit ledger is the simpler starting point; add Stripe metering only if needed. Sources checked 14 September 2026: [Stripe usage-based billing](https://docs.stripe.com/billing/subscriptions/usage-based), [Stripe billing credits](https://docs.stripe.com/billing/subscriptions/usage-based/billing-credits).
