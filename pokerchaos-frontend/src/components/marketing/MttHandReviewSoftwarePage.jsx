import { useEffect } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";

const PAGE_PATH = "/mtt-hand-review-software";
const PAGE_TITLE = "MTT Hand Review Software | Playback Poker";
const PAGE_DESCRIPTION =
  "Parse tournament hand histories, rank high-impact spots, and run structured MTT study faster. Playback Poker adds AI-supported feedback where it helps.";

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

export default function MttHandReviewSoftwarePage() {
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
      name: "Playback Poker MTT Hand Review Software",
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

    upsertJsonLdScript("seo-schema-faq-mtt-hand-review-software", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How do pros review MTT hands effectively?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Strong MTT review starts with structured parsing, then ranking the highest-impact hands first before deeper tactical analysis.",
          },
        },
        {
          "@type": "Question",
          name: "What hands should I review after a tournament session?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Start with large pots, all-ins, pressure spots, and hands where your line changed because of uncertainty.",
          },
        },
        {
          "@type": "Question",
          name: "Which sites are supported for uploads?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Tournament uploads support GGPoker and PokerStars. Cash uploads currently support GGPoker.",
          },
        },
      ],
    });
  }, []);

  return (
    <main className="marketing-shell">
      <section className="panel marketing-header-panel">
        <img
          src={mobileNavWordmark}
          alt="Playback Poker"
          className="marketing-wordmark"
        />
      </section>

      <section className="panel marketing-hero-panel">
        <p className="marketing-kicker">MTT Hand Review Software</p>
        <h1 className="marketing-title">
          Parse, Rank, and Prioritize Tournament Hands
        </h1>
        <p className="marketing-subtitle">
          Playback Poker is built for structured MTT review. Tournament hands
          are parsed and ranked so key spots are identified quickly, with
          AI-supported feedback available to speed up tactical refinement.
        </p>
        <div className="marketing-proof-row">
          <span className="marketing-pill">Structured tournament parsing</span>
          <span className="marketing-pill">Ranked high-impact spot queue</span>
          <span className="marketing-pill">AI-supported study feedback</span>
        </div>
        <a className="auth-button marketing-cta-button" href="/">
          Start Free Hand Review
        </a>
      </section>

      <section className="panel">
        <h2>How MTT Review Works</h2>
        <div className="marketing-grid">
          <article className="marketing-card">
            <h3>1. Parse Tournament Uploads</h3>
            <p>
              Import tournament hand histories and normalize the session into a
              clean review-ready structure.
            </p>
          </article>
          <article className="marketing-card">
            <h3>2. Rank Key Decision Spots</h3>
            <p>
              Surface and prioritize high-leverage spots first so your study
              time focuses on the biggest potential gains.
            </p>
          </article>
          <article className="marketing-card">
            <h3>3. Refine With Tactical Feedback</h3>
            <p>
              Use AI-supported insights where useful to interpret decisions and
              convert recurring errors into concrete adjustments.
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>What Gets Flagged</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>Missed preflop opportunities</h3>
            <p>
              Includes missed opens, questionable entries, and inconsistent
              responses versus opens or 3-bets.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Pressure and defense mistakes</h3>
            <p>
              Highlights spots where aggression or defense frequencies drift
              from stronger tournament decision patterns.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Postflop execution leaks</h3>
            <p>
              Flags passive lines, missed value opportunities, and costly calls
              that repeat across sessions.
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>FAQ</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>Can I use this with GGPoker and PokerStars tournaments?</h3>
            <p>
              Yes. Tournament uploads currently support both GGPoker and
              PokerStars.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Do I need AI to get value from this workflow?</h3>
            <p>
              No. Core value comes from parsing, ranking, and spot
              identification. AI is an added support layer for deeper feedback.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Does cash upload support exist too?</h3>
            <p>
              Yes. Cash uploads currently support GGPoker, with more rooms
              planned.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
