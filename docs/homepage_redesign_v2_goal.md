# Playback Poker Homepage Redesign V2

Status: Implemented and verified  
Product: Playback Poker  
Last updated: 2026-08-31  
Document type: Living implementation goal

> This document supersedes `docs/homepage-redesign-brief.md` for homepage product hierarchy, positioning, composition, and calls to action. The older brief remains historical context only.

## 1. Goal

Redesign the Playback Poker homepage around the current multi-tool product.

Playback Poker has evolved from a single tournament review tool into a broader MTT study and improvement platform. The homepage must help a new visitor quickly understand the product, see the available tools, and enter through the free Study Spots experience.

The homepage must sell one simple idea before revealing the wider ecosystem:

> Your tournament tells us what you should study next.

The intended acquisition path is:

```text
Visitor -> Free Study Spots -> Useful result -> Learning Library
        -> Account habit -> Tournament Review upsell
```

Do not treat this as a section-by-section restyle of the current homepage. Create a new homepage composition based on the product that exists now.

## 2. Product hierarchy

### Primary: Find My Study Spots

Access: Free for registered users.

Registered users can upload a tournament hand history. Playback Poker analyses the tournament, identifies the hands and decisions most worth studying, and connects those Study Spots to relevant lessons in the Learning Library.

This is the homepage's primary acquisition path.

Core message:

> Turn your tournament into a study plan.

Supporting message:

> Upload your hand history. Find the spots worth studying. Learn from the decisions you actually faced.

Primary CTA:

> Find My Study Spots - Free

Registration may happen after the CTA. Do not make registration the headline.

### Secondary: Tournament Review

Access: Tier 1, with a free trial while currently supported.

Tournament Review provides deeper analysis of decisions, mistakes, missed opportunities, and tournament-wide patterns.

The homepage must distinguish the tools clearly:

> Study Spots tells you what to study. Tournament Review tells you what happened and why.

CTA:

> Try Tournament Review

Do not substantially redesign the underlying Tournament Review tool as part of this goal.

### Future: Poker Coach

Access: Disabled and unavailable.

Poker Coach may appear in the product ecosystem as:

> Poker Coach - Coming later

Do not create a working access path or imply that Poker Coach is currently available.

## 3. Experience and design principles

The design should feel:

- Modern
- Clean
- Connected to the real product
- Premium
- Product-led
- Visually lighter than the old poker-tool aesthetic
- Fast to scan
- Closer to a modern SaaS or fintech product than a traditional poker site

Avoid:

- Dense text
- Retro poker styling
- Dark casino aesthetics
- Large walls of explanation
- Generic AI marketing language
- Excessive gradients or glow
- Poker stock imagery as the primary product visual
- Glowing poker tables or Vegas imagery
- Oversized cards or chips used as decoration
- AI robot imagery
- Fake dashboards unrelated to the application
- Excessive badges
- Six unrelated visual styles on one page

AI is an enabling technology, not the headline.

## 4. Core homepage narrative

The central product loop is:

```text
Play -> Upload -> Discover -> Study -> Improve
```

A visitor should understand within seconds that Playback Poker uses their real tournament history to guide what they should study.

Use one primary positioning line with restraint:

> Don't study random poker. Study your poker.

Other copy directions may inform supporting content, but should not all appear together:

- Your hands already contain your next study session.
- Stop guessing what to study next.
- Turn real tournament decisions into practical study.

## 5. Proposed homepage composition

### 5.1 Public navigation

Review the public header so it reflects the current platform without becoming crowded.

Potential structure:

- Product / Tools
- Learn
- How it works
- About

Primary navigation CTA:

> Find Study Spots

Authenticated navigation should continue to expose the application workspace and tools.

### 5.2 Hero

The first viewport is critical and must remain minimal.

Preferred headline:

> Turn your tournaments into better decisions.

Alternative:

> Turn every tournament into a study plan.

Supporting copy:

> Upload your hand history. Playback Poker finds the decisions worth studying and connects them to practical MTT lessons.

