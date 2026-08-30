import { useEffect, useState } from "react";

import { requestLearningResource } from "../../api/aiService.js";
import { learningLabel, learningResourceSlugFromPath } from "../../lib/learningPresentation.js";
import { setLearningPageMeta } from "../../lib/learningPageMeta.js";
import LearningLessonContent from "../learning/LearningLessonContent.jsx";
import MarketingSiteShell from "./MarketingSiteShell.jsx";

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
      <div className="learning-lesson-page">
        <LearningLessonContent resource={resource} />
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
      </div>
    </MarketingSiteShell>
  );
}
