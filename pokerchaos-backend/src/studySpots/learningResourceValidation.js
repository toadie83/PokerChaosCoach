import { z } from "zod";

import {
  LEARNING_RESOURCE_STATUSES,
  LEARNING_RESOURCE_TYPES,
  LEARNING_RESOURCE_POSITION_TAGS,
  OPPONENT_TYPES,
  STACK_DEPTH_TAGS,
  STUDY_SPOT_CATEGORIES,
  STUDY_SPOT_TAGS,
  STUDY_SPOT_TYPES,
  sanitizeLearningResource,
} from "./taxonomy.js";

const ALL_TAGS = Object.freeze(Array.from(new Set(Object.values(STUDY_SPOT_TAGS).flat())));
const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.");
const optionalText = (max) => z.string().trim().max(max).optional().default("");
const stringList = z.array(z.string().trim().min(1).max(1000)).max(20).optional().default([]);
const nullableUrl = z
  .union([z.string().trim().url().max(500), z.string().trim().max(0), z.null()])
  .optional()
  .default(null)
  .transform((value) => value || null);

const externalLearningResourceSchemaV1 = z
  .object({
    schema_version: z.literal(1),
    external_id: z.string().trim().min(1).max(160),
    series: z.string().trim().min(1).max(100),
    lesson_number: z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]),
    date: z.string().trim().optional(),
    title: z.string().trim().min(3).max(180),
    short_social_title: z.string().trim().max(80).optional(),
    category: z.string().trim().min(1),
    primary_study_tag: z.string().trim().min(1),
    secondary_study_tags: z.array(z.string()).optional().default([]),
    stack_depth_bands: z.array(z.string()).optional().default([]),
    hero_positions: z.array(z.string()).optional().default([]),
    villain_positions: z.array(z.string()).optional().default([]),
    opponent_types: z.array(z.string()).optional().default([]),
    study_spot_types: z.array(z.string()).optional().default([]),
    summary: z.string().trim().min(10).max(500),
    canonical_lesson: z.string().trim().min(1).max(30000),
    example_spot: z.string().optional().default(""),
    common_mistake: z.string().optional().default(""),
    better_play: z.string().optional().default(""),
    when_to_use: z.union([z.string(), z.array(z.string())]).optional().default([]),
    when_not_to_use: z.union([z.string(), z.array(z.string())]).optional().default([]),
    one_thing_to_remember: z.string().optional().default(""),
    instagram_caption: z.string().optional().default(""),
    publication_status: z.string().optional().default("draft"),
    instagram_url: z.string().nullable().optional().default(null),
    taxonomy_flags: z.array(z.string()).optional().default([]),
    source_paths: z.record(z.unknown()).optional().default({}),
    published_at: z.string().nullable().optional(),
  })
  .strict();

