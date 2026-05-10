import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestChaosLine } from "./api/aiService.js";
import ActionButtons from "./components/ActionButtons.jsx";
import ChaosHud from "./components/ChaosHud.jsx";
import CardSelectorModal from "./components/CardSelectorModal.jsx";
import DecisionCard from "./components/DecisionCard.jsx";
import HistoryStrip from "./components/HistoryStrip.jsx";
import PlayHandModal from "./components/PlayHandModal.jsx";
import HeroVoiceCardInput from "./components/HeroVoiceCardInput";
import FlopCardInput from "./components/FlopCardInput.jsx";
import SingleBoardCardInput from "./components/SingleBoardCardInput.jsx";
import StackDepthModal from "./components/StackDepthModal.jsx";
import { useGameState } from "./state/useGameState.js";
import { summarizeForAI, getAvailableActions } from "./state/machine.js";
import { getChaosMood } from "./state/chaosMeter.js";
import { computeSizingNote, parseSizing } from "./lib/sizing.js";
import { seatsForTableSize } from "./state/seatUtils.js";

const HERO_CARD_SLOTS = [
  { key: "card1", label: "Card 1" },
  { key: "card2", label: "Card 2" },
];

const FLOP_CARD_SLOTS = [
  { key: "card1", label: "Flop card 1" },
  { key: "card2", label: "Flop card 2" },
  { key: "card3", label: "Flop card 3" },
];

