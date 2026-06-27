import { useEffect } from "react";
import MarketingSiteShell from "./MarketingSiteShell.jsx";

const PAGE_PATH = "/poker-leak-finder";
const PAGE_TITLE = "Poker Leak Finder | Playback Poker";
const PAGE_DESCRIPTION =
  "Audit your poker hands with AI to spot missed opens, weak defenses, and costly postflop leaks. Build a clearer improvement plan with Playback Poker.";

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

export default function PokerLeakFinderPage() {
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
      name: "Playback Poker Leak Finder",
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

    upsertJsonLdScript("seo-schema-faq-poker-leak-finder", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What leaks can a poker hand audit uncover?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Hand audits can highlight missed open opportunities, weak defenses versus opens, low-EV calls, and missed pressure or value-bet spots.",
          },
        },
        {
          "@type": "Question",
          name: "How should I review leaks after a session?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Start with high-impact hands, group repeated mistakes, and focus your next study block on the most frequent decision errors first.",
          },
        },
        {
          "@type": "Question",
          name: "Does this work for tournament and cash reviews?",
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
          <p className="marketing-kicker">Poker Leak Finder</p>
          <h1 className="marketing-title">Find Your Biggest Poker Leaks Faster</h1>
          <p className="marketing-subtitle">
            Playback Poker runs structured hand audits to surface missed opens,
            defense gaps, and postflop opportunities so your next session starts
            with clear adjustments.
          </p>
          <div className="marketing-proof-row">
            <span className="marketing-pill">Missed open detection</span>
            <span className="marketing-pill">Defense leak spotting</span>
            <span className="marketing-pill">Postflop opportunity audits</span>
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
            <span className="learning-story-stat-label">Focus</span>
            <strong>Repeated mistakes</strong>
          </div>
          <p className="learning-story-aside-copy">
            Designed to turn patterns into practical study priorities, not
            vague advice or overconfident solver claims.
          </p>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>What Gets Audited</h2>
        <div className="marketing-grid">
          <article className="marketing-card">
            <h3>Preflop Open Opportunities</h3>
            <p>
              Surface spots where you passed profitable open opportunities or
              entered pots with weaker-than-ideal ranges.
            </p>
          </article>
          <article className="marketing-card">
            <h3>Defense And Pressure Decisions</h3>
            <p>
              Identify under-defends versus opens and missed opportunities to
              3-bet, isolate, or apply pressure at the right stack depths.
            </p>
          </article>
          <article className="marketing-card">
            <h3>Postflop Execution Leaks</h3>
            <p>
              Flag passive lines, missed value bets, and costly low-EV calls so
              you can tighten decisions by street.
            </p>
          </article>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>How To Use Results</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>1. Prioritize recurring errors</h3>
            <p>
              Start with repeated mistakes before one-off weird hands so your
              study time compounds faster.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>2. Focus on highest-leverage spots</h3>
            <p>
              Review large pots, all-ins, and uncertain lines first to capture
              the biggest decision quality gains.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>3. Track one leak theme per block</h3>
            <p>
              Improve faster by isolating one correction theme at a time across
              multiple sessions.
            </p>
          </article>
        </div>
      </section>

      <section className="home-section learning-story-section">
        <h2>FAQ</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>What are common low-stakes MTT leaks?</h3>
            <p>
              Missed opens, poor defend frequencies, and passive postflop lines
              are common and usually repeat across many sessions.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Can I use this for GGPoker reviews?</h3>
            <p>
              Yes. GGPoker is supported for both tournament and cash uploads.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Does this also support PokerStars uploads?</h3>
            <p>
              Yes. PokerStars is supported for both tournament and cash uploads.
            </p>
          </article>
        </div>
      </section>
    </MarketingSiteShell>
  );
}
