import { getPublishedTrustPages } from "./trustCatalog.js";

export default function TrustMethodologyBanner() {
  const publishedTrustPages = getPublishedTrustPages();

  if (publishedTrustPages.length === 0) {
    return null;
  }

  return (
    <div className="auth-gate-trust-footer" aria-label="Trust and methodology links">
      <div className="article-trust-strip">
        <p className="article-trust-label">Trust & Methodology</p>
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
