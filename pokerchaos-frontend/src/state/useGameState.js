import { useCallback, useMemo, useRef, useState } from "react";
import { applyEvent, initialState } from "./machine.js";

const normalizeCard = (card) =>
  typeof card === "string" && card.trim().length === 2 ? card.trim().toUpperCase() : null;

function sanitizeBoard(board) {
  const flop = Array.isArray(board?.flop) ? board.flop : [null, null, null];
  return {
    flop: flop.map((card, idx) => (idx < 3 ? normalizeCard(card) : null)).slice(0, 3),
    turn: normalizeCard(board?.turn),
    river: normalizeCard(board?.river)
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
      if (savedPersona) base.persona = savedPersona;
      const savedModel = localStorage.getItem("pcc_model");
      if (savedModel) base.model = savedModel;
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
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(
            "pcc_hero_cards",
            JSON.stringify({
              card1: value?.card1 || null,
              card2: value?.card2 || null
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
        heroCards: value
          ? { card1: value.card1 || null, card2: value.card2 || null }
          : { card1: null, card2: null },
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
    }
    if (key === "villainStackBB") {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem("pcc_villain_stack_bb", String(value ?? ""));
        }
      } catch {}
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
        potSizes: { total: nextValue }
      }));
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
        const history = historyRef.current;
        if (!history.length) return s;
        const previous = history.pop();
        return previous || s;
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
      handComplete: false
    }));
  }, []);

  const value = useMemo(
    () => ({
      state,
      setField,
      dispatch,
      clearActions,
      reset: () => {
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("pcc_pot_sizes", "");
            localStorage.setItem(
              "pcc_hero_cards",
              JSON.stringify({ card1: null, card2: null })
            );
          }
        } catch {}
        setState((s) => ({
          ...initialState,
          tableSize: s.tableSize,
          style: s.style,
          openSize: s.openSize,
          persona: s.persona,
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
    [state, setField, dispatch, clearActions]
  );

  return value;
}
