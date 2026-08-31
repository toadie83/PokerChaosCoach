# Playback Poker Brand System

## Purpose

This document defines how the canonical Playback Poker visual references are implemented across product, web, learning content, and social-adjacent surfaces.

Canonical references:

- `brand/playback-poker-brand-style-guide.png`
- `brand/playback-poker-scene-identity-kit.png`

The website is the product expression of the same brand, not a literal Instagram composition. Marketing and Daily MTT Edge surfaces can use the strongest branded treatment. Dense product and admin interfaces use the same tokens with restrained decoration.

## Core palette

| Role | Value | Product use |
| --- | --- | --- |
| Table black | `#0B0E10` | Branded base and hero surfaces |
| Charcoal | `#14181C` | Raised dark surfaces and lesson cards |
| Play green | `#00E39A` | Brand mark, dark-surface accents, active lines |
| Green ink | `#007A57` | Accessible green text and controls on light surfaces |
| Soft cream | `#F4F1E6` | Teaching headlines and inverse text |
| Muted gold | `#C8A24D` | Lesson numbers, editorial detail, limited emphasis |
| Danger | `#A94442` | Destructive actions only, never a general brand CTA |

Implementation tokens live in `pokerchaos-frontend/src/styles.css` under `--brand-*`. Feature CSS should consume those semantic tokens rather than introduce page-specific approximations.

## Surfaces and lighting

- Keep the overall marketing and reading shell light.
- Use table black for the homepage hero, Daily MTT Edge bands, Quick Lesson title areas, and end-card style CTAs.
- Use charcoal for elevated dark cards.
- Felt texture is permitted on large branded surfaces and Quick Lesson title treatments only. It is not used behind forms, tables, admin lists, or long-form body copy.
- Green glow is a subtle edge-light or focus motif. Do not use free-floating glow shapes or strong neon bloom.

## Typography

- Display direction: Anton, followed by a narrow/condensed system fallback.
- Body direction: Inter and the existing product sans-serif stack.
- Display type is reserved for hero headlines, major section headlines, Daily MTT Edge titles, lesson hooks, and end-card CTAs.
- Body copy, forms, tables, filters, and dense product UI remain in the body face.
- Letter spacing stays at `0`; hierarchy comes from typeface, weight, scale, and contrast.
- Display text must wrap safely on mobile and must not scale directly with viewport width.

The repo does not currently contain an Anton webfont. `--brand-font-display` is Anton-first and uses a condensed fallback until an approved font file can be bundled. Do not disable package-manager TLS checks to obtain it.

## Logo system

Brand Assets v1 are canonical in the repository-level `brand/` directory. Production copies under `pokerchaos-frontend/src/assets/brand/` must remain byte-identical to those sources:

| Role | Canonical source | Production asset | `PlaybackBrand` variant |
| --- | --- | --- | --- |
| Primary horizontal lockup | `brand/horizontal with logo.png` | `playback-poker-lockup-primary-v1.png` | `primary` |
| Compact wordmark | `brand/horizontal no logo.png` | `playback-poker-lockup-compact-v1.png` | `compact` |
| Standalone `P` mark | `brand/logo solo.png` | `playback-poker-mark-v1.png` | `mark` |
| Small content bug | `brand/horizontal with logo small.png` | `playback-poker-bug-v1.png` | `bug` |

Use `PlaybackBrand.jsx` for rendered product and website logos. Use the full lockup on dark major brand surfaces, the compact wordmark on dark surfaces with tighter horizontal space, and the standalone mark for light navigation, product chrome, favicon, avatar, and icon roles. The supplied cream lockups are not placed directly on light backgrounds. The bug is reserved for quiet signatures on small branded learning/content surfaces.

Preserve intrinsic aspect ratio with `height: auto` or `object-fit: contain`, retain transparent safe space, and never crop, recolour, trace, filter, or reconstruct the artwork in CSS. Do not add page-specific logo variants. Metadata that cannot render React may reference the approved production mark directly.

## Shape and card language

- Standard cards use a maximum `8px` radius.
- Compact controls can use `6px`.
- Borders are thin and low-contrast; stronger green borders communicate selection or brand emphasis.
- Avoid cards nested inside cards. Use dividers and full-width bands for section structure.
- Quick Lessons use a dark editorial title treatment with cream display text, green category accents, and muted-gold lesson numbering.
- Long-form articles remain light, quieter, and optimized for reading.

## Poker motifs

- Felt is a surface texture, not a page wallpaper.
- Chips and cards are supporting corner details for hero, promo, reel, and end-card scenes.
- Product UI should not add decorative poker props.
- Never place chips/cards where they compete with controls, text, or hand-state information.

## Calls to action

- Primary action on light: accessible green ink with white text.
- Primary action on dark: play green with table-black text.
- Secondary action: transparent or cream treatment with a clear border.
- Muted gold is editorial emphasis, not the default CTA colour.
- Danger red is reserved for destructive actions.
- All focus states use the shared green focus ring and remain visible on both light and dark surfaces.

## Responsive use

- Reduce or remove decorative props on mobile.
- Preserve the display/body hierarchy while reducing headline size at explicit breakpoints.
- Quick Lesson cards stack to one column and keep compact metadata.
- Long-form lesson bodies use one readable column on mobile.
- No fixed minimum width may create horizontal page overflow.

## Accessibility

- Bright play green is used as text primarily on dark surfaces.
- Green ink is used for text on light surfaces.
- Cream-on-dark is the primary teaching-headline pairing.
- Keyboard focus uses `--brand-focus-ring` and must never be removed without replacement.
- Brand fidelity does not override readable line length, control clarity, or semantic heading order.

Measured contrast ratios for the implemented core pairs:

- Soft cream on table black: `17.12:1`.
- Play green on table black: `11.48:1`.
- Green ink on white: `5.36:1`.
- Muted gold on table black: `8.05:1`.
- Muted light text on charcoal: `9.60:1`.

## Surface map

- Homepage: light shell, dark felt hero, dark Daily MTT Edge band, mixed Quick Lesson/article cards.
- Learning Library: branded dark header, dark Quick Lesson cards, calm light article cards.
- Quick Lesson page: branded dark title area followed by a light reading surface.
- Long-form article page: light editorial header and reading surface.
- Study Spots and Tournament Review: brand accents, borders, and hierarchy only; no decorative scene treatment.
- Admin: functional existing layout with shared focus, border, and action tokens.

## Change control

New pages must reuse the canonical images, approved logo exports, and `--brand-*` tokens. If a needed visual role is missing, add one semantic token at the root rather than hard-coding a new feature colour.
