const statusLabel = {
  listening: "Listening...",
  processing: "Processing...",
  success: "Recognized",
  error: "Didn't catch that",
};

const formatConfidence = (confidence) => {
  if (!Number.isFinite(Number(confidence))) return null;
  const numeric = Number(confidence);
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(Math.max(0, Math.min(100, percent)));
};

export default function VoiceOverlay({ source, status, transcript, error, confidence }) {
  if (!status || status === "idle") return null;
  const label = statusLabel[status] || "Voice input";
  const confidenceValue = formatConfidence(confidence);
  return (
    <div className={`voice-overlay voice-${status}`}>
      <div className="voice-overlay-header">
        <span className="voice-overlay-source">{source || "Voice input"}</span>
        <span className="voice-overlay-status">{label}</span>
      </div>
      {transcript ? (
        <div className="voice-overlay-line">
          <span className="voice-overlay-muted">Heard:</span> <strong>{transcript}</strong>
        </div>
      ) : null}
      {confidenceValue !== null ? (
        <div className="voice-overlay-line">
          <span className="voice-overlay-muted">Confidence:</span> {confidenceValue}%
        </div>
      ) : null}
      {status === "error" && error ? (
        <div className="voice-overlay-error">{error}</div>
      ) : null}
    </div>
  );
}
