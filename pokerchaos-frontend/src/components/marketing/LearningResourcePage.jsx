import { useEffect, useState } from "react";

import { requestLearningResource } from "../../api/aiService.js";
import { learningLabel, learningResourceSlugFromPath } from "../../lib/learningPresentation.js";
import { setLearningPageMeta } from "../../lib/learningPageMeta.js";
import MarketingSiteShell from "./MarketingSiteShell.jsx";

function LessonSection({ title, children, tone = "" }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <section className={`learning-lesson-section ${tone ? `learning-lesson-section--${tone}` : ""}`}>
      <h2>{title}</h2>
      {Array.isArray(children) ? <ul>{children.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{children}</p>}
    </section>
  );
}

export default function LearningResourcePage({ routePath = window.location.pathname }) {
  const slug = learningResourceSlugFromPath(routePath);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    requestLearningResource(slug)
      .then((result) => {
        if (cancelled) return;
        setPayload(result);
        setStatus("ready");
        setLearningPageMeta({
          title: `${result.resource.title} | Playback Poker`,
          description: result.resource.description,
          path: result.resource.canonicalPath,
        });
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError?.message || "The lesson could not be loaded.");
        setStatus("error");
        document.title = "Lesson Not Found | Playback Poker";
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status !== "ready") {
    return (
      <MarketingSiteShell currentPath="/learn">
        <section className="learning-state-page">
          <h1>{status === "loading" ? "Loading lesson..." : "Lesson unavailable"}</h1>
          {error ? <p>{error}</p> : null}
          {status === "error" ? <a href="/learn">Return to Learning Library</a> : null}
        </section>
      </MarketingSiteShell>
    );
  }

  const resource = payload.resource;
  return (
    <MarketingSiteShell currentPath="/learn">
      <article className="learning-lesson-page">
        <header className="learning-lesson-header">
          <a href="/learn">Learning Library</a>
          <p>{learningLabel(resource.category)} / {learningLabel(resource.resourceType)}</p>
          <h1>{resource.title}</h1>
          <p className="learning-lesson-summary">{resource.description}</p>
          <div className="learning-card-tags">
            {[resource.primaryTag, ...(resource.secondaryTags || [])].filter(Boolean).map((tag) => <span key={tag}>{learningLabel(tag)}</span>)}
          </div>
        </header>

        <div className="learning-lesson-body">
          <LessonSection title="Core lesson">{resource.body}</LessonSection>
          <LessonSection title="Example spot">{resource.exampleSpot}</LessonSection>
          <LessonSection title="Common mistake" tone="warning">{resource.mistake}</LessonSection>
          <LessonSection title="Better play" tone="success">{resource.betterPlay}</LessonSection>
          <LessonSection title="When to use it">{resource.whenToUse}</LessonSection>
          <LessonSection title="When not to use it">{resource.whenNotToUse}</LessonSection>
          <LessonSection title="Takeaway" tone="takeaway">{resource.takeaway}</LessonSection>
        </div>

        {(payload.relatedResources || []).length > 0 ? (
          <section className="learning-related">
            <h2>Related lessons</h2>
            <div className="learning-resource-grid">
              {payload.relatedResources.map((related) => (
                <article className="learning-resource-card" key={related.id}>
                  <p className="learning-card-meta"><span>{learningLabel(related.category)}</span></p>
                  <h3><a href={related.canonicalPath}>{related.title}</a></h3>
                  <p>{related.description}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </MarketingSiteShell>
  );
}
