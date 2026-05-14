import { useEffect } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";

const PAGE_PATH = "/poker-session-review";
const PAGE_TITLE = "Poker Session Review | Playback Poker";
const PAGE_DESCRIPTION =
  "Review poker sessions with parsed uploads, ranked hands, and focused leak identification. Build a consistent post-session study routine with Playback Poker.";

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

export default function PokerSessionReviewPage() {
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
      name: "Playback Poker Session Review",
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

    upsertJsonLdScript("seo-schema-faq-poker-session-review", {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What should I review first after a poker session?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Start with large pots, all-ins, and uncertain spots, then move to recurring decision patterns that show up across sessions.",
          },
        },
        {
          "@type": "Question",
          name: "How do I build a consistent session review routine?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Use a repeatable flow: parse uploads, rank key spots, audit recurring leaks, and carry one improvement theme into your next play block.",
          },
        },
        {
          "@type": "Question",
          name: "Which uploads are supported today?",
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
        <p className="marketing-kicker">Poker Session Review</p>
        <h1 className="marketing-title">
          Turn Every Session Into A Clear Improvement Plan
        </h1>
        <p className="marketing-subtitle">
          Playback Poker gives you a structured review flow: parse your upload,
          rank hands by impact, and identify repeat leak themes before your next
          session starts.
        </p>
        <div className="marketing-proof-row">
          <span className="marketing-pill">Session parsing workflow</span>
          <span className="marketing-pill">Ranked review queue</span>
          <span className="marketing-pill">Recurring leak themes</span>
        </div>
        <a className="auth-button marketing-cta-button" href="/">
          Start Free Hand Review
        </a>
      </section>

      <section className="panel">
        <h2>Session Review Framework</h2>
        <div className="marketing-grid">
          <article className="marketing-card">
            <h3>1. Parse And Organize</h3>
            <p>
              Upload your hands and convert raw logs into a consistent review
              format.
            </p>
          </article>
          <article className="marketing-card">
            <h3>2. Prioritize Key Spots</h3>
            <p>
              Focus first on hands with the highest leverage so review time is
              spent where it matters most.
            </p>
          </article>
          <article className="marketing-card">
            <h3>3. Carry Corrections Forward</h3>
            <p>
              Translate leak themes into one or two tactical adjustments for
              your next session.
            </p>
          </article>
        </div>
      </section>

      <section className="panel">
        <h2>FAQ</h2>
        <div className="marketing-faq-grid">
          <article className="marketing-faq-item">
            <h3>How long should session review take?</h3>
            <p>
              A focused pass on ranked high-impact spots is usually more
              valuable than reviewing every hand line by line.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Can I use this for both tournament and cash sessions?</h3>
            <p>
              Yes. Tournament uploads support GGPoker and PokerStars. Cash
              uploads currently support GGPoker.
            </p>
          </article>
          <article className="marketing-faq-item">
            <h3>Is AI required for session review?</h3>
            <p>
              No. Parsing, ranking, and spot identification provide the core
              review value. AI support can be used when you want deeper context.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
