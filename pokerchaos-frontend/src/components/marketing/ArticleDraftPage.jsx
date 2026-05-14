import { useEffect } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";
import {
  LANDING_PAGE_LABELS,
  buildArticlePath,
  getArticleBySlug,
} from "./articleCatalog.js";

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

function upsertJsonLdScript(id, schema) {
  let scriptTag = document.head.querySelector(`#${id}`);
  if (!scriptTag) {
    scriptTag = document.createElement("script");
    scriptTag.type = "application/ld+json";
    scriptTag.id = id;
    document.head.appendChild(scriptTag);
  }
  scriptTag.textContent = JSON.stringify(schema);
}

export default function ArticleDraftPage({ slug }) {
  const article = getArticleBySlug(slug);

  useEffect(() => {
    if (!article) {
      document.title = "Article Not Found | Playback Poker";
      upsertMetaTag({
        name: "description",
        content: "The requested article could not be found.",
      });
      upsertMetaTag({ name: "robots", content: "noindex,follow" });
      upsertCanonicalTag(`${window.location.origin}/articles`);
      return;
    }

    const pagePath = buildArticlePath(article.slug);
    const pageUrl = `${window.location.origin}${pagePath}`;
    const pageTitle = `${article.title} | Playback Poker`;
    const robotsValue = article.publishReady ? "index,follow" : "noindex,follow";

    document.title = pageTitle;
    upsertMetaTag({ name: "description", content: article.excerpt });
    upsertMetaTag({ name: "robots", content: robotsValue });
    upsertMetaTag({ property: "og:title", content: pageTitle });
    upsertMetaTag({ property: "og:description", content: article.excerpt });
    upsertMetaTag({ property: "og:type", content: "article" });
    upsertMetaTag({ property: "og:url", content: pageUrl });
    upsertCanonicalTag(pageUrl);

    upsertJsonLdScript("seo-schema-article-draft", {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: article.title,
      description: article.excerpt,
      dateModified: article.updatedAt,
      url: pageUrl,
      author: {
        "@type": "Organization",
        name: "Playback Poker",
      },
      isAccessibleForFree: true,
    });
  }, [article]);

  if (!article) {
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
          <p className="marketing-kicker">Article Framework</p>
          <h1 className="marketing-title">Article Not Found</h1>
          <p className="marketing-subtitle">
            Return to the article hub and choose one of the active draft
            frameworks.
          </p>
          <a className="auth-button marketing-cta-button" href="/articles">
            Open Article Hub
          </a>
        </section>
      </main>
    );
  }

  const relatedPath = buildArticlePath(article.relatedSlug);
  const relatedArticle = getArticleBySlug(article.relatedSlug);

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
        <p className="marketing-kicker">{article.cluster} Draft</p>
        <h1 className="marketing-title">{article.title}</h1>
        <p className="marketing-subtitle">{article.excerpt}</p>
        <div className="marketing-proof-row">
          <span className="marketing-pill">
            Status: {article.publishReady ? "Publish Ready" : "Draft Framework"}
          </span>
          <span className="marketing-pill">
            Robots: {article.publishReady ? "index,follow" : "noindex,follow"}
          </span>
          <span className="marketing-pill">Updated: {article.updatedAt}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Writing Blueprint</h2>
        <div className="marketing-faq-grid">
          {article.sectionPrompts.map((prompt) => (
            <article className="marketing-faq-item" key={prompt}>
              <h3>Section Prompt</h3>
              <p>{prompt}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Internal Links For This Article</h2>
        <div className="article-link-stack">
          <a className="article-link article-link-strong" href={article.primaryLandingPath}>
            Primary landing page: {LANDING_PAGE_LABELS[article.primaryLandingPath]}
          </a>
          <a className="article-link" href="/">
            Homepage: Playback Poker
          </a>
          <a className="article-link" href={relatedPath}>
            Related article: {relatedArticle?.title || "Related article"}
          </a>
        </div>
      </section>
    </main>
  );
}
