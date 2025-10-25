import { useCallback, useMemo, useState } from "react";
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
    }
  };
  try {
    if (typeof localStorage !== "undefined") {
      const savedStyle = localStorage.getItem("pcc_style");
      if (savedStyle) base.style = savedStyle;
      const savedPersona = localStorage.getItem("pcc_persona");
      if (savedPersona) base.persona = savedPersona;
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
    }
  } catch {}
  return base;
}

export function useGameState() {
  const [state, setState] = useState(loadInitialState);

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
    setState((s) => ({
      ...s,
      [key]:
        key === "heroCards" && value
          ? { card1: value.card1 || null, card2: value.card2 || null }
          : value
    }));
  }, []);

  const dispatch = useCallback((event) => {
    setState((s) => applyEvent(s, event));
  }, []);

  const clearActions = useCallback(() => {
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
      reset: () =>
        setState((s) => ({
          ...initialState,
          heroSeat: s.heroSeat,
          tableSize: s.tableSize,
          style: s.style,
          openSize: s.openSize,
          persona: s.persona,
          heroCards: { ...s.heroCards },
          board: {
            flop: [...(initialState.board?.flop || [null, null, null])],
            turn: initialState.board?.turn ?? null,
            river: initialState.board?.river ?? null
          },
          heroStackBB: s.heroStackBB,
          villainStackBB: s.villainStackBB,
          villainType: s.villainType
        }))
    }),
    [state, setField, dispatch, clearActions]
  );

  return value;
}
