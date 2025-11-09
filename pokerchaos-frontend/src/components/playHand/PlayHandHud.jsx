const titleCaseStreet = (street) => {
  if (!street) return "Preflop";
  const normalized = String(street).replace(/_/g, " ").trim();
  if (!normalized) return "Preflop";
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatPotSize = (value) => {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "--";
  const numeric = Number(value);
  if (numeric >= 100) return `${Math.round(numeric)} BB`;
  if (numeric >= 10) return `${numeric.toFixed(1)} BB`;
  return `${numeric.toFixed(2)} BB`;
};

export default function PlayHandHud({
  heroSeat,
  heroSeatLabel,
  tableSize,
  street,
  potSize,
  villainTypeLabel,
  autoAdvance,
  onToggleAutoAdvance,
  relativePosition = "auto",
  onRelativePositionChange,
}) {
  const tableDisplay = tableSize ? `${tableSize}-max` : "--";
  const seatDisplay = heroSeat ? heroSeat.toUpperCase() : "--";
  const positionDisplay = heroSeatLabel || seatDisplay;
  const streetDisplay = titleCaseStreet(street);
  const potDisplay = formatPotSize(potSize);
  const villainDisplay = villainTypeLabel || "Unknown";

  return (
    <div className="play-hand-hud">
      <div className="hud-item">
        <span className="hud-label">Seat</span>
        <span className="hud-value">
          {seatDisplay}
          <span className="hud-sub">{tableDisplay}</span>
        </span>
      </div>
      <div className="hud-item">
        <span className="hud-label">Position</span>
        <span className="hud-value">{positionDisplay}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">Street</span>
        <span className="hud-value">{streetDisplay}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">Pot</span>
        <span className="hud-value">{potDisplay}</span>
      </div>
      <div className="hud-item">
        <span className="hud-label">Villain</span>
        <span className="hud-value">{villainDisplay}</span>
      </div>
      <div className="hud-item hud-toggle-item">
        <span className="hud-label">Positioning</span>
        <div className="hud-toggle-group">
          {[
            { code: "auto", label: "Auto" },
            { code: "ip", label: "IP" },
            { code: "oop", label: "OOP" },
          ].map((option) => (
            <button
              key={option.code}
              type="button"
              className={`hud-toggle ${relativePosition === option.code ? "active" : ""}`}
              onClick={() => onRelativePositionChange?.(option.code)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hud-item hud-toggle-item">
        <span className="hud-label">Auto advance</span>
        <button
          type="button"
          className={`hud-toggle ${autoAdvance ? "active" : ""}`}
          onClick={onToggleAutoAdvance}
        >
          {autoAdvance ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
