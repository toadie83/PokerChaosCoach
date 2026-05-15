import { useEffect, useMemo } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";
import {
  LANDING_PAGE_LABELS,
  buildArticlePath,
  getPublishedArticles,
} from "./articleCatalog.js";
import { TRUST_PAGE_CATALOG } from "./trustCatalog.js";

const PAGE_PATH = "/articles";
const PAGE_TITLE = "Poker Study Articles | Playback Poker";
const PAGE_DESCRIPTION =
  "Playback Poker article library covering tournament review workflows, leak detection, and practical study systems.";

function upsertMetaTag({ name, property, content }) {
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
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

export default function ArticleHubPage() {
  const publishedArticles = getPublishedArticles();
  const hasPublishedArticles = publishedArticles.length > 0;

  useEffect(() => {
    const pageUrl = `${window.location.origin}${PAGE_PATH}`;

    document.title = PAGE_TITLE;
    upsertMetaTag({ name: "description", content: PAGE_DESCRIPTION });
    upsertMetaTag({
      name: "robots",
      content: hasPublishedArticles ? "index,follow" : "noindex,follow",
    });
    upsertMetaTag({ property: "og:title", content: PAGE_TITLE });
    upsertMetaTag({ property: "og:description", content: PAGE_DESCRIPTION });
    upsertMetaTag({ property: "og:type", content: "website" });
    upsertMetaTag({ property: "og:url", content: pageUrl });
    upsertCanonicalTag(pageUrl);
  }, [hasPublishedArticles]);

  const clusteredArticles = useMemo(() => {
    const map = new Map();
    for (const article of publishedArticles) {
      const current = map.get(article.cluster) || [];
      current.push(article);
      map.set(article.cluster, current);
    }
    return Array.from(map.entries());
  }, [publishedArticles]);
  const publishedTrustPages = useMemo(
    () => TRUST_PAGE_CATALOG.filter((page) => page.publishReady),
    [],
  );

  return (
    <main className="marketing-shell">
      <section className="panel marketing-header-panel">
        <img
          src={mobileNavWordmark}
          alt="Playback Poker"
          className="marketing-wordmark"
        />
      </section>

      <section className="panel marketing-hero-panel">
        <p className="marketing-kicker">Article Hub</p>
        <h1 className="marketing-title">Poker Study Articles</h1>
        <p className="marketing-subtitle">
          Practical guides on tournament review workflows, leak detection, and
          session improvement systems used in Playback Poker study.
        </p>
        <div className="marketing-proof-row">
          <span className="marketing-pill">Published strategy content</span>
          <span className="marketing-pill">Tournament-focused workflows</span>
          <span className="marketing-pill">Actionable review systems</span>
        </div>
      </section>

      <section className="panel">
        <h2>Article Clusters</h2>
        {publishedTrustPages.length > 0 ? (
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
        ) : null}
        {clusteredArticles.length > 0 ? (
          <div className="article-cluster-grid">
            {clusteredArticles.map(([clusterName, articles]) => (
              <article className="article-cluster-card" key={clusterName}>
                <h3>{clusterName}</h3>
                <ul className="article-list">
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <a className="article-link" href={buildArticlePath(article.slug)}>
                        {article.title}
                      </a>
                      <p className="article-meta">
                        Landing link target:{" "}
                        {LANDING_PAGE_LABELS[article.primaryLandingPath]}
                      </p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="marketing-subtitle">
            No published articles are available yet.
          </p>
        )}
      </section>
    </main>
  );
}
