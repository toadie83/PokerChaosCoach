import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyTelemetryEvent,
  detectStudyUploadSite,
  telemetryKey,
} from "../src/studySpots/telemetry.js";

test("Study Spot telemetry hashes identities and drops private or unknown fields", () => {
  const payload = buildStudyTelemetryEvent(
    "study_spots_analysis_completed",
    {
      userId: "user-private",
      handCount: 12,
      spotCount: 3,
      model: "study-model",
      historyText: "raw private hand history",
      heroCards: ["As", "Kd"],
      title: "private title",
    },
    new Date("2026-08-30T10:00:00.000Z"),
  );

  assert.equal(payload.actorKey, telemetryKey("user-private"));
  assert.equal(payload.handCount, 12);
  assert.equal(payload.spotCount, 3);
  assert.equal(payload.historyText, undefined);
  assert.equal(payload.heroCards, undefined);
  assert.equal(payload.title, undefined);
  assert.equal(JSON.stringify(payload).includes("user-private"), false);
  assert.equal(JSON.stringify(payload).includes("raw private"), false);
});

test("Study Spot telemetry recognizes sites without retaining upload text", () => {
  assert.equal(detectStudyUploadSite("PokerStars Hand #1"), "pokerstars");
  assert.equal(detectStudyUploadSite("Poker Hand #1"), "ggpoker");
  assert.equal(detectStudyUploadSite("Winamax Poker"), "winamax");
  assert.equal(detectStudyUploadSite("unrecognized"), "unknown");
});

test("unknown telemetry events fail closed", () => {
  assert.equal(buildStudyTelemetryEvent("raw_hand_uploaded", { userId: "x" }), null);
});
