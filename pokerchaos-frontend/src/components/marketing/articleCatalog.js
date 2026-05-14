export const ARTICLE_ROUTE_PREFIX = "/articles";
export const ARTICLES_HUB_PATH = "/articles";
export const SITE_BASE_URL = "https://www.playbackpoker.com";

export const INDEXED_CORE_PATHS = [
  "/",
  "/ai-poker-hand-analyzer",
  "/ggpoker-hand-review-tool",
  "/poker-leak-finder",
  "/mtt-hand-review-software",
  "/tournament-hand-analysis",
  "/poker-session-review",
];

export function buildArticlePath(slug) {
  return `${ARTICLE_ROUTE_PREFIX}/${slug}`;
}

export const LANDING_PAGE_LABELS = {
  "/ai-poker-hand-analyzer": "AI Poker Hand Analyzer",
  "/ggpoker-hand-review-tool": "GGPoker Hand Review Tool",
  "/poker-leak-finder": "Poker Leak Finder",
  "/mtt-hand-review-software": "MTT Hand Review Software",
  "/tournament-hand-analysis": "Tournament Hand Analysis",
  "/poker-session-review": "Poker Session Review",
};

export const ARTICLE_CATALOG = [
  {
    slug: "how-ai-poker-review-works",
    title: "How AI Poker Review Actually Works",
    cluster: "AI Poker Review",
    excerpt:
      "A practical breakdown of parsing, ranking, spot identification, and where AI-supported feedback fits in.",
    primaryLandingPath: "/ai-poker-hand-analyzer",
    relatedSlug: "what-ai-can-cant-detect-in-tournaments",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Explain the full review pipeline from upload to study action list.",
      "Clarify which parts are deterministic parsing/ranking vs AI-supported commentary.",
      "Add one real hand audit example with before/after decision framing.",
    ],
  },
  {
    slug: "what-ai-can-cant-detect-in-tournaments",
    title: "What AI Can And Cannot Detect In Tournament Reviews",
    cluster: "AI Poker Review",
    excerpt:
      "Set realistic expectations for AI-supported analysis and where manual judgment still matters.",
    primaryLandingPath: "/tournament-hand-analysis",
    relatedSlug: "why-solver-study-is-hard-for-low-stakes-players",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Define reliable pattern classes AI can highlight repeatedly.",
      "List edge cases where context is missing or uncertain.",
      "Provide a checklist for human validation before applying changes.",
    ],
  },
  {
    slug: "why-solver-study-is-hard-for-low-stakes-players",
    title: "Why Solver Study Is Hard For Low-Stakes Players",
    cluster: "AI Poker Review",
    excerpt:
      "Discuss the gap between solver outputs and practical low-stakes implementation, plus a simpler workflow.",
    primaryLandingPath: "/poker-leak-finder",
    relatedSlug: "how-ai-poker-review-works",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Outline common solver study failure points for rec players.",
      "Contrast solver-first study versus leak-first study loops.",
      "Provide a practical weekly review cadence with examples.",
    ],
  },
  {
    slug: "how-to-export-gg-hand-histories",
    title: "How To Export GGPoker Hand Histories",
    cluster: "GG Poker",
    excerpt:
      "Step-by-step export guidance for GGPoker hand histories so users can upload clean session data.",
    primaryLandingPath: "/ggpoker-hand-review-tool",
    relatedSlug: "how-to-review-gg-tournaments-efficiently",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Document the current export path and file format expectations.",
      "Add troubleshooting for missing hands or malformed files.",
      "Add upload readiness checks before importing into Playback Poker.",
    ],
  },
  {
    slug: "how-to-review-gg-tournaments-efficiently",
    title: "How To Review GGPoker Tournaments Efficiently",
    cluster: "GG Poker",
    excerpt:
      "A fast review routine for GGPoker tournaments using ranked spots and recurring leak themes.",
    primaryLandingPath: "/ggpoker-hand-review-tool",
    relatedSlug: "common-gg-player-pool-leaks",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Provide a 30-minute post-session workflow with priorities.",
      "Define hand categories to review first and why.",
      "Add a repeatable note-taking template for leak tracking.",
    ],
  },
  {
    slug: "common-gg-player-pool-leaks",
    title: "Common GGPoker Player Pool Leaks",
    cluster: "GG Poker",
    excerpt:
      "Break down recurring player pool tendencies and how to audit your own counter-adjustments.",
    primaryLandingPath: "/poker-leak-finder",
    relatedSlug: "how-to-export-gg-hand-histories",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Describe common low-stakes tendencies with concrete hand types.",
      "Show how to detect whether you are over-adjusting or under-adjusting.",
      "Add a short exploit-versus-balance decision checklist.",
    ],
  },
  {
    slug: "best-mtt-study-workflow",
    title: "Best MTT Study Workflow For Consistent Improvement",
    cluster: "Tournament Study",
    excerpt:
      "A structured weekly MTT study loop: parse, rank, audit, drill, and apply at the table.",
    primaryLandingPath: "/mtt-hand-review-software",
    relatedSlug: "how-pros-review-mtt-sessions",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Outline a 5-step weekly workflow with time blocks.",
      "Add sample review KPIs to track recurring leaks.",
      "Show how to transfer findings into pre-session focus notes.",
    ],
  },
  {
    slug: "how-pros-review-mtt-sessions",
    title: "How Pros Review MTT Sessions",
    cluster: "Tournament Study",
    excerpt:
      "Translate pro-level review habits into a practical framework for serious tournament players.",
    primaryLandingPath: "/poker-session-review",
    relatedSlug: "biggest-final-table-mistakes",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Explain batch review and theme tagging methods.",
      "Include one pro-style post-session template for notes.",
      "Add examples of what not to spend time on during review.",
    ],
  },
  {
    slug: "biggest-final-table-mistakes",
    title: "Biggest Final Table Mistakes And How To Catch Them",
    cluster: "Tournament Study",
    excerpt:
      "Identify high-cost final table mistakes and build a repeatable audit process to reduce them.",
    primaryLandingPath: "/tournament-hand-analysis",
    relatedSlug: "best-mtt-study-workflow",
    publishReady: false,
    updatedAt: "2026-05-14",
    sectionPrompts: [
      "Cover stack pressure, payout pressure, and aggression timing errors.",
      "Map each mistake class to a corresponding review drill.",
      "Add a final table spot checklist for future sessions.",
    ],
  },
];

export const ARTICLE_BY_SLUG = new Map(
  ARTICLE_CATALOG.map((article) => [article.slug, article]),
);

export function getArticleBySlug(slug) {
  return ARTICLE_BY_SLUG.get(slug) || null;
}

export function getPublishedArticles() {
  return ARTICLE_CATALOG.filter((article) => article.publishReady);
}
