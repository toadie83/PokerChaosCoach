import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import "dotenv/config";

import {
  closeDatabase,
  completeStudyReport,
  createLearningResource,
  createStudyReport,
  deleteLearningResource,
  deleteStudyQueueItem,
  deleteTournamentUpload,
  findLearningResourceDuplicates,
  getLearningResourceBySlug,
  getStudyReport,
  initDatabase,
  listContentGaps,
  listStudyQueueItems,
  listStudyReports,
  saveStudyQueueItem,
  setLearningResourceStatus,
  updateStudyQueueItemStatus,
  upsertTournamentUpload,
} from "../src/db.js";
import { matchLearningResources } from "../src/studySpots/resourceMatcher.js";
import { validateLearningResourceInput } from "../src/studySpots/learningResourceValidation.js";

const suffix = randomUUID();
const userId = `study-db-verifier-${suffix}`;
const otherUserId = `study-db-verifier-other-${suffix}`;
const tournamentId = `tournament-${suffix}`;
const reportId = `report-${suffix}`;
const spotId = `spot-${suffix}`;
const gapTag = `integration-gap-${suffix}`;
const learningResourceId = `learning-resource-${suffix}`;
const learningSlug = `big-blind-defence-${suffix}`;
const learningExternalId = `daily-edge-${suffix}`;

let uploadCreated = false;
let learningResourceCreated = false;

try {
  await initDatabase();
  const learningInput = {
    externalId: learningExternalId,
    series: `Verifier Series ${suffix}`,
    lessonNumber: 1,
    slug: learningSlug,
    title: "Verifier Big Blind Defence Lesson",
    shortTitle: "Verifier BB Defence",
    description: "A complete canonical resource used to verify the Learning Library database contract.",
    resourceType: "quick_lesson",
    category: "preflop",
    primaryTag: "bb-defence",
    secondaryTags: ["short-stack"],
    stackDepthTags: ["15-25"],
    heroPositionTags: ["BB"],
    villainPositionTags: ["BTN"],
    opponentTypeTags: ["aggressive"],
    studySpotTypes: ["close_decision"],
    body: "Use price, stack depth, and the opener's range to construct the defence.",
    exampleSpot: "Hero faces a button open from the big blind at 22 BB effective.",
    mistake: "Folding automatically without considering the price.",
    betterPlay: "Compare the holding with the opener's range and available price.",
    whenToUse: ["Facing a late-position open"],
    whenNotToUse: ["Facing a tight early-position range"],
    takeaway: "Build big blind defence from context rather than a fixed chart.",
    status: "draft",
    publishedAt: null,
    instagramCaption: "",
    instagramUrl: "",
    sourceUrl: "",
    priority: 80,
  };
  const validatedLearning = validateLearningResourceInput(learningInput);
  assert.equal(validatedLearning.success, true);
  await createLearningResource({ ...validatedLearning.data, id: learningResourceId });
  learningResourceCreated = true;
  assert.equal(await getLearningResourceBySlug(learningSlug, { publishedOnly: true }), null);
  const duplicates = await findLearningResourceDuplicates(validatedLearning.data);
  assert.deepEqual(new Set(duplicates.map((item) => item.field)), new Set(["slug", "externalId", "lessonNumber"]));
  const publishedLearning = await setLearningResourceStatus(learningResourceId, "published");
  assert.equal(publishedLearning?.canonicalPath, `/learn/${learningSlug}`);
  assert.equal((await getLearningResourceBySlug(learningSlug, { publishedOnly: true }))?.id, learningResourceId);
  const matched = matchLearningResources({
    category: "preflop",
    type: "close_decision",
    tags: ["bb-defence", "short-stack"],
    stackDepthTag: "15-25",
    heroPosition: "BB",
    villainPosition: "BTN",
    opponentType: "aggressive",
  }, [publishedLearning]);
  assert.equal(matched[0]?.quality, "recommended");
  assert.equal(matched[0]?.resource?.url, `/learn/${learningSlug}`);

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
  assert.equal(gaps.some((gap) =>
    gap.primaryTag === gapTag &&
    gap.studySpotType === "Decision Point" &&
    gap.occurrenceCount === 1
  ), true);

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
  if (learningResourceCreated) {
    await deleteLearningResource(learningResourceId);
  }
  await closeDatabase();
}
