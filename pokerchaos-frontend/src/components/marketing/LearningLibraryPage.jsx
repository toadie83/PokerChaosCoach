import { useEffect, useMemo, useState } from "react";

import {
  requestLearningResources,
  requestLearningTaxonomy,
} from "../../api/aiService.js";
import {
  groupLearningResources,
  isQuickLearningResource,
  learningLabel,
} from "../../lib/learningPresentation.js";
import { setLearningPageMeta } from "../../lib/learningPageMeta.js";
import PlaybackBrand from "../PlaybackBrand.jsx";
import MarketingSiteShell from "./MarketingSiteShell.jsx";

export default function LearningLibraryPage() {
  const [resources, setResources] = useState([]);
  const [taxonomy, setTaxonomy] = useState(null);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    setLearningPageMeta({
      title: "Poker Learning Library | Playback Poker",
      description:
        "Browse tournament poker Quick Lessons, articles, and guides used by Playback Poker Study Spots.",
      path: "/learn",
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([
      requestLearningResources({ category, search }),
      taxonomy ? Promise.resolve(taxonomy) : requestLearningTaxonomy(),
    ])
      .then(([resourcePayload, taxonomyPayload]) => {
        if (cancelled) return;
        setResources(resourcePayload?.resources || []);
        setTaxonomy(taxonomyPayload);
        setStatus("ready");
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError?.message || "The Learning Library could not be loaded.",
        );
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [category, search]);

  const groups = useMemo(() => groupLearningResources(resources), [resources]);
  const categories = Object.keys(taxonomy?.categories || {});

  return (
    <MarketingSiteShell currentPath="/learn">
      <header className="learning-library-header">
        <div>
          <PlaybackBrand
            variant="primary"
            className="learning-library-brand"
            alt="Playback Poker"
          />
          <p className="marketing-kicker">Learning Library</p>
          <h1>Lessons built around the decisions tournament players face.</h1>
          <p>
            Browse focused Quick Lessons, articles, and guides used by Study
            Spots.
          </p>
          <p>New Lessons added Daily.</p>
        </div>
        <label className="learning-search">
          <span>Search lessons</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title or topic"
          />
        </label>
      </header>

      <nav className="learning-category-tabs" aria-label="Learning categories">
        <button
          type="button"
          className={!category ? "active" : ""}
          onClick={() => setCategory("")}
        >
          All
        </button>
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className={category === item ? "active" : ""}
            onClick={() => setCategory(item)}
          >
            {learningLabel(item)}
          </button>
        ))}
      </nav>

      {status === "loading" ? (
        <p className="learning-state">Loading lessons...</p>
      ) : null}
      {status === "error" ? (
        <p className="learning-state learning-state--error">{error}</p>
      ) : null}
      {status === "ready" && resources.length === 0 ? (
        <section className="learning-empty">
          <h2>No published lessons match this view.</h2>
          <p>Clear the filters to browse the complete library.</p>
        </section>
      ) : null}

      {status === "ready"
        ? groups.map(([group, items]) => (
            <section className="learning-library-section" key={group}>
              <div className="learning-section-title">
                <h2>{learningLabel(group)}</h2>
                <span>
                  {items.length} {items.length === 1 ? "resource" : "resources"}
                </span>
              </div>
              <div className="learning-resource-grid">
                {items.map((resource) => (
                  <article
                    className={`learning-resource-card ${isQuickLearningResource(resource) ? "learning-resource-card--quick" : "learning-resource-card--article"}`}
                    key={resource.id}
                  >
                    <div className="learning-card-meta">
                      <span>{learningLabel(resource.resourceType)}</span>
                      {resource.series && resource.lessonNumber ? (
                        <span>
                          {resource.series} #
                          {String(resource.lessonNumber).padStart(3, "0")}
                        </span>
                      ) : null}
                    </div>
                    <h3>
                      <a href={resource.canonicalPath}>{resource.title}</a>
                    </h3>
                    <p>{resource.description}</p>
                    <div className="learning-card-tags">
                      {[
                        resource.primaryTag,
                        ...(resource.secondaryTags || []).slice(0, 2),
                      ]
                        .filter(Boolean)
                        .map((tag) => (
                          <span key={tag}>{learningLabel(tag)}</span>
                        ))}
                    </div>
                    <a
                      className="learning-card-action"
                      href={resource.canonicalPath}
                    >
                      {isQuickLearningResource(resource)
                        ? "Open lesson"
                        : "Read article"}
                    </a>
                  </article>
                ))}
              </div>
            </section>
          ))
        : null}
    </MarketingSiteShell>
  );
}
