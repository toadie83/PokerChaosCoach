import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { __liveCoachTestables } from "../src/openaiService.js";

const completion = {
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
};

test("GPT-5.6 Luna is the default coaching model while replay vision stays pinned", () => {
  assert.equal(__liveCoachTestables.defaultModel, "gpt-5.6-luna");
  assert.equal(__liveCoachTestables.defaultVisionModel, "gpt-4.1-mini");
  assert.ok(__liveCoachTestables.allowedModels.has("gpt-5.6-luna"));
  assert.ok(__liveCoachTestables.allowedModels.has("gpt-4.1-mini"));
  assert.ok(
    __liveCoachTestables.allowedModelSelections.has("gpt-5.6-luna-fast"),
  );
  assert.equal(__liveCoachTestables.allowedVisionModels.has("gpt-5.6-luna"), false);
});

test("GPT-5.6 requests use explicit low reasoning and compatible token controls", () => {
  const request = __liveCoachTestables.buildChatCompletionRequest({
    system: "system",
    user: "user",
    temperature: 0.2,
    top_p: 0.7,
    max_tokens: 320,
    model: "gpt-5.6-luna",
  });

  assert.equal(request.model, "gpt-5.6-luna");
  assert.equal(request.reasoning_effort, "low");
  assert.equal(request.max_completion_tokens, 576);
  assert.equal("temperature" in request, false);
  assert.equal("top_p" in request, false);
  assert.equal("max_tokens" in request, false);
  assert.equal("service_tier" in request, false);
});

test("Luna Fast selection uses the Luna model with Fast service tier", () => {
  const request = __liveCoachTestables.buildChatCompletionRequest({
    system: "system",
    user: "user",
    max_tokens: 320,
    model: "gpt-5.6-luna-fast",
  });

  assert.equal(request.model, "gpt-5.6-luna");
  assert.equal(request.service_tier, "fast");
  assert.equal(request.reasoning_effort, "low");
  assert.equal(request.max_completion_tokens, 576);
});

test("GPT-4.1 mini remains selectable with its existing request controls", () => {
  const request = __liveCoachTestables.buildChatCompletionRequest({
    system: "system",
    user: "user",
    temperature: 0.2,
    top_p: 0.7,
    max_tokens: 320,
    model: "gpt-4.1-mini",
  });

  assert.equal(request.model, "gpt-4.1-mini");
  assert.equal(request.temperature, 0.2);
  assert.equal(request.top_p, 0.7);
  assert.equal(request.max_tokens, 320);
  assert.equal("reasoning_effort" in request, false);
  assert.equal("max_completion_tokens" in request, false);
});

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

test("ace-high flush safety rejects a generic fallback fold", () => {
  const context = {
    street: "turn",
    heroCards: { card1: "As", card2: "Js" },
    board: { flop: ["Ks", "4s", "3s"], turn: "7c", river: null },
    decisionNode: {
      street: "turn",
      legalActions: ["fold", "call", "raise", "jam"],
      facingAction: {
        type: "raise",
        actorSeat: "SB",
        toAmountBB: 12,
        callAmountBB: 6,
      },
      potOdds: {
        requiredEquityPct: 18,
        callAmountBB: 6,
        potBeforeCallBB: 27.4,
        potAfterCallBB: 33.4,
      },
    },
  };

  const protectedFlush =
    __liveCoachTestables.protectedAceHighFlush(context);
  assert.equal(protectedFlush.suit, "s");

  const result = __liveCoachTestables.buildResponse(
    null,
    completion,
    "Balance range discipline.",
    "fold",
    context.decisionNode.legalActions,
    context,
  );

  assert.equal(result.hero_action, "call");
  assert.equal(result.sizing_bb, 6);
  assert.equal(result.safety_override, "protected_ace_high_flush");
  assert.match(result.reasoning, /ace-high spades flush/i);
  assert.notEqual(result.flavor_text, "Balance range discipline.");
});

test("ace-high flush safety also rejects an explicit model fold", () => {
  const context = {
    street: "turn",
    heroCards: { card1: "As", card2: "Js" },
    board: { flop: ["Ks", "4s", "3s"], turn: "7c" },
    decisionNode: {
      street: "turn",
      legalActions: ["fold", "call", "raise"],
      facingAction: { type: "raise", callAmountBB: 6 },
      potOdds: { requiredEquityPct: 18, callAmountBB: 6 },
    },
  };
  const result = __liveCoachTestables.buildResponse(
    {
      hero_action: "fold",
      sizing: "",
      confidence: "medium",
      flavor_text: "Fold to the raise.",
      reasoning: "Villain represents strength.",
      assumptions: [],
      alternative_action: "call",
      alternative_sizing: "6 BB",
    },
    completion,
    "Fallback",
    "fold",
    context.decisionNode.legalActions,
    context,
  );

  assert.equal(result.hero_action, "call");
  assert.equal(result.safety_override, "protected_ace_high_flush");
});

