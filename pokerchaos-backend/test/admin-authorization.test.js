import assert from "node:assert/strict";
import test from "node:test";

import {
  requireAdmin,
  requireLearningImporter,
  requireLearningManager,
  scopedLearningAccessDenial,
} from "../src/adminAuthorization.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("admin middleware admits only a server-resolved admin entitlement", () => {
  let called = false;
  requireAdmin({ entitlements: { admin: true } }, responseRecorder(), () => { called = true; });
  assert.equal(called, true);
});

test("admin middleware fails closed without exposing other administration", () => {
  for (const entitlements of [undefined, {}, { developer: true }, { admin: false }]) {
    const response = responseRecorder();
    requireAdmin({ entitlements }, response, () => assert.fail("must not call next"));
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, "ADMIN_REQUIRED");
  }
});

test("learning importer middleware admits scoped importers and administrators", () => {
  for (const entitlements of [
    { learningImporter: true },
    { learningManager: true },
    { admin: true },
  ]) {
    let called = false;
    requireLearningImporter({ entitlements }, responseRecorder(), () => { called = true; });
    assert.equal(called, true);
  }
});

test("learning manager middleware admits managers and administrators only", () => {
  for (const entitlements of [{ learningManager: true }, { admin: true }]) {
    let called = false;
    requireLearningManager({ entitlements }, responseRecorder(), () => { called = true; });
    assert.equal(called, true);
  }

  const response = responseRecorder();
  requireLearningManager(
    { entitlements: { learningImporter: true } },
    response,
    () => assert.fail("must not call next"),
  );
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, "LEARNING_MANAGER_REQUIRED");
});

test("learning importer middleware rejects unrelated entitlements", () => {
  for (const entitlements of [undefined, {}, { developer: true }, { coach: true }]) {
    const response = responseRecorder();
    requireLearningImporter({ entitlements }, response, () => assert.fail("must not call next"));
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, "LEARNING_IMPORT_REQUIRED");
  }
});

test("scoped importer accounts are restricted to the two POST import routes", () => {
  const allowed = [
    { method: "POST", path: "/admin/learning/import" },
    { method: "POST", path: "/admin/learning/import/preview" },
    { method: "GET", path: "/me/entitlements" },
  ];
  for (const request of allowed) {
    assert.equal(scopedLearningAccessDenial({ ...request, entitlements: { learningImporter: true } }), null);
  }

  const denied = [
    { method: "GET", path: "/admin/learning" },
    { method: "POST", path: "/admin/learning" },
    { method: "PUT", path: "/admin/learning/resource-id" },
    { method: "POST", path: "/study-spots/analyse" },
    { method: "POST", path: "/me/entitlements" },
    { method: "POST", path: "/admin/learning/import/preview/extra" },
  ];
  for (const request of denied) {
    const denial = scopedLearningAccessDenial({
      ...request,
      entitlements: { learningImporter: true },
    });
    assert.equal(denial?.status, 403);
    assert.equal(denial?.payload?.code, "LEARNING_IMPORT_SCOPE_REQUIRED");
  }
});

test("scoped learning managers can use Learning Library routes but nothing else", () => {
  for (const request of [
    { method: "GET", path: "/me/entitlements" },
    { method: "GET", path: "/admin/learning" },
    { method: "GET", path: "/admin/learning/content-gaps" },
    { method: "POST", path: "/admin/learning" },
    { method: "PUT", path: "/admin/learning/resource-id" },
    { method: "POST", path: "/admin/learning/resource-id/publish" },
    { method: "POST", path: "/admin/learning/content-gaps/gap-id/link" },
    { method: "POST", path: "/admin/learning/content-gaps/gap-id/complete" },
    { method: "POST", path: "/admin/learning/content-gaps/gap-id/reopen" },
    { method: "POST", path: "/admin/learning/content-gaps/gap-id/briefs/brief-id/covered" },
    { method: "POST", path: "/admin/learning/content-gaps/gap-id/briefs/brief-id/reopen" },
  ]) {
    assert.equal(scopedLearningAccessDenial({
      ...request,
      entitlements: { learningManager: true },
    }), null);
  }

  const denial = scopedLearningAccessDenial({
    method: "POST",
    path: "/study-spots/analyse",
    entitlements: { learningManager: true },
  });
  assert.equal(denial?.status, 403);
  assert.equal(denial?.payload?.code, "LEARNING_MANAGER_SCOPE_REQUIRED");
});

test("administrators are not restricted by the importer scope", () => {
  assert.equal(scopedLearningAccessDenial({
    method: "GET",
    path: "/admin/learning",
    entitlements: { admin: true, learningImporter: true },
  }), null);
});
