import { deleteJson, getJson, postJson } from "../lib/api.js";

export async function requestChaosLine(payload) {
  return postJson("/prompts", payload);
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
