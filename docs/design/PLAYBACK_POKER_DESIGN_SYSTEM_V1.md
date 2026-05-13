# PLAYBACK POKER DESIGN SYSTEM V1

Purpose: This document is the design operating system for Playback Poker.  
Scope: Web app UI (not logo redesign).  
Use: Human reference, implementation spec, and reusable AI prompt context.

### Foundation Build Order
1. Define Mood (principles)
2. Define Tokens
3. Lock Typography Hierarchy
4. Lock Surface Hierarchy
5. Define Component Standards

## 1. Brand Identity

### Product Position
Playback Poker is **professional poker intelligence software**.

### Brand Direction
- Premium
- Tactical
- Analytical
- Competitive
- Calm
- Focused
- Metallic
- Minimal
- Data-first
- Professional

### Identity Contrast Rule
- Logo = bold identity punch.
- UI = controlled sophistication.
- Do not make logo intensity and UI intensity compete.

## 2. Visual Principles

1. **Premium, not flashy**: luxury trading terminal energy with subtle confidence.
2. **Data first**: information clarity beats decoration.
3. **Tactical and competitive**: the UI should feel like a serious edge tool.
4. **Calm dark mode**: low eye fatigue for long analysis sessions.
5. **Controlled highlights**: blue accents and glow are reserved for key actions and insights.
6. **Compact intelligence**: prioritize high-value analytical density over decorative spacing. Interfaces should feel tactical, scan-efficient, and insight-rich while preserving clarity and premium visual rhythm. Whitespace is used intentionally for hierarchy, not decoration.

### DO NOT
- Neon cyberpunk aesthetics
- Casino red/gold styling
- Cartoon poker visuals
- Oversized glow effects
- Rainbow stat coloring
- Cramped layouts
- Flat grayscale monotony
- Gamer-style body typography
- Screen-by-screen freestyle styling

## 3. Color Tokens

Use tokens only; avoid raw hex in components.

### Core Token Contract (Required Keys)
```css
:root {
  --bg-primary: #05070B;
  --bg-surface: #0B1120;
  --bg-elevated: #111827;

  --border-primary: #2A3446;

  --text-primary: #D6DCE5;
  --text-muted: #94A3B8;

  --accent-primary: #2D7FF9;
  --accent-hover: #56A8FF;

  --success: #0F8F5B;
  --warning: #B88728;
  --danger: #A94442;

  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 12px;

  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 24px;
  --spacing-6: 32px;
  --spacing-7: 48px;
}
```

```css
:root {
  /* Backward-compatible aliases */
  --bg-app: var(--bg-primary);
  --bg-surface-1: var(--bg-surface);
  --bg-surface-2: var(--bg-elevated);
  --border-metallic: var(--border-primary);
  --accent-bright: var(--accent-hover);
  --state-success: var(--success);
  --state-warning: var(--warning);
  --state-danger: var(--danger);
}
```

### Color Usage Rules
- Blue accents indicate active, selected, or primary actions.
- Gold is warning/caution only.
- Red is error/risk only.
- Keep most UI neutral; use accent sparingly for signal strength.

## 4. Typography System

### Font Stack
- UI Sans: `Inter`, fallback `system-ui, sans-serif`
- Optional alternates: `Manrope`, `IBM Plex Sans`
- Data/hand histories/metrics mono: `JetBrains Mono`, fallback `ui-monospace, monospace`

### Type Scale
```css
:root {
  --font-display-size: 40px;
  --font-display-weight: 700;
  --font-display-line: 1.15;

  --font-h1-size: 32px;
  --font-h1-weight: 700;
  --font-h1-line: 1.2;

  --font-h2-size: 24px;
  --font-h2-weight: 600;
  --font-h2-line: 1.25;

  --font-h3-size: 18px;
  --font-h3-weight: 600;
  --font-h3-line: 1.3;

  --font-body-size: 14px;
  --font-body-weight: 400;
  --font-body-line: 1.5;

  --font-small-size: 12px;
  --font-small-weight: 500;
  --font-small-line: 1.4;

  --font-mono-size: 13px;
  --font-mono-weight: 500;
  --font-mono-line: 1.5;
}
```

### Hierarchy Rules
- Display: hero metrics or major module headers only.
- H1: page/dashboard titles only.
- H2: panel titles.
- H3: section labels inside panels/cards.
- Body: default content.
- Small: helper text, metadata, secondary labels.
- Mono: stats, parsed outputs, hand histories, tabular numeric blocks.

## 5. Spacing System

Use a fixed spacing scale only.

