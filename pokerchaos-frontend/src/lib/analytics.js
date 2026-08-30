const GA_MEASUREMENT_ID = String(
  import.meta.env?.VITE_GA_MEASUREMENT_ID || "",
).trim();

let isInitialized = false;
let hasRequestedScript = false;

const PRODUCT_EVENT_FIELDS = Object.freeze({
  study_spots_upload_started: ["upload_method"],
  study_spots_parse_failed: ["error_code", "upload_method"],
  study_spots_analysis_completed: [
    "hand_count",
    "candidate_count",
    "spot_count",
  ],
  study_spots_analysis_failed: ["error_code"],
  study_resource_opened: ["spot_category", "resource_id", "match_quality"],
  tournament_review_upsell_viewed: ["spot_count"],
  tournament_review_upsell_clicked: ["spot_count"],
});

function safeEventValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.trim().slice(0, 100);
  return undefined;
}

export function buildProductEventParams(eventName, parameters = {}) {
  const allowedFields = PRODUCT_EVENT_FIELDS[eventName];
  if (!allowedFields) return null;
  return Object.fromEntries(
    allowedFields
      .map((key) => [key, safeEventValue(parameters[key])])
      .filter(([, value]) => value !== undefined && value !== ""),
  );
}

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

export function trackProductEvent(eventName, parameters = {}) {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return false;
  if (typeof window.gtag !== "function") return false;
  const safeParameters = buildProductEventParams(eventName, parameters);
  if (!safeParameters) return false;
  window.gtag("event", eventName, safeParameters);
  return true;
}
