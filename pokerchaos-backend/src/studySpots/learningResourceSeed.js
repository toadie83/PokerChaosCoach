import { sanitizeLearningResource } from "./taxonomy.js";

const SITE_BASE_URL = "https://www.playbackpoker.com";

export const LEARNING_RESOURCE_SEED = Object.freeze(
  [
    {
      id: "article-best-mtt-study-workflow",
      slug: "best-mtt-study-workflow",
      title: "Best MTT Study Workflow For Consistent Improvement",
      description:
        "A repeatable workflow for prioritising tournament review, validating patterns, and drilling useful hands.",
      category: "study",
      tags: ["hand-review", "leak-detection"],
      stackDepthTags: [],
      positionTags: [],
      opponentTags: [],
      contentType: "article",
      url: `${SITE_BASE_URL}/articles/best-mtt-study-workflow`,
      published: true,
      publishDate: "2026-05-15",
      priority: 65,
    },
    {
      id: "article-how-pros-review-mtt-sessions",
      slug: "how-pros-review-mtt-sessions",
      title: "How Pros Review MTT Sessions",
      description:
        "A practical structure for reviewing MTT sessions and turning repeated patterns into focused study.",
      category: "study",
      tags: ["hand-review", "leak-detection"],
      stackDepthTags: [],
      positionTags: [],
      opponentTags: [],
      contentType: "article",
      url: `${SITE_BASE_URL}/articles/how-pros-review-mtt-sessions`,
      published: true,
      publishDate: "2026-05-15",
      priority: 60,
    },
  ].map(sanitizeLearningResource),
);

