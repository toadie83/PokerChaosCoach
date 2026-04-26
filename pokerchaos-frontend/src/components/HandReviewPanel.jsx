import { useEffect, useMemo, useRef, useState } from "react";
import {
  requestHandHistoryParse,
  requestHandHistoryReview,
} from "../api/aiService.js";

function formatHeroCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return "Unknown";
  return cards.join(" ");
}

function formatScore(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return "-";
  }
  return Number(score) > 0 ? `+${Number(score)}` : `${Number(score)}`;
}

function formatAction(action) {
  if (!action) return "";
  if (action.type === "raise" && action.toAmount) {
    return `raise to ${action.toAmount}`;
  }
  if (action.type === "jam") {
    if (action.toAmount) return `jam to ${action.toAmount}`;
    if (action.amount) return `jam ${action.amount}`;
    return "jam";
  }
  if (action.amount) {
    return `${action.type} ${action.amount}`;
  }
  return action.type;
}

function formatActionWithPlayer(action) {
  if (!action) return "";
  const player = String(action.player || "").trim();
  const actionLabel = formatAction(action);
  if (!player) return actionLabel;
  return `${player}: ${actionLabel}`;
}

function safePercent(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return (n / d) * 100;
}

function percentLabel(value) {
  return `${value.toFixed(1)}%`;
}

function formatPercentCount(stat) {
  if (!stat || !Number.isFinite(Number(stat.pct)) || Number(stat.total) <= 0) {
    return "n/a";
  }
  return `${percentLabel(Number(stat.pct))} (${Number(stat.count)}/${Number(
    stat.total
  )})`;
}

function formatAggression(aggression) {
  const hasFrequency = Number.isFinite(Number(aggression?.frequencyPct));
  const frequency = hasFrequency
    ? percentLabel(Number(aggression.frequencyPct))
    : "n/a";
  const calls = Number(aggression?.calls) || 0;
  const aggressiveActions = Number(aggression?.aggressiveActions) || 0;
  const factorRaw = aggression?.factor;
  const factor =
    Number.isFinite(Number(factorRaw)) && calls > 0
      ? Number(factorRaw).toFixed(2)
      : calls === 0 && aggressiveActions > 0
      ? "inf"
      : "n/a";
  return `Freq ${frequency} | AF ${factor}`;
}

function formatLatestSeat(latestSeat) {
  const number = Number(latestSeat?.number);
  const position = String(latestSeat?.position || "").trim();
  const hasNumber = Number.isFinite(number) && number > 0;
  if (hasNumber && position) return `Seat ${number} (${position})`;
  if (hasNumber) return `Seat ${number}`;
  if (position) return position;
  return "Seat unknown";
}

function formatChipStack(chips) {
  const value = Number(chips);
  if (!Number.isFinite(value) || value < 0) return "Stack n/a";
  return `Stack ~${Math.round(value).toLocaleString()}`;
}

function extractTendencyLabels(player) {
  if (!Array.isArray(player?.tags)) return [];
  return player.tags
    .map((tag) => String(tag?.label || "").trim())
    .filter(Boolean);
}

function formatPlayNote(player) {
  const text = String(player?.playNote?.text || "").trim();
  if (!text) return null;
  const confidence = String(player?.playNote?.confidence || "")
    .trim()
    .toLowerCase();
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    return `${text} (${confidence} confidence)`;
  }
  return text;
}

function seatCategory(position) {
  const seat = String(position || "").toUpperCase();
  if (!seat) return "unknown";
  if (["BTN", "CO", "HJ"].includes(seat)) return "late";
  if (["LJ", "UTG", "UTG+1", "UTG+2"].includes(seat)) return "early";
  if (["SB", "BB"].includes(seat)) return "blind";
  return "middle";
}

function scoreClass(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return "neutral";
  if (numeric >= 1) return "good";
  if (numeric <= -1) return "bad";
  return "neutral";
}

function handKey(hand) {
  const handId = String(hand?.handId || "");
  const playedAt = String(hand?.playedAt || "");
  const tournamentId = String(hand?.tournamentId || "");
  return `${handId}::${playedAt}::${tournamentId}`;
}

