import assert from "node:assert/strict";
import test from "node:test";

import { parseLearningResourceDocument } from "../src/studySpots/structuredImport.js";

test("structured importer accepts JSON and Markdown JSON blocks", () => {
  const json = '{"resource":{"slug":"example-lesson"}}';
  assert.equal(parseLearningResourceDocument(json, ".json").slug, "example-lesson");
  assert.equal(
    parseLearningResourceDocument(`# Lesson\n\n\`\`\`json\n${json}\n\`\`\``, ".md").slug,
    "example-lesson",
  );
});

test("structured importer rejects unstructured Markdown and arrays", () => {
  assert.throws(() => parseLearningResourceDocument("# Lesson", ".md"), /fenced json/);
  assert.throws(() => parseLearningResourceDocument("[]", ".json"), /one learning resource/);
});
