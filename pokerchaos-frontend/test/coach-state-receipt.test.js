import assert from "node:assert/strict";
import test from "node:test";

import { buildCoachStateReceipt } from "../src/lib/coachStateReceipt.js";

test("captures the exact decision state sent to Coach", () => {
  const payload = {
    context: {
      street: "turn",
      tableSize: 8,
      persona: "range_professor",
      tournamentStage: "post_bubble",
      bountyMode: "progressive_ko",
      villainType: "loose_passive",
      anteBB: 0.15,
      heroCards: { card1: "kh", card2: "QH" },
      decisionNode: {
        street: "turn",
        heroSeat: "UTG",
        opponentSeat: "BTN",
        relativePosition: "oop",
        playersLiveAtDecision: 2,
        playersYetToActSeats: [],
        gameType: "tournament",
        potBB: 31.73,
        heroStackBehindBB: 16.35,
        opponentStackBehindBB: 42.2,
        effectiveStackBB: 16.35,
        spr: 0.52,
        heroCards: ["Kh", "Qh"],
        boardCards: ["6c", "9h", "3h", "Ts"],
        facingAction: {
          type: "jam",
          actorSeat: "BTN",
          amountBB: 16.35,
          toAmountBB: 16.35,
          callAmountBB: 16.35,
          allIn: true,
        },
        potOdds: {
          requiredEquityPct: 34,
          callAmountBB: 16.35,
          potBeforeCallBB: 31.73,
          potAfterCallBB: 48.08,
        },
        missingInformation: ["BTN exact range is unknown"],
      },
    },
  };

  const receipt = buildCoachStateReceipt(payload, 1234);

  assert.equal(receipt.capturedAt, 1234);
  assert.equal(receipt.street, "turn");
  assert.deepEqual(receipt.heroCards, ["Kh", "Qh"]);
  assert.deepEqual(receipt.boardCards, ["6c", "9h", "3h", "Ts"]);
  assert.equal(receipt.heroSeat, "UTG");
  assert.equal(receipt.opponentSeat, "BTN");
  assert.equal(receipt.heroStackBehindBB, 16.35);
  assert.equal(receipt.opponentStackBehindBB, 42.2);
  assert.equal(receipt.potBB, 31.73);
  assert.equal(receipt.anteBB, 0.15);
  assert.equal(receipt.persona, "range_professor");
  assert.equal(receipt.villainType, "loose_passive");
  assert.equal(receipt.bountyMode, "progressive_ko");
  assert.equal(receipt.facingAction.allIn, true);
  assert.equal(receipt.potOdds.requiredEquityPct, 34);
});

test("receipt remains unchanged when the live request payload later changes", () => {
  const payload = {
    context: {
      heroCards: { card1: "As", card2: "Kd" },
      decisionNode: {
        heroCards: ["As", "Kd"],
        boardCards: ["8h", "7c", "2d"],
        playersYetToActSeats: ["SB", "BB"],
      },
    },
  };
  const receipt = buildCoachStateReceipt(payload, 1);

  payload.context.decisionNode.heroCards[0] = "2c";
  payload.context.decisionNode.boardCards.push("Jh");
  payload.context.decisionNode.playersYetToActSeats.length = 0;

  assert.deepEqual(receipt.heroCards, ["As", "Kd"]);
  assert.deepEqual(receipt.boardCards, ["8h", "7c", "2d"]);
  assert.deepEqual(receipt.playersYetToActSeats, ["SB", "BB"]);
});

test("missing facing-action amounts remain absent instead of becoming a zero open", () => {
  const receipt = buildCoachStateReceipt({
    context: {
      street: "turn",
      decisionNode: {
        street: "turn",
        facingAction: {
          type: "raise",
          actorSeat: "SB",
          amountBB: null,
          toAmountBB: 12,
          callAmountBB: 6,
          allIn: false,
        },
      },
    },
  });

  assert.equal(receipt.facingAction.amountBB, null);
  assert.equal(receipt.facingAction.initialOpenAmountBB, null);
  assert.equal(receipt.facingAction.toAmountBB, 12);
  assert.equal(receipt.facingAction.callAmountBB, 6);
});
