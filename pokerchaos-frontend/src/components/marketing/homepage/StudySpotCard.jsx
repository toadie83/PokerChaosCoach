import MatchedLesson from "./MatchedLesson.jsx";

export default function StudySpotCard({ spot, rank, compact = false }) {
  return (
    <article className={`home-v2-spot-card${compact ? " is-compact" : ""}`}>
      <div className="home-v2-spot-rank" aria-label={`Study priority ${rank}`}>
        {rank}
      </div>
      <div className="home-v2-spot-body">
        <div className="home-v2-spot-heading">
          <span>{spot.category}</span>
          <small>{spot.context}</small>
        </div>
        <h3>{spot.title}</h3>
        {!compact ? <p>{spot.reason}</p> : null}
      </div>
      <MatchedLesson
        lesson={spot.lesson}
        lessonType={spot.lessonType}
        href={spot.href}
        compact={compact}
      />
    </article>
  );
}
