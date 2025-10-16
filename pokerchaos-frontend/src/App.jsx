import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestChaosLine } from "./api/aiService.js";
import ActionButtons from "./components/ActionButtons.jsx";
import PromptDisplay from "./components/PromptDisplay.jsx";
import ChaosHud from "./components/ChaosHud.jsx";
import { useGameState } from "./state/useGameState.js";
import { summarizeForAI, getAvailableActions } from "./state/machine.js";
import { getChaosMood } from "./state/chaosMeter.js";
import { computeSizingNote, parseSizing } from "./lib/sizing.js";
import { seatsForTableSize } from "./state/seatUtils.js";

export default function App() {
  const { state, setField, dispatch, clearActions, reset } = useGameState();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(false);
  const lastAutoAdvanceAt = useRef(0);

  const lastCommittedCoachAt = useRef(0);
  const lastCoachAt = useRef(0);

  const onAction = useCallback(
    (evt) => {
      // Clear current coach output when advancing streets or resetting hand
      if (evt === "next_street" || evt === "reset_hand") {
        try { setCoach(null); } catch {}
      }
      // Auto-commit last coach suggestion as a hero history item before next event
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
            parsed.kind === "unknown" ? null : { kind: parsed.kind, value: parsed.value };
          const note = /squeeze|probe|c\s*bet|cbet|check-?raise|delayed/i.test(
            coach.hero_action || ""
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

        // Record opponent reactions as structured history automatically
        const oppMap = {
          opp_one_call: { action: "call", note: "one" },
          opp_multi_call: { action: "call", note: "multi" },
          opp_all_fold: { action: "fold" },
          opp_4bet: { action: "4-bet" },
          opp_shove: { action: "jam" },
          opp_fold: { action: "fold" },
          opp_call: { action: "call" },
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
          const nextHistory = [...(state.history || []), ...additions].slice(-8);
          setField("history", nextHistory);
        }
      } catch {}
      dispatch(evt);
    },
    [dispatch, coach, state.street, state.history, setField]
  );

  useEffect(() => {
    let isCancelled = false;
    async function run() {
      if (!state.lastEventAt || !state.lastEvent) return;
      const skip = new Set(["next_street", "reset_hand"]);
      if (skip.has(state.lastEvent)) return;
      setLoading(true);
      try {
        const payload = summarizeForAI(state);
        const res = await requestChaosLine(payload);
        if (!isCancelled) {
          setCoach(res);
          lastCoachAt.current = Date.now();
          // update momentum heuristically based on suggested action
          try {
            const inc = /bet|raise|jam|3-bet|4-bet|open/i.test(
              res?.hero_action || ""
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
  }, [state.lastEventAt]);

  // Auto-advance to next street after certain opponent reactions on preflop
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
      // slight delay to let the user see the response before advancing
      const t = setTimeout(() => dispatch("next_street"), 350);
      return () => clearTimeout(t);
    }
  }, [coach, state.street, state.lastEvent, state.lastEventAt, dispatch]);

  const seats = useMemo(
    () => seatsForTableSize(state.tableSize),
    [state.tableSize]
  );
  const mood = useMemo(
    () => getChaosMood(state),
    [
      state.street,
      state.aggressors,
      state.previousActions.length,
      state.lastEventAt,
    ]
  );
  const sizingNote = useMemo(() => computeSizingNote(state, coach), [state, coach]);
  useEffect(() => {
    if (!seats.includes(state.heroSeat)) {
      setField("heroSeat", "");
    }
  }, [seats.join("|")]);

  const actions = useMemo(
    () => getAvailableActions(state, !!coach),
    [state, coach]
  );

  // Order from least -> most aggressive
  const styleOptions = [
    { code: "controlled_maniac", label: "Controlled" },
    { code: "chaos_shark", label: "Shark" },
    { code: "villain_mode", label: "Villain" },
  ];
  const styleIndex = Math.max(
    0,
    styleOptions.findIndex((o) => o.code === state.style)
  );

  return (
    <div className="wrap">
      <ChaosHud mood={mood} />
      <div className="panel">
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "nowrap",
          }}
        >
          <h1 className="title" style={{ margin: 0 }}>
            Poker Chaos Coach
          </h1>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            <span className="sub">Style:</span>
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
            <span className="sub style-current">
              {styleOptions[styleIndex]?.label || "Shark"}
            </span>
          </div>
        </div>
        <p className="sub">
          Interactive aggression coach. For fun, non-competitive sessions.
        </p>

        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <button onClick={reset}>Reset</button>
          <button onClick={clearActions}>Clear Actions</button>
          {/* <button onClick={() => {
            const lines = (state.actions || []).map((a) => JSON.stringify(a));
            const blob = new Blob(lines.map(l => l + "\n"), { type: "application/x-ndjson" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `session-${Date.now()}.ndjson`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}>Export Session</button> */}
        </div>

        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <label htmlFor="tableSize">Table Size</label>
          <select
            id="tableSize"
            value={state.tableSize}
            onChange={(e) => setField("tableSize", Number(e.target.value))}
          >
            {[6, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n}-max
              </option>
            ))}
          </select>
          <span className="sub">Open Size</span>
          <select
            value={state.openSize}
            onChange={(e) => setField("openSize", Number(e.target.value))}
          >
            {[2.2, 2.5, 2.7, 3.0, 3.2, 3.5].map((n) => (
              <option key={n} value={n}>
                {n.toFixed(1)}x
              </option>
            ))}
          </select>
          <span className="sub">Seat:</span>
          <div className="row" style={{ gap: 6 }}>
            {seats.map((seat) => (
              <button
                key={seat}
                onClick={() => setField("heroSeat", seat)}
                style={
                  state.heroSeat === seat
                    ? { background: "#f59e0b", color: "#111827" }
                    : undefined
                }
              >
                {seat}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 10, marginTop: 12 }}>
          <span className="sub">
            Street: <strong>{state.street}</strong>
          </span>
          <span className="sub">
            Table: <strong>{state.tableSize}-max</strong>
          </span>
          <span className="sub">
            Hero Seat: <strong>{state.heroSeat || "?"}</strong>
          </span>
          <span className="sub">Aggressors: {state.aggressors}</span>
        </div>

        {!state.handComplete && (
          <div style={{ marginTop: 12 }}>
            <ActionButtons actions={actions} onAction={onAction} embedded />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <PromptDisplay
            key={state.street + (state.handComplete ? "-complete" : "")}
            coach={coach}
            isLoading={loading}
            onNextStreet={() => onAction("next_street")}
            embedded
            mood={mood}
            handComplete={state.handComplete}
            onResetHand={() => onAction("reset_hand")}
            sizingNote={sizingNote}
          />
        </div>
      </div>
    </div>
  );
}
