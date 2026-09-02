import { buildArticlePath } from "../articleCatalog.js";

export const HERO_TRUST_MARKERS = [
  "Supports GGPoker & PokerStars",
  "Built for MTT players",
  "No solver subscription needed",
  "Practical leak-focused feedback",
];

export const LEARNING_DROPDOWN_SECTIONS = [
  {
    title: "Featured",
    items: [
      {
        href: buildArticlePath("best-mtt-study-workflow"),
        label: "Best MTT Study Workflow",
        description: "Practical review routine for tournament players.",
      },
      {
        href: buildArticlePath("how-to-export-gg-hand-histories"),
        label: "How to Export GGPoker Hands",
        description: "Step-by-step guide for PokerCraft exports.",
      },
      {
        href: "/poker-leak-finder",
        label: "Poker Leak Finder",
        description: "Find repeated mistakes across common spots.",
      },
    ],
  },
  {
    title: "Learn by Topic",
    items: [
      {
        href: "/learn",
        label: "Learning Library",
        description: "Quick Lessons matched directly to Study Spots.",
      },
      {
        href: "/mtt-hand-review-software",
        label: "MTT Hand Review",
        description: "Structured tournament review workflows.",
      },
      {
        href: "/poker-session-review",
        label: "Poker Session Review",
        description: "Turn difficult sessions into clear study notes.",
      },
      {
        href: "/tournament-hand-analysis",
        label: "Tournament Analysis",
        description: "Review big MTT spots with practical context.",
      },
      {
        href: "/ggpoker-hand-review-tool",
        label: "GGPoker Hand Review",
        description: "Upload and review GGPoker hand histories.",
      },
      {
        href: "/ai-poker-hand-analyzer",
        label: "AI Poker Analysis",
        description: "Street-by-street feedback with clear takeaways.",
      },
      {
        href: "/articles",
        label: "Poker Articles",
        description: "Published workflows, guides, and review systems.",
      },
    ],
  },
  {
    title: "Trust",
    items: [
      {
        href: "/how-playback-poker-works",
        label: "How Playback Poker Works",
        description: "Parser-first workflow and AI review context.",
      },
      {
        href: "/ai-limitations",
        label: "AI Limitations",
        description: "Where AI helps and where judgement still matters.",
      },
      {
        href: "/supported-sites-formats",
        label: "Supported Sites & Formats",
        description: "Current upload sources and support boundaries.",
      },
      {
        href: "/methodology",
        label: "Methodology",
        description: "How review prioritisation and explanations are framed.",
      },
    ],
  },
];

export const PROBLEM_CARDS = [
  {
    title: "Solver outputs are hard to apply",
    description:
      "Powerful tools can still be expensive, slow, and difficult to translate into real decisions at the table.",
  },
  {
    title: "You forget the hands that matter",
    description:
      "The biggest learning moments often disappear after the session unless they are captured and reviewed properly.",
  },
  {
    title: "Generic advice misses the spot",
    description:
      "Useful feedback should reflect the actual action, stack depth, board, position, and decision point.",
  },
];

export const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    title: "Upload or paste a hand",
    description: "Import a GGPoker or PokerStars hand history in a few clicks.",
  },
  {
    number: "02",
    title: "Get a street-by-street review",
    description: "See what happened preflop, flop, turn, and river.",
  },
  {
    number: "03",
    title: "Find the real takeaway",
    description:
      "Understand the main leak, better options, and what to watch next time.",
  },
];

export const PRODUCT_PREVIEW_NOTES = [
  {
    street: "Preflop",
    note: "Call may be too loose versus position and stack depth",
    tone: "caution",
  },
  {
    street: "Flop",
    note: "Good continuation with equity and range advantage",
    tone: "good",
  },
  {
    street: "Turn",
    note: "Missed pressure opportunity",
    tone: "alert",
  },
  {
    street: "River",
    note: "Bluff-catch node. Review sizing and opponent line",
    tone: "neutral",
  },
];

export const USE_CASE_CARDS = [
  {
    title: "Big tournament spots",
    description:
      "Review all-ins, reshoves, ICM pressure, and awkward stack depths without digging through noise first.",
  },
  {
    title: "River decisions",
    description:
      "Understand calls, folds, bluff-catches, and missed value in the hands that keep replaying in your head.",
  },
  {
    title: "Session review",
    description:
      "Save difficult hands and turn them into a practical study routine after play has finished.",
  },
  {
    title: "Leak finding",
    description:
      "Spot repeated passive lines, missed aggression, and preflop discipline issues before they compound.",
  },
];

