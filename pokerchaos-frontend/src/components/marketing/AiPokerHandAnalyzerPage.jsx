import { useEffect } from "react";
import MarketingSiteShell from "./MarketingSiteShell.jsx";

const PAGE_PATH = "/ai-poker-hand-analyzer";
const PAGE_TITLE = "AI Poker Hand Analyzer | Playback Poker";
const PAGE_DESCRIPTION =
  "Review tournament and cash hand histories with AI feedback. Upload PokerStars logs or GGPoker PokerCraft exports for structured review.";

function upsertMetaTag({ name, property, content }) {
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  let metaTag = document.head.querySelector(selector);
  if (!metaTag) {
    metaTag = document.createElement("meta");
    if (name) metaTag.setAttribute("name", name);
    if (property) metaTag.setAttribute("property", property);
    document.head.appendChild(metaTag);
  }
  metaTag.setAttribute("content", content);
}

function upsertCanonicalTag(href) {
  let canonicalTag = document.head.querySelector('link[rel="canonical"]');
  if (!canonicalTag) {
    canonicalTag = document.createElement("link");
    canonicalTag.setAttribute("rel", "canonical");
    document.head.appendChild(canonicalTag);
  }
  canonicalTag.setAttribute("href", href);
}

function upsertJsonLdScript(id, schema) {
  let scriptTag = document.head.querySelector(`#${id}`);
  if (!scriptTag) {
    scriptTag = document.createElement("script");
    scriptTag.type = "application/ld+json";
    scriptTag.id = id;
    document.head.appendChild(scriptTag);
  }
  scriptTag.textContent = JSON.stringify(schema);
}

export default function AiPokerHandAnalyzerPage() {
  useEffect(() => {
    const pageUrl = `${window.location.origin}${PAGE_PATH}`;

    document.title = PAGE_TITLE;
    upsertMetaTag({ name: "description", content: PAGE_DESCRIPTION });
    upsertMetaTag({ name: "robots", content: "index,follow" });
    upsertMetaTag({ property: "og:title", content: PAGE_TITLE });
    upsertMetaTag({ property: "og:description", content: PAGE_DESCRIPTION });
    upsertMetaTag({ property: "og:type", content: "website" });
    upsertMetaTag({ property: "og:url", content: pageUrl });
    upsertCanonicalTag(pageUrl);

    upsertJsonLdScript("seo-schema-software-application", {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Playback Poker AI Poker Hand Analyzer",
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      url: pageUrl,
      description: PAGE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    });

    upsertJsonLdScript("seo-schema-faq-ai-hand-analyzer", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What hands should I review after a tournament session?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Review high-pot confrontations, close all-in spots, ICM pressure decisions, and hands where your line changed due to uncertainty.",
          },
        },
        {
          "@type": "Question",
          name: "How does AI poker hand analysis help MTT players improve?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AI review speeds up leak discovery by highlighting repeated preflop and postflop decision errors, then explaining tactical alternatives hand by hand.",
          },
        },
        {
          "@type": "Question",
          name: "Can I use this as a GGPoker hand review tool?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Tournament and cash uploads support both GGPoker and PokerStars.",
          },
        },
      ],
    });
  }, []);

  return (
    <MarketingSiteShell currentPath={PAGE_PATH}>
      <section className="home-hero learning-story-hero">
        <div className="learning-story-copy">
          <p className="marketing-kicker">AI Poker Hand Analyzer</p>
          <h1 className="marketing-title">
            Analyze tournament hands with focused AI feedback in minutes.
          </h1>
          <p className="marketing-subtitle">
            Playback Poker helps you review MTT decisions, surface recurring
            leaks, and run cleaner post-session study with a tactical workflow.
            Tournament and cash uploads support both GGPoker and PokerStars.
          </p>
          <div className="marketing-proof-row">
            <span className="marketing-pill">MTT hand review workflow</span>
            <span className="marketing-pill">Leak-focused analysis</span>
            <span className="marketing-pill">Tournaments: GG + PokerStars</span>
            <span className="marketing-pill">Cash: GG + PokerStars</span>
          </div>
          <div className="learning-story-actions">
            <a className="home-button home-button-primary" href="/review">
              Review a Hand
            </a>
            <a className="home-button home-button-secondary" href="/articles">
              Back to Articles
            </a>
          </div>
        </div>
        <div className="learning-story-aside">
          <div className="learning-story-stat">
            <span className="learning-story-stat-label">Workflow</span>
            <strong>Street-by-street AI review</strong>
          </div>
          <p className="learning-story-aside-copy">
            Built to explain decisions clearly while staying honest about AI
            limits and practical review context.
          </p>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>How It Works</h2>
        <div className="marketing-grid">
          <article className="marketing-card">
            <h3>1. Bring Your Hand History</h3>
            <p>
              Start from a tournament session and isolate high-impact spots:
              large pots, all-ins, and unclear lines.
            </p>
          </article>
          <article className="marketing-card">
            <h3>2. Run AI Hand Analysis</h3>
            <p>
              Evaluate your action sequence by street and identify where EV can
              be protected or increased.
            </p>
          </article>
          <article className="marketing-card">
            <h3>3. Build A Study Queue</h3>
            <p>
              Turn repeated mistakes into a tactical review list so each session
              creates measurable improvement.
            </p>
          </article>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>Built For Real Search Intent</h2>
        <ul className="marketing-intent-list">
          <li>AI Poker Hand Analyzer</li>
          <li>Poker Leak Finder</li>
          <li>MTT Hand Review Software</li>
          <li>Tournament Hand Analysis</li>
          <li>Poker Session Review</li>
        </ul>
      </section>

      <section className="home-section learning-story-section">
        <h2>FAQ</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>What hands should I review after a session?</h3>
            <p>
              Prioritize high-leverage hands: big pots, bubble and pay-jump ICM
              spots, and lines where you were uncertain during play.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>How pros study MTT hands effectively</h3>
            <p>
              Strong players batch similar spots, label recurring mistakes, and
              run consistent post-session reviews with clear correction themes.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Can this help with low-stakes tournament leaks?</h3>
            <p>
              Yes. A structured review process makes it easier to catch common
              low-stakes issues like sizing errors and avoidable stack-offs.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Which sites are supported right now?</h3>
            <p>
              Tournament and cash uploads support GGPoker and PokerStars.
              PokerStars supports direct log upload and mobile email text
              copy/paste imports, while GGPoker supports PokerCraft exports.
            </p>
          </article>
        </div>
      </section>
    </MarketingSiteShell>
  );
}
