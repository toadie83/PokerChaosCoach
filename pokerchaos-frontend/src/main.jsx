import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from "@clerk/react";
import ReviewApp from "./ReviewApp.jsx";
import AboutModal from "./components/AboutModal.jsx";
import PokerCoachPlaceholder from "./components/PokerCoachPlaceholder.jsx";
import MyStudyPage from "./components/MyStudyPage.jsx";
import MyTournamentsPage from "./components/MyTournamentsPage.jsx";
import StudyReportPage from "./components/StudyReportPage.jsx";
import StudySpotsEntryPage from "./components/StudySpotsEntryPage.jsx";
import ToolsHub from "./components/ToolsHub.jsx";
import AdminLearningPage from "./components/AdminLearningPage.jsx";
import HomePage from "./components/marketing/HomePage.jsx";
import FreeStudyPlanPage from "./components/marketing/FreeStudyPlanPage.jsx";
import FreeUploadPrivacyPage from "./components/marketing/FreeUploadPrivacyPage.jsx";
import AiPokerHandAnalyzerPage from "./components/marketing/AiPokerHandAnalyzerPage.jsx";
import GgPokerHandReviewToolPage from "./components/marketing/GgPokerHandReviewToolPage.jsx";
import PokerLeakFinderPage from "./components/marketing/PokerLeakFinderPage.jsx";
import MttHandReviewSoftwarePage from "./components/marketing/MttHandReviewSoftwarePage.jsx";
import TournamentHandAnalysisPage from "./components/marketing/TournamentHandAnalysisPage.jsx";
import PokerSessionReviewPage from "./components/marketing/PokerSessionReviewPage.jsx";
import ArticleHubPage from "./components/marketing/ArticleHubPage.jsx";
import LearningLibraryPage from "./components/marketing/LearningLibraryPage.jsx";
import LearningResourcePage from "./components/marketing/LearningResourcePage.jsx";
import ArticleDraftPage from "./components/marketing/ArticleDraftPage.jsx";
import TrustMethodologyBanner from "./components/marketing/TrustMethodologyBanner.jsx";
import {
  ARTICLE_CATALOG,
  buildArticlePath,
} from "./components/marketing/articleCatalog.js";
import TrustPageDraft from "./components/marketing/TrustPageDraft.jsx";
import { TRUST_PAGE_CATALOG } from "./components/marketing/trustCatalog.js";
import {
  requestBillingCheckoutSession,
  requestBillingPortalSession,
  requestEntitlements,
} from "./api/aiService.js";
import { initAnalytics, trackPageView } from "./lib/analytics.js";
import { pingHealth, setAuthTokenFetcher } from "./lib/api.js";
import {
  CAPABILITY_KEYS,
  canAccessCapability,
  getCapabilityState,
} from "./lib/capabilities.js";
import {
  DEFAULT_AUTH_ROUTE,
  normalizeAppRoutePath,
} from "./lib/appRoutes.js";
import PlaybackBrand from "./components/PlaybackBrand.jsx";
import "./styles.css";
import "./study-spots.css";
import "./learning-library.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const DEFAULT_ROUTE = DEFAULT_AUTH_ROUTE;
const ABOUT_SEEN_STORAGE_KEY = "pcc_about_seen";
const TRIAL_TOKENS_UPDATED_EVENT = "pcc:trial-tokens-updated";
const SPA_ROUTE_CHANGE_EVENT = "pcc:spa-route-change";
const LOCAL_LIVE_STREAM_URL = "/livestream/index.html";
const SHOW_LOCAL_LIVE_STREAM = import.meta.env.DEV;
const CoachApp = React.lazy(() => import("./App.jsx"));

