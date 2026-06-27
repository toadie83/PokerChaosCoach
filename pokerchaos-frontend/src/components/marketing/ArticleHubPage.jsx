import { useEffect, useMemo } from "react";
import MarketingSiteShell from "./MarketingSiteShell.jsx";
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
  const selector = name
    ? `meta[name="${name}"]`
    : `meta[property="${property}"]`;
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
    <MarketingSiteShell currentPath={PAGE_PATH}>
      <section className="home-hero learning-hub-hero">
        <div className="learning-story-copy">
          <p className="marketing-kicker">Learning Library</p>
          <h1 className="marketing-title">
            Playback Poker article library for tournament review and study.
          </h1>
          <p className="marketing-subtitle">
            Practical guides on tournament review workflows, leak detection, and
            session improvement systems used in Playback Poker study.
          </p>
          <div className="marketing-proof-row">
            <span className="marketing-pill">Published strategy content</span>
            <span className="marketing-pill">Tournament-focused workflows</span>
            <span className="marketing-pill">Actionable review systems</span>
          </div>
          <div className="learning-story-actions">
            <a className="home-button home-button-primary" href="/review">
              Review a Hand
            </a>
            <a
              className="home-button home-button-secondary"
              href="#article-clusters"
            >
              Browse the Articles
            </a>
          </div>
        </div>
        <div className="learning-story-aside">
          <div className="learning-story-stat">
            <span className="learning-story-stat-label">
              Published articles
            </span>
            <strong>{publishedArticles.length}</strong>
          </div>
          <div className="learning-story-stat">
            <span className="learning-story-stat-label">Trust pages</span>
            <strong>{publishedTrustPages.length}</strong>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <p className="home-eyebrow">Trust and methodology</p>
          <h2>Supporting pages that explain how the workflow works.</h2>
        </div>
        {publishedTrustPages.length > 0 ? (
          <div className="learning-link-grid">
            {publishedTrustPages.map((page) => (
              <a key={page.path} className="home-seo-card" href={page.path}>
                <h3>{page.title}</h3>
                <p>{page.description}</p>
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <section className="home-section" id="article-clusters">
        <div className="home-section-heading">
          <p className="home-eyebrow">Article clusters</p>
          <h2>Explore the current learning topics.</h2>
        </div>
        {clusteredArticles.length > 0 ? (
          <div className="learning-cluster-grid">
            {clusteredArticles.map(([clusterName, articles]) => (
              <article className="learning-cluster-card" key={clusterName}>
                <div className="learning-cluster-card-header">
                  <h3>{clusterName}</h3>
                  <span className="marketing-pill">
                    {articles.length} article{articles.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="article-list">
                  {articles.map((article) => (
                    <li key={article.slug}>
                      <a
                        className="article-link"
                        href={buildArticlePath(article.slug)}
                      >
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
    </MarketingSiteShell>
  );
}
