export const STUDY_SPOT_TYPES = Object.freeze([
  "mistake",
  "missed_opportunity",
  "close_decision",
  "interesting_spot",
  "recurring_pattern",
]);

export const STUDY_SPOT_TAGS = Object.freeze({
  preflop: Object.freeze([
    "opening",
    "isolation",
    "3bet",
    "4bet",
    "squeeze",
    "reshove",
    "short-stack",
    "big-blind-defence",
  ]),
  postflop: Object.freeze([
    "cbet",
    "delayed-cbet",
    "probe",
    "check-raise",
    "turn-barrel",
    "river",
    "bluff-catch",
    "value-bet",
  ]),
  "blind-vs-blind": Object.freeze(["sb-open", "bb-defence", "bb-3bet"]),
  tournament: Object.freeze([
    "stack-depth",
    "chip-ev",
    "pressure",
    "icm",
    "bubble",
    "final-table",
  ]),
  exploitative: Object.freeze([
    "calling-station",
    "overfold",
    "underbluff",
    "limper",
    "nit",
    "maniac",
  ]),
  study: Object.freeze(["hand-review", "leak-detection"]),
});

export const STUDY_SPOT_CATEGORIES = Object.freeze(
  Object.keys(STUDY_SPOT_TAGS),
);
export const STACK_DEPTH_TAGS = Object.freeze([
  "0-10",
  "10-15",
  "15-25",
  "25-40",
  "40+",
]);
export const POSITION_TAGS = Object.freeze([
  "UTG",
  "HJ",
  "CO",
  "BTN",
  "SB",
  "BB",
  "unknown",
]);
export const OPPONENT_TYPES = Object.freeze([
  "unknown",
  "recreational",
  "tight",
  "loose",
  "aggressive",
  "passive",
]);
export const LEARNING_CONTENT_TYPES = Object.freeze([
  "article",
  "daily_edge",
  "guide",
  "video",
  "interactive",
]);

const TYPE_SET = new Set(STUDY_SPOT_TYPES);
const CATEGORY_SET = new Set(STUDY_SPOT_CATEGORIES);
const TAG_SET = new Set(Object.values(STUDY_SPOT_TAGS).flat());
const STACK_SET = new Set(STACK_DEPTH_TAGS);
const POSITION_SET = new Set(POSITION_TAGS);
const OPPONENT_SET = new Set(OPPONENT_TYPES);
const CONTENT_TYPE_SET = new Set(LEARNING_CONTENT_TYPES);

function uniqueKnownValues(values, allowed) {
  const list = Array.isArray(values) ? values : [];
  return Array.from(
    new Set(list.map((value) => String(value || "").trim()).filter((value) => allowed.has(value))),
  );
}

export function getStackDepthTag(stackDepthBb) {
  if (
    stackDepthBb === null ||
    stackDepthBb === undefined ||
    stackDepthBb === ""
  ) {
    return null;
  }
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
    heroPosition: POSITION_SET.has(input.heroPosition)
      ? input.heroPosition
      : "unknown",
    villainPosition: POSITION_SET.has(input.villainPosition)
      ? input.villainPosition
      : "unknown",
    opponentType: OPPONENT_SET.has(input.opponentType)
      ? input.opponentType
      : "unknown",
  };
}

export function sanitizeLearningResource(input = {}) {
  const category = CATEGORY_SET.has(input.category) ? input.category : "study";
  const contentType = CONTENT_TYPE_SET.has(input.contentType)
    ? input.contentType
    : "article";
  return {
    id: String(input.id || "").trim(),
    slug: String(input.slug || "").trim(),
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    category,
    tags: uniqueKnownValues(input.tags, TAG_SET),
    stackDepthTags: uniqueKnownValues(input.stackDepthTags, STACK_SET),
    positionTags: uniqueKnownValues(input.positionTags, POSITION_SET),
    opponentTags: uniqueKnownValues(input.opponentTags, OPPONENT_SET),
    contentType,
    url: String(input.url || "").trim(),
    published: Boolean(input.published),
    publishDate: input.publishDate ? String(input.publishDate) : null,
    priority: Math.max(0, Math.min(100, Number(input.priority) || 0)),
  };
}

export function getStudySpotTaxonomy() {
  return {
    types: [...STUDY_SPOT_TYPES],
    categories: Object.fromEntries(
      Object.entries(STUDY_SPOT_TAGS).map(([category, tags]) => [
        category,
        [...tags],
      ]),
    ),
    stackDepthTags: [...STACK_DEPTH_TAGS],
    positionTags: [...POSITION_TAGS],
    opponentTypes: [...OPPONENT_TYPES],
    contentTypes: [...LEARNING_CONTENT_TYPES],
  };
}
