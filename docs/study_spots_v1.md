# Study Spots V1 Plan

Status: Proposed  
Product: Playback Poker  
Last updated: 2026-08-29

## 1. Product decision

Playback Poker will evolve from a single tournament review screen into a multi-tool MTT improvement platform. Authenticated users will land in a new Tools Hub rather than directly in Tournament Review.

V1 exposes three clearly separated capabilities:

| Capability | Access in V1 | Purpose |
| --- | --- | --- |
| Find My Study Spots | Every registered user | Upload a tournament and identify the most useful decisions and patterns to study. |
| Tournament Review | Trial or active Tier 1 entitlement | Preserve the existing detailed review experience behind a server-enforced entitlement. |
| Poker Coach | Disabled | Show an architectural placeholder only. No model calls, subscription flow, or direct-route access. |

The free product must be independently useful. Study Spots is not a preview of Tournament Review and must not be framed as a list of everything the player did wrong. Its core proposition is:

> Upload your tournament. Playback Poker finds the hands and decisions most worth studying.

The primary language is "This is worth studying because...", including for close decisions, unusual lines, recurring patterns, and missed opportunities. Use definitive mistake language only where evidence and confidence justify it.

## 2. V1 outcome

A registered free user can:

1. Enter Playback Poker and land in the Tools Hub.
2. Understand the three product capabilities and their availability.
3. Choose Find My Study Spots.
4. Upload a supported tournament history.
5. Receive up to 5-8 meaningful, ranked study opportunities.
6. Understand why each spot was selected.
7. Open a relevant learning resource when a credible match exists.
8. Save spots to and revisit them from My Study.
9. Reopen previous study reports.
10. See one contextual Tournament Review upsell after receiving value.
11. Be prevented from accessing Tournament Review or Coach without the required server-side capability.

The experience must remain useful with a small learning library. Study Spot classification and Learning Resource matching are separate stages:

```text
HAND
  -> CANDIDATE DECISION
  -> STUDY SPOT
  -> TAGS
  -> RESOURCE MATCHER
  -> LEARNING RESOURCE OR CONTENT GAP
```

Do not implement `HAND -> find article`.

## 3. Goals and non-goals

### Goals

- Establish a capability model shared by the UI and API.
- Make Tools a first-class authenticated workspace.
- Reuse the existing GG/PokerStars tournament parser and useful audit logic.
- Run a cheaper, bounded analysis than a full Tournament Review.
- Persist reports, spots, queue state, and analysis history per user.
- Create an extensible learning resource and taxonomy model.
- Match resources only when relevance clears an explicit threshold.
- Record unmet study topics as aggregate content gaps.
- Preserve the existing Tournament Review while relocating and gating it.
- Hard-disable Coach on the server as well as in the UI.

### Non-goals

- Rebuilding the existing `HandReviewPanel` or its detailed review UI.
- Producing solver-grade or full street-by-street coaching for free.
- Guaranteeing exactly 5 spots when the evidence does not support them.
- Creating fake, placeholder, or weakly related learning recommendations.
- Building a CMS, content authoring workflow, or content-gap admin dashboard.
- Building background worker infrastructure for V1.
- Enabling Coach, calling Coach services, or selling a Coach subscription.
- Finalising product naming, prices, or the long-term trial policy.
- Supporting cash-game uploads in Study Spots V1.

## 4. Current codebase constraints and reuse

The implementation should work with the repository as it exists:

- Frontend: Vite + React with a small custom History API router in `pokerchaos-frontend/src/main.jsx`.
- Authentication: Clerk in the frontend and backend.
- Backend: Express routes concentrated in `pokerchaos-backend/src/index.js`.
- Persistence: Postgres initialized from `pokerchaos-backend/src/db.js`; there is no separate migration framework today.
- Tournament storage: `tournament_uploads` already stores raw history, compact parsed hands, summary, and opponent snapshot per user/tournament.
- Parsing: `parseHandHistory` already accepts GG and PokerStars formats and returns tournament metadata, positions, cards, stacks, board, and per-street actions.
- Existing audit logic: preflop opportunity, blind defence, ICM-style, and in-position postflop detectors currently live inside the large frontend `HandReviewPanel.jsx`.
- Learning content: the frontend `ARTICLE_CATALOG` contains existing article metadata and routes, but is not yet a reusable backend resource index.
- Existing access: boolean `review`, `reviewAi`, and `coach` flags plus trial/subscription billing.

