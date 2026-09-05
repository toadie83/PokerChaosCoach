import { SignUpButton, useAuth } from "@clerk/react";
import { useEffect, useMemo, useState } from "react";

import {
  requestFreeStudyPlan,
  requestLearningResources,
} from "../../api/aiService.js";
import { trackProductEvent } from "../../lib/analytics.js";
import {
  FREE_STUDY_PLAN_ALLOWANCE_KEY,
  loadFreeStudyPlanAllowance,
  recordFreeStudyPlanUse,
  saveFreeStudyPlanResult,
} from "../../lib/freeStudyPlanSession.js";
import MarketingSiteShell from "./MarketingSiteShell.jsx";
import DailyMttEdge from "./homepage/DailyMttEdge.jsx";
import FinalCTA from "./homepage/FinalCTA.jsx";
import HomeHero from "./homepage/HomeHero.jsx";
import HowItWorks from "./homepage/HowItWorks.jsx";
import LearningShowcase from "./homepage/LearningShowcase.jsx";
import StudyPlanPreview from "./homepage/StudyPlanPreview.jsx";
import TournamentAnalysisProgress from "./homepage/TournamentAnalysisProgress.jsx";
import TournamentReviewUpsell from "./homepage/TournamentReviewUpsell.jsx";
import TournamentReviewModal from "./homepage/TournamentReviewModal.jsx";
import TournamentUpload from "./homepage/TournamentUpload.jsx";
import TrustSection from "./homepage/TrustSection.jsx";
import {
  PRODUCT_LOOP_STEPS,
  STUDY_PREVIEW_SPOTS,
  TOURNAMENT_ANALYSIS_STEPS,
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
  const [freeAnalysisStatus, setFreeAnalysisStatus] = useState("idle");
  const [freeAnalysisStep, setFreeAnalysisStep] = useState(0);
  const [freeAnalysisError, setFreeAnalysisError] = useState("");
  const [freeServerLimitReached, setFreeServerLimitReached] = useState(false);
  const [freePlanAllowance, setFreePlanAllowance] = useState(
    () => loadFreeStudyPlanAllowance(),
  );
  const [tournamentReviewModalOpen, setTournamentReviewModalOpen] = useState(false);

  useEffect(() => {
    setHomeMeta();
  }, []);

  useEffect(() => {
    const syncAllowance = (event) => {
      if (event.key === FREE_STUDY_PLAN_ALLOWANCE_KEY) {
        setFreePlanAllowance(loadFreeStudyPlanAllowance());
      }
    };
    window.addEventListener("storage", syncAllowance);
    return () => window.removeEventListener("storage", syncAllowance);
  }, []);

  useEffect(() => {
    if (freeAnalysisStatus !== "analysing") return undefined;
    const timer = window.setInterval(() => {
      setFreeAnalysisStep((current) => Math.min(3, current + 1));
    }, 1600);
    return () => window.clearInterval(timer);
  }, [freeAnalysisStatus]);

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

  const reviewAction = (className, label = "Try Tournament Review") =>
    isSignedIn ? (
      <a className={className} href="/tools/tournament-review">{label}</a>
    ) : (
      <button type="button" className={className} onClick={() => setTournamentReviewModalOpen(true)}>{label}</button>
    );

  const runFreeAnalysis = async ({ file, heroName }) => {
    const currentAllowance = loadFreeStudyPlanAllowance();
    if (currentAllowance.limitReached) {
      setFreePlanAllowance(currentAllowance);
      setFreeAnalysisError("Your three complimentary homepage plans have been used. Register to continue with Study Spots.");
      return;
    }
    setFreeAnalysisError("");
    setFreeServerLimitReached(false);
    setFreeAnalysisStep(0);
    setFreeAnalysisStatus("analysing");
    trackProductEvent("study_spots_upload_started", {
      upload_method: "homepage_public",
    });
    try {
      const historyText = await file.text();
      const result = await requestFreeStudyPlan({
        historyText,
        heroName,
        tournamentName: file.name.replace(/\.txt$/i, ""),
        uploadSource: "public_homepage",
      });
      setFreeAnalysisStep(4);
      saveFreeStudyPlanResult(result);
      setFreePlanAllowance(recordFreeStudyPlanUse());
      trackProductEvent("study_spots_analysis_completed", {
        hand_count: result?.report?.handsAnalysed,
        candidate_count: result?.report?.candidateCount,
        spot_count: result?.report?.spotCount,
      });
      window.setTimeout(() => window.location.assign("/free-study-plan"), 350);
    } catch (error) {
      trackProductEvent(
        ["MALFORMED_UPLOAD", "UNSUPPORTED_FORMAT", "NO_TOURNAMENT_HANDS", "MULTIPLE_TOURNAMENTS"].includes(error?.code)
          ? "study_spots_parse_failed"
          : "study_spots_analysis_failed",
        {
          error_code: error?.code || "UNKNOWN",
          upload_method: "homepage_public",
        },
      );
      if (error?.code === "FREE_ANALYSIS_LIMIT_REACHED") {
        setFreeServerLimitReached(true);
        setFreeAnalysisError("");
        setFreeAnalysisStatus("idle");
        return;
      }
      setFreeAnalysisError(error?.message || "Your free Study Plan could not be completed.");
      setFreeAnalysisStatus("idle");
    }
  };

  const freePlanLimitAction = isSignedIn ? (
    <a className="home-v2-button home-v2-button-primary" href="/tools/study-spots">
      Open registered Study Spots
    </a>
  ) : (
    <SignUpButton mode="modal">
      <button className="home-v2-button home-v2-button-primary" type="button">
        Register for free Study Spots
      </button>
    </SignUpButton>
  );

  return (
    <MarketingSiteShell
      currentPath="/"
      pageClassName="home-v2"
      headerCtaLabel="Upload Tournament Free"
      headerCtaHref="/#upload"
    >
      <HomeHero
        upload={
          <TournamentUpload
            onSubmit={runFreeAnalysis}
            busy={freeAnalysisStatus === "analysing"}
            error={freeAnalysisError}
            allowance={{
              ...freePlanAllowance,
              limitReached: freePlanAllowance.limitReached || freeServerLimitReached,
            }}
            limitAction={freePlanLimitAction}
          />
        }
      />

      <section className="home-v2-section home-v2-result" id="study-plan">
        <span className="home-v2-anchor" id="tools" />
        <div className="home-v2-section-heading home-v2-section-heading-split">
          <div>
            <p className="home-v2-kicker">Your free Study Plan</p>
            <h2>Know exactly what deserves your attention.</h2>
          </div>
          <p>Free users receive a personalised preview with 2–3 high-value decisions and the lessons that explain them.</p>
        </div>
        <div className="home-v2-result-grid">
          <StudyPlanPreview spots={STUDY_PREVIEW_SPOTS} />
          <TournamentReviewUpsell
            action={reviewAction("home-v2-button home-v2-button-gold", "Explore Tournament Review")}
          />
        </div>
      </section>

      <HowItWorks steps={PRODUCT_LOOP_STEPS} />
      <LearningShowcase resources={featuredResources} status={learningStatus} />
      <DailyMttEdge latestLesson={latestDailyLesson} />
      <TrustSection links={TRUST_LINKS} />
      <FinalCTA
        primaryAction={<a className="home-v2-button home-v2-button-primary" href="/#upload">Upload a Tournament Free</a>}
        secondaryAction={<a className="home-v2-button home-v2-button-secondary" href="/learn">Explore the Learning Library</a>}
      />
      {freeAnalysisStatus === "analysing" ? (
        <div className="home-v2-analysis-overlay" role="dialog" aria-modal="true" aria-label="Building your free Study Plan">
          <div className="home-v2-analysis-modal">
            <TournamentAnalysisProgress
              steps={TOURNAMENT_ANALYSIS_STEPS}
              activeIndex={freeAnalysisStep}
            />
            <p>Keep this page open. Your results will appear automatically when the analysis is complete.</p>
          </div>
        </div>
      ) : null}
      <TournamentReviewModal
        open={tournamentReviewModalOpen}
        onClose={() => setTournamentReviewModalOpen(false)}
      />
    </MarketingSiteShell>
  );
}
