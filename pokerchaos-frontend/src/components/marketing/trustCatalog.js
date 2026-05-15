const R2_PUBLIC_MEDIA_BASE_URL =
  "https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev";
const FOUNDER_PORTRAIT_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/13242.webp`;
const SUPPORTED_SITES_STEP_1_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-export-source-pokercraft.webp`;
const SUPPORTED_SITES_STEP_2_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-export-source-pokercraft-download.webp`;
const SUPPORTED_SITES_STEP_3_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-parse-upload-overview.webp`;
const SUPPORTED_SITES_STEP_4_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-parse-success-full.webp`;
const AI_LIMITATIONS_HERO_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/best-mtt-study-workflow-step-5-hand-audit-jto-co-missed-open.webp`;
const HOW_IT_WORKS_STEP_1_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/how-playback-poker-works-step-1-upload-source-file.webp.webp`;
const HOW_IT_WORKS_STEP_2_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/how-playback-poker-works-step-2-parse-overview.webp.webp`;
const HOW_IT_WORKS_STEP_3_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/how-playback-poker-works-step-3-audit-missed-opportunities.webp.webp`;
const HOW_IT_WORKS_STEP_4_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/how-playback-poker-works-step-4-drags-and-priority-queue.webp.webp`;
const HOW_IT_WORKS_STEP_5_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/how-playback-poker-works-step-5-summary-and-kpis.webp.webp`;
const HOW_IT_WORKS_STEP_6_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/how-playback-poker-works-step-6-ai-hand-and-opponent-context.webp.webp`;

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
      zoomEnabled: false,
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
    publishReady: true,
    updatedAt: "2026-05-15",
    primaryLandingPath: "/mtt-hand-review-software",
    walkthroughTitle: "Workflow Walkthrough",
    walkthroughIntro:
      "This step-by-step flow shows what happens from upload through parsing, audit, prioritisation, and AI-assisted context.",
    walkthroughSteps: [
      {
        title: "Step 1: Upload Source Hand History",
        description:
          "Start by selecting and uploading a supported hand history source file from a completed tournament or session.",
        alt: "Playback Poker upload screen with source hand history file selected before parsing",
        caption: "Upload entry point with source file selected.",
        sources: [
          {
            srcSet: HOW_IT_WORKS_STEP_1_URL,
            type: "image/webp",
          },
        ],
        src: HOW_IT_WORKS_STEP_1_URL,
      },
      {
        title: "Step 2: Parse Overview",
        description:
          "The parser structures raw data into a usable overview with optional AI interpretations available.",
        alt: "Playback Poker parsed overview screen showing structured tournament and session extraction",
        caption: "Parser-first workflow: structure before interpretation.",
        sources: [
          {
            srcSet: HOW_IT_WORKS_STEP_2_URL,
            type: "image/webp",
          },
        ],
        src: HOW_IT_WORKS_STEP_2_URL,
      },
      {
        title: "Step 3: Audit Missed Opportunities",
        description:
          "Audit workflows surface repeated missed opportunities such as opens, blind defends, and pressure spots.",
        alt: "Playback Poker audit panel highlighting missed opportunities and recurring decision issues",
        caption: "Audit layer surfaces repeated missed opportunities.",
        sources: [
          {
            srcSet: HOW_IT_WORKS_STEP_3_URL,
            type: "image/webp",
          },
        ],
        src: HOW_IT_WORKS_STEP_3_URL,
      },
      {
        title: "Step 4: Drags And Priority Queue",
        description:
          "Biggest drags are identified and ranked into a practical priority queue so high-impact review happens first.",
        alt: "Playback Poker drags and review priority queue showing highest-impact leak themes first",
        caption: "Prioritised queue driven by repeated drags and impact.",
        sources: [
          {
            srcSet: HOW_IT_WORKS_STEP_4_URL,
            type: "image/webp",
          },
        ],
        src: HOW_IT_WORKS_STEP_4_URL,
      },
      {
        title: "Step 5: Summary And KPI Tracking",
        description:
          "Session and tournament summaries plus KPI tracking provide trend visibility across repeated play blocks.",
        alt: "Playback Poker summary dashboard showing tournament metrics and core KPI trend tracking",
        caption: "Summaries and KPI trends support progression tracking.",
        sources: [
          {
            srcSet: HOW_IT_WORKS_STEP_5_URL,
            type: "image/webp",
          },
        ],
        src: HOW_IT_WORKS_STEP_5_URL,
      },
      {
        title: "Step 6: AI Hand And Opponent Context",
        description:
          "AI adds optional contextual explanations for hands and opponent patterns after structured analysis is complete.",
        alt: "Playback Poker AI hand review panel with opponent context and practical explanation",
        caption: "AI layer adds context; parser and audit remain foundational.",
        sources: [
          {
            srcSet: HOW_IT_WORKS_STEP_6_URL,
            type: "image/webp",
          },
        ],
        src: HOW_IT_WORKS_STEP_6_URL,
      },
    ],
    bodySections: [
      {
        heading: "Intro",
        paragraphs: [
          "Playback Poker is an AI-assisted post-session review workflow built for tournament players.",
          "The workflow is parser first, AI second.",
          "The core objective is structured review: surface what matters, reduce noise, and make post-session study easier to execute consistently.",
        ],
      },
      {
        heading: "Upload And Parsing",
        paragraphs: [
          "You upload a supported hand history file from your completed session or tournament.",
          "Playback Poker parses the raw data into a structured review surface, identifies meaningful spots, and reduces low-value noise so review starts from signal instead of clutter.",
          "This stage happens before AI interpretation and forms the foundation of the platform.",
        ],
      },
      {
        heading: "Audit And Leak Detection",
        paragraphs: [
          "After parsing, the platform audits recurring decision patterns such as missed opens, missed blind defence spots, passive trends, and repeated drags on overall session quality.",
          "Review is then prioritised so players can focus on high-impact corrections first rather than random hand browsing.",
          "This leak-first ordering is one of the key practical differentiators in the workflow.",
        ],
      },
      {
        heading: "Tournament Summaries And KPIs",
        paragraphs: [
          "Playback Poker generates tournament and session summaries with scoring and KPI visibility to track trend direction over time.",
          "The goal is not one-session judgment, but progression monitoring across repeated play blocks.",
          "This helps players verify whether adjustments are actually improving decision quality over volume.",
        ],
      },
      {
        heading: "AI Review Layer",
        paragraphs: [
          "AI is applied as a contextual interpretation layer once structured analysis is already in place.",
          "It can explain individual hands conversationally, add practical next-step framing, and support interpretation of summary outputs and tendencies.",
          "AI assists interpretation. It is not running the whole platform.",
        ],
      },
      {
        heading: "Opponent Review",
        paragraphs: [
          "Opponent review surfaces table and player tendencies from session data, including aggression and passivity patterns.",
          "Seat-based observations can support post-session prep and targeted follow-up review when recurring opponents appear.",
          "This adds practical context beyond isolated hand analysis.",
        ],
      },
      {
        heading: "What Playback Poker Is Not",
        paragraphs: [
          "Playback Poker is not real-time assistance during active play.",
          "It is not a solver replacement and does not claim mathematically perfect outputs for every spot.",
          "It is not guaranteed perfect analysis in every environment or player pool.",
        ],
      },
      {
        heading: "Closing Philosophy",
        paragraphs: [
          "The platform is built to make tournament review faster, more structured, and easier to maintain consistently.",
          "By combining deterministic parsing with AI-assisted interpretation, Playback Poker helps players spend less time sorting data and more time improving decisions.",
        ],
      },
    ],
  },
  {
    path: "/ai-limitations",
    title: "AI Limitations And Responsible Use",
    kicker: "AI Boundaries",
    description:
      "What AI-supported review can help with, what it cannot guarantee, and how to apply judgment responsibly.",
    publishReady: true,
    updatedAt: "2026-05-15",
    primaryLandingPath: "/poker-leak-finder",
    heroMedia: {
      alt: "Playback Poker hand audit showing a missed JTo cutoff open with AI review context",
      caption:
        "Example AI-assisted hand review: missed JTo cutoff open with contextual explanation.",
      sources: [
        {
          srcSet: AI_LIMITATIONS_HERO_URL,
          type: "image/webp",
        },
      ],
      src: AI_LIMITATIONS_HERO_URL,
      sizes: "(max-width: 640px) 92vw, (max-width: 900px) 360px, 420px",
      loading: "lazy",
      decoding: "async",
    },
    bodySections: [
      {
        heading: "AI Limitations",
        paragraphs: [
          "Playback Poker uses AI to support post-session review workflows, but it is important to understand what the platform is designed to do and where its limitations are.",
          "The goal of Playback Poker is not to present AI analysis as absolute truth.",
          "It is designed to help players review faster, identify repeated patterns, and think more clearly about their decisions after sessions are complete.",
        ],
      },
      {
        heading: "AI Review Is Context Limited",
        paragraphs: [
          "Poker is highly contextual.",
          "A hand history alone cannot perfectly capture player psychology, emotional state, table image, live reads, timing behaviour, exploitative adjustments, or external tournament factors.",
          "Even strong analysis can only work from the information available inside the hand history itself.",
          "For that reason, AI review should always be treated as an aid to study rather than unquestionable fact.",
        ],
      },
      {
        heading: "Playback Poker Is Not A Solver Replacement",
        paragraphs: [
          "Playback Poker does not attempt to replace professional solver tools or provide mathematically perfect GTO outputs for every situation.",
          "Solver work remains extremely valuable for precise range construction, equilibrium study, advanced theory work, and highly specific spot analysis.",
          "Playback Poker focuses instead on practical review workflows, repeated leak detection, session pattern recognition, prioritised study, and structured tournament analysis.",
          "The platform is designed to help players understand where attention may be needed first, not solve poker entirely.",
        ],
      },
      {
        heading: "AI Can Be Wrong",
        paragraphs: [
          "AI-generated analysis may occasionally misunderstand a spot, overvalue or undervalue aggression, miss exploitative context, produce incomplete reasoning, or oversimplify complex decisions.",
          "This is especially true in unusual player pools, highly exploitative environments, unconventional lines, and incomplete hand histories.",
          "Poker is not a solved game in practical real-world environments, particularly at low and mid stakes where player behaviour often differs significantly from theoretical expectations.",
          "Human judgment still matters.",
        ],
      },
      {
        heading: "Tournament Results Do Not Define Decision Quality",
        paragraphs: [
          "A winning hand is not always played well. A losing hand is not always played badly.",
          "Playback Poker attempts to focus on decision quality and repeated behavioural patterns rather than short-term outcomes alone.",
          "Variance remains a major part of poker.",
          "The purpose of review is not to remove variance from the game, but to improve long-term decision making over time.",
        ],
      },
      {
        heading: "No Real-Time Assistance",
        paragraphs: [
          "Playback Poker is designed specifically for post-session review and study workflows.",
          "It does not provide real-time assistance during active play.",
          "The platform is intended to help players analyse completed sessions, review tournaments, and identify patterns away from the table.",
        ],
      },
      {
        heading: "Practical Study Over Perfect Theory",
        paragraphs: [
          "Playback Poker is built around the idea that study should feel accessible, structured, practical, and repeatable.",
          "For many players, especially at low and mid stakes, improving often comes from identifying repeated leaks and improving overall decision quality rather than attempting to memorise perfectly solved outputs for every situation.",
          "AI can help accelerate that process, but it should remain one part of a broader study approach that includes tournament experience, hand review, selective theory work, discussion, and personal judgment.",
          "Playback Poker is designed to support that process, not replace it.",
        ],
      },
    ],
  },
  {
    path: "/methodology",
    title: "Playback Poker Methodology",
    kicker: "Methodology",
    description:
      "The review methodology used to parse sessions, prioritize spots, and convert repeated leaks into study actions.",
    publishReady: true,
    updatedAt: "2026-05-15",
    primaryLandingPath: "/tournament-hand-analysis",
    bodySections: [
      {
        heading: "Methodology Overview",
        paragraphs: [
          "Playback Poker is built around practical post-session review, not one-hand reactions.",
          "The methodology is designed to help players quickly identify what likely matters most, organise review in a repeatable order, and track whether corrections are working over time.",
          "This page explains the framework conceptually without exposing proprietary internals.",
        ],
      },
      {
        heading: "How Ranking Works Conceptually",
        paragraphs: [
          "Ranking is designed to estimate practical review value, not theoretical elegance.",
          "Hands are assessed by decision relevance, potential impact, and recurrence signals so higher-leverage spots appear earlier in the review queue.",
          "The objective is to reduce time spent on low-impact noise and increase time spent on hands that are more likely to influence long-term results.",
        ],
      },
      {
        heading: "How Drags Are Identified",
        paragraphs: [
          "Drags represent repeated decision patterns that appear to pull session quality down over volume.",
          "Instead of focusing on one dramatic bustout, the system looks for recurring behavioural themes such as passivity, missed pressure, or repeated preflop and postflop inefficiencies.",
          "This helps shift study from emotional recency bias toward trend-aware correction.",
        ],
      },
      {
        heading: "How Missed Opportunities Are Surfaced",
        paragraphs: [
          "Missed opportunities are surfaced by scanning for actionable spots where stronger initiative or better line selection was likely available.",
          "Common examples include missed opens, missed blind defences, and spots where aggression frequency may be too low.",
          "These are presented as review candidates so players can drill practical improvements, not just replay outcomes.",
        ],
      },
      {
        heading: "How Review Priority Is Determined",
        paragraphs: [
          "Priority is determined by combining impact orientation with recurrence orientation.",
          "In simple terms, spots are promoted when they are both meaningful and likely to represent repeatable leaks rather than isolated variance events.",
          "This creates a review order intended to maximise improvement per minute of study time.",
        ],
      },
      {
        heading: "How Trend Tracking Works",
        paragraphs: [
          "Trend tracking is session-to-session, not hand-to-hand.",
          "Playback Poker monitors summary metrics, leak themes, and recurring pattern direction over time so players can assess whether adjustments are improving decision quality.",
          "The goal is progression visibility: confirm what is improving, detect what is stagnating, and decide what to focus on next.",
        ],
      },
      {
        heading: "Practical Transparency",
        paragraphs: [
          "Playback Poker is intentionally transparent about workflow intent while protecting proprietary implementation detail.",
          "Users should understand what the system is trying to surface and why, without needing internal formulas to get value from the review process.",
          "The end goal is simple: faster, clearer, and more consistent tournament improvement.",
        ],
      },
    ],
  },
  {
    path: "/supported-sites-formats",
    title: "Supported Sites And Formats",
    kicker: "Compatibility",
    description:
      "Current upload compatibility for tournament and cash hand histories across GGPoker and PokerStars, with accepted import methods and expansion notes.",
    publishReady: true,
    updatedAt: "2026-05-15",
    primaryLandingPath: "/ggpoker-hand-review-tool",
    walkthroughTitle: "Import Walkthrough",
    walkthroughIntro:
      "Use this step-by-step flow for exporting from PokerCraft and validating a successful upload inside Playback Poker.",
    walkthroughSteps: [
      {
        title: "Step 1: Export From PokerCraft",
        description:
          "Open the PokerCraft tournament page, select the target tournament, and use Download Game History.",
        alt: "PokerCraft tournament page showing the selected tournament and the Download Game History button",
        caption:
          "PokerCraft tournament view with the Download Game History action highlighted.",
        sources: [
          {
            srcSet: SUPPORTED_SITES_STEP_1_URL,
            type: "image/webp",
          },
        ],
        src: SUPPORTED_SITES_STEP_1_URL,
      },
      {
        title: "Step 2: Confirm Download Success",
        description:
          "Verify PokerCraft export completion and confirm the ZIP file is downloaded to your local machine.",
        alt: "PokerCraft download success page showing the exported ZIP file saved locally",
        caption: "Download success state with ZIP export saved for extraction.",
        sources: [
          {
            srcSet: SUPPORTED_SITES_STEP_2_URL,
            type: "image/webp",
          },
        ],
        src: SUPPORTED_SITES_STEP_2_URL,
      },
      {
        title: "Step 3: Upload Extracted Hand History",
        description:
          "Extract the ZIP, select the hand history text file in Playback Poker, and upload it for parsing.",
        alt: "Playback Poker upload interface with file selector and extracted hand history file selected in Windows Explorer",
        caption:
          "Upload state after selecting the extracted hand history file.",
        sources: [
          {
            srcSet: SUPPORTED_SITES_STEP_3_URL,
            type: "image/webp",
          },
        ],
        src: SUPPORTED_SITES_STEP_3_URL,
      },
      {
        title: "Step 4: Review Parsed Tournament",
        description:
          "Confirm parsing completion and inspect the generated tournament summary and full hand history output.",
        alt: "Playback Poker parsed tournament view showing summary metrics and full hand history results",
        caption:
          "Successful parse with full tournament summary and hand history visibility.",
        sources: [
          {
            srcSet: SUPPORTED_SITES_STEP_4_URL,
            type: "image/webp",
          },
        ],
        src: SUPPORTED_SITES_STEP_4_URL,
      },
    ],
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
          "Tournament analysis workflows are currently the most mature, while cash workflow depth continues to improve.",
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
