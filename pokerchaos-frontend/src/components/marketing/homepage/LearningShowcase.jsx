import {
  isQuickLearningResource,
  learningLabel,
} from "../../../lib/learningPresentation.js";

function findResource(resources, predicate) {
  return resources.find(predicate) || null;
}

export default function LearningShowcase({ resources, status }) {
  const dailyLesson = findResource(
    resources,
    (resource) => String(resource?.series || "").toLowerCase().includes("daily mtt edge"),
  );
  const quickLesson = findResource(
    resources,
    (resource) => isQuickLearningResource(resource)
      && (!dailyLesson?.canonicalPath || resource?.canonicalPath !== dailyLesson.canonicalPath),
  ) || findResource(resources, isQuickLearningResource);
  const studyArticle = findResource(resources, (resource) => !isQuickLearningResource(resource));
  const pathways = [
    {
      number: "01",
      type: "Quick Lesson",
      title: quickLesson?.title || "Fix one repeatable decision",
      description: quickLesson?.description || "A short explanation for the exact blind-versus-blind decision.",
      href: quickLesson?.canonicalPath || "/learn",
      meta: quickLesson ? learningLabel(quickLesson.category) : "5–7 minute lesson",
    },
    {
      number: "02",
      type: "Daily MTT Edge lesson",
      title: dailyLesson?.shortTitle || dailyLesson?.title || "Keep one idea sharp every day",
      description: dailyLesson?.description || "A compact drill to reinforce the adjustment in your next tournament.",
      href: dailyLesson?.canonicalPath || "/learn",
      meta: dailyLesson?.lessonNumber ? `Lesson ${dailyLesson.lessonNumber}` : "One practical lesson",
    },
    {
      number: "03",
      type: "Study Article",
      title: studyArticle?.title || "Build the concept behind the spot",
      description: studyArticle?.description || "Deeper reading for the wider strategic pattern behind the spot.",
      href: studyArticle?.canonicalPath || "/articles",
      meta: studyArticle ? learningLabel(studyArticle.category) : "Deeper MTT study",
    },
  ];

  return (
    <section className="home-v2-section home-v2-learning" id="learning-library">
      <div className="home-v2-section-heading">
        <p className="home-v2-kicker">The Playback Poker learning loop</p>
        <h2>Your tournament tells you what to study next.</h2>
      </div>

      <div className="home-v2-learning-path">
        <article className="home-v2-learning-stage home-v2-learning-tournament">
          <header><span>01</span><strong>Tournament</strong></header>
          <div>
            <strong>Sunday Deepstack</strong>
            <small>1,284 entries · 412th place</small>
          </div>
        </article>
        <div className="home-v2-learning-connector" aria-hidden="true">
          <span>→</span><small>Detected</small>
        </div>
        <article className="home-v2-learning-stage home-v2-learning-spot">
          <header><span>02</span><strong>Study Spot</strong></header>
          <div>
            <strong>Blind vs Blind Defence</strong>
            <small>Repeated 4 times</small>
          </div>
          <span className="home-v2-learning-detected">Recurring pattern</span>
        </article>
        <div className="home-v2-learning-connector" aria-hidden="true">
          <span>→</span><small>Matched</small>
        </div>
        <div className="home-v2-learning-options" aria-busy={status === "loading"}>
          <header className="home-v2-learning-options-header">
            <div><span>03</span><strong>Matched Learning</strong></div>
            <small>Recommended for this pattern</small>
          </header>
          {pathways.map((pathway) => (
            <a href={pathway.href} className="home-v2-learning-option" key={pathway.type}>
              <span className="home-v2-learning-number">{pathway.number}</span>
              <div>
                <span>{pathway.type} · {pathway.meta}</span>
                <strong>{pathway.title}</strong>
                <p>{pathway.description}</p>
              </div>
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
      </div>
      <a className="home-v2-text-link home-v2-learning-cta" href="/learn">Explore the Learning Library <span>→</span></a>
      {status === "error" ? <p className="home-v2-learning-note">Live lesson titles are temporarily unavailable; the Learning Library remains accessible.</p> : null}
    </section>
  );
}