V1 should extract reusable audit calculations into focused backend modules rather than import frontend code or expand `HandReviewPanel.jsx`. Keep the legacy review component intact except for routing and entitlement integration.

## 5. Information architecture and routes

### Public routes

| Route | Behavior |
| --- | --- |
| `/` | Existing marketing homepage, updated later as needed to make Find My Study Spots the primary registered-user funnel. |
| `/articles` and `/articles/:slug` | Existing learning pages remain public. |

Calls to action for Study Spots should open Clerk sign-in/registration when signed out and return the user to `/tools/study-spots` after authentication. Copy: "Free account required so we can save your tournaments and study queue."

### Authenticated routes

| Route | Capability | V1 behavior |
| --- | --- | --- |
| `/tools` | authenticated | Default signed-in route and Tools Hub. |
| `/tools/study-spots` | `study_spots: enabled` | Upload entry point. |
| `/tools/study-spots/reports/:reportId` | `study_spots: enabled` | Saved Study Report. |
| `/tools/tournament-review` | `tournament_review: trial/active` | Existing `ReviewApp` mounted without a major rewrite. |
| `/tools/coach` | `coach: disabled` | Coming-later placeholder; never mounts Coach functionality. |
| `/tournaments` | authenticated | My Tournaments list, including links to saved Study Reports and entitled Tournament Review. |
| `/study` | `study_spots: enabled` | My Study queue and report history. |

Compatibility redirects:

- `/review` -> `/tools/tournament-review`
- `/coach` -> `/tools/coach`

Unknown authenticated paths should go to `/tools`, not silently to Tournament Review.

### Authenticated navigation

```text
Home
Tools
  Find Study Spots
  Tournament Review
  Poker Coach
My Tournaments
My Study
Learn
Account
```

The exact mobile presentation may evolve, but Tools must be a first-class destination and the capability state must be visible without aggressive upgrade prompts.

## 6. Tools Hub

The Hub asks "What do you want to work on?" and presents three peer tools:

1. **Find My Study Spots - Free**  
   Upload a tournament and find the decisions worth studying.  
   CTA: `Start`

2. **Tournament Review - Tier 1**  
   Detailed AI analysis of tournament decisions.  
   CTA by entitlement: `Open`, `Continue trial`, or `Start free trial`.

3. **Poker Coach - Tier 2**  
   Personalised ongoing analysis and study guidance.  
   State: `Coming later`, with no actionable CTA.

Locked tools remain understandable, but the free tool gets equal visual weight and must not look like a crippled demo.

## 7. Capability and entitlement model

Replace scattered boolean UI checks with explicit capability states.

```ts
type Capability = "study_spots" | "tournament_review" | "coach";

type UserEntitlements = {
  capabilities: {
    study_spots: "enabled";
    tournament_review: "locked" | "trial" | "active";
    coach: "disabled" | "active";
  };
};
```

V1 rules:

- Any authenticated Clerk user receives `study_spots: "enabled"`.
- Tournament Review is `active` for an active subscription, `trial` when the existing trial entitlement permits review, otherwise `locked`.
- Coach is always `disabled` in V1, including for direct URLs. Do not let current allow-all, email, user ID, admin, or subscription rules accidentally enable it.
- Study Spots analysis does not consume Tournament Review trial tokens.
- Operational abuse limits may exist server-side, but they are not presented as a product paywall and must allow the free workflow to feel complete.

Server middleware should be state-aware:

```ts
requireCapability("study_spots", ["enabled"])
requireCapability("tournament_review", ["trial", "active"])
requireCapability("coach", ["active"])
```

Denied API responses use `403` and a stable code such as `CAPABILITY_LOCKED` or `CAPABILITY_DISABLED`. All protected endpoints must derive the user from Clerk authentication and scope every query by `user_id`; no client-supplied user ID is trusted.

