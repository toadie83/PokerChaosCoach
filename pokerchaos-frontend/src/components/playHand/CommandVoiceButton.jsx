import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const getSpeechRecognitionCtor = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const candidate = window.SpeechRecognition || window.webkitSpeechRecognition;
  return candidate || null;
};

const normalizeTranscript = (value) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

export default function CommandVoiceButton({ onCommand, onVoiceStatusChange }) {
  const recognitionRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [transcript, setTranscript] = useState(null);
  const isSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  const reportStatus = useCallback(
    (nextStatus, details = {}) => {
      setStatus(nextStatus);
      if (typeof onVoiceStatusChange === "function") {
        onVoiceStatusChange(nextStatus, details);
      }
    },
    [onVoiceStatusChange]
  );

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      stopRecognition();
    },
    [stopRecognition]
  );

  const handleResult = useCallback(
    (speechTranscript, confidence) => {
      const normalized = normalizeTranscript(speechTranscript);
      if (!normalized) {
        reportStatus("error", { error: "Heard silence. Try again." });
        return;
      }
      setTranscript(speechTranscript);
      reportStatus("success", { transcript: speechTranscript, confidence });
      if (typeof onCommand === "function") {
        onCommand(normalized);
      }
    },
    [onCommand, reportStatus]
  );

  const startListening = useCallback(() => {
    if (!isSupported) {
      reportStatus("error", { error: "Voice commands need a supported browser." });
      return;
    }

    stopRecognition();
    const ctor = getSpeechRecognitionCtor();
    if (!ctor) {
      reportStatus("error", { error: "Voice commands need a supported browser." });
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
        reportStatus("error", { error: "Heard silence. Try again." });
        return;
      }
      const bestAlt = event.results?.[0]?.[0];
      const confidence = typeof bestAlt?.confidence === "number" ? bestAlt.confidence : null;
      reportStatus("processing", { transcript: combinedTranscript, confidence });
      handleResult(combinedTranscript, confidence);
      recognition.stop();
    };

    recognition.onerror = (event) => {
      let message = "Couldn't understand that command.";
      if (event.error === "no-speech") {
        message = "Heard silence. Try again.";
      } else if (event.error === "not-allowed") {
        message = "Microphone blocked. Allow access and retry.";
      }
      reportStatus("error", { error: message });
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
    setTranscript(null);
    reportStatus("listening");
    recognition.start();
  }, [handleResult, isSupported, reportStatus, stopRecognition, onVoiceStatusChange]);

  return (
    <button
      type="button"
      className={`pill-toggle command-voice-btn ${status === "listening" ? "active" : ""}`}
      onClick={startListening}
      disabled={!isSupported}
      title="Start voice commands (Next, Undo, Back)"
    >
      {status === "listening" ? "Listening..." : "Voice Command"}
      {transcript ? <span className="command-voice-transcript">"{transcript}"</span> : null}
    </button>
  );
}
