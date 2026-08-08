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

test("Range Professor and Short-Stack Ninja share the strict live-decision contract", () => {
  for (const name of ["range_professor_decision", "short_stack_ninja_decision"]) {
    const config = __liveCoachTestables.structuredLiveDecisionConfig(
      ["fold", "call", "jam"],
      name,
    );
    assert.equal(config.responseSchemaName, name);
    assert.equal(config.responseSchema.additionalProperties, false);
    assert.deepEqual(config.responseSchema.properties.hero_action.enum, [
      "fold",
      "call",
      "jam",
    ]);
    assert.ok(config.responseSchema.required.includes("sizing_bb"));
    assert.ok(config.responseSchema.required.includes("confidence"));
    assert.ok(config.responseSchema.required.includes("reasoning"));
    assert.ok(config.responseSchema.required.includes("alternative_action"));
  }
});

test("incomplete persona responses preserve the structured UI shape", () => {
  const result = __liveCoachTestables.buildIncompleteLiveCoachResponse({
    flavorText: "Select hero cards.",
    reasoning: "Hole cards are required for range placement.",
    assumptions: ["hero_cards_missing"],
    legalActions: ["fold", "call", "jam"],
  });
  assert.equal(result.hero_action, "...");
  assert.equal(result.sizing_bb, null);
  assert.equal(result.confidence, "low");
  assert.equal(result.reasoning, "Hole cards are required for range placement.");
  assert.deepEqual(result.assumptions, ["hero_cards_missing"]);
  assert.deepEqual(result.legal_actions, ["fold", "call", "jam"]);
  assert.equal(result.alternative_action, null);
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

test("Cash Game Crusher rules cover range construction across the full hand lifecycle", () => {
  const rules = __liveCoachTestables.cashGameLifecycleRules;
  assert.match(rules, /linear monetary value/i);
  assert.match(rules, /no bubble, ladder, survival premium, or ICM/i);
  assert.match(rules, /rake/i);
  assert.match(rules, /Preflop:/);
  assert.match(rules, /Flop:/);
  assert.match(rules, /Turn:/);
  assert.match(rules, /River:/);
  assert.match(rules, /value region/i);
  assert.match(rules, /best bluff candidates/i);
  assert.match(rules, /Choose sizing for the range/i);
});

test("Cash Game Crusher fallback checks rather than auto-bets postflop", () => {
  assert.equal(
    __liveCoachTestables.cashGameFallbackAction({
      legalActions: ["check", "bet", "jam"],
    }),
    "check",
  );
});

test("Cash Game Crusher fallback folds a weak hand facing preflop aggression", () => {
  assert.equal(
    __liveCoachTestables.cashGameFallbackAction({
      legalActions: ["fold", "call", "3-bet", "jam"],
      preflopGuidance: { situation: "bb_defend_vs_late_open" },
      weakHandFacingPreflopAggression: true,
    }),
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
