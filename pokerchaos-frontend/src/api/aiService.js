import { postJson } from "../lib/api.js";

export async function requestChaosLine(payload) {
  return postJson("/prompts", payload);
}

export async function requestHandHistoryParse(payload) {
  return postJson("/hand-history/parse", payload);
}

export async function requestHandHistoryReview(payload) {
  return postJson("/hand-history/review", payload);
}
