export const DEFAULT_AUTH_ROUTE = "/tools";

export const LEGACY_AUTH_ROUTE_REDIRECTS = Object.freeze({
  "/review": "/tools/tournament-review",
  "/coach": "/tools/coach",
});

function normalizePath(pathname) {
  const raw = typeof pathname === "string" ? pathname.trim() : "";
  if (!raw) return "/";
  return raw.replace(/\/+$/, "") || "/";
}

export function normalizeAppRoutePath(
  pathname,
  {
    authenticatedPaths = [],
    authenticatedPrefixes = [],
    marketingPaths = [],
    marketingPrefixes = [],
  } = {},
) {
  const normalized = normalizePath(pathname);
  const redirected = LEGACY_AUTH_ROUTE_REDIRECTS[normalized];
  if (redirected) return redirected;
  if (authenticatedPaths.includes(normalized)) return normalized;
  if (
    authenticatedPrefixes.some(
      (prefix) => normalized.startsWith(`${prefix}/`) && normalized.length > prefix.length + 1,
    )
  ) {
    return normalized;
  }
  if (marketingPaths.includes(normalized)) return normalized;
  if (
    marketingPrefixes.some(
      (prefix) => normalized.startsWith(`${prefix}/`) && normalized.length > prefix.length + 1,
    )
  ) {
    return normalized;
  }
  return DEFAULT_AUTH_ROUTE;
}
