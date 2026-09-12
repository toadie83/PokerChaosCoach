// Optional real-engine test; first run may download English language data.
// Run from pokerchaos-frontend: node scripts/check-local-ocr-crops.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createWorker } from "tesseract.js";
import { validateSplitBet } from "../src/vision/localBetOcr.js";
const fixture = name => fileURLToPath(new URL(`../test/fixtures/local-bet-ocr/${name}.png`, import.meta.url));
const worker = await createWorker("eng", 1, { cachePath: process.env.TEMP || "/tmp", errorHandler: () => {} });
try {
  const amount = await worker.recognize(fixture("amount"), { tessedit_pageseg_mode: "7" });
  const suffix = await worker.recognize(fixture("suffix"), { tessedit_pageseg_mode: "13" });
  const accepted = validateSplitBet(amount.data.text, suffix.data.text, amount.data.confidence, suffix.data.confidence);
  assert.equal(accepted.amountBB, 1.8);
  const digits = await worker.recognize(fixture("digits-88"), { tessedit_pageseg_mode: "13" });
  const rejected = validateSplitBet(amount.data.text, digits.data.text, amount.data.confidence, digits.data.confidence);
  assert.equal(rejected.amountBB, null, "Actual digit 8s must not validate as BB");
  for (const name of ["suffix-empty-word-mode", "suffix-empty-word-mode-2", "suffix-empty-word-mode-3", "suffix-empty-word-mode-4"]) {
    const { data } = await worker.recognize(fixture(name), { tessedit_pageseg_mode: "13" });
    assert.equal(data.text.trim(), "BB", name);
    assert.ok(data.confidence >= 75, name);
  }
  console.log(JSON.stringify({ accepted, rejectedSuffix: digits.data.text.trim(), recoveredSuffixFixtures: 4 }));
} finally { await worker.terminate(); }