Keep supporting copy to approximately two short lines.

Primary CTA:

> Find My Study Spots - Free

Secondary CTA:

> Explore Playback Poker

The brand/product must be an obvious first-viewport signal, and the viewport should retain a visible hint of the next section on desktop and mobile.

### 5.3 Hero product visual

Show the real product experience rather than poker stock imagery or a generic marketing illustration.

The visual should communicate:

```text
Tournament uploaded
        |
        v
6 Study Spots found
```

Show two or three credible example Study Spot cards, such as:

**Big Blind Defence**  
You folded K9o versus a 2.2x small-blind steal at 31bb.  
Recommended lesson: Big Blind Defence vs a Small Blind Steal

**Continuation Betting**  
You c-bet a low connected flop against a limp-call range.  
Recommended lesson: Continuation Betting vs Limp-Callers

**Stack Depth**  
Your 21bb opening strategy created reshove pressure.  
Recommended lesson: Changing Strategy as Stacks Shorten

This must look like a real Playback Poker interface or product preview. Reuse existing Study Spots components and design language where practical.

### 5.4 Product loop

Headline:

> Your tournament becomes your curriculum

Communicate the five steps visually and concisely:

1. **Play** - Play your normal online MTT.
2. **Upload** - Import the tournament hand history.
3. **Discover** - Playback Poker identifies strategically useful Study Spots.
4. **Study** - Get matched with relevant lessons from the Learning Library.
5. **Improve** - Take those decisions into your next session.

Do not turn these steps into five large paragraphs.

### 5.5 Tool selector

Suggested headline:

> One place to improve your tournament game

Present three clear panels:

| Tool | Access | Description | Action |
| --- | --- | --- | --- |
| Find My Study Spots | Free | Upload a tournament, find the decisions most worth studying, and get matched with relevant lessons. | Find my Study Spots |
| Tournament Review | Advanced / Tier 1 | Review decisions, mistakes, missed opportunities, and recurring tournament-wide patterns in greater detail. | Try Tournament Review |
| Poker Coach | Coming later | Personalised ongoing study and coaching based on the player's game. | Disabled / non-interactive |

Visually prioritise Study Spots. Mention the Tournament Review free trial subtly if it remains supported by the product at implementation time.

### 5.6 Learning Library

Treat the Learning Library as a first-class capability.

Suggested headline:

> Learn from the spots you actually play

Show three or four real published LearningResource cards, including current lessons such as:

- Isolation Raises vs Limps
- Continuation Betting vs Limp-Callers
- Big Blind Defence vs a Small Blind Steal

Include category labels and link each card to its canonical lesson page.

CTA:

> Explore the Learning Library

Source cards dynamically from published LearningResources if technically practical. The section should make it clear through real content that the library continues to grow.

### 5.7 Daily MTT Edge

Include a compact section:

> A new practical MTT lesson every day.

Explain briefly that Daily MTT Edge covers preflop, postflop, tournament theory, hand reading, exploitative play, and related topics.

The content exists primarily as Playback Poker LearningResources and is also distributed through social media. Do not make Instagram the centre of the product.

Primary CTA:

> Browse Daily MTT Edge

Optional secondary link:

> Follow @playbackpkr

### 5.8 Study Spots and Tournament Review comparison

Keep the comparison compact and focused on product understanding rather than pricing.

| Capability | Study Spots | Tournament Review |
| --- | --- | --- |
| Find hands worth studying | Yes | Yes |
| Match learning resources | Yes | Yes |
| Detailed hand analysis | No | Yes |
| Tournament-wide patterns | No | Yes |
| Decision-by-decision review | No | Yes |
| Access | Free | Tier 1 |

### 5.9 Trust and methodology

Include a small credibility section explaining:

- Analysis is practical and tournament-focused.
- Recommendations use actual hand-history context.
- Not every flagged hand is necessarily a mistake.
- Study Spots may represent mistakes, close decisions, missed opportunities, recurring patterns, or useful learning nodes.

Suggested copy:

