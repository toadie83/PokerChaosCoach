import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestChaosLine } from "./api/aiService.js";
import ActionButtons from "./components/ActionButtons.jsx";
import PromptDisplay from "./components/PromptDisplay.jsx";
import ChaosHud from "./components/ChaosHud.jsx";
import CardSelectorModal from "./components/CardSelectorModal.jsx";
import HeroVoiceCardInput from "./components/HeroVoiceCardInput";
import { useGameState } from "./state/useGameState.js";
import { summarizeForAI, getAvailableActions } from "./state/machine.js";
import { getChaosMood } from "./state/chaosMeter.js";
import { computeSizingNote, parseSizing } from "./lib/sizing.js";
import { seatsForTableSize } from "./state/seatUtils.js";

export default function App() {
  const { state, setField, dispatch, clearActions, reset } = useGameState();
  const [coach, setCoach] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const lastAutoAdvanceAt = useRef(0);

  const lastCommittedCoachAt = useRef(0);
  const lastCoachAt = useRef(0);

  const handleReset = useCallback(() => {
    setCoach(null);
    lastCoachAt.current = 0;
    lastCommittedCoachAt.current = 0;
    setShowCardModal(false);
    reset();
  }, [reset]);

  const handleClearActions = useCallback(() => {
    setCoach(null);
    lastCoachAt.current = 0;
    lastCommittedCoachAt.current = 0;
    setShowCardModal(false);
    clearActions();
  }, [clearActions]);

  const handleSaveHeroCards = useCallback(
    (cards) => {
      setField("heroCards", cards);
      setCoach(null);
      setShowCardModal(false);
    },
    [setField]
  );

  const onAction = useCallback(
    (evt) => {
      // Clear current coach output when advancing streets or resetting hand
      if (evt === "next_street" || evt === "reset_hand") {
        try {
          setCoach(null);
        } catch {}
        try {
          setField("nextActor", "hero");
        } catch {}
      }

      const autoClearCoach = new Set([
        "opp_call",
        "opp_fold",
        "opp_all_fold",
        "opp_one_call",
        "opp_multi_call",
      ]);
      if (autoClearCoach.has(evt)) {
        try {
          setCoach(null);
        } catch {}
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
            parsed.kind === "unknown"
              ? null
              : { kind: parsed.kind, value: parsed.value };
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
          const nextHistory = [...(state.history || []), ...additions].slice(
            -8
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
    [dispatch, coach, state.street, state.history, setField]
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
  }, [
    state.lastEventAt,
    state.lastEvent,
    state.persona,
    state.heroCards?.card1,
    state.heroCards?.card2,
    state.heroStackBB,
    state.villainStackBB,
  ]);

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
  const seatColumns = useMemo(() => {
    const total = seats.length;
    if (total <= 3) return total;
    if (total <= 4) return 4;
    if (total <= 6) return 3;
    if (total <= 8) return 4;
    return 5;
  }, [seats.length]);
  const mood = useMemo(
    () => getChaosMood(state),
    [
      state.street,
      state.aggressors,
      state.previousActions.length,
      state.lastEventAt,
    ]
  );
  const sizingNote = useMemo(
    () => computeSizingNote(state, coach),
    [state, coach]
  );

  const persona = state.persona || "chaos_shark";
  const heroCards = state.heroCards || { card1: null, card2: null };
  const heroCardsReady = Boolean(heroCards.card1 && heroCards.card2);
  const heroHandLabel = heroCardsReady
    ? `${heroCards.card1} ${heroCards.card2}`
    : "Not set";
  const personaNeedsCards =
    persona === "range_professor" ||
    persona === "short_stack_ninja" ||
    persona === "cash_game_crusher";

  const prepareForCardChange = useCallback(() => {
    if (heroCardsReady) {
      handleReset();
    }
  }, [heroCardsReady, handleReset]);

  const handleManualCardEntry = useCallback(() => {
    prepareForCardChange();
    setShowCardModal(true);
  }, [prepareForCardChange, setShowCardModal]);
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

  useEffect(() => {
    if (!seats.includes(state.heroSeat)) {
      setField("heroSeat", "");
    }
  }, [seats.join("|")]);

  useEffect(() => {
    if (!personaNeedsCards) {
      setShowCardModal(false);
    }
  }, [personaNeedsCards]);

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

  const showStyleSelector = persona === "chaos_shark";

  return (
    <>
      <div className="wrap">
        <ChaosHud mood={mood} />
        <div className="panel">
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <h1 className="title" style={{ margin: 0 }}>
              Poker Chaos Coach
            </h1>
            {showStyleSelector ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
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
            ) : null}
          </div>
          <div
            className="row controls-inline"
            style={{ gap: 8, marginTop: 12 }}
          >
            <label htmlFor="tableSize">Table</label>
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
            <span className="sub">Open</span>
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
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="sub">Persona:</span>
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
                    setShowCardModal(true);
                  }
                }}
              >
                {personaOptions.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
              {personaNeedsCards ? <></> : null}
            </div>
            {personaMeta?.description ? (
              <p
                className="sub"
                style={{
                  margin: "4px 0 8px",
                  width: "100%",
                  color:
                    stackOverThreshold || cashStackLow ? "#f97316" : undefined,
                  fontWeight: stackOverThreshold || cashStackLow ? 600 : 400,
                }}
              >
                {personaMeta.description}
                {stackOverThreshold
                  ? ` (Current stack ${heroStackNumber} BB - Ninja shines <= ${stackThreshold} BB.)`
                  : ""}
                {cashStackLow
                  ? ` (Stack ${heroStackNumber} BB - Crusher loves 100 BB+; consider topping up.)`
                  : ""}
              </p>
            ) : null}
            {personaNeedsCards ? (
              <div style={{ marginTop: 8 }}>
                <HeroVoiceCardInput
                  heroCards={heroCards}
                  onCardsParsed={handleSaveHeroCards}
                  onManualEntry={handleManualCardEntry}
                  onVoiceStart={prepareForCardChange}
                />
              </div>
            ) : null}
            {persona === "exploit_detective" ||
            persona === "cash_game_crusher" ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="sub">Villain type</span>
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
                <span className="sub">
                  Target villain: <strong>{villainType}</strong>
                </span>
              </div>
            ) : null}
            {persona === "cash_game_crusher" && (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="sub">Villain stack (BB)</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={villainStackValid ? villainStackNumber : ""}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setField(
                      "villainStackBB",
                      Number.isFinite(val) && val > 0 ? val : null
                    );
                  }}
                  style={{ width: 120 }}
                />
              </div>
            )}
            {persona === "short_stack_ninja" ||
            persona === "cash_game_crusher" ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="sub">Hero stack (BB)</span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={heroStackValid ? heroStackNumber : ""}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setField(
                      "heroStackBB",
                      Number.isFinite(val) && val > 0 ? val : null
                    );
                  }}
                  style={{ width: 120 }}
                />
                {persona === "cash_game_crusher" ? (
                  <span className="sub">
                    Effective:{" "}
                    <strong>
                      {effectiveStack ? `${effectiveStack} BB` : "?"}
                    </strong>
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="row" style={{ gap: 8, marginTop: 8 }}>
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

            <div className="row seat-row" style={{ gap: 8 }}>
              <span className="sub">Seat:</span>
              <div className={`seat-grid columns-${seatColumns}`}>
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
          </div>

          <div className="game-summary">
            <span className="game-summary-item">
              Street&nbsp;<strong>{state.street}</strong>
            </span>
            <span className="game-summary-item">
              Table&nbsp;<strong>{state.tableSize}-max</strong>
            </span>
            <span className="game-summary-item">
              Hero&nbsp;Seat&nbsp;<strong>{state.heroSeat || "?"}</strong>
            </span>
            <span className="game-summary-item">
              Aggressors&nbsp;<strong>{state.aggressors}</strong>
            </span>
          </div>

          {!state.handComplete && (
            <div style={{ marginTop: 12 }}>
              <ActionButtons actions={actions} onAction={onAction} embedded />
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button onClick={handleReset}>Reset</button>

            <button onClick={handleClearActions}>Clear Actions</button>
          </div>
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
      <CardSelectorModal
        open={showCardModal && personaNeedsCards}
        initialCards={heroCards}
        onClose={() => setShowCardModal(false)}
        onSave={handleSaveHeroCards}
      />
    </>
  );
}