During rollout, `/me/entitlements` may temporarily include the old `features` booleans for existing frontend consumers, but `capabilities` becomes the source of truth and the compatibility fields are removed after the legacy screen is migrated.

## 8. Domain taxonomy

Keep taxonomy values in one backend-owned module with labels exposed through an API or a shared generated fixture. Persist stable slugs, never display labels as identifiers.

### Study spot types

```ts
type StudySpotType =
  | "mistake"
  | "missed_opportunity"
  | "close_decision"
  | "interesting_spot"
  | "recurring_pattern";
```

### Categories and tags

V1 begins with the following broad vocabulary and may add tags without changing the report schema:

| Category | Tags |
| --- | --- |
| `preflop` | `opening`, `isolation`, `3bet`, `4bet`, `squeeze`, `reshove`, `short-stack`, `big-blind-defence` |
| `postflop` | `cbet`, `delayed-cbet`, `probe`, `check-raise`, `turn-barrel`, `river`, `bluff-catch`, `value-bet` |
| `blind-vs-blind` | `sb-open`, `bb-defence`, `bb-3bet` |
| `tournament` | `stack-depth`, `chip-ev`, `pressure`, `icm`, `bubble`, `final-table` |
| `exploitative` | `calling-station`, `overfold`, `underbluff`, `limper`, `nit`, `maniac` |
| `study` | `hand-review`, `leak-detection` |

Context metadata:

```ts
type StackDepthTag = "0-10" | "10-15" | "15-25" | "25-40" | "40+";
type PositionTag = "UTG" | "HJ" | "CO" | "BTN" | "SB" | "BB" | "unknown";
type OpponentType =
  | "unknown"
  | "recreational"
  | "tight"
  | "loose"
  | "aggressive"
  | "passive";
```

Store raw effective stack BB as a number as well as its bucket. Treat opponent type as `unknown` unless there is enough observed evidence; do not infer personality labels from one hand.

## 9. Persisted entities

Use application-generated IDs, for example Node `crypto.randomUUID()`, so Postgres extensions are not required.

### LearningResource

```ts
type LearningResource = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  stackDepthTags: StackDepthTag[];
  positionTags: PositionTag[];
  opponentTags: OpponentType[];
  contentType: "article" | "daily_edge" | "guide" | "video" | "interactive";
  url: string;
  published: boolean;
  publishDate: string | null;
  priority: number;
};
```

Suggested `learning_resources` table:

- scalar columns for identity, copy, content type, URL, publication state, date, and priority;
- JSONB arrays for tags and contextual tag groups, consistent with the current database style;
- unique indexes on `slug` and `url`;
- timestamps for maintenance.

Seed only real, published content. Start by adapting relevant `ARTICLE_CATALOG` entries with manually reviewed tags. Add Daily MTT Edge lessons only when each has a real title, canonical URL, and useful metadata. The analyser must never know article slugs or resource IDs.

### StudyReport

```ts
type StudyReport = {
  id: string;
  userId: string;
  tournamentId: string;
  status: "analysing" | "complete" | "failed";
  handsAnalysed: number;
  candidateCount: number;
  spotCount: number;
  pipelineVersion: string;
  model: string | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
};
```

Reports are immutable snapshots once complete. A rerun creates a new report so analysis history remains inspectable. Store failure codes, not raw provider errors shown to users.

### StudySpot

```ts
type StudySpot = {
  id: string;
  reportId: string;
  primaryHandKey: string;
  exampleHandKeys: string[];
  type: StudySpotType;
  category: string;
  tags: string[];
  title: string;
  summary: string;
  whyStudyThis: string;
  confidence: number;
  rankScore: number;
  rank: number;
  occurrenceCount: number;
  stackDepthBb: number | null;
  stackDepthTag: StackDepthTag | null;
  heroPosition: PositionTag;
  villainPosition: PositionTag;
  opponentType: OpponentType;
  handContext: Record<string, unknown>;
  resourceMatches: Array<{
    resourceId: string;
    quality: "recommended" | "related";
    score: number;
  }>;
};
```

`handContext` is a compact snapshot required to render the card, not raw hand-history text or an unrestricted model response. Cap `exampleHandKeys` to a small number such as five. A recurring pattern is one Study Spot with multiple examples, not duplicate cards.