function outcomeClass(code) {
  if (typeof code !== "string") return "unknown";
  if (code.startsWith("won_")) return "won";
  if (code.startsWith("folded_")) return "folded";
  if (code.includes("lost")) return "lost";
  return "unknown";
}

function formatBoard(board) {
  const flop = Array.isArray(board?.flop) ? board.flop.filter(Boolean) : [];
  const turn = board?.turn ? [board.turn] : [];
  const river = board?.river ? [board.river] : [];
  const cards = [...flop, ...turn, ...river];
  return cards.length ? cards.join(" ") : "No board dealt (hand ended preflop)";
}

function formatBoardStreet(board, street) {
  if (street === "flop") {
    const flop = Array.isArray(board?.flop) ? board.flop.filter(Boolean) : [];
    return flop.length ? flop.join(" ") : "Not dealt";
  }
  if (street === "turn") {
    return board?.turn || "Not dealt";
  }
  if (street === "river") {
    return board?.river || "Not dealt";
  }
  return "Not dealt";
}

function uniquePlayersForStreet(actions) {
  const seen = new Set();
  for (const action of actions || []) {
    const player = String(action?.player || "").trim();
    if (!player) continue;
    seen.add(player);
  }
  return seen;
}

function streetPlayersLabel(hand) {
  const flopPlayers = uniquePlayersForStreet(hand?.actionsByStreet?.flop || []);
  const turnPlayers = uniquePlayersForStreet(hand?.actionsByStreet?.turn || []);
  const riverPlayers = uniquePlayersForStreet(hand?.actionsByStreet?.river || []);
  if (flopPlayers.size > 0) {
    const multiway = flopPlayers.size > 2 ? "multiway" : "heads-up";
    return `Flop players: ${flopPlayers.size} (${multiway})`;
  }
  if (turnPlayers.size > 0 || riverPlayers.size > 0) {
    const active = Math.max(turnPlayers.size, riverPlayers.size);
    return `Postflop players: ${active}`;
  }
  return "Hand ended preflop";
}

