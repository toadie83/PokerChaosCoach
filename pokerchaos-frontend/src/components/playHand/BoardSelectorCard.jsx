import FlopCardInput from "../FlopCardInput.jsx";
import SingleBoardCardInput from "../SingleBoardCardInput.jsx";

const PHASE_LABELS = {
  flop: "Set the flop",
  turn: "Set the turn card",
  river: "Set the river card",
};

const PHASE_SUBTITLES = {
  flop: "Enter the three-card flop using voice capture or the selector.",
  turn: "Lock in the turn card to progress to river play.",
  river: "Reveal the final river card before summarizing the hand.",
};

export default function BoardSelectorCard({
  phase,
  board,
  onOpenManual,
  onFlopChange,
  onTurnChange,
  onRiverChange,
  openTurnCardSelector,
  openRiverCardSelector,
  onFlopVoiceStatusChange,
  onTurnVoiceStatusChange,
  onRiverVoiceStatusChange,
}) {
  const flop = Array.isArray(board?.flop) ? board.flop : [null, null, null];
  const turn = board?.turn ?? null;
  const river = board?.river ?? null;

  if (phase === "flop") {
    return (
      <div className="play-hand-card">
        <h2 className="play-hand-card-title">{PHASE_LABELS.flop}</h2>
        <p className="play-hand-card-subtitle">{PHASE_SUBTITLES.flop}</p>
        <FlopCardInput
          flop={flop}
          onChange={onFlopChange}
          onOpenManual={onOpenManual}
          onVoiceStatusChange={onFlopVoiceStatusChange}
        />
      </div>
    );
  }

  if (phase === "turn") {
    return (
      <div className="play-hand-card">
        <h2 className="play-hand-card-title">{PHASE_LABELS.turn}</h2>
        <p className="play-hand-card-subtitle">{PHASE_SUBTITLES.turn}</p>
        <SingleBoardCardInput
          label="Turn card"
          value={turn}
          onChange={onTurnChange}
          voiceButtonLabel="Enter turn by voice"
          placeholder="Js"
          onPickCard={() => openTurnCardSelector?.(turn)}
          pickButtonLabel="Open turn picker"
          onVoiceStatusChange={onTurnVoiceStatusChange}
        />
        <div className="play-hand-card-actions">
          <button type="button" className="pill-toggle" onClick={() => openTurnCardSelector?.(turn)}>
            Pick from deck
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="play-hand-card">
      <h2 className="play-hand-card-title">{PHASE_LABELS.river}</h2>
      <p className="play-hand-card-subtitle">{PHASE_SUBTITLES.river}</p>
      <SingleBoardCardInput
        label="River card"
        value={river}
        onChange={onRiverChange}
        voiceButtonLabel="Enter river by voice"
        placeholder="Qc"
        onPickCard={() => openRiverCardSelector?.(river)}
        pickButtonLabel="Open river picker"
        onVoiceStatusChange={onRiverVoiceStatusChange}
      />
      <div className="play-hand-card-actions">
        <button type="button" className="pill-toggle" onClick={() => openRiverCardSelector?.(river)}>
          Pick from deck
        </button>
      </div>
    </div>
  );
}
