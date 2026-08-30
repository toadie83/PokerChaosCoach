import { randomUUID } from "node:crypto";

import {
  completeStudyReport,
  createStudyReport,
  failStudyReport,
  listLearningResources,
} from "../db.js";
import { classifyStudySpotCandidatesWithAi } from "../openaiService.js";
import { saveTournamentHistory } from "../tournamentUploadService.js";
import { extractStudySpotCandidates } from "./candidateExtractor.js";
import { applyStudySpotClassifications } from "./classifier.js";
import { rankStudySpots } from "./ranker.js";
import { matchLearningResources } from "./resourceMatcher.js";

export const STUDY_SPOTS_PIPELINE_VERSION = "study-spots-v1.0";

const DEFAULT_PERSISTENCE = Object.freeze({
  createStudyReport,
  completeStudyReport,
  failStudyReport,
});

const TRANSIENT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "APIConnectionError",
  "rate_limit_exceeded",
]);

function isTransientAnalysisError(error) {
  const status = Number(error?.status || error?.statusCode);
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    TRANSIENT_ERROR_CODES.has(error?.code) ||
    error?.name === "APIConnectionError"
  );
}

async function classifyWithTransientRetry(classifyCandidates, candidates, model) {
  try {
    return await classifyCandidates(candidates, model);
  } catch (error) {
    if (!isTransientAnalysisError(error)) throw error;
    return classifyCandidates(candidates, model);
  }
}

function toPersistedSpot(reportId, rankedSpot, resources, idFactory) {
  const matches = matchLearningResources(rankedSpot, resources).map((match) => ({
    resourceId: match.resourceId,
    quality: match.quality,
    score: match.score,
    resource: match.resource,
  }));
  return {
    id: idFactory(),
    reportId,
    primaryHandKey: rankedSpot.primaryHandKey || rankedSpot.handKey,
    exampleHandKeys: rankedSpot.exampleHandKeys || [rankedSpot.handKey],
    type: rankedSpot.type,
    category: rankedSpot.category,
    tags: rankedSpot.tags,
    title: rankedSpot.title,
    summary: rankedSpot.summary,
    whyStudyThis: rankedSpot.whyStudyThis,
    confidence: rankedSpot.confidence,
    rankScore: rankedSpot.rankScore,
    rank: rankedSpot.rank,
    occurrenceCount: rankedSpot.occurrenceCount || 1,
    stackDepthBb: rankedSpot.stackDepthBb,
    stackDepthTag: rankedSpot.stackDepthTag,
    heroPosition: rankedSpot.heroPosition,
    villainPosition: rankedSpot.villainPosition,
    opponentType: rankedSpot.opponentType,
    handContext: rankedSpot.handContext,
    resourceMatches: matches,
    contentGapTag:
      matches.length === 0
        ? rankedSpot.tags?.at(-1) || rankedSpot.category
        : null,
  };
}

export async function analyseSavedTournamentForStudy({
  userId,
  tournamentId,
  compactHands,
  model,
  classifyCandidates = classifyStudySpotCandidatesWithAi,
  resources: suppliedResources = null,
  persistence = DEFAULT_PERSISTENCE,
  resourceLoader = listLearningResources,
  idFactory = randomUUID,
}) {
  const candidates = extractStudySpotCandidates(compactHands, {
    maxCandidates: 20,
  });
  const reportId = idFactory();
  await persistence.createStudyReport({
    id: reportId,
    userId,
    tournamentId,
    handsAnalysed: compactHands.length,
    candidateCount: candidates.length,
    pipelineVersion: STUDY_SPOTS_PIPELINE_VERSION,
    model: candidates.length > 0 ? model : null,
  });

  try {
    if (candidates.length === 0) {
      const report = await persistence.completeStudyReport({
        id: reportId,
        userId,
        spots: [],
      });
      return { report, usage: null };
    }

    const modelResult = await classifyWithTransientRetry(
      classifyCandidates,
      candidates,
      model,
    );
    const classified = applyStudySpotClassifications(candidates, modelResult);
    const ranked = rankStudySpots(classified, { limit: 8 });
    const resources =
      suppliedResources || (await resourceLoader({ publishedOnly: true }));
    const spots = ranked.map((spot) =>
      toPersistedSpot(reportId, spot, resources, idFactory),
    );
    const report = await persistence.completeStudyReport({
      id: reportId,
      userId,
      spots,
    });
    return { report, usage: modelResult?.usage || null };
  } catch (error) {
    await persistence.failStudyReport({
      id: reportId,
      userId,
      errorCode: "ANALYSIS_FAILED",
      errorMessage: "Study Spot analysis failed. Retry this saved tournament.",
    });
    error.reportId = reportId;
    throw error;
  }
}

export async function analyseStudySpotsUpload({
  userId,
  historyText,
  heroName,
  tournamentId,
  tournamentName,
  uploadSource,
  model,
  classifyCandidates,
  resources,
}) {
  const upload = await saveTournamentHistory({
    userId,
    historyText,
    heroName,
    tournamentId,
    tournamentName,
    uploadSource,
  });
  const result = await analyseSavedTournamentForStudy({
    userId,
    tournamentId: upload.tournamentId,
    compactHands: upload.compactHands,
    model,
    classifyCandidates,
    resources,
  });
  return { ...result, tournament: upload.saved, summary: upload.summary };
}
