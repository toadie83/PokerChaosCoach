import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestChaosLine } from "./api/aiService.js";
import ActionButtons from "./components/ActionButtons.jsx";
import ActionAmountModal from "./components/ActionAmountModal.jsx";
import ChaosHud from "./components/ChaosHud.jsx";
import CardSelectorModal from "./components/CardSelectorModal.jsx";
import DecisionCard from "./components/DecisionCard.jsx";
import HistoryStrip from "./components/HistoryStrip.jsx";
import PlayHandModal from "./components/PlayHandModal.jsx";
import HeroVoiceCardInput from "./components/HeroVoiceCardInput";
import FlopCardInput from "./components/FlopCardInput.jsx";
import SingleBoardCardInput from "./components/SingleBoardCardInput.jsx";
import StackDepthModal from "./components/StackDepthModal.jsx";
import ReplayVisionPanel from "./components/ReplayVisionPanel.jsx";
import BetaCoachHudModal from "./components/BetaCoachHudModal.jsx";
import { useGameState } from "./state/useGameState.js";
import { summarizeForAI, getAvailableActions } from "./state/machine.js";
import { getChaosMood } from "./state/chaosMeter.js";
import { computeSizingNote } from "./lib/sizing.js";
import { getQuickOpenSnapshot } from "./lib/quickOpenRange.js";
import { seatsForTableSize } from "./state/seatUtils.js";
import {
  buildDecisionNode,
  buildStackState,
  assumedHeroEventFromRecommendation,
} from "./state/decisionState.js";

const HERO_CARD_SLOTS = [
  { key: "card1", label: "Card 1" },
  { key: "card2", label: "Card 2" },
];

const FLOP_CARD_SLOTS = [
  { key: "card1", label: "Flop card 1" },
  { key: "card2", label: "Flop card 2" },
  { key: "card3", label: "Flop card 3" },
];

const COACH_STREETS = ["preflop", "flop", "turn", "river"];
const DECISION_MOMENT_LIMIT = 10;

