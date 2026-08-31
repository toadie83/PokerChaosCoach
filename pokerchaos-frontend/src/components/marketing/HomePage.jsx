import { SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";

import { requestLearningResources } from "../../api/aiService.js";
import MarketingSiteShell from "./MarketingSiteShell.jsx";
import DailyMttEdge from "./homepage/DailyMttEdge.jsx";
import FinalCTA from "./homepage/FinalCTA.jsx";
import HomeHero from "./homepage/HomeHero.jsx";
import HowItWorks from "./homepage/HowItWorks.jsx";
import LearningShowcase from "./homepage/LearningShowcase.jsx";
import SeoLinkGrid from "./homepage/SeoLinkGrid.jsx";
import ToolComparison from "./homepage/ToolComparison.jsx";
import ToolSelector from "./homepage/ToolSelector.jsx";
import TrustSection from "./homepage/TrustSection.jsx";
import {
  PRODUCT_LOOP_STEPS,
  SEO_LINKS,
  STUDY_PREVIEW_SPOTS,
  TOOL_COMPARISON_ROWS,
  TRUST_LINKS,
  selectHomepageLearningResources,
} from "./homepage/homepageData.js";
import "./homepage/homepage-v2.css";

const PAGE_TITLE = "Playback Poker | MTT Study Spots and Tournament Review";
const PAGE_DESCRIPTION =
  "Upload a tournament poker hand history, find the decisions most worth studying, and connect your real MTT spots to practical lessons and deeper tournament review.";

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
    audience: { "@type": "Audience", audienceType: "Tournament poker players" },
    featureList: [
      "Tournament hand history analysis",
      "Ranked MTT Study Spots",
      "LearningResource matching",
      "Detailed tournament review",
    ],
  });
}

export default function HomePage() {
  const { isSignedIn } = useAuth();
  const [learningResources, setLearningResources] = useState([]);
  const [learningStatus, setLearningStatus] = useState("loading");

  useEffect(() => {
    setHomeMeta();
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestLearningResources()
      .then((payload) => {
        if (cancelled) return;
        setLearningResources(payload?.resources || []);
        setLearningStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLearningStatus("error");
      });
    return () => { cancelled = true; };
  }, []);

  const featuredResources = useMemo(
    () => selectHomepageLearningResources(learningResources),
    [learningResources],
  );
  const latestDailyLesson = useMemo(
    () => learningResources.find((resource) => String(resource?.series || "").toLowerCase().includes("daily mtt edge")) || null,
    [learningResources],
  );

  const studyAction = (className, label = "Find My Study Spots - Free") =>
    isSignedIn ? (
      <a className={className} href="/tools/study-spots">{label}</a>
    ) : (
      <SignUpButton mode="modal">
        <button type="button" className={className}>{label}</button>
      </SignUpButton>
    );

  const reviewAction = (className, label = "Try Tournament Review") =>
    isSignedIn ? (
      <a className={className} href="/tools/tournament-review">{label}</a>
    ) : (
      <SignUpButton mode="modal">
        <button type="button" className={className}>{label}</button>
      </SignUpButton>
    );

  return (
    <MarketingSiteShell currentPath="/" pageClassName="home-v2">
      <HomeHero
        spots={STUDY_PREVIEW_SPOTS}
        primaryAction={studyAction("home-v2-button home-v2-button-primary")}
        secondaryAction={<a className="home-v2-button home-v2-button-secondary" href="#how-it-works">Explore Playback Poker</a>}
      />
      <HowItWorks steps={PRODUCT_LOOP_STEPS} />
      <ToolSelector
        studyAction={studyAction("home-v2-button home-v2-button-primary", "Find my Study Spots")}
        reviewAction={reviewAction("home-v2-button home-v2-button-secondary")}
      />
      <LearningShowcase resources={featuredResources} status={learningStatus} />
      <DailyMttEdge latestLesson={latestDailyLesson} />
      <div className="home-v2-depth">
        <ToolComparison rows={TOOL_COMPARISON_ROWS} />
        <TrustSection links={TRUST_LINKS} />
      </div>
      <SeoLinkGrid links={SEO_LINKS} />
      <FinalCTA
        primaryAction={studyAction("home-v2-button home-v2-button-primary")}
        secondaryAction={<a className="home-v2-button home-v2-button-secondary" href="/learn">Explore the Learning Library</a>}
      />
    </MarketingSiteShell>
  );
}
