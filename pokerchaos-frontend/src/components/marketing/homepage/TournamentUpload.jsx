import { useRef, useState } from "react";

const MAX_UPLOAD_BYTES = 2_000_000;

function UploadIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 22V7m0 0-6 6m6-6 6 6" />
      <path d="M8.5 25.5H7A4.5 4.5 0 0 1 6.4 16.6 8 8 0 0 1 21.8 13a6.5 6.5 0 0 1 1.7 12.5H22" />
    </svg>
  );
}

export default function TournamentUpload({
  onSubmit,
  busy = false,
  error = "",
  allowance = { remaining: 3, limitReached: false },
  limitAction = null,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [heroName, setHeroName] = useState("hero");
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  const chooseFile = (nextFile) => {
    if (!nextFile) return;
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setLocalError("The hand history is larger than the 2 MB upload limit.");
      return;
    }
    if (!/\.txt$/i.test(nextFile.name || "")) {
      setFile(null);
      setLocalError("Choose a .txt hand-history export.");
      return;
    }
    setFile(nextFile);
    setLocalError("");
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (busy) return;
    if (!file) {
      setLocalError("Choose a tournament hand-history file first.");
      return;
    }
    if (!heroName.trim()) {
      setLocalError("Enter the screen name used in this tournament.");
      return;
    }
    setLocalError("");
    onSubmit?.({ file, heroName: heroName.trim() });
  };

  const visibleError = localError || error;
  const remainingReviews = Math.max(0, Number(allowance?.remaining) || 0);
  const limitReached = Boolean(allowance?.limitReached);

  return (
    <form className={`home-v2-upload-card home-v2-hero-upload${limitReached ? " is-limited" : ""}`} onSubmit={handleSubmit}>
      {limitReached ? (
        <div className="home-v2-upload-limit" role="status">
          <div>
            <span>Complimentary plans complete</span>
            <strong>Ready for your next tournament?</strong>
            <p>Register for free Study Spot reviews and a customised learning plan.</p>
          </div>
          {limitAction}
        </div>
      ) : (
        <>
          <button
            className={`home-v2-dropzone${dragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            disabled={busy}
          >
            <UploadIcon />
            <span className="home-v2-dropzone-copy">
              <strong>{file ? file.name : "Choose or drop your tournament"}</strong>
              <span>{file ? "Ready to analyse · click to replace" : "GGPoker or PokerStars · .txt · max 2 MB"}</span>
            </span>
          </button>
          <input
            ref={inputRef}
            className="home-v2-file-input"
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => chooseFile(event.target.files?.[0])}
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className="home-v2-upload-action-row">
            <label className="home-v2-screen-name">
              <span>Your poker screen name</span>
              <input
                type="text"
                value={heroName}
                maxLength={64}
                autoComplete="off"
                placeholder="Name shown in the hand history"
                onChange={(event) => setHeroName(event.target.value)}
                disabled={busy}
              />
            </label>
            <button className="home-v2-button home-v2-button-primary" type="submit" disabled={busy}>
              {busy ? "Analysing…" : "Build my free plan"}
            </button>
          </div>

          {visibleError ? <p className="home-v2-upload-error" role="alert">{visibleError}</p> : null}
        </>
      )}

      <p className="home-v2-upload-browse">
        or <a href="/learn">browse our full learning library</a>
      </p>

      <div className="home-v2-upload-footer">
        <p><span aria-hidden="true">＋</span> New tournament lessons daily · 09:00 UK time</p>
        <p>
          <span aria-hidden="true">✓</span>
          Files not retained · <a href="/free-upload-privacy">Privacy &amp; AI</a>
        </p>
        {!limitReached ? <small>{remainingReviews}/3 free plans remaining</small> : null}
      </div>
    </form>
  );
}
