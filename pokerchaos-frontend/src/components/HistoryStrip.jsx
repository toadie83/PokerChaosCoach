import { useMemo, useState } from "react";

const STREETS = ["preflop", "flop", "turn", "river"];
const STREET_LABELS = {
  preflop: "Pre",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

function formatSizing(sizing) {
  if (!sizing) return "";
  if (typeof sizing === "string") return sizing;
  if (sizing.kind === "percent") return `${sizing.value}%`;
  if (sizing.kind === "multiple") return `${sizing.value}x`;
  return "";
}

function describeAction(entry, heroSeat) {
  if (!entry) return "–";
  const actor =
    entry.actor === "hero"
      ? heroSeat
        ? heroSeat.toUpperCase()
        : "Hero"
      : "Villain";
  const sizing = formatSizing(entry.sizing);
  const parts = [actor, entry.action ? entry.action.toUpperCase() : null, sizing || null];
  return parts.filter(Boolean).join(" ");
}

function groupHistory(history) {
  return history.reduce((acc, item) => {
    const street = item.street || "preflop";
    if (!acc[street]) acc[street] = [];
    acc[street].push(item);
    return acc;
  }, {});
}

function formatLogLine(entry, heroSeat) {
  const actorLabel =
    entry.actor === "hero"
      ? heroSeat
        ? heroSeat.toUpperCase()
        : "Hero"
      : "Villain";
  const sizing = formatSizing(entry.sizing);
  const note = entry.note ? ` · ${entry.note}` : "";
  const sizingPart = sizing ? ` (${sizing})` : "";
  return `${actorLabel}: ${entry.action || "—"}${sizingPart}${note}`;
}

export default function HistoryStrip({ history = [], heroSeat }) {
  const [openStreet, setOpenStreet] = useState(null);
  const grouped = useMemo(() => groupHistory(history), [history]);
  const latestByStreet = useMemo(() => {
    return STREETS.reduce((acc, street) => {
      const events = grouped[street] || [];
      acc[street] = events.length ? events[events.length - 1] : null;
      return acc;
    }, {});
  }, [grouped]);

  const streetLogs = useMemo(() => {
    return Object.entries(grouped).reduce((acc, [street, entries]) => {
      acc[street] = entries.slice(-6); // keep recent per street
      return acc;
    }, {});
  }, [grouped]);

  return (
    <div className="history-strip">
      <div className="street-chip-row">
        {STREETS.map((street) => {
          const label = STREET_LABELS[street];
          const summary = describeAction(latestByStreet[street], heroSeat);
          const isActive = openStreet === street;
          return (
            <button
              key={street}
              type="button"
              className={`street-chip ${isActive ? "active" : ""}`}
              onClick={() => setOpenStreet((current) => (current === street ? null : street))}
              title={summary || `${label} street`}
            >
              <span className="street-chip-label">{label}</span>
              <span className="street-chip-summary">{summary || "—"}</span>
            </button>
          );
        })}
      </div>
      {openStreet ? (
        <div className="street-log">
          {(streetLogs[openStreet] || []).map((entry) => (
            <div key={`${entry.at}-${entry.action}`} className="street-log-item">
              {formatLogLine(entry, heroSeat)}
            </div>
          ))}
          {(streetLogs[openStreet] || []).length === 0 ? (
            <div className="street-log-empty">No recorded actions yet.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
