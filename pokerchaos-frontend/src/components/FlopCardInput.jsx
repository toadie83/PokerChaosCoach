import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSpokenNCards } from "../lib/parseVoiceCards";

const expectedFlopCount = 3;

const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const anyWindow = window;
  return anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition || null;
};

export default function FlopCardInput({ flop, onChange, onOpenManual, onVoiceStatusChange }) {
  const recognitionRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const isSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  const initialDraft = useMemo(() => {
    if (Array.isArray(flop)) {
      return flop.map((card) =>
        typeof card === "string" && card.trim().length > 0 ? card.trim().toUpperCase() : ""
      );
    }
    return ["", "", ""];
  }, [flop]);

  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => {
    setDraft(initialDraft);
  }, [initialDraft]);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        /* no-op */
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecognition();
    };
  }, [stopRecognition]);

  const emitChange = useCallback(
    (cards) => {
      if (typeof onChange === "function") {
        onChange(cards);
      }
    },
    [onChange]
  );

  const reportStatus = useCallback(
    (nextStatus, details = {}) => {
      setStatus(nextStatus);
      if (typeof onVoiceStatusChange === "function") {
        onVoiceStatusChange(nextStatus, details);
      }
    },
    [onVoiceStatusChange]
  );

  const handleResult = useCallback(
    (speechTranscript, confidence) => {
      const parsed = parseSpokenNCards(speechTranscript, expectedFlopCount);
      if (parsed) {
        const next = parsed.map((card) => card.toUpperCase());
        setDraft(next);
        emitChange(next);
        reportStatus("success", { transcript: speechTranscript, confidence });
        setErrorMessage(null);
      } else {
        reportStatus("error", {
          transcript: speechTranscript,
          error: "Couldn't recognize flop cards. Please try again.",
          confidence,
        });
        setErrorMessage("Couldn't recognize flop cards. Please try again.");
      }
    },
    [emitChange, reportStatus]
  );

  const startListening = useCallback(() => {
    if (!isSupported) {
      const message = "This browser does not support speech recognition.";
      setErrorMessage(message);
      reportStatus("error", { error: message });
      return;
    }

    stopRecognition();
    const ctor = getSpeechRecognitionCtor();
    if (!ctor) {
      const message = "This browser does not support speech recognition.";
      setErrorMessage(message);
      reportStatus("error", { error: message });
      return;
    }

    const recognition = new ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = true;

    recognition.onresult = (event) => {
      const combinedTranscript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (!combinedTranscript) {
        reportStatus("error", { error: "Heard silence. Please try again." });
        setErrorMessage("Heard silence. Please try again.");
        return;
      }
      const bestAlt = event.results?.[0]?.[0];
      const confidence = typeof bestAlt?.confidence === "number" ? bestAlt.confidence : null;
      setTranscript(combinedTranscript);
      reportStatus("processing", { transcript: combinedTranscript, confidence });
      handleResult(combinedTranscript, confidence);
      recognition.stop();
    };

    recognition.onerror = (event) => {
      let message = "Couldn't recognize cards. Please try again.";
      if (event.error === "no-speech") {
        message = "Heard silence. Please try again.";
      } else if (event.error === "not-allowed") {
        message = "Microphone access denied. Please allow access and retry.";
      }
      reportStatus("error", { error: message });
      setErrorMessage(message);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setStatus((current) => {
        if (current === "listening") {
          if (typeof onVoiceStatusChange === "function") {
            onVoiceStatusChange("idle", {});
          }
          return "idle";
        }
        return current;
      });
    };

    recognitionRef.current = recognition;
    setErrorMessage(null);
    setTranscript(null);
    reportStatus("listening");
    recognition.start();
  }, [handleResult, isSupported, reportStatus, stopRecognition, onVoiceStatusChange]);

  const listening = status === "listening";

  return (
    <div style={{ marginTop: 12, padding: "12px 0", borderTop: "1px solid #1f2937" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="sub" style={{ fontWeight: 600 }}>
          Flop cards
        </span>
        <div style={{ display: "flex", gap: 4, fontFamily: "monospace", fontSize: 13 }}>
          {draft.map((card, idx) => (
            <span key={idx} style={{ minWidth: 26, textAlign: "center" }}>
              {card && card.length === 2 ? card : "--"}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <button type="button" onClick={startListening} disabled={!isSupported || listening}>
          {listening ? "Listening..." : "Enter flop by voice"}
        </button>
        {typeof onOpenManual === "function" ? (
          <button type="button" onClick={onOpenManual}>
            Edit manually
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const cleared = ["", "", ""];
            setDraft(cleared);
            emitChange([null, null, null]);
            reportStatus("idle");
            setErrorMessage(null);
            setTranscript(null);
          }}
        >
          Clear flop
        </button>
      </div>
      {transcript ? (
        <span className="sub" style={{ fontSize: 12, marginTop: 6 }}>
          Heard: "{transcript}"
        </span>
      ) : null}
      {status === "processing" ? (
        <span className="sub" style={{ fontSize: 12, marginTop: 4 }}>
          Processing...
        </span>
      ) : null}
      {status === "success" ? (
        <span className="sub" style={{ fontSize: 12, color: "#34d399", marginTop: 4 }}>
          Flop set.
        </span>
      ) : null}
      {status === "error" && errorMessage ? (
        <span className="sub" style={{ fontSize: 12, color: "#f87171", marginTop: 4 }}>
          {errorMessage}
        </span>
      ) : null}
      {!isSupported ? (
        <span className="sub" style={{ fontSize: 12, marginTop: 4 }}>
          Voice input requires Chrome or Edge with the Web Speech API.
        </span>
      ) : null}
    </div>
  );
}
