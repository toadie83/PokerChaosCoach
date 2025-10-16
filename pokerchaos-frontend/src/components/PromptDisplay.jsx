import { useEffect, useRef, useState } from "react";

export default function PromptDisplay({ coach, isLoading, onNextStreet, embedded = false, mood, handComplete = false, onResetHand, sizingNote }) {
  const { hero_action, sizing, flavor_text } = coach || {};
  const [pulse, setPulse] = useState(false);
  const prevLevelRef = useRef(mood?.level ?? 0);
  const [showSizing, setShowSizing] = useState(false);

  useEffect(() => {
    const level = mood?.level ?? 0;
    if (level !== prevLevelRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 450);
      prevLevelRef.current = level;
      return () => clearTimeout(t);
    }
  }, [mood?.level]);

  const body = (
    <>
      {isLoading ? (
        <p className="sub">Summoning chaos...</p>
      ) : coach ? (
        <div>
          <pre className="output">{flavor_text}</pre>
          <div className="hud-card" style={{ marginTop: 12 }}>
            <div className="hud-row">
              <span className="hud-label">Action</span>
              <span className="hud-value hud-action">{hero_action}</span>
            </div>
            <div className="hud-row">
              <span className="hud-label">Sizing</span>
              <span className="hud-value">{sizing || '-'}</span>
            </div>
            {sizingNote ? (
              <>
                {showSizing ? (
                  <div className="hud-row">
                    <span className="hud-label">≈</span>
                    <span className="hud-value" style={{ fontWeight: 600, color: 'var(--muted)' }}>{sizingNote}</span>
                  </div>
                ) : null}
                <div className="hud-row">
                  <span className="hud-label" />
                  <button type="button" className="link-btn" onClick={() => setShowSizing((v) => !v)}>
                    {showSizing ? 'Hide details' : 'Show details'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="sub">Trigger an event to get guidance.</p>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        {handComplete ? (
          <button onClick={onResetHand}>Start Next Hand</button>
        ) : (
          <button onClick={onNextStreet}>Next Street</button>
        )}
      </div>
    </>
  );

  if (embedded) return body;
  return (
    <div className="panel">
      <div className="title">ChaosCoach {mood?.emoji ? <span className={`chaos-badge ${pulse ? 'chaos-pulse' : ''}`} title={`Chaos: ${mood.level}`}>{mood.emoji}</span> : null}</div>
      <p className="sub">Swagger-filled guidance — no cards, no odds.</p>
      {body}
    </div>
  );
}
