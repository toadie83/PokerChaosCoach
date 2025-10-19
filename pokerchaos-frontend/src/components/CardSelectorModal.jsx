import { useEffect, useMemo, useState } from "react";

const suits = [
  { code: "s", label: "Spades" },
  { code: "h", label: "Hearts" },
  { code: "d", label: "Diamonds" },
  { code: "c", label: "Clubs" }
];

const ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

function formatCard(card) {
  if (!card?.rank || !card?.suit) return null;
  return `${card.rank}${card.suit}`;
}

export default function CardSelectorModal({
  open,
  initialCards,
  onClose,
  onSave
}) {
  const [draft, setDraft] = useState({
    card1: { rank: null, suit: null },
    card2: { rank: null, suit: null }
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      const next = {
        card1: parseCard(initialCards?.card1),
        card2: parseCard(initialCards?.card2)
      };
      setDraft(next);
      setError("");
    }
  }, [open, initialCards]);

  const cardStrings = useMemo(() => {
    const c1 = formatCard(draft.card1);
    const c2 = formatCard(draft.card2);
    return { card1: c1, card2: c2 };
  }, [draft]);

  const duplicate = useMemo(() => {
    const { card1, card2 } = cardStrings;
    return card1 && card2 && card1 === card2;
  }, [cardStrings]);

  const handleSelect = (slot, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [slot]: {
        ...prev[slot],
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    const { card1, card2 } = cardStrings;
    if (!card1 || !card2) {
      setError("Pick a rank and suit for both cards.");
      return;
    }
    if (duplicate) {
      setError("Cannot select the same card twice.");
      return;
    }
    onSave({ card1, card2 });
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Select Hero Hand</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p className="sub" style={{ marginTop: 0 }}>
            Choose suit then rank for each card.
          </p>
          <div className="card-grid">
            {["card1", "card2"].map((slot, idx) => (
              <div key={slot} className="card-slot">
                <h3 className="card-slot-title">
                  Card {idx + 1}{" "}
                  {formatCard(draft[slot]) ? `(${formatCard(draft[slot])})` : ""}
                </h3>
                <div className="card-slot-section">
                  <span className="card-slot-label">Suit</span>
                  <div className="card-slot-buttons">
                    {suits.map((suit) => {
                      const active = draft[slot]?.suit === suit.code;
                      return (
                        <button
                          key={suit.code}
                          type="button"
                          className={active ? "btn-secondary active" : "btn-secondary"}
                          onClick={() => handleSelect(slot, "suit", suit.code)}
                        >
                          {suit.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="card-slot-section">
                  <span className="card-slot-label">Rank</span>
                  <div className="rank-grid">
                    {ranks.map((rank) => {
                      const active = draft[slot]?.rank === rank;
                      const disabled = isRankDisabled(rank, slot, draft);
                      return (
                        <button
                          key={rank}
                          type="button"
                          className={
                            active ? "btn-rank active" : disabled ? "btn-rank disabled" : "btn-rank"
                          }
                          onClick={() => {
                            if (!disabled) handleSelect(slot, "rank", rank);
                          }}
                          disabled={disabled}
                        >
                          {rank}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error ? <p className="error-text">{error}</p> : null}
        </div>
        <div className="modal-footer">
          <button type="button" onClick={handleSave}>
            Save Hand
          </button>
        </div>
      </div>
    </div>
  );
}

function parseCard(cardString) {
  if (!cardString || typeof cardString !== "string") {
    return { rank: null, suit: null };
  }
  const trimmed = cardString.trim();
  if (trimmed.length < 2) return { rank: null, suit: null };
  const rank = trimmed[0].toUpperCase();
  const suit = trimmed.slice(1).toLowerCase();
  const validRank = ranks.includes(rank);
  const validSuit = suits.some((s) => s.code === suit);
  return {
    rank: validRank ? rank : null,
    suit: validSuit ? suit : null
  };
}

function isRankDisabled(rank, slot, draft) {
  const otherSlot = slot === "card1" ? "card2" : "card1";
  const otherCard = draft[otherSlot];
  if (!otherCard?.rank || !otherCard?.suit) return false;
  return otherCard.rank === rank && otherCard.suit === draft[slot]?.suit;
}
