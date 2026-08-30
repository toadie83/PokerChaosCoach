import assert from "node:assert/strict";
import test from "node:test";

import {
  COACH_MODEL_OPTIONS,
  DEFAULT_COACH_MODEL,
  FAST_LUNA_COACH_MODEL,
} from "../src/config/modelConfig.js";
import { initialState, summarizeForAI } from "../src/state/machine.js";

test("GPT-5.6 Luna is the default and GPT-4.1 mini remains selectable", () => {
  assert.equal(DEFAULT_COACH_MODEL, "gpt-5.6-luna");
  assert.equal(initialState.model, DEFAULT_COACH_MODEL);
  assert.equal(COACH_MODEL_OPTIONS[0].code, DEFAULT_COACH_MODEL);
  assert.ok(
    COACH_MODEL_OPTIONS.some((option) => option.code === "gpt-4.1-mini"),
  );
  assert.ok(
    COACH_MODEL_OPTIONS.some(
      (option) =>
        option.code === FAST_LUNA_COACH_MODEL &&
        /Fast/.test(option.label) &&
        /2× price/.test(option.label),
    ),
  );
});

test("AI snapshots fall back to GPT-5.6 Luna when a state has no model", () => {
  const snapshot = summarizeForAI({ ...initialState, model: "" });
  assert.equal(snapshot.context.model, DEFAULT_COACH_MODEL);
});
