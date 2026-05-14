import { useEffect, useMemo } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";
import {
  ARTICLE_CATALOG,
  LANDING_PAGE_LABELS,
  buildArticlePath,
  getPublishedArticles,
} from "./articleCatalog.js";
import { TRUST_PAGE_CATALOG } from "./trustCatalog.js";

const PAGE_PATH = "/articles";
const PAGE_TITLE = "Poker Study Articles | Playback Poker";
const PAGE_DESCRIPTION =
  "Authority article library for poker study workflows, hand review strategy, and tournament improvement guides.";

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
  const hasPublishedArticles = getPublishedArticles().length > 0;

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
    for (const article of ARTICLE_CATALOG) {
      const current = map.get(article.cluster) || [];
      current.push(article);
      map.set(article.cluster, current);
    }
    return Array.from(map.entries());
  }, []);
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
        <p className="marketing-kicker">Authority Content Hub</p>
        <h1 className="marketing-title">Poker Study Article Framework</h1>
        <p className="marketing-subtitle">
          This hub organizes supporting content around clear topic clusters.
          Draft pages are scaffolded so you can write final copy and add media
          before publishing.
        </p>
        <div className="marketing-proof-row">
          <span className="marketing-pill">Cluster-driven structure</span>
          <span className="marketing-pill">Internal link-ready templates</span>
          <span className="marketing-pill">Draft-first workflow</span>
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
                      {article.publishReady
                        ? "Publish ready"
                        : "Draft outline"}{" "}
                      | Landing link target:{" "}
                      {LANDING_PAGE_LABELS[article.primaryLandingPath]}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
