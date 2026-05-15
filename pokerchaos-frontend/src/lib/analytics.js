const GA_MEASUREMENT_ID = String(
  import.meta.env.VITE_GA_MEASUREMENT_ID || "",
).trim();

let isInitialized = false;
let hasRequestedScript = false;

function getPagePath() {
  const { pathname, search, hash } = window.location;
  return `${pathname || "/"}${search || ""}${hash || ""}`;
}

function getPageLocation() {
  return `${window.location.origin}${getPagePath()}`;
}

function ensureGtagStub() {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
  }
}

function injectGtagScript() {
  if (hasRequestedScript) return;
  hasRequestedScript = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
    GA_MEASUREMENT_ID,
  )}`;
  script.setAttribute("data-pcc-ga", GA_MEASUREMENT_ID);
  document.head.appendChild(script);
}

export function initAnalytics() {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return false;

  ensureGtagStub();
  injectGtagScript();

  if (!isInitialized) {
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
    });
    isInitialized = true;
  }

  return true;
}

export function trackPageView() {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;

  window.gtag("event", "page_view", {
    page_title: document.title,
    page_path: getPagePath(),
    page_location: getPageLocation(),
  });
}