function PokerCoachRoute({ entitlements }) {
  return canAccessCapability(entitlements, CAPABILITY_KEYS.COACH) ? (
    <React.Suspense fallback={<p className="study-loading">Loading Coach...</p>}>
      <CoachApp />
    </React.Suspense>
  ) : (
    <PokerCoachPlaceholder />
  );
}
const MARKETING_PAGE_CONFIG = [
  {
    path: "/",
    component: HomePage,
  },
  {
    path: "/free-study-plan",
    component: FreeStudyPlanPage,
  },
  {
    path: "/free-upload-privacy",
    component: FreeUploadPrivacyPage,
  },
  {
    path: "/ai-poker-hand-analyzer",
    component: AiPokerHandAnalyzerPage,
  },
  {
    path: "/ggpoker-hand-review-tool",
    component: GgPokerHandReviewToolPage,
  },
  {
    path: "/poker-leak-finder",
    component: PokerLeakFinderPage,
  },
  {
    path: "/mtt-hand-review-software",
    component: MttHandReviewSoftwarePage,
  },
  {
    path: "/tournament-hand-analysis",
    component: TournamentHandAnalysisPage,
  },
  {
    path: "/poker-session-review",
    component: PokerSessionReviewPage,
  },
  {
    path: "/articles",
    component: ArticleHubPage,
  },
  {
    path: "/learn",
    component: LearningLibraryPage,
  },
  ...TRUST_PAGE_CATALOG.map((page) => ({
    path: page.path,
    component: () => <TrustPageDraft path={page.path} />,
  })),
  ...ARTICLE_CATALOG.map((article) => ({
    path: buildArticlePath(article.slug),
    component: () => <ArticleDraftPage slug={article.slug} />,
  })),
];
const DYNAMIC_MARKETING_PAGE_CONFIG = [
  {
    prefix: "/learn",
    component: LearningResourcePage,
  },
];
const SECTION_CONFIG = [
  {
    path: "/tools",
    label: "Tools",
    component: ToolsHub,
  },
  {
    path: "/tools/study-spots",
    label: "Find Study Spots",
    capability: CAPABILITY_KEYS.STUDY_SPOTS,
    component: StudySpotsEntryPage,
    lockedText: "Study Spots is unavailable for this account.",
  },
  {
    path: "/tools/tournament-review",
    label: "Tournament Review",
    capability: CAPABILITY_KEYS.TOURNAMENT_REVIEW,
    component: ReviewApp,
    lockedText:
      "Tournament Review requires an active trial or Tier 1 access.",
  },
  {
    path: "/tools/coach",
    label: "Poker Coach",
    capability: CAPABILITY_KEYS.COACH,
    component: PokerCoachRoute,
    viewableWhenDisabled: true,
  },
  {
    path: "/tournaments",
    label: "My Tournaments",
    capability: CAPABILITY_KEYS.STUDY_SPOTS,
    component: MyTournamentsPage,
  },
  {
    path: "/study",
    label: "My Study",
    capability: CAPABILITY_KEYS.STUDY_SPOTS,
    component: MyStudyPage,
  },
  {
    path: "/admin/learning",
    label: "Learning Admin",
    adminOnly: true,
    component: AdminLearningPage,
    lockedText: "Administrator access is required.",
  },
  {
    path: "/admin/learning/import",
    label: "Lesson Import",
    importerOnly: true,
    component: AdminLearningPage,
    lockedText: "Learning import access is required.",
  },
];
const DYNAMIC_SECTION_CONFIG = [
  {
    prefix: "/tools/study-spots/reports",
    label: "Study Report",
    capability: CAPABILITY_KEYS.STUDY_SPOTS,
    component: StudyReportPage,
  },
  {
    prefix: "/admin/learning",
    label: "Learning Admin",
    adminOnly: true,
    component: AdminLearningPage,
    lockedText: "Administrator access is required.",
  },
];
const ROUTE_LOOKUP = new Map(SECTION_CONFIG.map((item) => [item.path, item]));
const MARKETING_ROUTE_LOOKUP = new Map(
  MARKETING_PAGE_CONFIG.map((item) => [item.path, item]),
);

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

function setPageMeta({ title, description, path }) {
  const normalizedPath = path?.startsWith("/") ? path : "/";
  const pageUrl = `${window.location.origin}${normalizedPath}`;

  document.title = title;
  upsertMetaTag({ name: "description", content: description });
  upsertMetaTag({ name: "robots", content: "index,follow" });
  upsertMetaTag({ property: "og:title", content: title });
  upsertMetaTag({ property: "og:description", content: description });
  upsertMetaTag({ property: "og:type", content: "website" });
  upsertMetaTag({ property: "og:url", content: pageUrl });
  upsertMetaTag({ property: "og:site_name", content: "Playback Poker" });
  upsertCanonicalTag(pageUrl);
}

