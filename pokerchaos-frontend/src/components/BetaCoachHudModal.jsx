import { useEffect, useMemo, useRef } from "react";
import CoachStateReceipt from "./CoachStateReceipt.jsx";

const SUIT_SYMBOLS = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

const SUIT_NAMES = {
  s: "spades",
  h: "hearts",
  d: "diamonds",
  c: "clubs",
};

const STREET_OPTIONS = [
  { code: "preflop", label: "Preflop" },
  { code: "flop", label: "Flop" },
  { code: "turn", label: "Turn" },
  { code: "river", label: "River" },
];

function parseCard(card) {
  const value = String(card || "").trim();
  if (!value) return null;
  const suit = value.slice(-1).toLowerCase();
  const rank = value.slice(0, -1).toUpperCase();
  if (!rank || !SUIT_SYMBOLS[suit]) return null;
  return { rank: rank === "T" ? "10" : rank, suit, symbol: SUIT_SYMBOLS[suit] };
}

function PlayingCard({ card, label, onClick, compact = false }) {
  const parsed = parseCard(card);
  return (
    <button
      type="button"
      className={`beta-coach-card${parsed ? " is-set" : " is-empty"}${
        parsed && (parsed.suit === "h" || parsed.suit === "d") ? " is-red" : ""
      }${compact ? " is-compact" : ""}`}
      onClick={onClick}
      aria-label={`${label}: ${parsed ? `${parsed.rank} of ${SUIT_NAMES[parsed.suit]}` : "not set"}. Edit cards`}
      title={`Edit ${label.toLowerCase()}`}
    >
      {parsed ? (
        <>
          <span className="beta-coach-card-rank">{parsed.rank}</span>
          <span className="beta-coach-card-suit" aria-hidden="true">{parsed.symbol}</span>
        </>
      ) : (
        <span className="beta-coach-card-empty">+</span>
      )}
    </button>
  );
}

function formatActionAmount(entry) {
  const isCall = String(entry?.action || "").toLowerCase() === "call";
  const amount = Number(
    isCall
      ? entry?.amountBB ?? entry?.toAmountBB
      : entry?.toAmountBB ?? entry?.amountBB,
  );
  if (Number.isFinite(amount) && amount > 0) return `${amount} BB`;
  if (entry?.sizing?.kind === "percent") return `${entry.sizing.value}% pot`;
  if (entry?.sizing?.kind === "multiple") return `${entry.sizing.value}x`;
  if (typeof entry?.sizing === "string") return entry.sizing;
  return "";
}

function recentHistory(history, heroSeat) {
  return (history || []).slice(-5).map((entry, index) => ({
    key: `${entry.at || index}-${entry.action || "event"}-${index}`,
    actor:
      entry.actor === "hero"
        ? heroSeat
          ? heroSeat.toUpperCase()
          : "Hero"
        : entry.seat || "Villain",
    action: String(entry.action || "Action").replaceAll("_", " "),
    amount: formatActionAmount(entry),
    street: entry.street || "preflop",
  }));
}

function actionIntent(code) {
  const value = String(code || "").toLowerCase();
  if (value.includes("fold")) return "fold";
  if (value.includes("check") || value.includes("call")) return "continue";
  if (
    value.includes("bet") ||
    value.includes("raise") ||
    value.includes("open") ||
    value.includes("shove") ||
    value.includes("jam")
  ) {
    return "aggressive";
  }
  return "neutral";
}

