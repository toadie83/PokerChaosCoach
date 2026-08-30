export function getStudyPriorities(spots, limit = 3) {
  const seen = new Set();
  const priorities = [];
  for (const spot of Array.isArray(spots) ? spots : []) {
    const label = String(spot?.title || "").trim();
    const key = String(spot?.tags?.[0] || spot?.category || label).trim();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    priorities.push(label);
    if (priorities.length >= limit) break;
  }
  return priorities;
}

export function getResourceState(spot) {
  const matches = Array.isArray(spot?.resourceMatches)
    ? spot.resourceMatches
    : [];
  const recommended = matches.find((match) => match?.quality === "recommended");
  if (recommended?.resource) {
    return {
      kind: "recommended",
      label: "Recommended lesson",
      resource: recommended.resource,
    };
  }
  const related = matches.find((match) => match?.quality === "related");
  if (related?.resource) {
    return {
      kind: "related",
      label: "Related lesson",
      resource: related.resource,
    };
  }
  return {
    kind: "topic",
    label: "No dedicated lesson yet",
    resource: null,
  };
}

export function getLearningResourceHref(resource) {
  return String(resource?.canonicalPath || resource?.url || "").trim();
}

export function formatStackDepth(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "";
  const label = Number.isInteger(number) ? String(number) : number.toFixed(1);
  return `${label} BB`;
}
