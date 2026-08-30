import assert from "node:assert/strict";
import test from "node:test";

import {
  learningImportErrorMessage,
  learningImportIdentityFromText,
  validateLearningImportFile,
} from "../src/lib/learningImportClient.js";

test("JSON upload client validation accepts a bounded Grok lesson file", () => {
  assert.doesNotThrow(() => validateLearningImportFile({
    name: "daily-mtt-edge-005.json",
    type: "application/json",
    size: 14_000,
  }));
  assert.deepEqual(learningImportIdentityFromText(JSON.stringify({
    schema_version: 2,
    external_id: "daily-mtt-edge-005",
    lesson_number: "005",
    title: "Stop Bluffing Calling Stations",
    category: "exploitative",
  })), {
    externalId: "daily-mtt-edge-005",
    lessonNumber: "005",
    title: "Stop Bluffing Calling Stations",
    category: "exploitative",
  });
});

test("JSON upload client validation rejects malformed JSON and wrong file types", () => {
  assert.throws(
    () => learningImportIdentityFromText("{broken}"),
    /malformed JSON/,
  );
  assert.throws(
    () => validateLearningImportFile({ name: "lesson.md", type: "text/markdown", size: 20 }),
    /\.json file only/,
  );
});

test("import API errors expose taxonomy and duplicate details", () => {
  assert.match(learningImportErrorMessage({
    payload: {
      details: {
        formErrors: [],
        fieldErrors: { primaryTag: ["Tag is not valid for category."] },
      },
    },
  }), /primaryTag: Tag is not valid/);
  assert.match(learningImportErrorMessage({
    payload: { duplicates: [{ externalId: "daily-mtt-edge-005" }] },
  }), /never overwritten/);
});
