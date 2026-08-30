import { useEffect, useRef, useState } from "react";

import { requestStudySpotAnalysis } from "../api/aiService.js";
import { trackProductEvent } from "../lib/analytics.js";

const PROGRESS_STEPS = [
  "Uploading tournament",
  "Parsing hands",
  "Finding useful decisions",
  "Building your study queue",
];

const ERROR_COPY = {
  MALFORMED_UPLOAD: "We could not read poker hands from that upload. Check the file and try again.",
  UNSUPPORTED_FORMAT: "That poker-site format is not supported yet.",
  NO_TOURNAMENT_HANDS: "Study Spots currently accepts tournament histories only.",
  MULTIPLE_TOURNAMENTS: "Upload one tournament at a time so the report stays focused.",
  ANALYSIS_FAILED: "The tournament was saved, but analysis did not finish. Open My Tournaments to retry it.",
};

export default function StudySpotsEntryPage({ navigate }) {
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [pastedHistory, setPastedHistory] = useState("");
  const [heroName, setHeroName] = useState("Hero");
  const [tournamentName, setTournamentName] = useState("");
  const [status, setStatus] = useState("idle");
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState("");
  const progressTimer = useRef(null);

  useEffect(
    () => () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    },
    [],
  );

  const stopProgress = () => {
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = null;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (status === "analysing") return;
    setError("");
    let historyText = pastedHistory.trim();
    if (mode === "file") {
      if (!file) {
        setError("Select a tournament hand-history file first.");
        return;
      }
      try {
        historyText = await file.text();
      } catch {
        setError("That file could not be read.");
        return;
      }
    }
    if (!historyText.trim()) {
      setError("Paste a tournament hand history first.");
      return;
    }
    if (historyText.length > 2_000_000) {
      setError("The hand history is larger than the 2 MB upload limit.");
      return;
    }

    trackProductEvent("study_spots_upload_started", {
      upload_method: mode,
    });

    setStatus("analysing");
    setProgressIndex(0);
    progressTimer.current = window.setInterval(() => {
      setProgressIndex((current) => Math.min(PROGRESS_STEPS.length - 1, current + 1));
    }, 1400);
    try {
      const result = await requestStudySpotAnalysis({
        historyText,
        heroName: heroName.trim() || "Hero",
        tournamentName: tournamentName.trim() || undefined,
        uploadSource: mode === "file" ? "file" : "paste",
      });
      const reportId = String(result?.report?.id || "").trim();
      if (!reportId) throw new Error("Study Report ID was not returned.");
      trackProductEvent("study_spots_analysis_completed", {
        hand_count: result?.report?.handsAnalysed,
        candidate_count: result?.report?.candidateCount,
        spot_count: result?.report?.spotCount,
      });
      navigate(`/tools/study-spots/reports/${reportId}`);
    } catch (requestError) {
      const code = String(requestError?.code || "");
      const isParseFailure = [
        "MALFORMED_UPLOAD",
        "UNSUPPORTED_FORMAT",
        "NO_TOURNAMENT_HANDS",
        "MULTIPLE_TOURNAMENTS",
      ].includes(code);
      trackProductEvent(
        isParseFailure
          ? "study_spots_parse_failed"
          : "study_spots_analysis_failed",
        isParseFailure
          ? { error_code: code || "UNKNOWN", upload_method: mode }
          : { error_code: code || "UNKNOWN" },
      );
      setError(ERROR_COPY[code] || requestError?.message || "Analysis could not be completed.");
      setStatus("idle");
    } finally {
      stopProgress();
    }
  };

  return (
    <main className="tools-page tools-page--focused">
      <header className="tools-page-header">
        <p className="tools-page-kicker">Free Study Tool</p>
        <h1>Find My Study Spots</h1>
        <p>Upload a tournament. Playback Poker will find the decisions most worth revisiting.</p>
      </header>

      <form className="study-upload" onSubmit={submit}>
        <div className="study-mode-switch" role="tablist" aria-label="Upload method">
          {[["file", "Upload file"], ["paste", "Paste history"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={mode === value ? "active" : ""}
              onClick={() => setMode(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "file" ? (
          <label className="study-file-input">
            <span>{file ? file.name : "Choose a .txt hand history"}</span>
            <input type="file" accept=".txt,text/plain" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
        ) : (
          <label className="study-field">
            <span>Tournament hand history</span>
            <textarea value={pastedHistory} onChange={(event) => setPastedHistory(event.target.value)} rows={10} placeholder="Paste the complete tournament hand history" />
          </label>
        )}

        <div className="study-upload-fields">
          <label className="study-field">
            <span>Hero name</span>
            <input type="text" value={heroName} maxLength={64} onChange={(event) => setHeroName(event.target.value)} />
          </label>
          <label className="study-field">
            <span>Tournament name <small>Optional</small></span>
            <input type="text" value={tournamentName} maxLength={160} onChange={(event) => setTournamentName(event.target.value)} />
          </label>
        </div>

        <p className="study-upload-support">Supported: GGPoker and PokerStars tournament histories.</p>
        {error ? <p className="study-form-error" role="alert">{error}</p> : null}
        {status === "analysing" ? (
          <div className="study-progress" aria-live="polite">
            {PROGRESS_STEPS.map((step, index) => (
              <span key={step} data-state={index < progressIndex ? "done" : index === progressIndex ? "active" : "waiting"}>{step}</span>
            ))}
          </div>
        ) : null}
        <button className="study-primary-action" type="submit" disabled={status === "analysing"}>
          {status === "analysing" ? "Finding study spots..." : "Find my study spots"}
        </button>
      </form>
    </main>
  );
}
