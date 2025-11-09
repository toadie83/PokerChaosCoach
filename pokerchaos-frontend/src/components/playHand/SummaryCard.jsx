import HistoryStrip from "../HistoryStrip.jsx";

const formatCard = (card) => {
  if (!card || typeof card !== "string") return "__";
  const trimmed = card.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : "__";
};

const formatBoardLine = (board) => {
  if (!board) return "__ __ __ | __ | __";
  const flop = Array.isArray(board.flop) ? board.flop : [null, null, null];
  const flopLine = flop.map((card) => formatCard(card)).join(" ");
  const turn = formatCard(board.turn);
  const river = formatCard(board.river);
  return `${flopLine} | ${turn} | ${river}`;
};

export default function SummaryCard({ state, coach, aiSnapshot }) {
  const heroSeat = state?.heroSeat ? state.heroSeat.toUpperCase() : "?";
  const heroHand = `${formatCard(state?.heroCards?.card1)} ${formatCard(state?.heroCards?.card2)}`;
  const boardLine = formatBoardLine(state?.board);
  const personaLabel = state?.persona ? state.persona.replace(/_/g, " ") : "Chaos Coach";
  const branchLabel = aiSnapshot?.context?.branch
    ? aiSnapshot.context.branch
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : null;
  const coachAction = coach?.hero_action;
  const coachSizing = coach?.sizing;
  const coachFlavor = coach?.flavor_text;

  return (
    <div className="play-hand-card play-hand-summary">
      <h2 className="play-hand-card-title">Hand summary</h2>
      <p className="play-hand-card-subtitle">
        Review the full context before resetting or starting a new practice hand. Use the history panel to revisit key
        streets.
      </p>
      <div className="play-hand-summary-grid">
        <div className="summary-field">
          <span className="summary-label">Hero seat</span>
          <span className="summary-value">{heroSeat}</span>
        </div>
        <div className="summary-field">
          <span className="summary-label">Hero cards</span>
          <span className="summary-value">{heroHand}</span>
        </div>
        <div className="summary-field">
          <span className="summary-label">Board</span>
          <span className="summary-value">{boardLine}</span>
        </div>
        <div className="summary-field">
          <span className="summary-label">Persona</span>
          <span className="summary-value">{personaLabel}</span>
        </div>
        {branchLabel ? (
          <div className="summary-field">
            <span className="summary-label">Branch</span>
            <span className="summary-value">{branchLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="play-hand-summary-coach">
        <h3>Latest coach guidance</h3>
        {coachAction ? (
          <div className="play-hand-summary-coach-body">
            <div>
              <span className="summary-label">Line</span>
              <span className="summary-value">{coachAction}</span>
            </div>
            {coachSizing ? (
              <div>
                <span className="summary-label">Sizing</span>
                <span className="summary-value">{coachSizing}</span>
              </div>
            ) : null}
            {coachFlavor ? <div className="summary-flavor">{coachFlavor}</div> : null}
          </div>
        ) : (
          <div className="summary-empty">No coaching data yet for this hand.</div>
        )}
      </div>
      <HistoryStrip history={state?.history} heroSeat={state?.heroSeat} />
    </div>
  );
}
