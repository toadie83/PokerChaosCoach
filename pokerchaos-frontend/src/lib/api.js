const DEFAULT_API_BASE_URL = "http://localhost:4011";

export function getApiBaseUrl() {
  const raw = import.meta.env?.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.replace(/\/$/, "");
  }
  return DEFAULT_API_BASE_URL;
}

let authTokenFetcher = null;

export function setAuthTokenFetcher(fetcher) {
  authTokenFetcher = typeof fetcher === "function" ? fetcher : null;
}

async function withAuthHeader(options = {}) {
  const headers = new Headers(options.headers || {});
  if (authTokenFetcher) {
    try {
      const token = await authTokenFetcher();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch (err) {
      console.warn("[api] Failed to fetch auth token", err);
    }
  }
  return { ...options, headers };
}

async function requestJson(path, options = {}) {
  const base = getApiBaseUrl();
  const opts = await withAuthHeader(options);
  const res = await fetch(`${base}${path}`, opts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return res.json();
}

export async function pingHealth({ timeoutMs = 4000 } = {}) {
  const base = getApiBaseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/healthz`, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson(path, data) {
  return requestJson(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data ?? {})
  });
}

export async function getJson(path) {
  return requestJson(path, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });
}
