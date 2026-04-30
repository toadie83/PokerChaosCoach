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
import { requestEntitlements } from "./api/aiService.js";
import { pingHealth, setAuthTokenFetcher } from "./lib/api.js";
import "./styles.css";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const DEFAULT_ROUTE = "/review";
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
      "Coach access is private. Add this user to COACH_ALLOWED_USER_IDS to unlock it.",
  },
];
const ROUTE_LOOKUP = new Map(SECTION_CONFIG.map((item) => [item.path, item]));

function normalizeRoutePath(pathname) {
  const raw = typeof pathname === "string" ? pathname.trim() : "";
  if (!raw || raw === "/") return DEFAULT_ROUTE;
  const normalized = raw.replace(/\/+$/, "") || "/";
  return ROUTE_LOOKUP.has(normalized) ? normalized : DEFAULT_ROUTE;
}

function useAppRoute() {
  const [routePath, setRoutePath] = useState(() =>
    normalizeRoutePath(window.location.pathname)
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
    [routePath]
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
          <button type="button" className="feature-gate-button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <details className="app-footer-disclaimer">
          <summary>Disclaimer</summary>
          <p>
            Training insights are informational and should be used at your own
            discretion. Hand-history input is not saved for model training.
          </p>
        </details>
        <a className="app-footer-link" href="mailto:qacopilotdev@gmail.com">
          Contact me
        </a>
      </div>
    </footer>
  );
}

function SignedInShell() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { routePath, navigate } = useAppRoute();
  const [theme, setTheme] = useState(() => {
    try {
      const saved = window.localStorage?.getItem("pcc_theme");
      return saved === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [entitlements, setEntitlements] = useState(null);
  const [entitlementsStatus, setEntitlementsStatus] = useState("loading"); // loading | ready | error
  const [entitlementsError, setEntitlementsError] = useState("");

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage?.setItem("pcc_theme", theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setAuthTokenFetcher(null);
      return;
    }
    setAuthTokenFetcher(() => getToken());
    return () => setAuthTokenFetcher(null);
  }, [getToken, isLoaded, isSignedIn]);

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

  const currentSection = ROUTE_LOOKUP.get(routePath) || SECTION_CONFIG[0];
  const enabledSections = useMemo(
    () =>
      SECTION_CONFIG.filter((section) =>
        Boolean(entitlements?.features?.[section.feature])
      ),
    [entitlements]
  );
  const firstEnabledPath = enabledSections[0]?.path || DEFAULT_ROUTE;
  const canAccessCurrent = Boolean(entitlements?.features?.[currentSection.feature]);
  const SectionComponent = currentSection.component;

  if (!isLoaded) return null;

  return (
    <>
      <div className="auth-bar auth-bar-shell">
        <div className="auth-bar-nav">
          {SECTION_CONFIG.map((section) => {
            const enabled = Boolean(entitlements?.features?.[section.feature]);
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
        <div className="auth-bar-actions">
          <button
            type="button"
            className="top-nav-link"
            onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            aria-label={
              theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark high-contrast mode"
            }
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <UserButton />
        </div>
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

        {entitlementsStatus === "ready" && canAccessCurrent ? <SectionComponent /> : null}

        {entitlementsStatus === "ready" && !canAccessCurrent ? (
          <EntitlementGateCard
            title={`${currentSection.label} Is Locked`}
            detail={currentSection.lockedText}
            actionLabel={firstEnabledPath === routePath ? "" : "Open Enabled Section"}
            onAction={
              firstEnabledPath === routePath
                ? undefined
                : () => navigate(firstEnabledPath, { replace: true })
            }
          />
        ) : null}
      </ServerWakeGate>
      <AppFooter />
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
              <p className="wake-sub">Please wait - connecting to backend services.</p>
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}

function Shell() {
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
        <div className="auth-gate">
          <h1>Poker Chaos Coach</h1>
          <p>Sign in to access Hand Review and Coach.</p>
          <div className="auth-actions">
            <SignInButton mode="modal">
              <button className="auth-button">Sign In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="auth-button secondary">Create Account</button>
            </SignUpButton>
          </div>
        </div>
      </Show>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Shell />
  </React.StrictMode>
);