### Study queue

Persist queue state separately so a report remains unchanged:

```ts
type StudyQueueItem = {
  userId: string;
  studySpotId: string;
  status: "to_review" | "completed";
  savedAt: string;
  completedAt: string | null;
};
```

The report and its recommendations are saved automatically. Users explicitly add individual spots to My Study, including no-resource topics, and can mark them complete or move them back to `to_review`. A unique `(user_id, study_spot_id)` constraint makes saving idempotent.

### Content gaps

Record one immutable occurrence per unmatched spot, then aggregate it for the content roadmap:

```ts
type ContentGap = {
  id: string;
  category: string;
  primaryTag: string;
  studySpotType: string;
  status: "open" | "in_progress" | "complete";
  tag: string;
  studySpotCount: number;
  decisionCount: number;
  briefs: AnonymisedStudySpotBrief[];
  linkedResources: LearningResource[];
  firstSeen: string;
  lastSeen: string;
};
```

A `content_gap_occurrences` table keyed by `(study_spot_id, tag)` prevents retries from double-counting. Each occurrence receives an opaque brief ID plus its own linked-resource and covered state. `content_gaps` stores the derived editorial lifecycle and `content_gap_resources` retains resource linkage history. Count both distinct Study Spots and the sum of their repeated decisions. The admin response exposes anonymised Study Spot briefs and excludes account, report, tournament, and hand identifiers. The aggregate is internal/admin-only.

Recommended relationships:

```text
tournament_uploads
  1 -> many study_reports
study_reports
  1 -> many study_spots
study_spots
  0 -> many study_queue_items
  0 -> many content_gap_occurrences
learning_resources
  referenced by immutable resource match snapshots on study_spots
```

Deleting a tournament should also delete its reports, spots, queue links, and gap occurrences in one transaction. Resource deletion should be soft (`published = false`) so old report links and titles remain explainable.

## 10. Analysis pipeline

V1 runs a bounded synchronous pipeline in the API request and persists status before analysis. This avoids a worker system while making retries and failures visible. If production request limits prove too short, the same report states can later back a queue without changing the client contract.

### Step 1: validate and parse

- Accept text uploads within the existing 2 MB limit.
- Reuse `parseHandHistory`.
- Reject malformed text, unsupported formats, cash histories, empty parses, and uploads containing no resolvable single tournament with specific `400` error codes.
- Include hands where Hero folded preflop; they are essential for missed-opportunity detection.
- Upsert the existing `tournament_uploads` record so My Tournaments continues to have one canonical upload.

Initial supported formats are exactly the tournament formats the parser proves it can parse in tests: GG and PokerStars. UI copy must not promise broader support.

### Step 2: extract candidate decision nodes

Create backend modules such as:

```text
src/studySpots/taxonomy.js
src/studySpots/candidateExtractor.js
src/studySpots/classifier.js
src/studySpots/ranker.js
src/studySpots/resourceMatcher.js
src/studySpots/service.js
```

Port and test the useful deterministic logic currently embedded in `HandReviewPanel.jsx`, especially:

- preflop opening and continuation opportunities;
- big-blind defence and blind-vs-blind spots;
- 3-bet, squeeze, short-stack, and reshove candidates where parsed evidence is sufficient;
- in-position c-bet, stab, delayed aggression, and later-street decision nodes;
- ICM/pressure candidates only when the history contains enough tournament context.

Also surface high-leverage or unusual decision nodes from stack-to-pot ratio, pot size, action sequence, and showdown context. Detectors create structured evidence and detector confidence; they do not declare solver-correct strategy.

Deduplicate identical detector results and cap the shortlist sent to AI, initially 12-20 candidates. Candidate extraction must still work when the learning resource table is empty.

### Step 3: AI classification

Use one constrained batch model call for the shortlist. The AI may:

1. Keep or reject a candidate based on study value.
2. Assign one allowed `StudySpotType`, category, and tags.
3. Write a concise factual summary.
4. Write a concise "why this is worth studying" explanation.
5. Return a confidence score and bounded strategic importance/severity signals.

The AI must not:

- produce a full coaching response or street-by-street review;
- receive the learning resource catalog;
- invent missing stack, position, board, action, opponent, or tournament facts;
- label a play a mistake without sufficient evidence;
- return identifiers or taxonomy values outside the supplied schema.

Use structured JSON schema output plus server-side Zod validation. Reconcile every returned candidate ID with the server shortlist, clamp numeric scores, reject unknown tags, and generate final IDs server-side. Retry transient provider failures once; otherwise mark the report failed and offer retry without requiring another upload. Do not silently publish unvalidated model output.

### Step 4: group recurring patterns

Group candidates with the same principal category/tag and compatible context. When multiple hands show the same pattern:

- emit one `recurring_pattern` Study Spot;
- show the occurrence count;
- keep a representative primary hand and up to five example hand keys;
- write the explanation at pattern level, for example, "We found four folds against small late-position opens."

Do not group superficially similar hands whose strategic contexts materially differ, such as 8 BB and 40 BB decisions.

### Step 5: rank and select

Normalize each signal to `0..1`. Initial rank weighting:

```text
strategic importance  30%
confidence            25%
repeat occurrence     20%
severity              15%
novelty                10%
```

Resource availability is not part of the core study-value score. At most, match quality may break a near-tie after the minimum relevance threshold; it must never remove a valuable unmatched spot.

Select at most eight spots, normally five to eight. Apply diversity constraints so one category does not consume the report unless it is a genuine recurring pattern. If only two valuable spots exist, return two. If none exist, return a useful zero state. Never pad the report to hit a quota.

### Step 6: match learning resources

Run matching only after classification, grouping, and ranking.

Filter to published resources, then calculate a transparent score from:

```text
primary tag overlap       45%
category match            20%
stack-depth compatibility 15%
position compatibility    10%
opponent compatibility     5%
editorial priority         5%
```

Empty contextual tag arrays mean "generally applicable", not a mismatch. Initial display thresholds should be configurable and covered by tests:

- `recommended`: score >= 0.75 and at least one principal tag match;
- `related`: score >= 0.50 and at least a category or principal tag match;
- below 0.50: no resource shown.

Return at most one recommended resource or two related resources per spot. Persist match score and quality with the spot so an old report does not change unexpectedly when the library changes. A later explicit "refresh recommendations" action can rematch old spots.

### Step 7: record content gaps

For each spot with no match at `related` or better:

- choose its most specific useful tag, falling back to category;
- insert an idempotent `content_gap_occurrences` row;
- expose the no-resource state in the report;
- allow the user to save the topic to My Study.

Examples of expected gaps include `river/bluff-catch`, `blind-vs-blind/sb-open`, `preflop/reshove` at 20 BB, and multiway c-betting. These aggregates become evidence for the content roadmap, not a user-facing popularity claim.

## 11. API surface

All routes require Clerk authentication. Capability middleware and `user_id` ownership checks apply on the server.

### Entitlements and taxonomy

```text
GET /me/entitlements
GET /study-spots/taxonomy
GET /learning-resources?published=true&tag=...
```

The public article pages can continue using frontend catalog data during transition. Authenticated resource lookup uses the backend entity.

### Analysis

```text
POST /study-spots/analyse
GET  /study-spots/reports
GET  /study-spots/reports/:reportId
POST /study-spots/reports/:reportId/retry
```

`POST /study-spots/analyse` accepts:

```json
{
  "historyText": "...",
  "heroName": "Hero",
  "tournamentId": "optional",
  "tournamentName": "optional",
  "uploadSource": "ggpoker"
}
```

It returns the complete persisted report on success. The retry route only accepts a failed report owned by the user and reuses its saved tournament upload.

Stable client-facing error codes should include:

- `MALFORMED_UPLOAD`
- `UNSUPPORTED_FORMAT`
- `NO_TOURNAMENT_HANDS`
- `MULTIPLE_TOURNAMENTS`
- `TOURNAMENT_TOO_SHORT`
- `ANALYSIS_FAILED`
- `REPORT_NOT_FOUND`
- `CAPABILITY_LOCKED`
- `CAPABILITY_DISABLED`

`TOURNAMENT_TOO_SHORT` should normally be a successful low-sample report or warning when at least one valid decision exists; reserve the error for histories too short to analyse at all.

