# Playback Poker Homepage Redesign Brief

## Goal

Redesign the Playback Poker homepage to improve conversion, trust, and clarity.

The current homepage feels too dark, retro, and poker-themed in a way that makes the product feel more like a novelty than a serious study tool. The new homepage should feel modern, clean, premium, and approachable, closer to modern fintech / SaaS landing pages.

The homepage should immediately communicate:

- Upload a poker hand history.
- Get a clear AI-powered review.
- Find leaks faster.
- Study without needing expensive solver subscriptions.

This is not a solver clone. It is an accessible poker review assistant for real players.

## Design Direction

Use a modern SaaS / fintech style inspired by companies like Monzo:

- Light backgrounds
- Large hero asset
- Minimal but confident copy
- Rounded containers
- Clean spacing
- Soft contrast
- Strong CTA buttons
- Product-first layout
- Less "dark poker room"
- Less retro/casino aesthetic
- More "smart modern tool for ambitious poker players"

The design should still feel poker-related, but not gimmicky.

The uploaded poker chip image should be used as the initial hero visual / placeholder asset. It can be upgraded later, so the page structure should support swapping in a stronger product or brand asset later.

## Homepage Positioning

Playback Poker is:

- A poker hand review tool
- Built for MTT and online poker players
- Focused on actionable feedback
- Useful for reviewing GGPoker and PokerStars hands
- Designed for players who want practical study without drowning in solver outputs
- Especially useful for low and mid-stakes players

Avoid presenting it as:

- A perfect GTO solver
- A guaranteed profit tool
- A coaching replacement
- A batch mass-analysis platform
- A gambling promotion product

## Visual Style

### Overall Feel

The new homepage should feel:

- Light
- Calm
- Premium
- Trustworthy
- Focused
- Modern
- Conversion-led

Avoid:

- Heavy black backgrounds
- Neon casino colours
- Retro poker fonts
- Dense blocks of copy
- Busy card-table visuals
- Overly aggressive gambling language

### Suggested Colour System

Use a light neutral base with poker-inspired accent colours.

Example direction:

```css
--bg-page: #f7f4ee;
--bg-card: #ffffff;
--bg-soft: #f1ede5;
--text-main: #101820;
--text-muted: #5d6673;
--accent-red: #d9473f;
--accent-red-dark: #b9342d;
--accent-green: #14785f;
--border-soft: rgba(16, 24, 32, 0.08);
--shadow-soft: 0 24px 80px rgba(16, 24, 32, 0.1);
```

The red should feel like a controlled brand accent, not a loud casino red.

### Typography

Use the existing site font stack if already established, but apply a cleaner hierarchy.

Suggested style:

- Large, bold hero headline
- Short supporting copy
- Clear button text
- Generous line height
- Avoid all-caps except for small labels

Hero headline should feel direct and benefit-led.

Examples:

- Review poker hands in minutes, not hours.
- Turn tricky poker hands into clear study notes.
- Your poker hands, reviewed clearly.

## Homepage Structure

### 1. Header / Navigation

Create a clean sticky or top-aligned header.

Recommended nav items:

- Hand Review
- Supported Sites
- Articles / Learning
- How It Works
- Pricing or Start Free
- Sign In

Primary CTA:

- Review a Hand

Secondary:

- Sign In

The nav should feel light and spacious.

### Learning Dropdown

Add a modern dropdown menu for learning/content, inspired by modern fintech/SaaS navigation.

When the user hovers or clicks "Learning", show a large rounded dropdown panel.

Suggested sections:

- Featured
- Best MTT Study Workflow
  Practical review routine for tournament players.
- How to Export GGPoker Hands
  Step-by-step guide for PokerCraft exports.
- Poker Leak Finder
  Find repeated mistakes across common spots.
- Learn by Topic
- MTT Hand Review
- Poker Session Review
- Tournament Analysis
- GGPoker Hand Review
- PokerStars Hand Review
- AI Poker Analysis
- Trust / Methodology
- How Playback Poker Works
- AI Limitations
- Supported Sites & Formats

The dropdown should use clean cards, small icons if available, short descriptions, and clear hover states.

On mobile, this should collapse into an accordion-style menu.

### 2. Hero Section

The hero section is the most important conversion area.

It should use:

- A large rounded hero container
- Light background
- Strong headline
- Short supporting copy
- Primary CTA
- Secondary CTA
- Large visual asset on the right or as a background panel
- Minimal text
- Trust markers underneath

Suggested copy:

Headline:

- Review poker hands in minutes, not hours.

Subcopy:

- Upload a GGPoker or PokerStars hand history and get clear, street-by-street feedback on your decisions, leaks, sizing, and missed opportunities.

Primary CTA:

- Review a Hand

Secondary CTA:

- See How It Works

Trust markers:

- Supports GGPoker & PokerStars
- Built for MTT players
- No solver subscription needed
- Practical leak-focused feedback

