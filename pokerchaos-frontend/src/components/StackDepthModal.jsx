import { useEffect, useMemo, useState } from "react";

function normalizeStack(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

function normalizeRemainingStack(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

export default function StackDepthModal({
  open,
  heroStack,
  villainStack,
  heroRemainingStack,
  villainRemainingStack,
  heroRemainingOverrideActive = false,
  villainRemainingOverrideActive = false,
  currentPot,
  potOverrideActive = false,
  villainRanges = [],
  onClose,
  onSave,
}) {
  const [heroValue, setHeroValue] = useState(heroStack ?? "");
  const [villainValue, setVillainValue] = useState(villainStack ?? "");
  const [heroRemainingValue, setHeroRemainingValue] = useState("");
  const [villainRemainingValue, setVillainRemainingValue] = useState("");
  const [potValue, setPotValue] = useState("");

  const rangeDisplay = useMemo(() => {
    const items = Array.isArray(villainRanges) ? villainRanges : [];
    return items.filter((item) => item && typeof item === "object");
  }, [villainRanges]);

  useEffect(() => {
    if (open) {
      setHeroValue(heroStack ?? "");
      setVillainValue(villainStack ?? "");
      setHeroRemainingValue(
        heroRemainingOverrideActive ? (heroRemainingStack ?? "") : "",
      );
      setVillainRemainingValue(
        villainRemainingOverrideActive ? (villainRemainingStack ?? "") : "",
      );
      setPotValue(potOverrideActive ? (currentPot ?? "") : "");
    }
  }, [
    open,
    heroStack,
    villainStack,
    heroRemainingStack,
    villainRemainingStack,
    heroRemainingOverrideActive,
    villainRemainingOverrideActive,
    currentPot,
    potOverrideActive,
  ]);

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
      heroRemainingStack: normalizeRemainingStack(heroRemainingValue),
      villainRemainingStack: normalizeRemainingStack(villainRemainingValue),
      potOverride:
        potValue === "" && !potOverrideActive
          ? undefined
          : normalizeStack(potValue),
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
            Starting stacks anchor the hand. Coach subtracts every recorded action to
            calculate the chips remaining at each decision.
          </p>
          <div className="drawer-row" style={{ marginTop: 12 }}>
            <label className="pill-label" htmlFor="stackDepthHero">
              Starting Hero stack (BB)
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
              Starting opponent stack (BB)
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
          <div className="drawer-row" style={{ marginTop: 20 }}>
            <label className="pill-label" htmlFor="stackDepthHeroRemaining">
              Hero remaining now (BB)
            </label>
            <input
              id="stackDepthHeroRemaining"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              value={heroRemainingValue}
              placeholder={
                heroRemainingStack === null || heroRemainingStack === undefined
                  ? "Unknown"
                  : `Estimated ${heroRemainingStack}`
              }
              onChange={(e) => setHeroRemainingValue(e.target.value)}
            />
          </div>
          <div className="drawer-row" style={{ marginTop: 12 }}>
            <label className="pill-label" htmlFor="stackDepthVillainRemaining">
              Opponent remaining now (BB)
            </label>
            <input
              id="stackDepthVillainRemaining"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              value={villainRemainingValue}
              placeholder={
                villainRemainingStack === null || villainRemainingStack === undefined
                  ? "Unknown"
                  : `Estimated ${villainRemainingStack}`
              }
              onChange={(e) => setVillainRemainingValue(e.target.value)}
            />
          </div>
          <div className="drawer-row" style={{ marginTop: 12 }}>
            <label className="pill-label" htmlFor="stackDepthCurrentPot">
              Current pot now (BB)
            </label>
            <input
              id="stackDepthCurrentPot"
              type="number"
              min={0.01}
              step="0.1"
              inputMode="decimal"
              value={potValue}
              placeholder={
                currentPot === null || currentPot === undefined
                  ? "Unknown"
                  : `Estimated ${currentPot}`
              }
              onChange={(e) => setPotValue(e.target.value)}
            />
          </div>
          <p className="sub" style={{ marginTop: 12 }}>
            Remaining-stack and pot entries are optional live overrides. Future actions
            continue updating them. Clear an existing override to return to Coach estimates.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={handleSave}>
            Save stack and pot state
          </button>
        </div>
      </div>
    </div>
  );
}