export default function HandReviewPanel() {
  const [heroName, setHeroName] = useState("Hero");
  const [historyText, setHistoryText] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [handLimit, setHandLimit] = useState(120);
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [sourceFileName, setSourceFileName] = useState("");
  const [loadingParse, setLoadingParse] = useState(false);
  const [loadingReview, setLoadingReview] = useState(false);
  const [error, setError] = useState("");
  const [parseResult, setParseResult] = useState(null);
  const [reviewsByHandKey, setReviewsByHandKey] = useState({});
  const [selectedHandKeys, setSelectedHandKeys] = useState(() => new Set());
  const [insightsTab, setInsightsTab] = useState("tournament");
  const [opponentFilter, setOpponentFilter] = useState("all");
  const [copiedOpponentKey, setCopiedOpponentKey] = useState("");
  const copyTimeoutRef = useRef(null);

  const canSubmit = historyText.trim().length > 0;
  const parsedHands = Array.isArray(parseResult?.hands) ? parseResult.hands : [];
  const opponentSnapshot = parseResult?.opponents || null;
  const opponentPlayers = Array.isArray(opponentSnapshot?.players)
    ? opponentSnapshot.players
    : [];
  const currentTableGuess = opponentSnapshot?.currentTableGuess || null;
  const currentTableGuessPlayers = Array.isArray(currentTableGuess?.players)
    ? currentTableGuess.players
    : [];
  const currentTablePlayerSet = useMemo(
    () =>
      new Set(
        currentTableGuessPlayers
          .map((seat) => String(seat?.player || "").trim())
          .filter(Boolean)
      ),
    [currentTableGuessPlayers]
  );
  const currentTableSeatByPlayer = useMemo(() => {
    const map = new Map();
    for (const seat of currentTableGuessPlayers) {
      const player = String(seat?.player || "").trim();
      const number = Number(seat?.seat);
      if (!player || !Number.isFinite(number)) continue;
      map.set(player, number);
    }
    return map;
  }, [currentTableGuessPlayers]);
  const visibleOpponentPlayers = useMemo(() => {
    if (opponentFilter !== "current_table") return opponentPlayers;
    return opponentPlayers
      .filter((player) => {
        const id = String(player?.player || "").trim();
        return id && currentTablePlayerSet.has(id);
      })
      .sort((a, b) => {
        const aId = String(a?.player || "").trim();
        const bId = String(b?.player || "").trim();
        const aSeat = Number(currentTableSeatByPlayer.get(aId));
        const bSeat = Number(currentTableSeatByPlayer.get(bId));
        const aHasSeat = Number.isFinite(aSeat);
        const bHasSeat = Number.isFinite(bSeat);

        if (aHasSeat && bHasSeat && aSeat !== bSeat) return aSeat - bSeat;
        if (aHasSeat && !bHasSeat) return -1;
        if (!aHasSeat && bHasSeat) return 1;
        return aId.localeCompare(bId);
      });
  }, [
    opponentFilter,
    opponentPlayers,
    currentTablePlayerSet,
    currentTableSeatByPlayer,
  ]);
  const outcomeOptions = useMemo(() => {
    const byCode = new Map();
    for (const hand of parsedHands) {
      const code = String(hand?.heroOutcome?.code || "").trim();
      const label = String(hand?.heroOutcome?.label || "").trim();
      if (!code) continue;
      if (!byCode.has(code)) {
        byCode.set(code, label || code);
      }
    }
    return Array.from(byCode.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [parsedHands]);
  const filteredParsedHands =
    outcomeFilter === "all"
      ? parsedHands
      : parsedHands.filter(
          (hand) => String(hand?.heroOutcome?.code || "") === outcomeFilter
        );
  const selectedHands = filteredParsedHands.filter((hand) =>
    selectedHandKeys.has(handKey(hand))
  );
  const selectedCount = selectedHands.length;
  const reviewedCount = parsedHands.reduce(
    (count, hand) => (reviewsByHandKey[handKey(hand)] ? count + 1 : count),
    0
  );
  const tournamentSummary = useMemo(() => {
    if (!parseResult?.summary) return null;
    const totalHands = Number(parseResult.summary.totalHands) || 0;
    const enteredHands = Number(parseResult.summary.filteredHands) || 0;
    const preflopFolds = Math.max(0, totalHands - enteredHands);

    let wonShowdown = 0;
    let lostShowdown = 0;
    let wonNoShowdown = 0;
    let wonNoShowdownPostflop = 0;
    let foldedFlop = 0;
    let foldedTurn = 0;
    let foldedRiver = 0;
    let enteredLate = 0;
    let enteredEarly = 0;
    let enteredBlind = 0;
    let stackBbSum = 0;
    let stackBbCount = 0;

    const statusCounts = new Map();
    for (const hand of parsedHands) {
      const code = String(hand?.heroOutcome?.code || "unknown");
      statusCounts.set(code, (statusCounts.get(code) || 0) + 1);
      if (code === "won_showdown") wonShowdown += 1;
      if (code === "lost_showdown") lostShowdown += 1;
      if (code.startsWith("won_no_showdown_")) {
        wonNoShowdown += 1;
        if (
          code.endsWith("_flop") ||
          code.endsWith("_turn") ||
          code.endsWith("_river")
        ) {
          wonNoShowdownPostflop += 1;
        }
      }
      if (code === "folded_flop") foldedFlop += 1;
      if (code === "folded_turn") foldedTurn += 1;
      if (code === "folded_river") foldedRiver += 1;

      const category = seatCategory(hand?.heroPosition);
      if (category === "late") enteredLate += 1;
      if (category === "early") enteredEarly += 1;
      if (category === "blind") enteredBlind += 1;

      const heroStack = Number(hand?.heroStack);
      const bigBlind = Number(hand?.blinds?.bigBlind);
      if (
        Number.isFinite(heroStack) &&
        heroStack > 0 &&
        Number.isFinite(bigBlind) &&
        bigBlind > 0
      ) {
        stackBbSum += heroStack / bigBlind;
        stackBbCount += 1;
      }
    }

    const showdownSamples = wonShowdown + lostShowdown;
    const enteredPct = safePercent(enteredHands, totalHands);
    const preflopFoldPct = safePercent(preflopFolds, totalHands);
    const noShowdownWinPct = safePercent(wonNoShowdown, enteredHands);
    const postflopNoShowdownPct = safePercent(wonNoShowdownPostflop, enteredHands);
    const showdownWinPct = safePercent(wonShowdown, showdownSamples);
    const lateStreetFoldPct = safePercent(
      foldedTurn + foldedRiver,
      foldedFlop + foldedTurn + foldedRiver
    );
    const enteredLatePct = safePercent(enteredLate, enteredHands);
    const avgEntryStackBb = stackBbCount > 0 ? stackBbSum / stackBbCount : null;

    let preflopFoldWarnThreshold = 78;
    if (avgEntryStackBb !== null && avgEntryStackBb < 18) {
      preflopFoldWarnThreshold = 82;
    } else if (avgEntryStackBb !== null && avgEntryStackBb > 45) {
      preflopFoldWarnThreshold = 76;
    }
    if (enteredLatePct >= 45) {
      preflopFoldWarnThreshold -= 2;
    }
    if (enteredEarly >= enteredLate + 4) {
      preflopFoldWarnThreshold += 2;
    }
    preflopFoldWarnThreshold = Math.max(72, Math.min(84, preflopFoldWarnThreshold));

    const flags = [];
    if (totalHands >= 40 && preflopFoldPct > preflopFoldWarnThreshold) {
      flags.push({
        level: "watch",
        text: `Preflop fold rate is high for this sample/context (${percentLabel(
          preflopFoldPct
        )} vs ~${percentLabel(preflopFoldWarnThreshold)} threshold).`,
      });
    }
    if (postflopNoShowdownPct <= 8 && enteredHands >= 15) {
      flags.push({
        level: "watch",
        text: "Postflop no-showdown wins are low. Pressure opportunities may be missed.",
      });
    }
    if (showdownSamples >= 8 && showdownWinPct < 42) {
      flags.push({
        level: "watch",
        text: "Showdown conversion is weak. Review bluff-catch calls and thin value lines.",
      });
    }
    if (
      foldedFlop + foldedTurn + foldedRiver >= 8 &&
      lateStreetFoldPct >= 65
    ) {
      flags.push({
        level: "watch",
        text: "Most postflop folds happen late. Check turn/river over-fold patterns.",
      });
    }
    if (flags.length === 0 && totalHands > 0) {
      flags.push({
        level: "good",
        text: "No major status-level leak signal in this sample.",
      });
    }

    return {
      sampleHands: parsedHands.length,
      totalHands,
      enteredHands,
      preflopFolds,
      enteredPct,
      preflopFoldPct,
      preflopFoldWarnThreshold,
      noShowdownWinPct,
      postflopNoShowdownPct,
      wonShowdown,
      lostShowdown,
      showdownSamples,
      showdownWinPct,
      foldedFlop,
      foldedTurn,
      foldedRiver,
      lateStreetFoldPct,
      enteredLate,
      enteredEarly,
      enteredBlind,
      enteredLatePct,
      avgEntryStackBb,
      flags,
      topStatuses: Array.from(statusCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    };
  }, [parseResult?.summary, parsedHands]);

  const parsePayload = useMemo(
    () => ({
      historyText,
      heroName: heroName.trim() || "Hero",
      includeOnlyHeroDidNotFoldPreflop: true,
      sort: sortOrder,
      limit: Math.max(1, Math.min(500, Number(handLimit) || 120)),
    }),
    [historyText, heroName, sortOrder, handLimit]
  );
  const hasTournamentSummary = Boolean(tournamentSummary);
  const hasOpponentSnapshot = opponentPlayers.length > 0;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (insightsTab === "tournament" && hasTournamentSummary) return;
    if (insightsTab === "opponents" && hasOpponentSnapshot) return;
    if (hasTournamentSummary) {
      setInsightsTab("tournament");
      return;
    }
    if (hasOpponentSnapshot) {
      setInsightsTab("opponents");
    }
  }, [insightsTab, hasTournamentSummary, hasOpponentSnapshot]);

  const copyOpponentTendencies = async (playerKey, tendencyLabels, playNoteLine) => {
    const labels = Array.isArray(tendencyLabels)
      ? tendencyLabels.filter(Boolean)
      : [];
    const note = String(playNoteLine || "").trim();
    const lines = [...labels];
    if (note) lines.push(`Play note: ${note}`);
    if (lines.length === 0) return;
    const text = lines.join("\n");

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const input = document.createElement("textarea");
        input.value = text;
        input.setAttribute("readonly", "readonly");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopiedOpponentKey(playerKey);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedOpponentKey("");
      }, 1600);
    } catch {
      setError("Failed to copy tendencies to clipboard.");
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setHistoryText(text || "");
    setSourceFileName(file.name || "");
    setError("");
    setParseResult(null);
    setReviewsByHandKey({});
    setOutcomeFilter("all");
    setSelectedHandKeys(new Set());
    setInsightsTab("tournament");
    setOpponentFilter("all");
    setCopiedOpponentKey("");
  };

  const runParse = async () => {
    if (!canSubmit) return;
    setError("");
    setLoadingParse(true);
    setReviewsByHandKey({});
    try {
      const res = await requestHandHistoryParse(parsePayload);
      setParseResult(res);
      setOutcomeFilter("all");
      setSelectedHandKeys(new Set());
      setInsightsTab("tournament");
      setOpponentFilter("all");
      setCopiedOpponentKey("");
    } catch (err) {
      setError(err?.message || "Failed to parse hand history.");
    } finally {
      setLoadingParse(false);
    }
  };

  const runReview = async () => {
    if (selectedCount === 0) {
      setError("Select at least one parsed hand for review.");
      return;
    }
    setError("");
    setLoadingReview(true);
    try {
      const reviewPayload = {
        selectedHands,
      };
      if (opponentSnapshot && typeof opponentSnapshot === "object") {
        reviewPayload.opponentSnapshot = opponentSnapshot;
      }
      const res = await requestHandHistoryReview(reviewPayload);
      setReviewsByHandKey((previous) => {
        const next = { ...previous };
        for (const item of res?.reviews || []) {
          const key = handKey(item?.hand || {});
          if (key) {
            next[key] = item?.review || null;
          }
        }
        return next;
      });
    } catch (err) {
      setError(err?.message || "Failed to review hands.");
    } finally {
      setLoadingReview(false);
    }
  };

  const toggleHandSelection = (hand) => {
    const key = handKey(hand);
    setSelectedHandKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllHands = () => {
    setSelectedHandKeys(
      new Set(filteredParsedHands.map((hand) => handKey(hand)))
    );
  };

  const clearSelection = () => {
    setSelectedHandKeys(new Set());
  };

  return (
    <section className="hand-review-panel">
      <div className="hand-review-header">
        <h2>Hand Review</h2>
        <p>
          Upload or paste GG tournament history. This filters to hands where
          Hero did not fold preflop.
        </p>
      </div>

      <div className="hand-review-controls">
        <label>
          Hero name
          <input
            type="text"
            value={heroName}
            onChange={(e) => setHeroName(e.target.value)}
            placeholder="Hero"
          />
        </label>
        <label>
          Sort
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label>
          Parse limit
          <input
            type="number"
            min={1}
            max={500}
            value={handLimit}
            onChange={(e) => setHandLimit(e.target.value)}
          />
        </label>
      </div>

      <div className="hand-review-inputs">
        <label className="hand-review-file">
          <span>{sourceFileName || "Choose hand history text file"}</span>
          <input type="file" accept=".txt,.log" onChange={handleFileChange} />
        </label>
        <textarea
          value={historyText}
          onChange={(e) => {
            setHistoryText(e.target.value);
            setError("");
            setReviewsByHandKey({});
            setOutcomeFilter("all");
            setSelectedHandKeys(new Set());
            setInsightsTab("tournament");
            setOpponentFilter("all");
            setCopiedOpponentKey("");
          }}
          rows={10}
          placeholder="Paste GG hand history text here"
        />
      </div>

      <div className="hand-review-actions">
        <button type="button" onClick={runParse} disabled={!canSubmit || loadingParse}>
          {loadingParse ? "Parsing..." : "Parse Hands"}
        </button>
      </div>

      {error ? <p className="hand-review-error">{error}</p> : null}

      {parseResult?.summary ? (
        <div className="hand-review-summary">
          <span>Total: {parseResult.summary.totalHands}</span>
          <span>Filtered: {parseResult.summary.filteredHands}</span>
          <span>Returned: {parseResult.summary.returnedHands}</span>
          <span>Visible: {filteredParsedHands.length}</span>
          <span>Selected: {selectedCount}</span>
          <span>Reviewed: {reviewedCount}</span>
        </div>
      ) : null}

      {hasTournamentSummary || hasOpponentSnapshot ? (
        <div className="hand-insights">
          <div className="hand-insights-tabs" role="tablist" aria-label="Insights tabs">
            {hasTournamentSummary ? (
              <button
                type="button"
                role="tab"
                aria-selected={insightsTab === "tournament"}
                className={`hand-insights-tab ${
                  insightsTab === "tournament" ? "active" : ""
                }`}
                onClick={() => setInsightsTab("tournament")}
              >
                Tournament Summary
              </button>
            ) : null}
            {hasOpponentSnapshot ? (
              <button
                type="button"
                role="tab"
                aria-selected={insightsTab === "opponents"}
                className={`hand-insights-tab ${
                  insightsTab === "opponents" ? "active" : ""
                }`}
                onClick={() => setInsightsTab("opponents")}
              >
                Opponent Snapshot
              </button>
            ) : null}
          </div>

          {insightsTab === "tournament" && hasTournamentSummary ? (
            <div className="tournament-summary">
              <div className="tournament-summary-head">
                <h3>Tournament Summary</h3>
                <span>
                  Sample: {tournamentSummary.sampleHands} returned hands
                </span>
              </div>
              <div className="tournament-summary-metrics">
                <span>
                  Entered pot: {percentLabel(tournamentSummary.enteredPct)} (
                  {tournamentSummary.enteredHands}/{tournamentSummary.totalHands})
                </span>
                <span>
                  Folded preflop:{" "}
                  {percentLabel(tournamentSummary.preflopFoldPct)} (
                  {tournamentSummary.preflopFolds}/{tournamentSummary.totalHands})
                </span>
                <span>
                  Preflop fold warning threshold:{" "}
                  {percentLabel(tournamentSummary.preflopFoldWarnThreshold)}
                  {tournamentSummary.totalHands < 40
                    ? " (inactive under 40-hand sample)"
                    : ""}
                </span>
                <span>
                  Won without showdown:{" "}
                  {percentLabel(tournamentSummary.noShowdownWinPct)} of entered
                </span>
                <span>
                  Postflop no-showdown wins:{" "}
                  {percentLabel(tournamentSummary.postflopNoShowdownPct)} of entered
                </span>
                <span>
                  Showdown win rate:{" "}
                  {tournamentSummary.showdownSamples > 0
                    ? percentLabel(tournamentSummary.showdownWinPct)
                    : "n/a"}
                </span>
                <span>
                  Late-street fold share:{" "}
                  {tournamentSummary.foldedFlop +
                    tournamentSummary.foldedTurn +
                    tournamentSummary.foldedRiver >
                  0
                    ? percentLabel(tournamentSummary.lateStreetFoldPct)
                    : "n/a"}
                </span>
                <span>
                  Entered positions (late/early/blinds): {tournamentSummary.enteredLate}/
                  {tournamentSummary.enteredEarly}/{tournamentSummary.enteredBlind}
                </span>
                <span>
                  Avg entry stack:{" "}
                  {tournamentSummary.avgEntryStackBb !== null
                    ? `${tournamentSummary.avgEntryStackBb.toFixed(1)} BB`
                    : "n/a"}
                </span>
              </div>
              <div className="tournament-summary-flags">
                {tournamentSummary.flags.map((flag, idx) => (
                  <p key={`flag-${idx}`} className={`trend-flag ${flag.level}`}>
                    {flag.text}
                  </p>
                ))}
              </div>
              {tournamentSummary.topStatuses.length > 0 ? (
                <div className="tournament-summary-statuses">
                  {tournamentSummary.topStatuses.map(([status, count]) => (
                    <span key={status}>
                      {status}: {count}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {insightsTab === "opponents" && hasOpponentSnapshot ? (
            <div className="opponent-snapshot">
              <div className="opponent-snapshot-head">
                <h3>Opponent Snapshot</h3>
                <span>
                  {visibleOpponentPlayers.length}/
                  {opponentSnapshot?.totalOpponents || opponentPlayers.length} players
                  across {opponentSnapshot?.totalHandsTracked || 0} hands
                </span>
              </div>
              <div className="opponent-snapshot-toolbar">
                <label>
                  View
                  <select
                    value={opponentFilter}
                    onChange={(event) => setOpponentFilter(event.target.value)}
                  >
                    <option value="all">All opponents</option>
                    <option value="current_table">Current table (best guess)</option>
                  </select>
                </label>
                <p className="opponent-snapshot-note">
                  Best guess uses latest hand
                  {currentTableGuess?.playedAt ? ` (${currentTableGuess.playedAt})` : ""}.
                </p>
              </div>
              <div className="opponent-snapshot-list">
                {visibleOpponentPlayers.map((player) => {
                  const tendencyLabels = extractTendencyLabels(player);
                  const playNoteLine = formatPlayNote(player);
                  return (
                    <article key={player.player} className="opponent-snapshot-row">
                      <div className="opponent-snapshot-row-head">
                        <strong>{player.player}</strong>
                        <span>{player.handsSeen} hands</span>
                        <span>{formatLatestSeat(player.latestSeat)}</span>
                        <span>{formatChipStack(player.latestStack)}</span>
                        {player.lastSeenAt ? <span>Last: {player.lastSeenAt}</span> : null}
                        <button
                          type="button"
                          className="opponent-copy-button"
                          onClick={() =>
                            copyOpponentTendencies(
                              player.player,
                              tendencyLabels,
                              playNoteLine
                            )
                          }
                          disabled={tendencyLabels.length === 0 && !playNoteLine}
                        >
                          {copiedOpponentKey === player.player
                            ? "Copied"
                            : "Copy tendencies"}
                        </button>
                      </div>
                      <div className="opponent-snapshot-metrics">
                        <span>Entered pot: {formatPercentCount(player.enteredPot)}</span>
                        <span>
                          Folded preflop: {formatPercentCount(player.foldedPreflop)}
                        </span>
                        <span>
                          Raised preflop: {formatPercentCount(player.preflopRaise)}
                        </span>
                        <span>
                          Fold to preflop raise:{" "}
                          {formatPercentCount(player.foldToPreflopRaise)}
                        </span>
                        <span>
                          Postflop aggression: {formatAggression(player.postflopAggression)}
                        </span>
                      </div>
                      {playNoteLine ? (
                        <p className="opponent-play-note">
                          <strong>Play note:</strong> {playNoteLine}
                        </p>
                      ) : null}
                      {tendencyLabels.length > 0 ? (
                        <div className="opponent-snapshot-tags">
                          {tendencyLabels.map((label) => (
                            <span key={`${player.player}-${label}`} className="opponent-tag">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {visibleOpponentPlayers.length === 0 ? (
                  <p className="hand-review-empty">
                    No opponents match the current filter.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {parsedHands.length > 0 ? (
        <div className="hand-review-controls">
          <label>
            Outcome status
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setSelectedHandKeys(new Set());
              }}
            >
              <option value="all">All statuses</option>
              {outcomeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {filteredParsedHands.length > 0 ? (
        <div className="hand-review-selection-tools">
          <button type="button" onClick={selectAllHands}>
            Select all
          </button>
          <button type="button" onClick={clearSelection}>
            Clear selection
          </button>
          <button
            type="button"
            onClick={runReview}
            disabled={selectedCount === 0 || loadingReview}
          >
            {loadingReview
              ? "Reviewing..."
              : `Analyze Selected (${selectedCount})`}
          </button>
        </div>
      ) : null}

      {filteredParsedHands.length > 0 ? (
        <div className="hand-review-list">
          {filteredParsedHands.map((hand) => {
            const outcome = hand.heroOutcome || {};
            const isSelected = selectedHandKeys.has(handKey(hand));
            const attachedReview = reviewsByHandKey[handKey(hand)];
            return (
            <article
              key={handKey(hand)}
              className={`hand-row ${isSelected ? "selected" : ""}`}
            >
              <div className="hand-row-head">
                <label className="hand-row-select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleHandSelection(hand)}
                  />
                  <strong>{hand.handId}</strong>
                </label>
                <span>{hand.playedAt}</span>
              </div>
              <div className="hand-row-meta">
                <span>{hand.heroPosition || "Unknown position"}</span>
                <span>Cards: {formatHeroCards(hand.heroCards)}</span>
                <span
                  className={`outcome-pill ${outcomeClass(outcome.code)}`}
                  title={outcome.code || "unknown"}
                >
                  {outcome.label || "Outcome unknown"}
                  {Number(outcome.wonAmount) > 0 ? ` (${outcome.wonAmount})` : ""}
                </span>
                <span>
                  Preflop:{" "}
                  {(hand.heroPreflop?.actions || [])
                    .map((action) => formatAction(action))
                    .join(", ") || "No decision"}
                </span>
              </div>
              {attachedReview ? (
                <div className="hand-row-review">
                  <div className="hand-review-scores">
                    <span
                      className={`score-pill ${scoreClass(
                        attachedReview.overall_score
                      )}`}
                    >
                      Overall {formatScore(attachedReview.overall_score)}
                    </span>
                    <span>Pre {formatScore(attachedReview.preflop_score)}</span>
                    <span>Flop {formatScore(attachedReview.flop_score)}</span>
                    <span>Turn {formatScore(attachedReview.turn_score)}</span>
                    <span>River {formatScore(attachedReview.river_score)}</span>
                    <span>
                      Confidence {attachedReview.confidence || "medium"}
                    </span>
                  </div>
                  <p>
                    <strong>Leak:</strong> {attachedReview.primary_leak}
                  </p>
                  <p>
                    <strong>Better line:</strong> {attachedReview.better_line}
                  </p>
                  <details className="hand-breakdown">
                    <summary>Hand breakdown</summary>
                    <div className="hand-breakdown-body">
                      <p>
                        <strong>Hero cards:</strong> {formatHeroCards(hand.heroCards)}
                      </p>
                      <p>
                        <strong>Board:</strong> {formatBoard(hand.board)}
                      </p>
                      <p>
                        <strong>Flop:</strong> {formatBoardStreet(hand.board, "flop")}
                      </p>
                      <p>
                        <strong>Turn:</strong> {formatBoardStreet(hand.board, "turn")}
                      </p>
                      <p>
                        <strong>River:</strong> {formatBoardStreet(hand.board, "river")}
                      </p>
                      <p>
                        <strong>Context:</strong> {streetPlayersLabel(hand)}
                      </p>
                      <p>
                        <strong>Blinds:</strong>{" "}
                        {hand.blinds?.smallBlind || "?"}/
                        {hand.blinds?.bigBlind || "?"}
                        {hand.blinds?.ante ? ` (${hand.blinds.ante} ante)` : ""}
                      </p>
                      <div className="hand-breakdown-street">
                        <strong>Preflop</strong>
                        {(hand.actionsByStreet?.preflop || []).length > 0 ? (
                          (hand.actionsByStreet?.preflop || []).map((action, idx) => (
                            <span key={`pre-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))
                        ) : (
                          <span>No actions captured.</span>
                        )}
                      </div>
                      {(hand.actionsByStreet?.flop || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Flop</strong>
                          {(hand.actionsByStreet?.flop || []).map((action, idx) => (
                            <span key={`flop-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(hand.actionsByStreet?.turn || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Turn</strong>
                          {(hand.actionsByStreet?.turn || []).map((action, idx) => (
                            <span key={`turn-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(hand.actionsByStreet?.river || []).length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>River</strong>
                          {(hand.actionsByStreet?.river || []).map((action, idx) => (
                            <span key={`river-${idx}`}>
                              {formatActionWithPlayer(action)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {Array.isArray(hand.showdown?.revealedCards) &&
                      hand.showdown.revealedCards.length > 0 ? (
                        <div className="hand-breakdown-street">
                          <strong>Revealed cards</strong>
                          {hand.showdown.revealedCards.map((entry, idx) => (
                            <span key={`show-${idx}`}>
                              {entry.player}: {(entry.cards || []).join(" ") || "Unknown"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </div>
              ) : null}
            </article>
          )})}
        </div>
      ) : null}

      {parsedHands.length > 0 && filteredParsedHands.length === 0 ? (
        <p className="hand-review-empty">
          No parsed hands match the selected outcome status.
        </p>
      ) : null}
    </section>
  );
}
