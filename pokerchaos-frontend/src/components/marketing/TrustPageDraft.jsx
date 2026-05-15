import { useEffect, useState } from "react";
import mobileNavWordmark from "../../assets/brand/playback-nav-image-mobile.png";
import { LANDING_PAGE_LABELS } from "./articleCatalog.js";
import { getTrustPageByPath } from "./trustCatalog.js";

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

export default function TrustPageDraft({ path }) {
  const page = getTrustPageByPath(path);
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);
  const [isWalkthroughImageExpanded, setIsWalkthroughImageExpanded] = useState(false);
  const [isHeroImageExpanded, setIsHeroImageExpanded] = useState(false);
  const walkthroughSteps = Array.isArray(page?.walkthroughSteps)
    ? page.walkthroughSteps
    : [];
  const hasWalkthrough = walkthroughSteps.length > 0;
  const activeWalkthroughIndex = hasWalkthrough
    ? Math.min(walkthroughIndex, walkthroughSteps.length - 1)
    : 0;
  const activeWalkthroughStep = hasWalkthrough
    ? walkthroughSteps[activeWalkthroughIndex]
    : null;

  useEffect(() => {
    if (!page) {
      document.title = "Page Not Found | Playback Poker";
      upsertMetaTag({
        name: "description",
        content: "The requested trust page could not be found.",
      });
      upsertMetaTag({ name: "robots", content: "noindex,follow" });
      upsertCanonicalTag(`${window.location.origin}/`);
      return;
    }

    const pageUrl = `${window.location.origin}${page.path}`;
    const pageTitle = `${page.title} | Playback Poker`;
    const robotsValue = page.publishReady ? "index,follow" : "noindex,follow";

    document.title = pageTitle;
    upsertMetaTag({ name: "description", content: page.description });
    upsertMetaTag({ name: "robots", content: robotsValue });
    upsertMetaTag({ property: "og:title", content: pageTitle });
    upsertMetaTag({ property: "og:description", content: page.description });
    upsertMetaTag({ property: "og:type", content: "website" });
    upsertMetaTag({ property: "og:url", content: pageUrl });
    upsertCanonicalTag(pageUrl);

    const pageType = page.path === "/about" ? "AboutPage" : "WebPage";
    upsertJsonLdScript("seo-schema-trust-page", {
      "@context": "https://schema.org",
      "@type": pageType,
      name: page.title,
      description: page.description,
      url: pageUrl,
      dateModified: page.updatedAt,
      isPartOf: {
        "@type": "WebSite",
        name: "Playback Poker",
        url: window.location.origin,
      },
    });
  }, [page]);

  useEffect(() => {
    setWalkthroughIndex(0);
  }, [page?.path]);

  useEffect(() => {
    setIsWalkthroughImageExpanded(false);
    setIsHeroImageExpanded(false);
  }, [page?.path, activeWalkthroughIndex]);

  if (!page) {
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
          <p className="marketing-kicker">Trust Page</p>
          <h1 className="marketing-title">Page Not Found</h1>
          <a className="auth-button marketing-cta-button" href="/">
            Return Home
          </a>
        </section>
      </main>
    );
  }

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
        <div
          className={
            page.heroMedia
              ? "trust-hero-layout trust-hero-layout-with-media"
              : "trust-hero-layout"
          }
        >
          <div className="trust-hero-copy">
            <p className="marketing-kicker">
              {page.publishReady ? page.kicker : `${page.kicker} Draft`}
            </p>
            <h1 className="marketing-title">{page.title}</h1>
            <p className="marketing-subtitle">{page.description}</p>
            {!page.publishReady ? (
              <div className="marketing-proof-row">
                <span className="marketing-pill">Status: Draft Framework</span>
                <span className="marketing-pill">Robots: noindex,follow</span>
                <span className="marketing-pill">Updated: {page.updatedAt}</span>
              </div>
            ) : null}
          </div>
          {page.heroMedia ? (
            <figure className="trust-hero-media">
              {page.heroMedia.zoomEnabled === false ? (
                <picture>
                  {page.heroMedia.sources?.map((source) => (
                    <source
                      key={`${source.type}-${source.srcSet}`}
                      srcSet={source.srcSet}
                      type={source.type}
                      sizes={page.heroMedia.sizes}
                    />
                  ))}
                  <img
                    src={page.heroMedia.src}
                    alt={page.heroMedia.alt}
                    sizes={page.heroMedia.sizes}
                    loading={page.heroMedia.loading || "lazy"}
                    decoding={page.heroMedia.decoding || "async"}
                    onError={(event) => {
                      event.currentTarget.closest(".trust-hero-media")?.classList.add("is-missing");
                    }}
                  />
                </picture>
              ) : (
                <button
                  type="button"
                  className="trust-hero-media-trigger"
                  onClick={() => setIsHeroImageExpanded((current) => !current)}
                  aria-label="Expand hero image"
                >
                  <picture>
                    {page.heroMedia.sources?.map((source) => (
                      <source
                        key={`${source.type}-${source.srcSet}`}
                        srcSet={source.srcSet}
                        type={source.type}
                        sizes={page.heroMedia.sizes}
                      />
                    ))}
                    <img
                      src={page.heroMedia.src}
                      alt={page.heroMedia.alt}
                      sizes={page.heroMedia.sizes}
                      loading={page.heroMedia.loading || "lazy"}
                      decoding={page.heroMedia.decoding || "async"}
                      onError={(event) => {
                        event.currentTarget.closest(".trust-hero-media")?.classList.add("is-missing");
                      }}
                    />
                  </picture>
                </button>
              )}
              {page.heroMedia.caption ? (
                <figcaption>{page.heroMedia.caption}</figcaption>
              ) : null}
            </figure>
          ) : null}
        </div>

        {page.heroMedia && page.heroMedia.zoomEnabled !== false && isHeroImageExpanded ? (
          <button
            type="button"
            className="trust-walkthrough-lightbox"
            aria-label="Close expanded hero image"
            onClick={() => setIsHeroImageExpanded(false)}
          >
            <figure>
              <img
                src={page.heroMedia.src}
                alt={page.heroMedia.alt}
                loading="eager"
                decoding="async"
              />
              {page.heroMedia.caption ? (
                <figcaption>{page.heroMedia.caption}</figcaption>
              ) : null}
            </figure>
          </button>
        ) : null}
      </section>

      {hasWalkthrough ? (
        <section className="panel">
          <h2>{page.walkthroughTitle || "How-To Walkthrough"}</h2>
          {page.walkthroughIntro ? (
            <p className="trust-walkthrough-intro">{page.walkthroughIntro}</p>
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
          {page.publishReady
            ? "Content"
            : Array.isArray(page.bodySections)
              ? "Draft Content"
              : "Draft Blueprint"}
        </h2>
        {Array.isArray(page.bodySections) ? (
          <div className="marketing-faq-grid">
            {page.bodySections.map((section) => (
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
            {page.sectionPrompts.map((prompt) => (
              <article className="marketing-faq-item" key={prompt}>
                <h3>Section Prompt</h3>
                <p>{prompt}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Internal Links For This Page</h2>
        <div className="article-link-stack">
          <a className="article-link article-link-strong" href={page.primaryLandingPath}>
            Primary landing page: {LANDING_PAGE_LABELS[page.primaryLandingPath]}
          </a>
          <a className="article-link" href="/">
            Homepage: Playback Poker
          </a>
          <a className="article-link" href="/articles">
            Related content hub: Articles
          </a>
        </div>
      </section>
    </main>
  );
}