The hero asset should use the uploaded poker chip image for now. Place it in a large rounded card or visual panel. Do not make the page dark just because the image has a darker red background. The asset should sit inside the light layout.

### 3. Problem Section

Keep this short and sharp.

Suggested heading:

- Poker study is too slow for most players.

Supporting cards:

- Solver outputs are hard to apply
  Solvers are powerful, but they can be expensive, slow, and difficult to translate into real decisions.
- You forget the hands that matter
  The biggest learning moments often disappear after the session unless you review them properly.
- Generic advice misses the spot
  You need feedback based on the actual action, stack depth, board, position, and decision point.

### 4. Solution Section

Suggested heading:

- Playback Poker turns hand histories into useful feedback.

Use a clean 3-step layout:

1. Upload or paste a hand  
   Import a GGPoker or PokerStars hand history.
2. Get a street-by-street review  
   See what happened preflop, flop, turn, and river.
3. Find the real takeaway  
   Understand the main leak, better options, and what to watch for next time.

### 5. Product Preview Section

Show the product as a clean UI preview.

This can be a mock browser panel if real screenshots are not available yet.

Include example review cards:

- Preflop: Call may be too loose versus position and stack depth
- Flop: Good continuation with equity and range advantage
- Turn: Missed pressure opportunity
- River: Bluff-catch node, review sizing and opponent line

Do not overdo fake data. Keep it credible and simple.

### 6. Use Cases Section

Suggested heading:

- Built for the hands you keep thinking about.

Cards:

- Big tournament spots  
  Review all-ins, reshoves, ICM pressure, and awkward stack depths.
- River decisions  
  Understand calls, folds, bluff-catches, and missed value.
- Session review  
  Save difficult hands and turn them into a practical study routine.
- Leak finding  
  Spot repeated patterns like passive lines, missed aggression, or poor preflop discipline.

### 7. Supported Sites Section

Suggested heading:

- Works with the sites you already play.

Include:

- GGPoker
- PokerStars

Mention:

- Tournament hand histories
- Cash game hand histories
- PokerCraft exports
- PokerStars hand history logs / copy paste flows where supported

Keep it honest. Do not overclaim support.

### 8. Trust / AI Limitations Section

Important for credibility.

Suggested heading:

- Clear feedback, not fake certainty.

Copy:

Playback Poker offers AI enhancement to interpret hand histories and explain decision points clearly. It is designed to support your review process, not replace your judgement or guarantee perfect GTO output.

Link to:

- How Playback Poker Works
- AI Limitations
- Methodology

This helps avoid sounding like a dodgy gambling tool.

### 9. SEO Landing Page Links

The homepage should internally link to important landing pages.

Include a section like:

- Explore poker review tools

Links:

- AI Poker Hand Analyzer
- GGPoker Hand Review Tool
- Poker Leak Finder
- MTT Hand Review Software
- Tournament Hand Analysis
- Poker Session Review

This should look like a clean card grid, not a keyword dump.

### 10. Final CTA

Suggested heading:

- Got a hand you're still thinking about?

Subcopy:

- Paste it into Playback Poker and get a clear review in minutes.

CTA:

- Review a Hand

Secondary:

- Read the Methodology

## Component Requirements

Use reusable components where possible:

- `HomeHero`
- `LearningDropdown`
- `FeatureCards`
- `HowItWorks`
- `ProductPreview`
- `SupportedSites`
- `TrustSection`
- `SeoLinkGrid`
- `FinalCTA`

Avoid creating one huge unmaintainable homepage component.

## Responsive Requirements

The design must work well on:

- Desktop
- Tablet
- Mobile

Mobile rules:

- Hero stacks vertically
- Header collapses cleanly
- Dropdown becomes an accordion
- CTA remains visible and easy to tap
- Avoid tiny text
- Avoid horizontal scrolling
- Hero image should crop safely

## Conversion Requirements

The homepage should make it obvious what to do next.

Primary CTA should appear:

- In the header
- In the hero
- After the how-it-works section
- In the final CTA

CTA wording should be consistent:

- Review a Hand

Avoid vague CTAs like:

- Learn More

## Content Tone

Tone should be:

- Practical
- Confident
- Clear
- Slightly conversational
- Not hypey

Good:

- See the decision that changed the hand.
- Useful feedback for the hands that actually matter.

Avoid:

- Crush your opponents with unbeatable AI poker technology.
- Guaranteed poker profits.

## Implementation Notes

Before making changes:

- Inspect the current homepage structure.
- Identify existing routing and component patterns.
- Preserve existing SEO metadata and improve where appropriate.
- Reuse existing assets and styling conventions where sensible.
- Add the uploaded poker chip image as the hero placeholder asset.
- Ensure existing landing pages and article routes remain unaffected.
- Do not remove existing SEO pages.
- Do not break sitemap or robots setup.
- Keep code clean and componentized.
- Run build/test checks after implementation.
