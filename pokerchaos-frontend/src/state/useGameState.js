import { useCallback, useMemo, useState } from "react";
import { applyEvent, initialState } from "./machine.js";

export function useGameState() {
  const initialWithStyle = (() => {
    try {
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem("pcc_style") : null;
      if (saved) return { ...initialState, style: saved };
    } catch {}
    return initialState;
  })();

  const [state, setState] = useState(initialWithStyle);

  const setField = useCallback((key, value) => {
    if (key === "style") {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem("pcc_style", String(value));
      } catch {}
    }
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const dispatch = useCallback((event) => {
    setState((s) => applyEvent(s, event));
  }, []);

  const clearActions = useCallback(() => {
    setState((s) => ({ ...s, actions: [], previousActions: [] }));
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
          openSize: s.openSize
        }))
    }),
    [state, setField, dispatch, clearActions]
  );

  return value;
}
