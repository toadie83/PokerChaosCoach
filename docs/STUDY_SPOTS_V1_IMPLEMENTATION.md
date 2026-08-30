# Study Spots V1 Implementation Checklist

This is the living delivery checklist for `docs/study_spots_v1.md`. Update it as each milestone is implemented and verified.

Last updated: 2026-08-30

## Baseline audit

- [x] Authentication audited.
  - Clerk authenticates the frontend and `requireAuth` verifies bearer tokens in the Express API.
  - API queries derive `user_id` from the verified token.
- [x] Existing entitlement and billing behavior audited.
  - Access currently uses boolean `review`, `reviewAi`, and `coach` fields.
  - Active Stripe subscriptions and remaining AI trial tokens grant `reviewAi`.
  - Coach can currently be enabled through admin, env allow-all, user ID, or email rules; V1 must override all of these.
- [x] Routing audited.
  - The frontend uses a small History API router in `src/main.jsx`.
  - Signed-in users currently default to `/review`, and signed-in `/` still renders the marketing homepage.
  - Unknown authenticated paths currently normalize to `/review`.
- [x] Tournament upload and parsing audited.
  - `parseHandHistory` supports parsed GG and PokerStars tournament formats.
  - `tournament_uploads` already persists raw history, compact hands, summary, and opponent snapshot by `(user_id, tournament_id)`.
  - Study Spots must include Hero preflop folds and must use its own free-capability endpoint.
- [x] Review pipeline audited.
  - Full AI hand and summary review endpoints already have separate AI-credit checks.
  - Useful preflop, blind-defence, ICM-style, and postflop audit detectors currently live inside the frontend `HandReviewPanel.jsx`; reusable versions must move to backend modules without redesigning the legacy panel.
- [x] Persistence audited.
  - Postgres schema setup is currently idempotent SQL inside `src/db.js`; no external migration framework exists.
  - Study resources, reports, spots, queue state, and content-gap occurrences need new tables and ownership-scoped queries.
- [x] Baseline verification recorded.
  - Backend: 122 tests passing.
  - Frontend: 74 tests passing.
  - Existing unrelated worktree changes are preserved.

## Milestone 1: Capability architecture and Tools Hub

- [x] Add shared backend capability definitions and state resolution.
- [x] Make `study_spots` enabled for every authenticated user.
- [x] Resolve Tournament Review to `locked`, `trial`, or `active` from existing billing/access data.
- [x] Keep Coach disabled for ordinary users while preserving explicit developer/admin ID and email bypasses.
- [x] Add state-aware `requireCapability` API middleware and stable 403 error codes.
- [x] Return `capabilities` from `/me/entitlements` while retaining temporary compatibility booleans.
- [x] Reposition legacy review endpoints behind `tournament_review`.
- [x] Add `/tools` as the authenticated default and unknown-path fallback.
- [x] Add the Tools Hub with Free, Tier 1, and Coming Later states.
- [x] Move legacy Review UI to `/tools/tournament-review` with `/review` compatibility redirect.
- [x] Add static `/tools/coach` placeholder with `/coach` compatibility redirect and no Coach component mounting.
- [x] Add focused capability and routing tests.
- [x] Run backend and frontend regression suites.
  - Backend: 128 tests passing.
  - Frontend: 79 tests passing.
  - Frontend production build passing.

## Milestone 2: Learning resources and taxonomy

- [x] Add canonical Study Spot types, categories, tags, stack buckets, positions, and opponent types.
- [x] Add `learning_resources` persistence and idempotent seed behavior.
- [x] Seed only real strategy resources from the existing article catalog.
- [x] Add published resource lookup APIs.
- [x] Implement deterministic resource scoring and thresholds.
- [x] Verify recommended, related, no-match, unpublished, and empty-library behavior.
  - The V1 seed contains two reviewed, published study-workflow articles.
  - Matching tests cover exact recommendations, related resources, context incompatibility, unpublished resources, and an empty library.

## Milestone 3: Study Spot persistence and analysis