### Queue

```text
GET    /study-queue?status=to_review|completed
PUT    /study-queue/:studySpotId
PATCH  /study-queue/:studySpotId
DELETE /study-queue/:studySpotId
```

- `PUT` idempotently saves a spot.
- `PATCH` accepts only the two allowed statuses.
- Queue reads join the immutable spot/report snapshot and do not rerun analysis.
- A user cannot save or read another user's spot by guessing an ID.

### Legacy Tournament Review

Move the existing review endpoints behind `tournament_review` state checks. Study Spots should get its own upload/analyse endpoint rather than inheriting Tier 1 access from `/tournaments/upload`. If shared upload persistence is extracted to a service, both capabilities can call it while each route keeps its own guard.

### Coach

Every Coach API, including `/prompts` and replay/vision routes used by Coach, remains behind `requireCapability("coach", ["active"])`. In V1, resolution always returns `disabled`, so direct requests return `403 CAPABILITY_DISABLED`. The `/tools/coach` UI is static and must not import or mount the Coach app.

## 12. Study Spots user experience

### Upload page

Show one focused tournament upload task with:

- supported-site copy limited to tested formats;
- file selection and paste flows where currently supported;
- Hero name handling consistent with the existing parser;
- registration context, not pricing pressure;
- progress stages: Uploading, Parsing, Finding decisions, Building study queue;
- clear recovery for malformed, unsupported, empty, and multi-tournament files.

Do not expose full Tournament Review controls on this page.

### Report page

Hierarchy:

```text
Tournament Study Report
Tournament: Sunday Mini Main
Hands analysed: 427
6 study opportunities found

Your Study Priorities
1. Big Blind Defence
2. Continuation Betting
3. Reshove Pressure

Study Queue
[ranked spot cards]

Want the complete tournament analysis?
[Try Tournament Review]
```

Priority labels are derived from the ranked spots and recurring groups, not generated as an unrelated AI summary.

### Study Spot card

Each card contains:

- category/topic and Study Spot type;
- hand number or recurring example count;
- concise factual summary;
- "Why this is worth studying" copy;
- stack, positions, and board/action context when known;
- an expandable hand detail or link to the stored hand;
- queue action and completion state;
- exactly one of the resource states below.

Resource state A:

```text
Recommended study
Defending the Big Blind vs a Steal
[Read lesson]
```

Resource state B:

```text
Related study
Big Blind Defence Fundamentals
[Read lesson]
```

Resource state C:

```text
Study topic
Turn probe opportunities

We don't have a dedicated lesson for this spot yet.
[Save to study queue]
```

Never render an empty resource container and never substitute an unrelated article.

### Low-result and zero-result states

- Very short history: show the valid result count and a low-sample explanation; do not pad to five.
- No interesting spots: confirm how many hands were analysed, explain that no high-confidence opportunities cleared the threshold, and offer another upload.
- Analysis failure: preserve the tournament, show a retry action, and do not imply that no study spots exist.
- No resource match: show the useful topic state above; this is a normal success state.

### My Study

V1 includes:

```text
MY STUDY

To review   3
Completed   7

Topics
Big Blind Defence      4 spots
Continuation Betting   3 spots
Reshove Pressure       2 spots
```

Users can filter `To review` and `Completed`, open the source report/hand, and change status. Topic counts come from saved queue items, not all generated reports.

### Tier 1 upsell

Show one upsell band after the Study Queue, only after results have delivered value:

> Want the complete tournament analysis?
>
> Study Spots finds the decisions worth learning from. Tournament Review analyses what happened across your tournament and explains the decisions in detail.

CTA: `Try Tournament Review`, resolved according to entitlement state and the existing trial mechanism. Do not interrupt upload, analysis, individual spot cards, or no-resource states with repeated upgrade prompts.

## 13. Learning resource seeding

Create a reviewed seed file or idempotent seed function for existing content. For each eligible `ARTICLE_CATALOG` item:

1. Reuse its real slug, title, excerpt, URL, publication state, and date.
2. Assign category and tags manually.
3. Add contextual tags only when the lesson genuinely targets that context.
4. Set a conservative editorial priority.
5. Skip export/how-to or product methodology articles that do not teach the strategy represented by a Study Spot.

