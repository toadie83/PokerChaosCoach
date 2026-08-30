function upsertMeta(selector, attribute, name, content) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

export function setLearningPageMeta({ title, description, path }) {
  const canonicalPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${window.location.origin}${canonicalPath}`;
  document.title = title;
  upsertMeta('meta[name="description"]', "name", "description", description);
  upsertMeta('meta[name="robots"]', "name", "robots", "index,follow");
  upsertMeta('meta[property="og:title"]', "property", "og:title", title);
  upsertMeta('meta[property="og:description"]', "property", "og:description", description);
  upsertMeta('meta[property="og:type"]', "property", "og:type", "article");
  upsertMeta('meta[property="og:url"]', "property", "og:url", url);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}