- [x] Add report, spot, queue, and content-gap occurrence tables and indexes.
- [x] Add ownership-scoped persistence functions and transactional delete behavior.
- [x] Extract deterministic candidate detectors into backend modules.
- [x] Include folded preflop decisions and compact evidence nodes.
- [x] Add bounded structured AI classification without resource catalog input.
- [x] Validate all AI identifiers, taxonomy, scores, and factual fields server-side.
- [x] Group compatible repeated candidates into recurring patterns.
- [x] Rank by study value, apply diversity, cap at eight, and never pad weak results.
- [x] Match resources only after spot selection.
- [x] Record idempotent content gaps for unmatched spots.
- [x] Add analyse, report history/detail, and retry APIs.
- [x] Verify malformed, unsupported, cash, multiple-tournament, short, empty, AI-failure, and no-interest cases.
  - Provider timeouts, rate limits, connection failures, and 5xx responses retry once before a persisted failure state.
  - The live Postgres verifier covers snapshots, ownership, idempotent saves, status changes, content gaps, and tournament cascade cleanup.

## Milestone 4: Study Spots and My Study UI

- [x] Build the authenticated tournament upload experience.
- [x] Add parsing/analysis progress and actionable failure states.
- [x] Build the Study Report hierarchy and priority summary.
- [x] Build Study Spot cards with hand context and recurring examples.
- [x] Render recommended, related, and no-resource states without fabricated links.
- [x] Add low-result and zero-result success states.
- [x] Add one post-results Tournament Review upsell.
- [x] Add report history and My Tournaments integration.
- [x] Add save, complete, reopen, remove, topic counts, and filters in My Study.
- [x] Verify signed-out registration return flow.
- [x] Verify desktop and mobile layouts in a running browser.
  - Playwright exercised the real Clerk testing-token flow and authenticated API calls.
  - Browser checks covered the Tools Hub, upload page, honest zero result, populated recommended/no-resource report, idempotent saves, completion, removal, filters, and direct report reopening.
  - Desktop at 1440 px and mobile at 390 px had no document overflow after the authenticated-header fix.

## Milestone 5: Acceptance and rollout readiness

- [x] Add privacy-conscious structured analysis and funnel events.
  - Event schemas allow only bounded scalar metadata and hash actor/spot identifiers; tests prove raw hand histories, cards, titles, and unknown fields are discarded.
- [x] Run all backend tests.
  - Final result: 155 tests passing.
- [x] Run all frontend tests.
  - Final result: 83 tests passing.
- [x] Run the production frontend build and sitemap generation.
  - Build passes; the existing bundle-size warning remains non-blocking.
- [x] Verify all V1 API ownership and direct URL bypass cases.
- [x] Verify the legacy Tournament Review still works for trial/active users.
- [x] Verify Coach activates only for server-resolved developer/admin bypasses and remains disabled otherwise.
- [x] Verify the complete registered-user upload-to-saved-study workflow.
- [x] Audit every acceptance criterion in `docs/study_spots_v1.md` against current evidence.

## Acceptance evidence

- [x] Authenticated routing defaults and unknown paths resolve to `/tools`; legacy `/review` and `/coach` URLs redirect into the Tools architecture.
- [x] Server-owned capability states expose free Study Spots, locked/trial/active Tournament Review, and Coach active only for explicit developer/admin bypasses.
- [x] Every Study Spots, Tournament Review, and Coach API is protected by its corresponding capability middleware.
- [x] A valid supported tournament was uploaded, parsed, persisted, analysed, and reopened through the authenticated browser flow.
- [x] Classification uses compact candidates, one bounded structured batch call, strict taxonomy reconciliation, and server-generated IDs.
- [x] Reports cap at eight, preserve category diversity, group compatible recurring evidence, and return honest short or zero results.
- [x] Resource matching is post-selection and supports recommended, related, and unmatched topic states without forced links.
- [x] Immutable report/resource snapshots, explicit queue saves, status changes, ownership filters, and cascade deletion are verified.
- [x] The results-only Tier 1 upsell appears once after a non-empty Study Queue and is omitted from zero-result reports.
- [x] Stable upload, report, capability, and analysis errors are covered, including transient retry and persisted retryable failure.
