# Learning Library V1 Implementation Checklist

This checklist implements the goal in [`learning_library_v1.md`](./learning_library_v1.md). Keep it current as milestones are completed.

## Architecture Decisions

- `LearningResource` is the canonical content record. Social posts and other distribution formats are optional metadata, not the resource identity.
- Quick Lesson canonical URLs are `/learn/:slug`. Article resources backed by an existing same-site full article use `/articles/:slug`; the LearningResource retains taxonomy and matching metadata without duplicating the editorial body.
- Study Spots produces controlled taxonomy and context first. `LearningResourceMatcher` is a separate deterministic stage.
- Resource types are `quick_lesson`, `article`, `guide`, `video`, and `drill`.
- Publication states are `draft` and `published`; only published records appear in public APIs or Study Spots matching.
- Existing resource rows are migrated in place and legacy seed records are normalized into the canonical shape.
- Admin access uses the existing server-resolved `admin` entitlement. UI visibility is secondary and is never the authorization boundary.
- Admin endpoints are limited to learning-resource and content-gap operations. They expose no user, billing, or entitlement mutation.

## Canonical Contract

- [x] Add canonical identity fields: `externalId`, `series`, `lessonNumber`, `slug`.
- [x] Add presentation fields: `title`, `shortTitle`, `description`, `resourceType`.
- [x] Add controlled classification: `category`, `primaryTag`, `secondaryTags`.
- [x] Add context arrays: stack depth, hero position, villain position, opponent type, and study-spot type.
- [x] Add lesson content: body, example spot, mistake, better play, when to use, when not to use, and takeaway.
- [x] Add lifecycle fields: status, published date, created date, and updated date.
- [x] Add optional Instagram caption and URL metadata without coupling canonical URLs to Instagram.
- [x] Support future article, video, guide, and drill records without schema changes.

## Controlled Taxonomy

- [x] Expand controlled categories and tags to cover all goal values.
- [x] Preserve aliases for existing Study Spots values during migration.
- [x] Define controlled stack-depth bands, positions, opponent types, and study-spot types.
- [x] Reject unknown values in admin validation; AI classification continues to fail closed to safe existing values.
- [x] Expose the controlled taxonomy to the admin interface.

## Persistence

- [x] Migrate `learning_resources` in place with backward-compatible `ALTER TABLE` statements.
- [x] Enforce unique slug, external ID, and series/lesson number constraints where values are present.
- [x] Add create, update, get-by-ID, get-by-slug, list, and publication repository operations.
- [x] Aggregate content gaps by primary tag and study-spot type with occurrence count, first seen, and last seen.
- [x] Add category-safe content-gap lifecycle state and per-Study-Spot briefs with anonymised authoring context, JSON-import handoff, individual coverage controls, and independent Instagram status.
- [x] Keep content-gap occurrence writes idempotent for report retries.
- [x] Extend the database verifier for canonical resources, duplicate constraints, publication, and content-gap aggregation.

## Restricted Admin API

- [x] Add an explicit `requireAdmin` middleware that fails closed with `403 ADMIN_REQUIRED`.
- [x] Add admin resource list, create, edit, publish, and unpublish endpoints.
- [x] Add import preview and final import endpoints.
- [x] Validate all writes server-side with clear field errors.
- [x] Detect duplicate slug, external ID, and series/lesson number before save.
- [x] Keep the API limited to learning ingestion and content-gap visibility.

## Public Learning API

- [x] Add a public published-resource catalogue endpoint.
- [x] Add a public published-resource lookup by slug.
- [x] Return related published lessons without exposing drafts.
- [x] Return resource-type-aware canonical paths in API payloads and Study Spot matches (`/learn/:slug` for lessons, existing `/articles/:slug` for article-backed resources).

## Study Spots Integration

- [x] Score primary tag, secondary overlap, study-spot type, stack depth, hero position, villain position, and opponent type deterministically.
- [x] Return explicit `recommended`, `related`, or no-resource states.
- [x] Never promote a resource without sufficient taxonomy relevance.
- [x] Persist canonical match snapshots without coupling to external article URLs.
- [x] Preserve existing Study Spots extraction, ranking, reports, queue, and retry behavior.

## Frontend

- [x] Add public `/learn` category/resource discovery.
- [x] Add canonical `/learn/:slug` lesson pages with every Quick Lesson section.
- [x] Add related lessons and clear loading, empty, and error states.
- [x] Update Study Spot resource links to use canonical lesson routes.
- [x] Add admin-only `/admin/learning` list/create/edit/publish workflow.
- [x] Add `/admin/learning/import` structured JSON preview and save workflow.
- [x] Hide admin navigation from non-admin users while retaining server enforcement.
- [x] Keep layouts responsive and aligned with the Playback Poker design system.

## Repeatable Import

- [x] Add a CLI importer for structured `.json` and Markdown JSON-code-block inputs.
- [x] Add an example Daily MTT Edge Quick Lesson fixture.

Preview a structured lesson without saving it:

```powershell
$env:LEARNING_IMPORT_TOKEN = "<scoped Clerk bearer token>"
npm run learning:import -- examples/daily-mtt-edge-template.json
```

Commit the same validated import:

```powershell
npm run learning:import -- examples/daily-mtt-edge-template.json --commit
```

Set `LEARNING_IMPORT_API_URL` to override the default `http://localhost:4011`. The legacy `LEARNING_ADMIN_API_URL` name remains supported. Markdown imports use the same command and must contain one fenced `json` block with the resource object.

Configure `LEARNING_IMPORT_ALLOWED_EMAILS` or `LEARNING_IMPORT_ALLOWED_USER_IDS` for automation accounts. A non-admin account on either allowlist can call only the two POST import endpoints and is denied on every other authenticated route. Administrators retain import access through the existing admin entitlement. Do not add an import-only account to the admin allowlists.

For automation that must validate and manage existing resources, use `LEARNING_ADMIN_ALLOWED_EMAILS` or `LEARNING_ADMIN_ALLOWED_USER_IDS`. This grants the complete `/admin/learning` API and UI surface while continuing to deny every authenticated route outside the Learning Library.

Source audit note: the available product material names Daily MTT Edge #002 and #003 but does not include their canonical lesson bodies. They have not been seeded as fabricated or publishable resources. Import the real lesson payloads through the workflow above when that source copy is available.

## Verification

- [x] Unit-test strict resource validation and duplicate reporting.
- [x] Unit-test deterministic matching thresholds and all context factors.
- [x] Unit-test admin authorization behavior.
- [x] Unit-test public/admin route helpers and frontend presentation logic.
- [x] Run complete backend and frontend test suites.
- [x] Run the production frontend build.
- [x] Run the live Postgres verifier.
- [x] Exercise admin import -> publish -> public lookup -> Study Spots match end to end.
- [x] Verify public pages at desktop and mobile sizes without overlap or clipped text.

## Completion Audit

- [x] Admin can import a structured Daily MTT Edge lesson.
- [x] Malformed content and invalid taxonomy are rejected clearly.
- [x] Published lessons appear in `/learn` with stable canonical URLs.
- [x] Study Spots can deterministically recommend a suitable lesson.
- [x] Weak matches return related or no-resource states.
- [x] Content gaps persist and aggregate by primary tag and study-spot type.
- [x] Resource model supports Quick Lessons, articles, guides, videos, and drills.
- [x] Existing Study Spots functionality remains passing and operational.