```css
:root {
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 24px;
  --spacing-6: 32px;
  --spacing-7: 48px;
}
```

### Spacing Rules
- Use token steps only; no custom one-off spacing.
- Prefer vertical rhythm of `16px`/`24px` inside panels.
- Minimum touch/click target height: `40px`.
- Default panel padding: `var(--spacing-5)`.
- Default card padding: `var(--spacing-4)`.

## 6. Surface & Elevation System

### 4-Layer Depth Model
- Layer 0: app background (`--bg-primary`)
- Layer 1: main panels (`--bg-surface`)
- Layer 2: cards and contained modules (`--bg-elevated`)
- Layer 3: interactive focus/active emphasis (focus ring, active border, micro-glow)

### Elevation Rules
- Distinguish levels via subtle lightness shift and border definition.
- Use `--border-primary` for panel/card outlines.
- Avoid strong drop shadows; prefer low-contrast edge definition.

Example baseline:
```css
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
}

.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
}
```

## 7. Component Rules

### Buttons
- Height: `40px` default, `44px` for primary CTAs.
- Radius: `var(--radius-md)`.
- Primary: blue fill (`--accent-primary`) + light hover lift.
- Hover transition speed: `var(--motion-fast)`.
- Secondary: dark surface + metallic border (`--border-primary`).
- Disabled: lower contrast, no glow.

### Inputs
- Recessed dark surface (Level 2 style).
- Border: `1px solid var(--border-primary)`.
- Focus: subtle blue edge glow + border shift to `--accent-primary`.
- Placeholder text uses `--text-muted`.

### Panels
- Background: `--bg-surface`.
- Border: `1px solid var(--border-primary)`.
- Padding: `var(--spacing-5)`.
- Internal gap rhythm: `var(--spacing-4)` then `var(--spacing-5)` between sections.

### Cards
- Use Level 2 surface.
- Border: `1px solid var(--border-primary)`.
- Consistent `var(--spacing-4)` internal padding.
- Header-content-footer spacing pattern with token scale.

### Tags/Pills
- Compact rounded indicators for status/categorization.
- Use muted base fills; semantic variants only when meaningful.
- Keep text legible; avoid saturated fills for neutral tags.

## 8. Interaction & Motion

### Motion Principles
- Fast, subtle, purposeful.
- Reinforce state change; never decorative noise.

### Timing Tokens
```css
:root {
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 240ms;
  --ease-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
}
```

### State Behaviors
- Hover: slight brightness increase or border emphasis.
- Focus: visible ring/outline using `--accent-primary`.
- Active/selected: stronger accent contrast, persistent cue.
- Glow policy: restrained micro-glow only on interactive emphasis.

Example:
```css
.focusable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-primary) 70%, white 30%);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgb(45 127 249 / 20%);
}
```

## 9. Accessibility Rules

1. Maintain WCAG AA contrast for text and critical UI states.
2. Never communicate meaning with color alone; pair with icon/text.
3. Preserve clear keyboard focus states across all controls.
4. Minimum body size `14px`; avoid dense low-line-height blocks.
5. Respect reduced motion preferences for transitions/animations.

Implementation checks:
- Contrast test for every semantic state.
- Keyboard-only navigation pass for each major panel.
- Screen zoom test at 200%.

## 10. AI Implementation Prompt

Use this template for future Codex tasks.

```md
Using PLAYBACK_POKER_DESIGN_SYSTEM_V1.md as the source of truth, refactor [FEATURE OR PANEL].

Goals:
- Strengthen visual hierarchy and spacing rhythm
- Reduce visual noise
- Preserve premium dark tactical aesthetic
- Improve clarity of primary analysis actions

Hard Requirements:
- Use design tokens only (color, spacing, type, motion)
- Apply 4-layer surface/elevation model
- Keep typography hierarchy (Display/H1/H2/H3/Body/Small/Mono) consistent
- Keep glow restrained and state-driven
- Preserve responsive behavior (desktop + mobile)
- Maintain or improve accessibility (WCAG AA contrast, keyboard focus visibility)

Output Requirements:
- Update component styles and structure only where needed
- Do not introduce new ad-hoc colors/spacing/font sizes
- List all modified files
- Summarize how changes map to the design system sections

Avoid:
- Neon/cyberpunk visuals
- Casino styling
- Rainbow analytics colors
- Dense borders and cramped layouts
```

---

Version: `v1`  
File: `PLAYBACK_POKER_DESIGN_SYSTEM_V1.md`  
Next planned versions:
- v2: chart/data-viz tokens and patterns
- v3: coach mode interaction language
- v4: mobile-first refinements
