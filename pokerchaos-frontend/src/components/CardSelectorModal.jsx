import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseSpokenNCards } from "../lib/parseVoiceCards";

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

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  const anyWindow = window;
  return anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition || null;
}

export default function CardSelectorModal({
  open,
  title = "Select Cards",
  slots,
  initialCards,
  onClose,
  onSave,
  requireAll = true,
  autoSaveOnComplete = false
}) {
  const effectiveSlots =
    Array.isArray(slots) && slots.length > 0
      ? slots
      : [
          { key: "card1", label: "Card 1" },
          { key: "card2", label: "Card 2" }
        ];

  const [draft, setDraft] = useState(() =>
    buildDraft(effectiveSlots, initialCards)
  );
  const [activeIndex, setActiveIndex] = useState(() =>
    computeInitialActiveIndex(effectiveSlots, initialCards)
  );
  const pendingAdvanceRef = useRef(null);
  const [error, setError] = useState("");
  const recognitionRef = useRef(null);
  const [voiceStatus, setVoiceStatus] = useState("idle");
  const [voiceError, setVoiceError] = useState("");
  const isVoiceSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  useEffect(() => {
    if (open) {
      setDraft(buildDraft(effectiveSlots, initialCards));
      setActiveIndex(computeInitialActiveIndex(effectiveSlots, initialCards));
      setError("");
      setVoiceError("");
      setVoiceStatus(isVoiceSupported ? "idle" : "unsupported");
    }
  }, [open, initialCards, effectiveSlots, isVoiceSupported]);

  const stopVoiceCapture = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    } catch {}
    recognitionRef.current = null;
  }, []);

  const handleVoiceTranscript = useCallback(
    (speechTranscript) => {
      const expectedCount = effectiveSlots.length;
      if (expectedCount <= 0) return false;
      const parsed = parseSpokenNCards(speechTranscript, expectedCount);
      if (!parsed) {
        return false;
      }
      let nextIndexResult = -1;
      setDraft((prev) => {
        const next = { ...prev };
        parsed.forEach((code, idx) => {
          const slot = effectiveSlots[idx];
          if (!slot || typeof code !== "string" || code.length < 2) return;
          next[slot.key] = {
            rank: code[0].toUpperCase(),
            suit: code[1].toLowerCase()
          };
        });
        nextIndexResult = findNextIncomplete(next, effectiveSlots, 0);
        return next;
      });
      pendingAdvanceRef.current = null;
      setError("");
      if (nextIndexResult !== undefined) {
        setActiveIndex((prev) => {
          if (nextIndexResult === -1) {
            return effectiveSlots.length > 0 ? effectiveSlots.length - 1 : prev;
          }
          return nextIndexResult;
        });
      }
      return true;
    },
    [effectiveSlots]
  );

  const startVoiceCapture = useCallback(() => {
    if (!isVoiceSupported) return;
    stopVoiceCapture();
    const ctor = getSpeechRecognitionCtor();
    if (!ctor) {
      setVoiceStatus("unsupported");
      return;
    }
    try {
      const recognition = new ctor();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const combinedTranscript = Array.from(event.results)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (!combinedTranscript) {
          setVoiceStatus("error");
          setVoiceError("Heard silence. Please try again.");
        } else {
          const success = handleVoiceTranscript(combinedTranscript);
          if (success) {
            setVoiceStatus("success");
            setVoiceError("");
          } else {
            setVoiceStatus("error");
            setVoiceError("Couldn't recognize cards. Please try again.");
          }
        }
        try {
          recognition.stop();
        } catch {}
      };
      recognition.onerror = (event) => {
        let message = "Couldn't recognize cards. Please try again.";
        if (event.error === "not-allowed") {
          message = "Microphone permission denied for voice input.";
        } else if (event.error === "no-speech") {
          message = "Heard silence. Please try again.";
        }
        setVoiceStatus("error");
        setVoiceError(message);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setVoiceStatus((prev) => (prev === "listening" ? "idle" : prev));
      };
      recognition.start();
      setVoiceStatus("listening");
      setVoiceError("");
    } catch (err) {
      recognitionRef.current = null;
      setVoiceStatus("error");
      setVoiceError("Unable to start voice recognition.");
    }
  }, [handleVoiceTranscript, isVoiceSupported, stopVoiceCapture]);

  useEffect(() => {
    if (!open) {
      stopVoiceCapture();
      setVoiceStatus("idle");
      setVoiceError("");
      return;
    }
    if (!isVoiceSupported) {
      setVoiceStatus("unsupported");
      return;
    }
    startVoiceCapture();
    return () => {
      stopVoiceCapture();
    };
  }, [open, isVoiceSupported, startVoiceCapture, stopVoiceCapture]);

  useEffect(() => {
    return () => {
      stopVoiceCapture();
    };
  }, [stopVoiceCapture]);

  const cardStrings = useMemo(() => {
    return draftToCardStrings(draft, effectiveSlots);
  }, [draft, effectiveSlots]);

  const activeSlot = effectiveSlots[activeIndex] || effectiveSlots[0];
  const activeCard = activeSlot ? draft[activeSlot.key] : null;

  useEffect(() => {
    if (pendingAdvanceRef.current === null || pendingAdvanceRef.current === undefined) {
      return;
    }
    const target = pendingAdvanceRef.current;
    pendingAdvanceRef.current = null;
    if (target !== -1 && target < effectiveSlots.length) {
      setActiveIndex(target);
    }
  }, [draft, effectiveSlots.length]);

  const saveSelection = useCallback(
    (candidateCardStrings) => {
      if (
        requireAll &&
        effectiveSlots.some((slot) => !candidateCardStrings?.[slot.key])
      ) {
        setError("Pick a rank and suit for each card.");
        return false;
      }
      if (hasDuplicateCardStrings(candidateCardStrings, effectiveSlots)) {
        setError("Cannot select the same card twice.");
        return false;
      }
      setError("");
      onSave(candidateCardStrings);
      return true;
    },
    [effectiveSlots, onSave, requireAll]
  );

  const handleSuitSelect = (value) => {
    if (!activeSlot) return;
    if (!activeCard?.rank) {
      setError("Pick a rank before choosing a suit.");
      return;
    }
    const slotIndex = activeIndex;
    const slotKey = activeSlot.key;
    const next = {
      ...draft,
      [slotKey]: {
        ...(draft[slotKey] || {}),
        suit: value
      }
    };
    if (isCardDuplicate(next, slotKey)) {
      pendingAdvanceRef.current = null;
      setError("Cannot select the same card twice.");
      return;
    }
    const nextIndex = findNextIncomplete(next, effectiveSlots, slotIndex + 1);
    pendingAdvanceRef.current = nextIndex;
    setDraft(next);
    setError("");
    if (autoSaveOnComplete) {
      const nextCardStrings = draftToCardStrings(next, effectiveSlots);
      if (areAllSlotsComplete(nextCardStrings, effectiveSlots)) {
        saveSelection(nextCardStrings);
      }
    }
  };

  const handleRankSelect = (value) => {
    if (!activeSlot) return;
    const slotKey = activeSlot.key;
    let cleared = false;
    setDraft((prev) => {
      const next = {
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          rank: value
        }
      };
      if (isCardDuplicate(next, slotKey)) {
        next[slotKey] = {
          ...next[slotKey],
          suit: null
        };
        cleared = true;
      }
      pendingAdvanceRef.current = null;
      return next;
    });
    setError(cleared ? "Suit cleared because that card was already used." : "");
  };

  const handleBack = () => {
    if (!effectiveSlots.length) return;
    setError("");
    pendingAdvanceRef.current = null;
    setDraft((prev) => {
      const targetIndex = activeIndex === 0 ? 0 : activeIndex - 1;
      const targetSlot = effectiveSlots[targetIndex];
      if (!targetSlot) return prev;
      return {
        ...prev,
        [targetSlot.key]: { rank: null, suit: null }
      };
    });
    setActiveIndex((prev) => (prev === 0 ? 0 : prev - 1));
  };

  const handleFocusSlot = (index) => {
    if (index < 0 || index >= effectiveSlots.length) return;
    pendingAdvanceRef.current = null;
    setError("");
    setActiveIndex(index);
  };

  const handleClearSlot = (index) => {
    if (index < 0 || index >= effectiveSlots.length) return;
    const slotKey = effectiveSlots[index]?.key;
    if (!slotKey) return;
    pendingAdvanceRef.current = null;
    setDraft((prev) => ({
      ...prev,
      [slotKey]: { rank: null, suit: null }
    }));
    setActiveIndex(index);
    setError("");
  };

  const handleSave = () => {
    saveSelection(cardStrings);
  };

  if (!open) return null;

  const allComplete = effectiveSlots.every(
    (slot) => draft[slot.key]?.rank && draft[slot.key]?.suit
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <p className="sub" style={{ marginTop: 0 }}>
            {isVoiceSupported
              ? "Speak your cards or choose rank then suit for each slot."
              : "Choose rank then suit for each card."}
          </p>
          {isVoiceSupported ? (
            <div className={`voice-indicator ${voiceStatus}`}>
              <span>
                {voiceStatus === "listening"
                  ? "Listening for cards…"
                  : voiceStatus === "success"
                  ? "Voice cards captured. Review before saving."
                  : voiceStatus === "error"
                  ? voiceError || "Couldn't recognize cards. Please try again."
                  : "Use voice input or retry if needed."}
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={(e) => {
                  e.preventDefault();
                  startVoiceCapture();
                }}
                disabled={voiceStatus === "listening"}
              >
                {voiceStatus === "listening" ? "Listening…" : "Retry voice"}
              </button>
            </div>
          ) : (
            <div className="voice-indicator unsupported">
              Voice input not supported in this browser.
            </div>
          )}
          <div className="card-progress">
            {effectiveSlots.map((slot, idx) => {
              const card = formatCard(draft[slot.key]);
              const isActive = idx === activeIndex;
              return (
                <button
                  type="button"
                  key={slot.key}
                  className={
                    isActive ? "card-progress-pill active" : "card-progress-pill"
                  }
                  onClick={() => handleFocusSlot(idx)}
                >
                  {slot.label || `Card ${idx + 1}`}:{" "}
                  {card ? card.toUpperCase() : "—"}
                </button>
              );
            })}
          </div>
          <div className="card-grid">
            {effectiveSlots.map((slot, idx) => (
              <div
                key={slot.key}
                className="card-slot"
                onClick={() => {
                  if (idx !== activeIndex) handleFocusSlot(idx);
                }}
                style={idx !== activeIndex ? { cursor: "pointer" } : undefined}
              >
                <h3 className="card-slot-title">
                  {slot.label || `Card ${idx + 1}`}{" "}
                  {formatCard(draft[slot.key])
                    ? `(${formatCard(draft[slot.key])})`
                    : ""}
                </h3>
                {idx === activeIndex ? (
                  <>
                    <div className="card-slot-section">
                      <span className="card-slot-label">Rank</span>
                      <div className="rank-grid">
                        {ranks.map((rank) => {
                          const active = draft[slot.key]?.rank === rank;
                          return (
                            <button
                              key={rank}
                              type="button"
                              className={
                                active
                                  ? "btn-rank active"
                                  : "btn-rank"
                              }
                              onClick={() => handleRankSelect(rank)}
                            >
                              {rank}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearSlot(idx);
                        }}
                      >
                        Clear card
                      </button>
                    </div>
                    <div className="card-slot-section">
                      <span className="card-slot-label">Suit</span>
                      <div className="card-slot-buttons">
                        {suits.map((suit) => {
                          const hasRank = Boolean(draft[slot.key]?.rank);
                          const active = draft[slot.key]?.suit === suit.code;
                          const disabled =
                            !hasRank || isSuitDisabled(suit.code, slot.key, draft);
                          return (
                            <button
                              key={suit.code}
                              type="button"
                              className={
                                active
                                  ? "btn-secondary active"
                                  : disabled
                                  ? "btn-secondary disabled"
                                  : "btn-secondary"
                              }
                              onClick={() => {
                                if (!disabled) handleSuitSelect(suit.code);
                              }}
                              disabled={disabled}
                            >
                              {suit.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="card-slot-placeholder">
                    {formatCard(draft[slot.key]) ? (
                      <>
                        <span className="sub">
                          Selected&nbsp;{formatCard(draft[slot.key]).toUpperCase()}
                        </span>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearSlot(idx);
                          }}
                          style={{ marginTop: 4 }}
                        >
                          Clear card
                        </button>
                      </>
                    ) : (
                      <span className="sub">Waiting for selection</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {error ? <p className="error-text">{error}</p> : null}
          {allComplete ? (
            <p className="sub" style={{ marginTop: 8 }}>
              All cards selected. Review or press Save.
            </p>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={handleBack}>
            Back
          </button>
          <button type="button" onClick={handleSave}>
            Save Cards
          </button>
        </div>
      </div>
    </div>
  );
}

function buildDraft(slots, initialCards = {}) {
  return slots.reduce((acc, slot) => {
    acc[slot.key] = parseCard(initialCards?.[slot.key]);
    return acc;
  }, {});
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

function isSuitDisabled(suit, slotKey, draft) {
  const targetRank = draft[slotKey]?.rank;
  if (!targetRank) return true;
  return Object.entries(draft).some(([key, card]) => {
    if (key === slotKey) return false;
    return card?.rank === targetRank && card?.suit === suit;
  });
}

function findNextIncomplete(draft, slots, startIndex = 0) {
  for (let i = startIndex; i < slots.length; i++) {
    const card = draft[slots[i].key];
    if (!card?.rank || !card?.suit) {
      return i;
    }
  }
  return -1;
}

function computeInitialActiveIndex(slots, initialCards = {}) {
  const draft = buildDraft(slots, initialCards);
  const next = findNextIncomplete(draft, slots, 0);
  if (next !== -1) return next;
  return slots.length > 0 ? slots.length - 1 : 0;
}

function isCardDuplicate(draft, slotKey) {
  const target = draft[slotKey];
  if (!target?.rank || !target?.suit) return false;
  return Object.entries(draft).some(([key, card]) => {
    if (key === slotKey) return false;
    return card?.rank === target.rank && card?.suit === target.suit;
  });
}

function draftToCardStrings(draft, slots) {
  return slots.reduce((acc, slot) => {
    acc[slot.key] = formatCard(draft[slot.key]);
    return acc;
  }, {});
}

function hasDuplicateCardStrings(cardStrings = {}, slots = []) {
  const seen = new Set();
  for (const slot of slots) {
    const card = cardStrings[slot.key];
    if (!card) continue;
    if (seen.has(card)) return true;
    seen.add(card);
  }
  return false;
}

function areAllSlotsComplete(cardStrings = {}, slots = []) {
  return slots.every((slot) => Boolean(cardStrings[slot.key]));
}