const externalPublishingChannelSchema = z
  .object({
    status: z.string().trim().min(1).max(80),
    published_at: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .strict();

const externalWebsiteChannelSchema = externalPublishingChannelSchema.extend({
  importedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

const externalLearningResourceSchemaV2 = externalLearningResourceSchemaV1.extend({
  schema_version: z.literal(2),
  resource_type: z.string().trim().min(1).max(80),
  slug: slugSchema,
  website: externalWebsiteChannelSchema,
  instagram: externalPublishingChannelSchema,
});

function kebabCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9+]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function markdownList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const source = String(value || "").trim();
  if (!source) return [];
  const bullets = source
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
  return bullets.length > 0 ? bullets : [source];
}

function isoDateTime(value) {
  const source = String(value || "").trim();
  if (!source) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return `${source}T00:00:00.000Z`;
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : source;
}

function normalizeNullableUrl(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function normalizeSeries(value) {
  return kebabCase(value) === "daily-mtt-edge" ? "Daily MTT Edge" : String(value || "").trim();
}

function normalizeCategory(value) {
  const normalized = kebabCase(value).replace(/-fundamentals?$/, "");
  const aliases = { handreading: "hand-reading", "blind-versus-blind": "blind-vs-blind" };
  return aliases[normalized] || normalized;
}

function normalizePosition(value) {
  const source = String(value || "").trim();
  if (source.toLowerCase() === "any") return "any";
  const normalized = source.toUpperCase().replace(/^UTG1$/, "UTG+1");
  return normalized === "UNKNOWN" ? "unknown" : normalized;
}

function normalizeExternalLearningResourceV1(input) {
  const warnings = [];
  const requestedSpotTypes = input.study_spot_types.map(kebabCase).map((value) => value.replace(/-/g, "_"));
  const knownSpotTypes = requestedSpotTypes.filter((value) => STUDY_SPOT_TYPES.includes(value));
  const topicTags = input.study_spot_types.map(kebabCase).filter((value) => ALL_TAGS.includes(value));
  const unknownSpotTypes = input.study_spot_types
    .map(kebabCase)
    .filter((value) => !ALL_TAGS.includes(value) && !STUDY_SPOT_TYPES.includes(value.replace(/-/g, "_")));
  if (unknownSpotTypes.length > 0) {
    warnings.push(`Unmapped study_spot_types were not stored: ${unknownSpotTypes.join(", ")}.`);
  }
  if (input.taxonomy_flags.length > 0) {
    warnings.push(`Source taxonomy flags: ${input.taxonomy_flags.join(", ")}.`);
  }
  const sourceSlug = typeof input.source_paths.slug === "string" ? input.source_paths.slug : input.title;
  const primaryTag = kebabCase(input.primary_study_tag);
  const secondaryTags = Array.from(new Set([
    ...input.secondary_study_tags.map(kebabCase),
    ...topicTags,
  ])).filter((tag) => tag !== primaryTag);
  return {
    resource: {
      externalId: input.external_id,
      series: normalizeSeries(input.series),
      lessonNumber: Number(input.lesson_number),
      slug: kebabCase(sourceSlug),
      title: input.title,
      shortTitle: input.short_social_title || "",
      description: input.summary,
      resourceType: "quick_lesson",
      category: normalizeCategory(input.category),
      primaryTag,
      secondaryTags,
      stackDepthTags: input.stack_depth_bands.map((value) => kebabCase(value).replace(/-?bb$/, "")),
      heroPositionTags: input.hero_positions.map(normalizePosition),
      villainPositionTags: input.villain_positions.map(normalizePosition),
      opponentTypeTags: input.opponent_types.map(kebabCase),
      studySpotTypes: knownSpotTypes.length > 0 ? knownSpotTypes : ["interesting_spot"],
      body: input.canonical_lesson,
      exampleSpot: input.example_spot,
      mistake: input.common_mistake,
      betterPlay: input.better_play,
      whenToUse: markdownList(input.when_to_use),
      whenNotToUse: markdownList(input.when_not_to_use),
      takeaway: input.one_thing_to_remember,
      status: kebabCase(input.publication_status).replace(/-/g, "_"),
      publishedAt: isoDateTime(input.published_at || input.date),
      instagramCaption: input.instagram_caption,
      instagramUrl: normalizeNullableUrl(input.instagram_url),
      sourceUrl: "",
      priority: 0,
    },
    warnings,
  };
}

function normalizeExternalLearningResourceV2(input) {
  const normalized = normalizeExternalLearningResourceV1({
    ...input,
    schema_version: 1,
  });
  const resourceType = kebabCase(input.resource_type).replace(/-/g, "_");
  normalized.resource.slug = kebabCase(input.slug);
  normalized.resource.resourceType = resourceType;
  normalized.resource.instagramUrl = normalizeNullableUrl(
    input.instagram.url || input.instagram_url,
  );
  normalized.resource.publishedAt = isoDateTime(input.website.published_at);
  return normalized;
}

export const learningResourceInputSchema = z
  .object({
    externalId: z.string().trim().min(1).max(160).nullable().optional(),
    series: z.string().trim().min(1).max(100).nullable().optional(),
    lessonNumber: z.number().int().positive().max(100000).nullable().optional(),
    slug: slugSchema,
    title: z.string().trim().min(3).max(180),
    shortTitle: optionalText(80),
    description: z.string().trim().min(10).max(500),
    resourceType: z.enum(LEARNING_RESOURCE_TYPES),
    category: z.enum(STUDY_SPOT_CATEGORIES),
    primaryTag: z.enum(ALL_TAGS),
    secondaryTags: z.array(z.enum(ALL_TAGS)).max(12).optional().default([]),
    stackDepthTags: z.array(z.enum(STACK_DEPTH_TAGS)).max(STACK_DEPTH_TAGS.length).optional().default([]),
    heroPositionTags: z.array(z.enum(LEARNING_RESOURCE_POSITION_TAGS)).max(LEARNING_RESOURCE_POSITION_TAGS.length).optional().default([]),
    villainPositionTags: z.array(z.enum(LEARNING_RESOURCE_POSITION_TAGS)).max(LEARNING_RESOURCE_POSITION_TAGS.length).optional().default([]),
    opponentTypeTags: z.array(z.enum(OPPONENT_TYPES)).max(OPPONENT_TYPES.length).optional().default([]),
    studySpotTypes: z.array(z.enum(STUDY_SPOT_TYPES)).max(STUDY_SPOT_TYPES.length).optional().default([]),
    body: z.string().trim().min(1).max(30000),
    exampleSpot: optionalText(5000),
    mistake: optionalText(3000),
    betterPlay: optionalText(3000),
    whenToUse: stringList,
    whenNotToUse: stringList,
    takeaway: optionalText(1200),
    status: z.enum(LEARNING_RESOURCE_STATUSES).optional().default("draft"),
    publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
    instagramCaption: optionalText(2200),
    instagramUrl: nullableUrl,
    sourceUrl: z.string().trim().url().max(500).or(z.literal("")).optional().default(""),
    priority: z.number().int().min(0).max(100).optional().default(0),
  })
  .strict()
  .superRefine((value, context) => {
    const categoryTags = new Set(STUDY_SPOT_TAGS[value.category] || []);
    if (!categoryTags.has(value.primaryTag)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["primaryTag"],
        message: `Tag '${value.primaryTag}' is not valid for category '${value.category}'.`,
      });
    }
    if (value.secondaryTags.includes(value.primaryTag)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondaryTags"],
        message: "Secondary tags must not repeat the primary tag.",
      });
    }
    if (new Set(value.secondaryTags).size !== value.secondaryTags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secondaryTags"],
        message: "Secondary tags must be unique.",
      });
    }
    if (value.status === "published" && value.resourceType === "quick_lesson") {
      for (const field of ["exampleSpot", "mistake", "betterPlay", "takeaway"]) {
        if (!value[field]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `Published Quick Lessons require ${field}.`,
          });
        }
      }
    }
    if (value.lessonNumber && !value.series) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["series"],
        message: "A series is required when lessonNumber is provided.",
      });
    }
  });

