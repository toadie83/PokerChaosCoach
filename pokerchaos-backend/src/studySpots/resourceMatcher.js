import { sanitizeLearningResource } from "./taxonomy.js";

const WEIGHTS = Object.freeze({
  tags: 0.45,
  category: 0.2,
  stackDepth: 0.15,
  position: 0.1,
  opponent: 0.05,
  priority: 0.05,
});

function includesValue(values, value) {
  return Array.isArray(values) && values.includes(value);
}

function contextCompatibility(resourceValues, spotValue, unknownValue = null) {
  if (!Array.isArray(resourceValues) || resourceValues.length === 0) return 1;
  if (!spotValue || spotValue === unknownValue) return 0;
  return includesValue(resourceValues, spotValue) ? 1 : 0;
}

export function scoreLearningResource(spot, rawResource) {
  const resource = sanitizeLearningResource(rawResource);
  if (!resource.published) return null;

  const spotTags = Array.isArray(spot?.tags) ? spot.tags : [];
  const principalTag = spotTags[0] || null;
  const principalTagMatch = Boolean(
    principalTag && resource.tags.includes(principalTag),
  );
  const anyTagMatch = spotTags.some((tag) => resource.tags.includes(tag));
  const tagCompatibility = principalTagMatch ? 1 : anyTagMatch ? 0.65 : 0;
  const categoryMatch = resource.category === spot?.category;

  const score =
    tagCompatibility * WEIGHTS.tags +
    Number(categoryMatch) * WEIGHTS.category +
    contextCompatibility(
      resource.stackDepthTags,
      spot?.stackDepthTag,
    ) * WEIGHTS.stackDepth +
    contextCompatibility(
      resource.positionTags,
      spot?.heroPosition,
      "unknown",
    ) * WEIGHTS.position +
    contextCompatibility(
      resource.opponentTags,
      spot?.opponentType,
      "unknown",
    ) * WEIGHTS.opponent +
    (resource.priority / 100) * WEIGHTS.priority;

  return {
    resource,
    score: Number(score.toFixed(4)),
    principalTagMatch,
    anyTagMatch,
    categoryMatch,
  };
}

export function matchLearningResources(
  spot,
  resources,
  { recommendedThreshold = 0.75, relatedThreshold = 0.5 } = {},
) {
  const scored = (Array.isArray(resources) ? resources : [])
    .map((resource) => scoreLearningResource(spot, resource))
    .filter(Boolean)
    .map((item) => {
      if (item.score >= recommendedThreshold && item.principalTagMatch) {
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
    resource: item.resource,
  }));
}

