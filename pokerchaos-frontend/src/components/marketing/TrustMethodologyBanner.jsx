import { getPublishedTrustPages } from "./trustCatalog.js";

const TRUST_BANNER_ORDER = [
  "/how-playback-poker-works",
  "/supported-sites-formats",
  "/ai-limitations",
  "/methodology",
  "/about",
];

export default function TrustMethodologyBanner() {
  const publishedTrustPages = getPublishedTrustPages().sort((a, b) => {
    const indexA = TRUST_BANNER_ORDER.indexOf(a.path);
    const indexB = TRUST_BANNER_ORDER.indexOf(b.path);
    const normalizedA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const normalizedB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
    return normalizedA - normalizedB;
  });

  if (publishedTrustPages.length === 0) {
    return null;
  }

  return (
    <div
      className="auth-gate-trust-footer"
      aria-label="Trust and methodology links"
    >
      <div className="article-trust-strip">
        <div className="article-trust-links">
          {publishedTrustPages.map((page) => (
            <a key={page.path} className="article-link" href={page.path}>
              {page.title}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