export default function App() {
  const { state, setField, dispatch, clearActions, reset } = useGameState();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardSelectorConfig, setCardSelectorConfig] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = window.localStorage?.getItem("pcc_compact_mode");
      return saved === "true";
    } catch {
      return false;
    }
  });
  const [previewSizing, setPreviewSizing] = useState(null);
  const [stackModalOpen, setStackModalOpen] = useState(false);
  const [playHandOpen, setPlayHandOpen] = useState(false);
  const handlePlayHandOpen = useCallback(() => {
    setField("heroSeat", "");
    setField("heroCards", { card1: null, card2: null });
    setField("heroRelativePosition", "auto");
    setPlayHandOpen(true);
  }, [setField]);
  const lastAutoAdvanceAt = useRef(0);
  const lastCommittedCoachAt = useRef(0);
  const lastCoachAt = useRef(0);

  const openStackModal = useCallback(() => {
    setStackModalOpen(true);
  }, []);

  const closeStackModal = useCallback(() => {
    setStackModalOpen(false);
  }, []);

  const handleSaveStacksQuick = useCallback(
    ({ heroStack, villainStack }) => {
      if (heroStack !== undefined) {
        setField("heroStackBB", heroStack);
      }
      if (villainStack !== undefined) {
        setField("villainStackBB", villainStack);
      }
      setStackModalOpen(false);
    },
    [setField],
  );

  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          "pcc_compact_mode",
          compactMode ? "true" : "false",
        );
      }
    } catch {}
    if (typeof document !== "undefined") {
      document.body.classList.toggle("compact-mode", compactMode);
    }
  }, [compactMode]);

  const handleReset = useCallback(() => {
    setCoach(null);
    lastCoachAt.current = 0;
    lastCommittedCoachAt.current = 0;
    setCardSelectorConfig(null);
    setStackModalOpen(false);
    reset();
  }, [reset]);

  const handleClearActions = useCallback(() => {
    setCoach(null);
    lastCoachAt.current = 0;
    lastCommittedCoachAt.current = 0;
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
    (evt) => {
      if (evt === "next_street" || evt === "reset_hand") {
        try {
          setCoach(null);
        } catch {}
        try {
          setField("nextActor", "hero");
        } catch {}
        if (evt === "reset_hand") {
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
      ]);
      if (autoClearCoach.has(evt)) {
        try {
          setCoach(null);
        } catch {}
      }

      try {
        const additions = [];
        if (
          coach &&
          lastCoachAt.current &&
          lastCommittedCoachAt.current !== lastCoachAt.current
        ) {
          const normAction = String(coach.hero_action || "").toLowerCase();
          const parsed = parseSizing(coach.sizing || "");
          const sizing =
            parsed.kind === "unknown"
              ? null
              : { kind: parsed.kind, value: parsed.value };
          const note = /squeeze|probe|c\s*bet|cbet|check-?raise|delayed/i.test(
            coach.hero_action || "",
          )
            ? coach.hero_action || ""
            : undefined;
          additions.push({
            at: Date.now(),
            street: state.street,
            actor: "hero",
            action: normAction,
            sizing,
            note,
          });
          lastCommittedCoachAt.current = lastCoachAt.current;
        }

        const oppMap = {
          opp_one_call: { action: "call", note: "one" },
          opp_multi_call: { action: "call", note: "multi" },
          opp_all_fold: { action: "fold" },
          opp_4bet: { action: "4-bet" },
          opp_shove: { action: "jam" },
          opp_fold: { action: "fold" },
          opp_call: { action: "call" },
          opp_check_back: { action: "check", note: "checked back" },
          opp_raise: { action: "raise" },
        };
        if (oppMap[evt]) {
          const spec = oppMap[evt];
          additions.push({
            at: Date.now(),
            street: state.street,
            actor: "opp",
            action: spec.action,
            sizing: null,
            note: spec.note,
          });
        }

        if (additions.length > 0) {
          const nextHistory = [...(state.history || []), ...additions].slice(
            -8,
          );
          setField("history", nextHistory);
          const isOpp = evt.startsWith("opp_");
          try {
            setField("nextActor", isOpp ? "hero" : "opp");
          } catch {}
        }
      } catch {}
      dispatch(evt);
    },
    [dispatch, coach, state.street, state.history, setField],
  );

  useEffect(() => {
    let isCancelled = false;
    async function run() {
      if (!state.lastEventAt || !state.lastEvent) return;
      const skip = new Set([
        "next_street",
        "reset_hand",
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
        (personaCode === "range_professor" ||
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
            flavor_text: prompt,
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
              flavor_text:
                "Set hero stack in BB for Short-Stack Ninja guidance.",
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
          setCoach(res);
          try {
            setField("nextActor", "opp");
          } catch {}
          lastCoachAt.current = Date.now();
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

  useEffect(() => {
    const autoAdvancePreflop = new Set(["opp_one_call", "opp_multi_call"]);
    if (
      coach &&
      state.street === "preflop" &&
      state.lastEventAt &&
      state.lastEventAt !== lastAutoAdvanceAt.current &&
      autoAdvancePreflop.has(state.lastEvent)
    ) {
      lastAutoAdvanceAt.current = state.lastEventAt;
      const t = setTimeout(() => dispatch("next_street"), 350);
      return () => clearTimeout(t);
    }
  }, [coach, state.street, state.lastEvent, state.lastEventAt, dispatch]);

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

  const persona = state.persona || "chaos_shark";
  const stakeTier = state.stakeTier || "unknown";
  const heroCards = state.heroCards || { card1: null, card2: null };
  const heroCardsReady = Boolean(heroCards.card1 && heroCards.card2);
  const heroHandLabel = heroCardsReady
    ? `${heroCards.card1} ${heroCards.card2}`
    : "Not set";
  const personaNeedsCards =
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
  const effectiveStack = heroStackValid
    ? villainStackValid
      ? Math.min(heroStackNumber, villainStackNumber)
      : heroStackNumber
    : villainStackValid
      ? villainStackNumber
      : "";
  const potTotal =
    typeof state.potSizes?.total === "number" &&
    Number.isFinite(state.potSizes.total) &&
    state.potSizes.total > 0
      ? state.potSizes.total
      : null;
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
      code: "chaos_shark",
      label: "Chaos Coach",
      description: "Card-blind hype master pushing relentless aggression.",
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
  }, [seats.join("|")]);

  const actions = useMemo(
    () => getAvailableActions(state, !!coach),
    [state, coach],
  );

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

  const spr = useMemo(() => {
    if (
      !potTotal ||
      !effectiveStack ||
      !Number.isFinite(Number(effectiveStack))
    ) {
      return null;
    }
    if (potTotal <= 0) return null;
    const ratio = Number(effectiveStack) / Number(potTotal || 1);
    if (!Number.isFinite(ratio)) return null;
    return ratio.toFixed(1);
  }, [effectiveStack, potTotal]);

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
      label: "Eff",
      value: effectiveStack ? `${effectiveStack} BB` : "Set stacks",
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
          onAction(actions[idx].code);
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
      <div className={`wrap ${compactMode ? "wrap-compact" : ""}`}>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h1 className="title">Chaos Coach</h1>
            </div>
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
                className={`pill-toggle ${compactMode ? "active" : ""}`}
                onClick={() => setCompactMode((value) => !value)}
                title="Toggle compact density"
              >
                Compact
              </button>
              <button
                type="button"
                className="pill-toggle"
                onClick={() => setSetupOpen((value) => !value)}
              >
                {setupOpen ? "Hide setup" : "Game setup"}
              </button>
            </div>
          </div>
          <ChaosHud mood={mood} />
          <div className="quick-pills">
            <div
              className="pill-field persona-field"
              title={personaMeta?.description || "Persona guidance"}
            >
              <span className="pill-label">Persona</span>
              <div className="pill-control persona-control">
                <span className="persona-avatar">{personaAvatar}</span>
                <select
                  value={persona}
                  onChange={(e) => {
                    const next = e.target.value;
                    setCoach(null);
                    setField("persona", next);
                    if (
                      (next === "range_professor" ||
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
              </div>
            </div>
            <div className="pill-field villain-field">
              <span className="pill-label">Villain type</span>
              <div className="pill-control">
                <select
                  value={villainType}
                  onChange={(e) => setField("villainType", e.target.value)}
                >
                  {villainTypeOptions.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

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
                className="seat-reset-btn"
                onClick={handleReset}
                title="Reset session"
                aria-label="Reset session"
              >
                ↻
              </button>
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
            <ActionButtons
              actions={actions}
              onAction={onAction}
              embedded
              disabled={loading}
            />
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
      <StackDepthModal
        open={stackModalOpen}
        heroStack={heroStackValid ? heroStackNumber : null}
        villainStack={villainStackValid ? villainStackNumber : null}
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
        onClose={closeCardSelector}
        onSave={handleCardSelectorSave}
      />
    </>
  );
}
