import {
  STUDY_SPOT_CATEGORIES,
  STUDY_SPOT_TYPES,
  sanitizeStudySpotTaxonomy,
} from "./taxonomy.js";

const TYPE_SET = new Set(STUDY_SPOT_TYPES);
const CATEGORY_SET = new Set(STUDY_SPOT_CATEGORIES);

function clampScore(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function cleanCopy(value, fallback, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

export function applyStudySpotClassifications(candidates, modelResult) {
  const byId = new Map(
    (Array.isArray(candidates) ? candidates : []).map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const classifications = Array.isArray(modelResult?.classifications)
    ? modelResult.classifications
    : [];
  const seen = new Set();
  const result = [];

  for (const classification of classifications) {
    const candidateId = String(classification?.candidateId || "").trim();
    const candidate = byId.get(candidateId);
    if (!candidate || seen.has(candidateId) || classification?.keep !== true) continue;
    seen.add(candidateId);

    const proposedType = TYPE_SET.has(classification.type)
      ? classification.type
      : candidate.type;
    const proposedCategory = CATEGORY_SET.has(classification.category)
      ? classification.category
      : candidate.category;
    const taxonomy = sanitizeStudySpotTaxonomy({
      ...candidate,
      type: proposedType,
      category: proposedCategory,
      tags: classification.tags,
    });
    const tags = taxonomy.tags.length > 0 ? taxonomy.tags : candidate.tags;

    result.push({
      ...candidate,
      type: taxonomy.type,
      category: taxonomy.category,
      tags,
      title: cleanCopy(classification.title, candidate.title, 90),
      // Keep the deterministic factual summary. Model copy cannot add hand facts.
      summary: candidate.summary,
      whyStudyThis: cleanCopy(
        classification.whyStudyThis,
        candidate.whyStudyThis,
        280,
      ),
      confidence: Math.min(
        candidate.confidence,
        clampScore(classification.confidence, candidate.confidence),
      ),
      strategicImportance: clampScore(
        classification.strategicImportance,
        candidate.strategicImportance,
      ),
      severity: clampScore(classification.severity, candidate.severity),
    });
  }

  return result;
}

