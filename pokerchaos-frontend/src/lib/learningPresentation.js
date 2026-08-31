export function learningLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function isQuickLearningResource(resource) {
  return resource?.resourceType === "quick_lesson" || resource?.contentType === "quick_lesson";
}

export function isArticleLearningResource(resource) {
  return resource?.resourceType === "article" || resource?.contentType === "article";
}

export function getLegacyLearningResourceRedirect(resource, currentPath = "") {
  const canonicalPath = String(resource?.canonicalPath || "").trim();
  if (
    !isArticleLearningResource(resource) ||
    !canonicalPath.startsWith("/articles/") ||
    !String(currentPath).startsWith("/learn/")
  ) {
    return "";
  }
  return canonicalPath;
}

export function toggleWildcardChoice(values, option, wildcard = "any") {
  const current = Array.isArray(values) ? values : [];
  if (option === wildcard) return current.includes(wildcard) ? [] : [wildcard];
  const withoutWildcard = current.filter((value) => value !== wildcard);
  return withoutWildcard.includes(option)
    ? withoutWildcard.filter((value) => value !== option)
    : [...withoutWildcard, option];
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

export function filterAdminLearningResources(
  resources,
  { query = "", category = "all", status = "all" } = {},
) {
  const normalizedQuery = String(query).trim().toLowerCase();

  return (Array.isArray(resources) ? resources : []).filter((resource) => {
    if (category !== "all" && resource?.category !== category) return false;
    if (status !== "all" && resource?.status !== status) return false;
    if (!normalizedQuery) return true;

    const searchable = [
      resource?.title,
      resource?.shortTitle,
      resource?.slug,
      resource?.externalId,
      resource?.series,
      resource?.lessonNumber,
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
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
  const input = Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      resource[key] === undefined ? defaults[key] : resource[key],
    ]),
  );
  input.instagramUrl = resource.instagramUrl || "";
  return input;
}
