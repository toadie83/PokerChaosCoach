## Deprecated Local Asset Path

Playback Poker content images no longer ship from the frontend bundle.

Use Cloudflare R2 for content media:

- Bucket: `playbackpoker-media`
- Public base URL: `https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev/`
- Preferred format: `.webp`
- Target size: `100kb-400kb` for screenshots/content images

Example usage:

```html
<img
  src="https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev/13242.webp"
  alt="Playback Poker founder"
/>
```

Naming standard:

- Good: `ggpoker-hand-review-example.webp`
- Good: `mtt-leak-analysis-dashboard.webp`
- Bad: `image1.webp`
- Bad: `screenshot-final-final.webp`

Always include meaningful alt text for SEO and accessibility.
