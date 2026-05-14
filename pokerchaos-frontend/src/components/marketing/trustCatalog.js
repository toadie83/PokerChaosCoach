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
          srcSet: "/images/about/13242.png",
          type: "image/png",
        },
      ],
      src: "/images/about/13242.png",
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
      "Current upload compatibility for tournaments and cash, accepted formats, and planned expansion notes.",
    publishReady: false,
    updatedAt: "2026-05-14",
    primaryLandingPath: "/ggpoker-hand-review-tool",
    sectionPrompts: [
      "List current support: tournaments (GGPoker + PokerStars), cash (GGPoker).",
      "Describe expected file/input format requirements and common import issues.",
      "Add a short roadmap note for more rooms and format expansion.",
      "Include a simple troubleshooting section for missing/partial hand histories.",
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