export const SUPPORTED_SITES = [
  {
    label: "GGPoker",
    description: "Tournament hand histories, PokerCraft exports, and supported cash workflows.",
  },
  {
    label: "PokerStars",
    description: "Hand history logs and copy-paste review flows where supported.",
  },
];

export const SUPPORTED_FORMATS = [
  "Tournament hand histories",
  "Cash game hand histories",
  "PokerCraft exports",
  "PokerStars hand history logs",
  "Paste-in review workflows where supported",
];

export const SEO_LINKS = [
  {
    href: "/ai-poker-hand-analyzer",
    title: "AI Poker Hand Analyzer",
    description: "Clear AI-assisted review for difficult poker hands.",
  },
  {
    href: "/ggpoker-hand-review-tool",
    title: "GGPoker Hand Review Tool",
    description: "Upload GGPoker hands and get practical feedback fast.",
  },
  {
    href: "/poker-leak-finder",
    title: "Poker Leak Finder",
    description: "Spot repeated mistakes across hands and sessions.",
  },
  {
    href: "/mtt-hand-review-software",
    title: "MTT Hand Review Software",
    description: "Structured review built for online tournament players.",
  },
  {
    href: "/tournament-hand-analysis",
    title: "Tournament Hand Analysis",
    description: "Review the spots that change tournament outcomes.",
  },
  {
    href: "/poker-session-review",
    title: "Poker Session Review",
    description: "Turn full sessions into practical study routines.",
  },
];

export const TRUST_LINKS = [
  { href: "/how-playback-poker-works", label: "How Playback Poker Works" },
  { href: "/ai-limitations", label: "AI Limitations" },
  { href: "/methodology", label: "Methodology" },
];

export const STUDY_PREVIEW_SPOTS = [
  {
    category: "Blind vs blind",
    title: "BB defended too tightly versus SB steals",
    context: "Big blind vs small blind · 18–24 BB",
    reason: "Several playable hands were folded in position-aware defence spots.",
    lesson: "Big Blind Defence vs a Small Blind Steal",
    lessonType: "Quick Lesson · 6 min",
    href: "/learn",
  },
  {
    category: "Postflop",
    title: "Automatic c-bet into a connected calling range",
    context: "Single-raised pot · Multiway flop",
    reason: "The board favoured the callers more often than the preflop raiser.",
    lesson: "Continuation Betting vs Limp-Callers",
    lessonType: "Daily MTT Edge · 4 min",
    href: "/learn",
  },
  {
    category: "Tournament",
    title: "21 BB open facing significant reshove pressure",
    context: "Middle position · Late stage",
    reason: "The effective stacks made raise-fold frequency especially important.",
    lesson: "Changing Strategy as Stacks Shorten",
    lessonType: "Study Article · 9 min",
    href: "/learn",
  },
];

export const TOURNAMENT_ANALYSIS_STEPS = [
  {
    title: "Validating tournament",
    description: "Checking file format and tournament integrity",
  },
  {
    title: "Reading hand history",
    description: "Structuring hands, positions, stacks, and actions",
  },
  {
    title: "Identifying useful study spots",
    description: "Finding decisions with the highest learning value",
  },
  {
    title: "Matching Learning Library resources",
    description: "Connecting each spot to practical MTT lessons",
  },
  {
    title: "Building your lesson plan",
    description: "Prioritising what to study first",
  },
];

export const PRODUCT_LOOP_STEPS = [
  { icon: "upload", title: "Upload", description: "Drop in a recent tournament export." },
  { icon: "search", title: "Find Study Spots", description: "Identify decisions with genuine learning value." },
  { icon: "match", title: "Match Lessons", description: "Connect those decisions to relevant Playback Poker lessons." },
  { icon: "plan", title: "Build Your Plan", description: "Receive a focused 2–3 lesson starting point." },
  { icon: "play", title: "Play Again", description: "Take those ideas into your next tournament." },
];

export const TOOL_COMPARISON_ROWS = [
  { label: "Find hands worth studying", studySpots: "Yes", review: "Yes" },
  { label: "Match learning resources", studySpots: "Yes", review: "Yes" },
  { label: "Detailed hand analysis", studySpots: "-", review: "Yes" },
  { label: "Tournament-wide patterns", studySpots: "-", review: "Yes" },
  { label: "Decision-by-decision review", studySpots: "-", review: "Yes" },
  { label: "Access", studySpots: "Free", review: "Tier 1" },
];

export function selectHomepageLearningResources(resources, limit = 4) {
  return (Array.isArray(resources) ? resources : [])
    .filter((resource) => resource?.status === "published" && resource?.canonicalPath)
    .slice(0, Math.max(0, limit));
}

export { isQuickLearningResource } from "../../../lib/learningPresentation.js";
