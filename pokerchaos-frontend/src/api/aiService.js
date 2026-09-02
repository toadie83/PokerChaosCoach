import { deleteJson, getJson, postJson } from "../lib/api.js";

export async function requestChaosLine(payload) {
  return postJson("/prompts", payload);
}

export async function requestReplayCardRecognition(payload) {
  return postJson("/replay-vision/cards", payload);
}

export async function requestHandHistoryParse(payload) {
  return postJson("/hand-history/parse", payload);
}

export async function requestHandHistoryReview(payload) {
  return postJson("/hand-history/review", payload);
}

export async function requestEntitlements() {
  return getJson("/me/entitlements");
}

export async function requestStudySpotAnalysis(payload) {
  return postJson("/study-spots/analyse", payload);
}

export async function requestFreeStudyPlan(payload) {
  return postJson("/public/study-plan/analyse", payload, { cache: "no-store" });
}

export async function requestLearningResources(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ["category", "resourceType", "tag", "search"]) {
    const value = String(filters?.[key] || "").trim();
    if (value) params.set(key, value);
  }
  return getJson(`/learn/resources${params.size ? `?${params}` : ""}`);
}

export async function requestLearningResource(slug) {
  return getJson(`/learn/resources/${encodeURIComponent(String(slug || "").trim())}`);
}

export async function requestLearningTaxonomy() {
  return getJson("/learn/taxonomy");
}

export async function requestAdminLearningResources(filters = {}) {
  const params = new URLSearchParams();
  for (const key of ["category", "resourceType", "search"]) {
    const value = String(filters?.[key] || "").trim();
    if (value) params.set(key, value);
  }
  return getJson(`/admin/learning${params.size ? `?${params}` : ""}`);
}

export async function requestAdminLearningTaxonomy() {
  return getJson("/admin/learning/taxonomy");
}

export async function requestAdminContentGaps() {
  return getJson("/admin/learning/content-gaps");
}

function learningImportRequest(payload) {
  return payload?.importDocument ? payload : { resource: payload };
}

export async function requestPreviewLearningImport(payload) {
  return postJson("/admin/learning/import/preview", learningImportRequest(payload));
}

export async function requestImportLearningResource(payload) {
  return postJson("/admin/learning/import", learningImportRequest(payload));
}

export async function requestCreateLearningResource(resource) {
  return postJson("/admin/learning", resource);
}

export async function requestUpdateLearningResource(id, resource) {
  const safeId = encodeURIComponent(String(id || "").trim());
  return postJson(`/admin/learning/${safeId}`, resource, { method: "PUT" });
}

export async function requestSetLearningResourcePublished(id, published) {
  const safeId = encodeURIComponent(String(id || "").trim());
  return postJson(`/admin/learning/${safeId}/${published ? "publish" : "unpublish"}`, {});
}

export async function requestStudyReports() {
  return getJson("/study-spots/reports");
}

export async function requestStudyReport(reportId) {
  const safeId = encodeURIComponent(String(reportId || "").trim());
  return getJson(`/study-spots/reports/${safeId}`);
}

export async function requestDeleteStudyReport(reportId) {
  const safeId = encodeURIComponent(String(reportId || "").trim());
  return deleteJson(`/study-spots/reports/${safeId}`);
}

export async function requestRetryStudyReport(reportId) {
  const safeId = encodeURIComponent(String(reportId || "").trim());
  return postJson(`/study-spots/reports/${safeId}/retry`, {});
}

export async function requestStudyQueue(status = "") {
  const safeStatus = String(status || "").trim();
  return getJson(`/study-queue${safeStatus ? `?status=${encodeURIComponent(safeStatus)}` : ""}`);
}

export async function requestSaveStudySpot(studySpotId) {
  const safeId = encodeURIComponent(String(studySpotId || "").trim());
  return postJson(`/study-queue/${safeId}`, {}, { method: "PUT" });
}

export async function requestUpdateStudySpotStatus(studySpotId, status) {
  const safeId = encodeURIComponent(String(studySpotId || "").trim());
  return postJson(`/study-queue/${safeId}`, { status }, { method: "PATCH" });
}

export async function requestDeleteStudySpot(studySpotId) {
  const safeId = encodeURIComponent(String(studySpotId || "").trim());
  return deleteJson(`/study-queue/${safeId}`);
}

export async function requestBillingStatus() {
  return getJson("/me/billing");
}

export async function requestAiUsageStatus() {
  return getJson("/me/ai-usage");
}

export async function requestBillingCheckoutSession(payload = {}) {
  return postJson("/billing/checkout-session", payload);
}

export async function requestBillingPortalSession(payload = {}) {
  return postJson("/billing/portal-session", payload);
}

export async function requestTournamentSummaryReview(payload) {
  return postJson("/hand-history/summary-review", payload);
}

export async function requestIcmSpotReview(payload) {
  return postJson("/hand-history/icm-review", payload);
}

export async function requestBlindDefenseReview(payload) {
  return postJson("/hand-history/blind-defense-review", payload);
}

export async function requestTableHintReview(payload) {
  return postJson("/hand-history/table-hint", payload);
}

export async function requestTournamentUpload(payload) {
  return postJson("/tournaments/upload", payload);
}

export async function requestSavedTournaments() {
  return getJson("/tournaments");
}

export async function requestSavedTournament(tournamentId) {
  const safeId = encodeURIComponent(String(tournamentId || "").trim());
  return getJson(`/tournaments/${safeId}`);
}

export async function requestDeleteSavedTournament(tournamentId) {
  const safeId = encodeURIComponent(String(tournamentId || "").trim());
  return postJson(`/tournaments/${safeId}/delete`, {});
}

export async function requestTournamentPerformanceSnapshots() {
  return getJson("/performance/tournaments");
}

export async function requestSaveTournamentPerformanceSnapshot(payload) {
  return postJson("/performance/tournaments", payload);
}

export async function requestDeleteTournamentPerformanceSnapshot(tournamentId) {
  const safeId = encodeURIComponent(String(tournamentId || "").trim());
  return deleteJson(`/performance/tournaments/${safeId}`);
}