Do not infer tags at request time from titles. Seed changes should be reviewable in source control and idempotent in every environment.

Daily MTT Edge should use the same `LearningResource` shape. Adding a new lesson should require only a resource record and tags, not analyser code.

## 14. Delivery plan

### Phase 1: capability foundation and routes

- Add capability state resolution and state-aware backend middleware.
- Return the new structure from `/me/entitlements` with temporary compatibility booleans.
- Add `/tools` as the signed-in default.
- Add Tools Hub, route definitions, navigation, legacy redirects, and the static Coach placeholder.
- Relocate the existing Review app under `/tools/tournament-review` and verify server rejection for locked users.

Exit condition: all three tools are understandable; only entitled users can reach Tournament Review; no request can activate Coach.

### Phase 2: taxonomy and learning resources

- Add taxonomy constants and validation.
- Add `learning_resources` persistence and lookup.
- Seed real relevant content from `ARTICLE_CATALOG`.
- Add deterministic matcher tests, including empty-library behavior.

Exit condition: resources are content-type agnostic, separately queryable, and never required for spot creation.

### Phase 3: backend candidate pipeline

- Extract/port deterministic audit helpers from the frontend into backend modules.
- Generate compact candidate decision nodes for all hands, including preflop folds.
- Add the constrained batch classifier and strict output validation.
- Add grouping, ranking, diversity limits, and 5-8 maximum selection.

Exit condition: representative fixtures produce stable structured spots without calling the full review pipeline.

### Phase 4: persistence and APIs

- Add report, spot, queue, and content-gap tables/indexes.
- Implement transactional report creation and ownership-scoped reads.
- Implement analyse, retry, history, queue, and content-gap recording services.
- Store pipeline/model versions and immutable match snapshots.

Exit condition: completed and failed reports survive refresh; retries and queue saves are idempotent.

### Phase 5: Study Spots UI

- Build the upload page, progress state, Study Report, priority list, Study Spot cards, and all three resource states.
- Add short/no-result, no-match, malformed upload, unsupported format, and failure recovery states.
- Add the single Tier 1 upsell band.

Exit condition: the Study Spots experience is visually and behaviorally distinct from Tournament Review.

### Phase 6: My Study and history

- Build My Study counts, topic grouping, filters, status changes, and source navigation.
- Add report history to My Tournaments and/or My Study.

Exit condition: users can save, revisit, and complete spots across sessions.

### Phase 7: rollout and measurement

- Backfill/seed production resources idempotently.
- Add structured logs and product analytics.
- Roll out behind a deployment flag while keeping user capability rules server-owned.
- Validate AI cost, report latency, match rates, and zero-result rates before full release.

## 15. Testing strategy

### Unit tests

- Taxonomy accepts only known types, categories, tags, stack buckets, and positions.
- Stack bucket boundary values are correct.
- Candidate extractors identify known preflop, blind defence, postflop, and pressure fixtures.
- Candidate deduplication and recurring grouping preserve correct example hands.
- Ranking is deterministic for fixed inputs and respects category diversity.
- Resource matching produces `recommended`, `related`, and no-match states at threshold boundaries.
- An empty or unrelated resource library never changes spot selection.
- Model output validation rejects hallucinated IDs, unknown tags, invalid confidence, and missing facts.

### API/integration tests

- Registered user can create and retrieve a report.
- Reports, tournaments, spots, and queue items cannot be accessed across users.
- Queue save is idempotent and status transitions are valid.
- Retrying a failed report does not duplicate queue or gap records.
- Content-gap occurrence counting is idempotent.
- Existing trial/active users can access Tournament Review.
- Locked users receive `403 CAPABILITY_LOCKED` from every Tournament Review API, including direct calls.
- Every Coach route returns `403 CAPABILITY_DISABLED` in V1 even for old allow-listed/admin configurations.
- Legacy routes redirect to the new tool paths without bypassing API guards.

### Required fixtures and edge cases

