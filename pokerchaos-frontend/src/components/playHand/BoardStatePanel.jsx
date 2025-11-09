const formatCard = (card) => {
  if (!card || typeof card !== "string") return "__";
  const trimmed = card.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : "__";
};

const renderCardSlot = (value, idx, onClick) => {
  const display = formatCard(value);
  const filled = display !== "__";
  const clickable = typeof onClick === "function";
  return (
    <button
      key={idx}
      type="button"
      className={`board-card ${filled ? "filled" : ""} ${clickable ? "clickable" : ""}`}
      onClick={() => (clickable ? onClick(idx) : undefined)}
      aria-label={clickable ? `Edit card ${display}` : undefined}
    >
      {display}
    </button>
  );
};

export default function BoardStatePanel({
  heroCards,
  board,
  onHeroCardClick,
  onFlopCardClick,
  onTurnCardClick,
  onRiverCardClick,
}) {
  const hero1 = heroCards?.card1;
  const hero2 = heroCards?.card2;
  const flop = Array.isArray(board?.flop) ? board.flop : [null, null, null];
  const turn = board?.turn ?? null;
  const river = board?.river ?? null;

  return (
    <div className="play-hand-board-preview">
      <div className="board-group hero-group">
        <span className="board-label">Hero</span>
        <div className="board-cards hero-cards">
          {renderCardSlot(hero1, 0, onHeroCardClick)}
          {renderCardSlot(hero2, 1, onHeroCardClick)}
        </div>
      </div>
      <div className="board-group">
        <span className="board-label">Flop</span>
        <div className="board-cards">
          {flop.map((card, idx) => renderCardSlot(card, idx, onFlopCardClick))}
        </div>
      </div>
      <div className="board-group">
        <span className="board-label">Turn</span>
        <div className="board-cards">
          {renderCardSlot(turn, 0, onTurnCardClick)}
        </div>
      </div>
      <div className="board-group">
        <span className="board-label">River</span>
        <div className="board-cards">
          {renderCardSlot(river, 0, onRiverCardClick)}
        </div>
      </div>
    </div>
  );
}
