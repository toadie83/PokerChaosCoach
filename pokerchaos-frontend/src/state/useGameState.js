import { useCallback, useMemo, useRef, useState } from "react";
import { applyEvent, initialState } from "./machine.js";
import { buildStackState, reopenAssumedFoldForVision } from "./decisionState.js";
import { previousSeatForNextHand } from "./seatUtils.js";
import {
  DEFAULT_COACH_MODEL,
  LEGACY_DEFAULT_COACH_MODEL,
  MODEL_DEFAULT_MIGRATION_KEY,
  MODEL_DEFAULT_MIGRATION_VERSION,
} from "../config/modelConfig.js";
import {
  DEFAULT_TOURNAMENT_STAGE,
  TOURNAMENT_STAGE_STORAGE_KEY,
  normalizeTournamentStage,
} from "../config/tournamentStageConfig.js";
import {
  BOUNTY_MODE_STORAGE_KEY,
  DEFAULT_BOUNTY_MODE,
  normalizeBountyMode,
} from "../config/bountyTournamentConfig.js";

const CARD_CODE_PATTERN = /^[AKQJT2-9][shdc]$/i;

const normalizeCard = (card) => {
  const raw = typeof card === "string" ? card.trim() : "";
  if (!CARD_CODE_PATTERN.test(raw)) return null;
  return `${raw[0].toUpperCase()}${raw[1].toLowerCase()}`;
};

function sanitizeBoard(board) {
  const flop = Array.isArray(board?.flop) ? board.flop : [null, null, null];
  return {
    flop: Array.from({ length: 3 }, (_, idx) => normalizeCard(flop[idx])),
    turn: normalizeCard(board?.turn),
    river: normalizeCard(board?.river)
  };
}

function visibleBoardCount(board) {
  const flopCount = Array.isArray(board?.flop)
    ? board.flop.filter((card) => normalizeCard(card)).length
    : 0;
  return flopCount + (normalizeCard(board?.turn) ? 1 : 0) + (normalizeCard(board?.river) ? 1 : 0);
}

function streetForBoardCount(count) {
  if (count >= 5) return "river";
  if (count === 4) return "turn";
  if (count === 3) return "flop";
  return "preflop";
}

export function detectedCardsChangeDecisionState(state = {}, detection = {}) {
  if (detection?.newHandDetected) return true;

  const detectedHero = {
    card1: normalizeCard(detection?.heroCards?.card1),
    card2: normalizeCard(detection?.heroCards?.card2),
  };
  const currentHero = {
    card1: normalizeCard(state?.heroCards?.card1),
    card2: normalizeCard(state?.heroCards?.card2),
  };
  if (
    detectedHero.card1 !== currentHero.card1 ||
    detectedHero.card2 !== currentHero.card2
  ) {
    return true;
  }

  const detectedBoard = sanitizeBoard(detection?.board);
  const currentBoard = sanitizeBoard(state?.board);
  const detectedCards = [
    ...detectedBoard.flop,
    detectedBoard.turn,
    detectedBoard.river,
  ];
  const currentCards = [
    ...currentBoard.flop,
    currentBoard.turn,
    currentBoard.river,
  ];
  if (detectedCards.some((card, index) => card !== currentCards[index])) {
    return true;
  }

  return Boolean(
    state?.handComplete &&
      !state?.lastEventAssumed &&
      visibleBoardCount(detectedBoard) === 0,
  );
}

export function applyDetectedHeroStack(state, detection) {
  const stackConfidence = String(detection?.stackConfidence || "").toLowerCase();
  const detectedBehindBB = Number(detection?.heroStackBehindBB);
  if (
    !["medium", "high"].includes(stackConfidence) ||
    !Number.isFinite(detectedBehindBB) ||
    detectedBehindBB <= 0 ||
    detectedBehindBB > 10000
  ) {
    return state;
  }

  const stackState = buildStackState(state);
  const committedAtBB = stackState.heroTotalCommittedBB;
  const inferredStartingStackBB = Number(
    (detectedBehindBB + committedAtBB).toFixed(2),
  );
  return {
    ...state,
    heroStackBB: inferredStartingStackBB,
    stackRemainingOverrides: {
      ...(state.stackRemainingOverrides || {}),
      hero: {
        remainingBB: Number(detectedBehindBB.toFixed(2)),
        committedAtBB,
      },
    },
    visionHeroStackBehindBB: Number(detectedBehindBB.toFixed(2)),
    visionStackConfidence: stackConfidence,
    visionStackUpdatedAt: Date.now(),
  };
}

