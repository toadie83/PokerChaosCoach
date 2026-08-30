import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  previewLearningResourceImportRequest,
  saveLearningResourceImportRequest,
} from "../src/studySpots/learningImportWorkflow.js";

const fixtureUrl = new URL("./fixtures/daily-mtt-edge-003.production-v2.json", import.meta.url);
const fixtureText = readFileSync(fixtureUrl, "utf8");

function fileRequest(content = fixtureText, fileName = "daily-mtt-edge-003.json") {
  return {
    importDocument: {
      mode: "file",
      fileName,
      mediaType: "application/json",
      size: Buffer.byteLength(content),
      content,
    },
  };
}

test("Grok JSON file runs through normalization and taxonomy validation", async () => {
  const result = await previewLearningResourceImportRequest(fileRequest());
  assert.equal(result.ok, true);
  assert.equal(result.resource.externalId, "daily-mtt-edge-003");
  assert.equal(result.resource.slug, "bb-defend-vs-sb");
  assert.equal(result.resource.category, "blind-vs-blind");
});

test("file workflow returns field errors for invalid taxonomy", async () => {
  const payload = JSON.parse(fixtureText);
  payload.primary_study_tag = "river";
  const content = JSON.stringify(payload);
  const result = await previewLearningResourceImportRequest(fileRequest(content));
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.payload.code, "INVALID_LEARNING_RESOURCE");
  assert.ok(result.payload.details.fieldErrors.primaryTag?.length > 0);
});

test("file workflow blocks duplicate external IDs before persistence", async () => {
  const result = await previewLearningResourceImportRequest(fileRequest(), {
    findDuplicates: async (resource) => [{
      id: "existing-id",
      externalId: resource.externalId,
      slug: resource.slug,
    }],
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.payload.code, "LEARNING_RESOURCE_DUPLICATE");
  assert.equal(result.payload.duplicates[0].externalId, "daily-mtt-edge-003");
});

test("file workflow preserves missing taxonomy flags as import notes", async () => {
  const payload = JSON.parse(fixtureText);
  payload.taxonomy_flags = ["missing:iso-sizing"];
  const content = JSON.stringify(payload);
  const result = await previewLearningResourceImportRequest(fileRequest(content));
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ["Source taxonomy flags: missing:iso-sizing."]);
});

test("successful file import creates exactly one normalized resource", async () => {
  const created = [];
  const result = await saveLearningResourceImportRequest(fileRequest(), {
    findDuplicates: async () => [],
    createId: () => "created-resource-id",
    createResource: async (resource) => {
      created.push(resource);
      return resource;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 201);
  assert.equal(created.length, 1);
  assert.equal(created[0].id, "created-resource-id");
  assert.equal(created[0].externalId, "daily-mtt-edge-003");
  assert.equal(result.payload.imported, true);
});