function normalizeMarketingPath(pathname) {
  const raw = typeof pathname === "string" ? pathname.trim() : "";
  if (!raw) return "/";
  const normalized = raw.replace(/\/+$/, "") || "/";
  return resolveMarketingPage(normalized) ? normalized : null;
}

function resolveMarketingPage(pathname) {
  const exact = MARKETING_ROUTE_LOOKUP.get(pathname);
  if (exact) return exact;
  return (
    DYNAMIC_MARKETING_PAGE_CONFIG.find(
      (page) =>
        pathname?.startsWith(`${page.prefix}/`) &&
        pathname.length > page.prefix.length + 1,
    ) || null
  );
}

function normalizeRoutePath(pathname) {
  return normalizeAppRoutePath(pathname, {
    authenticatedPaths: Array.from(ROUTE_LOOKUP.keys()),
    authenticatedPrefixes: DYNAMIC_SECTION_CONFIG.map((item) => item.prefix),
    marketingPaths: Array.from(MARKETING_ROUTE_LOOKUP.keys()),
    marketingPrefixes: DYNAMIC_MARKETING_PAGE_CONFIG.map((item) => item.prefix),
  });
}

function resolveSectionConfig(pathname) {
  const exact = ROUTE_LOOKUP.get(pathname);
  if (exact) return exact;
  return (
    DYNAMIC_SECTION_CONFIG.find((section) =>
      pathname.startsWith(`${section.prefix}/`),
    ) || SECTION_CONFIG[0]
  );
}

