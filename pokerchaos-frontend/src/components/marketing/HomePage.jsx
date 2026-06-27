import { SignUpButton, useAuth } from "@clerk/react";
import { useEffect } from "react";
import MarketingSiteShell from "./MarketingSiteShell.jsx";
import FinalCTA from "./homepage/FinalCTA.jsx";
import FeatureCards from "./homepage/FeatureCards.jsx";
import HomeHero from "./homepage/HomeHero.jsx";
import HowItWorks from "./homepage/HowItWorks.jsx";
import ProductPreview from "./homepage/ProductPreview.jsx";
import SeoLinkGrid from "./homepage/SeoLinkGrid.jsx";
import SupportedSites from "./homepage/SupportedSites.jsx";
import TrustSection from "./homepage/TrustSection.jsx";
import {
  HERO_TRUST_MARKERS,
  HOW_IT_WORKS_STEPS,
  PRODUCT_PREVIEW_NOTES,
  PROBLEM_CARDS,
  SEO_LINKS,
  SUPPORTED_FORMATS,
  SUPPORTED_SITES,
  TRUST_LINKS,
  USE_CASE_CARDS,
} from "./homepage/homepageData.js";

const HERO_IMAGE_SRC = "/images/homepage-poker-chip.png";
const PAGE_TITLE = "Playback Poker | Review Poker Hands in Minutes";
const PAGE_DESCRIPTION =
  "Upload GGPoker or PokerStars hand histories and get clear AI-powered poker reviews with street-by-street feedback, leak spotting, and practical study takeaways.";

function upsertMetaTag({ name, property, content }) {
  const selector = name
    ? `meta[name="${name}"]`
    : `meta[property="${property}"]`;
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

function setHomeMeta() {
  const pageUrl = `${window.location.origin}/`;

  document.title = PAGE_TITLE;
  upsertMetaTag({ name: "description", content: PAGE_DESCRIPTION });
  upsertMetaTag({ name: "robots", content: "index,follow" });
  upsertMetaTag({ property: "og:title", content: PAGE_TITLE });
  upsertMetaTag({ property: "og:description", content: PAGE_DESCRIPTION });
  upsertMetaTag({ property: "og:type", content: "website" });
  upsertMetaTag({ property: "og:url", content: pageUrl });
  upsertMetaTag({ property: "og:site_name", content: "Playback Poker" });
  upsertCanonicalTag(pageUrl);
  upsertJsonLdScript("seo-schema-homepage", {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Playback Poker",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web",
    url: pageUrl,
    description: PAGE_DESCRIPTION,
  });
}

export default function HomePage() {
  const { isSignedIn } = useAuth();

  useEffect(() => {
    setHomeMeta();
  }, []);

  const reviewAction = (className, label = "Review a Hand") =>
    isSignedIn ? (
      <a className={className} href="/review">
        {label}
      </a>
    ) : (
      <SignUpButton mode="modal">
        <button type="button" className={className}>
          {label}
        </button>
      </SignUpButton>
    );

  return (
    <MarketingSiteShell currentPath="/">
        <HomeHero
          imageSrc={HERO_IMAGE_SRC}
          trustMarkers={HERO_TRUST_MARKERS}
          primaryAction={reviewAction("home-button home-button-primary")}
          secondaryAction={
            <a
              className="home-button home-button-secondary"
              href="#how-it-works"
            >
              See How It Works
            </a>
          }
        />

        <FeatureCards
          id="problem"
          eyebrow="Why this exists"
          title="Poker study is too slow for most players."
          cards={PROBLEM_CARDS}
        />

        <HowItWorks
          steps={HOW_IT_WORKS_STEPS}
          primaryAction={reviewAction("home-button home-button-primary")}
        />

        <ProductPreview notes={PRODUCT_PREVIEW_NOTES} />

        <FeatureCards
          id="use-cases"
          eyebrow="Use cases"
          title="Built for the hands you keep thinking about."
          cards={USE_CASE_CARDS}
          compact
        />

        <SupportedSites sites={SUPPORTED_SITES} formats={SUPPORTED_FORMATS} />

        <TrustSection links={TRUST_LINKS} />

        <SeoLinkGrid links={SEO_LINKS} />

        <FinalCTA
          primaryAction={reviewAction("home-button home-button-primary")}
          secondaryAction={
            <a
              className="home-button home-button-secondary"
              href="/methodology"
            >
              Read the Methodology
            </a>
          }
        />
    </MarketingSiteShell>
  );
}
