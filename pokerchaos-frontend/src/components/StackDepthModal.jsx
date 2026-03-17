import { useEffect, useMemo, useState } from "react";

function normalizeStack(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

export default function StackDepthModal({
  open,
  heroStack,
  villainStack,
  villainRanges = [],
  onClose,
  onSave,
}) {
  const [heroValue, setHeroValue] = useState(heroStack ?? "");
  const [villainValue, setVillainValue] = useState(villainStack ?? "");

  const rangeDisplay = useMemo(() => {
    const items = Array.isArray(villainRanges) ? villainRanges : [];
    return items.filter((item) => item && typeof item === "object");
  }, [villainRanges]);

  useEffect(() => {
    if (open) {
      setHeroValue(heroStack ?? "");
      setVillainValue(villainStack ?? "");
    }
  }, [open, heroStack, villainStack]);

  const inferRangeCode = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return "";
    const match = rangeDisplay.find((range) => range.value === numeric);
    if (match) return match.code || "";
    if (numeric < 10) return "lt10";
    if (numeric < 20) return "10to20";
    if (numeric < 40) return "20to40";
    if (numeric < 60) return "40to60";
    return "60plus";
  };

  const heroRangeCode = inferRangeCode(heroValue);
  const villainRangeCode = inferRangeCode(villainValue);

  const applyRange = (range, target) => {
    if (!range) return;
    if (target === "hero") {
      setHeroValue(range.value ?? "");
    } else if (target === "villain") {
      setVillainValue(range.value ?? "");
    }
  };

  if (!open) return null;

  const handleSave = () => {
    onSave({
      heroStack: normalizeStack(heroValue),
      villainStack: normalizeStack(villainValue),
    });
  };

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Adjust Stack Depth</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p className="sub" style={{ marginTop: 0 }}>
            Update hero and villain effective stacks (in big blinds).
          </p>
          <div className="drawer-row" style={{ marginTop: 12 }}>
            <label className="pill-label" htmlFor="stackDepthHero">
              Hero stack (BB)
            </label>
            <input
              id="stackDepthHero"
              type="number"
              min={1}
              inputMode="numeric"
              value={heroValue}
              onChange={(e) => setHeroValue(e.target.value)}
            />
            {rangeDisplay.length > 0 ? (
              <select
                value={heroRangeCode}
                onChange={(e) => {
                  const next = rangeDisplay.find((item) => item.code === e.target.value);
                  applyRange(next, "hero");
                }}
              >
                {rangeDisplay.map((range) => (
                  <option key={`hero-${range.code || "custom"}`} value={range.code || ""}>
                    {range.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="drawer-row" style={{ marginTop: 12 }}>
            <label className="pill-label" htmlFor="stackDepthVillain">
              Villain stack (BB)
            </label>
            <input
              id="stackDepthVillain"
              type="number"
              min={1}
              inputMode="numeric"
              value={villainValue}
              onChange={(e) => setVillainValue(e.target.value)}
            />
            {rangeDisplay.length > 0 ? (
              <select
                value={villainRangeCode}
                onChange={(e) => {
                  const next = rangeDisplay.find((item) => item.code === e.target.value);
                  applyRange(next, "villain");
                }}
              >
                {rangeDisplay.map((range) => (
                  <option key={`villain-${range.code || "custom"}`} value={range.code || ""}>
                    {range.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <p className="sub" style={{ marginTop: 12 }}>
            Leave a field blank to clear that stack value.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave}>
            Save stacks
          </button>
        </div>
      </div>
    </div>
  );
}
