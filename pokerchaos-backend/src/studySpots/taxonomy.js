export const STUDY_SPOT_TYPES = Object.freeze([
  "mistake",
  "missed_opportunity",
  "close_decision",
  "interesting_spot",
  "recurring_pattern",
]);

export const STUDY_SPOT_TAGS = Object.freeze({
  preflop: Object.freeze([
    "opening", "isolation", "3bet", "4bet", "squeeze", "reshove",
    "bb-defence", "big-blind-defence", "sb-vs-bb", "short-stack",
  ]),
  postflop: Object.freeze([
    "cbet", "delayed-cbet", "donk-bet", "probe", "check-raise",
    "turn-barrel", "river", "bluff-catch", "thin-value", "value-bet",
    "overbet", "multiway",
  ]),
  "hand-reading": Object.freeze([
    "range-construction", "range-narrowing", "board-texture",
    "nut-advantage", "blockers", "capped-range",
  ]),
  exploitative: Object.freeze([
    "calling-station", "overfolder", "overfold", "underbluffer",
    "underbluff", "maniac", "nit", "limper",
  ]),
  tournament: Object.freeze([
    "stack-depth", "chip-ev", "pressure", "icm", "bubble",
    "final-table", "pay-jumps",
  ]),
  study: Object.freeze([
    "review", "hand-review", "leak-finding", "leak-detection",
    "session-prep", "mental-game",
  ]),
  "blind-vs-blind": Object.freeze(["sb-open", "bb-defence", "bb-3bet"]),
});

export const STUDY_SPOT_CATEGORIES = Object.freeze(Object.keys(STUDY_SPOT_TAGS));
export const STACK_DEPTH_TAGS = Object.freeze(["0-10", "10-15", "15-25", "25-40", "40+"]);
export const POSITION_TAGS = Object.freeze([
  "UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB", "unknown",
]);
export const LEARNING_RESOURCE_POSITION_TAGS = Object.freeze([...POSITION_TAGS, "any"]);
export const OPPONENT_TYPES = Object.freeze([
  "unknown", "recreational", "tight", "loose", "aggressive", "passive",
  "calling-station", "overfolder", "underbluffer", "maniac", "nit", "limper",
]);
export const LEARNING_RESOURCE_TYPES = Object.freeze([
  "quick_lesson", "article", "guide", "video", "drill",
]);
export const LEARNING_RESOURCE_STATUSES = Object.freeze(["draft", "published"]);
export const LEARNING_CONTENT_TYPES = LEARNING_RESOURCE_TYPES;

const TYPE_SET = new Set(STUDY_SPOT_TYPES);
const CATEGORY_SET = new Set(STUDY_SPOT_CATEGORIES);
const TAG_SET = new Set(Object.values(STUDY_SPOT_TAGS).flat());
const STACK_SET = new Set(STACK_DEPTH_TAGS);
const POSITION_SET = new Set(POSITION_TAGS);
const RESOURCE_POSITION_SET = new Set(LEARNING_RESOURCE_POSITION_TAGS);
const OPPONENT_SET = new Set(OPPONENT_TYPES);
const RESOURCE_TYPE_SET = new Set(LEARNING_RESOURCE_TYPES);
const STATUS_SET = new Set(LEARNING_RESOURCE_STATUSES);
const LEGACY_RESOURCE_TYPE_MAP = Object.freeze({
  daily_edge: "quick_lesson",
  interactive: "drill",
});

function uniqueKnownValues(values, allowed) {
  const list = Array.isArray(values) ? values : [];
  return Array.from(new Set(
    list.map((value) => String(value || "").trim()).filter((value) => allowed.has(value)),
  ));
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanStringList(values) {
  const list = Array.isArray(values) ? values : [];
  return Array.from(new Set(list.map(cleanString).filter(Boolean)));
}

function cleanResourcePositionTags(values) {
  const positions = uniqueKnownValues(values, RESOURCE_POSITION_SET);
  return positions.includes("any") ? ["any"] : positions;
}

export function getStackDepthTag(stackDepthBb) {
  if (stackDepthBb === null || stackDepthBb === undefined || stackDepthBb === "") return null;
  const value = Number(stackDepthBb);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 10) return "0-10";
  if (value < 15) return "10-15";
  if (value < 25) return "15-25";
  if (value < 40) return "25-40";
  return "40+";
}