- Tournament with strong resource matches.
- Tournament with no matching resources.
- Multiple similar spots that should form one recurring pattern.
- Similar-looking spots at incompatible stack depths that must not group.
- No interesting spots.
- Fewer than five valid spots.
- Malformed upload.
- Very short tournament history.
- Unsupported poker-site format.
- Cash-game history sent to Study Spots.
- Multiple tournament IDs in one upload.
- Partial/missing opponent metadata.
- AI timeout, invalid JSON, and invalid taxonomy output.
- Resource unpublished after an old report was generated.

### Frontend tests

- Signed-in default route is `/tools`.
- Signed-out Study Spots CTA returns to the intended route after authentication.
- Tool cards reflect enabled, locked/trial/active, and disabled states.
- Direct URL navigation does not mount legacy Review or Coach before entitlements resolve.
- Report cards render all three resource states.
- Low-result and zero-result copy does not claim a failure or pad results.
- My Study filters and counts update after save/complete actions.
- Mobile and desktop layouts do not overflow or overlap.

### Regression checks

- Existing parser tests still pass for GG and PokerStars fixtures.
- Existing Tournament Review functions after its route move.
- Billing trial and active subscription behavior remains intact.
- Marketing pages, article routes, sitemap, robots, and SEO routes remain unaffected.

## 16. Observability and success measures

Record structured, privacy-conscious events without raw hand histories:

- `study_spots_upload_started`
- `study_spots_parse_failed` with stable error code and detected site when known
- `study_spots_analysis_completed` with hand/candidate/spot counts, duration, pipeline version, and model usage
- `study_spots_analysis_failed` with stage and stable error code
- `study_resource_opened` with spot category, resource ID, and match quality
- `study_spot_saved`
- `study_spot_completed`
- `tournament_review_upsell_viewed` and `clicked`

Operational metrics:

- parse success rate by supported site;
- report completion and retry success rates;
- p50/p95 analysis latency;
- average candidates and selected spots per tournament;
- percentage of reports with 0, 1-4, and 5-8 spots;
- recommended/related/no-resource distribution;
- queue save and completion rates;
- AI tokens and cost per completed free report;
- locked and disabled direct-route attempts.

Product success for V1 is demonstrated when registered users reliably complete the full upload-to-saved-study workflow and unmatched topics remain useful rather than appearing broken.

## 17. Acceptance criteria

- Authenticated users land on `/tools`.
- The Hub clearly distinguishes Free Study Spots, Tier 1 Tournament Review, and disabled Tier 2 Coach.
- `study_spots` is enabled for every authenticated user and is enforced server-side.
- Tournament Review works unchanged for trial/active users and is rejected server-side for locked users.
- Coach is hard-disabled in both UI and API with no service/model calls.
- A supported tournament can be uploaded, parsed, and saved once for the current user.
- Analysis uses compact candidate nodes and a bounded classification call, not the full review pipeline.
- Reports normally contain 5-8 ranked spots but honestly return fewer or zero.
- Every spot has validated type, category, tags, evidence-based summary, and "why study this" copy.
- Similar evidence can be grouped into a recurring pattern with example hands.
- Resource matching occurs after spot selection and never forces a recommendation.
- Recommended, related, and no-resource UI states all work.
- Unmatched topics create idempotent content-gap occurrences.
- Reports and recommendations persist; users can explicitly save spots and revisit them in My Study.
- One post-results Tournament Review upsell is present without interrupting the free workflow.
- Ownership, malformed upload, unsupported format, short history, zero-result, locked Tier 1, and disabled Coach tests pass.

## 18. Decisions to confirm before implementation

These do not block the architecture, but should be confirmed before final copy and launch configuration:

1. Whether "Find My Study Spots" remains the launch name.
2. Which existing articles are strategy resources versus product/how-to content and their initial manually reviewed tags.
3. Whether PokerStars tournament uploads are launch-supported in the UI or remain parser-supported but beta-labelled.
4. The exact Tournament Review trial transition represented by `trial` and its CTA behavior.
5. The model and operational rate limit for the free batch classifier.
6. Whether tournament deletion should cascade immediately or require a confirmation explaining that saved Study Reports and queue items will also be removed.

None of these decisions should couple Study Spot classification to the learning library or weaken server-side capability enforcement.
