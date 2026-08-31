# Learning Library V1 Goal

Playback Poker now has a working Study Spots feature that analyses uploaded tournaments and identifies hands worth studying.

The next requirement is to create the canonical Learning Library that Study Spots can match against, plus a controlled admin ingestion workflow that allows externally generated Daily MTT Edge lessons to be added safely.

A Daily MTT Edge lesson is not an Instagram post. It is a canonical `LearningResource`. Instagram carousels, articles, videos, and future study experiences are derivatives of that resource.

The architecture must support:

```text
Tournament Hand -> Study Spot -> classification/tags -> resource matcher -> LearningResource
```

Do not tightly couple hand analysis directly to article URLs.

## Initial Investigation

First inspect the existing:

- Study Spots implementation
- Tournament parsing/analysis pipeline
- Auth
- Persistence/database
- Routing
- Admin capabilities
- Current content/article structures, if any

Reuse existing architecture wherever sensible.

Document the implementation plan before making significant changes.

## Canonical Resource Model

Introduce a canonical resource model capable of representing:

- Quick Lessons / Daily MTT Edge
- Long-form articles
- Guides
- Future videos
- Future drills

Suggested fields:

```text
LearningResource {
  id
  externalId
  series
  lessonNumber
  slug
  title
  shortTitle
  description
  resourceType

  category
  primaryTag
  secondaryTags[]

  stackDepthTags[]
  heroPositionTags[]
  villainPositionTags[]
  opponentTypeTags[]
  studySpotTypes[]

  body
  exampleSpot
  mistake
  betterPlay
  whenToUse[]
  whenNotToUse[]
  takeaway

  status
  publishedAt

  instagramCaption
  instagramUrl

  createdAt
  updatedAt
}
```

`instagramUrl` is a nullable URL. `null` means the canonical lesson has not yet
been published to Instagram. Legacy empty strings are accepted at write/import
boundaries and normalized to `null`.

Adapt naming and types to existing project conventions.

## Controlled Taxonomy

Build a controlled taxonomy for Study Spots and learning resources.

### Preflop

- opening
- isolation
- 3bet
- 4bet
- squeeze
- reshove
- bb-defence
- sb-vs-bb
- short-stack

### Postflop

- cbet
- delayed-cbet
- donk-bet
- probe
- check-raise
- turn-barrel
- river
- bluff-catch
- thin-value
- overbet
- multiway

### Hand Reading

- range-construction
- range-narrowing
- board-texture
- nut-advantage
- blockers
- capped-range

### Exploitative

- calling-station
- overfolder
- underbluffer
- maniac
- nit
- limper

### Tournament

- stack-depth
- chip-ev
- pressure
- icm
- bubble
- final-table
- pay-jumps

### Study

- review
- leak-finding
- session-prep
- mental-game

Also create controlled values for:

- Stack-depth bands
- Positions (`UTG`, `UTG+1`, `MP`, `LJ`, `HJ`, `CO`, `BTN`, `SB`, `BB`, `unknown`, and the LearningResource-only wildcard `any`)
- Opponent types
- Study-spot types

Taxonomy should be extensible but should not allow arbitrary AI-generated tag drift.

For LearningResource hero and villain position metadata, `any` and `unknown` have different meanings:

- `any` means the lesson applies to every position and position is not a matching constraint.
- `unknown` means the relevant position was genuinely unavailable.
- Imports and persistence must preserve `any`; they must not normalise it to `unknown`.
- `any` is mutually exclusive with concrete positions in each hero/villain position list.
- Study Spot extraction continues to use concrete positions or `unknown`; `any` is resource metadata, not an observed hand position.

## Restricted Admin Workflow

Create a restricted admin workflow for adding `LearningResource` records.

Preferred route:

```text
/admin/learning
```

Support:

- List resources
- Create
- Edit
- Preview
- Publish/unpublish
- Detect duplicate `externalId`
- Detect duplicate `slug`

Create a dedicated import path:

```text
/admin/learning/import
```

It should accept a structured JSON representation of a lesson.

The import must:

- Validate required fields
- Validate taxonomy values
- Reject malformed data
- Reject or flag duplicate lesson numbers or external IDs
- Preview the result before final save where practical
- Never grant access to unrelated administration functionality

Design this so an authenticated automation agent such as Grok Bot can eventually submit generated lessons through the interface.

Do not expose a broad unrestricted admin API.

## Public Learning Library

Create:

```text
/learn
```

The page should provide discoverable categories and resources.

Create canonical lesson pages:

```text
/learn/[slug]
```

Quick Lesson pages should support:

- Title
- Category
- Short summary
- Core lesson
- Example spot
- Mistake
- Better play
- When to use
- When not to use
- Takeaway
- Related lessons

Keep the design aligned with the Playback Poker product.

## Study Spots Matching

Refactor Study Spots so resource matching is a separate stage:

```text
StudySpot -> tags/context -> LearningResourceMatcher
```

Implement a deterministic V1 scoring model.

Candidate factors can include:

- Exact primary tag match
- Secondary tag overlap
- Study-spot type match
- Stack-depth match
- Hero/villain position match
- Opponent-type match

A LearningResource hero or villain position value of `any` receives full compatibility for a Study Spot with any concrete position. It must not lower the resource's match quality. `unknown` retains its existing missing-information semantics and is not a wildcard.

Return:

- Exact/high-confidence match
- Related resource
- No suitable resource

Do not force a recommendation when match quality is poor.

The UI should explicitly support:

- Recommended lesson
- Related lesson
- No dedicated lesson yet

## Content Gaps

When Study Spots repeatedly produces tags with no suitable resource, persist aggregate content-gap data so we can see what lessons need creating.

Keep V1 simple. At minimum track:

- Primary tag
- Study-spot type
- Occurrence count
- First seen
- Last seen

## Existing Lesson Import

Add a simple repeatable method for importing existing Daily MTT Edge lessons from structured JSON or Markdown.

Do not hard-code Instagram posts.

Existing Daily MTT Edge source lessons should become Quick Lesson `LearningResource` records.

## Security Requirements

- Admin import must require appropriate admin authentication and authorization.
- Validate everything server-side.
- Do not rely on hidden UI alone.
- Do not expose billing, user management, or entitlement mutation through this ingestion workflow.

## V1 Completion Criteria

V1 is complete when:

1. An admin can import a structured Daily MTT Edge lesson.
2. Invalid taxonomy or malformed content is rejected clearly.
3. The lesson appears in `/learn`.
4. It has a stable canonical URL.
5. Study Spots can match a tournament spot to it.
6. Weak matches return related/no-resource states rather than fabricated recommendations.
7. Content gaps can be recorded.
8. The model supports future article, video, and guide resource types.

## Delivery Approach

Maintain a living implementation checklist in the repository.

Work iteratively, test each milestone, and preserve existing Study Spots functionality while introducing the new learning architecture.
