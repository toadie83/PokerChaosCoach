import { useEffect, useRef, useState } from "react";

export default function ChaosHud({ mood }) {
  const [pulse, setPulse] = useState(false);
  const prevLevelRef = useRef(mood?.level ?? 0);
  const level = mood?.level ?? 0;
  const percentage = Math.min(Math.max((level / 5) * 100, 0), 100);

  useEffect(() => {
    if (level !== prevLevelRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 400);
      prevLevelRef.current = level;
      return () => clearTimeout(t);
    }
  }, [level]);

  if (typeof level !== "number") return null;

  return (
    <div className="chaos-bar-container" title={`Chaos level ${level}/5`}>
      <div
        className={`chaos-bar ${pulse ? "chaos-bar-pulse" : ""}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
