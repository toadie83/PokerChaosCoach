import { createHash } from "node:crypto";

const EVENT_FIELDS = Object.freeze({
  study_spots_upload_started: ["uploadSource", "inputBytes", "retry"],
  study_spots_parse_failed: ["errorCode", "detectedSite", "durationMs"],
  study_spots_analysis_completed: [
    "handCount",
    "candidateCount",
    "spotCount",
    "durationMs",
    "pipelineVersion",
    "model",
    "promptTokens",
    "completionTokens",
    "totalTokens",
    "retry",
  ],
  study_spots_analysis_failed: ["stage", "errorCode", "durationMs", "retry"],
  study_spot_saved: ["spotKey"],
  study_spot_completed: ["spotKey"],
  capability_access_denied: ["capability", "capabilityState", "method"],
});

function boundedScalar(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") return value.trim().slice(0, 120);
  return undefined;
}

export function telemetryKey(value) {
  const input = String(value || "").trim();
  if (!input) return null;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function buildStudyTelemetryEvent(event, fields = {}, now = new Date()) {
  const allowedFields = EVENT_FIELDS[event];
  if (!allowedFields) return null;
  const payload = {
    scope: "study_spots",
    event,
    timestamp: now.toISOString(),
  };
  const actorKey = telemetryKey(fields.userId);
  if (actorKey) payload.actorKey = actorKey;
  for (const key of allowedFields) {
    const value = boundedScalar(fields[key]);
    if (value !== undefined && value !== "") payload[key] = value;
  }
  return payload;
}

export function logStudyTelemetry(event, fields = {}, logger = console.info) {
  const payload = buildStudyTelemetryEvent(event, fields);
  if (!payload) return false;
  logger(JSON.stringify(payload));
  return true;
}

export function detectStudyUploadSite(historyText) {
  const text = String(historyText || "");
  if (/PokerStars Hand/i.test(text)) return "pokerstars";
  if (/Poker Hand #/i.test(text)) return "ggpoker";
  if (/Winamax/i.test(text)) return "winamax";
  if (/888poker/i.test(text)) return "888poker";
  if (/PartyPoker/i.test(text)) return "partypoker";
  if (/Winning Poker/i.test(text)) return "winning-poker-network";
  return "unknown";
}
