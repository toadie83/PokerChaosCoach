import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SeatSelectorCard from "./playHand/SeatSelectorCard.jsx";
import HoleCardSelectorCard from "./playHand/HoleCardSelectorCard.jsx";
import ActionCard from "./playHand/ActionCard.jsx";
import BoardSelectorCard from "./playHand/BoardSelectorCard.jsx";
import SummaryCard from "./playHand/SummaryCard.jsx";
import PlayHandHud from "./playHand/PlayHandHud.jsx";
import BoardStatePanel from "./playHand/BoardStatePanel.jsx";
import VoiceOverlay from "./playHand/VoiceOverlay.jsx";
import CommandVoiceButton from "./playHand/CommandVoiceButton.jsx";

const STEP_SEQUENCE = [
  "seat",
  "heroCards",
  "actions-preflop",
  "board-flop",
  "actions-flop",
  "board-turn",
  "actions-turn",
  "board-river",
  "actions-river",
  "summary",
];

const PLAY_HAND_SESSION_KEY = "pcc_play_hand_session";
const PLAY_HAND_AUTO_ADVANCE_KEY = "pcc_play_hand_auto";

const STEP_LABELS = {
  seat: "Choose Seat",
  heroCards: "Hero Cards",
  "actions-preflop": "Preflop Actions",
  "board-flop": "Set Flop",
  "actions-flop": "Flop Actions",
  "board-turn": "Set Turn",
  "actions-turn": "Turn Actions",
  "board-river": "Set River",
  "actions-river": "River Actions",
  summary: "Hand Summary",
};

const STEP_HINTS = {
  seat: "Select your position before the hand begins.",
  heroCards: "Lock in your starting hand with voice or manual tools.",
  "actions-preflop": "Work through the preflop decision tree.",
  "board-flop": "Enter flop cards to advance the story.",
  "actions-flop": "Analyse and choose flop line.",
  "board-turn": "Reveal the turn card to continue.",
  "actions-turn": "Decide on your turn strategy.",
  "board-river": "Drop the river card to close the board.",
  "actions-river": "Make the final betting decision.",
  summary: "Review the full hand context and guidance.",
};

const streetFromActionStep = (stepKey) => {
  const [, street] = stepKey.split("-");
  return street || "preflop";
};

const streetFromBoardStep = streetFromActionStep;

const flopComplete = (state) => {
  if (!state?.board?.flop) return false;
  return state.board.flop.filter((card) => typeof card === "string" && card.length === 2).length === 3;
};

const stepCompleteStatus = (stepKey, state) => {
  if (!state) return false;
  switch (stepKey) {
    case "seat":
      return Boolean(state.heroSeat);
    case "heroCards":
      return Boolean(state.heroCards?.card1 && state.heroCards?.card2);
    case "actions-preflop":
      return state.handComplete || (state.street && state.street !== "preflop");
    case "board-flop":
      return flopComplete(state);
    case "actions-flop":
      return state.handComplete || (state.street && state.street !== "flop" && state.street !== "preflop");
    case "board-turn":
      return state.handComplete || Boolean(state.board?.turn);
    case "actions-turn":
      return state.handComplete || (state.street && state.street === "river");
    case "board-river":
      return state.handComplete || Boolean(state.board?.river);
    case "actions-river":
      return Boolean(state.handComplete);
    case "summary":
      return Boolean(state.handComplete);
    default:
      return false;
  }
};

const deriveRecommendedStepIndex = (state) => {
  for (let idx = 0; idx < STEP_SEQUENCE.length; idx += 1) {
    const stepKey = STEP_SEQUENCE[idx];
    if (!stepCompleteStatus(stepKey, state)) {
      return idx;
    }
  }
  return STEP_SEQUENCE.length - 1;
};

