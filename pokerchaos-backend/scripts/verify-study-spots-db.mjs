import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import "dotenv/config";

import {
  closeDatabase,
  completeStudyReport,
  createStudyReport,
  deleteStudyQueueItem,
  deleteTournamentUpload,
  getStudyReport,
  initDatabase,
  listContentGaps,
  listStudyQueueItems,
  listStudyReports,
  saveStudyQueueItem,
  updateStudyQueueItemStatus,
  upsertTournamentUpload,
} from "../src/db.js";

const suffix = randomUUID();
const userId = `study-db-verifier-${suffix}`;
const otherUserId = `study-db-verifier-other-${suffix}`;
const tournamentId = `tournament-${suffix}`;
const reportId = `report-${suffix}`;
const spotId = `spot-${suffix}`;
const gapTag = `integration-gap-${suffix}`;

let uploadCreated = false;

try {
  await initDatabase();
  await upsertTournamentUpload({
    userId,
    tournamentId,
    heroName: "Verifier",
    tournamentName: "Study Spots DB verification",
    uploadSource: "integration-test",
    historyText: "Synthetic integration fixture",
    parsedHands: [{ handKey: "fixture-hand-1" }],
    opponentSnapshot: {},
    summary: { totalHands: 1 },
  });
  uploadCreated = true;

  await createStudyReport({
    id: reportId,
    userId,
    tournamentId,
    handsAnalysed: 1,
    candidateCount: 1,
    pipelineVersion: "study-spots-v1.integration",
    model: "integration-fixture",
  });
  await completeStudyReport({
    id: reportId,
    userId,
    spots: [
      {
        id: spotId,
        primaryHandKey: "fixture-hand-1",
        exampleHandKeys: ["fixture-hand-1"],
        type: "Decision Point",
        category: "Preflop",
        tags: [gapTag],
        title: "Fixture decision",
        summary: "A persisted integration fixture.",
        whyStudyThis: "Verifies the Study Spots persistence contract.",
        confidence: 0.9,
        rankScore: 0.8,
        rank: 1,
        occurrenceCount: 1,
        stackDepthBb: 25,
        stackDepthTag: "20-30bb",
        heroPosition: "BB",
        villainPosition: "BTN",
        opponentType: "unknown",
        handContext: { street: "preflop" },
        resourceMatches: [],
        contentGapTag: gapTag,
      },
    ],
  });

  const report = await getStudyReport(userId, reportId);
  assert.equal(report?.status, "complete");
  assert.equal(report?.spots.length, 1);
  assert.equal(report?.spots[0].resourceMatches.length, 0);
  assert.equal(await getStudyReport(otherUserId, reportId), null);
  assert.equal((await listStudyReports(userId)).some((item) => item.id === reportId), true);

  assert.equal((await saveStudyQueueItem(otherUserId, spotId)), null);
  const firstSave = await saveStudyQueueItem(userId, spotId);
  const secondSave = await saveStudyQueueItem(userId, spotId);
  assert.equal(firstSave?.studySpotId, spotId);
  assert.equal(secondSave?.studySpotId, spotId);
  assert.equal((await listStudyQueueItems(userId)).length, 1);

  const completed = await updateStudyQueueItemStatus(userId, spotId, "completed");
  assert.equal(completed?.status, "completed");
  assert.equal((await listStudyQueueItems(userId, "completed")).length, 1);

  const gaps = await listContentGaps();
  assert.equal(gaps.some((gap) => gap.tag === gapTag && gap.occurrenceCount === 1), true);

  assert.equal(await deleteStudyQueueItem(userId, spotId), true);
  assert.equal(await deleteStudyQueueItem(userId, spotId), false);

  assert.equal(await deleteTournamentUpload(userId, tournamentId), true);
  uploadCreated = false;
  assert.equal(await getStudyReport(userId, reportId), null);

  console.log("Study Spots database verification passed.");
} finally {
  if (uploadCreated) {
    await deleteTournamentUpload(userId, tournamentId);
  }
  await closeDatabase();
}