function loadInitialState() {
  const base = {
    ...initialState,
    heroCards: { ...initialState.heroCards },
    board: {
      flop: [...(initialState.board?.flop || [null, null, null])],
      turn: initialState.board?.turn ?? null,
      river: initialState.board?.river ?? null
    },
    potSizes: { ...initialState.potSizes }
  };
  try {
    if (typeof localStorage !== "undefined") {
      const savedStyle = localStorage.getItem("pcc_style");
      if (savedStyle) base.style = savedStyle;
      const savedPersona = localStorage.getItem("pcc_persona");
      if (savedPersona) {
        base.persona = savedPersona;
        if (savedPersona === "cash_game_crusher") {
          base.gameType = "cash";
          base.anteBB = 0;
          base.tableSize = 6;
        }
      }
      const savedModel = localStorage.getItem("pcc_model");
      const modelDefaultMigration = localStorage.getItem(
        MODEL_DEFAULT_MIGRATION_KEY,
      );
      const shouldMigrateLegacyDefault =
        savedModel === LEGACY_DEFAULT_COACH_MODEL &&
        modelDefaultMigration !== MODEL_DEFAULT_MIGRATION_VERSION;
      if (savedModel && !shouldMigrateLegacyDefault) {
        base.model = savedModel;
      } else if (shouldMigrateLegacyDefault) {
        base.model = DEFAULT_COACH_MODEL;
      }
      localStorage.setItem(
        MODEL_DEFAULT_MIGRATION_KEY,
        MODEL_DEFAULT_MIGRATION_VERSION,
      );
      const savedCards = localStorage.getItem("pcc_hero_cards");
      if (savedCards) {
        try {
          const parsed = JSON.parse(savedCards);
          if (parsed && typeof parsed === "object") {
            base.heroCards = {
              card1: parsed.card1 || null,
              card2: parsed.card2 || null
            };
          }
        } catch {}
      }
      const savedHeroStack = localStorage.getItem("pcc_hero_stack_bb");
      if (savedHeroStack && !Number.isNaN(Number(savedHeroStack))) {
        base.heroStackBB = Number(savedHeroStack);
      }
      const savedVillainStack = localStorage.getItem("pcc_villain_stack_bb");
      if (savedVillainStack && !Number.isNaN(Number(savedVillainStack))) {
        base.villainStackBB = Number(savedVillainStack);
      }
      const savedVillainType = localStorage.getItem("pcc_villain_type");
      if (savedVillainType) base.villainType = savedVillainType;
      const savedStakeTier = localStorage.getItem("pcc_stake_tier");
      if (savedStakeTier) base.stakeTier = savedStakeTier;
      const savedTournamentStage = localStorage.getItem(
        TOURNAMENT_STAGE_STORAGE_KEY,
      );
      if (savedTournamentStage) {
        base.tournamentStage = normalizeTournamentStage(savedTournamentStage);
      }
      const savedBountyMode = localStorage.getItem(BOUNTY_MODE_STORAGE_KEY);
      if (savedBountyMode && base.gameType === "tournament") {
        base.bountyMode = normalizeBountyMode(savedBountyMode);
      }
      const savedPotSizes = localStorage.getItem("pcc_pot_sizes");
      if (
        savedPotSizes &&
        !Number.isNaN(Number(savedPotSizes)) &&
        Number(savedPotSizes) > 0
      ) {
        base.potSizes.total = Number(savedPotSizes);
      }
    }
  } catch {}
  return base;
}

const SNAPSHOT_LIMIT = 25;

function snapshotState(state) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(state);
    }
    return JSON.parse(JSON.stringify(state));
  } catch {
    return JSON.parse(JSON.stringify(state));
  }
}

export function popUndoSnapshot(
  history = [],
  currentState,
  { skipAssumedAction = false } = {},
) {
  if (!Array.isArray(history) || !history.length) return currentState;
  let previous = history.pop();
  if (skipAssumedAction && currentState?.lastEventAssumed && history.length) {
    previous = history.pop();
  }
  return previous || currentState;
}

