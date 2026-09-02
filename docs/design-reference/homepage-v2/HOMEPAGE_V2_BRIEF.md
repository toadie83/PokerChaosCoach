# Playback Poker Homepage V2

## Objective

Redesign the Playback Poker homepage around one primary acquisition journey:

Upload a recent tournament → identify the decisions most worth studying → receive a free personalised lesson plan.

The homepage should make Playback Poker feel like a useful product immediately rather than a traditional SaaS marketing page.

The primary conversion goals are:

1. Free account registration
2. Tournament upload
3. Study Spot / matched lesson discovery
4. Learning Library engagement
5. Conversion into Tournament Review

---

## Core proposition

Playback Poker turns a completed MTT into a personalised study plan.

Primary message:

"Turn your tournaments into better decisions."

Supporting idea:

Upload a recent GGPoker or PokerStars tournament export. Playback Poker identifies useful study spots and matches them to practical MTT lessons.

Free users receive a small personalised preview, approximately 2–3 matched study spots / lessons.

---

## Design references

### MOTChecker screenshots

These demonstrate the UX pattern we want to learn from:

- one obvious starting action
- immediate perceived utility
- visible analysis/progress
- personalised results
- compact information hierarchy
- modular result cards
- clear route from free information into deeper functionality

Do not copy the MOTChecker visual design, branding, colours or layout literally.

### Playback Poker homepage direction mock

`playback-homepage-direction.png`

This is the closest visual direction.

Use it for:

- overall product feel
- information density
- wide desktop composition
- dashboard-style result preview
- dark Playback Poker presentation
- green/cream visual hierarchy
- strong tool-first positioning

However, the mock is slightly too busy.

Simplify it.

Do not attempt to reproduce every module shown in the mock.

---

## Existing brand

The existing Playback Poker brand system remains authoritative.

Continue using:

- existing Playback Poker logo assets
- charcoal / near-black surfaces
- emerald / teal primary accent
- cream / off-white display typography
- existing border, radius and spacing tokens
- restrained poker-table / chip visual language

Do not introduce another competing design language.

---

## Homepage UX

### 1. Navigation

Keep navigation clean and lightweight.

Primary CTA should relate to the free tournament analysis flow.

Suggested CTA:

"Find My Study Spots"

or

"Upload Tournament Free"

---

### 2. Hero

Use a wide two-column desktop hero.

Left:

- proposition
- concise supporting text
- primary CTA
- secondary CTA
- 3–4 compact trust / product indicators

Right:

Show a realistic personalised Study Plan preview.

The preview should communicate:

- tournament analysed
- number of Study Spots found
- priority learning theme
- matched lessons
- short descriptions of why each spot was selected

The result preview is more important than decorative poker imagery.

---

### 3. Upload experience

Introduce the actual tournament-upload interaction very early.

This should feel like a product control, not a marketing form.

Include:

- file upload / drag and drop
- supported sites
- accepted format guidance
- free-user proposition

Avoid excessive explanatory copy.

---

### 4. Analysis state

Create a reusable compact progress component.

Possible stages:

1. Validating tournament
2. Reading hand history
3. Identifying useful study spots
4. Matching Learning Library resources
5. Building the lesson plan

This state should make the analysis feel tangible rather than displaying a generic spinner.

---

### 5. Free Study Plan result

This is the most important product demonstration on the page.

Show approximately 2–3 Study Spots.

Each can contain:

- category
- stack depth / context
- concise reason it was selected
- matched lesson title
- action to view lesson

Possible examples:

Blind vs Blind
"BB defended too tightly versus SB steals"
→ Big Blind Defence vs a Small Blind Steal

Postflop
"Automatic c-bet into a connected calling range"
→ Continuation Betting vs Limp-Callers

Tournament
"21 BB open facing significant reshove pressure"
→ Changing Strategy as Stacks Shorten

Keep the interface believable.

---

### 6. Upgrade path

Do not aggressively interrupt the free experience with pricing.

After demonstrating Study Spots, introduce:

"Want the full tournament review?"

Explain the additional value:

- full hand analysis
- recurring leak detection
- deeper decision review
- tournament-wide patterns

Tournament Review is the natural next step.

Poker Coach remains secondary / coming later.

---

### 7. Learning ecosystem

Show that Study Spots connect into the broader Playback Poker Learning Library.

Include:

- Quick Lessons
- Daily MTT Edge
- longer Study Articles

The message should be:

"Your tournament tells you what to study next."

Do not make this section a generic article grid.

---

### 8. Daily MTT Edge

Keep this compact.

Daily MTT Edge should support the acquisition story rather than becoming a second homepage proposition.

Position it as:

"One practical tournament lesson every day."

Link to Instagram / Learning Library appropriately.

---

### 9. Final CTA

Return to the primary action:

"Upload a Tournament Free"

Keep this much stronger than secondary product CTAs.

---

## Desktop layout

Use the desktop canvas properly.

Target approximately 1400–1500px maximum content width where appropriate.

Avoid:

- narrow article-like columns
- huge empty vertical gaps
- excessive stacked marketing sections
- repetitive cards saying similar things
- horizontal overflow

Prefer:

- two-column compositions
- grouped product panels
- compact information cards
- visible product UI
- strong alignment and consistent grids

---

## Mobile

The experience must remain coherent on mobile.

Priority order:

1. proposition
2. upload
3. Study Plan preview
4. matched lessons
5. deeper product explanation

Do not simply stack every desktop module into a very long mobile page.

Reduce supporting information when necessary.

---

## Simplification rule

The supplied mock deliberately explores many ideas at once.

Do not implement everything simply because it appears in the image.

Every homepage section must answer one of:

- What is Playback Poker?
- Why should I upload a tournament?
- What will I receive?
- What can I do after that?

If a section does not materially help answer one of those questions, remove or combine it.

---

## Implementation

Reuse existing components, design tokens and brand infrastructure wherever practical.

Create reusable components for:

- TournamentUpload
- TournamentAnalysisProgress
- StudyPlanPreview
- StudySpotCard
- MatchedLesson
- TournamentReviewUpsell

Do not change underlying Study Spots or Learning Library business logic unless required for presentation.

Mock/demo data is acceptable for homepage previews.

---

## Deliverable

Implement the redesigned homepage and document:

- components introduced
- existing components reused
- responsive decisions
- any assumptions
- any follow-up product work that would be required to turn preview interactions into live functionality
