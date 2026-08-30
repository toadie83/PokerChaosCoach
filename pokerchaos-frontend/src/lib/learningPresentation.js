export function learningLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function groupLearningResources(resources) {
  const grouped = new Map();
  for (const resource of Array.isArray(resources) ? resources : []) {
    const category = String(resource?.category || "study");
    const current = grouped.get(category) || [];
    current.push(resource);
    grouped.set(category, current);
  }
  return Array.from(grouped.entries());
}

export function learningResourceSlugFromPath(pathname) {
  const segments = String(pathname || "").split("/").filter(Boolean);
  return segments[0] === "learn" && segments.length === 2 ? segments[1] : "";
}

export function emptyLearningResource() {
  return {
    externalId: "",
    series: "Daily MTT Edge",
    lessonNumber: null,
    slug: "",
    title: "",
    shortTitle: "",
    description: "",
    resourceType: "quick_lesson",
    category: "preflop",
    primaryTag: "opening",
    secondaryTags: [],
    stackDepthTags: [],
    heroPositionTags: [],
    villainPositionTags: [],
    opponentTypeTags: [],
    studySpotTypes: [],
    body: "",
    exampleSpot: "",
    mistake: "",
    betterPlay: "",
    whenToUse: [],
    whenNotToUse: [],
    takeaway: "",
    status: "draft",
    publishedAt: null,
    instagramCaption: "",
    instagramUrl: "",
    sourceUrl: "",
    priority: 50,
  };
}

export function learningResourceInput(resource = {}) {
  const defaults = emptyLearningResource();
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      resource[key] === undefined ? defaults[key] : resource[key],
    ]),
  );
}
