import { useEffect } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";

const PAGE_PATH = "/ggpoker-hand-review-tool";
const PAGE_TITLE = "GGPoker Hand Review Tool | Playback Poker";
const PAGE_DESCRIPTION =
  "Review GGPoker tournament and cash hand histories with AI feedback. Spot leaks faster and run structured post-session study in Playback Poker.";

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

export default function GgPokerHandReviewToolPage() {
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
      name: "Playback Poker GGPoker Hand Review Tool",
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

    upsertJsonLdScript("seo-schema-faq-ggpoker-hand-review-tool", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Can I review GGPoker tournament hand histories?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Tournament uploads support GGPoker and PokerStars.",
          },
        },
        {
          "@type": "Question",
          name: "Does the tool support GGPoker cash hand uploads?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Cash uploads currently support GGPoker, with more rooms planned.",
          },
        },
        {
          "@type": "Question",
          name: "What should I review first after a GGPoker session?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Start with the highest-leverage decisions: large pots, all-ins, and spots where your line changed because of uncertainty.",
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
        <p className="marketing-kicker">GGPoker Hand Review Tool</p>
        <h1 className="marketing-title">Review GGPoker Hands With AI</h1>
        <p className="marketing-subtitle">
          Upload GGPoker hand histories and run tactical AI review across
          preflop and postflop decisions. Find recurring leaks and build a
          sharper post-session study loop.
        </p>
        <div className="marketing-proof-row">
          <span className="marketing-pill">GGPoker tournament support</span>
          <span className="marketing-pill">GGPoker cash support</span>
          <span className="marketing-pill">Leak-focused analysis</span>
        </div>
        <a className="auth-button marketing-cta-button" href="/">
          Start Free Hand Review
        </a>
      </section>

      <section className="panel">
        <h2>How It Works</h2>
        <div className="marketing-grid">
          <article className="marketing-card">
            <h3>1. Upload GGPoker Hands</h3>
            <p>
              Bring in tournament or cash hand histories and organize your
              review around high-impact decisions.
            </p>
          </article>
          <article className="marketing-card">
            <h3>2. Run AI Hand Review</h3>
            <p>
              Break down your action sequence by street to spot errors in
              ranges, sizing, and overall line selection.
            </p>
          </article>
          <article className="marketing-card">
            <h3>3. Turn Leaks Into A Study Plan</h3>
            <p>
              Convert repeated mistakes into a focused queue so every session
              feeds into measurable skill improvement.
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>FAQ</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>Can I use this for GGPoker tournaments?</h3>
            <p>
              Yes. Tournament uploads support GGPoker and PokerStars right now.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Can I review GGPoker cash hands too?</h3>
            <p>
              Yes. Cash uploads currently support GGPoker, with more rooms
              coming soon.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>What is the fastest way to improve from session review?</h3>
            <p>
              Start with largest pots and uncertain decisions, then track the
              same leak categories over multiple sessions.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