test("ace-high flush safety remains scoped away from paired boards", () => {
  const context = {
    street: "turn",
    heroCards: { card1: "As", card2: "Js" },
    board: { flop: ["Ks", "4s", "3s"], turn: "Kc" },
    decisionNode: {
      street: "turn",
      legalActions: ["fold", "call", "raise"],
      facingAction: { type: "raise", callAmountBB: 6 },
    },
  };
  const result = __liveCoachTestables.buildResponse(
    null,
    completion,
    "Fallback",
    "fold",
    context.decisionNode.legalActions,
    context,
  );

  assert.equal(__liveCoachTestables.protectedAceHighFlush(context), null);
  assert.equal(result.hero_action, "fold");
  assert.equal(result.safety_override, undefined);
});

test("hand evaluator does not mislabel a flush plus unrelated straight as a straight flush", () => {
  const features = __liveCoachTestables.describeHandFeatures(
    { card1: "As", card2: "Js" },
    { flop: ["Ks", "4s", "3s"], turn: "7c" },
  );

  assert.equal(features.category, "flush");
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

test("selected tournament stage guidance is active only for non-auto MTT contexts", () => {
  const bubble = __liveCoachTestables.selectedTournamentStageGuidance({
    tournamentStage: "bubble_pressure",
    gameType: "tournament",
    heroStackBB: 22,
    villainStackBB: 40,
    decisionNode: {
      gameType: "tournament",
      startingHeroStackBB: 22,
      startingOpponentStackBB: 40,
    },
  });
  assert.equal(bubble.code, "bubble_pressure");
  assert.equal(bubble.coverageRole, "covered_by_villain");
  assert.match(bubble.postflopAdjustment, /bluff-catches/i);

  assert.equal(
    __liveCoachTestables.selectedTournamentStageGuidance({
      tournamentStage: "auto",
      gameType: "tournament",
      decisionNode: { gameType: "tournament" },
    }),
    null,
  );
  assert.equal(
    __liveCoachTestables.selectedTournamentStageGuidance({
      tournamentStage: "late_endgame",
      gameType: "cash",
      decisionNode: { gameType: "cash" },
    }),
    null,
  );
});

test("tournament lifecycle rules separate stage, stack depth, calls, and pot control", () => {
  const rules = __liveCoachTestables.tournamentStageLifecycleRules;
  assert.match(rules, /Stack depth and tournament stage are independent/i);
  assert.match(rules, /calls, defenses, and stack-threatening continues/i);
  assert.match(rules, /Pot control is not monotonic/i);
  assert.match(rules, /Cash decisions never use bubble/i);
});

test("every tournament live persona receives the central stage lens while cash stays isolated", async () => {
  const source = await readFile(new URL("../src/openaiService.js", import.meta.url), "utf8");
  const functionBody = (name, nextName) => {
    const start = source.indexOf(`async function ${name}`);
    const end = nextName
      ? source.indexOf(`async function ${nextName}`, start + 1)
      : source.length;
    assert.ok(start >= 0, `${name} should exist`);
    assert.ok(end > start, `${name} should have a readable function body`);
    return source.slice(start, end);
  };

  const replay = functionBody("runReplayAnalyst", "runChaosCoach");
  const chaos = functionBody("runChaosCoach", "runCashGameCrusher");
  const cash = functionBody("runCashGameCrusher", "runExploitDetective");
  const exploit = functionBody("runExploitDetective", "runShortStackNinja");
  const short = functionBody("runShortStackNinja", "runRangeProfessor");
  const range = functionBody("runRangeProfessor");

  for (const body of [replay, chaos, exploit, short, range]) {
    assert.match(body, /selectedTournamentStageGuidance\(context\)/);
    assert.match(body, /TOURNAMENT_STAGE_LIFECYCLE_RULES/);
    assert.match(body, /stageLens/);
  }
  assert.doesNotMatch(cash, /selectedTournamentStageGuidance/);
  assert.doesNotMatch(cash, /TOURNAMENT_STAGE_LIFECYCLE_RULES/);
  assert.doesNotMatch(range, /accumulate chips early/i);
});

test("selected bounty guidance is tournament-only and coverage-aware", () => {
  const guidance = __liveCoachTestables.selectedBountyTournamentGuidance({
    bountyMode: "standard_ko",
    gameType: "tournament",
    heroStackBB: 30,
    villainStackBB: 9,
    decisionNode: {
      gameType: "tournament",
      bountyMode: "standard_ko",
      startingHeroStackBB: 30,
      startingOpponentStackBB: 9,
      playersInHand: 2,
      playersYetToActCount: 0,
      facingAction: { type: "jam", allIn: true },
    },
  });
  assert.equal(guidance.coverageRole, "covers_villain");
  assert.equal(guidance.directKnockoutOpportunity, true);
  assert.equal(guidance.amountKnown, false);

  assert.equal(
    __liveCoachTestables.selectedBountyTournamentGuidance({
      bountyMode: "progressive_ko",
      gameType: "cash",
      decisionNode: { gameType: "cash" },
    }),
    null,
  );
});

test("every tournament live persona receives bounty rules while cash stays isolated", async () => {
  const source = await readFile(new URL("../src/openaiService.js", import.meta.url), "utf8");
  const functionBody = (name, nextName) => {
    const start = source.indexOf(`async function ${name}`);
    const end = nextName
      ? source.indexOf(`async function ${nextName}`, start + 1)
      : source.length;
    assert.ok(start >= 0, `${name} should exist`);
    assert.ok(end > start, `${name} should have a readable function body`);
    return source.slice(start, end);
  };

  const replay = functionBody("runReplayAnalyst", "runChaosCoach");
  const chaos = functionBody("runChaosCoach", "runCashGameCrusher");
  const cash = functionBody("runCashGameCrusher", "runExploitDetective");
  const exploit = functionBody("runExploitDetective", "runShortStackNinja");
  const short = functionBody("runShortStackNinja", "runRangeProfessor");
  const range = functionBody("runRangeProfessor");

  for (const body of [replay, chaos, exploit, short, range]) {
    assert.match(body, /selectedBountyTournamentGuidance\(context\)/);
    assert.match(body, /BOUNTY_TOURNAMENT_LIFECYCLE_RULES/);
    assert.match(body, /bountyLens/);
  }
  assert.doesNotMatch(cash, /selectedBountyTournamentGuidance/);
  assert.doesNotMatch(cash, /BOUNTY_TOURNAMENT_LIFECYCLE_RULES/);
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

test("cold open plus 3-bet guidance keeps both villains live", () => {
  const guidance = __liveCoachTestables.buildLivePreflopGuidance({
    street: "preflop",
    decisionNode: {
      street: "preflop",
      decisionKind: "facing_open_and_3bet",
      heroSeat: "BTN",
      opponentSeat: "CO",
      effectiveStackBB: 42,
      heroMaximumExposureBB: 50,
      playersYetToActSeats: ["SB", "BB"],
      playersYetToActCount: 2,
      facingAction: {
        type: "3-bet",
        actorSeat: "CO",
        initialOpenAmountBB: 2.2,
        initialOpenerSeat: "HJ",
        toAmountBB: 7,
        openerStillActive: true,
      },
    },
  });

  assert.equal(guidance.situation, "cold_3bet_two_villains");
  assert.equal(guidance.initialOpenAmountBB, 2.2);
  assert.equal(guidance.initialOpenerSeat, "HJ");
  assert.match(guidance.baseline, /Hero did not make the original raise/i);
  assert.match(guidance.baseline, /initial opener remains active/i);
  assert.match(guidance.baseline, /SB and BB also remain behind/i);
  assert.match(guidance.baseline, /continue substantially tighter/i);
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

test("short opener guidance preserves Hero exposure to players behind", () => {
  const guidance = __liveCoachTestables.buildLivePreflopGuidance({
    street: "preflop",
    decisionNode: {
      street: "preflop",
      decisionKind: "facing_open",
      heroSeat: "BTN",
      opponentSeat: "CO",
      effectiveStackBB: 13,
      heroMaximumExposureBB: 50,
      playersYetToActSeats: ["SB", "BB"],
      playersYetToActCount: 2,
      strategicRestrictions: [
        {
          action: "jam",
          code: "short_opener_players_behind_overjam",
          reason: "Players behind remain live.",
        },
      ],
      facingAction: {
        actorSeat: "CO",
        toAmountBB: 2,
      },
    },
  });

  assert.equal(guidance.situation, "short_opener_players_behind_overjam");
  assert.equal(guidance.heroMaximumExposureBB, 50);
  assert.deepEqual(guidance.playersYetToActSeats, ["SB", "BB"]);
  assert.match(guidance.baseline, /short effective stack applies only against the opener/i);
  assert.match(guidance.baseline, /normal non-all-in 3-bet/i);
  assert.match(guidance.baseline, /cold 4-bet\/reshove/i);
});

test("players-behind preflop fallback selects a reversible continue", () => {
  assert.equal(
    __liveCoachTestables.liveCoachFallbackAction(
      ["fold", "call", "3-bet"],
      { situation: "short_opener_players_behind_overjam" },
    ),
    "call",
  );
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

test("20 BB BTN fallback uses the exact RFI anchor instead of folding", () => {
  const context = {
    street: "preflop",
    gameType: "tournament",
    heroCards: { card1: "As", card2: "3h" },
    openSizeBB: 2.2,
    decisionNode: {
      street: "preflop",
      gameType: "tournament",
      tableSize: 8,
      decisionKind: "unopened",
      heroSeat: "BTN",
      effectiveStackBB: 20,
      legalActions: ["fold", "open", "jam"],
      heroCards: ["As", "3h"],
    },
  };
  const guidance = __liveCoachTestables.buildLivePreflopGuidance(context);
  const fallback = __liveCoachTestables.liveCoachFallbackAction(
    context.decisionNode.legalActions,
    guidance,
  );
  const result = __liveCoachTestables.buildResponse(
    null,
    completion,
    "Balance range discipline.",
    fallback,
    context.decisionNode.legalActions,
    context,
  );

  assert.equal(guidance.deterministicAnchor.handCode, "A3o");
  assert.equal(fallback, "open");
  assert.equal(result.hero_action, "open");
  assert.equal(result.sizing_bb, 2.2);
  assert.equal(result.fallback_source, "live_preflop_anchor");
  assert.match(result.reasoning, /inside the conservative BTN first-in/i);
});

test("20 BB BB fallback preserves a priced Q9s defense", () => {
  const context = {
    street: "preflop",
    gameType: "tournament",
    heroCards: { card1: "Qs", card2: "9s" },
    decisionNode: {
      street: "preflop",
      gameType: "tournament",
      tableSize: 8,
      decisionKind: "facing_open",
      heroSeat: "BB",
      opponentSeat: "BTN",
      effectiveStackBB: 20,
      legalActions: ["fold", "call", "3-bet", "jam"],
      heroCards: ["Qs", "9s"],
      facingAction: {
        type: "open",
        actorSeat: "BTN",
        toAmountBB: 2.2,
        callAmountBB: 1.2,
      },
    },
  };
  const guidance = __liveCoachTestables.buildLivePreflopGuidance(context);
  const fallback = __liveCoachTestables.liveCoachFallbackAction(
    context.decisionNode.legalActions,
    guidance,
  );
  const result = __liveCoachTestables.buildResponse(
    null,
    completion,
    "Balance range discipline.",
    fallback,
    context.decisionNode.legalActions,
    context,
  );

  assert.equal(fallback, "call");
  assert.equal(result.hero_action, "call");
  assert.equal(result.sizing_bb, 1.2);
  assert.equal(result.fallback_source, "live_preflop_anchor");
});

test("selective SB blocker fallback produces a coherent 3-bet size", () => {
  const context = {
    street: "preflop",
    gameType: "tournament",
    heroCards: { card1: "As", card2: "4s" },
    decisionNode: {
      street: "preflop",
      gameType: "tournament",
      tableSize: 8,
      decisionKind: "facing_open",
      heroSeat: "SB",
      opponentSeat: "BTN",
      effectiveStackBB: 40,
      maxHeroTotalToBB: 40,
      legalActions: ["fold", "call", "3-bet", "jam"],
      heroCards: ["As", "4s"],
      facingAction: {
        type: "open",
        actorSeat: "BTN",
        toAmountBB: 2.2,
        callAmountBB: 1.7,
      },
    },
  };
  const guidance = __liveCoachTestables.buildLivePreflopGuidance(context);
  const fallback = __liveCoachTestables.liveCoachFallbackAction(
    context.decisionNode.legalActions,
    guidance,
  );
  const result = __liveCoachTestables.buildResponse(
    null,
    completion,
    "Fallback",
    fallback,
    context.decisionNode.legalActions,
    context,
  );

  assert.equal(fallback, "3-bet");
  assert.equal(result.hero_action, "3-bet");
  assert.equal(result.sizing_bb, 7.7);
  assert.equal(result.fallback_source, "live_preflop_anchor");
});

test("structural range labels no longer call suited aces or small pairs trash", () => {
  assert.notEqual(
    __liveCoachTestables.categorizeRangeHand("As4s").tier,
    "trash",
  );
  assert.notEqual(
    __liveCoachTestables.categorizeRangeHand("4s4h").tier,
    "trash",
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
