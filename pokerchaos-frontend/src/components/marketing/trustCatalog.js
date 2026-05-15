const R2_PUBLIC_MEDIA_BASE_URL =
  "https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev";
const FOUNDER_PORTRAIT_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/13242.webp`;
const SUPPORTED_SITES_HERO_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-upload-workflow.webp`;

export const TRUST_PAGE_CATALOG = [
  {
    path: "/about",
    title: "About Playback Poker",
    kicker: "About The Creator",
    description:
      "Why Playback Poker exists, who built it, and the practical study problems it was designed to solve.",
    publishReady: true,
    updatedAt: "2026-05-14",
    primaryLandingPath: "/ai-poker-hand-analyzer",
    heroMedia: {
      alt: "Playback Poker founder portrait",
      caption:
        "Trevor. Builder of Playback Poker. Long-time tournament player, QA engineer and toolmaker.",
      sources: [
        {
          srcSet: FOUNDER_PORTRAIT_URL,
          type: "image/webp",
        },
      ],
      src: FOUNDER_PORTRAIT_URL,
      sizes: "(max-width: 640px) 72vw, (max-width: 900px) 220px, 220px",
      loading: "eager",
      decoding: "async",
    },
    bodySections: [
      {
        heading: "About Playback Poker",
        paragraphs: [
          "Playback Poker was built from two long-running interests colliding: software engineering and tournament poker.",
          "I have spent more than 20 years working in engineering and technical problem solving. I joined the Royal Air Force at 17 to train as a mechanical engineer, later worked at CAT as an engine specialist, and eventually moved into software after teaching myself JavaScript.",
          "Over time I moved into QA and automation testing, completed ISTQB qualifications, and found myself enjoying the same thing repeatedly: breaking systems apart, understanding how they worked, and finding weak points others missed.",
          "That naturally led into building tools.",
          "I released a mobile game called EGR Grasstrack that reached more than 50,000 downloads, then later started building internal tooling and automation systems professionally. Eventually I became frustrated with how expensive and clumsy many modern software tools had become, especially in the AI space where a lot of products felt like thin wrappers with a new label attached.",
          "Playback Poker started from that same mindset: build something practical that solves a real problem.",
        ],
      },
      {
        heading: "The Poker Side",
        paragraphs: [
          "I have been playing poker online since the early 2000s.",
          "Like a lot of players from that era, it started with home games. Sunday nights around a homemade felt table topper on a friend's dining room table, 10 GBP buy-ins, late-night poker on TV, and dreaming about the World Series after watching ESPN coverage.",
          "Once I got my first laptop I downloaded PokerStars and 888 Poker and started grinding online tournaments. I won my first major tournament at 22, turning it into a 5,000 USD score, and before long we were travelling to local casinos during the week playing live tournaments and surviving on three hours sleep before work the next morning.",
          "For years poker was competitive and fun, but I never truly studied the game seriously until the COVID lockdowns.",
          "When I came back properly, the games had changed.",
          "Everyone was talking about GTO, solvers, ICM, EV charts, and range construction. I tried to dive in with tools like GTO Wizard, but honestly it became overwhelming fast. I spent months studying charts and theory while my actual results got worse, and I lost over 1,000 USD during the period I was trying hardest to improve.",
          "The biggest issue was that studying a spot in isolation did not feel the same as playing real tournaments, especially at low and mid stakes where players do not always behave the way theory expects.",
          "The tools were powerful, but they often felt disconnected from the reality of everyday tournament poker.",
        ],
      },
      {
        heading: "Where Playback Poker Started",
        paragraphs: [
          "The first thing I built was not Playback Poker.",
          "It was a chaotic little AI coach designed to help me become more aggressive. Originally called Chaos Coach, it was intentionally over the top: ultra-aggressive advice, ridiculous confidence, and cheesy one-liners. Half serious, half joke.",
          "Underneath it was a genuine idea: I wanted to describe a hand naturally and get practical feedback street by street.",
          "Over time I toned it down, experimented with different personalities and approaches, and started noticing changes in my own play. I was recognising patterns more quickly and becoming more confident in aggressive spots.",
          "But my tournament study process still felt terrible.",
          "That changed when I downloaded a full tournament history from PokerCraft and realised how much useful information was buried inside it. Thousands of lines of text, almost impossible to review properly.",
          "So I built a parser.",
          "First it stripped out all the hands folded preflop. Then it started identifying meaningful spots. Then summarising hands. Then ranking mistakes, missed opportunities, opponent tendencies, and tournament patterns.",
          "Playback Poker evolved from there.",
        ],
      },
      {
        heading: "What Playback Poker Is Trying To Do",
        paragraphs: [
          "The goal is simple: make poker study feel accessible, practical, and engaging.",
          "Upload your tournament and immediately have something useful to explore. Important hands surfaced quickly. Missed spots identified. Leaks highlighted. Trends easier to recognise.",
          "Study should not feel like homework.",
          "For many tournament players, especially at low and mid stakes, there is a large gap between solver theory and practical review workflows. Playback Poker is designed to help close that gap.",
          "It is built for players who genuinely want to improve, review sessions properly, and better understand decisions they are making at the table.",
          "And yes, occasionally spy on their opponents too.",
          "Outside poker and software, I am UK-based, a husband, a dad, and usually watching some form of motorsport when I am not building.",
          "If you want to review your own tournaments, you can try Playback Poker here.",
        ],
      },
    ],
    sectionPrompts: [
      "Founder background: 20+ years engineering, product/operator context, and why this project was built.",
      "Poker story: playing online since 2001 and the recurring study frustration that triggered Playback Poker.",
      "Personal tone layer: UK-based, husband, dad, motorsport fan; keep human but concise and relevant.",
      "Why this product exists now: practical value for players who need structured review workflows.",
    ],
  },
  {
    path: "/how-playback-poker-works",
    title: "How Playback Poker Works",
    kicker: "Platform Workflow",
    description:
      "A transparent walkthrough of parsing, hand ranking, spot identification, and optional AI-supported feedback.",
    publishReady: false,
    updatedAt: "2026-05-14",
    primaryLandingPath: "/mtt-hand-review-software",
    sectionPrompts: [
      "Explain upload flow and supported sources.",
      "Break down parsing and ranking stages before any AI layer is involved.",
      "Describe how spot identification works for high-impact hands.",
      "Show where AI support is applied and where user judgment remains necessary.",
    ],
  },
  {
    path: "/ai-limitations",
    title: "AI Limitations And Responsible Use",
    kicker: "AI Boundaries",
    description:
      "What AI-supported review can help with, what it cannot guarantee, and how to apply judgment responsibly.",
    publishReady: false,
    updatedAt: "2026-05-14",
    primaryLandingPath: "/poker-leak-finder",
    sectionPrompts: [
      "State clearly that AI support is advisory, not absolute or solver-perfect.",
      "List common scenarios where context gaps can affect interpretation.",
      "Provide a practical validation checklist before implementing major strategy changes.",
      "Add language that discourages overconfidence and one-hand overfitting.",
    ],
  },
  {
    path: "/methodology",
    title: "Playback Poker Methodology",
    kicker: "Methodology",
    description:
      "The review methodology used to parse sessions, prioritize spots, and convert repeated leaks into study actions.",
    publishReady: false,
    updatedAt: "2026-05-14",
    primaryLandingPath: "/tournament-hand-analysis",
    sectionPrompts: [
      "Define what 'high-impact' means in your review pipeline.",
      "Explain leak-theme grouping and prioritization logic.",
      "Describe the session-to-session feedback loop and how users should track progress.",
      "Clarify that method is designed for practical tournament improvement, not theoretical purity.",
    ],
  },
  {
    path: "/supported-sites-formats",
    title: "Supported Sites And Formats",
    kicker: "Compatibility",
    description:
      "Current upload compatibility for tournament and cash hand histories across GGPoker and PokerStars, with accepted import methods and expansion notes.",
    publishReady: false,
    updatedAt: "2026-05-15",
    primaryLandingPath: "/ggpoker-hand-review-tool",
    heroMedia: {
      alt: "Playback Poker upload workflow showing supported sites and hand history import",
      caption:
        "Upload workflow reference for supported poker sites and hand history formats.",
      sources: [
        {
          srcSet: SUPPORTED_SITES_HERO_URL,
          type: "image/webp",
        },
      ],
      src: SUPPORTED_SITES_HERO_URL,
      sizes: "(max-width: 640px) 92vw, (max-width: 900px) 360px, 420px",
      loading: "lazy",
      decoding: "async",
    },
    bodySections: [
      {
        heading: "Supported Sites And Formats",
        paragraphs: [
          "Playback Poker is built around practical tournament and session review workflows. Support is expanding steadily, but the current focus is on reliable parsing, structured analysis, and meaningful review output for supported formats.",
        ],
      },
      {
        heading: "Currently Supported",
        paragraphs: [
          "Playback Poker now supports hand history parsing for both tournament and cash formats across GGPoker and PokerStars.",
          "Supported uploads can be used for hand parsing, session and tournament review, leak analysis, missed spot identification, opponent flagging, ranking and scoring, and structured review workflows.",
          "Tournament reporting depth is currently the most mature, while cash workflow depth continues to improve.",
        ],
      },
      {
        heading: "Supported File Formats",
        paragraphs: [
          "Playback Poker currently expects hand history text content from supported poker clients.",
          "For PokerStars, you can upload saved hand history log files directly, and mobile users can import by copying and pasting hand history text from emailed logs.",
          "For GGPoker, supported inputs include hand history exports from PokerCraft.",
          "For best results, use complete exports, avoid manually edited files, keep original formatting intact, and ensure the import contains full hand data.",
        ],
      },
      {
        heading: "Common Import Issues",
        paragraphs: [
          "If a file fails to process correctly, the most common causes are partial hand histories, modified formatting, unsupported room variations, and corrupted downloads.",
          "Some exports may contain incomplete tournament data or missing hands.",
          "Editing hand history files manually can break parsing structure.",
          "Poker sites occasionally change hand history formatting, which can temporarily affect compatibility.",
          "Incomplete or damaged exports may fail during upload or parsing.",
        ],
      },
      {
        heading: "Troubleshooting Tips",
        paragraphs: [
          "If an upload looks incomplete or produces limited analysis, re-export directly from the poker client, confirm the export includes all hands for the session or tournament, avoid rewriting hand text manually, and retry using the original unmodified export.",
          "For PokerStars mobile email imports, paste the full original hand history text exactly as exported.",
          "If issues continue, support for additional formats or formatting changes may still be in progress.",
        ],
      },
      {
        heading: "Expansion Roadmap",
        paragraphs: [
          "Playback Poker is being developed iteratively around real player workflows and real tournament data.",
          "Planned expansion areas include additional poker rooms, broader cash game support, deeper tournament categorisation, improved spot classification, expanded hand review coverage, and richer opponent analysis workflows.",
          "The goal is not simply to support more files, but to make review workflows faster, clearer, and more actionable for players trying to improve their game.",
          "If you want to review your own tournaments and track your progress over time, you can try Playback Poker from the homepage.",
        ],
      },
    ],
  },
];

export const TRUST_PAGE_BY_PATH = new Map(
  TRUST_PAGE_CATALOG.map((page) => [page.path, page]),
);

export function getTrustPageByPath(path) {
  return TRUST_PAGE_BY_PATH.get(path) || null;
}

export function getPublishedTrustPages() {
  return TRUST_PAGE_CATALOG.filter((page) => page.publishReady);
}
