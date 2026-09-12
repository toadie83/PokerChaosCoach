import test from "node:test";
import assert from "node:assert/strict";
import { scoreDealerPixels, settleDealerObservation } from "../src/vision/localDealerWatcher.js";

function dealerFixture(width = 48, height = 32, withGlyph = true) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    data[offset] = 45; data[offset + 1] = 55; data[offset + 2] = 48; data[offset + 3] = 255;
  }
  const centerX = 24;
  const centerY = 16;
  for (let y = 7; y <= 25; y += 1) {
    for (let x = 15; x <= 33; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > 9) continue;
      const offset = (y * width + x) * 4;
      data[offset] = 245; data[offset + 1] = 199; data[offset + 2] = 12;
    }
  }
  if (withGlyph) {
    for (let y = 11; y <= 21; y += 1) {
      for (let x = 21; x <= 25; x += 1) {
        if (x === 21 || y === 11 || y === 21 || x === 25) {
          const offset = (y * width + x) * 4;
          data[offset] = 35; data[offset + 1] = 35; data[offset + 2] = 35;
        }
      }
    }
  }
  return { data, width, height };
}

test("yellow circular puck with a dark glyph scores as a dealer candidate", () => {
  const scored = scoreDealerPixels(dealerFixture());
  assert.ok(scored.confidence >= 0.62);
  assert.ok(scored.component.darkRatio > 0);
});

test("a plain yellow disc without an enclosed glyph stays below acceptance", () => {
  assert.ok(scoreDealerPixels(dealerFixture(48, 32, false)).confidence < 0.62);
});

test("dealer evidence requires consecutive matching seats", () => {
  const first = settleDealerObservation(null, { candidateSeat: 3, confidence: 0.9, capturedAt: 1000 });
  const second = settleDealerObservation(first, { candidateSeat: 3, confidence: 0.91, capturedAt: 1250 });
  assert.equal(first.confirmed, false);
  assert.equal(second.confirmed, true);
  assert.equal(second.dealerScreenSeat, 3);
  const changed = settleDealerObservation(second, { candidateSeat: 4, confidence: 0.92, capturedAt: 1500 });
  assert.equal(changed.repeats, 1);
  assert.equal(changed.confirmed, false);
});

test("an uncertain frame breaks dealer repeat validation", () => {
  const first = settleDealerObservation(null, { candidateSeat: 2, confidence: 0.9, capturedAt: 1000 });
  const missing = settleDealerObservation(first, { candidateSeat: null, confidence: 0.4, capturedAt: 1250 });
  assert.equal(missing.repeats, 0);
  assert.equal(missing.dealerScreenSeat, null);
});