> Not every Study Spot is a mistake.
>
> Playback Poker looks for decisions with learning value, including close spots, missed opportunities, and recurring patterns.

### 5.10 Final CTA

End with a specific free-entry CTA.

Suggested headline:

> Your next study session is already in your hand history.

Supporting copy:

> Upload a tournament and let Playback Poker find the spots worth revisiting.

CTA:

> Find My Study Spots - Free

Do not end with generic copy such as "Get started today."

## 6. Visual system

Retain the Playback Poker identity while substantially tightening the presentation.

Design goals:

- Large, confident typography for true hero content
- Generous spacing and a strong grid
- Modern, restrained card layouts
- Lighter surfaces with controlled contrast
- Minimal borders
- Restrained brand accent colour
- Large, authentic product visuals
- Subtle depth and motion where useful
- Excellent mobile responsiveness
- No text or control overlap at any supported viewport

Use existing tokens, components, typography, and interaction conventions where they fit the new composition. The homepage should clearly belong to the same product as Tools Hub, Study Spots, Tournament Review, and the Learning Library.

## 7. Real product data and capability integrity

Before implementation, inspect:

- The current homepage and shared marketing shell
- The application design system
- Tools Hub
- Study Spots entry, reports, and cards
- Learning Library and LearningResource API
- Tournament Review entry and entitlement behavior
- Existing authentication and CTA flows

Requirements:

- Reuse real product components and representations where practical.
- Prefer dynamically loaded published LearningResources over hard-coded lesson cards.
- Do not invent capabilities that do not exist.
- Keep Poker Coach disabled.
- Preserve the free registered-user Study Spots flow.
- Preserve Tier 1 enforcement for Tournament Review.
- Do not modify the core Tournament Review workflow unless necessary to preserve navigation.

## 8. SEO and content integrity

Audit current homepage SEO before replacing the composition.

Preserve or improve:

- Page title
- Meta description
- Canonical metadata
- Structured data where appropriate
- Existing meaningful internal links
- Semantic heading structure
- Sitemap and robots behavior

Use natural search-relevant language around:

- Poker hand review
- MTT study
- Tournament poker analysis
- Poker hand history analysis
- Poker study tool

Do not keyword-stuff visible copy.

## 9. Implementation approach

### Phase 1: Audit and structure

- [x] Audit the current homepage, public navigation, SEO metadata, and reusable shared components.
- [x] Audit Tools Hub, Study Spots, Learning Library, and Tournament Review UI.
- [x] Record the proposed final section order and reusable component map in this document.
- [x] Identify current CTA destinations and entitlement behavior.
- [x] Identify the published LearningResource data path for dynamic homepage cards.

### Phase 2: Product composition

- [x] Build the new minimal hero and product-led Study Spots visual.
- [x] Implement the Play -> Upload -> Discover -> Study -> Improve loop.
- [x] Implement the three-tool selector with accurate availability states.
- [x] Add the Learning Library section using real published resources where practical.
- [x] Add the compact Daily MTT Edge section.
- [x] Add the concise Study Spots vs Tournament Review comparison.
- [x] Add the methodology statement and final free CTA.
- [x] Update public navigation without disrupting authenticated navigation.

### Phase 3: Integration and polish

- [x] Confirm every CTA resolves to the intended existing route and auth flow.
- [x] Confirm Poker Coach remains non-interactive and unavailable.
- [x] Confirm dynamic content has useful loading, empty, and failure states.
- [x] Verify semantic headings, metadata, structured data, and internal links.
- [x] Verify layout and content at desktop, tablet, and mobile widths.
- [x] Check long titles, dynamic lessons, controls, and text for overflow or overlap.
- [x] Run the complete frontend test suite and production build.
- [x] Capture browser screenshots for desktop and mobile review when tooling permits.

## 10. Acceptance criteria

The redesign succeeds when a new visitor can understand within approximately ten seconds that:

