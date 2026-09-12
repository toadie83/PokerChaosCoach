import { localSeatCurrentStackBB } from "../vision/localHandTracker.js";
import { screenSeatToPosition } from "../vision/localCoachHandoff.js";

function statusLabel(status) {
  return {
    active: "Active",
    folded_candidate: "Fold?",
    folded: "Folded",
    all_in: "All-in",
    absent: "Absent",
    complete: "Hand complete",
    unknown: "Unknown",
  }[status] || "Unknown";
}

function formatStack(value) {
  return Number.isFinite(value) ? `${value} BB` : "—";
}

export default function UnifiedTableState({
  seats,
  tableSize,
  heroSeat,
  heroStackBehindBB,
  tracker,
  absentSeats = [],
  summary,
  strategicState,
  trackerStale,
  trackingReady,
  handComplete,
  heroFolded,
  autoRotateSeat,
  onHeroSeatChange,
  onAutoRotateSeatChange,
  onReset,
  opponentSeat,
  onOpponentSeatChange,
  onTogglePlayerStatus,
  villainStackRangeCode,
  villainStackRanges,
  onVillainStackRangeChange,
  playersInHand,
  onPlayersInHandChange,
  heroRelativePosition,
  onHeroRelativePositionChange,
}) {
  const physicalSeatCount = Number(tracker?.seatCount || 8);
  const opponentCount = Math.max(0, physicalSeatCount - 1);
  const activeCount = tracker
    ? Object.values(tracker.seats || {}).filter((record) =>
        Number(record?.seat) === 0 || ["active", "all_in"].includes(record?.status),
      ).length
    : Number(playersInHand || 2);
  const snapshotKnown = summary?.stackSnapshot?.knownSeats?.length || 0;
  const snapshotExpected = summary?.stackSnapshot?.expectedSeats?.length || opponentCount;
  const phaseLabel = trackerStale
    ? "Previous street"
    : handComplete || (tracker && !trackingReady)
      ? "Last hand"
      : tracker
        ? "Live"
        : "Manual";
  const heroStatus = heroFolded ? "folded" : handComplete ? "complete" : "active";
  const playerRows = [
    {
      key: "hero",
      screenSeat: 0,
      position: heroSeat || "Hero",
      screenLabel: "Hero",
      status: heroStatus,
      stackBehindBB: Number.isFinite(heroStackBehindBB) ? heroStackBehindBB : null,
      startingStackBB: Number.isFinite(Number(tracker?.seats?.[0]?.startingStackBB))
        ? Number(tracker.seats[0].startingStackBB)
        : null,
      committedBB: Number.isFinite(Number(tracker?.committed?.[0])) ? Number(tracker.committed[0]) : null,
      isHero: true,
    },
    ...Array.from({ length: opponentCount }, (_, index) => {
      const screenSeat = index + 1;
      const record = tracker?.seats?.[screenSeat];
      return {
        key: `v${screenSeat}`,
        screenSeat,
        position: screenSeatToPosition(screenSeat, heroSeat, tableSize, absentSeats, physicalSeatCount) || `Seat ${screenSeat}`,
        screenLabel: `V${screenSeat}`,
        status: tracker?.seatStatus?.[screenSeat] || record?.status || "unknown",
        stackBehindBB: tracker ? localSeatCurrentStackBB(tracker, screenSeat) : null,
        startingStackBB: Number.isFinite(Number(record?.startingStackBB)) && record?.startingStackBB !== null
          ? Number(record.startingStackBB)
          : null,
        committedBB: Number.isFinite(Number(tracker?.committed?.[screenSeat]))
          ? Number(tracker.committed[screenSeat])
          : null,
        isHero: false,
      };
    }),
  ];
  const aggressorPosition = summary?.lastAggressorSeat == null
    ? null
    : summary.lastAggressorSeat === 0
      ? heroSeat
      : screenSeatToPosition(summary.lastAggressorSeat, heroSeat, tableSize, absentSeats, physicalSeatCount);
  const displayedTotalPotBB = Number(summary?.displayedTotalPotBB);
  const hasDisplayedTotalPot = Number.isFinite(displayedTotalPotBB) && displayedTotalPotBB > 0;
  const selectedOpponent = opponentSeat || null;

  return (
    <section className="unified-table-state" aria-label="Table state">
      <header className="unified-table-state-header">
        <div>
          <span className="pill-label">Table state</span>
          <strong>{phaseLabel}</strong>
        </div>
        <div className="table-state-health" aria-label="Tracker status">
          {tracker ? <span>{activeCount} active</span> : null}
          {tracker && absentSeats.length ? <span>{tableSize} seated · {absentSeats.map((seat) => `V${seat}`).join(", ")} absent</span> : null}
          {tracker ? <span>Vision stacks {snapshotKnown}/{snapshotExpected}</span> : null}
          {tracker?.uncertain ? <span className="is-warning">Review order</span> : null}
          {trackerStale ? <span className="is-warning">Stale</span> : null}
        </div>
        <div className="table-state-seat-control">
          <label>
            <span>Hero seat</span>
            <select value={heroSeat || ""} onChange={(event) => onHeroSeatChange(event.target.value)}>
              <option value="">Select</option>
              {seats.map((seat) => <option key={seat} value={seat}>{seat}</option>)}
            </select>
          </label>
          <button
            type="button"
            className={autoRotateSeat ? "is-active" : ""}
            onClick={onAutoRotateSeatChange}
            disabled={!heroSeat}
            aria-pressed={autoRotateSeat}
          >
            Auto seat {autoRotateSeat ? "on" : "off"}
          </button>
          <button type="button" className="table-state-reset" onClick={onReset} title="Reset session" aria-label="Reset session">↻</button>
        </div>
      </header>

      <div className="table-state-players" aria-label="Players, seats, stacks and status">
        {playerRows.map((player) => {
          const selected = !player.isHero && player.position === selectedOpponent;
          const isAggressor = player.position === aggressorPosition;
          const canRespond = strategicState?.features?.playersWhoCanRespond?.includes(player.position);
          const canMarkAbsent = ["unknown", "folded_candidate"].includes(player.status) && !Number.isFinite(player.stackBehindBB);
          const canToggleStatus = !player.isHero && (["active", "folded", "folded_candidate", "absent"].includes(player.status) || canMarkAbsent);
          const nextStatus = player.status === "absent"
            ? "present"
            : canMarkAbsent
              ? "absent"
              : player.status === "folded"
                ? "active"
                : "folded";
          const className = [
            "table-player",
            player.isHero ? "is-hero" : "",
            selected ? "is-selected" : "",
            `is-${player.status}`,
          ].filter(Boolean).join(" ");
          const content = <>
            <span className="table-player-heading">
              <strong>{player.position}</strong>
              <small>{player.screenLabel}</small>
            </span>
            <span className="table-player-stack">{formatStack(player.stackBehindBB)}</span>
            <span className="table-player-meta">
              {statusLabel(player.status)}
              {Number.isFinite(player.committedBB) && player.committedBB > 0 ? ` · ${player.committedBB} in` : ""}
            </span>
            {isAggressor || canRespond ? (
              <span className="table-player-flags">
                {isAggressor ? <em>Aggressor</em> : null}
                {canRespond ? <em>Can respond</em> : null}
              </span>
            ) : null}
          </>;
          return player.isHero ? (
            <div key={player.key} className={className} title="Hero's current table state">{content}</div>
          ) : (
            <button
              key={player.key}
              type="button"
              className={className}
              disabled={!canToggleStatus}
              onClick={() => onTogglePlayerStatus(player.screenSeat, player.status, player.stackBehindBB)}
              aria-label={canToggleStatus
                ? `${player.position}, ${statusLabel(player.status)}. Mark as ${nextStatus}`
                : `${player.position}, ${statusLabel(player.status)}`}
              title={canToggleStatus
                ? `Mark ${player.position} as ${nextStatus}${Number.isFinite(player.startingStackBB) ? ` · opening stack ${player.startingStackBB} BB` : ""}`
                : `${player.position} status needs live evidence before it can be toggled`}
            >
              {content}
            </button>
          );
        })}
      </div>

      {tracker ? <p className="table-state-toggle-hint">Click active/folded players to correct them. Click an unknown or provisional-fold seat with no stack to mark it absent.</p> : null}

      {tracker ? (
        <div className="table-state-action-summary">
          <span>{summary?.heroToAct ? "Hero to act" : summary?.waitingSeats?.length ? `Waiting for ${summary.waitingSeats.map((seat) => `V${seat}`).join(", ")}` : "Tracking action"}</span>
          {hasDisplayedTotalPot ? (
            <span
              className="table-state-live-pot"
              data-source="table-display"
              role="status"
              aria-live="polite"
              title="Stable OCR read from the table's Total Pot display"
            >
              Pot {displayedTotalPotBB} BB <small>table</small>
            </span>
          ) : null}
          <span>Call {summary?.amountToCallBB ?? 0} BB</span>
          <span>High {summary?.highestBB ?? 0} BB</span>
          <span>Aggressor {aggressorPosition || "unknown"}</span>
          <details className="live-tracker-timeline">
            <summary>Timeline ({tracker.events?.length || 0})</summary>
            {tracker.events?.length ? (
              <ol>{tracker.events.slice(-8).map((event, index) => <li key={`${event.at}-${index}`}><time>{new Date(event.at).toLocaleTimeString()}</time><span>{event.text}</span></li>)}</ol>
            ) : <p>Waiting for confirmed contribution changes.</p>}
          </details>
        </div>
      ) : null}

      <details className="table-state-overrides">
        <summary>Manual overrides</summary>
        <div className="table-state-override-grid">
          <label>
            <span>Primary opponent</span>
            <select value={opponentSeat || ""} onChange={(event) => onOpponentSeatChange(event.target.value)}>
              <option value="">Seat unknown</option>
              {seats.filter((seat) => seat !== heroSeat).map((seat) => <option key={seat} value={seat}>{seat}</option>)}
            </select>
          </label>
          <label>
            <span>Opponent stack override</span>
            <select value={villainStackRangeCode} onChange={(event) => onVillainStackRangeChange(event.target.value)}>
              {villainStackRanges.map((range) => <option key={range.code || "unknown"} value={range.code}>{range.label}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Players</legend>
            {[2, 3, 4].map((count) => <button key={count} type="button" className={Number(playersInHand || 2) === count ? "is-active" : ""} onClick={() => onPlayersInHandChange(count)}>{count === 4 ? "4+" : count}</button>)}
          </fieldset>
          <fieldset>
            <legend>Postflop position</legend>
            {[["auto", "Auto"], ["ip", "IP"], ["oop", "OOP"]].map(([code, label]) => <button key={code} type="button" className={(heroRelativePosition || "auto") === code ? "is-active" : ""} onClick={() => onHeroRelativePositionChange(code)}>{label}</button>)}
          </fieldset>
        </div>
      </details>
    </section>
  );
}
