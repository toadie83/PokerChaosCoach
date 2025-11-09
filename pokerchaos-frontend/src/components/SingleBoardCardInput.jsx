import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSpokenNCards } from "../lib/parseVoiceCards";

const expectedCount = 1;

const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const anyWindow = window;
  return anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition || null;
};

const sanitizeCard = (value) => {
  if (!value) return "";
  const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return upper.slice(0, 2);
};

export default function SingleBoardCardInput({
  label,
  value,
  onChange,
  voiceButtonLabel,
  placeholder = "Ah",
  onPickCard,
  pickButtonLabel,
  onVoiceStatusChange,
}) {
  const recognitionRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const [draft, setDraft] = useState(() => sanitizeCard(value));

  useEffect(() => {
    setDraft(sanitizeCard(value));
  }, [value]);

  const isSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        /* swallow */
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
    (card) => {
      if (typeof onChange === "function") {
        onChange(card && card.length === 2 ? card.toUpperCase() : null);
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
      const parsed = parseSpokenNCards(speechTranscript, expectedCount);
      if (parsed && parsed.length === expectedCount) {
        const card = parsed[0].toUpperCase();
        setDraft(card);
        emitChange(card);
        reportStatus("success", { transcript: speechTranscript, confidence });
        setErrorMessage(null);
      } else {
        const message = "Couldn't recognize that card. Please try again.";
        reportStatus("error", { transcript: speechTranscript, error: message, confidence });
        setErrorMessage(message);
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
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const combinedTranscript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (!combinedTranscript) {
        const message = "Heard silence. Please try again.";
        reportStatus("error", { error: message });
        setErrorMessage(message);
        return;
      }

      setTranscript(combinedTranscript);
      const bestAlt = event.results?.[0]?.[0];
      const confidence = typeof bestAlt?.confidence === "number" ? bestAlt.confidence : null;
      reportStatus("processing", { transcript: combinedTranscript, confidence });
      handleResult(combinedTranscript, confidence);
      recognition.stop();
    };

    recognition.onerror = (event) => {
      let message = "Couldn't recognize that card. Please try again.";
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
          {label}
        </span>
        <span style={{ minWidth: 28, textAlign: "center", fontFamily: "monospace", fontSize: 13 }}>
          {draft && draft.length === 2 ? draft : "--"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <button type="button" onClick={startListening} disabled={!isSupported || listening}>
          {listening ? "Listening..." : voiceButtonLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            emitChange(null);
            reportStatus("idle");
            setErrorMessage(null);
            setTranscript(null);
          }}
        >
          Clear
        </button>
        {typeof onPickCard === "function" ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              onPickCard(draft && draft.length === 2 ? draft : null)
            }
          >
            {pickButtonLabel || "Select card"}
          </button>
        ) : null}
      </div>
      {/* manual text entry removed */}
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
          Card set.
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
