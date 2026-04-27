import { getJson, postJson } from "../lib/api.js";

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

export async function requestTournamentSummaryReview(payload) {
  return postJson("/hand-history/summary-review", payload);
}
