import assert from "node:assert/strict";
import test from "node:test";

import { __studySpotClassifierTestables } from "../src/openaiService.js";

test("Study Spot AI schema is strict and candidate-ID scoped", () => {
  const schema = __studySpotClassifierTestables.studySpotClassificationResponseSchema([
    "candidate-a",
    "candidate-b",
  ]);
  assert.equal(schema.additionalProperties, false);
  const item = schema.properties.classifications.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(item.properties.candidateId.enum, ["candidate-a", "candidate-b"]);
  assert.ok(item.properties.type.enum.includes("close_decision"));
  assert.ok(item.properties.tags.items.enum.includes("big-blind-defence"));
  assert.equal(item.properties.title.maxLength, 90);
  assert.equal(item.properties.whyStudyThis.maxLength, 280);
});

