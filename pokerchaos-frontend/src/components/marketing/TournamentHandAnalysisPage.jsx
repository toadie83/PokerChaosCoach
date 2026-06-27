import { useEffect } from "react";
import MarketingSiteShell from "./MarketingSiteShell.jsx";

const PAGE_PATH = "/tournament-hand-analysis";
const PAGE_TITLE = "Tournament Hand Analysis | Playback Poker";
const PAGE_DESCRIPTION =
  "Run structured tournament hand analysis with parsed uploads, ranked key spots, and AI-supported feedback where useful. Improve MTT decisions faster.";

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

export default function TournamentHandAnalysisPage() {
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
      name: "Playback Poker Tournament Hand Analysis",
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

    upsertJsonLdScript("seo-schema-faq-tournament-hand-analysis", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How should I analyze tournament hands after a session?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Parse the session, rank high-impact spots, and review recurring preflop or postflop errors before low-impact hands.",
          },
        },
        {
          "@type": "Question",
          name: "What spots matter most in tournament hand analysis?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Large pots, all-ins, ICM pressure spots, and hands where your line changed due to uncertainty typically deliver the biggest gains.",
          },
        },
        {
          "@type": "Question",
          name: "Which tournament sites are supported for uploads?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Tournament uploads currently support GGPoker and PokerStars.",
          },
        },
      ],
    });
  }, []);

  return (
    <MarketingSiteShell currentPath={PAGE_PATH}>
      <section className="home-hero learning-story-hero">
        <div className="learning-story-copy">
          <p className="marketing-kicker">Tournament Hand Analysis</p>
          <h1 className="marketing-title">
            Structured tournament analysis for key spots.
          </h1>
          <p className="marketing-subtitle">
            Playback Poker parses your tournament uploads, ranks high-leverage
            hands, and helps you audit recurring decision errors with optional
            AI-supported feedback.
          </p>
          <div className="marketing-proof-row">
            <span className="marketing-pill">Tournament parser workflow</span>
            <span className="marketing-pill">Ranked spot prioritization</span>
            <span className="marketing-pill">MTT-focused leak auditing</span>
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
            <span className="learning-story-stat-label">Priority</span>
            <strong>High-leverage decisions</strong>
          </div>
          <p className="learning-story-aside-copy">
            Built to focus review around the decisions most likely to change a
            tournament result.
          </p>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>Analysis Workflow</h2>
        <div className="marketing-grid">
          <article className="marketing-card">
            <h3>1. Parse Tournament Sessions</h3>
            <p>
              Convert raw hand-history uploads into a structured review surface
              you can scan quickly.
            </p>
          </article>
          <article className="marketing-card">
            <h3>2. Rank High-Impact Spots</h3>
            <p>
              Identify the hands with the highest potential decision EV impact
              before spending time on marginal spots.
            </p>
          </article>
          <article className="marketing-card">
            <h3>3. Audit Repeated Leaks</h3>
            <p>
              Track recurring mistakes by theme and convert them into targeted
              correction priorities.
            </p>
          </article>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>FAQ</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>Does this support GGPoker tournament reviews?</h3>
            <p>Yes. Tournament uploads support GGPoker and PokerStars.</p>
          </article>
          <article className="marketing-faq-item">
            <h3>Is this only AI-driven?</h3>
            <p>
              No. Core value starts with parsing, ranking, and spot
              identification. AI is a support layer for interpretation.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>What should I review first after a deep run?</h3>
            <p>
              Prioritize all-ins, ICM pressure hands, and large pots where your
              line shifted under uncertainty.
            </p>
          </article>
        </div>
      </section>
    </MarketingSiteShell>
  );
}
