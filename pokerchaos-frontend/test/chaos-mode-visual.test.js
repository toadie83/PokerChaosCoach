import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("Chaos mode has a visible, accessible state marker", () => {
  assert.match(app, /data-chaos-mode=\{chaosMode \? "true" : "false"\}/);
  assert.match(app, /aria-label="Chaos mode active"/);
  assert.match(app, /className="chaos-mode-indicator"/);
});

test("Chaos mode highlights Hero context and respects reduced motion", () => {
  assert.match(styles, /data-chaos-mode="true"[^}]*card-pill\[data-street="hero"\]/s);
  assert.match(styles, /data-chaos-mode="true"[^}]*table-player\.is-hero/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*chaos-mode-indicator/);
});
