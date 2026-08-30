import { sanitizeLearningResource } from "./taxonomy.js";

const SITE_BASE_URL = "https://www.playbackpoker.com";

export const LEARNING_RESOURCE_SEED = Object.freeze(
  [
    {
      id: "article-best-mtt-study-workflow",
      externalId: "playback-article-best-mtt-study-workflow",
      slug: "best-mtt-study-workflow",
      title: "Best MTT Study Workflow For Consistent Improvement",
      shortTitle: "A Better MTT Study Workflow",
      description:
        "A repeatable workflow for prioritising tournament review, validating patterns, and drilling useful hands.",
      category: "study",
      primaryTag: "hand-review",
      secondaryTags: ["leak-detection"],
      stackDepthTags: [],
      positionTags: [],
      opponentTags: [],
      resourceType: "article",
      body:
        "Prioritise decisions with repeatable strategic value, validate patterns across the full tournament, and turn the strongest findings into a focused study queue.",
      takeaway:
        "A consistent review process is more useful than collecting isolated interesting hands.",
      url: `${SITE_BASE_URL}/articles/best-mtt-study-workflow`,
      status: "published",
      publishedAt: "2026-05-15",
      priority: 65,
    },
    {
      id: "article-how-pros-review-mtt-sessions",
      externalId: "playback-article-how-pros-review-mtt-sessions",
      slug: "how-pros-review-mtt-sessions",
      title: "How Pros Review MTT Sessions",
      shortTitle: "How Pros Review MTTs",
      description:
        "A practical structure for reviewing MTT sessions and turning repeated patterns into focused study.",
      category: "study",
      primaryTag: "hand-review",
      secondaryTags: ["leak-detection"],
      stackDepthTags: [],
      positionTags: [],
      opponentTags: [],
      resourceType: "article",
      body:
        "Start with high-impact decisions, separate one-off outcomes from recurring patterns, and retain the most useful spots for deliberate follow-up study.",
      takeaway:
        "Review decisions by strategic theme instead of judging a session only by results.",
      url: `${SITE_BASE_URL}/articles/how-pros-review-mtt-sessions`,
      status: "published",
      publishedAt: "2026-05-15",
      priority: 60,
    },
  ].map(sanitizeLearningResource),
);
