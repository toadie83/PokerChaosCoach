import ActionButtons from "../ActionButtons.jsx";

const STREET_LABELS = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

export default function ActionCard({
  street,
  actions = [],
  onAction,
  coach,
  loading,
  highlightedActionCodes = [],
  confidenceValue = null,
}) {
  const streetLabel = STREET_LABELS[street] || "Actions";

  const suggestion = coach?.hero_action || "";
  const sizing = coach?.sizing || "";
  const flavor = coach?.flavor_text || "";

  return (
    <div className="play-hand-card">
      <h2 className="play-hand-card-title">{streetLabel} decisions</h2>
      <p className="play-hand-card-subtitle">
        Lock in the action you want to take. Keyboard shortcuts still work in Play Hand mode.
      </p>
      <div className="play-hand-actions">
        <ActionButtons
          actions={actions}
          onAction={onAction}
          embedded
          disabled={loading}
          highlightedCodes={highlightedActionCodes}
        />
      </div>
      <div className="play-hand-coach">
        {loading ? (
          <span className="play-hand-coach-status">Coach is thinking...</span>
        ) : suggestion ? (
          <div className="play-hand-coach-suggestion">
            <div className="play-hand-coach-line">
              <span className="coach-label">Suggested line:</span>
              <strong>{suggestion}</strong>
            </div>
            {sizing ? (
              <div className="play-hand-coach-line">
                <span className="coach-label">Sizing:</span>
                <strong>{sizing}</strong>
              </div>
            ) : null}
            {confidenceValue !== null ? (
              <div className="play-hand-confidence">
                <span className="confidence-label">Confidence</span>
                <div className="confidence-bar">
                  <div
                    className="confidence-fill"
                    style={{ width: `${Math.max(0, Math.min(100, confidenceValue))}%` }}
                  />
                </div>
                <span className="confidence-value">{Math.round(confidenceValue)}%</span>
              </div>
            ) : null}
            {flavor ? <div className="play-hand-coach-flavor">{flavor}</div> : null}
          </div>
        ) : (
          <span className="play-hand-coach-status">No advice yet - take an action to continue.</span>
        )}
      </div>
    </div>
  );
}
