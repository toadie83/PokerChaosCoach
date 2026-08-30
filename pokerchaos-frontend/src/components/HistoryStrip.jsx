import { useEffect, useMemo, useState } from "react";
import { getTournamentStageMeta } from "../config/tournamentStageConfig.js";
import CoachStateReceipt from "./CoachStateReceipt.jsx";

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

function actionAmountBB(entry) {
  const isCall = String(entry?.action || "").toLowerCase() === "call";
  const value = isCall
    ? entry?.amountBB ?? entry?.toAmountBB
    : entry?.toAmountBB ?? entry?.amountBB;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function describeAction(entry, heroSeat) {
  if (!entry) return "";
  const actor =
    entry.actor === "hero"
      ? heroSeat
        ? heroSeat.toUpperCase()
        : "Hero"
      : entry.seat || "Villain";
  const sizing = formatSizing(entry.sizing);
  const amount = actionAmountBB(entry);
  const parts = [
    actor,
    entry.action ? entry.action.toUpperCase() : null,
    amount ? `${amount} BB` : sizing || null,
  ];
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
      : entry.seat || "Villain";
  const sizing = formatSizing(entry.sizing);
  const note = entry.note ? ` · ${entry.note}` : "";
  const amount = actionAmountBB(entry);
  const sizingPart = amount ? ` (${amount} BB)` : sizing ? ` (${sizing})` : "";
  return `${actorLabel}: ${entry.action || "—"}${sizingPart}${note}`;
}

function formatCoachAction(coach) {
  const action = String(coach?.hero_action || "")
    .replaceAll("_", " ")
    .trim()
    .toUpperCase();
  const sizing = formatSizing(coach?.sizing);
  return [action, sizing].filter(Boolean).join(" · ");
}

function hasCoachGuidance(coach) {
  const action = String(coach?.hero_action || "").trim();
  return Boolean(action && action !== "...");
}

export default function HistoryStrip({
  history = [],
  heroSeat,
  currentStreet = "preflop",
  coachByStreet = {},
  initialOpenStreet = null,
  maxEntriesPerStreet = 6,
}) {
  const [openStreet, setOpenStreet] = useState(initialOpenStreet);
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
      const limit = Math.max(1, Number(maxEntriesPerStreet) || 6);
      acc[street] = entries.slice(-limit);
      return acc;
    }, {});
  }, [grouped, maxEntriesPerStreet]);

  useEffect(() => {
    if (
      openStreet &&
      !(grouped[openStreet] || []).length &&
      !hasCoachGuidance(coachByStreet[openStreet])
    ) {
      setOpenStreet(null);
    }
  }, [coachByStreet, grouped, openStreet]);

  const openCoach = openStreet ? coachByStreet[openStreet] : null;
  const openLogs = openStreet ? streetLogs[openStreet] || [] : [];
  const openCoachAction = formatCoachAction(openCoach);
  const coachFlavor = String(openCoach?.flavor_text || "").trim();
  const coachReasoning = String(openCoach?.reasoning || "").trim();
  const coachAssumptions = Array.isArray(openCoach?.assumptions)
    ? openCoach.assumptions.filter(Boolean)
    : [];
  const coachTournamentStage = String(openCoach?.tournamentStage || "").trim();
  const coachTournamentStageMeta = coachTournamentStage
    ? getTournamentStageMeta(coachTournamentStage)
    : null;
  const coachPotOdds = openCoach?.potOdds || null;

  return (
    <div className="history-strip" aria-label="Hand progress">
      <div className="street-chip-row">
        {STREETS.map((street) => {
          const label = STREET_LABELS[street];
          const summary = describeAction(latestByStreet[street], heroSeat);
          const isActive = openStreet === street;
          const hasEvents = Boolean((grouped[street] || []).length);
          const hasCoach = hasCoachGuidance(coachByStreet[street]);
          const hasContent = hasEvents || hasCoach;
          const isCurrent = currentStreet === street;
          return (
            <div
              key={street}
              className={`street-timeline-step${hasContent ? " has-events" : ""}${
                isCurrent ? " current" : ""
              }`}
            >
              <button
                type="button"
                className={`street-chip${isActive ? " active" : ""}`}
                onClick={() =>
                  setOpenStreet((current) => (current === street ? null : street))
                }
                title={hasContent ? `Review ${label}` : `${label} street`}
                disabled={!hasContent}
                aria-current={isCurrent ? "step" : undefined}
                aria-expanded={hasContent ? isActive : undefined}
              >
                <span className="street-marker" aria-hidden="true" />
                <span className="street-chip-label">{label}</span>
                <span className="street-chip-summary">
                  {summary ||
                    (hasCoach
                      ? `Coach ${String(coachByStreet[street].hero_action).toUpperCase()}`
                      : isCurrent
                        ? "Current"
                        : "—")}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {openStreet ? (
        <div
          className="street-log"
          role="region"
          aria-label={`${STREET_LABELS[openStreet]} street review`}
        >
          {hasCoachGuidance(openCoach) ? (
            <div className="street-coach-review">
              <div className="street-coach-review-header">
                <div>
                  <div className="street-review-eyebrow">Latest coach</div>
                  <div className="street-coach-action">{openCoachAction}</div>
                </div>
                {openCoach.confidence ? (
                  <span
                    className={`decision-confidence confidence-${openCoach.confidence}`}
                  >
                    {String(openCoach.confidence).toUpperCase()} confidence
                  </span>
                ) : null}
              </div>
              {coachFlavor ? <p>{coachFlavor}</p> : null}
              {coachTournamentStageMeta ? (
                <p className="street-coach-stage">
                  <strong>Stage:</strong> {coachTournamentStageMeta.label}
                </p>
              ) : null}
              {coachPotOdds ? (
                <p className="street-coach-pot-odds">
                  <strong>Pot odds:</strong> {coachPotOdds.requiredEquityPct}% needed
                  {` · Call ${coachPotOdds.callAmountBB} BB · ${coachPotOdds.potAfterCallBB} BB after calling`}
                </p>
              ) : null}
              {coachReasoning && coachReasoning !== coachFlavor ? (
                <p>
                  <strong>Why:</strong> {coachReasoning}
                </p>
              ) : null}
              {openCoach.alternative_action ? (
                <p>
                  <strong>Alternative:</strong>{" "}
                  {String(openCoach.alternative_action).toUpperCase()}
                  {openCoach.alternative_sizing
                    ? ` · ${openCoach.alternative_sizing}`
                    : ""}
                </p>
              ) : null}
              {coachAssumptions.length ? (
                <p className="street-coach-assumptions">
                  <strong>Assumptions:</strong> {coachAssumptions.join("; ")}
                </p>
              ) : null}
              {openCoach.decision_receipt ? (
                <CoachStateReceipt compact receipt={openCoach.decision_receipt} />
              ) : null}
            </div>
          ) : (
            <div className="street-log-empty">
              No coach guidance was captured for this street.
            </div>
          )}
          {openLogs.length ? (
            <div className="street-action-log">
              <div className="street-review-eyebrow">Recorded actions</div>
              {openLogs.map((entry) => (
                <div key={`${entry.at}-${entry.action}`} className="street-log-item">
                  {formatLogLine(entry, heroSeat)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