function useAppRoute() {
  const [routePath, setRoutePath] = useState(() =>
    normalizeRoutePath(window.location.pathname),
  );

  useEffect(() => {
    const initial = normalizeRoutePath(window.location.pathname);
    if (initial !== window.location.pathname) {
      window.history.replaceState({}, "", initial);
    }
    setRoutePath(initial);

    const handlePopState = () => {
      setRoutePath(normalizeRoutePath(window.location.pathname));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback(
    (nextPath, { replace = false } = {}) => {
      const normalized = normalizeRoutePath(nextPath);
      if (normalized === routePath) return;
      if (replace) window.history.replaceState({}, "", normalized);
      else window.history.pushState({}, "", normalized);
      setRoutePath(normalized);
    },
    [routePath],
  );

  return { routePath, navigate };
}

function EntitlementGateCard({ title, detail, actionLabel, onAction }) {
  return (
    <div className="wrap">
      <div className="panel feature-gate-card">
        <h1 className="title">{title}</h1>
        <p className="sub">{detail}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="feature-gate-button"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function hasSeenAboutModal() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(ABOUT_SEEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markAboutModalSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(ABOUT_SEEN_STORAGE_KEY, "1");
  } catch {}
}

function TrialInfoModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal trial-info-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">About Trial AI Tokens</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p>
            New users receive <strong>100,000 trial AI tokens</strong>, which is
            approximately <strong>20 AI reviews</strong> based on typical usage.
          </p>
          <p>
            After trial credits are used, AI features move to a paid plan to
            support API costs and server maintenance.
          </p>
          <p>All non-AI features remain free forever.</p>
          <p>Thank You for trying out the PlaybackPoker service!</p>
          <p>-- Trev</p>
        </div>
      </div>
    </div>
  );
}

function DisclaimerModal({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal trial-info-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Disclaimer</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p>
            Training insights are informational and should be used at your own
            discretion. Hand-history input is not saved for model training.
          </p>
        </div>
      </div>
    </div>
  );
}

function AppFooter({ onOpenAbout, onOpenDisclaimer }) {
  return (
    <footer className="app-footer">
      <div className="app-shell-container app-footer-inner">
        <PlaybackBrand variant="mark" className="app-footer-brand" aria-hidden="true" />
        <a
          href="/disclaimer"
          className="app-footer-link"
          onClick={(event) => {
            event.preventDefault();
            onOpenDisclaimer();
          }}
        >
          Disclaimer
        </a>
        <a
          href="/quick-tips"
          className="app-footer-link"
          onClick={(event) => {
            event.preventDefault();
            onOpenAbout();
          }}
        >
          Quick Tips
        </a>
        <a className="app-footer-link" href="/articles">
          Articles
        </a>
        <a className="app-footer-link" href="mailto:qacopilotdev@gmail.com">
          Contact me
        </a>
      </div>
    </footer>
  );
}

function MobileScrollTopWidget({ enabled }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    const handleScroll = () => {
      const threshold = window.innerHeight * 1.5;
      setVisible(window.scrollY > threshold);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [enabled]);

  if (!enabled || !visible) return null;

  return (
    <button
      type="button"
      className="mobile-scroll-top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Return to top"
    >
      Top
    </button>
  );
}

function SignedInShell() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { routePath, navigate } = useAppRoute();
  const marketingPage = resolveMarketingPage(routePath);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutPromptChecked, setAboutPromptChecked] = useState(false);
  const [entitlements, setEntitlements] = useState(null);
  const [entitlementsStatus, setEntitlementsStatus] = useState("loading"); // loading | ready | error
  const [entitlementsError, setEntitlementsError] = useState("");
  const [billingActionStatus, setBillingActionStatus] = useState("");
  const [billingActionLoading, setBillingActionLoading] = useState("");
  const [trialInfoOpen, setTrialInfoOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [mobileUtilityOpen, setMobileUtilityOpen] = useState(false);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", "light");
      window.localStorage?.setItem("pcc_theme", "light");
    } catch {}
  }, []);

  useEffect(() => {
    setMobileUtilityOpen(false);
  }, [routePath]);

  useEffect(() => {
    if (routePath === "/") {
      navigate(DEFAULT_ROUTE, { replace: true });
    }
  }, [navigate, routePath]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 641px)");
    const handleMediaChange = (event) => {
      if (event.matches) setMobileUtilityOpen(false);
    };
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAuthTokenFetcher(null);
      setAboutPromptChecked(false);
      setAboutOpen(false);
      return;
    }
    setAuthTokenFetcher(() => getToken());
    return () => setAuthTokenFetcher(null);
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || aboutPromptChecked) return;
    setAboutPromptChecked(true);
    if (!hasSeenAboutModal()) {
      setAboutOpen(true);
    }
  }, [aboutPromptChecked, isLoaded, isSignedIn]);

  const handleCloseAbout = useCallback(() => {
    markAboutModalSeen();
    setAboutOpen(false);
  }, []);

  const handleOpenAbout = useCallback(() => {
    setAboutOpen(true);
  }, []);

  const handleOpenTrialInfo = useCallback(() => {
    setTrialInfoOpen(true);
  }, []);

  const handleCloseTrialInfo = useCallback(() => {
    setTrialInfoOpen(false);
  }, []);
  const handleOpenDisclaimer = useCallback(() => {
    setDisclaimerOpen(true);
  }, []);
  const handleCloseDisclaimer = useCallback(() => {
    setDisclaimerOpen(false);
  }, []);

  const openBillingCheckout = useCallback(async () => {
    if (billingActionLoading) return;
    setBillingActionStatus("");
    setBillingActionLoading("checkout");
    try {
      const session = await requestBillingCheckoutSession({});
      const url = String(session?.url || "").trim();
      if (!url) {
        throw new Error("Checkout URL was not returned by the server.");
      }
      window.location.assign(url);
    } catch (error) {
      setBillingActionStatus(
        error?.message || "Failed to start upgrade checkout.",
      );
    } finally {
      setBillingActionLoading("");
    }
  }, [billingActionLoading]);

  const openBillingPortal = useCallback(async () => {
    if (billingActionLoading) return;
    setBillingActionStatus("");
    setBillingActionLoading("portal");
    try {
      const session = await requestBillingPortalSession({});
      const url = String(session?.url || "").trim();
      if (!url) {
        throw new Error("Billing portal URL was not returned by the server.");
      }
      window.location.assign(url);
    } catch (error) {
      setBillingActionStatus(
        error?.message || "Failed to open subscription portal.",
      );
    } finally {
      setBillingActionLoading("");
    }
  }, [billingActionLoading]);

  const loadEntitlements = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    setEntitlementsStatus("loading");
    setEntitlementsError("");
    try {
      const res = await requestEntitlements();
      setEntitlements(res);
      setEntitlementsStatus("ready");
    } catch (error) {
      setEntitlementsStatus("error");
      setEntitlementsError(error?.message || "Failed to load entitlements.");
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    loadEntitlements();
  }, [loadEntitlements]);

  useEffect(() => {
    const handleTrialTokenUpdate = (event) => {
      const nextRemaining = Number(event?.detail?.remainingTokens);
      if (!Number.isFinite(nextRemaining) || nextRemaining < 0) return;
      setEntitlements((previous) => {
        if (!previous || typeof previous !== "object") return previous;
        const billing = previous.billing || {};
        const trial = billing.trial || {};
        return {
          ...previous,
          billing: {
            ...billing,
            trial: {
              ...trial,
              remainingTokens: nextRemaining,
            },
          },
        };
      });
    };
    window.addEventListener(TRIAL_TOKENS_UPDATED_EVENT, handleTrialTokenUpdate);
    return () => {
      window.removeEventListener(
        TRIAL_TOKENS_UPDATED_EVENT,
        handleTrialTokenUpdate,
      );
    };
  }, []);

  const currentSection = resolveSectionConfig(routePath);
  const isScopedLearningManager = Boolean(
    entitlements?.features?.learningManager && !entitlements?.features?.admin,
  );
  const isScopedLearningImporter = Boolean(
    entitlements?.features?.learningImporter &&
      !entitlements?.features?.learningManager &&
      !entitlements?.features?.admin,
  );
  const canAccessSection = useCallback(
    (section) => {
      if (isScopedLearningManager) {
        return section?.path === "/admin/learning" ||
          section?.path === "/admin/learning/import" ||
          section?.prefix === "/admin/learning";
      }
      if (isScopedLearningImporter) {
        return section?.path === "/admin/learning/import";
      }
      return Boolean(
        section?.importerOnly
          ? entitlements?.features?.admin === true || entitlements?.features?.learningImporter === true
          : section?.adminOnly
            ? entitlements?.features?.admin === true
            : section?.viewableWhenDisabled ||
                !section?.capability ||
                canAccessCapability(entitlements, section.capability),
      );
    },
    [entitlements, isScopedLearningImporter, isScopedLearningManager],
  );
  const enabledSections = useMemo(
    () => SECTION_CONFIG.filter(canAccessSection),
    [canAccessSection],
  );
  const firstEnabledPath = enabledSections[0]?.path || DEFAULT_ROUTE;
  const canAccessCurrent = canAccessSection(currentSection);
  const hasActiveSubscription = Boolean(
    entitlements?.billing?.hasActiveSubscription,
  );
  const trialRemainingTokens = Number(
    entitlements?.billing?.trial?.remainingTokens || 0,
  );
  const SectionComponent = currentSection.component;

  useEffect(() => {
    if (marketingPage) return;
    if (routePath.startsWith("/admin/learning")) {
      setPageMeta({
        title: "Learning Admin | Playback Poker",
        description: "Restricted Learning Library resource management.",
        path: routePath,
      });
      return;
    }
    if (routePath === "/tools/coach") {
      const coachEnabled = canAccessCapability(
        entitlements,
        CAPABILITY_KEYS.COACH,
      );
      setPageMeta({
        title: "Poker Coach | Playback Poker",
        description: coachEnabled
          ? "Use Playback Poker's live decision coach and replay analysis tools."
          : "Personalised ongoing poker analysis and study guidance, coming later to Playback Poker.",
        path: "/tools/coach",
      });
      return;
    }

    if (routePath === "/tools/study-spots") {
      setPageMeta({
        title: "Find My Study Spots | Playback Poker",
        description:
          "Upload a poker tournament and find the decisions most worth studying.",
        path: "/tools/study-spots",
      });
      return;
    }

    if (routePath.startsWith("/tools/study-spots/reports/")) {
      setPageMeta({
        title: "Tournament Study Report | Playback Poker",
        description: "Review your ranked tournament study opportunities.",
        path: routePath,
      });
      return;
    }

    if (routePath === "/study" || routePath === "/tournaments") {
      setPageMeta({
        title: routePath === "/study" ? "My Study | Playback Poker" : "My Tournaments | Playback Poker",
        description:
          routePath === "/study"
            ? "Review saved poker study spots."
            : "Reopen saved tournament Study Reports.",
        path: routePath,
      });
      return;
    }

    if (routePath === "/tools") {
      setPageMeta({
        title: "Tools | Playback Poker",
        description: "Choose a Playback Poker tournament study tool.",
        path: "/tools",
      });
      return;
    }

    setPageMeta({
      title: "Tournament Review | Playback Poker",
      description:
        "Review tournament hands with AI-powered analysis to find leaks and improve MTT decisions.",
      path: "/tools/tournament-review",
    });
  }, [entitlements, marketingPage, routePath]);

  if (routePath === "/") return null;

  if (marketingPage) {
    const MarketingComponent = marketingPage.component;
    return (
      <>
        <MarketingComponent routePath={routePath} />
        <AboutModal open={aboutOpen} onClose={handleCloseAbout} />
        <TrialInfoModal open={trialInfoOpen} onClose={handleCloseTrialInfo} />
        <DisclaimerModal
          open={disclaimerOpen}
          onClose={handleCloseDisclaimer}
        />
        <AppFooter
          onOpenAbout={handleOpenAbout}
          onOpenDisclaimer={handleOpenDisclaimer}
        />
      </>
    );
  }

  if (!isLoaded) return null;

  return (
    <>
      <div className="app-shell-container app-shell-header">
        <div className="auth-bar auth-bar-shell">
          <div className="auth-bar-brand">
            <PlaybackBrand variant="mark" className="auth-bar-brand-mark" />
            <span className="auth-bar-brand-copy">
              <strong>Playback Poker</strong>
              <span>Smarter review for online poker players</span>
            </span>
          </div>
          <div className="auth-bar-nav">
            {SECTION_CONFIG.filter(
              (section) => {
                if (isScopedLearningManager) {
                  return section.path === "/admin/learning";
                }
                if (isScopedLearningImporter) {
                  return section.path === "/admin/learning/import";
                }
                if (section.importerOnly) return false;
                return !section.adminOnly || entitlements?.features?.admin === true;
              },
            ).map((section) => {
              const enabled = canAccessSection(section);
              const state = section.capability
                ? getCapabilityState(entitlements, section.capability)
                : "enabled";
              return (
                <button
                  key={section.path}
                  type="button"
                  className={`top-nav-link ${routePath === section.path ? "active" : ""}`}
                  data-enabled={enabled}
                  data-capability-state={state}
                  onClick={() => navigate(section.path)}
                >
                  {section.label}
                  {!enabled && state === "locked" ? " (Locked)" : ""}
                </button>
              );
            })}
          </div>
          <div className="auth-bar-actions">
            <div className="auth-bar-actions-desktop">
              {SHOW_LOCAL_LIVE_STREAM ? (
                <a
                  className="top-nav-link top-nav-link--live"
                  href={LOCAL_LIVE_STREAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="top-nav-live-dot" aria-hidden="true" />
                  Live stream
                </a>
              ) : null}
              {entitlementsStatus === "ready" && !hasActiveSubscription ? (
                <button
                  type="button"
                  className="top-nav-status"
                  onClick={handleOpenTrialInfo}
                  title="About trial AI credits"
                >
                  <span className="top-nav-status-label">Trial</span>
                  <span className="top-nav-status-value">
                    {Number.isFinite(trialRemainingTokens)
                      ? trialRemainingTokens.toLocaleString()
                      : "0"}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="top-nav-link top-nav-link--cta"
                onClick={
                  hasActiveSubscription
                    ? openBillingPortal
                    : openBillingCheckout
                }
                disabled={Boolean(billingActionLoading)}
                title={
                  hasActiveSubscription
                    ? "Manage your PlaybackPoker subscription"
                    : "Upgrade to unlock ongoing AI reviews"
                }
              >
                {billingActionLoading === "checkout"
                  ? "Opening checkout..."
                  : billingActionLoading === "portal"
                    ? "Opening portal..."
                    : hasActiveSubscription
                      ? "Manage plan"
                      : "Upgrade AI"}
                {!hasActiveSubscription ? (
                  <span className="top-nav-cta-crown" aria-hidden="true">
                    {"\u265B"}
                  </span>
                ) : null}
              </button>
              <div className="top-nav-account">
                <UserButton />
              </div>
            </div>

            <div className="auth-bar-actions-mobile">
              <button
                type="button"
                className={`top-nav-link mobile-utility-toggle ${
                  mobileUtilityOpen ? "active" : ""
                }`}
                aria-expanded={mobileUtilityOpen}
                aria-label="Open utility menu"
                onClick={() => setMobileUtilityOpen((value) => !value)}
              >
                <PlaybackBrand
                  variant="mark"
                  className="mobile-utility-toggle-icon"
                  aria-hidden="true"
                />
                <span className="mobile-utility-toggle-label">Menu</span>
              </button>
            </div>
          </div>
          {mobileUtilityOpen ? (
            <div className="mobile-utility-menu">
              {SHOW_LOCAL_LIVE_STREAM ? (
                <a
                  className="mobile-utility-item mobile-utility-item--live"
                  href={LOCAL_LIVE_STREAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileUtilityOpen(false)}
                >
                  <span className="mobile-utility-label">Live stream</span>
                  <span className="mobile-utility-live-status">
                    <span className="top-nav-live-dot" aria-hidden="true" />
                    Open
                  </span>
                </a>
              ) : null}
              {entitlementsStatus === "ready" && !hasActiveSubscription ? (
                <button
                  type="button"
                  className="mobile-utility-item mobile-utility-item--status"
                  onClick={() => {
                    setMobileUtilityOpen(false);
                    handleOpenTrialInfo();
                  }}
                >
                  <span className="mobile-utility-label">Trial credits</span>
                  <span className="mobile-utility-value">
                    {Number.isFinite(trialRemainingTokens)
                      ? trialRemainingTokens.toLocaleString()
                      : "0"}
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="mobile-utility-item mobile-utility-item--cta"
                onClick={() => {
                  setMobileUtilityOpen(false);
                  if (hasActiveSubscription) openBillingPortal();
                  else openBillingCheckout();
                }}
                disabled={Boolean(billingActionLoading)}
              >
                <span className="mobile-utility-label">
                  {hasActiveSubscription ? "Manage plan" : "Upgrade AI"}
                </span>
                {!hasActiveSubscription ? (
                  <span className="mobile-utility-value" aria-hidden="true">
                    {"\u265B"}
                  </span>
                ) : null}
              </button>
              <div className="mobile-utility-account">
                <span className="mobile-utility-label">Account</span>
                <UserButton />
              </div>
            </div>
          ) : null}
        </div>
        {entitlementsStatus === "ready" && billingActionStatus ? (
          <div className="auth-bar-meta">
            <span>{billingActionStatus}</span>
          </div>
        ) : null}
      </div>

      <ServerWakeGate>
        {entitlementsStatus === "loading" ? (
          <EntitlementGateCard
            title="Loading Access"
            detail="Checking which sections are enabled for this account."
          />
        ) : null}

        {entitlementsStatus === "error" ? (
          <EntitlementGateCard
            title="Access Check Failed"
            detail={entitlementsError}
            actionLabel="Retry"
            onAction={loadEntitlements}
          />
        ) : null}

        {entitlementsStatus === "ready" && canAccessCurrent ? (
          <SectionComponent
            entitlements={entitlements}
            navigate={navigate}
            routePath={routePath}
          />
        ) : null}

        {entitlementsStatus === "ready" && !canAccessCurrent ? (
          <EntitlementGateCard
            title={`${currentSection.label} Is Locked`}
            detail={currentSection.lockedText}
            actionLabel={
              firstEnabledPath === routePath ? "" : "Open Enabled Section"
            }
            onAction={
              firstEnabledPath === routePath
                ? undefined
                : () => navigate(firstEnabledPath, { replace: true })
            }
          />
        ) : null}
      </ServerWakeGate>
      <AboutModal open={aboutOpen} onClose={handleCloseAbout} />
      <TrialInfoModal open={trialInfoOpen} onClose={handleCloseTrialInfo} />
      <DisclaimerModal open={disclaimerOpen} onClose={handleCloseDisclaimer} />
      <MobileScrollTopWidget
        enabled={routePath === "/tools/tournament-review"}
      />
      <AppFooter
        onOpenAbout={handleOpenAbout}
        onOpenDisclaimer={handleOpenDisclaimer}
      />
    </>
  );
}

function ServerWakeGate({ children }) {
  const [status, setStatus] = React.useState("checking"); // checking | waking | online

  React.useEffect(() => {
    let cancelled = false;
    async function check() {
      const ok = await pingHealth();
      if (cancelled) return;
      setStatus(ok ? "online" : "waking");
    }
    check();
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const showOverlay = status !== "online";
  return (
    <>
      {showOverlay ? (
        <div className="wake-overlay">
          <div className="wake-card">
            <div className="wake-dot" />
            <div>
              <p className="wake-title">
                {status === "waking" ? "Server waking up" : "Checking server"}
              </p>
              <p className="wake-sub">
                Please wait - connecting to backend services.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}

function SignedOutShell() {
  const marketingPath = normalizeMarketingPath(window.location.pathname);
  const marketingPage = resolveMarketingPage(marketingPath);

  useEffect(() => {
    if (marketingPage) return;
    setPageMeta({
      title: "Playback Poker | AI Poker Hand Review",
      description:
        "Playback Poker is professional poker intelligence software for AI-assisted hand review and strategic analysis.",
      path: "/",
    });
  }, [marketingPage]);

  if (marketingPage) {
    const MarketingComponent = marketingPage.component;
    return <MarketingComponent routePath={marketingPath} />;
  }

  return (
    <div className="auth-gate-layout">
      <div className="auth-gate">
        <PlaybackBrand
          variant="mark"
          alt="Playback Poker"
          className="auth-gate-brand"
        />
        <p>
          Create a free account so we can save your tournaments and study
          queue.
        </p>
        <div className="auth-actions">
          <SignInButton mode="modal">
            <button className="auth-button">Sign in</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="auth-button secondary">Create free account</button>
          </SignUpButton>
        </div>
        <div className="auth-gate-secondary-links" aria-label="Learn more">
          <a className="auth-gate-secondary-link" href="/articles">
            Browse our Playback Poker Articles
          </a>
        </div>
      </div>
      <section className="auth-community-card" aria-label="Community">
        <p className="auth-community-kicker">Community</p>
        <h2 className="auth-community-title">Join the Conversation</h2>
        <p className="auth-community-copy">
          Support, updates, bug reports, and feature requests.
        </p>
        <a
          className="auth-community-link"
          href="https://discord.gg/eFzKXtBgQk"
          target="_blank"
          rel="noreferrer"
        >
          Enter the Discord
        </a>
      </section>
      <div className="auth-gate-pseudo-footer">
        <TrustMethodologyBanner />
      </div>
    </div>
  );
}

function Shell() {
  useEffect(() => {
    if (!initAnalytics()) return undefined;

    const sendPageView = () => {
      window.requestAnimationFrame(() => {
        trackPageView();
      });
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const emitRouteChange = () => {
      window.dispatchEvent(new Event(SPA_ROUTE_CHANGE_EVENT));
    };

    window.history.pushState = function pushStatePatched(...args) {
      const result = originalPushState.apply(this, args);
      emitRouteChange();
      return result;
    };

    window.history.replaceState = function replaceStatePatched(...args) {
      const result = originalReplaceState.apply(this, args);
      emitRouteChange();
      return result;
    };

    window.addEventListener(SPA_ROUTE_CHANGE_EVENT, sendPageView);
    window.addEventListener("popstate", sendPageView);
    sendPageView();

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener(SPA_ROUTE_CHANGE_EVENT, sendPageView);
      window.removeEventListener("popstate", sendPageView);
    };
  }, []);

  if (!clerkPublishableKey) {
    return (
      <div className="auth-gate">
        <h1>Poker Chaos Coach</h1>
        <p>Set VITE_CLERK_PUBLISHABLE_KEY to enable login.</p>
      </div>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <Show when="signed-in">
        <SignedInShell />
      </Show>
      <Show when="signed-out">
        <SignedOutShell />
      </Show>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>,
);