export default function BetaCoachHudModal({
  open,
  onClose,
  onResetSession,
  state,
  coach,
  loading,
  actions = [],
  onAction,
  actionStageLabel,
  personaLabel,
  seats = [],
  onHeroSeatChange,
  villainType,
  villainTypeOptions = [],
  onVillainTypeChange,
  villainLabel,
  effectiveStack,
  potTotal,
  spr,
  potOdds,
  sizingNote,
  replayVisionStatus,
  decisionMoments = [],
  onSaveDecisionMoment,
  onRestoreDecisionMoment,
  onClearDecisionMoments,
  onStreetChange,
  onEditHero,
  onEditFlop,
  onEditTurn,
  onEditRiver,
  onOpenStacks,
  onClearActions,
  onUndoAction,
  canUndo = false,
  bountyMode = "none",
  bountyModeOptions = [],
  onBountyModeChange,
  showBountyControl = false,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const board = useMemo(() => {
    const flop = Array.isArray(state?.board?.flop)
      ? state.board.flop.slice(0, 3)
      : [null, null, null];
    while (flop.length < 3) flop.push(null);
    return [...flop, state?.board?.turn || null, state?.board?.river || null];
  }, [state?.board]);

  const history = useMemo(
    () => recentHistory(state?.history, state?.heroSeat),
    [state?.history, state?.heroSeat],
  );

  const savedStreets = useMemo(
    () => new Set(decisionMoments.map((moment) => moment.street)),
    [decisionMoments],
  );
  const selectedBountyOption =
    bountyModeOptions.find((option) => option.code === bountyMode) ||
    bountyModeOptions[0] ||
    null;

  if (!open) return null;

  const primaryAction = coach?.hero_action
    ? String(coach.hero_action).replaceAll("_", " ").toUpperCase()
    : "";
  const assumptions = Array.isArray(coach?.assumptions)
    ? coach.assumptions.filter(Boolean)
    : [];
  const confidence = String(coach?.confidence || "").toLowerCase();
  const alternativeAction = coach?.alternative_action
    ? String(coach.alternative_action).replaceAll("_", " ").toUpperCase()
    : "";
  const visionActive = replayVisionStatus === "watching" || replayVisionStatus === "reading";
  const assumedFoldCanReopen = Boolean(
    state?.handComplete &&
    state?.lastEventAssumed &&
    state?.lastEvent === "hero_fold",
  );
  const nextActionLabel = state?.handComplete ? "Start next hand" : "Next street";
  const currentStreetIndex = STREET_OPTIONS.findIndex(
    (option) => option.code === (state?.street || "preflop"),
  );

  return (
    <div
      className="beta-coach-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="beta-coach-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beta-coach-title"
      >
        <header className="beta-coach-header">
          <div className="beta-coach-title-group">
            <span className="beta-coach-mark" aria-hidden="true">P</span>
            <div>
              <div className="beta-coach-eyebrow">
                Live decision workspace <span className="beta-coach-beta">Beta</span>
              </div>
              <h2 id="beta-coach-title">Coach HUD</h2>
            </div>
          </div>
          <div className="beta-coach-header-status">
            <span className="beta-coach-status-chip is-persona">{personaLabel || "Coach"}</span>
            <label
              className="beta-coach-status-chip is-street beta-coach-street-control"
              title="Move forward one street or restore a previously saved street"
            >
              <select
                aria-label="Current street"
                value={state?.street || "preflop"}
                onChange={(event) => onStreetChange?.(event.target.value)}
              >
                {STREET_OPTIONS.map((option, index) => {
                  const isCurrent = index === currentStreetIndex;
                  const isSaved = savedStreets.has(option.code);
                  const isNext = index === currentStreetIndex + 1 && !state?.handComplete;
                  return (
                    <option
                      key={option.code}
                      value={option.code}
                      disabled={!isCurrent && !isSaved && !isNext}
                    >
                      {option.label}{isSaved && !isCurrent ? " · saved" : ""}
                    </option>
                  );
                })}
              </select>
              <span aria-hidden="true">⌄</span>
            </label>
            {showBountyControl ? (
              <label
                className={`beta-coach-status-chip beta-coach-street-control beta-coach-bounty-control${
                  bountyMode !== "none" ? " is-active" : ""
                }`}
                title={selectedBountyOption?.description || "Bounty tournament format"}
              >
                <select
                  aria-label="Bounty tournament format"
                  value={bountyMode}
                  onChange={(event) => onBountyModeChange?.(event.target.value)}
                >
                  {bountyModeOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.shortLabel || option.label}
                    </option>
                  ))}
                </select>
                <span aria-hidden="true">&#9662;</span>
              </label>
            ) : null}
            <span className={`beta-coach-status-chip is-vision${visionActive ? " is-active" : ""}`}>
              <span className="beta-coach-live-dot" aria-hidden="true" />
              {replayVisionStatus === "reading"
                ? "Vision reading"
                : visionActive
                  ? "Vision watching"
                  : "Vision off"}
            </span>
            <button
              type="button"
              className="beta-coach-reset-session"
              onClick={onResetSession}
              title="Reset the current Coach session"
              aria-label="Reset the current Coach session"
            >
              <span aria-hidden="true">↻</span>
              <span className="beta-coach-reset-session-label">Reset session</span>
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              className="beta-coach-close"
              onClick={onClose}
              aria-label="Close beta Coach HUD"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>

        <div className="beta-coach-body">
          <section className="beta-coach-context" aria-label="Current hand context">
            <div className="beta-coach-cards-group is-hero">
              <div className="beta-coach-section-label">Hero hand</div>
              <div className="beta-coach-card-row">
                <PlayingCard card={state?.heroCards?.card1} label="Hero card 1" onClick={onEditHero} />
                <PlayingCard card={state?.heroCards?.card2} label="Hero card 2" onClick={onEditHero} />
              </div>
            </div>

            <div className="beta-coach-cards-group is-board">
              <div className="beta-coach-section-label">Board</div>
              <div className="beta-coach-card-row">
                {board.map((card, index) => (
                  <PlayingCard
                    key={`board-card-${index}`}
                    card={card}
                    compact
                    label={index < 3 ? `Flop card ${index + 1}` : index === 3 ? "Turn card" : "River card"}
                    onClick={index < 3 ? onEditFlop : index === 3 ? onEditTurn : onEditRiver}
                  />
                ))}
              </div>
            </div>

            <div className={`beta-coach-stats${potOdds ? " has-pot-odds" : ""}`}>
              <label className="beta-coach-stat is-control">
                <span>Position</span>
                <select
                  aria-label="Hero position"
                  value={state?.heroSeat || ""}
                  onChange={(event) => onHeroSeatChange?.(event.target.value)}
                >
                  <option value="">Not set</option>
                  {seats.map((seat) => (
                    <option key={seat} value={seat}>{String(seat).toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label className="beta-coach-stat is-control">
                <span>Opponent</span>
                <select
                  aria-label="Opponent type"
                  value={villainType || "balanced"}
                  onChange={(event) => onVillainTypeChange?.(event.target.value)}
                >
                  {villainTypeOptions.length ? (
                    villainTypeOptions.map((option) => (
                      <option key={option.code} value={option.code}>{option.label}</option>
                    ))
                  ) : (
                    <option value={villainType || "balanced"}>{villainLabel || "Balanced"}</option>
                  )}
                </select>
              </label>
              <button type="button" className="beta-coach-stat is-button" onClick={onOpenStacks}>
                <span>Eff. behind</span>
                <strong>
                  {effectiveStack !== null && effectiveStack !== undefined && effectiveStack !== ""
                    ? `${effectiveStack} BB`
                    : "Set stacks"}
                </strong>
              </button>
              <button
                type="button"
                className="beta-coach-stat is-button"
                onClick={onOpenStacks}
                title="Review or override the current pot"
              >
                <span>Pot</span>
                <strong>{potTotal ? `${potTotal} BB` : "—"}</strong>
              </button>
              <div className="beta-coach-stat">
                <span>SPR</span>
                <strong>{spr || "—"}</strong>
              </div>
              {potOdds ? (
                <div
                  className="beta-coach-stat is-pot-odds"
                  title="Minimum raw equity required by the current price, before range, ICM, and exploit adjustments"
                >
                  <span>Pot odds</span>
                  <strong>{potOdds.requiredEquityPct}% needed</strong>
                  <small>
                    Call {potOdds.callAmountBB} → {potOdds.potAfterCallBB} BB
                  </small>
                </div>
              ) : null}
            </div>
          </section>

          <div className="beta-coach-workspace">
            <main className="beta-coach-advice" aria-live="polite">
              <div className="beta-coach-advice-kicker">
                <span>Coach recommendation</span>
                {confidence ? (
                  <span className={`beta-coach-confidence is-${confidence}`}>
                    {confidence} confidence
                  </span>
                ) : null}
              </div>

              {loading ? (
                <div className="beta-coach-loading">
                  <span className="beta-coach-spinner" aria-hidden="true" />
                  <div>
                    <strong>Evaluating the spot…</strong>
                    <span>Position, action and stack context are being considered.</span>
                  </div>
                </div>
              ) : primaryAction ? (
                <>
                  <div className="beta-coach-recommendation">
                    <span className="beta-coach-action">{primaryAction}</span>
                    {coach?.sizing ? <span className="beta-coach-sizing">{coach.sizing}</span> : null}
                  </div>
                  {coach?.flavor_text ? (
                    <p className="beta-coach-summary">{coach.flavor_text}</p>
                  ) : null}
                  {coach?.reasoning && coach.reasoning !== coach.flavor_text ? (
                    <section className="beta-coach-insight">
                      <span className="beta-coach-section-label">Why this line</span>
                      <p>{coach.reasoning}</p>
                    </section>
                  ) : null}
                  {alternativeAction ? (
                    <section className="beta-coach-alternative">
                      <div>
                        <span className="beta-coach-section-label">Coach alternative</span>
                        <strong>
                          {alternativeAction}
                          {coach?.alternative_sizing ? ` · ${coach.alternative_sizing}` : ""}
                        </strong>
                      </div>
                      <span className="beta-coach-reference-note">
                        {assumedFoldCanReopen
                          ? "If the replay reaches the next street, Replay Vision will infer the continuing line and reopen the hand."
                          : "Reference only—the MVP follows the primary recommendation automatically."}
                      </span>
                    </section>
                  ) : null}
                  {sizingNote ? (
                    <p className="beta-coach-sizing-note"><strong>Sizing:</strong> {sizingNote}</p>
                  ) : null}
                  {assumptions.length ? (
                    <details className="beta-coach-assumptions">
                      <summary>Assumptions used ({assumptions.length})</summary>
                      <ul>
                        {assumptions.map((assumption, index) => (
                          <li key={`${assumption}-${index}`}>{assumption}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {coach?.decision_receipt ? (
                    <CoachStateReceipt
                      compact
                      receipt={coach.decision_receipt}
                      onEditCards={onEditHero}
                      onEditStacks={onOpenStacks}
                      onUndoAction={onUndoAction}
                    />
                  ) : null}
                </>
              ) : (
                <div className="beta-coach-empty">
                  <span className="beta-coach-empty-icon" aria-hidden="true">◎</span>
                  <strong>Ready for the next decision</strong>
                  <p>Record the action in front of Hero to get a recommendation here.</p>
                </div>
              )}
            </main>

            <aside className="beta-coach-actions" aria-label="Available actions">
              <div className="beta-coach-action-header">
                <div>
                  <span className="beta-coach-section-label">Current decision</span>
                  <h3>{actionStageLabel || "Choose an action"}</h3>
                </div>
                {actions.length ? (
                  <span className="beta-coach-key-hint">1–{actions.length}</span>
                ) : null}
              </div>

              {primaryAction && !loading ? (
                <div className="beta-coach-action-recap">
                  <span>Coach says</span>
                  <strong>{primaryAction}{coach?.sizing ? ` · ${coach.sizing}` : ""}</strong>
                </div>
              ) : null}

              <div className="beta-coach-action-grid">
                {actions.length ? (
                  actions.map((action, index) => (
                    <button
                      key={action.code}
                      type="button"
                      className="beta-coach-action-button"
                      data-intent={actionIntent(action.code)}
                      onClick={() => onAction?.(action)}
                      disabled={loading}
                    >
                      <span>{action.label}</span>
                      <kbd>{index + 1}</kbd>
                    </button>
                  ))
                ) : (
                  <p className="beta-coach-no-actions">
                    {loading ? "Actions will unlock when the Coach responds." : "No action is required right now."}
                  </p>
                )}
              </div>

              {state?.nextActor === "await_street" && !state?.handComplete ? (
                <p className="beta-coach-waiting-note">
                  Replay Vision will advance when it sees the next board card.
                </p>
              ) : null}

              {assumedFoldCanReopen ? (
                <p className="beta-coach-waiting-note is-alternative">
                  Fold is the assumed line. Keep the replay running: a visible next street will replace it with the continuing alternative and request fresh advice.
                </p>
              ) : null}

              <button
                type="button"
                className="beta-coach-progress-button"
                onClick={() => onAction?.(state?.handComplete ? "reset_hand" : "next_street")}
                disabled={loading}
              >
                {nextActionLabel}
                <span aria-hidden="true">→</span>
              </button>
            </aside>
          </div>

          <section className="beta-coach-history" aria-label="Recent hand history">
            <div className="beta-coach-history-header">
              <div>
                <span className="beta-coach-section-label">Hand timeline</span>
                <strong>{history.length ? "Recent actions" : "No actions recorded"}</strong>
              </div>
              <div className="beta-coach-history-controls">
                <button
                  type="button"
                  className="beta-coach-save-moment"
                  onClick={onSaveDecisionMoment}
                >
                  <span aria-hidden="true">＋</span> Save moment
                </button>
                <button
                  type="button"
                  className="beta-coach-text-button"
                  onClick={onUndoAction}
                  disabled={!canUndo || loading}
                  title="Undo the latest entered action"
                >
                  Undo
                </button>
                {history.length ? (
                  <button type="button" className="beta-coach-text-button" onClick={onClearActions}>
                    Clear actions
                  </button>
                ) : null}
              </div>
            </div>

            {decisionMoments.length ? (
              <div className="beta-coach-moments">
                <div className="beta-coach-moments-header">
                  <div>
                    <span className="beta-coach-section-label">Saved decisions</span>
                    <p>Pause the replay before restoring so Vision does not immediately advance again.</p>
                  </div>
                  <button
                    type="button"
                    className="beta-coach-text-button"
                    onClick={onClearDecisionMoments}
                  >
                    Clear saved
                  </button>
                </div>
                <div className="beta-coach-moment-list">
                  {decisionMoments.map((moment) => {
                    const cardContext = moment.boardCards?.length
                      ? moment.boardCards.join(" ")
                      : moment.heroCards?.join(" ") || "Cards not set";
                    return (
                      <button
                        type="button"
                        className="beta-coach-moment"
                        key={moment.id}
                        onClick={() => onRestoreDecisionMoment?.(moment.id)}
                        title={`Restore ${moment.label}`}
                      >
                        <span className="beta-coach-moment-meta">
                          <span>{moment.source === "automatic" ? "Auto-saved" : "Saved"}</span>
                          <time>
                            {new Date(moment.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </span>
                        <strong>{moment.label}</strong>
                        <span className="beta-coach-moment-cards">{cardContext}</span>
                        <span className="beta-coach-moment-restore">Restore moment →</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {history.length ? (
              <ol className="beta-coach-history-list">
                {history.map((entry) => (
                  <li key={entry.key}>
                    <span className="beta-coach-history-dot" aria-hidden="true" />
                    <span className="beta-coach-history-street">{entry.street}</span>
                    <strong>{entry.actor}</strong>
                    <span>{entry.action}</span>
                    {entry.amount ? <em>{entry.amount}</em> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="beta-coach-history-empty">Actions will appear here as the hand develops.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
