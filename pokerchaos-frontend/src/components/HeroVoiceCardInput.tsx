import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSpokenCards, type ParsedCards, type CardCode } from "../lib/parseVoiceCards";

export type RecognitionStatus = "idle" | "listening" | "processing" | "success" | "error";

interface HeroVoiceCardInputProps {
  heroCards: {
    card1: CardCode | string | null;
    card2: CardCode | string | null;
  };
  onCardsParsed: (cards: ParsedCards) => void;
  onManualEntry: () => void;
  onVoiceStart: () => void;
  onVoiceStatusChange?: (
    status: RecognitionStatus,
    details?: { transcript?: string | null; error?: string | null; confidence?: number | null }
  ) => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface WindowWithSpeechRecognition extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const getSpeechRecognitionCtor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const extendedWindow = window as WindowWithSpeechRecognition;
  return extendedWindow.SpeechRecognition ?? extendedWindow.webkitSpeechRecognition ?? null;
};

export default function HeroVoiceCardInput(props: HeroVoiceCardInputProps) {
  const { heroCards, onCardsParsed, onManualEntry, onVoiceStart, onVoiceStatusChange } = props;

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [status, setStatus] = useState<RecognitionStatus>("idle");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // swallow browser stop errors
      }
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecognition();
    };
  }, [stopRecognition]);

  const reportStatus = useCallback(
    (nextStatus: RecognitionStatus, details?: { transcript?: string | null; error?: string | null; confidence?: number | null }) => {
      setStatus(nextStatus);
      if (typeof onVoiceStatusChange === "function") {
        onVoiceStatusChange(nextStatus, details);
      }
    },
    [onVoiceStatusChange]
  );

  const handleResult = useCallback(
    (speechTranscript: string, confidence?: number | null) => {
      const parsed = parseSpokenCards(speechTranscript);
      if (parsed) {
        reportStatus("success", { transcript: speechTranscript, confidence: confidence ?? null });
        setErrorMessage(null);
        onCardsParsed(parsed);
      } else {
        reportStatus("error", { transcript: speechTranscript, error: "Couldn't recognize cards. Please try again.", confidence: confidence ?? null });
        setErrorMessage("Couldn't recognize cards. Please try again.");
      }
    },
    [onCardsParsed, reportStatus]
  );

  const startListening = useCallback(() => {
    onVoiceStart();

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

    recognition.onresult = (event: SpeechRecognitionEvent) => {
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

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
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
  }, [handleResult, isSupported, onVoiceStart, reportStatus, stopRecognition]);

  const listening = status === "listening";

  const cardSummaryLine = useMemo(() => {
    const { card1, card2 } = heroCards;
    const displayCard = (card: string | null | undefined): string =>
      typeof card === "string" && card.length === 2 ? card.toUpperCase() : "--";
    return `${displayCard(card1)}  |  ${displayCard(card2)}`;
  }, [heroCards]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="sub" style={{ fontWeight: 600 }}>
          Current hand
        </span>
        <span style={{ fontSize: 14 }}>{cardSummaryLine}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={startListening} disabled={!isSupported || listening}>
          {listening ? "Listening..." : "Enter cards by voice"}
        </button>
        <button type="button" onClick={onManualEntry}>
          {heroCards.card1 && heroCards.card2 ? "Edit manually" : "Enter manually"}
        </button>
      </div>

      {transcript ? (
        <span className="sub" style={{ fontSize: 12 }}>
          Heard: "{transcript}"
        </span>
      ) : null}

      {status === "processing" ? (
        <span className="sub" style={{ fontSize: 12 }}>
          Processing...
        </span>
      ) : null}

      {status === "success" ? (
        <span className="sub" style={{ fontSize: 12, color: "#34d399" }}>
          Cards recognized.
        </span>
      ) : null}

      {status === "error" && errorMessage ? (
        <span className="sub" style={{ fontSize: 12, color: "#f87171" }}>
          {errorMessage}
        </span>
      ) : null}

      {!isSupported ? (
        <span className="sub" style={{ fontSize: 12 }}>
          Voice input requires Chrome or Edge with the Web Speech API.
        </span>
      ) : null}
    </div>
  );
}
