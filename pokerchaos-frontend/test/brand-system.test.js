import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const homepageStyles = readFileSync(
  new URL("../src/components/marketing/homepage/homepage-v2.css", import.meta.url),
  "utf8",
);
const learningStyles = readFileSync(new URL("../src/learning-library.css", import.meta.url), "utf8");
const brandComponent = readFileSync(new URL("../src/components/PlaybackBrand.jsx", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function fileHash(url) {
  return createHash("sha256").update(readFileSync(url)).digest("hex");
}

test("canonical Playback Poker references remain available from one brand folder", () => {
  assert.equal(
    existsSync(new URL("../../brand/playback-poker-brand-style-guide.png", import.meta.url)),
    true,
  );
  assert.equal(
    existsSync(new URL("../../brand/playback-poker-scene-identity-kit.png", import.meta.url)),
    true,
  );
});

test("Brand Assets v1 production files remain identical to their canonical sources", () => {
  const mappings = [
    ["../../brand/horizontal with logo.png", "../src/assets/brand/playback-poker-lockup-primary-v1.png"],
    ["../../brand/horizontal no logo.png", "../src/assets/brand/playback-poker-lockup-compact-v1.png"],
    ["../../brand/logo solo.png", "../src/assets/brand/playback-poker-mark-v1.png"],
    ["../../brand/horizontal with logo small.png", "../src/assets/brand/playback-poker-bug-v1.png"],
  ];

  for (const [canonical, production] of mappings) {
    assert.equal(fileHash(new URL(canonical, import.meta.url)), fileHash(new URL(production, import.meta.url)));
  }
});

test("PlaybackBrand is the central renderer for every approved v1 logo role", () => {
  for (const asset of [
    "playback-poker-lockup-primary-v1.png",
    "playback-poker-lockup-compact-v1.png",
    "playback-poker-mark-v1.png",
    "playback-poker-bug-v1.png",
  ]) {
    assert.match(brandComponent, new RegExp(asset.replaceAll(".", "\\.")));
  }
  assert.match(brandComponent, /data-brand-asset-generation="v1"/);
  assert.doesNotMatch(brandComponent, /legacy|playback-nav-image/i);
  assert.match(indexHtml, /playback-poker-mark-v1\.png/);
  assert.doesNotMatch(indexHtml, /vite\.svg|playback-nav-image/i);
});

test("shared brand tokens encode the canonical palette and typography direction", () => {
  for (const declaration of [
    "--brand-surface-base: #0b0e10",
    "--brand-surface-elevated: #14181c",
    "--brand-text-primary: #f4f1e6",
    "--brand-accent-green: #00e39a",
    "--brand-accent-gold: #c8a24d",
    "--brand-font-display: Anton",
  ]) {
    assert.match(styles, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("homepage and Learning Library consume the shared brand system", () => {
  assert.match(homepageStyles, /--home-v2-charcoal:\s*var\(--brand-surface-dark\)/);
  assert.match(homepageStyles, /--home-v2-green-bright:\s*var\(--brand-accent-green\)/);
  assert.match(learningStyles, /\.learning-resource-card--quick/);
  assert.match(learningStyles, /\.learning-lesson-content--quick/);
  assert.match(learningStyles, /\.quick-takeaway/);
  assert.match(learningStyles, /\.quick-lesson-spot/);
  assert.match(learningStyles, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});
