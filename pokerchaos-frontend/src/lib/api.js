const DEFAULT_API_BASE_URL = "http://localhost:4011";

export function getApiBaseUrl() {
  const raw = import.meta.env?.VITE_API_BASE_URL;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.replace(/\/$/, "");
  }
  return DEFAULT_API_BASE_URL;
}

async function requestJson(path, options = {}) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${path}`, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  return res.json();
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

