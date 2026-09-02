import { randomUUID } from "node:crypto";

import {
  completeStudyReport,
  createStudyReport,
  failStudyReport,
  listLearningResources,
} from "../db.js";
import { classifyStudySpotCandidatesWithAi } from "../openaiService.js";
import {
  prepareTournamentHistory,
  saveTournamentHistory,
} from "../tournamentUploadService.js";
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
        ? rankedSpot.primaryTag || rankedSpot.tags?.[0] || rankedSpot.category
        : null,
  };
}

export function toPublicLearningResourceSummary(resource) {
  if (!resource) return null;
  return {
    id: resource.id,
    slug: resource.slug,
    canonicalPath: resource.canonicalPath || resource.url || "/learn",
    title: resource.title,
    shortTitle: resource.shortTitle || "",
    description: resource.description || "",
    category: resource.category,
    resourceType: resource.resourceType || resource.contentType || "article",
    series: resource.series || null,
    lessonNumber: resource.lessonNumber ?? null,
  };
}

function toPublicSpot(spot) {
  return {
    id: spot.id,
    type: spot.type,
    category: spot.category,
    tags: spot.tags,
    title: spot.title,
    summary: spot.summary,
    whyStudyThis: spot.whyStudyThis,
    confidence: spot.confidence,
    rank: spot.rank,
    occurrenceCount: spot.occurrenceCount,
    stackDepthBb: spot.stackDepthBb,
    stackDepthTag: spot.stackDepthTag,
    heroPosition: spot.heroPosition,
    villainPosition: spot.villainPosition,
    resourceMatches: (spot.resourceMatches || []).map((match) => ({
      quality: match.quality,
      score: match.score,
      resource: toPublicLearningResourceSummary(match.resource),
    })),
  };
}

export async function analyseFreeStudySpotsUpload({
  historyText,
  heroName,
  tournamentId,
  tournamentName,
  uploadSource,
  model,
  classifyCandidates = classifyStudySpotCandidatesWithAi,
  resources: suppliedResources = null,
  resourceLoader = listLearningResources,
  idFactory = randomUUID,
}) {
  const upload = prepareTournamentHistory({
    historyText,
    heroName,
    tournamentId,
    tournamentName,
    uploadSource,
  });
  const candidates = extractStudySpotCandidates(upload.compactHands, {
    maxCandidates: 20,
  });
  const previewId = idFactory();

  if (candidates.length === 0) {
    return {
      report: {
        id: previewId,
        status: "complete",
        handsAnalysed: upload.compactHands.length,
        candidateCount: 0,
        spotCount: 0,
        priorityTheme: null,
        pipelineVersion: STUDY_SPOTS_PIPELINE_VERSION,
        spots: [],
      },
      tournament: {
        name: upload.tournamentName || "Uploaded tournament",
        playedAt: upload.tournamentPlayedAtEpoch
          ? new Date(upload.tournamentPlayedAtEpoch).toISOString()
          : null,
        summary: upload.summary,
      },
      usage: null,
    };
  }

  const modelResult = await classifyWithTransientRetry(
    classifyCandidates,
    candidates,
    model,
  );
  const classified = applyStudySpotClassifications(candidates, modelResult);
  const ranked = rankStudySpots(classified, { limit: 3 });
  const resources =
    suppliedResources || (await resourceLoader({ publishedOnly: true }));
  const spots = ranked
    .map((spot) => toPersistedSpot(previewId, spot, resources, idFactory))
    .map(toPublicSpot);

  return {
    report: {
      id: previewId,
      status: "complete",
      handsAnalysed: upload.compactHands.length,
      candidateCount: candidates.length,
      spotCount: spots.length,
      priorityTheme: spots[0]?.category || null,
      pipelineVersion: STUDY_SPOTS_PIPELINE_VERSION,
      spots,
    },
    tournament: {
      name: upload.tournamentName || "Uploaded tournament",
      playedAt: upload.tournamentPlayedAtEpoch
        ? new Date(upload.tournamentPlayedAtEpoch).toISOString()
        : null,
      summary: upload.summary,
    },
    usage: modelResult?.usage || null,
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