export function validateLearningResourceInput(input) {
  const parsed = learningResourceInputSchema.safeParse(input);
  if (!parsed.success) return parsed;
  return {
    success: true,
    data: sanitizeLearningResource(parsed.data),
  };
}

export function validateLearningResourceImport(input) {
  const unwrapped = unwrapLearningResourceImport(input);
  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped) || !("schema_version" in unwrapped)) {
    const parsed = validateLearningResourceInput(unwrapped);
    return parsed.success ? { ...parsed, warnings: [] } : parsed;
  }
  const externalSchema = unwrapped.schema_version === 2
    ? externalLearningResourceSchemaV2
    : externalLearningResourceSchemaV1;
  const external = externalSchema.safeParse(unwrapped);
  if (!external.success) return external;
  const normalized = external.data.schema_version === 2
    ? normalizeExternalLearningResourceV2(external.data)
    : normalizeExternalLearningResourceV1(external.data);
  const parsed = validateLearningResourceInput(normalized.resource);
  return parsed.success ? { ...parsed, warnings: normalized.warnings } : parsed;
}

export function learningResourceValidationDetails(error) {
  if (!error?.flatten) return null;
  const flattened = error.flatten();
  return {
    formErrors: flattened.formErrors,
    fieldErrors: flattened.fieldErrors,
  };
}

export function unwrapLearningResourceImport(input) {
  if (input && typeof input === "object" && !Array.isArray(input) && input.resource) {
    return input.resource;
  }
  return input;
}

export function learningResourceInputFromCanonical(resource = {}) {
  return {
    externalId: resource.externalId || null,
    series: resource.series || null,
    lessonNumber: resource.lessonNumber || null,
    slug: resource.slug || "",
    title: resource.title || "",
    shortTitle: resource.shortTitle || "",
    description: resource.description || "",
    resourceType: resource.resourceType || resource.contentType || "article",
    category: resource.category || "study",
    primaryTag: resource.primaryTag || resource.tags?.[0] || "",
    secondaryTags: resource.secondaryTags || resource.tags?.slice(1) || [],
    stackDepthTags: resource.stackDepthTags || [],
    heroPositionTags: resource.heroPositionTags || resource.positionTags || [],
    villainPositionTags: resource.villainPositionTags || [],
    opponentTypeTags: resource.opponentTypeTags || resource.opponentTags || [],
    studySpotTypes: resource.studySpotTypes || [],
    body: resource.body || "",
    exampleSpot: resource.exampleSpot || "",
    mistake: resource.mistake || "",
    betterPlay: resource.betterPlay || "",
    whenToUse: resource.whenToUse || [],
    whenNotToUse: resource.whenNotToUse || [],
    takeaway: resource.takeaway || "",
    status: resource.status || "draft",
    publishedAt: resource.publishedAt
      ? new Date(resource.publishedAt).toISOString()
      : null,
    instagramCaption: resource.instagramCaption || "",
    instagramUrl: normalizeNullableUrl(resource.instagramUrl),
    sourceUrl: resource.sourceUrl || "",
    priority: Number(resource.priority) || 0,
  };
}
