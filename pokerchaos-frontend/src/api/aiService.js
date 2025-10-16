import { postJson } from "../lib/api.js";

export async function requestChaosLine(payload) {
  return postJson("/prompts", payload);
}

