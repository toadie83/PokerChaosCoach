# Playback Poker Media Workflow (Cloudflare R2)

## Summary

Media delivery for content images is now handled by Cloudflare R2, not the React bundle or Netlify-hosted static assets.

## Workflow

1. Export/compress images before upload.
2. Prefer `.webp` format.
3. Keep assets lightweight (typical target: `100kb-400kb` for screenshots/content images).
4. Upload images to R2 bucket: `playbackpoker-media`.
5. Use the public R2 URL directly in app content.

Example:

```html
<img
  src="https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev/13242.webp"
  alt="Playback Poker founder"
/>
```

## Why

This reduces:

- React build size
- Netlify bandwidth usage
- page load overhead from bundled content images
- deployment bloat

Cloudflare R2 now handles:

- media storage
- image delivery
- CDN distribution
- bandwidth protection

Videos should continue to use YouTube embeds.

## Current Hosting Note

Current setup uses the temporary public `r2.dev` URL. This is acceptable for current traffic, development, and early production usage.

Planned later upgrades may include:

- custom CDN domain (`cdn.playbackpoker.com`)
- production cache policy hardening
- image transforms/resizing

## Image Standards

Use descriptive filenames.

Good:

- `ggpoker-hand-review-example.webp`
- `mtt-leak-analysis-dashboard.webp`

Bad:

- `image1.webp`
- `screenshot-final-final.webp`

Always include meaningful alt text for SEO and accessibility.

## Recommended Filenames: /supported-sites-formats

Use these screenshot filenames when preparing media for the Supported Sites And Formats trust page:

- `supported-sites-formats-upload-workflow.webp` (hero image)
- `supported-sites-formats-export-source-pokercraft.webp`
- `supported-sites-formats-hand-history-text-example.webp`
- `supported-sites-formats-parse-success-overview.webp`
- `supported-sites-formats-import-issue-example.webp`
