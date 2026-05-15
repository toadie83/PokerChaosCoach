export const ARTICLE_ROUTE_PREFIX = "/articles";
export const ARTICLES_HUB_PATH = "/articles";
export const SITE_BASE_URL = "https://www.playbackpoker.com";
const R2_PUBLIC_MEDIA_BASE_URL =
  "https://pub-1f64fd7c586548cbb026391e26e2d358.r2.dev";
const GG_EXPORT_STEP_1_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-export-source-pokercraft.webp`;
const GG_EXPORT_STEP_2_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-export-source-pokercraft-download.webp`;
const GG_EXPORT_STEP_3_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-parse-upload-overview.webp`;
const GG_EXPORT_STEP_4_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/supported-sites-formats-parse-success-full.webp`;
const MTT_STUDY_STEP_1_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/best-mtt-study-workflow-step-1-parse-leak-priority.webp`;
const MTT_STUDY_STEP_2_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/best-mtt-study-workflow-step-2-biggest-drags.webp`;
const MTT_STUDY_STEP_3_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/best-mtt-study-workflow-step-3-ai-tournament-summary.webp`;
const MTT_STUDY_STEP_4_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/best-mtt-study-workflow-step-4-session-kpis.webp`;
const MTT_STUDY_STEP_5_URL = `${R2_PUBLIC_MEDIA_BASE_URL}/best-mtt-study-workflow-step-5-hand-audit-jto-co-missed-open.webp`;

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
    relatedSlug: "best-mtt-study-workflow",
    publishReady: true,
    updatedAt: "2026-05-15",
    bodySections: [
      {
        heading: "How AI Poker Review Actually Works",
        paragraphs: [
          "AI is becoming a huge part of modern poker study, but a lot of players still feel overwhelmed by what these tools actually do.",
          "Some products position AI as a magic poker brain capable of solving every situation perfectly. Others simply wrap a chatbot around hand histories without providing much real structure or practical value.",
          "Playback Poker takes a more practical approach.",
          "Playback Poker is an AI-assisted post-session review workflow, not a real-time tool.",
          "It helps tournament players review faster, identify repeated leaks, and better understand their sessions after play has finished.",
        ],
      },
      {
        heading: "Parsing Comes First",
        paragraphs: [
          "The foundation of Playback Poker is not AI.",
          "It is structured parsing.",
          "When a tournament or session is uploaded, Playback Poker first processes and organises raw hand history data into something reviewable and actionable.",
          "That includes identifying meaningful hands, surfacing missed opportunities, tracking tournament KPIs, ranking review priority, identifying repeated leaks and drags, grouping behavioural patterns, structuring opponent data, and filtering out low-value noise.",
          "A large part of the workflow happens before AI analysis is even involved.",
          "The goal is to reduce the manual digging players normally have to do when reviewing large tournament histories.",
        ],
      },
      {
        heading: "Where AI Review Is Used",
        paragraphs: [
          "The AI layer adds context and accelerates understanding once structured data has already been processed.",
          "Playback Poker currently uses AI review to help analyse specific hands when requested, turn tournament summaries and statistics into practical next steps, explain missed opportunities surfaced through Audit workflows, provide conversational hand explanations, and review opponent tendencies from tables and sessions.",
          "For example, a missed cutoff open may receive additional context around stack pressure or aggression frequency, a tournament summary may highlight repeated passive trends across late-stage play, and opponent review workflows may identify overly aggressive or passive player tendencies at different seats.",
          "The aim is not to generate endless theory.",
          "The aim is to help players understand what likely matters most first.",
        ],
      },
      {
        heading: "Why Workflow Matters",
        paragraphs: [
          "A common problem with poker study is that players spend more time organising information than learning from it.",
          "Tournament exports can contain thousands of hands, repeated low-value spots, huge amounts of noise, and emotionally charged bustout hands.",
          "Without structure, review quickly becomes overwhelming.",
          "Playback Poker reduces that friction by surfacing meaningful information earlier in the review process.",
          "For many players, especially at low and mid stakes, recognising repeated patterns across sessions is often more valuable than obsessing over individual coolers or all-ins.",
        ],
      },
      {
        heading: "What The AI Is Good At",
        paragraphs: [
          "Playback Poker works best as a practical review assistant.",
          "Right now, the strongest areas are speeding up post-session review, summarising tournament output into readable takeaways, surfacing repeated behavioural patterns, prioritising high-impact review spots, helping players understand hands in natural language, adding context to missed opportunities, and accelerating opponent review workflows.",
          "For many tournament players, this can make study significantly more accessible and actionable.",
        ],
      },
      {
        heading: "What The AI Is Not Designed To Do",
        paragraphs: [
          "Playback Poker is not trying to replace professional solver tools.",
          "It is not a solver replacement.",
          "It does not claim to produce perfect GTO outputs or mathematically solved strategies for every situation.",
          "Poker is highly contextual, and hand histories alone cannot perfectly capture table dynamics, emotional state, exploitative adjustments, player psychology, or incomplete reads.",
          "AI analysis should be treated as a review aid, not absolute truth.",
          "Playback Poker helps players review faster and think more clearly about decisions, not outsource strategic thinking entirely.",
        ],
      },
      {
        heading: "Real-Time Assistance",
        paragraphs: [
          "Playback Poker is built specifically for post-session review and study workflows.",
          "It does not provide real-time assistance during live play.",
          "The platform helps players improve away from the table through structured review, pattern recognition, and tournament analysis after sessions are complete.",
        ],
      },
      {
        heading: "Where AI Review Fits Into Poker Study",
        paragraphs: [
          "For many players, AI-assisted review works best alongside practical experience, tournament volume, selective solver study, hand discussion, and personal judgment.",
          "Strong improvement usually comes from combining multiple forms of study together.",
          "Playback Poker makes one part of that process significantly faster, clearer, and easier to work through.",
          "If you want to upload tournament sessions, review recurring leaks, and analyse your play more efficiently, you can explore Playback Poker directly from the homepage.",
        ],
      },
    ],
  },
  {
    slug: "how-to-export-gg-hand-histories",
    title: "How To Export GGPoker Hand Histories",
    cluster: "GG Poker",
    excerpt:
      "Step-by-step export guidance for GGPoker hand histories so users can upload clean session data.",
    primaryLandingPath: "/ggpoker-hand-review-tool",
    relatedSlug: "best-mtt-study-workflow",
    publishReady: true,
    updatedAt: "2026-05-15",
    walkthroughTitle: "PokerCraft Export Walkthrough",
    walkthroughIntro:
      "Follow these steps to export tournament hand histories from PokerCraft and move them into Playback Poker for structured review.",
    walkthroughSteps: [
      {
        title: "Step 1: Open PokerCraft And Locate Tournament",
        description:
          "Open PokerCraft, go to My tournaments, locate your target tournament, and find the Download Game History option.",
        alt: "PokerCraft tournament page with a selected tournament and Download Game History button visible",
        caption:
          "Tournament selected in PokerCraft with export action available.",
        sources: [
          {
            srcSet: GG_EXPORT_STEP_1_URL,
            type: "image/webp",
          },
        ],
        src: GG_EXPORT_STEP_1_URL,
      },
      {
        title: "Step 2: Confirm Download Success",
        description:
          "Run the export and confirm PokerCraft has downloaded the ZIP file to your local machine.",
        alt: "PokerCraft download success state showing exported ZIP file saved locally",
        caption: "ZIP export completed and ready for extraction.",
        sources: [
          {
            srcSet: GG_EXPORT_STEP_2_URL,
            type: "image/webp",
          },
        ],
        src: GG_EXPORT_STEP_2_URL,
      },
      {
        title: "Step 3: Upload Extracted File In Playback Poker",
        description:
          "Extract the ZIP, select the hand history text file in the Playback Poker uploader, and start upload.",
        alt: "Playback Poker upload interface with extracted hand history file selected from local folder",
        caption:
          "Upload state after selecting the extracted hand history text file.",
        sources: [
          {
            srcSet: GG_EXPORT_STEP_3_URL,
            type: "image/webp",
          },
        ],
        src: GG_EXPORT_STEP_3_URL,
      },
      {
        title: "Step 4: Verify Parse And Review Output",
        description:
          "Confirm parse success and review tournament summary, ranked hands, and full hand history output.",
        alt: "Playback Poker parsed tournament screen showing tournament summary and complete hand history output",
        caption: "Successful parse with full review surface available.",
        sources: [
          {
            srcSet: GG_EXPORT_STEP_4_URL,
            type: "image/webp",
          },
        ],
        src: GG_EXPORT_STEP_4_URL,
      },
    ],
    bodySections: [
      {
        heading: "How To Export GGPoker Hand Histories From PokerCraft",
        paragraphs: [
          "If you want to properly review your tournaments, study leaks, or analyse important hands after a session, exporting your hand histories is one of the best places to start.",
          "GGPoker stores tournament data inside PokerCraft, allowing you to export complete hand histories from your sessions. Once exported, these files can be reviewed manually or uploaded into tools like Playback Poker for structured analysis and leak review.",
          "This guide walks through the current PokerCraft export process step by step.",
        ],
      },
      {
        heading: "Why Export Hand Histories?",
        paragraphs: [
          "A lot of tournament players only remember the biggest hands from a session.",
          "The problem is that many important mistakes happen in smaller spots: missed steals, passive postflop lines, weak defence frequencies, missed aggression opportunities, and poor stack pressure decisions.",
          "Exporting your tournament history gives you the full picture.",
          "Instead of relying on memory, you can review every meaningful hand, missed opportunities, tournament trends, opponent tendencies, and overall session quality.",
          "For players trying to improve consistently, proper review matters.",
        ],
      },
      {
        heading: "Step 1: Open PokerCraft",
        paragraphs: [
          "Open the GGPoker client and navigate to PokerCraft. Select the My tournaments menu.",
          "This is where GGPoker stores tournament results, hand histories, graphs, and session data.",
          "Use the filters to locate the tournament or session you want to review.",
        ],
      },
      {
        heading: "Step 2: Select Your Tournament",
        paragraphs: [
          "Choose the tournament you want to export.",
          "You should see tournament details, finishing position, and the tournament selection checkbox before export.",
          "At this point, you are preparing to export the full tournament hand history.",
        ],
      },
      {
        heading: "Step 3: Export The Hand History",
        paragraphs: [
          "Select the tournament or tournaments you want to export, then locate Download Game Histories inside PokerCraft.",
          "Once selected, GGPoker will generate a downloadable hand history file containing the tournament data.",
          "For best results, export the complete tournament, avoid editing the file manually, and keep original formatting intact.",
          "Playback Poker works best with unmodified exports directly from PokerCraft.",
        ],
      },
      {
        heading: "Step 4: Upload And Review",
        paragraphs: [
          "Once downloaded, upload the exported hand history into Playback Poker.",
          "Playback Poker parses the tournament data and helps surface important hands, missed spots, leak patterns, opponent flags, tournament rankings, and review summaries.",
          "The goal is not simply to replay hands one by one, but to make tournament review faster and easier to work through.",
        ],
      },
      {
        heading: "Common Export Problems",
        paragraphs: [
          "Some exports may not contain the full tournament history if session data has not fully synced yet. Retry the export later and confirm the tournament completed properly inside PokerCraft.",
          "Editing hand histories manually can break parsing structure. Always upload the original exported file where possible.",
          "Double-check the selected tournament before exporting, especially if multi-tabling heavily.",
        ],
      },
      {
        heading: "Why Tournament Review Matters",
        paragraphs: [
          "A lot of players spend hours watching solver videos or memorising charts, but never properly review their own tournaments.",
          "Reviewing your own play is often where the biggest improvements happen.",
          "Over time, consistent review helps you recognise repeated mistakes, identify passive tendencies, spot aggression leaks, improve decision confidence, and build better tournament habits.",
          "That is the workflow Playback Poker is designed to support.",
          "If you want to analyse your own tournament exports, you can upload a hand history and review your sessions directly from the Playback Poker homepage.",
        ],
      },
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
    publishReady: true,
    updatedAt: "2026-05-15",
    walkthroughTitle: "5-Step Weekly MTT Study Workflow",
    walkthroughIntro:
      "Use this repeatable weekly workflow to parse sessions, isolate leaks, and carry one clear correction into your next play block.",
    walkthroughSteps: [
      {
        title: "Step 1: Parse Session And Set Priority",
        description:
          "After parsing, verify overall performance rating, identify the biggest leak, and set one priority adjustment for the next session.",
        alt: "Playback Poker parsed tournament view showing overall performance rating, biggest leak, and priority adjustment",
        caption: "Start with one priority adjustment, not ten scattered fixes.",
        sources: [
          {
            srcSet: MTT_STUDY_STEP_1_URL,
            type: "image/webp",
          },
        ],
        src: MTT_STUDY_STEP_1_URL,
      },
      {
        title: "Step 2: Review Biggest Drags",
        description:
          "Use the tournament summary drags panel to identify what is actually lowering your score and where review time should be focused.",
        alt: "Tournament summary biggest drags panel showing top factors reducing performance score",
        caption:
          "Let the biggest drags define where your study time goes first.",
        sources: [
          {
            srcSet: MTT_STUDY_STEP_2_URL,
            type: "image/webp",
          },
        ],
        src: MTT_STUDY_STEP_2_URL,
      },
      {
        title: "Step 3: Validate Pattern With AI Summary",
        description:
          "Review the AI tournament summary to validate repeated patterns and convert observations into practical adjustments.",
        alt: "AI tournament performance summary highlighting repeated decision patterns and strategic adjustments",
        caption: "Use AI for clarity and synthesis, not autopilot decisions.",
        sources: [
          {
            srcSet: MTT_STUDY_STEP_3_URL,
            type: "image/webp",
          },
        ],
        src: MTT_STUDY_STEP_3_URL,
      },
      {
        title: "Step 4: Track Core Session KPIs",
        description:
          "Check session-level KPIs to measure trend direction over time and confirm whether adjustments are improving decision quality.",
        alt: "Session stats dashboard showing core MTT study KPIs across reviewed tournaments",
        caption:
          "If KPIs are not improving, your workflow is not yet closing leaks.",
        sources: [
          {
            srcSet: MTT_STUDY_STEP_4_URL,
            type: "image/webp",
          },
        ],
        src: MTT_STUDY_STEP_4_URL,
      },
      {
        title: "Step 5: Drill A Key Hand Audit",
        description:
          "Run a focused hand audit on one high-value spot, such as a missed JTo CO open, and use the review panel explanation to anchor your pre-session focus note.",
        alt: "Hand audit panel highlighting a missed JTo cutoff open with AI explanation for why it should be opened",
        caption:
          "Concrete hand corrections are what carry into better in-game habits.",
        sources: [
          {
            srcSet: MTT_STUDY_STEP_5_URL,
            type: "image/webp",
          },
        ],
        src: MTT_STUDY_STEP_5_URL,
      },
    ],
    bodySections: [
      {
        heading: "Best MTT Study Workflow For Consistent Improvement",
        paragraphs: [
          "The best MTT study workflow is not about reviewing random hands until you run out of focus. It is about using a repeatable system that turns each tournament into practical improvements for the next session.",
          "Playback Poker is designed for exactly that loop: parse, prioritize, audit, track, and apply.",
          "This guide breaks down a simple 5-step workflow you can run weekly.",
        ],
      },
      {
        heading: "Why Most MTT Study Fails",
        paragraphs: [
          "Many players spend study time on low-impact hands or theory content disconnected from their actual leaks.",
          "Without a structure, review becomes noisy: too many tabs, too many ideas, and no clear action to carry into the next grind block.",
          "Consistent improvement comes from narrowing focus to the highest-impact recurring mistakes.",
        ],
      },
      {
        heading: "Step 1: Parse And Set One Priority Adjustment",
        paragraphs: [
          "Start by parsing the tournament and checking the overall performance rating.",
          "Then identify your biggest leak and set one specific priority adjustment for the next play block.",
          "A single correction priority is easier to execute than a long list of vague goals.",
        ],
      },
      {
        heading: "Step 2: Diagnose The Biggest Drags",
        paragraphs: [
          "Use the biggest drags summary to see what is most heavily impacting your score.",
          "This prevents memory bias and keeps your review focused on leak classes that are costing the most over volume.",
          "If you only have limited study time, this is where it should go first.",
        ],
      },
      {
        heading: "Step 3: Use AI Summary For Pattern Clarity",
        paragraphs: [
          "Review the AI tournament summary to cross-check recurring themes and convert noisy hand-level data into clear strategic patterns.",
          "Treat AI output as a structured second opinion that helps interpretation, not as an unquestioned instruction layer.",
          "The goal is to improve judgment speed and quality in real decisions.",
        ],
      },
      {
        heading: "Step 4: Track Core KPIs Weekly",
        paragraphs: [
          "Use session stats and core KPIs to measure whether your adjustments are working across multiple tournaments.",
          "Good KPI tracking makes progress visible and prevents overreacting to one unusual session.",
          "Improvement is usually trend-based, not hand-based.",
        ],
      },
      {
        heading: "Step 5: Drill One High-Value Hand Audit",
        paragraphs: [
          "Finish each review by drilling one concrete hand where the correction is clear and transferable.",
          "In this example, a JTo cutoff open was missed and treated as a fold. The hand review panel explains why it was an open and what strategic factors supported the action.",
          "Turn that finding into a short pre-session focus note you can apply immediately.",
        ],
      },
      {
        heading: "Weekly Cadence You Can Repeat",
        paragraphs: [
          "Run this 5-step cycle weekly: parse, identify biggest drags, validate with AI summary, check KPI trend, and drill one high-value hand correction.",
          "This creates a practical feedback loop where study results translate into better tournament decisions over time.",
          "If you want structured MTT review without solver overload, this workflow is a strong baseline.",
        ],
      },
    ],
  },
  {
    slug: "how-pros-review-mtt-sessions",
    title: "How Pros Review MTT Sessions",
    cluster: "Tournament Study",
    excerpt:
      "Translate pro-level review habits into a practical framework for serious tournament players.",
    primaryLandingPath: "/poker-session-review",
    relatedSlug: "best-mtt-study-workflow",
    publishReady: true,
    updatedAt: "2026-05-15",
    bodySections: [
      {
        heading: "How Pros Review MTT Sessions",
        paragraphs: [
          "A lot of tournament players review sessions emotionally.",
          "They replay bad beats, focus on bustout hands, and spend hours thinking about what might have happened if one river card had landed differently.",
          "The problem is that most long-term tournament improvement does not come from coolers or unavoidable all-ins.",
          "It comes from repeated patterns: missed steals, passive lines, weak blind defence, fatigue mistakes deep into sessions, and small decisions repeated hundreds of times over time.",
          "Strong MTT players understand that review is not about reliving pain. It is about identifying repeatable leaks and improving future decision making.",
        ],
      },
      {
        heading: "Most Players Review The Wrong Hands",
        paragraphs: [
          "After a bustout, it is natural to fixate on the final hand.",
          "Especially if the river was brutal, you lost with a premium, you bubbled a big payout, or a flip did not hold.",
          "But often the biggest EV losses happened much earlier: a missed cutoff open, a weak fold in the big blind, a passive check instead of a value bet, or a missed squeeze spot.",
          "These smaller decisions rarely feel dramatic in the moment, but over thousands of tournaments they matter far more than individual bad beats.",
          "That is why effective review starts with pattern recognition, not emotion.",
        ],
      },
      {
        heading: "Start With Missed Opportunities",
        paragraphs: [
          "One of the fastest ways to review an MTT session is to begin with your missed opportunities.",
          "Playback Poker surfaces these through the Audit workflow, allowing you to quickly identify missed opens, missed blind defence spots, passive lines, potential aggression leaks, and stack pressure mistakes.",
          "This is usually far more valuable than immediately replaying every all-in confrontation.",
          "Strong tournament players are often separated by how consistently they take profitable spots, not just how well they survive coolers.",
        ],
      },
      {
        heading: "Keep Review Sessions Short And Focused",
        paragraphs: [
          "A common mistake is turning study into an exhausting multi-hour grind.",
          "For most players, that simply is not sustainable.",
          "A practical review workflow should feel fast, structured, and easy to repeat consistently.",
          "For many MTT players, 10 focused minutes reviewing meaningful spots is far more useful than spending hours lost in solver outputs or random hand replays.",
          "The goal is not to analyse every hand perfectly.",
          "The goal is to identify repeated leaks, behavioural tendencies, recurring mistakes, and decision-making patterns.",
          "Consistency matters more than volume.",
        ],
      },
      {
        heading: "Review Lost Showdowns Properly",
        paragraphs: [
          "Once missed opportunities have been reviewed, the next step is usually analysing important showdown hands.",
          "This is where players often need to separate genuine mistakes from unavoidable variance.",
          "Not every lost pot is a punt.",
          "Sometimes the money simply goes in correctly and the cards run badly.",
          "Strong review means asking: was my line reasonable, did I apply enough pressure, did I miss value, was I too passive, and was my stack management correct?",
          "The answer is not always that you played badly.",
          "Understanding the difference between mistakes and variance is an important part of long-term confidence.",
        ],
      },
      {
        heading: "Review Hands You Played Well Too",
        paragraphs: [
          "A lot of players only study mistakes.",
          "That can become mentally draining over time.",
          "Reviewing hands you played well is also valuable.",
          "Good tournament review should reinforce strong aggression, disciplined folds, well-timed pressure, good stack awareness, and profitable deviations.",
          "Recognising good decisions helps build confidence and reinforces repeatable habits.",
        ],
      },
      {
        heading: "Watch For Fatigue Patterns",
        paragraphs: [
          "Fatigue is one of the most overlooked parts of tournament poker.",
          "Deep MTT sessions can run for many hours, especially online.",
          "Players often become more passive, less focused, emotionally reactive, and slower to recognise pressure spots.",
          "Sometimes repeated mistakes are not knowledge problems at all.",
          "They are energy and concentration problems.",
          "Tracking session patterns over time can help identify when your game quality starts dropping.",
        ],
      },
      {
        heading: "The Goal Of Review",
        paragraphs: [
          "The best tournament review workflows are not about proving you are unlucky.",
          "They are about building awareness.",
          "Strong MTT players gradually develop better pattern recognition, more confidence in aggression, stronger discipline, and clearer understanding of recurring leaks.",
          "Playback Poker is designed to make that process faster and more accessible by helping players surface meaningful spots quickly instead of manually digging through thousands of hands.",
          "If you want to review your own tournaments, identify repeated leaks, and track your progress over time, you can upload your sessions directly through Playback Poker.",
        ],
      },
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