- [x] Playback Poker is for MTT and tournament poker players.
- [x] They can upload a tournament hand history.
- [x] Playback Poker finds useful Study Spots.
- [x] Study Spots connect to relevant lessons.
- [x] Study Spots is free for registered users.
- [x] Tournament Review is a deeper Tier 1 capability.
- [x] Poker Coach is a future capability and is not currently available.

The implementation must also:

- [x] Render cleanly on desktop and mobile.
- [x] Expose one clear free primary CTA.
- [x] Connect visually to the real application.
- [x] Include the Learning Library as a first-class capability.
- [x] Clearly communicate the available tools without becoming a feature catalogue.
- [x] Avoid overwhelming visitors with text.
- [x] Preserve existing authentication and entitlement flows.
- [x] Preserve or improve homepage SEO.
- [x] Keep existing SEO landing pages and article routes working.
- [x] Pass the existing production build and test suites.

## 11. Living implementation record

Update this section during execution rather than creating a disconnected plan.

### Audit findings

- The current homepage is componentized under `src/components/marketing/homepage`, but its copy, hero image, product preview, and calls to action still describe Tournament Review as the primary product.
- The shared `MarketingSiteShell` and `MarketingSiteHeader` are used by the homepage, Learning Library, lesson pages, articles, and trust pages. Header changes must therefore remain valid away from `/`.
- Signed-out actions use Clerk modal buttons. Signed-in product links can resolve directly to `/tools/study-spots`, `/tools/tournament-review`, and `/tools` without changing authentication architecture.
- The authenticated Tools Hub already exposes the correct three-capability hierarchy and server-resolved states: Study Spots, Tournament Review, and disabled Coach.
- Study Spots cards provide the closest existing visual language for ranked learning opportunities and matched lessons. The homepage preview should adapt that hierarchy without pretending to be a live report.
- `requestLearningResources()` calls the public `/learn/resources` endpoint, which returns published resources only and provides canonical `/learn/:slug` paths. It is suitable for dynamic homepage lesson cards.
- The Learning Library already has loading, empty, and error behavior and category-labelled canonical lesson cards.
- Homepage metadata currently targets generic hand review. The title, description, Open Graph fields, canonical URL, and SoftwareApplication schema need updated multi-tool MTT positioning.
- Existing SEO landing pages and trust pages depend on the current shared marketing classes. The redesign should use homepage-specific V2 classes instead of globally rewriting those shared layouts.

### Final section order

1. Public navigation with Product, Learn, How it works, About, Sign in/Open app, and Find Study Spots.
2. Minimal Study Spots-first hero with an authentic uploaded-tournament results preview.
3. Play -> Upload -> Discover -> Study -> Improve product loop.
4. Three-tool selector with Study Spots visually prioritised and Coach disabled.
5. Dynamic published LearningResource section.
6. Compact Daily MTT Edge section.
7. Study Spots vs Tournament Review comparison.
8. Constructive methodology statement.
9. Compact internal-link section preserving existing SEO routes.
10. Final free Study Spots CTA.

### Reused components and data sources

- `MarketingSiteShell` and `MarketingSiteHeader` for the public shell and authentication actions.
- Clerk `SignUpButton`, `SignInButton`, and `useAuth` for existing authentication behavior.
- `requestLearningResources()` for published LearningResource data.
- `learningLabel()` and each resource's `canonicalPath` for lesson presentation and links.
- Existing Playback Poker brand mark, spacing conventions, neutral surfaces, red accent, and green success language.
- Existing SEO landing-page routes and trust/methodology routes for internal links.
- Existing Study Spots information hierarchy: ranked spot, hand context, reason to study, and recommended lesson.

### Decisions and deviations

- The hero uses a purpose-built product preview based on the real Study Spots information hierarchy rather than mounting an authenticated report component. This keeps the public page deterministic and avoids implying that example results are live user data.
- Signed-out primary actions retain Clerk's modal registration flow; signed-in actions link directly to `/tools/study-spots`. Registration therefore remains behind the product CTA rather than becoming the headline.
- Daily MTT Edge selects the first matching resource from the public API's published ordering. When no matching lesson exists, the section still links to the filtered Learning Library without inventing content.
- The homepage uses a scoped `home-v2` visual system. Shared marketing pages retain their existing layouts while receiving the updated public navigation labels.

