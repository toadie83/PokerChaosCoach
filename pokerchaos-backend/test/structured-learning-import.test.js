import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LEARNING_IMPORT_FILE_BYTES,
  parseLearningResourceDocument,
  resolveLearningResourceImportRequest,
} from "../src/studySpots/structuredImport.js";

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

test("file import request accepts one bounded JSON file", () => {
  const content = '{"resource":{"slug":"uploaded-lesson"}}';
  const resource = resolveLearningResourceImportRequest({
    importDocument: {
      mode: "file",
      fileName: "daily-mtt-edge-005.json",
      mediaType: "application/json",
      size: Buffer.byteLength(content),
      content,
    },
  });
  assert.equal(resource.slug, "uploaded-lesson");
});

test("file import request rejects malformed JSON and wrong file types", () => {
  assert.throws(
    () => resolveLearningResourceImportRequest({
      importDocument: {
        mode: "file",
        fileName: "lesson.json",
        mediaType: "application/json",
        size: 8,
        content: "{broken}",
      },
    }),
    (error) => error.code === "LEARNING_IMPORT_JSON_INVALID",
  );
  assert.throws(
    () => resolveLearningResourceImportRequest({
      importDocument: {
        mode: "file",
        fileName: "lesson.md",
        mediaType: "text/markdown",
        size: 2,
        content: "{}",
      },
    }),
    (error) => error.code === "LEARNING_IMPORT_FILE_TYPE_INVALID",
  );
});

test("file import request enforces the server byte limit", () => {
  const content = "x".repeat(MAX_LEARNING_IMPORT_FILE_BYTES + 1);
  assert.throws(
    () => resolveLearningResourceImportRequest({
      importDocument: {
        mode: "file",
        fileName: "lesson.json",
        mediaType: "application/json",
        size: Buffer.byteLength(content),
        content,
      },
    }),
    (error) => error.code === "LEARNING_IMPORT_FILE_TOO_LARGE",
  );
});
