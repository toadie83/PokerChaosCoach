import { useMemo, useState } from "react";
import HistoryStrip from "./HistoryStrip.jsx";

function cardLabel(cards = []) {
  return cards.length ? cards.join(" ") : "Cards unknown";
}

function archivedTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return "";
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function RecentHandsHistory({ hands = [], onClear }) {
  const [openHandId, setOpenHandId] = useState(null);
  const visibleHands = Array.isArray(hands) ? hands.slice(0, 3) : [];
  const openHand = useMemo(
    () => visibleHands.find((hand) => hand.id === openHandId) || null,
    [openHandId, visibleHands],
  );

  if (!visibleHands.length) return null;

  return (
    <section className="recent-hands-panel" aria-label="Recent Coach hands">
      <div className="recent-hands-heading">
        <div>
          <span className="pill-label">Recent hands</span>
          <small>Saved locally · latest three</small>
        </div>
        <button
          type="button"
          className="recent-hands-clear"
          onClick={() => {
            setOpenHandId(null);
            onClear?.();
          }}
        >
          Clear
        </button>
      </div>
      <div className="recent-hand-list">
        {visibleHands.map((hand, index) => {
          const isOpen = hand.id === openHandId;
          return (
            <button
              key={hand.id}
              type="button"
              className={`recent-hand-button${isOpen ? " active" : ""}`}
              onClick={() =>
                setOpenHandId((current) =>
                  current === hand.id ? null : hand.id,
                )
              }
              aria-expanded={isOpen}
            >
              <span className="recent-hand-index">Hand {index + 1}</span>
              <strong>{cardLabel(hand.heroCards)}</strong>
              <span>
                {[hand.heroSeat || "Seat ?", hand.latestCoachAction || "Review"]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <small>{archivedTime(hand.archivedAt)}</small>
            </button>
          );
        })}
      </div>
      {openHand ? (
        <div className="recent-hand-detail">
          <div className="recent-hand-detail-title">
            <strong>{cardLabel(openHand.heroCards)}</strong>
            <span>{openHand.heroSeat || "Seat unknown"}</span>
          </div>
          <HistoryStrip
            key={openHand.id}
            history={openHand.history}
            heroSeat={openHand.heroSeat}
            currentStreet={openHand.currentStreet}
            coachByStreet={openHand.coachByStreet}
            initialOpenStreet={openHand.latestCoachStreet}
            maxEntriesPerStreet={20}
          />
        </div>
      ) : null}
    </section>
  );
}
