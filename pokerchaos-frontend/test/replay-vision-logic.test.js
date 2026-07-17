import test from "node:test";
import assert from "node:assert/strict";
import {
  replayDetectionCards,
  validateReplayDetectionContinuity,
} from "../src/vision/replayVisionLogic.js";

function detection(hero, board = []) {
  return {
    recognized: true,
    heroCards: { card1: hero[0], card2: hero[1] },
    board: {
      flop: board.slice(0, 3),
      turn: board[3] || null,
      river: board[4] || null,
    },
  };
}

test("normalizes recognized cards into ordered Hero and board arrays", () => {
  assert.deepEqual(
    replayDetectionCards(detection(["as", "KD"], ["7H", "tc", "2s", "Qd"])),
    {
      heroCards: ["As", "Kd"],
      boardCards: ["7h", "Tc", "2s", "Qd"],
    },
  );
});

test("allows a board to grow while locking Hero and earlier streets", () => {
  const previous = detection(["As", "Kd"], ["7h", "Tc", "2s"]);
  const next = detection(["As", "Kd"], ["7h", "Tc", "2s", "Qd"]);
  assert.equal(validateReplayDetectionContinuity(previous, next).valid, true);
});

test("rejects a later misread of Hero or a locked board card", () => {
  const previous = detection(["As", "Kd"], ["7h", "Tc", "2s"]);
  assert.equal(
    validateReplayDetectionContinuity(
      previous,
      detection(["Ah", "Kd"], ["7h", "Tc", "2s", "Qd"]),
    ).valid,
    false,
  );
  assert.equal(
    validateReplayDetectionContinuity(
      previous,
      detection(["As", "Kd"], ["7h", "Jc", "2s", "Qd"]),
    ).valid,
    false,
  );
});

test("allows different Hero cards only for a confirmed preflop new hand", () => {
  const previous = detection(["As", "Kd"], ["7h", "Tc", "2s"]);
  const next = detection(["Qh", "Qc"]);
  assert.equal(
    validateReplayDetectionContinuity(previous, next, { newHandDetected: true }).valid,
    true,
  );
  assert.equal(
    validateReplayDetectionContinuity(previous, next).valid,
    false,
  );
});

test("allows an explicit manual rescan to correct previously accepted cards", () => {
  const previous = detection(["As", "Kd"], ["7h", "Tc", "2s"]);
  const corrected = detection(["Ah", "Kc"], ["7h", "Tc", "2s"]);
  assert.equal(
    validateReplayDetectionContinuity(previous, corrected).valid,
    false,
  );
  assert.equal(
    validateReplayDetectionContinuity(previous, corrected, {
      allowCorrection: true,
    }).valid,
    true,
  );
});
