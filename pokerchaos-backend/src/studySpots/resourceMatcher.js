import { sanitizeLearningResource } from "./taxonomy.js";

const WEIGHTS = Object.freeze({
  primaryTag: 0.36,
  secondaryTags: 0.12,
  category: 0.12,
  studySpotType: 0.12,
  stackDepth: 0.08,
  heroPosition: 0.07,
  villainPosition: 0.06,
  opponentType: 0.04,
  priority: 0.03,
});

function contextCompatibility(resourceValues, spotValue, unknownValue = null) {
  if (!Array.isArray(resourceValues) || resourceValues.length === 0) return 1;
  if (!spotValue || spotValue === unknownValue) return 0;
  return resourceValues.includes(spotValue) ? 1 : 0;
}

function overlapRatio(left, right) {
  const leftValues = Array.isArray(left) ? left : [];
  const rightSet = new Set(Array.isArray(right) ? right : []);
  if (leftValues.length === 0 || rightSet.size === 0) return 0;
  const matches = leftValues.filter((value) => rightSet.has(value)).length;
  return matches / Math.max(1, leftValues.length);
}

export function scoreLearningResource(spot, rawResource) {
  const resource = sanitizeLearningResource(rawResource);
  if (!resource.published) return null;

  const spotTags = Array.isArray(spot?.tags) ? spot.tags : [];
  const spotPrimaryTag = String(spot?.primaryTag || spotTags[0] || "").trim();
  const spotSecondaryTags = Array.isArray(spot?.secondaryTags)
    ? spot.secondaryTags
    : spotTags.slice(spotPrimaryTag ? 1 : 0);
  const primaryTagMatch = Boolean(
    spotPrimaryTag && resource.primaryTag === spotPrimaryTag,
  );
  const crossTagMatch = Boolean(
    spotPrimaryTag && resource.secondaryTags.includes(spotPrimaryTag),
  );
  const secondaryOverlap = overlapRatio(
    spotSecondaryTags,
    [resource.primaryTag, ...resource.secondaryTags],
  );
  const anyTagMatch = primaryTagMatch || crossTagMatch || secondaryOverlap > 0;
  const categoryMatch = resource.category === spot?.category;
  const studySpotTypeMatch = contextCompatibility(
    resource.studySpotTypes,
    spot?.type,
  );

  const factors = {
    primaryTag: primaryTagMatch ? 1 : crossTagMatch ? 0.55 : 0,
    secondaryTags: secondaryOverlap,
    category: Number(categoryMatch),
    studySpotType: studySpotTypeMatch,
    stackDepth: contextCompatibility(resource.stackDepthTags, spot?.stackDepthTag),
    heroPosition: contextCompatibility(
      resource.heroPositionTags,
      spot?.heroPosition,
      "unknown",
    ),
    villainPosition: contextCompatibility(
      resource.villainPositionTags,
      spot?.villainPosition,
      "unknown",
    ),
    opponentType: contextCompatibility(
      resource.opponentTypeTags,
      spot?.opponentType,
      "unknown",
    ),
    priority: resource.priority / 100,
  };
  const score = Object.entries(WEIGHTS).reduce(
    (total, [factor, weight]) => total + factors[factor] * weight,
    0,
  );
  const matchReasons = Object.entries(factors)
    .filter(([factor, value]) => factor !== "priority" && value > 0)
    .map(([factor]) => factor);

  return {
    resource,
    score: Number(score.toFixed(4)),
    primaryTagMatch,
    principalTagMatch: primaryTagMatch,
    anyTagMatch,
    categoryMatch,
    factors,
    matchReasons,
  };
}

export function matchLearningResources(
  spot,
  resources,
  { recommendedThreshold = 0.72, relatedThreshold = 0.35 } = {},
) {
  const scored = (Array.isArray(resources) ? resources : [])
    .map((resource) => scoreLearningResource(spot, resource))
    .filter(Boolean)
    .map((item) => {
      if (item.score >= recommendedThreshold && item.primaryTagMatch) {
        return { ...item, quality: "recommended" };
      }
      if (
        item.score >= relatedThreshold &&
        (item.anyTagMatch || item.categoryMatch)
      ) {
        return { ...item, quality: "related" };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.resource.priority - a.resource.priority);

  const recommended = scored.find((item) => item.quality === "recommended");
  const selected = recommended
    ? [recommended]
    : scored.filter((item) => item.quality === "related").slice(0, 2);

  return selected.map((item) => ({
    resourceId: item.resource.id,
    quality: item.quality,
    score: item.score,
    matchReasons: item.matchReasons,
    resource: {
      ...item.resource,
      url: item.resource.canonicalPath,
    },
  }));
}
