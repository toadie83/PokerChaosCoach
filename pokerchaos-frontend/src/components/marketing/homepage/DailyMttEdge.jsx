import { learningLabel } from "../../../lib/learningPresentation.js";

export default function DailyMttEdge({ latestLesson }) {
  const lessonNumber = latestLesson?.lessonNumber
    ? `#${String(latestLesson.lessonNumber).padStart(3, "0")}`
    : "New lessons";
  const lessonPath = latestLesson?.canonicalPath || "/learn";

  return (
    <section className="home-v2-daily">
      <div className="home-v2-daily-intro">
        <p className="home-v2-kicker">Daily MTT Edge</p>
        <h2>A new practical MTT lesson every day.</h2>
        <p>Short lessons across preflop, postflop, tournament theory, hand reading, and exploitative play.</p>
      </div>
      <a className="home-v2-daily-cover" href={lessonPath}>
        <span className="home-v2-daily-cover-meta">
          <span>Daily MTT Edge</span>
          <span>{lessonNumber}</span>
        </span>
        <span className="home-v2-daily-cover-category">
          {latestLesson ? learningLabel(latestLesson.category) : "Tournament study"}
        </span>
        <strong>{latestLesson?.shortTitle || latestLesson?.title || "Focused lessons for decisions that repeat"}</strong>
        <span className="home-v2-daily-cover-action">
          {latestLesson ? "Read the full spot" : "Browse Daily MTT Edge"}
        </span>
      </a>
      <div className="home-v2-daily-actions">
        <a className="home-v2-button home-v2-button-secondary" href="/learn">Browse Daily MTT Edge</a>
        {latestLesson?.instagramUrl ? (
          <a href={latestLesson.instagramUrl} target="_blank" rel="noreferrer">View on Instagram</a>
        ) : null}
      </div>
    </section>
  );
}