function cloneDecisionValue(value) {
  if (value === null || value === undefined) return value;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function decisionMomentSignature(state, coach) {
  return JSON.stringify({ state, coach: coach || null });
}

function buildDecisionMomentLabel(state, coach) {
  const street = String(state?.street || "preflop");
  const streetLabel = `${street.charAt(0).toUpperCase()}${street.slice(1)}`;
  const seat = state?.heroSeat ? String(state.heroSeat).toUpperCase() : "Seat unset";
  const action = coach?.hero_action
    ? String(coach.hero_action).replaceAll("_", " ").toUpperCase()
    : "State saved";
  return `${streetLabel} · ${seat} · ${action}`;
}

export default function App() {
  const {
    state,
    setField,
    dispatch,
    clearActions,
    restoreSnapshot,
    commitDetectedCards,
    reset,
  } = useGameState();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardSelectorConfig, setCardSelectorConfig] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [betaHudOpen, setBetaHudOpen] = useState(false);
  const [decisionMoments, setDecisionMoments] = useState([]);
  const decisionMomentCounterRef = useRef(0);
  const previousDecisionStateRef = useRef(null);
  const restoringDecisionMomentRef = useRef(false);
  const [autoSaveHands, setAutoSaveHands] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = window.localStorage?.getItem("pcc_auto_save_hands");
      return saved !== "false";
    } catch {
      return true;
    }
  });
  const [showQuickRanges, setShowQuickRanges] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage?.getItem("pcc_show_quick_ranges") !== "false";
    } catch {
      return true;
    }
  });
  const [autoRotateSeat, setAutoRotateSeat] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage?.getItem("pcc_auto_rotate_seat") === "true";
    } catch {
      return false;
    }
  });
  const [previewSizing, setPreviewSizing] = useState(null);
  const [actionAmountConfig, setActionAmountConfig] = useState(null);
  const [replayVisionOpen, setReplayVisionOpen] = useState(false);
  const [replayVisionStatus, setReplayVisionStatus] = useState("idle");
  const [stackModalOpen, setStackModalOpen] = useState(false);
  const [playHandOpen, setPlayHandOpen] = useState(false);

  const storeDecisionMoment = useCallback((sourceState, sourceCoach, source = "manual") => {
    if (!sourceState) return null;
    decisionMomentCounterRef.current += 1;
    const stateSnapshot = cloneDecisionValue(sourceState);
    const coachSnapshot = cloneDecisionValue(sourceCoach || null);
    const signature = decisionMomentSignature(stateSnapshot, coachSnapshot);
    const moment = {
      id: `decision-${Date.now()}-${decisionMomentCounterRef.current}`,
      street: String(stateSnapshot.street || "preflop"),
      label: buildDecisionMomentLabel(stateSnapshot, coachSnapshot),
      heroSeat: stateSnapshot.heroSeat || "",
      heroCards: [stateSnapshot.heroCards?.card1, stateSnapshot.heroCards?.card2].filter(Boolean),
      boardCards: [
        ...(Array.isArray(stateSnapshot.board?.flop) ? stateSnapshot.board.flop : []),
        stateSnapshot.board?.turn,
        stateSnapshot.board?.river,
      ].filter(Boolean),
      action: coachSnapshot?.hero_action || "",
      source,
      createdAt: Date.now(),
      signature,
      state: stateSnapshot,
      coach: coachSnapshot,
    };
    setDecisionMoments((current) => {
      if (current.some((item) => item.signature === signature)) return current;
      return [moment, ...current].slice(0, DECISION_MOMENT_LIMIT);
    });
    return moment.id;
  }, []);
  const handlePlayHandOpen = useCallback(() => {
    setField("heroSeat", "");
    setField("heroCards", { card1: null, card2: null });
    setField("heroRelativePosition", "auto");
    setPlayHandOpen(true);
  }, [setField]);

  const handleReplayCardsDetected = useCallback(
    (detection) => {
      if (commitDetectedCards(detection, { autoRotateSeat })) {
        setCoach(null);
        setPreviewSizing(null);
      }
    },
    [commitDetectedCards, autoRotateSeat],
  );

  const openStackModal = useCallback(() => {
    setStackModalOpen(true);
  }, []);

  const closeStackModal = useCallback(() => {
    setStackModalOpen(false);
  }, []);

  const handleSaveStacksQuick = useCallback(
    ({
      heroStack,
      villainStack,
      heroRemainingStack,
      villainRemainingStack,
      potOverride,
    }) => {
      if (heroStack !== undefined) {
        setField("heroStackBB", heroStack);
      }
      if (villainStack !== undefined) {
        setField("villainStackBB", villainStack);
      }
      setField("remainingStacks", {
        heroRemainingBB: heroRemainingStack ?? null,
        opponentRemainingBB: villainRemainingStack ?? null,
      });
      if (potOverride !== undefined) {
        setField("potSizes", { total: potOverride });
      }
      setStackModalOpen(false);
    },
    [setField],
  );

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("pcc_compact_mode", "true");
      }
    } catch {}
    if (typeof document !== "undefined") {
      document.body.classList.add("compact-mode");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.classList.remove("compact-mode");
      }
    };
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          "pcc_auto_save_hands",
          autoSaveHands ? "true" : "false",
        );
      }
    } catch {}
  }, [autoSaveHands]);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          "pcc_show_quick_ranges",
          showQuickRanges ? "true" : "false",
        );
      }
    } catch {}
  }, [showQuickRanges]);

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          "pcc_auto_rotate_seat",
          autoRotateSeat ? "true" : "false",
        );
      }
    } catch {}
  }, [autoRotateSeat]);

  const handleReset = useCallback(() => {
    setCoach(null);
    setDecisionMoments([]);
    setCardSelectorConfig(null);
    setStackModalOpen(false);
    reset();
  }, [reset]);

  const handleClearActions = useCallback(() => {
    setCoach(null);
    setCardSelectorConfig(null);
    clearActions();
  }, [clearActions]);

  const handleResetPreserveSeat = useCallback(() => {
    const currentSeat = state.heroSeat || "";
    handleReset();
    if (currentSeat) {
      setTimeout(() => {
        setField("heroSeat", currentSeat);
      }, 0);
    }
  }, [state.heroSeat, handleReset, setField]);

  const handleSaveHeroCards = useCallback(
    (cards) => {
      const normalized = {
        card1: cards?.card1 || null,
        card2: cards?.card2 || null,
      };
      const currentSeat = state.heroSeat || "";
      handleReset();
      setTimeout(() => {
        if (currentSeat) {
          setField("heroSeat", currentSeat);
        }
        setField("heroCards", normalized);
      }, 0);
    },
    [handleReset, setField, state.heroSeat],
  );

  const onAction = useCallback(
    (eventOrSpec) => {
      const spec =
        eventOrSpec && typeof eventOrSpec === "object"
          ? eventOrSpec
          : { code: String(eventOrSpec || "") };
      const evt = String(spec.code || "");
      if (!evt) return;

      const enteredAmount = Number(spec.amountBB ?? spec.toAmountBB);
      if (
        spec.requiresAmount &&
        (!Number.isFinite(enteredAmount) || enteredAmount <= 0)
      ) {
        setActionAmountConfig(spec);
        return;
      }

      if (evt === "next_street" || evt === "reset_hand") {
        try {
          setCoach(null);
        } catch {}
        try {
          setField("nextActor", "hero");
        } catch {}
        if (evt === "reset_hand") {
          setDecisionMoments([]);
          try {
            setField("potSizes", { total: null });
          } catch {}
        }
        setPreviewSizing(null);
      }

      const autoClearCoach = new Set([
        "opp_call",
        "opp_fold",
        "opp_all_fold",
        "opp_one_call",
        "opp_multi_call",
        "opp_check_back",
        "opp_bet",
        "opp_raise",
        "opp_4bet",
        "opp_shove",
        "unopened",
        "limped_to_me",
        "opened_to_me",
        "multiple_villains_opened",
        "button_steal",
        "faced_3bet",
        "faced_4bet",
        "first_to_act",
        "checked_to_me",
        "faced_bet",
        "faced_raise",
        "faced_allin",
      ]);
      if (autoClearCoach.has(evt)) {
        try {
          setCoach(null);
        } catch {}
      }

      const isHeroActual = evt.startsWith("hero_");
      const payload = {
        ...spec,
        code: evt,
        actorSeat: spec.actorSeat || state.opponentSeat || null,
        amountBB:
          Number.isFinite(enteredAmount) && enteredAmount > 0
            ? enteredAmount
            : spec.amountBB,
        toAmountBB:
          Number.isFinite(enteredAmount) && enteredAmount > 0
            ? enteredAmount
            : spec.toAmountBB,
        recommendation: isHeroActual ? coach : undefined,
      };
      setActionAmountConfig(null);
      dispatch(payload);
    },
    [dispatch, coach, state.opponentSeat, setField],
  );

  const handleSaveDecisionMoment = useCallback(() => {
    storeDecisionMoment(state, coach, "manual");
  }, [state, coach, storeDecisionMoment]);

  const handleRestoreDecisionMoment = useCallback(
    (momentId) => {
      const moment = decisionMoments.find((item) => item.id === momentId);
      if (!moment) return;
      restoringDecisionMomentRef.current = true;
      restoreSnapshot(moment.state);
      setCoach(cloneDecisionValue(moment.coach || null));
      setPreviewSizing(null);
      setActionAmountConfig(null);
      setCardSelectorConfig(null);
      setStackModalOpen(false);
    },
    [decisionMoments, restoreSnapshot],
  );

  const handleBetaStreetChange = useCallback(
    (nextStreet) => {
      const nextIndex = COACH_STREETS.indexOf(nextStreet);
      const currentIndex = COACH_STREETS.indexOf(state.street || "preflop");
      if (nextIndex < 0 || nextIndex === currentIndex) return;

      const savedMoment = decisionMoments.find(
        (moment) => moment.street === nextStreet,
      );
      if (savedMoment) {
        handleRestoreDecisionMoment(savedMoment.id);
        return;
      }

      if (nextIndex === currentIndex + 1 && !state.handComplete) {
        onAction("next_street");
      }
    },
    [
      state.street,
      state.handComplete,
      decisionMoments,
      handleRestoreDecisionMoment,
      onAction,
    ],
  );

  useEffect(() => {
    const previous = previousDecisionStateRef.current;
    const current = { state, coach };
    if (!previous) {
      previousDecisionStateRef.current = current;
      return;
    }

    if (restoringDecisionMomentRef.current) {
      restoringDecisionMomentRef.current = false;
      previousDecisionStateRef.current = current;
      return;
    }

    const previousStreetIndex = COACH_STREETS.indexOf(
      previous.state?.street || "preflop",
    );
    const currentStreetIndex = COACH_STREETS.indexOf(
      state.street || "preflop",
    );

    if (currentStreetIndex > previousStreetIndex) {
      storeDecisionMoment(previous.state, previous.coach, "automatic");
    }

    const previousHero = [
      previous.state?.heroCards?.card1,
      previous.state?.heroCards?.card2,
    ].join("|");
    const currentHero = [state.heroCards?.card1, state.heroCards?.card2].join("|");
    const looksLikeNewHand =
      state.street === "preflop" &&
      (state.history || []).length === 0 &&
      !state.lastEvent &&
      (previous.state?.handComplete ||
        previousStreetIndex > currentStreetIndex ||
        previousHero !== currentHero);
    if (looksLikeNewHand) {
      setDecisionMoments([]);
    }

    previousDecisionStateRef.current = current;
  }, [state, coach, storeDecisionMoment]);

  useEffect(() => {
    let isCancelled = false;
    async function run() {
      if (!state.lastEventAt || !state.lastEvent) return;
      const skip = new Set([
        "next_street",
        "reset_hand",
        "hero_fold",
        "hero_check",
        "hero_call",
        "hero_open",
        "hero_bet",
        "hero_raise",
        "hero_3bet",
        "hero_4bet",
        "hero_jam",
        "opp_call",
        "opp_one_call",
        "opp_multi_call",
        "opp_fold",
        "opp_all_fold",
        "opp_check_back",
      ]);
      if (skip.has(state.lastEvent)) return;

      const personaCode = state.persona || "chaos_shark";
      const needsCards =
        (personaCode === "replay_analyst" ||
          personaCode === "range_professor" ||
          personaCode === "short_stack_ninja" ||
          personaCode === "cash_game_crusher") &&
        (!state.heroCards?.card1 || !state.heroCards?.card2);
      if (needsCards) {
        let prompt = "Select your starting hand for coach guidance.";
        if (personaCode === "short_stack_ninja") {
          prompt = "Select your starting hand for Short-Stack Ninja guidance.";
        } else if (personaCode === "range_professor") {
          prompt = "Select your starting hand for Range Professor guidance.";
        } else if (personaCode === "cash_game_crusher") {
          prompt = "Select your starting hand for Cash Game Crusher guidance.";
        }
        if (!isCancelled) {
          setCoach({
            hero_action: "...",
            sizing: "",
            sizing_bb: null,
            flavor_text: prompt,
            confidence: "low",
            reasoning: "Hero cards are required to place this combo inside the selected persona's range.",
            assumptions: ["hero_cards_missing"],
            alternative_action: null,
            alternative_sizing: null,
            legal_actions: Array.isArray(state.legalActions) ? state.legalActions : [],
          });
          setLoading(false);
        }
        return;
      }

      if (personaCode === "short_stack_ninja") {
        const heroBB = Number(state.heroStackBB ?? 0);
        if (!heroBB || heroBB <= 0) {
          if (!isCancelled) {
            setCoach({
              hero_action: "...",
              sizing: "",
              sizing_bb: null,
              flavor_text:
                "Set hero stack in BB for Short-Stack Ninja guidance.",
              confidence: "low",
              reasoning:
                "Effective stack depth is required to distinguish jam, raise, call, and fold thresholds.",
              assumptions: ["effective_stack_missing"],
              alternative_action: null,
              alternative_sizing: null,
              legal_actions: Array.isArray(state.legalActions) ? state.legalActions : [],
            });
            setLoading(false);
          }
          return;
        }
      }

      setLoading(true);
      try {
        const payload = summarizeForAI(state);
        const res = await requestChaosLine(payload);
        if (!isCancelled) {
          const assumedHeroEvent = assumedHeroEventFromRecommendation(res, state);
          const acceptedRecommendation =
            assumedHeroEvent?.recommendation || res;
          setCoach(acceptedRecommendation);
          if (assumedHeroEvent) {
            dispatch(assumedHeroEvent);
          }
          try {
            const inc = /bet|raise|jam|3-bet|4-bet|open/i.test(
              res?.hero_action || "",
            )
              ? 1
              : -0.5;
            setField("momentum", Math.max(0, (state.momentum || 0) + inc));
          } catch {}
        }
      } catch (e) {
        if (!isCancelled)
          setCoach({
            hero_action: "...",
            sizing: "",
            flavor_text: "(Error) ChaosCoach is muted. Check backend.",
          });
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    run();
    return () => {
      isCancelled = true;
    };
  }, [
    state.lastEventAt,
    state.lastEvent,
    state.persona,
    state.heroCards?.card1,
    state.heroCards?.card2,
    state.heroStackBB,
    state.villainStackBB,
  ]);

  useEffect(() => {
    setPreviewSizing(null);
  }, [coach?.hero_action, coach?.sizing, state.street]);

  const seats = useMemo(
    () => seatsForTableSize(state.tableSize),
    [state.tableSize],
  );
  const mood = useMemo(
    () => getChaosMood(state),
    [
      state.street,
      state.aggressors,
      state.previousActions.length,
      state.lastEventAt,
    ],
  );
  const sizingNote = useMemo(
    () => computeSizingNote(state, coach),
    [state, coach],
  );

  const persona = state.persona || "replay_analyst";
  const stakeTier = state.stakeTier || "unknown";
  const heroCards = state.heroCards || { card1: null, card2: null };
  const heroCardsReady = Boolean(heroCards.card1 && heroCards.card2);
  const heroHandLabel = heroCardsReady
    ? `${heroCards.card1} ${heroCards.card2}`
    : "Not set";
  const quickOpenSnapshot = useMemo(
    () => {
      if (!showQuickRanges) return null;
      return getQuickOpenSnapshot({
        heroCards,
        heroSeat: state.heroSeat,
        tableSize: state.tableSize,
        gameType: persona === "cash_game_crusher" ? "cash" : state.gameType,
        heroStackBB: state.heroStackBB,
      });
    },
    [
      showQuickRanges,
      heroCards.card1,
      heroCards.card2,
      state.heroSeat,
      state.tableSize,
      state.gameType,
      state.heroStackBB,
      persona,
    ],
  );
  const personaNeedsCards =
    persona === "replay_analyst" ||
    persona === "range_professor" ||
    persona === "short_stack_ninja" ||
    persona === "cash_game_crusher";

  const closeCardSelector = useCallback(() => {
    setCardSelectorConfig(null);
  }, []);

  const openCardSelector = useCallback((config) => {
    setCardSelectorConfig(config);
  }, []);
  const openHeroCardSelector = useCallback(() => {
    openCardSelector({
      kind: "hero",
      title: "Select Hero Hand",
      slots: HERO_CARD_SLOTS,
      initialCards: { card1: null, card2: null },
      requireAll: true,
      onSave: (cards) => {
        handleSaveHeroCards(cards);
      },
    });
  }, [openCardSelector, handleSaveHeroCards]);

  const prepareForCardChange = useCallback(() => {
    if (heroCardsReady) {
      handleResetPreserveSeat();
    }
  }, [heroCardsReady, handleResetPreserveSeat]);

  const handleManualCardEntry = useCallback(() => {
    prepareForCardChange();
    openHeroCardSelector();
  }, [prepareForCardChange, openHeroCardSelector]);

  const handlePlayHandRestart = useCallback(() => {
    handleReset();
    setTimeout(() => {
      setField("heroSeat", "");
      setField("heroCards", { card1: null, card2: null });
      setField("board", { flop: [null, null, null], turn: null, river: null });
      setField("history", []);
      setField("heroRelativePosition", "auto");
      setField("potSizes", { total: null });
      setField("handComplete", false);
      setField("street", "preflop");
    }, 0);
  }, [handleReset, setField]);
  const handleFlopCardsChange = useCallback(
    (cards) => {
      const nextFlop = Array.isArray(cards)
        ? cards.map((card) =>
            typeof card === "string" && card.trim().length === 2
              ? card.trim().toUpperCase()
              : null,
          )
        : [null, null, null];
      const prevBoard = state.board || {
        flop: [null, null, null],
        turn: null,
        river: null,
      };
      const prevFlop = Array.isArray(prevBoard.flop)
        ? prevBoard.flop.map((card) =>
            typeof card === "string" && card.trim().length === 2
              ? card.trim().toUpperCase()
              : null,
          )
        : [null, null, null];
      const unchanged =
        prevFlop.length === nextFlop.length &&
        prevFlop.every((card, idx) => card === nextFlop[idx]);
      if (unchanged) {
        return;
      }
      setField("board", {
        flop: nextFlop,
        turn: prevBoard.turn,
        river: prevBoard.river,
      });
      setCoach(null);
    },
    [setField, state.board],
  );
  const handleTurnCardChange = useCallback(
    (card) => {
      const sanitized =
        typeof card === "string" && card.trim().length === 2
          ? card.trim().toUpperCase()
          : null;
      const prevBoard = state.board || {
        flop: [null, null, null],
        turn: null,
        river: null,
      };
      if (prevBoard.turn === sanitized) {
        return;
      }
      setField("board", {
        flop: Array.isArray(prevBoard.flop)
          ? prevBoard.flop
          : [null, null, null],
        turn: sanitized,
        river: prevBoard.river,
      });
      setCoach(null);
    },
    [setField, state.board],
  );
  const handleRiverCardChange = useCallback(
    (card) => {
      const sanitized =
        typeof card === "string" && card.trim().length === 2
          ? card.trim().toUpperCase()
          : null;
      const prevBoard = state.board || {
        flop: [null, null, null],
        turn: null,
        river: null,
      };
      if (prevBoard.river === sanitized) {
        return;
      }
      setField("board", {
        flop: Array.isArray(prevBoard.flop)
          ? prevBoard.flop
          : [null, null, null],
        turn: prevBoard.turn,
        river: sanitized,
      });
      setCoach(null);
    },
    [setField, state.board],
  );
  const openFlopManualSelector = useCallback(() => {
    const sanitize = (value) =>
      typeof value === "string" && value.trim().length === 2
        ? value.trim().toUpperCase()
        : null;
    const currentFlop = Array.isArray(state.board?.flop)
      ? state.board.flop.map(sanitize)
      : [null, null, null];
    openCardSelector({
      kind: "board",
      subtype: "flop",
      title: "Select Flop Cards",
      slots: FLOP_CARD_SLOTS,
      initialCards: {
        card1: currentFlop[0],
        card2: currentFlop[1],
        card3: currentFlop[2],
      },
      requireAll: true,
      onSave: (cards) => {
        handleFlopCardsChange([
          cards.card1 || null,
          cards.card2 || null,
          cards.card3 || null,
        ]);
      },
    });
  }, [state.board, openCardSelector, handleFlopCardsChange]);

  const openFlopCardSelector = useCallback(
    (slotIndex = 0) => {
      const sanitize = (value) =>
        typeof value === "string" && value.trim().length === 2
          ? value.trim().toUpperCase()
          : null;
      const currentFlop = Array.isArray(state.board?.flop)
        ? state.board.flop.map(sanitize)
        : [null, null, null];
      const slot = Math.min(Math.max(Number(slotIndex) || 0, 0), 2);
      openCardSelector({
        kind: "board",
        subtype: `flop_card_${slot}`,
        title: `Select Flop Card ${slot + 1}`,
        slots: [{ key: "card", label: `Flop card ${slot + 1}` }],
        initialCards: { card: currentFlop[slot] },
        requireAll: true,
        onSave: (cards) => {
          const next = [...currentFlop];
          next[slot] =
            typeof cards.card === "string" && cards.card.trim().length === 2
              ? cards.card.trim().toUpperCase()
              : null;
          handleFlopCardsChange(next);
        },
      });
    },
    [state.board, openCardSelector, handleFlopCardsChange],
  );

  const openTurnCardSelector = useCallback(
    (currentValue) => {
      const sanitize = (value) =>
        typeof value === "string" && value.trim().length === 2
          ? value.trim().toUpperCase()
          : null;
      const initialCard =
        sanitize(currentValue) ?? sanitize(state.board?.turn) ?? null;
      openCardSelector({
        kind: "board",
        subtype: "turn",
        title: "Select Turn Card",
        slots: [{ key: "card", label: "Turn card" }],
        initialCards: { card: initialCard },
        requireAll: true,
        onSave: (cards) => {
          handleTurnCardChange(cards.card || null);
        },
      });
    },
    [state.board, openCardSelector, handleTurnCardChange],
  );

  const openRiverCardSelector = useCallback(
    (currentValue) => {
      const sanitize = (value) =>
        typeof value === "string" && value.trim().length === 2
          ? value.trim().toUpperCase()
          : null;
      const initialCard =
        sanitize(currentValue) ?? sanitize(state.board?.river) ?? null;
      openCardSelector({
        kind: "board",
        subtype: "river",
        title: "Select River Card",
        slots: [{ key: "card", label: "River card" }],
        initialCards: { card: initialCard },
        requireAll: true,
        onSave: (cards) => {
          handleRiverCardChange(cards.card || null);
        },
      });
    },
    [state.board, openCardSelector, handleRiverCardChange],
  );

  const handleCardSelectorSave = useCallback(
    (values) => {
      if (cardSelectorConfig?.onSave) {
        cardSelectorConfig.onSave(values);
      }
      closeCardSelector();
    },
    [cardSelectorConfig, closeCardSelector],
  );
  const rawHeroStack = state.heroStackBB;
  const rawVillainStack = state.villainStackBB;
  const heroStackNumber = Number(rawHeroStack);
  const villainStackNumber = Number(rawVillainStack);
  const heroStackValid =
    Number.isFinite(heroStackNumber) && heroStackNumber > 0;
  const villainStackValid =
    Number.isFinite(villainStackNumber) && villainStackNumber > 0;
  const stackState = useMemo(() => buildStackState(state), [state]);
  const decisionMath = useMemo(() => buildDecisionNode(state), [state]);
  const effectiveStack = stackState.effectiveStackBehindBB ?? "";
  const potTotal = decisionMath.potBB;
  const potOverrideActive =
    typeof state.potSizes?.total === "number" &&
    Number.isFinite(state.potSizes.total) &&
    state.potSizes.total > 0;
  const villainStackRanges = [
    { code: "", label: "Unknown", value: null },
    { code: "lt10", label: "< 10 BB", value: 8 },
    { code: "10to20", label: "10 - 20 BB", value: 15 },
    { code: "20to40", label: "20 - 40 BB", value: 30 },
    { code: "40to60", label: "40 - 60 BB", value: 50 },
    { code: "60plus", label: "60+ BB", value: 80 },
  ];
  const inferVillainStackRangeCode = (value) => {
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value < 10) return "lt10";
    if (value < 20) return "10to20";
    if (value < 40) return "20to40";
    if (value < 60) return "40to60";
    return "60plus";
  };
  const villainStackRangeCode = inferVillainStackRangeCode(villainStackNumber);
  const updatePotSize = useCallback(
    (rawValue) => {
      const numeric = rawValue === "" ? null : Number(rawValue);
      const nextValue =
        Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      setField("potSizes", { total: nextValue });
    },
    [setField],
  );
  const personaOptions = [
    {
      code: "replay_analyst",
      label: "Replay Analyst",
      description: "State-first, GTO-informed replay coach with legal-action checks; not a presolved solver.",
    },
    {
      code: "chaos_shark",
      label: "Chaos Coach",
      description: "Strategy-first card-aware coach with high-energy delivery.",
    },
    {
      code: "range_professor",
      label: "Range Professor",
      description: "Range-balanced strategist weighing blockers and position.",
    },
    {
      code: "exploit_detective",
      label: "Exploit Detective",
      description: "Villain-type reader tailoring lines to punish leaks.",
    },
    {
      code: "cash_game_crusher",
      label: "Cash Game Crusher",
      description: "Deep-stack cash grinder targeting loose low-stakes fields.",
      stackThreshold: null,
    },
    {
      code: "short_stack_ninja",
      label: "Short-Stack Ninja",
      description: "Push/Fold tactician tuned for stacks at or below ~20 BB.",
      stackThreshold: 20,
    },
  ];
  const personaMeta =
    personaOptions.find((p) => p.code === persona) || personaOptions[0];
  const personaAvatars = {
    replay_analyst: "R",
    chaos_shark: "*",
    range_professor: "*",
    exploit_detective: "*",
    cash_game_crusher: "*",
    short_stack_ninja: "*",
  };
  const personaAvatar = personaAvatars[persona] || "??";
  const stackThreshold = personaMeta?.stackThreshold || null;
  const stackOverThreshold =
    persona === "short_stack_ninja" &&
    stackThreshold &&
    heroStackValid &&
    heroStackNumber > stackThreshold;
  const cashStackLow =
    persona === "cash_game_crusher" && heroStackValid && heroStackNumber < 70;
  const villainType = state.villainType || "balanced";
  const villainTypeOptions = [
    { code: "balanced", label: "Solid / Balanced" },
    { code: "nit", label: "Nit / Too tight" },
    { code: "station", label: "Calling Station" },
    { code: "maniac", label: "Aggro Maniac" },
    { code: "fishy", label: "Loose-Passive" },
  ];
  const model = state.model || "gpt-4.1-mini";
  const modelOptions = [
    { code: "gpt-4.1", label: "GPT-4.1" },
    { code: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { code: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  ];
  const stakeTierOptions = [
    {
      code: "unknown",
      label: "Unknown / default",
      description: "Baseline solver guidance with no stake-specific exploits.",
    },
    {
      code: "micro",
      label: "Micro stakes",
      description:
        "Population over-calls and under-bluffs. Widen value bets, tighten pure bluffs, punish passive lines.",
    },
    {
      code: "low",
      label: "Low stakes",
      description:
        "Loose calling preflop, passive postflop. Value bet confidently, mix simple exploits, beware rare big bluffs.",
    },
    {
      code: "mid",
      label: "Mid stakes",
      description:
        "Regulars mix aggression and balanced ranges. Respect 3-bets, defend competently, mix blocker-driven bluffs.",
    },
    {
      code: "high",
      label: "High stakes",
      description:
        "Tough balanced opponents. Assume solver responses, use polarized sizings, apply pressure on capped ranges.",
    },
  ];
  const stakeTierMeta =
    stakeTierOptions.find((option) => option.code === stakeTier) ||
    stakeTierOptions[0];
  useEffect(() => {
    if (!seats.includes(state.heroSeat)) {
      setField("heroSeat", "");
    }
    if (state.opponentSeat && !seats.includes(state.opponentSeat)) {
      setField("opponentSeat", "");
    }
  }, [seats.join("|"), state.opponentSeat]);

  const actions = useMemo(
    () => getAvailableActions(state, !!coach),
    [state, coach],
  );
  const actionStageLabel = useMemo(() => {
    if (state.handComplete) return "Hand complete";
    if (loading) return "Coach is evaluating this decision…";
    if (state.nextActor === "opp") return "Record the opponent's response";
    if (state.nextActor === "await_street") return "Waiting for the next board card";
    return "Describe the action before Hero";
  }, [loading, state.handComplete, state.nextActor]);

  const styleOptions = [
    { code: "controlled_maniac", label: "Controlled" },
    { code: "chaos_shark", label: "Shark" },
    { code: "villain_mode", label: "Villain" },
  ];
  const styleIndex = Math.max(
    0,
    styleOptions.findIndex((o) => o.code === state.style),
  );

  const showStyleSelector = persona === "chaos_shark";

  const aiSnapshot = useMemo(() => summarizeForAI(state), [state]);
  const branchLabel = useMemo(() => {
    const raw = aiSnapshot?.context?.branch;
    if (!raw) return null;
    return raw
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, [aiSnapshot]);

  const spr = decisionMath.spr !== null ? Number(decisionMath.spr).toFixed(1) : null;

  const statusBadges = useMemo(() => {
    const badges = [];
    if (personaMeta?.label) {
      badges.push({
        label: "Persona",
        value: personaMeta.label,
        variant: "persona",
      });
    }
    badges.push({
      label: "Seat",
      value: state.heroSeat ? state.heroSeat.toUpperCase() : "?",
    });
    if (branchLabel) {
      badges.push({ label: "Branch", value: branchLabel });
    }
    badges.push({
      label: "Table",
      value: `${state.tableSize}-max`,
    });
    badges.push({
      label: "Street",
      value: state.street.toUpperCase(),
    });
    badges.push({
      label: "Villain",
      value: villainType.replace(/_/g, "-"),
    });
    badges.push({
      label: "Behind",
      value:
        effectiveStack !== null && effectiveStack !== undefined && effectiveStack !== ""
          ? `${effectiveStack} BB`
          : "Set stacks",
      variant: "interactive",
      onClick: openStackModal,
    });
    return badges;
  }, [
    personaMeta?.label,
    state.heroSeat,
    branchLabel,
    state.tableSize,
    state.street,
    villainType,
    effectiveStack,
    openStackModal,
  ]);

  const ticker = useMemo(() => {
    const recent = (state.history || []).slice(-3);
    return recent.map((entry) => {
      const actor =
        entry.actor === "hero"
          ? state.heroSeat
            ? state.heroSeat.toUpperCase()
            : "Hero"
          : "Villain";
      const sizing =
        entry.sizing && entry.sizing.kind === "percent"
          ? `${entry.sizing.value}%`
          : entry.sizing && entry.sizing.kind === "multiple"
            ? `${entry.sizing.value}x`
            : "";
      return [actor, entry.action, sizing].filter(Boolean).join(" ");
    });
  }, [state.history, state.heroSeat]);

  const alternativeSizes = useMemo(() => {
    return [
      {
        label: "35%",
        code: "size_35",
        hint: "Light pressure",
        preview: "35% pot",
      },
      { label: "50%", code: "size_50", hint: "Standard", preview: "50% pot" },
      { label: "65%", code: "size_65", hint: "Pressure", preview: "65% pot" },
      { label: "90%", code: "size_90", hint: "Polarized", preview: "90% pot" },
      { label: "Jam", code: "size_jam", hint: "All-in", preview: "Jam" },
    ];
  }, []);

  const handleAlternativeSizeSelect = useCallback(
    (size) => {
      setPreviewSizing(size?.preview || size?.label || "");
    },
    [setPreviewSizing],
  );

  useEffect(() => {
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
      if (event.code.startsWith("Digit")) {
        const idx = Number(event.code.replace("Digit", "")) - 1;
        if (idx >= 0 && idx < actions.length) {
          event.preventDefault();
          onAction(actions[idx]);
        }
        return;
      }
      const ladderKeyMap = {
        KeyQ: 0,
        KeyW: 1,
        KeyE: 2,
        KeyR: 3,
        KeyT: 4,
      };
      if (ladderKeyMap[event.code] !== undefined) {
        const idx = ladderKeyMap[event.code];
        const option = alternativeSizes[idx];
        if (option) {
          event.preventDefault();
          handleAlternativeSizeSelect(option);
        }
        return;
      }
      if (event.code === "KeyN") {
        event.preventDefault();
        onAction("next_street");
        return;
      }
      if (event.code === "KeyH") {
        event.preventDefault();
        onAction("reset_hand");
        return;
      }
      if (event.code === "KeyZ") {
        event.preventDefault();
        dispatch("undo");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    actions,
    alternativeSizes,
    onAction,
    dispatch,
    handleAlternativeSizeSelect,
  ]);

  const formatCard = useCallback((card) => {
    return card && typeof card === "string" && card.trim().length === 2
      ? card.trim().toUpperCase()
      : "__";
  }, []);
  const flopDisplay = useMemo(() => {
    const flop = Array.isArray(state.board?.flop)
      ? state.board.flop
      : [null, null, null];
    return flop.map((card) => formatCard(card)).join(" ");
  }, [state.board?.flop, formatCard]);
  const turnDisplay = formatCard(state.board?.turn);
  const riverDisplay = formatCard(state.board?.river);
  return (
    <>
      <div className="wrap coach-wrap wrap-compact">
        <div className="panel">
          <div className="panel-heading">
            <div className="panel-heading-actions">
              {/* 
              # removed for now - may bring back as a separate guided mode in the future
              <button
                type="button"
                className={`pill-toggle ${playHandOpen ? "active" : ""}`}
                onClick={handlePlayHandOpen}
                title="Start a guided play hand session"
              >
                Play Hand
              </button> */}
              <button
                type="button"
                className={`pill-toggle header-action-btn header-icon-btn beta-hud-trigger ${
                  betaHudOpen ? "active" : ""
                }`}
                onClick={() => setBetaHudOpen(true)}
                title="Open Coach HUD"
                aria-label="Open Coach HUD"
              >
                <svg
                  className="beta-hud-trigger-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <path d="M7 9h10M7 13h4M7 16h7" />
                </svg>
              </button>
              <button
                type="button"
                className={`pill-toggle header-action-btn replay-vision-trigger ${
                  replayVisionStatus === "watching" || replayVisionStatus === "reading"
                    ? "active"
                    : ""
                }`}
                onClick={() => setReplayVisionOpen(true)}
                title="Recognize Hero and board cards from a PokerCraft replay"
              >
                {replayVisionStatus === "reading" ||
                replayVisionStatus === "watching"
                  ? (
                      <>
                        <span>Replay vision on</span>
                        <span
                          className={`replay-vision-reading-indicator ${
                            replayVisionStatus === "reading" ? "is-reading" : ""
                          }`}
                          aria-hidden="true"
                        >
                          reading
                        </span>
                      </>
                    )
                  : "Watch replay"}
              </button>
              <div className="panel-heading-selectors">
                <label
                  className="header-select-control"
                  title={personaMeta?.description || "Persona guidance"}
                >
                  <span className="header-select-label">Persona</span>
                  <span className="persona-avatar" aria-hidden>
                    {personaAvatar}
                  </span>
                  <select
                    aria-label="Persona"
                    value={persona}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCoach(null);
                      setField("persona", next);
                      if (next === "cash_game_crusher") {
                        setField("gameType", "cash");
                        setField("tableSize", 6);
                      } else if (next === "short_stack_ninja") {
                        setField("gameType", "tournament");
                        setField("tableSize", 8);
                      }
                      if (
                        (next === "replay_analyst" ||
                          next === "range_professor" ||
                          next === "short_stack_ninja" ||
                          next === "cash_game_crusher") &&
                        !heroCardsReady
                      ) {
                        openHeroCardSelector();
                      }
                    }}
                  >
                    {personaOptions.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="header-select-control">
                  <span className="header-select-label">Villain</span>
                  <select
                    aria-label="Villain type"
                    value={villainType}
                    onChange={(e) => setField("villainType", e.target.value)}
                  >
                    {villainTypeOptions.map((v) => (
                      <option key={v.code} value={v.code}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
          <ChaosHud mood={mood} />

          <div className="table-context">
            <div className="table-context-row">
              <span className="pill-label">Seat</span>
              <div className="seat-ring">
                {seats.map((seat) => (
                  <button
                    key={seat}
                    type="button"
                    className={`seat-chip ${
                      state.heroSeat === seat ? "active" : ""
                    }`}
                    onClick={() => setField("heroSeat", seat)}
                    title={`Set hero seat to ${seat}`}
                  >
                    {seat}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`seat-auto-btn ${autoRotateSeat ? "active" : ""}`}
                onClick={() => setAutoRotateSeat((value) => !value)}
                disabled={!state.heroSeat}
                aria-pressed={autoRotateSeat}
                title={
                  state.heroSeat
                    ? "Advance Hero one seat counter-clockwise when Replay Vision confirms a new hand"
                    : "Select Hero's current seat before enabling Auto seat"
                }
              >
                Auto seat {autoRotateSeat ? "on" : "off"}
              </button>
              <button
                type="button"
                className="seat-reset-btn"
                onClick={handleReset}
                title="Reset session"
                aria-label="Reset session"
              >
                ↻
              </button>
            </div>
            <div className="table-context-row decision-context-row">
              <span className="pill-label">Opponent</span>
              <select
                className="decision-context-select"
                value={state.opponentSeat || ""}
                onChange={(event) => setField("opponentSeat", event.target.value)}
                aria-label="Primary opponent seat"
              >
                <option value="">Seat unknown</option>
                {seats
                  .filter((seat) => seat !== state.heroSeat)
                  .map((seat) => (
                    <option key={seat} value={seat}>
                      {seat}
                    </option>
                  ))}
              </select>
              <span className="pill-label">Players</span>
              <div className="seat-ring" aria-label="Players remaining in hand">
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`seat-chip ${
                      Number(state.playersInHand || 2) === count ? "active" : ""
                    }`}
                    onClick={() => setField("playersInHand", count)}
                    title={count === 4 ? "Four or more players" : `${count} players`}
                  >
                    {count === 4 ? "4+" : count}
                  </button>
                ))}
              </div>
              <span className="pill-label">Postflop</span>
              <div className="seat-ring" aria-label="Hero relative position">
                {[
                  ["auto", "Auto"],
                  ["ip", "IP"],
                  ["oop", "OOP"],
                ].map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    className={`seat-chip ${
                      (state.heroRelativePosition || "auto") === code ? "active" : ""
                    }`}
                    onClick={() => setField("heroRelativePosition", code)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card-strip">
            <button
              type="button"
              className="card-pill"
              data-street="hero"
              data-active="true"
              onClick={() => openHeroCardSelector()}
              title="Tap to edit hero cards"
            >
              <span className="card-pill-label">Hero</span>
              <span className="card-pill-value">{heroHandLabel}</span>
            </button>
            {quickOpenSnapshot ? (
              <div
                className="quick-open-snapshot"
                data-tone={quickOpenSnapshot.tone}
                role="status"
                aria-live="polite"
                title={`${quickOpenSnapshot.explanation} Unopened-pot snapshot only; no action is recorded.`}
              >
                <span className="quick-open-snapshot-label">
                  {quickOpenSnapshot.heading}
                </span>
                <strong>{quickOpenSnapshot.label}</strong>
                <span className="quick-open-snapshot-hand">
                  {quickOpenSnapshot.handCode} · {quickOpenSnapshot.seat}
                </span>
                <small>
                  If folded to you · {quickOpenSnapshot.baselineLabel}
                </small>
              </div>
            ) : null}
            <button
              type="button"
              className="card-pill"
              onClick={() => openFlopManualSelector()}
              data-street="flop"
              data-active={state.street === "flop" && !state.handComplete}
              title="Tap to edit flop cards"
            >
              <span className="card-pill-label">Flop</span>
              <span className="card-pill-value">{flopDisplay}</span>
            </button>
            <button
              type="button"
              className="card-pill"
              onClick={() => openTurnCardSelector(state.board?.turn)}
              data-street="turn"
              data-active={
                (state.street === "turn" || state.street === "river") &&
                !state.handComplete
              }
              title="Tap to edit turn card"
            >
              <span className="card-pill-label">Turn</span>
              <span className="card-pill-value">{turnDisplay}</span>
            </button>
            <button
              type="button"
              className="card-pill"
              onClick={() => openRiverCardSelector(state.board?.river)}
              data-street="river"
              data-active={state.street === "river" && !state.handComplete}
              title="Tap to edit river card"
            >
              <span className="card-pill-label">River</span>
              <span className="card-pill-value">{riverDisplay}</span>
            </button>
            <div className="pot-pill">
              <span className="pill-label">Pot (BB)</span>
              <input
                id="potInput"
                type="number"
                min={0}
                inputMode="numeric"
                value={potTotal ?? ""}
                onChange={(e) => updatePotSize(e.target.value)}
                placeholder="0"
              />
              {spr ? <span className="badge spr">SPR {spr}</span> : null}
            </div>
          </div>

          {/* --- PRIMARY ACTIONS (moved up) --- */}
          <div className="actions-block actions-top">
            <div className="action-stage-header">
              <span className="pill-label">Decision</span>
              <strong>{actionStageLabel}</strong>
            </div>
            <ActionButtons
              actions={actions}
              onAction={onAction}
              embedded
              disabled={loading}
              highlightedCodes={[]}
            />
            {state.nextActor === "await_street" ? (
              <span className="drawer-hint">
                Replay Vision will advance automatically when the board changes, or use Next Street.
              </span>
            ) : null}
          </div>

          <DecisionCard
            coach={coach}
            isLoading={loading}
            handComplete={state.handComplete}
            onNextStreet={() => onAction("next_street")}
            onResetHand={() => onAction("reset_hand")}
            sizingNote={sizingNote}
            previewSizing={previewSizing}
            statusBadges={statusBadges}
            ticker={ticker}
            alternativeSizes={alternativeSizes}
            onSelectAlternativeSize={handleAlternativeSizeSelect}
            comparison={state.lastComparison}
          />

          <HistoryStrip history={state.history} heroSeat={state.heroSeat} />

          {/* --- SECONDARY ACTIONS (stay below guidance/history) --- */}
          <div className="actions-block actions-bottom">
            <div className="secondary-actions">
              <button
                type="button"
                className="link-btn"
                onClick={handleClearActions}
              >
                Clear actions
              </button>
            </div>
          </div>

          <button
            type="button"
            className="drawer-toggle"
            onClick={() => setSetupOpen((value) => !value)}
          >
            <span>{setupOpen ? "Hide advanced setup" : "Advanced setup"}</span>
            <span className="chevron">{setupOpen ? "?" : "?"}</span>
          </button>

          {setupOpen ? (
            <div className="setup-drawer">
              <div className="drawer-section">
                <h3>Stack depth</h3>
                <div className="drawer-row">
                  <label className="pill-label" htmlFor="heroStack">
                    Hero stack (BB)
                  </label>
                  <input
                    id="heroStack"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={heroStackValid ? heroStackNumber : ""}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setField(
                        "heroStackBB",
                        Number.isFinite(val) && val > 0 ? val : null,
                      );
                    }}
                  />
                  {personaMeta?.description ? (
                    <span className="drawer-hint">
                      {personaMeta.description}
                      {stackOverThreshold
                        ? ` · Current stack ${heroStackNumber} BB`
                        : ""}
                      {cashStackLow ? ` · Consider topping up to 100 BB+` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="drawer-row">
                  <label className="pill-label" htmlFor="villainStack">
                    Villain stack
                  </label>
                  <select
                    id="villainStack"
                    value={villainStackRangeCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const option = villainStackRanges.find(
                        (item) => item.code === code,
                      );
                      setField("villainStackBB", option?.value || null);
                    }}
                  >
                    {villainStackRanges.map((range) => (
                      <option key={range.code || "unknown"} value={range.code}>
                        {range.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="drawer-section">
                <h3>Game settings</h3>
                <div className="drawer-row">
                  <span className="pill-label">Format</span>
                  <div className="chip-group">
                    {[
                      ["tournament", "Tournament"],
                      ["cash", "Cash"],
                    ].map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        className={`chip ${state.gameType === code ? "active" : ""}`}
                        onClick={() => setField("gameType", code)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="pill-label" htmlFor="anteInput">
                    Ante (BB)
                  </label>
                  <input
                    id="anteInput"
                    type="number"
                    min={0}
                    step={0.01}
                    value={Number(state.anteBB || 0)}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setField("anteBB", Number.isFinite(value) && value >= 0 ? value : 0);
                    }}
                  />
                </div>
                <div className="drawer-row">
                  <span className="pill-label">Table size</span>
                  <div className="chip-group">
                    {[6, 8, 9].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`chip ${
                          state.tableSize === n ? "active" : ""
                        }`}
                        onClick={() => setField("tableSize", n)}
                      >
                        {n}-max
                      </button>
                    ))}
                  </div>
                </div>
                <div className="drawer-row">
                  <span className="pill-label">Stakes</span>
                  <div className="chip-group">
                    {stakeTierOptions.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        className={`chip ${
                          stakeTier === option.code ? "active" : ""
                        }`}
                        onClick={() => setField("stakeTier", option.code)}
                        title={option.description}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="drawer-row">
                  <span className="pill-label">Open size</span>
                  <div className="chip-group">
                    {[2.2, 2.5, 2.7, 3.0, 3.2, 3.5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`chip ${
                          state.openSize === n ? "active" : ""
                        }`}
                        onClick={() => setField("openSize", n)}
                      >
                        {n.toFixed(1)}x
                      </button>
                    ))}
                  </div>
                </div>
                <div className="drawer-row">
                  <span className="pill-label">Model</span>
                  <div className="pill-control">
                    <select
                      value={model}
                      onChange={(e) => setField("model", e.target.value)}
                    >
                      {modelOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="drawer-row">
                  <span className="pill-label">Hands</span>
                  <button
                    type="button"
                    className={`pill-toggle ${autoSaveHands ? "active" : ""}`}
                    onClick={() => setAutoSaveHands((value) => !value)}
                    title="Auto save card selections when all required cards are set"
                  >
                    Auto save hands {autoSaveHands ? "on" : "off"}
                  </button>
                  <span className="drawer-hint">
                    Saves and closes the card picker after the final required
                    rank+suit is selected.
                  </span>
                </div>
                <div className="drawer-row">
                  <span className="pill-label">Range snapshot</span>
                  <button
                    type="button"
                    className={`pill-toggle ${showQuickRanges ? "active" : ""}`}
                    onClick={() => setShowQuickRanges((value) => !value)}
                    aria-pressed={showQuickRanges}
                    title="Show or hide approximate unopened-pot range guidance beside Hero cards"
                  >
                    Quick ranges {showQuickRanges ? "on" : "off"}
                  </button>
                  <span className="drawer-hint">
                    Shows an unrecorded 6-max cash or 8-max MTT first-in snapshot.
                  </span>
                </div>
              </div>

              {/* {personaNeedsCards ? (
                <div className="drawer-section">
                  <h3>Card tools</h3>
                  <HeroVoiceCardInput
                    heroCards={heroCards}
                    onCardsParsed={handleSaveHeroCards}
                    onManualEntry={handleManualCardEntry}
                    onVoiceStart={prepareForCardChange}
                  />
                  <FlopCardInput
                    flop={state.board?.flop}
                    onChange={handleFlopCardsChange}
                    onOpenManual={openFlopManualSelector}
                  />
                  <div className="drawer-row board-row">
                    <SingleBoardCardInput
                      label="Turn card"
                      value={state.board?.turn}
                      onChange={handleTurnCardChange}
                      voiceButtonLabel="Enter turn by voice"
                      placeholder="Qs"
                      onPickCard={openTurnCardSelector}
                      pickButtonLabel="Select turn card"
                    />
                    <SingleBoardCardInput
                      label="River card"
                      value={state.board?.river}
                      onChange={handleRiverCardChange}
                      voiceButtonLabel="Enter river by voice"
                      placeholder="Kd"
                      onPickCard={openRiverCardSelector}
                      pickButtonLabel="Select river card"
                    />
                  </div>
                </div>
              ) : null} */}

              {showStyleSelector ? (
                <div className="drawer-section">
                  <h3>Chaos tone</h3>
                  <div className="tone-slider">
                    <input
                      className="style-range"
                      type="range"
                      min={0}
                      max={styleOptions.length - 1}
                      step={1}
                      value={styleIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        const next = styleOptions[idx]?.code || "chaos_shark";
                        setField("style", next);
                      }}
                    />
                    <span className="style-current">
                      {styleOptions[styleIndex]?.label || "Shark"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <BetaCoachHudModal
        open={betaHudOpen}
        onClose={() => setBetaHudOpen(false)}
        onResetSession={handleReset}
        state={state}
        coach={coach}
        loading={loading}
        actions={actions}
        onAction={onAction}
        actionStageLabel={actionStageLabel}
        personaLabel={personaMeta?.label}
        seats={seats}
        onHeroSeatChange={(seat) => setField("heroSeat", seat)}
        villainType={villainType}
        villainTypeOptions={villainTypeOptions}
        onVillainTypeChange={(nextType) => setField("villainType", nextType)}
        villainLabel={
          villainTypeOptions.find((option) => option.code === villainType)?.label ||
          villainType
        }
        effectiveStack={effectiveStack}
        potTotal={potTotal}
        spr={spr}
        sizingNote={sizingNote}
        replayVisionStatus={replayVisionStatus}
        decisionMoments={decisionMoments}
        onSaveDecisionMoment={handleSaveDecisionMoment}
        onRestoreDecisionMoment={handleRestoreDecisionMoment}
        onClearDecisionMoments={() => setDecisionMoments([])}
        onStreetChange={handleBetaStreetChange}
        onEditHero={openHeroCardSelector}
        onEditFlop={openFlopManualSelector}
        onEditTurn={() => openTurnCardSelector(state.board?.turn)}
        onEditRiver={() => openRiverCardSelector(state.board?.river)}
        onOpenStacks={openStackModal}
        onClearActions={handleClearActions}
      />
      <ActionAmountModal
        config={actionAmountConfig}
        onCancel={() => setActionAmountConfig(null)}
        onConfirm={(amountBB) =>
          onAction({
            ...actionAmountConfig,
            amountBB,
            toAmountBB: amountBB,
          })
        }
      />
      <ReplayVisionPanel
        open={replayVisionOpen}
        onClose={() => setReplayVisionOpen(false)}
        onCardsDetected={handleReplayCardsDetected}
        onStatusChange={setReplayVisionStatus}
        suppressCurrentHand={state.handComplete && !state.lastEventAssumed}
      />
      <StackDepthModal
        open={stackModalOpen}
        heroStack={heroStackValid ? heroStackNumber : null}
        villainStack={villainStackValid ? villainStackNumber : null}
        heroRemainingStack={stackState.heroStackBehindBB}
        villainRemainingStack={stackState.opponentStackBehindBB}
        heroRemainingOverrideActive={stackState.heroRemainingOverrideActive}
        villainRemainingOverrideActive={stackState.opponentRemainingOverrideActive}
        currentPot={potTotal}
        potOverrideActive={potOverrideActive}
        villainRanges={villainStackRanges}
        onClose={closeStackModal}
        onSave={handleSaveStacksQuick}
      />
      <PlayHandModal
        open={playHandOpen}
        onExit={() => setPlayHandOpen(false)}
        onRestart={handlePlayHandRestart}
        state={state}
        seats={seats}
        setField={setField}
        actions={actions}
        onAction={onAction}
        coach={coach}
        loading={loading}
        openHeroCardSelector={openHeroCardSelector}
        handleSaveHeroCards={handleSaveHeroCards}
        handleManualCardEntry={handleManualCardEntry}
        prepareForCardChange={prepareForCardChange}
        openFlopManualSelector={openFlopManualSelector}
        openFlopCardSelector={openFlopCardSelector}
        openTurnCardSelector={openTurnCardSelector}
        openRiverCardSelector={openRiverCardSelector}
        handleFlopCardsChange={handleFlopCardsChange}
        handleTurnCardChange={handleTurnCardChange}
        handleRiverCardChange={handleRiverCardChange}
        dispatch={dispatch}
        villainTypeOptions={villainTypeOptions}
        aiSnapshot={aiSnapshot}
      />
      <CardSelectorModal
        open={Boolean(cardSelectorConfig)}
        title={cardSelectorConfig?.title}
        slots={cardSelectorConfig?.slots}
        initialCards={cardSelectorConfig?.initialCards}
        requireAll={
          cardSelectorConfig?.requireAll !== undefined
            ? cardSelectorConfig.requireAll
            : true
        }
        autoSaveOnComplete={autoSaveHands}
        onClose={closeCardSelector}
        onSave={handleCardSelectorSave}
      />
    </>
  );
}
