export default function TournamentAnalysisProgress({ steps, activeIndex = 2 }) {
  const progress = activeIndex >= steps.length - 1
    ? 100
    : Math.round(((activeIndex + 0.55) / steps.length) * 100);

  return (
    <div className="home-v2-analysis-card" aria-label="Example tournament analysis progress">
      <header>
        <div>
          <span className="home-v2-panel-number">02</span>
          <div>
            <p className="home-v2-panel-label">Analysing your tournament</p>
            <h3>Making the review useful</h3>
          </div>
        </div>
        <span className="home-v2-live-pill"><i /> Live preview</span>
      </header>

      <ol className="home-v2-progress-steps">
        {steps.map((step, index) => {
          const state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "waiting";
          return (
            <li key={step.title} data-state={state}>
              <span className="home-v2-progress-marker" aria-hidden="true">
                {state === "complete" ? "✓" : index + 1}
              </span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.description}</span>
              </div>
              {state === "active" ? <span className="home-v2-progress-pulse" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>

      <div className="home-v2-progress-total">
        <div><span style={{ width: `${progress}%` }} /></div>
        <p><strong>{progress}%</strong> complete</p>
      </div>
    </div>
  );
}
