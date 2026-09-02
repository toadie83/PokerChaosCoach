export default function MatchedLesson({ lesson, lessonType, href = "/learn", compact = false }) {
  return (
    <div className={`home-v2-matched-lesson${compact ? " is-compact" : ""}`}>
      <div>
        <span>Matched lesson</span>
        <strong>{lesson}</strong>
        {!compact && lessonType ? <small>{lessonType}</small> : null}
      </div>
      <a href={href} aria-label={`View lesson: ${lesson}`}>
        <span>{compact ? "View" : "View lesson"}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 4.5 12.5 10 7 15.5" />
        </svg>
      </a>
    </div>
  );
}
