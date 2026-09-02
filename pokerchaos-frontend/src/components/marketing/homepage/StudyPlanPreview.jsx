import StudySpotCard from "./StudySpotCard.jsx";

export default function StudyPlanPreview({ spots, compact = false }) {
  return (
    <div className={`home-v2-study-plan${compact ? " is-compact" : ""}`}>
      <header className="home-v2-plan-header">
        <div>
          <span className="home-v2-plan-eyebrow">
            <span aria-hidden="true">✓</span>
            Tournament analysed
          </span>
          <h2>Sunday Deepstack · $22</h2>
          <p>23 August · 1,284 entries · 412th</p>
        </div>
        <span className="home-v2-free-badge">Free preview</span>
      </header>

      <div className="home-v2-plan-metrics">
        <div>
          <strong>3</strong>
          <span>Study Spots</span>
        </div>
        <div>
          <strong>Blind vs blind</strong>
          <span>Priority theme</span>
        </div>
        <div>
          <strong>3</strong>
          <span>Matched lessons</span>
        </div>
      </div>

      <div className="home-v2-plan-list">
        <div className="home-v2-plan-list-heading">
          <span>Priority Study Spots</span>
          <small>Based on your tournament</small>
        </div>
        {spots.map((spot, index) => (
          <StudySpotCard
            key={spot.title}
            spot={spot}
            rank={index + 1}
            compact={compact}
          />
        ))}
      </div>

      <footer className="home-v2-plan-footer">
        <span><span aria-hidden="true">◇</span> Ranked by learning value</span>
        <span><span aria-hidden="true">↗</span> Matched to your game</span>
      </footer>
    </div>
  );
}
