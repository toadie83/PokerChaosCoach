import HeroVoiceCardInput from "../HeroVoiceCardInput";

const formatCard = (card) => {
  if (!card || typeof card !== "string") return "__";
  const trimmed = card.trim().toUpperCase();
  return trimmed.length === 2 ? trimmed : "__";
};

export default function HoleCardSelectorCard({
  heroCards,
  onOpenSelector,
  onCardsParsed,
  onManualEntry,
  onVoiceStart,
  onVoiceStatusChange,
}) {
  const card1 = formatCard(heroCards?.card1);
  const card2 = formatCard(heroCards?.card2);

  return (
    <div className="play-hand-card">
      <h2 className="play-hand-card-title">Lock in hero cards</h2>
      <p className="play-hand-card-subtitle">
        Use voice capture or the picker to register your starting hand. We will reset the hand flow if you change cards.
      </p>
      <div className="play-hand-hero">
        <div className="play-hand-hero-display">
          <span className={`play-hand-hero-card ${card1 !== "__" ? "filled" : ""}`}>{card1}</span>
          <span className={`play-hand-hero-card ${card2 !== "__" ? "filled" : ""}`}>{card2}</span>
        </div>
        <div className="play-hand-hero-actions">
          <button
            type="button"
            className="pill-toggle accent"
            onClick={() => {
              if (typeof onOpenSelector === "function") {
                onOpenSelector();
              }
            }}
          >
            Open card picker
          </button>
        </div>
      </div>
      <div className="play-hand-voice-input">
        <HeroVoiceCardInput
          heroCards={heroCards}
          onCardsParsed={onCardsParsed}
          onManualEntry={onManualEntry}
          onVoiceStart={onVoiceStart}
          onVoiceStatusChange={onVoiceStatusChange}
        />
      </div>
    </div>
  );
}
