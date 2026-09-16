import { useEffect, useMemo, useRef, useState } from "react";
import { buildHandReplay } from "../lib/handReplay.js";
import "./HandReplay.css";

const SUITS = { s: "♠", h: "♥", d: "♦", c: "♣" };

function Card({ card }) {
  const suit = card?.slice(-1).toLowerCase();
  const red = suit === "h" || suit === "d";
  return (
    <span
      className={`hand-replay-card ${card ? "" : "is-hidden"} ${red ? "is-red" : ""}`}
      aria-label={card || "Hidden card"}
    >
      {card ? <>{card.slice(0, -1)}{SUITS[suit] || suit}</> : "◆"}
    </span>
  );
}

function formatChips(value) {
  return value === null
    ? "Stack unknown"
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function reviewActionLabel(action) {
  const verb = String(action?.action || "").trim();
  const sizing = String(action?.sizing || action?.size || "").trim();
  if (!verb || verb.toLowerCase() === "none") return "No action recorded";
  return sizing ? `${verb} (${sizing})` : verb;
}

export default function HandReplay({ hand, streetReviews = [] }) {
  const replay = useMemo(() => buildHandReplay(hand || {}), [hand]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const activeLogRow = useRef(null);
  const logList = useRef(null);
  const last = replay.frames.length - 1;
  const index = Math.min(cursor, last);
  const frame = replay.frames[index];
  const reviewByStreet = useMemo(
    () => new Map(
      (Array.isArray(streetReviews) ? streetReviews : [])
        .filter((item) => item?.street)
        .map((item) => [String(item.street).toLowerCase(), item]),
    ),
    [streetReviews],
  );
  const reviewStreet = frame.street === "showdown" ? "river" : frame.street;
  const streetReview = reviewByStreet.get(reviewStreet);

  useEffect(() => {
    setCursor(0);
    setPlaying(false);
  }, [replay]);

  useEffect(() => {
    if (!playing || index >= last) {
      if (index >= last) setPlaying(false);
      return undefined;
    }
    const timer = setTimeout(() => setCursor((value) => value + 1), 1100);
    return () => clearTimeout(timer);
  }, [playing, index, last]);

  useEffect(() => {
    const list = logList.current;
    const row = activeLogRow.current;
    if (!list || !row) return;
    const listRect = list.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) {
      list.scrollTop -= listRect.top - rowRect.top;
    } else if (rowRect.bottom > listRect.bottom) {
      list.scrollTop += rowRect.bottom - listRect.bottom;
    }
  }, [index]);

  const seek = (value) => {
    setPlaying(false);
    setCursor(Math.max(0, Math.min(last, value)));
  };

  const streetFrames = replay.frames
    .map((item, frameIndex) => ({ ...item, frameIndex }))
    .filter((item) => item.event.type === "street" || item.event.type === "start");

  if (!replay.available) {
    return <div className="hand-replay-empty">No action history is available to replay for this hand.</div>;
  }

  return (
    <section className="hand-replay" aria-label="Hand replay">
      <div className="hand-replay-streets" aria-label="Jump to street">
        {streetFrames.map((item) => (
          <button
            type="button"
            key={item.frameIndex}
            aria-pressed={index >= item.frameIndex && item.street === frame.street}
            onClick={() => seek(item.frameIndex)}
          >
            {item.street}
          </button>
        ))}
      </div>

      <div className="hand-replay-layout">
        <div className="hand-replay-stage">
          <div className="hand-replay-table" aria-label={`${frame.players.length} players at the table`}>
            <div className="hand-replay-felt" />
            <div className="hand-replay-board">
              <span className="hand-replay-street-label">{frame.street}</span>
              <strong>Pot {formatChips(frame.pot)}</strong>
              <div className="hand-replay-cards">
                {Array.from({ length: 5 }, (_, cardIndex) => (
                  frame.board[cardIndex]
                    ? <Card key={cardIndex} card={frame.board[cardIndex]} />
                    : <span key={cardIndex} className="hand-replay-card-slot" aria-hidden="true" />
                ))}
              </div>
              <small>Pot includes chips currently bet</small>
            </div>

            {frame.players.map((player, playerIndex) => {
              const angle = Math.PI / 2 + (2 * Math.PI * playerIndex / frame.players.length);
              const position = {
                left: `${50 + 40 * Math.cos(angle)}%`,
                top: `${50 + 39 * Math.sin(angle)}%`,
              };
              return (
                <div
                  key={player.player}
                  className={`hand-replay-seat ${player.isHero ? "is-hero" : ""} ${player.folded ? "is-folded" : ""} ${frame.activePlayer === player.player ? "is-active" : ""}`}
                  style={position}
                >
                  <div className="hand-replay-seat-top">
                    <span className="hand-replay-avatar" aria-hidden="true">{player.isHero ? "★" : "♟"}</span>
                    <span>{player.position || `Seat ${player.seat ?? "?"}`}</span>
                    {player.dealer ? <b className="hand-replay-dealer" title="Dealer">D</b> : null}
                  </div>
                  <strong className="hand-replay-name" title={player.player}>
                    {player.isHero ? `Hero · ${player.player}` : player.player}
                  </strong>
                  <span className="hand-replay-stack">{formatChips(player.stack)}</span>
                  <div className="hand-replay-cards">
                    {!player.folded || player.isHero
                      ? [0, 1].map((cardIndex) => <Card key={cardIndex} card={player.cards[cardIndex]} />)
                      : null}
                  </div>
                  <small className="hand-replay-action">
                    {player.lastActionLabel || (player.folded ? "Folded" : player.allIn ? "All-in" : "In hand")}
                  </small>
                  {player.bet > 0 && ["check", "fold"].includes(player.lastAction) ? (
                    <span className="hand-replay-bet">In pot {formatChips(player.bet)}</span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="hand-replay-caption" aria-live="polite">{frame.label}</p>
          <div className="hand-replay-controls">
            <button type="button" onClick={() => seek(0)} disabled={index === 0} aria-label="Restart replay">|◀</button>
            <button type="button" onClick={() => seek(index - 1)} disabled={index === 0}>◀ Back</button>
            <button
              type="button"
              onClick={() => {
                if (index === last) setCursor(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => seek(index + 1)} disabled={index === last}>Next ▶</button>
            <button type="button" onClick={() => seek(last)} disabled={index === last} aria-label="End of replay">▶|</button>
          </div>
          <div className="hand-replay-scrubber">
            <input
              type="range"
              min="0"
              max={last}
              value={index}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Replay action"
              aria-valuetext={frame.label}
            />
            <span>{index} / {last}</span>
          </div>
        </div>

        <aside className="hand-replay-sidebar" aria-label="Replay review and decision log">
          <section className="hand-replay-guidance" aria-live="polite">
            <div className="hand-replay-guidance-heading">
              <h3>{reviewStreet} review</h3>
              {Number.isFinite(Number(streetReview?.score)) ? (
                <span>Score {Number(streetReview.score) > 0 ? "+" : ""}{streetReview.score}</span>
              ) : null}
            </div>
            {streetReview ? (
              <>
                <dl>
                  <div><dt>Played</dt><dd>{reviewActionLabel(streetReview.action_taken)}</dd></div>
                  <div><dt>Preferred</dt><dd>{reviewActionLabel(streetReview.preferred_action)}</dd></div>
                </dl>
                <p>{streetReview.analysis?.insight || streetReview.analysis?.takeaway || "No additional guidance for this street."}</p>
              </>
            ) : (
              <p>No review guidance is available for this street.</p>
            )}
          </section>
          <section className="hand-replay-log" aria-label="Decision log">
            <h3>Decision log</h3>
            <ol ref={logList}>
              {replay.frames.map((item, frameIndex) => (
                <li key={frameIndex} ref={frameIndex === index ? activeLogRow : null}>
                  <button
                    type="button"
                    aria-current={frameIndex === index ? "step" : undefined}
                    onClick={() => seek(frameIndex)}
                  >
                    <small>{item.street}</small>
                    {item.label}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {replay.warnings.map((warning) => (
        <p className="hand-replay-note" key={warning}>{warning}</p>
      ))}
    </section>
  );
}
