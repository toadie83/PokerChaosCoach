import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTENT_GAP_IMPORT_SESSION_KEY,
  clearContentGapImportContext,
  readContentGapImportContext,
  setContentGapImportContext,
} from "../src/lib/contentGapImportContext.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("Study Spot import context survives repeated render-time reads until mount cleanup", () => {
  const storage = memoryStorage();
  const gap = {
    id: "gap-id",
    status: "open",
    category: "postflop",
    primaryTag: "river",
    studySpotType: "close_decision",
    decisionCount: 4,
  };
  const brief = {
    id: "brief-id",
    status: "open",
    title: "River bluff-catch with ace-nine",
    heroPosition: "BTN",
    villainPosition: "BB",
    handContext: { street: "river", heroCards: ["9d", "As"] },
  };

  setContentGapImportContext(gap, brief, storage);

  const firstRender = readContentGapImportContext(storage);
  const strictModeRender = readContentGapImportContext(storage);
  assert.deepEqual(strictModeRender, firstRender);
  assert.equal(strictModeRender.brief.id, brief.id);
  assert.notEqual(storage.getItem(CONTENT_GAP_IMPORT_SESSION_KEY), null);

  clearContentGapImportContext(storage);
  assert.equal(readContentGapImportContext(storage), null);
});
