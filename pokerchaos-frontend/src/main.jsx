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
import App from "./App.jsx";
import ReviewApp from "./ReviewApp.jsx";
import AboutModal from "./components/AboutModal.jsx";
import AiPokerHandAnalyzerPage from "./components/marketing/AiPokerHandAnalyzerPage.jsx";
import GgPokerHandReviewToolPage from "./components/marketing/GgPokerHandReviewToolPage.jsx";
import PokerLeakFinderPage from "./components/marketing/PokerLeakFinderPage.jsx";
import MttHandReviewSoftwarePage from "./components/marketing/MttHandReviewSoftwarePage.jsx";
import TournamentHandAnalysisPage from "./components/marketing/TournamentHandAnalysisPage.jsx";
import PokerSessionReviewPage from "./components/marketing/PokerSessionReviewPage.jsx";
import ArticleHubPage from "./components/marketing/ArticleHubPage.jsx";
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
import desktopNavWordmark from "./assets/brand/playback-nav-image-desktop.png";
import mobileNavWordmark from "./assets/brand/playback-nav-image-mobile.png";
import navIconMark from "./assets/brand/playback-nav-image-icon.png";
import "./styles.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const DEFAULT_ROUTE = "/review";
const ABOUT_SEEN_STORAGE_KEY = "pcc_about_seen";
const TRIAL_TOKENS_UPDATED_EVENT = "pcc:trial-tokens-updated";
const SPA_ROUTE_CHANGE_EVENT = "pcc:spa-route-change";
const MARKETING_PAGE_CONFIG = [
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
  ...TRUST_PAGE_CATALOG.map((page) => ({
    path: page.path,
    component: () => <TrustPageDraft path={page.path} />,
  })),
  ...ARTICLE_CATALOG.map((article) => ({
    path: buildArticlePath(article.slug),
    component: () => <ArticleDraftPage slug={article.slug} />,
  })),
];
const SECTION_CONFIG = [
  {
    path: "/review",
    label: "Hand Review",
    feature: "review",
    component: ReviewApp,
    lockedText:
      "Hand review access is currently disabled for this account. Enable review entitlement to continue.",
  },
  {
    path: "/coach",
    label: "Coach",
    feature: "coach",
    component: App,
    lockedText:
      "Coach allows users to run hand simulations and receive AI powered strategic insights. Coach access is currently disabled for all accounts as we are finalizing the feature. Please stay tuned for updates and release announcements.",
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
  return MARKETING_ROUTE_LOOKUP.has(normalized) ? normalized : "/";
}

function normalizeRoutePath(pathname) {
  const raw = typeof pathname === "string" ? pathname.trim() : "";
  if (!raw || raw === "/") return DEFAULT_ROUTE;
  const normalized = raw.replace(/\/+$/, "") || "/";
  if (MARKETING_ROUTE_LOOKUP.has(normalized)) return normalized;
  return ROUTE_LOOKUP.has(normalized) ? normalized : DEFAULT_ROUTE;
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
      <div className="modal trial-info-modal" onClick={(e) => e.stopPropagation()}>
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
  const marketingPage = MARKETING_ROUTE_LOOKUP.get(routePath);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutPromptChecked, setAboutPromptChecked] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage?.getItem("pcc_theme");
      return saved === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
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
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage?.setItem("pcc_theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    setMobileUtilityOpen(false);
  }, [routePath]);

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

  const currentSection = ROUTE_LOOKUP.get(routePath) || SECTION_CONFIG[0];
  const enabledSections = useMemo(
    () =>
      SECTION_CONFIG.filter((section) =>
        Boolean(entitlements?.features?.[section.feature]),
      ),
    [entitlements],
  );
  const firstEnabledPath = enabledSections[0]?.path || DEFAULT_ROUTE;
  const canAccessCurrent = Boolean(
    entitlements?.features?.[currentSection.feature],
  );
  const hasActiveSubscription = Boolean(
    entitlements?.billing?.hasActiveSubscription,
  );
  const trialRemainingTokens = Number(
    entitlements?.billing?.trial?.remainingTokens || 0,
  );
  const SectionComponent = currentSection.component;

  useEffect(() => {
    if (marketingPage) return;
    if (routePath === "/coach") {
      setPageMeta({
        title: "Playback Poker Coach | AI Strategy Guidance",
        description:
          "Run AI-powered poker strategy guidance and decision support inside Playback Poker Coach.",
        path: "/coach",
      });
      return;
    }

    setPageMeta({
      title: "Playback Poker Hand Review | Tournament Analysis",
      description:
        "Review tournament hands with AI-powered analysis to find leaks and improve MTT decisions.",
      path: "/review",
    });
  }, [marketingPage, routePath]);

  if (marketingPage) {
    const MarketingComponent = marketingPage.component;
    return (
      <>
        <MarketingComponent />
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
          <div className="auth-bar-nav">
            {SECTION_CONFIG.map((section) => {
              const enabled = Boolean(
                entitlements?.features?.[section.feature],
              );
              return (
                <button
                  key={section.path}
                  type="button"
                  className={`top-nav-link ${routePath === section.path ? "active" : ""}`}
                  data-enabled={enabled}
                  onClick={() => navigate(section.path)}
                >
                  {section.label}
                  {!enabled ? " (Locked)" : ""}
                </button>
              );
            })}
          </div>
          <div className="auth-bar-brand" aria-hidden="true">
            <img
              src={desktopNavWordmark}
              alt=""
              className="auth-bar-brand-wordmark auth-bar-brand-wordmark-desktop"
            />
          </div>
          <div className="auth-bar-actions">
            <div className="auth-bar-actions-desktop">
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
              <button
                type="button"
                className="top-nav-link top-nav-utility"
                onClick={() =>
                  setTheme((value) => (value === "dark" ? "light" : "dark"))
                }
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark high-contrast mode"
                }
              >
                <span className="top-nav-utility-icon" aria-hidden="true">
                  {theme === "dark" ? "\u2600" : "\u263E"}
                </span>
                <span className="top-nav-utility-label">
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </span>
              </button>
              <div className="top-nav-account">
                <UserButton />
              </div>
            </div>

            <div className="auth-bar-actions-mobile">
              <img
                src={mobileNavWordmark}
                alt=""
                className="auth-bar-brand-wordmark auth-bar-brand-wordmark-mobile"
                aria-hidden="true"
              />
              <button
                type="button"
                className={`top-nav-link mobile-utility-toggle ${
                  mobileUtilityOpen ? "active" : ""
                }`}
                aria-expanded={mobileUtilityOpen}
                aria-label="Open utility menu"
                onClick={() => setMobileUtilityOpen((value) => !value)}
              >
                <img
                  src={navIconMark}
                  alt=""
                  className="mobile-utility-toggle-icon"
                  aria-hidden="true"
                />
                <span className="mobile-utility-toggle-label">Menu</span>
              </button>
            </div>
          </div>
          {mobileUtilityOpen ? (
            <div className="mobile-utility-menu">
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
              <button
                type="button"
                className="mobile-utility-item"
                onClick={() => {
                  setMobileUtilityOpen(false);
                  setTheme((value) => (value === "dark" ? "light" : "dark"));
                }}
              >
                <span className="mobile-utility-label">Theme</span>
                <span className="mobile-utility-value">
                  {theme === "dark" ? "\u2600" : "\u263E"}
                </span>
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
          <SectionComponent />
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
      <MobileScrollTopWidget enabled={routePath === "/review"} />
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
  const marketingPage = MARKETING_ROUTE_LOOKUP.get(marketingPath);

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
    return <MarketingComponent />;
  }

  return (
    <div className="auth-gate-layout">
      <div className="auth-gate">
        <img
          src={mobileNavWordmark}
          alt="Playback Poker"
          className="auth-gate-brand"
        />
        <p>Sign in to access Hand Review and Coach.</p>
        <div className="auth-actions">
          <SignInButton mode="modal">
            <button className="auth-button">Sign In</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="auth-button secondary">Create Account</button>
          </SignUpButton>
        </div>
        <div className="auth-gate-secondary-links" aria-label="Learn more">
          <a className="auth-gate-secondary-link" href="/articles">
            Browse our Playback Poker Articles
          </a>
        </div>
      </div>
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
