import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  previewLearningResourceImportRequest,
  saveLearningResourceImportRequest,
} from "../src/studySpots/learningImportWorkflow.js";

const fixtureUrl = new URL("./fixtures/daily-mtt-edge-003.production-v2.json", import.meta.url);
const fixtureText = readFileSync(fixtureUrl, "utf8");
const wildcardFixtureUrl = new URL("./fixtures/daily-mtt-edge-008.position-wildcard.json", import.meta.url);
const wildcardFixtureText = readFileSync(wildcardFixtureUrl, "utf8");

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

const contentGapId = "gap_0123456789abcdef0123456789abcdef";
const contentGapBriefId = "brief_0123456789abcdef0123456789abcdef";

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

test("file import persists null until the Instagram derivative is published", async () => {
  const created = [];

  const result = await saveLearningResourceImportRequest(
    fileRequest(wildcardFixtureText, "daily-mtt-edge-008.json"),
    {
      findDuplicates: async () => [],
      createId: () => "daily-mtt-edge-008-id",
      createResource: async (resource) => {
        created.push(resource);
        return resource;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].externalId, "daily-mtt-edge-008");
  assert.equal(created[0].instagramUrl, null);
  assert.deepEqual(created[0].heroPositionTags, ["any"]);
  assert.deepEqual(created[0].villainPositionTags, ["any"]);
  assert.equal(result.payload.resource.instagramUrl, null);
});

test("Grok import metadata links the saved JSON lesson to its selected content gap", async () => {
  const created = [];
  const request = { ...fileRequest(), contentGapId };
  const gap = { id: contentGapId, primaryTag: "bb-defence", status: "open" };

  const result = await saveLearningResourceImportRequest(request, {
    findDuplicates: async () => [],
    getContentGap: async (id) => id === contentGapId ? gap : null,
    createId: () => "gap-resource-id",
    createResource: async (resource, context) => {
      created.push({ resource, context });
      return resource;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.contentGapId, contentGapId);
  assert.equal(created[0].context.contentGapId, contentGapId);
  assert.equal(created[0].resource.id, "gap-resource-id");
});

test("content-gap import fails cleanly when the selected gap no longer exists", async () => {
  const result = await previewLearningResourceImportRequest(
    { ...fileRequest(), contentGapId },
    { getContentGap: async () => null },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.payload.code, "CONTENT_GAP_NOT_FOUND");
});

test("content-gap import rejects malformed workflow references without changing lesson JSON", async () => {
  const result = await previewLearningResourceImportRequest({
    ...fileRequest(),
    contentGapId: "not-a-gap",
  });

  assert.equal(result.ok, false);
  assert.equal(result.payload.code, "LEARNING_IMPORT_CONTENT_GAP_INVALID");
});

test("Grok JSON import can target one Study Spot brief inside a grouped content gap", async () => {
  const created = [];
  const result = await saveLearningResourceImportRequest(
    { ...fileRequest(), contentGapId, contentGapBriefId },
    {
      findDuplicates: async () => [],
      getContentGap: async () => ({
        id: contentGapId,
        briefs: [{ id: contentGapBriefId, title: "BB versus BTN with a suited connector" }],
      }),
      createId: () => "specific-spot-resource-id",
      createResource: async (resource, context) => {
        created.push({ resource, context });
        return resource;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.payload.contentGapBriefId, contentGapBriefId);
  assert.equal(created[0].context.contentGapBriefId, contentGapBriefId);
});

test("Grok JSON import cannot attach a lesson to a brief from another gap", async () => {
  const result = await previewLearningResourceImportRequest(
    { ...fileRequest(), contentGapId, contentGapBriefId },
    { getContentGap: async () => ({ id: contentGapId, briefs: [] }) },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.payload.code, "CONTENT_GAP_BRIEF_NOT_FOUND");
});