### Verification results

- `npm test` in `pokerchaos-frontend`: 94 tests passed.
- `npm test` in `pokerchaos-backend`: 184 tests passed.
- `npm run build` in `pokerchaos-frontend`: production build passed; the pre-existing Rollup chunk-size warning remains.
- Headless Edge CDP checks at 1440x1000 and 390x844 confirmed no horizontal overflow, four dynamic published lesson cards, canonical `/learn/:slug` links, and complete full-page rendering.
- Desktop and mobile screenshots were inspected for hierarchy, text fit, control fit, section transitions, and overlap. Both preserve a first-viewport hint of the following section.
- The public LearningResource endpoint returned five published resources locally; homepage selection correctly displayed four and surfaced the latest Daily MTT Edge lesson.
- CTA destinations, signed-out Clerk actions, signed-in tool routes, disabled Coach state, SEO metadata, structured data, and existing internal routes were checked against the implementation and route tests.

### Desktop canvas refinement - 2026-08-31

- Raised the homepage-only frame cap from the inherited 1240px Learning Library limit to 1560px. At 1440px the page now uses 1367px of the available viewport; at 1920px it uses the full 1560px canvas.
- Converted the desktop hero to a 40/60 copy-and-product grid and reduced its height to 620px. The product preview remains a single stacked surface below 1040px.
- Compressed the workflow into a connected heading-and-five-step horizontal band and placed the tool introduction beside the three-card tool row on desktop.
- Reduced tool and LearningResource card height, internal spacing, and section padding while preserving all dynamic content and availability states.
- Kept Daily MTT Edge as a 30px-padded horizontal strip.
- Combined comparison and methodology into a 1.35/0.65 desktop grid. Removed the comparison table's fixed minimum width so it no longer creates an internal scrollbar.
- Recast SEO workflow links as a compact heading-and-link utility band and tightened the final split CTA.
- Browser measurements at 100% scale showed zero document-width or comparison-table overflow at 1920, 1440, 1280, 1024, and 390 CSS pixels.
- The desktop full-page height at 1440px decreased from approximately 4762px to 3005px while retaining the existing information hierarchy.
- Visual inspection passed at 1440x1000, 1024x768, and 390x844. Mobile remains stacked, readable, and free of horizontal overflow.
- Post-refinement frontend verification: 94 tests passed and the production build completed successfully with only the existing Rollup chunk-size warning.

### Social brand alignment - 2026-08-31

- Preserved the V2 information architecture and wide desktop composition while introducing a hybrid light-shell and dark-brand-surface system.
- Reworked the hero with a near-black charcoal felt surface, cream condensed display typography, teal accents, and an integrated Study Spots report. The hero remains two-column above 1040px and stacked below it.
- Replaced the previous red action language with accessible teal: `#087a5a` for primary buttons and light-surface links, `#35c998` for accents on charcoal, and `#056047` for primary hover states.
- Added `src/assets/brand/playback-felt-texture-v1.jpg`, a 39.8 KB generated raster texture used only on the hero, Daily MTT Edge band, and quick-lesson cards. The source image was generated with the built-in image tool using the supplied social posts as material/mood references, then resized and compressed for the web. It contains no text, logos, cards, chips, or interface content.
- Learning Library cards now use resource metadata to distinguish `quick_lesson` content from long-form articles. Quick lessons use the Daily MTT Edge editorial treatment; articles retain the lighter library treatment.
- The Daily MTT Edge band now renders a dynamic editorial cover using the latest published lesson's series, lesson number, category, short title, canonical path, and optional Instagram URL.
- Browser checks at 1440x1000 and 390x844 confirmed zero horizontal overflow, two quick-lesson cards, two Study article cards, a canonical Daily lesson cover, and the real imported Instagram bridge.
- Post-alignment frontend verification: 95 tests passed and the production build completed successfully with only the existing Rollup chunk-size warning.
