import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { __liveCoachTestables } from "../src/openaiService.js";

const completion = {
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
};

test("live Coach replaces an illegal model action with a legal fallback", () => {
  const result = __liveCoachTestables.buildResponse(
    {
      hero_action: "check",
      sizing: "",
      confidence: "high",
      reasoning: "Model attempted an illegal check.",
    },
    completion,
    "Fallback",
    "fold",
    ["fold", "call", "raise", "jam"],
  );
  assert.equal(result.hero_action, "fold");
  assert.ok(result.legal_actions.includes(result.hero_action));
});

test("live Coach preserves structured recommendation metadata", () => {
  const result = __liveCoachTestables.buildResponse(
    {
      hero_action: "call",
      sizing: "3 BB",
      sizing_bb: 3,
      confidence: "low",
      reasoning: "Position is unknown, so use the lower-confidence continue.",
      assumptions: ["opponent position unknown"],
      alternative_action: "fold",
      alternative_sizing: "",
      flavor_text: "Call cautiously.",
    },
    completion,
    "Fallback",
    "fold",
    ["fold", "call", "raise"],
  );
  assert.equal(result.hero_action, "call");
  assert.equal(result.confidence, "low");
  assert.equal(result.sizing_bb, 3);
  assert.deepEqual(result.assumptions, ["opponent position unknown"]);
  assert.equal(result.alternative_action, "fold");
  assert.equal(result.usage.total_tokens, 120);
});

test("Replay Analyst structured-output schema is strict and legal-action scoped", () => {
  const schema = __liveCoachTestables.liveDecisionResponseSchema([
    "fold",
    "call",
    "3-bet",
  ]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.hero_action.enum, ["fold", "call", "3-bet"]);
  assert.deepEqual(schema.properties.alternative_action.enum, [
    "fold",
    "call",
    "3-bet",
    "",
  ]);
  assert.ok(schema.required.includes("confidence"));
  assert.ok(schema.required.includes("sizing_bb"));
  assert.ok(schema.required.includes("reasoning"));
  assert.ok(schema.required.includes("assumptions"));
});

test("deep unopened late-position guidance preserves steal ranges", () => {
  const button = __liveCoachTestables.buildLivePreflopGuidance({
    street: "preflop",
    decisionNode: {
      street: "preflop",
      decisionKind: "unopened",
      heroSeat: "BTN",
      effectiveStackBB: 58,
    },
  });
  assert.equal(button.situation, "unopened_btn");
  assert.equal(button.depthBand, "deep");
  assert.match(button.baseline, /A3o/);
  assert.match(button.baseline, /wide first-in BTN steal/i);

  const cutoff = __liveCoachTestables.buildLivePreflopGuidance({
    street: "preflop",
    decisionNode: {
      street: "preflop",
      decisionKind: "unopened",
      heroSeat: "CO",
      effectiveStackBB: 42,
    },
  });
  assert.equal(cutoff.situation, "unopened_co");
  assert.match(cutoff.baseline, /A8o/);
});

test("deep blind-defense guidance respects late-position range and price", () => {
  const guidance = __liveCoachTestables.buildLivePreflopGuidance({
    street: "preflop",
    decisionNode: {
      street: "preflop",
      decisionKind: "facing_open",
      heroSeat: "BB",
      opponentSeat: "BTN",
      effectiveStackBB: 49,
      facingAction: {
        actorSeat: "BTN",
        toAmountBB: 2.2,
      },
    },
  });
  assert.equal(guidance.situation, "bb_defend_vs_late_open");
  assert.equal(guidance.facingSizeBB, 2.2);
  assert.match(guidance.baseline, /strong price/i);
  assert.match(guidance.baseline, /calls and selective 3-bets/i);
});

test("short-stack guidance does not inherit deep speculative calls", () => {
  const guidance = __liveCoachTestables.buildLivePreflopGuidance({
    street: "preflop",
    decisionNode: {
      street: "preflop",
      decisionKind: "facing_open",
      heroSeat: "BB",
      opponentSeat: "BTN",
      effectiveStackBB: 14,
    },
  });
  assert.equal(guidance.depthBand, "short");
  assert.match(guidance.baseline, /remove speculative deep-stack calls/i);
});

test("live Coach fallback remains position-aware when a model response is unusable", () => {
  assert.equal(
    __liveCoachTestables.liveCoachFallbackAction(
      ["fold", "open", "jam"],
      { situation: "unopened_btn" },
    ),
    "open",
  );
  assert.equal(
    __liveCoachTestables.liveCoachFallbackAction(
      ["fold", "call", "3-bet", "jam"],
      { situation: "bb_defend_vs_late_open" },
    ),
    "call",
  );
  assert.equal(
    __liveCoachTestables.liveCoachFallbackAction(
      ["fold", "call", "jam"],
      { situation: "facing_open", depthBand: "short" },
    ),
    "fold",
  );
});

test("preflop chart contract and example are valid JSON with matching versions", async () => {
  const base = new URL("../data/preflop-charts/", import.meta.url);
  const [schema, example] = await Promise.all([
    readFile(new URL("chart.schema.json", base), "utf8").then(JSON.parse),
    readFile(new URL("example.chart.json", base), "utf8").then(JSON.parse),
  ]);
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(example.schemaVersion, 1);
  assert.equal(example.game.tableSize, 8);
  assert.ok(Array.isArray(example.spots));
  assert.equal(example.source.includes("not strategy data"), true);
});