const PERSONA_LINES = {
  chaos_shark: {
    seat: "Chaos Coach: Grab a seat and set the tempo.",
    heroCards: "Chaos Coach: Choose cards that make villains sweat.",
    preflop: "Chaos Coach: Let's pressure the table preflop.",
    flop: "Chaos Coach: Time to fire on this flop.",
    turn: "Chaos Coach: Keep the barrel blazing on the turn.",
    river: "Chaos Coach: Close the river with authority.",
    summary: "Chaos Coach: Review the chaos and queue the next hand.",
  },
  short_stack_ninja: {
    seat: "Short-Stack Ninja: Pick your battleground wisely.",
    heroCards: "Short-Stack Ninja: Lock in a shove-ready hand.",
    preflop: "Short-Stack Ninja: Stack-to-pot awareness starts now.",
    flop: "Short-Stack Ninja: Chip preservation meets pressure.",
    turn: "Short-Stack Ninja: Choose your moment to strike.",
    river: "Short-Stack Ninja: This river decides the dojo's honor.",
    summary: "Short-Stack Ninja: Reflect, adapt, and reload stealthily.",
  },
  range_professor: {
    seat: "Range Professor: Seat selection sets the syllabus.",
    heroCards: "Range Professor: Select a hand that aces theory.",
    preflop: "Range Professor: Preflop range lecture in session.",
    flop: "Range Professor: Flop texture quiz time.",
    turn: "Range Professor: Turn theory meets practical execution.",
    river: "Range Professor: River decisions close the lesson.",
    summary: "Range Professor: Review the line, refine the chart.",
  },
  cash_game_crusher: {
    seat: "Cash Game Crusher: Take the seat that prints.",
    heroCards: "Cash Game Crusher: Choose a hand that stacks regs.",
    preflop: "Cash Game Crusher: Build pots with edge preflop.",
    flop: "Cash Game Crusher: Apply pressure with calculated lines.",
    turn: "Cash Game Crusher: Size up the turn for max value.",
    river: "Cash Game Crusher: Extract every chip on the river.",
    summary: "Cash Game Crusher: Log the win, prep the next grind.",
  },
};

const DEFAULT_PERSONA_LINES = {
  seat: "Coach: Lock in your seat to begin.",
  heroCards: "Coach: Set your starting hand to begin planning.",
  preflop: "Coach: Define your preflop strategy.",
  flop: "Coach: Set the tone for the flop.",
  turn: "Coach: Consider pressure versus pot control on the turn.",
  river: "Coach: Final decisions define the hand.",
  summary: "Coach: Summarize the hand and capture learnings.",
};

const SEAT_NAME_MAP = {
  btn: "Button",
  sb: "Small Blind",
  bb: "Big Blind",
  co: "Cutoff",
  hj: "Hijack",
  lj: "Lojack",
  utg: "UTG",
  utg1: "UTG+1",
  utg2: "UTG+2",
  mp: "Middle Position",
};

const stageFromStepKey = (stepKey) => {
  if (stepKey === "seat") return "seat";
  if (stepKey === "heroCards") return "heroCards";
  if (stepKey === "summary") return "summary";
  if (stepKey.startsWith("actions-")) return streetFromActionStep(stepKey);
  if (stepKey.startsWith("board-")) return streetFromBoardStep(stepKey);
  return "preflop";
};

const getPersonaCommentary = (persona, stepKey) => {
  const stage = stageFromStepKey(stepKey);
  const personaLines = PERSONA_LINES[persona] || PERSONA_LINES.chaos_shark;
  const fallback = DEFAULT_PERSONA_LINES[stage] || DEFAULT_PERSONA_LINES.preflop;
  return personaLines[stage] || fallback;
};

const seatLabelFromCode = (seat) => {
  if (!seat) return "Unseated";
  const key = String(seat).toLowerCase();
  return SEAT_NAME_MAP[key] || seat.toUpperCase();
};

const formatSizing = (sizing) => {
  if (!sizing) return "";
  if (typeof sizing === "string") return sizing;
  if (sizing.kind === "percent") return `${sizing.value}%`;
  if (sizing.kind === "multiple") return `${sizing.value}x`;
  return "";
};

const describeHistoryEntry = (entry, heroSeat) => {
  if (!entry) return "";
  const actorLabel =
    entry.actor === "hero"
      ? heroSeat
        ? heroSeat.toUpperCase()
        : "Hero"
      : entry.actor === "opp"
      ? "Villain"
      : String(entry.actor || "Villain").toUpperCase();
  const action = (entry.action || "").replace(/_/g, " ").trim();
  const sizing = formatSizing(entry.sizing);
  const note = entry.note ? ` (${entry.note})` : "";
  return [actorLabel, action, sizing].filter(Boolean).join(" ") + note;
};

const summarizeStreetHistory = (history = [], street, heroSeat) => {
  if (!street) return "";
  const recent = history.filter((item) => item.street === street);
  if (!recent.length) return "";
  const tail = recent.slice(-3);
  return tail.map((entry) => describeHistoryEntry(entry, heroSeat)).join(", ");
};