export function prepareRestoredGameState(snapshot) {
  const restored = snapshotState(snapshot || {});
  return {
    ...initialState,
    ...restored,
    tournamentStage: normalizeTournamentStage(restored.tournamentStage),
    bountyMode:
      restored.gameType === "cash"
        ? DEFAULT_BOUNTY_MODE
        : normalizeBountyMode(restored.bountyMode),
    heroCards: {
      card1: normalizeCard(restored.heroCards?.card1),
      card2: normalizeCard(restored.heroCards?.card2)
    },
    board: sanitizeBoard(restored.board),
    potSizes: {
      ...initialState.potSizes,
      ...(restored.potSizes || {})
    },
    stackRemainingOverrides: {
      ...initialState.stackRemainingOverrides,
      ...(restored.stackRemainingOverrides || {})
    },
    // Restoring is navigation, not a new poker event. Keeping this at zero
    // prevents the Coach request effect from replaying the old trigger.
    lastEventAt: 0
  };
}

function persistRestoredFields(state) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("pcc_style", String(state.style || ""));
    localStorage.setItem("pcc_persona", String(state.persona || ""));
    localStorage.setItem("pcc_model", String(state.model || ""));
    localStorage.setItem("pcc_hero_cards", JSON.stringify(state.heroCards || {}));
    localStorage.setItem("pcc_hero_stack_bb", String(state.heroStackBB ?? ""));
    localStorage.setItem("pcc_villain_stack_bb", String(state.villainStackBB ?? ""));
    localStorage.setItem("pcc_villain_type", String(state.villainType || ""));
    localStorage.setItem("pcc_stake_tier", String(state.stakeTier || ""));
    localStorage.setItem(
      TOURNAMENT_STAGE_STORAGE_KEY,
      normalizeTournamentStage(state.tournamentStage),
    );
    localStorage.setItem(
      BOUNTY_MODE_STORAGE_KEY,
      normalizeBountyMode(state.bountyMode),
    );
    localStorage.setItem("pcc_pot_sizes", String(state.potSizes?.total ?? ""));
  } catch {}
}