export function sanitizeStudySpotTaxonomy(input = {}) {
  const type = TYPE_SET.has(input.type) ? input.type : "interesting_spot";
  const category = CATEGORY_SET.has(input.category) ? input.category : "study";
  const categoryTags = new Set(STUDY_SPOT_TAGS[category] || []);
  const tags = uniqueKnownValues(input.tags, TAG_SET).filter(
    (tag) => categoryTags.has(tag) || category === "study",
  );
  return {
    type,
    category,
    tags,
    stackDepthTag: STACK_SET.has(input.stackDepthTag)
      ? input.stackDepthTag
      : getStackDepthTag(input.stackDepthBb),
    heroPosition: POSITION_SET.has(input.heroPosition) ? input.heroPosition : "unknown",
    villainPosition: POSITION_SET.has(input.villainPosition) ? input.villainPosition : "unknown",
    opponentType: OPPONENT_SET.has(input.opponentType) ? input.opponentType : "unknown",
  };
}

export function sanitizeLearningResource(input = {}) {
  const category = CATEGORY_SET.has(input.category) ? input.category : "study";
  const requestedType = cleanString(input.resourceType || input.contentType);
  const resourceType = RESOURCE_TYPE_SET.has(requestedType)
    ? requestedType
    : LEGACY_RESOURCE_TYPE_MAP[requestedType] || "article";
  const requestedStatus = cleanString(input.status);
  const status = STATUS_SET.has(requestedStatus)
    ? requestedStatus
    : input.published ? "published" : "draft";
  const legacyTags = uniqueKnownValues(input.tags, TAG_SET);
  const primaryTagCandidate = cleanString(input.primaryTag || legacyTags[0]);
  const primaryTag = TAG_SET.has(primaryTagCandidate) ? primaryTagCandidate : "";
  const secondaryTags = uniqueKnownValues(
    input.secondaryTags || legacyTags.slice(primaryTag ? 1 : 0),
    TAG_SET,
  ).filter((tag) => tag !== primaryTag);
  const tags = primaryTag ? [primaryTag, ...secondaryTags] : secondaryTags;
  const slug = cleanString(input.slug);
  const heroPositionTags = cleanResourcePositionTags(input.heroPositionTags || input.positionTags);
  const opponentTypeTags = uniqueKnownValues(input.opponentTypeTags || input.opponentTags, OPPONENT_SET);
  const publishedAt = input.publishedAt || input.publishDate || null;

  return {
    id: cleanString(input.id),
    externalId: cleanString(input.externalId) || null,
    series: cleanString(input.series) || null,
    lessonNumber: Number.isInteger(Number(input.lessonNumber)) && Number(input.lessonNumber) > 0
      ? Number(input.lessonNumber) : null,
    slug,
    canonicalPath: slug ? `/learn/${slug}` : "",
    title: cleanString(input.title),
    shortTitle: cleanString(input.shortTitle),
    description: cleanString(input.description),
    resourceType,
    contentType: resourceType,
    category,
    primaryTag,
    secondaryTags,
    tags,
    stackDepthTags: uniqueKnownValues(input.stackDepthTags, STACK_SET),
    heroPositionTags,
    villainPositionTags: cleanResourcePositionTags(input.villainPositionTags),
    opponentTypeTags,
    studySpotTypes: uniqueKnownValues(input.studySpotTypes, TYPE_SET),
    positionTags: heroPositionTags,
    opponentTags: opponentTypeTags,
    body: cleanString(input.body),
    exampleSpot: cleanString(input.exampleSpot),
    mistake: cleanString(input.mistake),
    betterPlay: cleanString(input.betterPlay),
    whenToUse: cleanStringList(input.whenToUse),
    whenNotToUse: cleanStringList(input.whenNotToUse),
    takeaway: cleanString(input.takeaway),
    status,
    published: status === "published",
    publishedAt,
    publishDate: publishedAt,
    instagramCaption: cleanString(input.instagramCaption),
    instagramUrl: cleanString(input.instagramUrl) || null,
    sourceUrl: cleanString(input.sourceUrl || input.url),
    url: cleanString(input.url) || (slug ? `/learn/${slug}` : ""),
    priority: Math.max(0, Math.min(100, Number(input.priority) || 0)),
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null,
  };
}

export function getStudySpotTaxonomy() {
  return {
    types: [...STUDY_SPOT_TYPES],
    categories: Object.fromEntries(
      Object.entries(STUDY_SPOT_TAGS).map(([category, tags]) => [category, [...tags]]),
    ),
    stackDepthTags: [...STACK_DEPTH_TAGS],
    positionTags: [...LEARNING_RESOURCE_POSITION_TAGS],
    opponentTypes: [...OPPONENT_TYPES],
    resourceTypes: [...LEARNING_RESOURCE_TYPES],
    resourceStatuses: [...LEARNING_RESOURCE_STATUSES],
    contentTypes: [...LEARNING_RESOURCE_TYPES],
  };
}