export default function PlayHandModal({
  open,
  onExit,
  onRestart,
  state,
  seats = [],
  setField,
  onAction,
  actions = [],
  coach,
  loading,
  openHeroCardSelector,
  handleSaveHeroCards,
  handleManualCardEntry,
  prepareForCardChange,
  openFlopManualSelector,
  openFlopCardSelector,
  openTurnCardSelector,
  openRiverCardSelector,
  handleFlopCardsChange,
  handleTurnCardChange,
  handleRiverCardChange,
  dispatch,
  villainTypeOptions = [],
  aiSnapshot,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = window.localStorage?.getItem(PLAY_HAND_AUTO_ADVANCE_KEY);
      if (stored === null) return true;
      return stored === "true";
    } catch {
      return true;
    }
  });
  const [voiceOverlayState, setVoiceOverlayState] = useState(null);
  const [summaryToast, setSummaryToast] = useState(null);
  const voiceTimeoutRef = useRef(null);
  const summaryTimeoutRef = useRef(null);
  const lastStepStateRef = useRef({ key: null, complete: false });
  const restoredSessionRef = useRef(false);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.setItem(
          PLAY_HAND_AUTO_ADVANCE_KEY,
          autoAdvance ? "true" : "false"
        );
      }
    } catch {
      /* ignore storage errors */
    }
  }, [autoAdvance]);

  const updateVoiceOverlay = useCallback((source, status, details = {}) => {
    if (voiceTimeoutRef.current) {
      clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }
    if (status === "idle") {
      setVoiceOverlayState((prev) => {
        if (prev && prev.source === source) {
          return null;
        }
        return prev;
      });
      return;
    }
    setVoiceOverlayState({
      source,
      status,
      transcript: details.transcript || null,
      error: details.error || null,
      confidence:
        typeof details.confidence === "number"
          ? details.confidence
          : typeof details.confidence === "string"
          ? Number(details.confidence)
          : null,
      timestamp: Date.now(),
    });
  }, []);

  const createVoiceHandler = useCallback(
    (source) => (status, details = {}) => {
      updateVoiceOverlay(source, status, details);
    },
    [updateVoiceOverlay]
  );
  const heroVoiceStatusHandler = useMemo(() => createVoiceHandler("Hero cards"), [createVoiceHandler]);
  const flopVoiceStatusHandler = useMemo(() => createVoiceHandler("Flop cards"), [createVoiceHandler]);
  const turnVoiceStatusHandler = useMemo(() => createVoiceHandler("Turn card"), [createVoiceHandler]);
  const riverVoiceStatusHandler = useMemo(() => createVoiceHandler("River card"), [createVoiceHandler]);
  const commandVoiceStatusHandler = useMemo(() => createVoiceHandler("Commands"), [createVoiceHandler]);

  useEffect(() => {
    if (!voiceOverlayState) return;
    if (voiceOverlayState.status === "listening") return;
    const timeout = setTimeout(() => {
      setVoiceOverlayState(null);
    }, 1600);
    voiceTimeoutRef.current = timeout;
    return () => clearTimeout(timeout);
  }, [voiceOverlayState]);

  useEffect(() => {
    if (!summaryToast) return;
    const timeout = setTimeout(() => {
      setSummaryToast(null);
    }, 1100);
    summaryTimeoutRef.current = timeout;
    return () => clearTimeout(timeout);
  }, [summaryToast]);

  useEffect(
    () => () => {
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current);
      if (summaryTimeoutRef.current) clearTimeout(summaryTimeoutRef.current);
    },
    []
  );

  const handleExit = useCallback(() => {
    if (typeof onExit === "function") {
      onExit();
    }
  }, [onExit]);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setSummaryToast(null);
      lastStepStateRef.current = { key: STEP_SEQUENCE[0], complete: false };
    }
  }, [open]);

  const goNext = useCallback(() => {
    setStepIndex((idx) => Math.min(idx + 1, STEP_SEQUENCE.length - 1));
  }, []);

  const goPrevious = useCallback(() => {
    setStepIndex((idx) => Math.max(idx - 1, 0));
  }, []);

  const recommendedStepIndex = useMemo(
    () => deriveRecommendedStepIndex(state),
    [state]
  );
  const stepKey = STEP_SEQUENCE[stepIndex] || STEP_SEQUENCE[0];
  const stepLabel = STEP_LABELS[stepKey] || "Play Hand";
  const stepHint = STEP_HINTS[stepKey] || "";
  const stepComplete = stepCompleteStatus(stepKey, state);
  const isLastStep = stepIndex === STEP_SEQUENCE.length - 1;
  const canGoBack = stepIndex > 0;
  const progressLabel = `${stepIndex + 1} / ${STEP_SEQUENCE.length}`;
  const persona = state?.persona || "chaos_shark";
  const commentaryLine = useMemo(() => getPersonaCommentary(persona, stepKey), [persona, stepKey]);
  const heroSeatLabel = seatLabelFromCode(state?.heroSeat);
  const villainTypeLabel = useMemo(() => {
    const code = state?.villainType;
    const optionsArray = Array.isArray(villainTypeOptions) ? villainTypeOptions : [];
    const match = optionsArray.find((item) => item.code === code);
    return match?.label || "Unknown";
  }, [state?.villainType, villainTypeOptions]);
  const relativePosition = state?.heroRelativePosition || "auto";
  const highlightedActionCodes = [];
  const confidencePercent = useMemo(() => {
    const raw =
      coach?.confidence ??
      coach?.confidence_score ??
      coach?.confidence_pct ??
      coach?.confidencePercent ??
      coach?.confidencePercentage ??
      null;
    if (raw === undefined || raw === null) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const scaled = numeric <= 1 ? numeric * 100 : numeric;
    return Math.max(0, Math.min(100, scaled));
  }, [coach]);

  const handleRelativePositionChange = useCallback(
    (value) => {
      if (typeof setField !== "function") return;
      if (value === "auto") {
        setField("heroRelativePosition", "auto");
      } else if (value === "oop") {
        setField("heroRelativePosition", "oop");
      } else {
        setField("heroRelativePosition", "ip");
      }
    },
    [setField]
  );

  const handleHeroCardEdit = useCallback(() => {
    if (typeof prepareForCardChange === "function") {
      prepareForCardChange();
    }
    if (typeof openHeroCardSelector === "function") {
      openHeroCardSelector();
    }
  }, [prepareForCardChange, openHeroCardSelector]);

  const handleFlopCardEdit = useCallback(
    (index) => {
      if (typeof openFlopCardSelector === "function") {
        openFlopCardSelector(index);
      } else if (typeof openFlopManualSelector === "function") {
        openFlopManualSelector();
      }
    },
    [openFlopCardSelector, openFlopManualSelector]
  );

  const handleTurnCardEdit = useCallback(() => {
    if (typeof openTurnCardSelector === "function") {
      openTurnCardSelector(state?.board?.turn || null);
    }
  }, [openTurnCardSelector, state?.board?.turn]);

  const handleRiverCardEdit = useCallback(() => {
    if (typeof openRiverCardSelector === "function") {
      openRiverCardSelector(state?.board?.river || null);
    }
  }, [openRiverCardSelector, state?.board?.river]);

  const handleRestart = useCallback(() => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage?.removeItem(PLAY_HAND_SESSION_KEY);
      }
    } catch {
      /* ignore storage errors */
    }
    restoredSessionRef.current = false;
    lastStepStateRef.current = { key: STEP_SEQUENCE[0], complete: false };
    setStepIndex(0);
    setSummaryToast(null);
    setVoiceOverlayState(null);
    if (typeof setField === "function") {
      setField("heroRelativePosition", "auto");
    }
    if (typeof onRestart === "function") {
      onRestart();
    }
  }, [onRestart, setField]);

  useEffect(() => {
    if (!open) {
      restoredSessionRef.current = false;
      return;
    }
    if (restoredSessionRef.current) return;
    restoredSessionRef.current = true;
    let nextIndex = recommendedStepIndex;
    try {
      if (typeof window !== "undefined") {
        const stored = window.localStorage?.getItem(PLAY_HAND_SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed.step === "string") {
            const storedIndex = STEP_SEQUENCE.indexOf(parsed.step);
            if (storedIndex >= 0) {
              nextIndex = storedIndex;
            }
          }
        }
      }
    } catch {
      /* ignore storage errors */
    }
    if (nextIndex > recommendedStepIndex) {
      nextIndex = recommendedStepIndex;
    }
    if (nextIndex !== stepIndex) {
      setStepIndex(nextIndex);
    }
    setSummaryToast(null);
    const nextKey = STEP_SEQUENCE[nextIndex] || STEP_SEQUENCE[0];
    lastStepStateRef.current = {
      key: nextKey,
      complete: stepCompleteStatus(nextKey, state),
    };
  }, [open, recommendedStepIndex, state, stepIndex]);

  useEffect(() => {
    if (!open) return;
    if (stepIndex > recommendedStepIndex) {
      setStepIndex(recommendedStepIndex);
    }
  }, [open, stepIndex, recommendedStepIndex]);

  useEffect(() => {
    if (!open) return;
    try {
      if (typeof window !== "undefined") {
        const key = STEP_SEQUENCE[stepIndex] || STEP_SEQUENCE[0];
        window.localStorage?.setItem(
          PLAY_HAND_SESSION_KEY,
          JSON.stringify({ step: key })
        );
      }
    } catch {
      /* ignore storage errors */
    }
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const previous = lastStepStateRef.current;
    if (previous.key !== stepKey) {
      lastStepStateRef.current = { key: stepKey, complete: false };
    }
    if (
      stepComplete &&
      !lastStepStateRef.current.complete &&
      stepKey.startsWith("actions-")
    ) {
      const street = streetFromActionStep(stepKey);
      const summary = summarizeStreetHistory(state?.history || [], street, state?.heroSeat);
      if (summary) {
        const streetLabelReadable = street.charAt(0).toUpperCase() + street.slice(1);
        setSummaryToast({
          id: Date.now(),
          message: `${streetLabelReadable}: ${summary}`,
          street,
        });
      }
    }
    lastStepStateRef.current = { key: stepKey, complete: stepComplete };
  }, [open, stepKey, stepComplete, state?.history, state?.heroSeat]);

  useEffect(() => {
    if (!open) return;
    if (!autoAdvance) return;
    if (!stepComplete) return;
    if (isLastStep) return;
    const t = setTimeout(() => {
      goNext();
    }, 320);
    return () => clearTimeout(t);
  }, [open, autoAdvance, stepComplete, goNext, isLastStep]);

  const handleNextClick = useCallback(() => {
    if (isLastStep) {
      handleExit();
      return;
    }
    if (typeof onAction === "function" && stepKey.startsWith("actions-")) {
      onAction("next_street");
    }
    goNext();
  }, [goNext, handleExit, isLastStep, onAction, stepKey]);

  useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      const target = event.target;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "escape") {
        event.preventDefault();
        handleExit();
        return;
      }
      if (key === "n") {
        event.preventDefault();
        handleNextClick();
        return;
      }
      if (key === "u") {
        event.preventDefault();
        if (typeof dispatch === "function") {
          dispatch("undo");
        }
        return;
      }
      if (key === "b" || key === "r") {
        event.preventDefault();
        goPrevious();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [open, handleExit, handleNextClick, dispatch, goPrevious]);

  const handleCommand = useCallback(
    (command) => {
      const text = String(command || "").toLowerCase();
      if (!text) return;
      if (text.includes("next")) {
        handleNextClick();
        return;
      }
      if (text.includes("undo")) {
        if (typeof dispatch === "function") {
          dispatch("undo");
        }
        return;
      }
      if (text.includes("rewind") || text.includes("back") || text.includes("previous")) {
        goPrevious();
      }
    },
    [handleNextClick, dispatch, goPrevious]
  );

  const renderStep = useCallback(() => {
    switch (stepKey) {
      case "seat":
        return (
          <SeatSelectorCard
            seats={seats}
            heroSeat={state?.heroSeat}
            onSelectSeat={(seat) => {
              if (typeof setField === "function") {
                setField("heroSeat", seat);
              }
            }}
          />
        );
      case "heroCards":
        return (
          <HoleCardSelectorCard
            heroCards={state?.heroCards}
            onOpenSelector={openHeroCardSelector}
            onCardsParsed={handleSaveHeroCards}
            onManualEntry={handleManualCardEntry}
            onVoiceStart={prepareForCardChange}
            onVoiceStatusChange={heroVoiceStatusHandler}
          />
        );
      case "actions-preflop":
      case "actions-flop":
      case "actions-turn":
      case "actions-river": {
        const street = streetFromActionStep(stepKey);
        return (
          <ActionCard
            street={street}
            actions={actions}
            onAction={onAction}
            coach={coach}
            loading={loading}
            highlightedActionCodes={highlightedActionCodes}
            confidenceValue={confidencePercent}
          />
        );
      }
      case "board-flop":
      case "board-turn":
      case "board-river": {
        const street = streetFromBoardStep(stepKey);
        return (
          <BoardSelectorCard
            phase={street}
            board={state?.board}
            onOpenManual={
              street === "flop"
                ? openFlopManualSelector
                : street === "turn"
                ? () => openTurnCardSelector?.(state?.board?.turn)
                : () => openRiverCardSelector?.(state?.board?.river)
            }
            onFlopChange={handleFlopCardsChange}
            onTurnChange={handleTurnCardChange}
            onRiverChange={handleRiverCardChange}
            openTurnCardSelector={openTurnCardSelector}
            openRiverCardSelector={openRiverCardSelector}
            onFlopVoiceStatusChange={flopVoiceStatusHandler}
            onTurnVoiceStatusChange={turnVoiceStatusHandler}
            onRiverVoiceStatusChange={riverVoiceStatusHandler}
          />
        );
      }
      case "summary":
      default:
        return <SummaryCard state={state} coach={coach} aiSnapshot={aiSnapshot} />;
    }
  }, [
    stepKey,
    seats,
    state,
    setField,
    openHeroCardSelector,
    handleSaveHeroCards,
    handleManualCardEntry,
    prepareForCardChange,
    actions,
    onAction,
    coach,
    loading,
    handleFlopCardsChange,
    handleTurnCardChange,
    handleRiverCardChange,
    openFlopManualSelector,
    openTurnCardSelector,
    openRiverCardSelector,
    aiSnapshot,
    heroVoiceStatusHandler,
    highlightedActionCodes,
    confidencePercent,
    flopVoiceStatusHandler,
    turnVoiceStatusHandler,
    riverVoiceStatusHandler,
  ]);

  if (!open) return null;

  return (
    <div className="play-hand-modal-backdrop" onClick={handleExit}>
      <div
        className="play-hand-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Play Hand Mode"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="play-hand-header">
          <div className="play-hand-header-main">
            <div>
              <div className="play-hand-step-label">{stepLabel}</div>
              {stepHint ? <div className="play-hand-step-hint">{stepHint}</div> : null}
              {commentaryLine ? (
                <div className="play-hand-commentary" aria-live="polite">
                  {commentaryLine}
                </div>
              ) : null}
            </div>
            <div className="play-hand-progress">{progressLabel}</div>
          </div>
          <PlayHandHud
            heroSeat={state?.heroSeat}
            heroSeatLabel={heroSeatLabel}
            tableSize={state?.tableSize}
            street={state?.street || "preflop"}
            potSize={state?.potSizes?.total}
            villainTypeLabel={villainTypeLabel}
            autoAdvance={autoAdvance}
            onToggleAutoAdvance={() => setAutoAdvance((value) => !value)}
            relativePosition={relativePosition}
            onRelativePositionChange={handleRelativePositionChange}
          />
        </header>
        {summaryToast ? (
          <div className="play-hand-summary-toast" aria-live="assertive">
            {summaryToast.message}
          </div>
        ) : null}
        {voiceOverlayState ? (
          <VoiceOverlay
            source={voiceOverlayState.source}
            status={voiceOverlayState.status}
            transcript={voiceOverlayState.transcript}
            error={voiceOverlayState.error}
            confidence={voiceOverlayState.confidence}
          />
        ) : null}
        <BoardStatePanel
          heroCards={state?.heroCards}
          board={state?.board}
          onHeroCardClick={handleHeroCardEdit}
          onFlopCardClick={handleFlopCardEdit}
          onTurnCardClick={handleTurnCardEdit}
          onRiverCardClick={handleRiverCardEdit}
        />
        <section className="play-hand-body">{renderStep()}</section>
        <footer className="play-hand-footer">
          <div className="play-hand-footer-left">
            <button type="button" className="pill-toggle" onClick={handleExit}>
              Exit
            </button>
            <button type="button" className="pill-toggle" onClick={handleRestart}>
              Restart hand
            </button>
            <CommandVoiceButton
              onCommand={handleCommand}
              onVoiceStatusChange={commandVoiceStatusHandler}
            />
          </div>
          <div className="play-hand-footer-actions">
            <button type="button" className="pill-toggle" onClick={goPrevious} disabled={!canGoBack}>
              Back
            </button>
            <button
              type="button"
              className="pill-toggle accent"
              onClick={handleNextClick}
              disabled={false}
            >
              {isLastStep ? "Finish" : "Next"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