export function useGameState() {
  const [state, setState] = useState(loadInitialState);
  const historyRef = useRef([]);

  const setField = useCallback((key, value) => {
    if (key === "style") {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem("pcc_style", String(value));
      } catch {}
    }
    if (key === "persona") {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem("pcc_persona", String(value));
      } catch {}
    }
    if (key === "model") {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem("pcc_model", String(value));
      } catch {}
    }
    if (key === "heroCards") {
      const normalizedCards = {
        card1: normalizeCard(value?.card1),
        card2: normalizeCard(value?.card2)
      };
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(
            "pcc_hero_cards",
            JSON.stringify({
              card1: normalizedCards.card1,
              card2: normalizedCards.card2
            })
          );
        }
      } catch {}
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_pot_sizes", "");
        }
      } catch {}
      setState((s) => ({
        ...s,
        heroCards: normalizedCards,
        potSizes: { total: null }
      }));
      return;
    }
    if (key === "board") {
      setState((s) => ({
        ...s,
        board: sanitizeBoard(value)
      }));
      return;
    }
    if (key === "heroStackBB") {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_hero_stack_bb", String(value ?? ""));
        }
      } catch {}
      setState((s) => ({
        ...s,
        heroStackBB: value,
        stackRemainingOverrides: {
          ...(s.stackRemainingOverrides || {}),
          hero: null
        }
      }));
      return;
    }
    if (key === "villainStackBB") {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_villain_stack_bb", String(value ?? ""));
        }
      } catch {}
      setState((s) => ({
        ...s,
        villainStackBB: value,
        stackRemainingOverrides: {
          ...(s.stackRemainingOverrides || {}),
          opponent: null
        }
      }));
      return;
    }
    if (key === "villainType") {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_villain_type", String(value));
        }
      } catch {}
    }
    if (key === "stakeTier") {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_stake_tier", String(value));
        }
      } catch {}
    }
    if (key === "potSizes") {
      const numericValue = Number(value?.total);
      const nextValue =
        Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_pot_sizes", nextValue ?? "");
        }
      } catch {}
      setState((s) => ({
        ...s,
        potSizes: { total: nextValue },
        estimatedPotBB: nextValue
      }));
      return;
    }
    if (key === "tournamentStage") {
      const normalizedStage = normalizeTournamentStage(value);
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(TOURNAMENT_STAGE_STORAGE_KEY, normalizedStage);
        }
      } catch {}
      setState((s) => ({
        ...s,
        tournamentStage: normalizedStage,
      }));
      return;
    }
    if (key === "bountyMode") {
      const normalizedMode = normalizeBountyMode(value);
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(BOUNTY_MODE_STORAGE_KEY, normalizedMode);
        }
      } catch {}
      setState((s) => ({
        ...s,
        bountyMode:
          s.gameType === "cash" ? DEFAULT_BOUNTY_MODE : normalizedMode,
      }));
      return;
    }
    if (key === "remainingStacks") {
      const normalizeRemaining = (raw) => {
        if (raw === null || raw === undefined || raw === "") return null;
        const numeric = Number(raw);
        return Number.isFinite(numeric) && numeric >= 0
          ? Number(numeric.toFixed(2))
          : null;
      };
      setState((s) => {
        const stackState = buildStackState(s);
        const heroRemaining = normalizeRemaining(value?.heroRemainingBB);
        const opponentRemaining = normalizeRemaining(value?.opponentRemainingBB);
        return {
          ...s,
          stackRemainingOverrides: {
            hero:
              heroRemaining === null
                ? null
                : {
                    remainingBB: heroRemaining,
                    committedAtBB: stackState.heroTotalCommittedBB
                  },
            opponent:
              opponentRemaining === null
                ? null
                : {
                    remainingBB: opponentRemaining,
                    committedAtBB: stackState.opponentTotalCommittedBB
                  }
          }
        };
      });
      return;
    }
    setState((s) => ({
      ...s,
      [key]:
        key === "heroCards" && value
          ? { card1: value.card1 || null, card2: value.card2 || null }
          : value
    }));
  }, []);

  const dispatch = useCallback((event) => {
    if (event === "undo") {
      setState((s) => {
        return popUndoSnapshot(historyRef.current, s);
      });
      return;
    }
    setState((s) => {
      const history = historyRef.current;
      history.push(snapshotState(s));
      if (history.length > SNAPSHOT_LIMIT) {
        history.shift();
      }
      return applyEvent(s, event);
    });
  }, []);

  const clearActions = useCallback(() => {
    historyRef.current = [];
    setState((s) => ({
      ...s,
      actions: [],
      previousActions: [],
      nextActor: "hero",
      handComplete: false,
      decisionKind: null,
      facingAction: null,
      legalActions: [],
      lastRecommendation: null,
      lastComparison: null,
      lastAssumedDecisionKey: null
    }));
  }, []);

  const undoLastUserAction = useCallback(() => {
    setState((s) =>
      popUndoSnapshot(historyRef.current, s, { skipAssumedAction: true }),
    );
  }, []);

  const restoreSnapshot = useCallback((snapshot) => {
    const restored = prepareRestoredGameState(snapshot);
    historyRef.current = [];
    persistRestoredFields(restored);
    setState(restored);
  }, []);

  const commitDetectedCards = useCallback((detection, options = {}) => {
    const heroCards = {
      card1: normalizeCard(detection?.heroCards?.card1),
      card2: normalizeCard(detection?.heroCards?.card2)
    };
    const board = sanitizeBoard(detection?.board);
    const boardCount = visibleBoardCount(board);
    const validBoardCount = boardCount === 0 || boardCount === 3 || boardCount === 4 || boardCount === 5;
    const allCards = [
      heroCards.card1,
      heroCards.card2,
      ...board.flop.filter(Boolean),
      board.turn,
      board.river
    ].filter(Boolean);
    if (
      !heroCards.card1 ||
      !heroCards.card2 ||
      !validBoardCount ||
      new Set(allCards).size !== allCards.length
    ) {
      return false;
    }

    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("pcc_hero_cards", JSON.stringify(heroCards));
      }
    } catch {}

    setState((s) => {
      const currentHero1 = normalizeCard(s.heroCards?.card1);
      const currentHero2 = normalizeCard(s.heroCards?.card2);
      const currentHeroReady = Boolean(currentHero1 && currentHero2);
      const heroChanged =
        currentHeroReady &&
        (currentHero1 !== heroCards.card1 || currentHero2 !== heroCards.card2);
      const currentBoardCount = visibleBoardCount(s.board);
      const nextStreet = streetForBoardCount(boardCount);
      const streetOrder = ["preflop", "flop", "turn", "river"];
      const streetRegressed =
        streetOrder.indexOf(nextStreet) < streetOrder.indexOf(s.street || "preflop");
      const newHand =
        Boolean(detection?.newHandDetected) ||
        (heroChanged && boardCount === 0) ||
        (currentBoardCount > 0 && boardCount === 0) ||
        (s.handComplete && !s.lastEventAssumed && boardCount === 0);
      const shouldRotateSeat =
        Boolean(options?.autoRotateSeat) &&
        Boolean(detection?.newHandDetected) &&
        Boolean(s.heroSeat) &&
        Number(s.visionRevision || 0) > 0;
      const nextHeroSeat = shouldRotateSeat
        ? previousSeatForNextHand(s.heroSeat, s.tableSize)
        : s.heroSeat;
      const visionFields = {
        heroCards,
        board,
        street: nextStreet,
        visionSource: "gg_pokercraft",
        visionConfidence: detection?.confidence || "medium",
        visionUpdatedAt: Date.now(),
        visionRevision: Number(s.visionRevision || 0) + 1
      };

      if (newHand) {
        const nextHandState = {
          ...initialState,
          heroSeat: nextHeroSeat,
          tableSize: s.tableSize,
          style: s.style,
          openSize: s.openSize,
          persona: s.persona,
          heroRelativePosition: "auto",
          opponentSeat: "",
          playersInHand: 2,
          gameType: s.gameType,
          tournamentStage: normalizeTournamentStage(s.tournamentStage),
          bountyMode: normalizeBountyMode(s.bountyMode),
          anteBB: s.anteBB,
          heroStackBB: s.heroStackBB,
          villainStackBB: s.villainStackBB,
          villainType: s.villainType,
          preflopLimpers: 0,
          preflopCallers: 0,
          stakeTier: s.stakeTier,
          model: s.model,
          ...visionFields,
          potSizes: { total: null }
        };
        return boardCount === 0
          ? applyDetectedHeroStack(nextHandState, detection)
          : nextHandState;
      }

      const continuedState = nextStreet !== (s.street || "preflop")
        ? reopenAssumedFoldForVision(s)
        : s;

      const nextState = {
        ...continuedState,
        ...visionFields,
        ...(nextStreet !== (s.street || "preflop")
          ? {
              nextActor: "hero",
              decisionKind: null,
              facingAction: null,
              legalActions: [],
              lastRecommendation: null
            }
          : {}),
        ...(streetRegressed
          ? {
              actions: [],
              previousActions: [],
              history: [],
              lastEvent: null,
              lastEventAt: 0,
              nextActor: "hero",
              handComplete: false
            }
          : {})
      };
      return boardCount === 0
        ? applyDetectedHeroStack(nextState, detection)
        : nextState;
    });
    return true;
  }, []);

  const value = useMemo(
    () => ({
      state,
      setField,
      dispatch,
      canUndo: historyRef.current.length > 0,
      undoLastUserAction,
      clearActions,
      restoreSnapshot,
      commitDetectedCards,
      reset: () => {
        historyRef.current = [];
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("pcc_pot_sizes", "");
            localStorage.setItem(
              "pcc_hero_cards",
              JSON.stringify({ card1: null, card2: null })
            );
            localStorage.setItem(
              TOURNAMENT_STAGE_STORAGE_KEY,
              DEFAULT_TOURNAMENT_STAGE,
            );
          }
        } catch {}
        setState((s) => ({
          ...initialState,
          tableSize: s.tableSize,
          style: s.style,
          openSize: s.openSize,
          persona: s.persona,
          heroRelativePosition: "auto",
          opponentSeat: "",
          playersInHand: 2,
          gameType: s.gameType,
          tournamentStage: DEFAULT_TOURNAMENT_STAGE,
          bountyMode:
            s.gameType === "cash"
              ? DEFAULT_BOUNTY_MODE
              : normalizeBountyMode(s.bountyMode),
          anteBB: s.anteBB,
          board: {
            flop: [...(initialState.board?.flop || [null, null, null])],
            turn: initialState.board?.turn ?? null,
            river: initialState.board?.river ?? null
          },
          heroStackBB: s.heroStackBB,
          villainStackBB: s.villainStackBB,
          villainType: s.villainType,
          stakeTier: s.stakeTier,
          model: s.model,
          potSizes: { total: null }
        }));
      }
    }),
    [
      state,
      setField,
      dispatch,
      undoLastUserAction,
      clearActions,
      restoreSnapshot,
      commitDetectedCards,
    ]
  );

  return value;
}
