import { useEffect, useRef, useState } from "react";

export default function ChaosHud({ mood }) {
  const [pulse, setPulse] = useState(false);
  const prevLevelRef = useRef(mood?.level ?? 0);

  useEffect(() => {
    const level = mood?.level ?? 0;
    if (level !== prevLevelRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 450);
      prevLevelRef.current = level;
      return () => clearTimeout(t);
    }
  }, [mood?.level]);

  if (!mood?.emoji) return null;
  return (
    <div className="chaos-hud">
      <span
        className={`chaos-hud-emoji ${pulse ? "chaos-pulse" : ""}`}
        title={`Chaos: ${mood.level}`}
      >
        {mood.emoji}
      </span>
      <span className="chaos-hud-label">Chaos</span>
    </div>
  );
}

