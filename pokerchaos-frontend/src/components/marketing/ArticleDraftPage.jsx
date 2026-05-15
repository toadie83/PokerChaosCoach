import { useEffect, useState } from "react";
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
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);
  const [isWalkthroughImageExpanded, setIsWalkthroughImageExpanded] = useState(false);
  const walkthroughSteps = Array.isArray(article?.walkthroughSteps)
    ? article.walkthroughSteps
    : [];
  const hasWalkthrough = walkthroughSteps.length > 0;
  const activeWalkthroughIndex = hasWalkthrough
    ? Math.min(walkthroughIndex, walkthroughSteps.length - 1)
    : 0;
  const activeWalkthroughStep = hasWalkthrough
    ? walkthroughSteps[activeWalkthroughIndex]
    : null;

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

  useEffect(() => {
    setWalkthroughIndex(0);
  }, [article?.slug]);

  useEffect(() => {
    setIsWalkthroughImageExpanded(false);
  }, [article?.slug, activeWalkthroughIndex]);

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
        <p className="marketing-kicker">
          {article.publishReady ? article.cluster : `${article.cluster} Draft`}
        </p>
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

      {hasWalkthrough ? (
        <section className="panel">
          <h2>{article.walkthroughTitle || "How-To Walkthrough"}</h2>
          {article.walkthroughIntro ? (
            <p className="trust-walkthrough-intro">{article.walkthroughIntro}</p>
          ) : null}

          <div className="trust-walkthrough-stage">
            <figure className="trust-walkthrough-media">
              <button
                type="button"
                className="trust-walkthrough-media-trigger"
                onClick={() => setIsWalkthroughImageExpanded((current) => !current)}
                aria-label="Expand walkthrough image"
              >
                <picture>
                  {activeWalkthroughStep.sources?.map((source) => (
                    <source
                      key={`${source.type}-${source.srcSet}`}
                      srcSet={source.srcSet}
                      type={source.type}
                    />
                  ))}
                  <img
                    src={activeWalkthroughStep.src}
                    alt={activeWalkthroughStep.alt}
                    loading="lazy"
                    decoding="async"
                  />
                </picture>
              </button>
              {activeWalkthroughStep.caption ? (
                <figcaption>{activeWalkthroughStep.caption}</figcaption>
              ) : null}
            </figure>

            <div className="trust-walkthrough-copy">
              <p className="trust-walkthrough-step-label">
                Step {activeWalkthroughIndex + 1} of {walkthroughSteps.length}
              </p>
              <h3>{activeWalkthroughStep.title}</h3>
              <p>{activeWalkthroughStep.description}</p>
              <div className="trust-walkthrough-controls">
                <button
                  type="button"
                  className="trust-walkthrough-button"
                  onClick={() =>
                    setWalkthroughIndex((current) =>
                      current === 0 ? walkthroughSteps.length - 1 : current - 1,
                    )
                  }
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="trust-walkthrough-button"
                  onClick={() =>
                    setWalkthroughIndex((current) =>
                      current === walkthroughSteps.length - 1 ? 0 : current + 1,
                    )
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="trust-walkthrough-step-list">
            {walkthroughSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                className={
                  index === activeWalkthroughIndex
                    ? "trust-walkthrough-step-pill is-active"
                    : "trust-walkthrough-step-pill"
                }
                onClick={() => setWalkthroughIndex(index)}
                aria-label={`Show ${step.title}`}
              >
                {index + 1}. {step.title}
              </button>
            ))}
          </div>

          {isWalkthroughImageExpanded ? (
            <button
              type="button"
              className="trust-walkthrough-lightbox"
              aria-label="Close expanded walkthrough image"
              onClick={() => setIsWalkthroughImageExpanded(false)}
            >
              <figure>
                <img
                  src={activeWalkthroughStep.src}
                  alt={activeWalkthroughStep.alt}
                  loading="eager"
                  decoding="async"
                />
                {activeWalkthroughStep.caption ? (
                  <figcaption>{activeWalkthroughStep.caption}</figcaption>
                ) : null}
              </figure>
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <h2>
          {article.publishReady
            ? "Content"
            : Array.isArray(article.bodySections)
              ? "Draft Content"
              : "Writing Blueprint"}
        </h2>
        {Array.isArray(article.bodySections) ? (
          <div className="marketing-faq-grid">
            {article.bodySections.map((section) => (
              <article className="marketing-faq-item" key={section.heading}>
                <h3>{section.heading}</h3>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </article>
            ))}
          </div>
        ) : (
          <div className="marketing-faq-grid">
            {article.sectionPrompts.map((prompt) => (
              <article className="marketing-faq-item" key={prompt}>
                <h3>Section Prompt</h3>
                <p>{prompt}</p>
              </article>
            ))}
          </div>
        )}
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
