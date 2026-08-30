function clamp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function groupKey(candidate) {
  return [
    candidate.category,
    candidate.tags?.[0] || "untagged",
    candidate.stackDepthTag || "unknown-stack",
    candidate.heroPosition || "unknown-hero-position",
    candidate.villainPosition || "unknown-villain-position",
    candidate.opponentType || "unknown-opponent",
  ].join(":");
}

function selectDiverseSpots(sorted, limit) {
  const selected = [];
  const deferred = [];
  const categoryCounts = new Map();
  for (const spot of sorted) {
    const count = categoryCounts.get(spot.category) || 0;
    if (count < 3 || spot.type === "recurring_pattern") {
      selected.push(spot);
      categoryCounts.set(spot.category, count + 1);
    } else {
      deferred.push(spot);
    }
    if (selected.length >= limit) return selected;
  }
  return [...selected, ...deferred].slice(0, limit);
}

export function groupRecurringCandidates(candidates) {
  const groups = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const key = groupKey(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  return Array.from(groups.values()).map((group) => {
    const sorted = [...group].sort(
      (a, b) =>
        b.strategicImportance - a.strategicImportance ||
        b.confidence - a.confidence,
    );
    const primary = sorted[0];
    if (sorted.length < 2) {
      return {
        ...primary,
        primaryHandKey: primary.handKey,
        exampleHandKeys: [primary.handKey],
        occurrenceCount: 1,
      };
    }

    return {
      ...primary,
      type: "recurring_pattern",
      title: primary.title,
      summary: `We found ${sorted.length} similar ${primary.title.toLowerCase()} decisions in this tournament.`,
      whyStudyThis: `${primary.whyStudyThis} Reviewing the examples together can reveal whether this is a recurring pattern.`,
      confidence: Math.min(0.95, primary.confidence + Math.min(0.12, sorted.length * 0.025)),
      primaryHandKey: primary.handKey,
      exampleHandKeys: Array.from(new Set(sorted.map((item) => item.handKey))).slice(0, 5),
      occurrenceCount: sorted.length,
    };
  });
}

export function rankStudySpots(candidates, { limit = 8 } = {}) {
  const grouped = groupRecurringCandidates(candidates);
  const principalTagFrequency = new Map();
  for (const spot of grouped) {
    const tag = spot.tags?.[0] || "untagged";
    principalTagFrequency.set(tag, (principalTagFrequency.get(tag) || 0) + 1);
  }

  const ranked = grouped.map((spot) => {
    const repeatOccurrence = clamp((spot.occurrenceCount || 1) / 4);
    const tag = spot.tags?.[0] || "untagged";
    const novelty = 1 / (principalTagFrequency.get(tag) || 1);
    const rankScore =
      clamp(spot.strategicImportance) * 0.3 +
      clamp(spot.confidence) * 0.25 +
      repeatOccurrence * 0.2 +
      clamp(spot.severity) * 0.15 +
      clamp(novelty) * 0.1;
    return { ...spot, rankScore: Number(rankScore.toFixed(4)) };
  });

  const resolvedLimit = Math.max(1, Math.min(8, Number(limit) || 8));
  const sorted = ranked.sort(
    (a, b) =>
      b.rankScore - a.rankScore ||
      a.candidateId.localeCompare(b.candidateId),
  );
  return selectDiverseSpots(sorted, resolvedLimit)
    .map((spot, index) => ({ ...spot, rank: index + 1 }));
}
