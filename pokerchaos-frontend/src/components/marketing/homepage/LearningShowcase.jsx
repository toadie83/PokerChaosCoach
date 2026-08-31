import {
  isQuickLearningResource,
  learningLabel,
} from "../../../lib/learningPresentation.js";

function LearningCard({ resource }) {
  const isQuickLesson = isQuickLearningResource(resource);
  return (
    <article className={`home-v2-learning-card ${isQuickLesson ? "home-v2-learning-card-quick" : "home-v2-learning-card-article"}`}>
      <div>
        <span>{isQuickLesson ? (resource.series || "Quick lesson") : learningLabel(resource.resourceType || "Study article")}</span>
        {resource.series && resource.lessonNumber ? <span>Lesson {resource.lessonNumber}</span> : null}
      </div>
      <span className="home-v2-learning-category">{learningLabel(resource.category)}</span>
      <h3><a href={resource.canonicalPath}>{resource.title}</a></h3>
      <p>{resource.description}</p>
      <a href={resource.canonicalPath}>{isQuickLesson ? "Read lesson" : "Read article"}</a>
    </article>
  );
}

export default function LearningShowcase({ resources, status }) {
  return (
    <section className="home-v2-section home-v2-learning" id="learning-library">
      <div className="home-v2-section-heading home-v2-section-heading-split">
        <div>
          <p className="home-v2-kicker">Learning Library</p>
          <h2>Learn from the spots you actually play.</h2>
        </div>
        <a className="home-v2-text-link" href="/learn">Explore the Learning Library</a>
      </div>
      {status === "loading" ? (
        <div className="home-v2-learning-grid" aria-label="Loading published lessons">
          {[0, 1, 2].map((item) => <div className="home-v2-learning-skeleton" key={item} />)}
        </div>
      ) : null}
      {status === "ready" && resources.length > 0 ? (
        <div className="home-v2-learning-grid">
          {resources.map((resource) => <LearningCard resource={resource} key={resource.id} />)}
        </div>
      ) : null}
      {status !== "loading" && resources.length === 0 ? (
        <div className="home-v2-learning-empty">
          <strong>{status === "error" ? "Lessons are unavailable right now." : "The library is growing."}</strong>
          <span>{status === "error" ? "Open the Learning Library to try again." : "Browse all currently published tournament lessons."}</span>
          <a href="/learn">Open the Learning Library</a>
        </div>
      ) : null}
    </section>
  );
}
