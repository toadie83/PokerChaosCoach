import { useEffect, useRef } from "react";

import {
  getBountyModeMeta,
  isBountyTournament,
} from "../config/bountyTournamentConfig.js";

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(2));
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ReceiptItem({ label, value, title, onClick, tone = "" }) {
  if (!value) return null;
  const className = `coach-state-receipt-chip${tone ? ` is-${tone}` : ""}${
    onClick ? " is-editable" : ""
  }`;
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {content}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {content}
    </span>
  );
}

export default function CoachStateReceipt({
  receipt,
  compact = false,
  onEditCards,
  onEditStacks,
  onUndoAction,
}) {
  const detailsRef = useRef(null);

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  }, [receipt?.capturedAt]);

  if (!receipt || typeof receipt !== "object") return null;

  const heroCards = Array.isArray(receipt.heroCards)
    ? receipt.heroCards.filter(Boolean).join(" ")
    : "";
  const boardCards = Array.isArray(receipt.boardCards)
    ? receipt.boardCards.filter(Boolean).join(" ")
    : "";
  const relativePosition = ["ip", "oop"].includes(receipt.relativePosition)
    ? receipt.relativePosition.toUpperCase()
    : "";
  const position = [receipt.heroSeat, relativePosition].filter(Boolean).join(" / ");
  const heroStack = formatNumber(receipt.heroStackBehindBB);
  const opponentStack = formatNumber(receipt.opponentStackBehindBB);
  const opponentSeat = receipt.facingAction?.actorSeat || receipt.opponentSeat;
  const opponent = [
    opponentSeat || "Seat unknown",
    opponentStack !== null ? `${opponentStack} BB` : null,
    receipt.villainType ? titleCase(receipt.villainType) : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const pot = formatNumber(receipt.potBB);
  const spr = formatNumber(receipt.spr);
  const potValue = [
    pot !== null ? `${pot} BB` : null,
    spr !== null ? `SPR ${spr}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const facing = receipt.facingAction;
  const facingAmount = formatNumber(facing?.toAmountBB ?? facing?.amountBB);
  const initialOpenAmount = formatNumber(facing?.initialOpenAmountBB);
  const facingLabel = facing
    ? initialOpenAmount !== null
      ? [
          `${facing.initialOpenerSeat || "Unknown seat"} open ${initialOpenAmount} BB`,
          `${facing.actorSeat || "Unknown seat"} 3-bet${
            facingAmount !== null ? ` ${facingAmount} BB` : ""
          }`,
        ].join(" -> ")
      : [
          facing.actorSeat,
          facing.allIn ? "all-in" : titleCase(facing.type),
          facingAmount !== null ? `${facingAmount} BB` : null,
        ]
          .filter(Boolean)
          .join(" ")
    : "";
  const players = formatNumber(receipt.playersInHand);
  const behindSeats = Array.isArray(receipt.playersYetToActSeats)
    ? receipt.playersYetToActSeats.filter(Boolean)
    : [];
  const playerValue = [
    players !== null ? `${players} players` : null,
    behindSeats.length ? `${behindSeats.join("/")} behind` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const potOdds = formatNumber(receipt.potOdds?.requiredEquityPct);
  const missing = Array.isArray(receipt.missingInformation)
    ? receipt.missingInformation.filter(Boolean)
    : [];
  const ante = formatNumber(receipt.anteBB);
  const bountyEnabled = isBountyTournament(receipt.bountyMode);
  const bountyMeta = getBountyModeMeta(receipt.bountyMode);
  const formatValue = [
    receipt.gameType ? titleCase(receipt.gameType) : null,
    ante !== null && ante > 0 ? `${ante} BB ante` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <details
      ref={detailsRef}
      className={`coach-state-receipt${compact ? " is-compact" : ""}`}
      aria-label="State used for this Coach recommendation"
    >
      <summary className="coach-state-receipt-summary">
        <span>View state used</span>
        <span className="coach-state-receipt-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="coach-state-receipt-body">
        <div className="coach-state-receipt-heading">
          <span>Coach used this state</span>
          <small>Snapshot at recommendation time</small>
        </div>
        <div className="coach-state-receipt-chips">
        <ReceiptItem label="Street" value={titleCase(receipt.street)} />
        <ReceiptItem
          label="Hand"
          value={heroCards}
          onClick={onEditCards}
          title={onEditCards ? "Correct Hero cards" : "Hero cards used"}
        />
        <ReceiptItem
          label="Board"
          value={boardCards}
          title="Board cards used"
        />
        <ReceiptItem label="Position" value={position} title="Hero position used" />
        <ReceiptItem
          label="Hero behind"
          value={heroStack !== null ? `${heroStack} BB` : "Unknown"}
          onClick={onEditStacks}
          title={onEditStacks ? "Correct stacks or pot" : "Hero stack used"}
        />
        <ReceiptItem
          label="Opponent"
          value={opponent}
          onClick={onEditStacks}
          title={onEditStacks ? "Correct opponent stack" : "Opponent context used"}
        />
        <ReceiptItem
          label="Pot"
          value={potValue || "Unknown"}
          onClick={onEditStacks}
          title={onEditStacks ? "Correct stacks or pot" : "Pot used"}
        />
        <ReceiptItem
          label="Facing"
          value={facingLabel}
          onClick={onUndoAction}
          title={onUndoAction ? "Undo the latest recorded action to correct it" : "Action faced"}
        />
        <ReceiptItem label="Table" value={playerValue} title="Players live at the decision" />
        <ReceiptItem
          label="Price"
          value={potOdds !== null ? `${potOdds}% needed` : ""}
          tone="price"
          title="Raw equity required before range, ICM, bounty, and exploit adjustments"
        />
        <ReceiptItem
          label="Stage"
          value={receipt.tournamentStage ? titleCase(receipt.tournamentStage) : ""}
          title="Tournament stage used"
        />
        <ReceiptItem
          label="Format"
          value={formatValue}
          title="Game format and ante used"
        />
        <ReceiptItem
          label="Bounty"
          value={
            bountyEnabled ? `${bountyMeta.shortLabel} / qualitative` : ""
          }
          tone="bounty"
          title="Bounty context used; no bounty amount was supplied and raw pot odds were not changed"
        />
        <ReceiptItem
          label="Missing"
          value={missing.length ? `${missing.length} input${missing.length === 1 ? "" : "s"}` : ""}
          tone="warning"
          title={missing.join(", ")}
        />
        </div>
      </div>
    </details>
  );
}
