export default function SeatSelectorCard({ seats = [], heroSeat, onSelectSeat }) {
  return (
    <div className="play-hand-card">
      <h2 className="play-hand-card-title">Choose your seat</h2>
      <p className="play-hand-card-subtitle">
        Pick the position you will play from this hand. You can change it any time before continuing.
      </p>
      <div className="play-hand-seat-grid">
        {seats.map((seat) => {
          const isActive = heroSeat === seat;
          return (
            <button
              key={seat}
              type="button"
              className={`play-hand-seat ${isActive ? "active" : ""}`}
              onClick={() => {
                if (typeof onSelectSeat === "function") {
                  onSelectSeat(seat);
                }
              }}
            >
              <span className="play-hand-seat-label">{seat.toUpperCase()}</span>
              {isActive ? <span className="play-hand-seat-tag">Selected</span> : null}
            </button>
          );
        })}
        {seats.length === 0 ? <div className="play-hand-seat-empty">No seats available for the current table.</div> : null}
      </div>
    </div>
  );
}
