import { createHash } from "node:crypto";

import { getStackDepthTag, sanitizeStudySpotTaxonomy } from "./taxonomy.js";

const VOLUNTARY_ACTIONS = new Set(["fold", "check", "call", "bet", "raise", "jam"]);
const AGGRESSIVE_ACTIONS = new Set(["bet", "raise", "jam"]);
const LATE_POSITIONS = new Set(["CO", "BTN", "SB"]);

function round(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function normalizedPosition(value) {
  const position = String(value || "").trim().toUpperCase();
  return ["UTG", "HJ", "CO", "BTN", "SB", "BB"].includes(position)
    ? position
    : "unknown";
}

function handKeyFor(hand) {
  const existing = String(hand?.handKey || hand?.handId || "").trim();
  if (existing) return existing;
  return createHash("sha1")
    .update(JSON.stringify(hand || {}))
    .digest("hex")
    .slice(0, 20);
}

function cardLabel(cards) {
  return Array.isArray(cards) && cards.length > 0 ? cards.join("") : "your hand";
}

function voluntaryActions(actions) {
  return (Array.isArray(actions) ? actions : []).filter((action) =>
    VOLUNTARY_ACTIONS.has(String(action?.type || "").toLowerCase()),
  );
}

function lastAggressor(actions, beforeIndex = Infinity) {
  const list = voluntaryActions(actions);
  let result = null;
  for (let index = 0; index < list.length && index < beforeIndex; index += 1) {
    if (AGGRESSIVE_ACTIONS.has(list[index].type)) result = list[index];
  }
  return result;
}

function actionPosition(hand, player) {
  const seat = (Array.isArray(hand?.seats) ? hand.seats : []).find(
    (item) => String(item?.player || "") === String(player || ""),
  );
  return normalizedPosition(seat?.position);
}

function effectiveStackBb(hand, villainName = null) {
  const bigBlind = Number(hand?.blinds?.bigBlind);
  const heroStack = Number(hand?.heroStack);
  if (!Number.isFinite(bigBlind) || bigBlind <= 0 || !Number.isFinite(heroStack)) {
    return null;
  }
  let stack = heroStack;
  if (villainName) {
    const villain = (Array.isArray(hand?.seats) ? hand.seats : []).find(
      (seat) => String(seat?.player || "") === String(villainName),
    );
    const villainStack = Number(villain?.chips);
    if (Number.isFinite(villainStack)) stack = Math.min(stack, villainStack);
  }
  return round(stack / bigBlind);
}

function compactBoard(board) {
  if (!board || typeof board !== "object") return [];
  return [
    ...(Array.isArray(board.flop) ? board.flop : []),
    ...(board.turn ? [board.turn] : []),
    ...(board.river ? [board.river] : []),
  ];
}

function candidateId(handKey, detector, street, sequence) {
  return `${handKey}:${street}:${detector}:${sequence}`;
}

function createCandidate(hand, definition) {
  const handKey = handKeyFor(hand);
  const stackDepthBb = effectiveStackBb(hand, definition.villainName);
  const taxonomy = sanitizeStudySpotTaxonomy({
    ...definition,
    stackDepthBb,
    heroPosition: normalizedPosition(hand?.heroPosition),
    villainPosition: actionPosition(hand, definition.villainName),
  });
  return {
    candidateId: candidateId(
      handKey,
      definition.detector,
      definition.street,
      definition.sequence,
    ),
    handKey,
    handId: String(hand?.handId || handKey),
    detector: definition.detector,
    street: definition.street,
    actionTaken: definition.actionTaken || null,
    type: taxonomy.type,
    category: taxonomy.category,
    tags: taxonomy.tags,
    title: definition.title,
    summary: definition.summary,
    whyStudyThis: definition.whyStudyThis,
    confidence: definition.confidence,
    strategicImportance: definition.strategicImportance,
    severity: definition.severity,
    stackDepthBb,
    stackDepthTag: taxonomy.stackDepthTag,
    heroPosition: taxonomy.heroPosition,
    villainPosition: taxonomy.villainPosition,
    opponentType: "unknown",
    handContext: {
      handId: String(hand?.handId || handKey),
      heroCards: Array.isArray(hand?.heroCards) ? hand.heroCards : [],
      board: compactBoard(hand?.board),
      heroPosition: taxonomy.heroPosition,
      villainPosition: taxonomy.villainPosition,
      stackDepthBb,
      actionTaken: definition.actionTaken || null,
      street: definition.street,
      evidence: definition.evidence || {},
    },
  };
}

function extractPreflopCandidates(hand) {
  const actions = voluntaryActions(hand?.actionsByStreet?.preflop);
  const heroName = String(hand?.heroName || "Hero");
  const heroIndex = actions.findIndex((action) => action.player === heroName);
  if (heroIndex < 0) return [];
  const heroAction = actions[heroIndex];
  const beforeHero = actions.slice(0, heroIndex);
  const aggressor = lastAggressor(beforeHero);
  const priorRaises = beforeHero.filter((action) => AGGRESSIVE_ACTIONS.has(action.type));
  const priorCalls = beforeHero.filter((action) => action.type === "call");
  const heroPosition = normalizedPosition(hand?.heroPosition);
  const cards = cardLabel(hand?.heroCards);
  const bigBlind = Number(hand?.blinds?.bigBlind);
  const openSizeBb = aggressor && bigBlind > 0
    ? round(Number(aggressor.toAmount || aggressor.amount) / bigBlind)
    : null;
  const candidates = [];

  if (heroAction.type === "fold" && heroPosition === "BB" && aggressor) {
    const villainPosition = actionPosition(hand, aggressor.player);
    candidates.push(
      createCandidate(hand, {
        detector: "bb_fold_vs_open",
        street: "preflop",
        sequence: heroIndex,
        actionTaken: "fold",
        villainName: aggressor.player,
        type: "close_decision",
        category: villainPosition === "SB" ? "blind-vs-blind" : "preflop",
        tags: villainPosition === "SB" ? ["bb-defence"] : ["big-blind-defence"],
        title: "Big Blind Defence",
        summary: `You folded ${cards} in the big blind${openSizeBb ? ` against a ${openSizeBb}x open` : " against an open"}.`,
        whyStudyThis:
          "Blind defence decisions repeat often and small frequency errors can compound across a tournament.",
        confidence: 0.72,
        strategicImportance: 0.76,
        severity: 0.48,
        evidence: { openSizeBb, openerPosition: villainPosition },
      }),
    );
  }

  if (
    heroAction.type === "fold" &&
    beforeHero.length === 0 &&
    LATE_POSITIONS.has(heroPosition)
  ) {
    candidates.push(
      createCandidate(hand, {
        detector: "late_position_first_in_fold",
        street: "preflop",
        sequence: heroIndex,
        actionTaken: "fold",
        type: "missed_opportunity",
        category: heroPosition === "SB" ? "blind-vs-blind" : "preflop",
        tags: heroPosition === "SB" ? ["sb-open"] : ["opening"],
        title: "Late-position opening opportunity",
        summary: `You folded ${cards} first in from ${heroPosition}.`,
        whyStudyThis:
          "Late-position first-in decisions are useful checkpoints for whether opening ranges match stack depth and table context.",
        confidence: 0.58,
        strategicImportance: 0.62,
        severity: 0.35,
        evidence: { firstIn: true },
      }),
    );
  }

  if (["raise", "jam"].includes(heroAction.type) && aggressor) {
    const stackBb = effectiveStackBb(hand, aggressor.player);
    const isReshove = heroAction.type === "jam" && stackBb !== null && stackBb <= 25;
    const isSqueeze = priorCalls.length > 0;
    candidates.push(
      createCandidate(hand, {
        detector: isReshove ? "short_stack_reshove" : isSqueeze ? "squeeze" : "three_bet",
        street: "preflop",
        sequence: heroIndex,
        actionTaken: heroAction.type,
        villainName: aggressor.player,
        type: "interesting_spot",
        category: "preflop",
        tags: isReshove ? ["reshove", "short-stack"] : isSqueeze ? ["squeeze", "3bet"] : ["3bet"],
        title: isReshove ? "Reshove pressure" : isSqueeze ? "Squeeze decision" : "Three-bet decision",
        summary: `You ${heroAction.type === "jam" ? "moved all-in" : "re-raised"} with ${cards} after preflop aggression.`,
        whyStudyThis:
          "Re-raise decisions combine range strength, fold equity, position, and effective stack depth.",
        confidence: 0.76,
        strategicImportance: isReshove ? 0.9 : 0.78,
        severity: 0.55,
        evidence: { priorRaiseCount: priorRaises.length, priorCallCount: priorCalls.length },
      }),
    );
  }

  return candidates;
}

function extractPostflopCandidates(hand) {
  const heroName = String(hand?.heroName || "Hero");
  const preflop = voluntaryActions(hand?.actionsByStreet?.preflop);
  const preflopAggressor = lastAggressor(preflop);
  const heroWasPreflopAggressor = preflopAggressor?.player === heroName;
  const cards = cardLabel(hand?.heroCards);
  const candidates = [];

  for (const street of ["flop", "turn", "river"]) {
    const actions = voluntaryActions(hand?.actionsByStreet?.[street]);
    const heroIndices = actions
      .map((action, index) => ({ action, index }))
      .filter((item) => item.action.player === heroName);
    for (const { action, index } of heroIndices) {
      const beforeHero = actions.slice(0, index);
      const facingAggressor = lastAggressor(beforeHero);
      if (street === "flop" && heroWasPreflopAggressor && ["check", "bet"].includes(action.type)) {
        const checked = action.type === "check";
        candidates.push(
          createCandidate(hand, {
            detector: checked ? "missed_flop_cbet" : "flop_cbet",
            street,
            sequence: index,
            actionTaken: action.type,
            type: checked ? "close_decision" : "interesting_spot",
            category: "postflop",
            tags: ["cbet"],
            title: "Continuation betting",
            summary: `After taking the lead preflop with ${cards}, you ${checked ? "checked" : "bet"} the flop.`,
            whyStudyThis:
              "Continuation-bet decisions depend on how the board interacts with both ranges, not on initiative alone.",
            confidence: 0.7,
            strategicImportance: 0.7,
            severity: checked ? 0.4 : 0.3,
            evidence: { heroWasPreflopAggressor: true, facingBet: Boolean(facingAggressor) },
          }),
        );
      }

      if (
        street === "flop" &&
        !heroWasPreflopAggressor &&
        ["check", "bet"].includes(action.type) &&
        ["CO", "BTN"].includes(normalizedPosition(hand?.heroPosition)) &&
        beforeHero.length > 0 &&
        beforeHero.every((item) => item.type === "check")
      ) {
        const checked = action.type === "check";
        candidates.push(
          createCandidate(hand, {
            detector: checked ? "flop_stab_check_back" : "flop_stab",
            street,
            sequence: index,
            actionTaken: action.type,
            type: "close_decision",
            category: "postflop",
            tags: ["probe"],
            title: "Flop stab decision",
            summary: `After the action checked to you, you ${checked ? "checked back" : "bet"} the flop with ${cards}.`,
            whyStudyThis:
              "When the preflop aggressor checks, position, board texture, and range interaction determine whether a stab is useful.",
            confidence: 0.66,
            strategicImportance: 0.69,
            severity: 0.36,
            evidence: { checkedToHero: true, heroWasPreflopAggressor: false },
          }),
        );
      }

      if (street === "turn" && action.type === "bet") {
        const flopHeroActions = voluntaryActions(hand?.actionsByStreet?.flop).filter(
          (item) => item.player === heroName,
        );
        const checkedFlop = flopHeroActions.some((item) => item.type === "check");
        const isDelayedCbet = heroWasPreflopAggressor && checkedFlop;
        const isProbe = !heroWasPreflopAggressor;
        candidates.push(
          createCandidate(hand, {
            detector: isProbe ? "turn_probe" : isDelayedCbet ? "delayed_cbet" : "turn_barrel",
            street,
            sequence: index,
            actionTaken: "bet",
            type: "interesting_spot",
            category: "postflop",
            tags: [isProbe ? "probe" : isDelayedCbet ? "delayed-cbet" : "turn-barrel"],
            title: isProbe ? "Turn probe" : isDelayedCbet ? "Delayed continuation bet" : "Turn barrel",
            summary: `You bet the turn with ${cards}${isProbe ? " without holding the preflop initiative" : isDelayedCbet ? " after checking the flop" : " after betting earlier"}.`,
            whyStudyThis:
              "Turn aggression is a useful study point because range advantage and fold equity can change sharply with the new card.",
            confidence: 0.67,
            strategicImportance: 0.74,
            severity: 0.42,
            evidence: { checkedFlop, heroWasPreflopAggressor },
          }),
        );
      }

      if (
        street === "river" &&
        ["call", "fold"].includes(action.type) &&
        facingAggressor
      ) {
        candidates.push(
          createCandidate(hand, {
            detector: "river_facing_bet",
            street,
            sequence: index,
            actionTaken: action.type,
            villainName: facingAggressor.player,
            type: "close_decision",
            category: "postflop",
            tags: ["river", "bluff-catch"],
            title: "River bluff-catching decision",
            summary: `You ${action.type === "call" ? "called" : "folded"} ${cards} when facing a river bet.`,
            whyStudyThis:
              "River calls and folds concentrate range, sizing, blocker, and opponent assumptions into one decision.",
            confidence: 0.78,
            strategicImportance: 0.86,
            severity: 0.52,
            evidence: { facingBet: true },
          }),
        );
      }

      if (action.type === "raise" && beforeHero.some((item) => item.type === "check" && item.player === heroName)) {
        candidates.push(
          createCandidate(hand, {
            detector: "check_raise",
            street,
            sequence: index,
            actionTaken: "raise",
            villainName: facingAggressor?.player,
            type: "interesting_spot",
            category: "postflop",
            tags: ["check-raise"],
            title: `${street[0].toUpperCase()}${street.slice(1)} check-raise`,
            summary: `You check-raised ${cards} on the ${street}.`,
            whyStudyThis:
              "Check-raises materially reshape both ranges and are valuable nodes for reviewing value, draws, and bluff construction.",
            confidence: 0.82,
            strategicImportance: 0.84,
            severity: 0.46,
            evidence: { facingBet: Boolean(facingAggressor) },
          }),
        );
      }
    }
  }

  return candidates;
}

export function extractStudySpotCandidates(hands, { maxCandidates = 20 } = {}) {
  const byId = new Map();
  for (const hand of Array.isArray(hands) ? hands : []) {
    if (String(hand?.gameType || "tournament").toLowerCase() !== "tournament") continue;
    const handCandidates = [
      ...extractPreflopCandidates(hand),
      ...extractPostflopCandidates(hand),
    ]
      .sort(
        (a, b) =>
          b.strategicImportance - a.strategicImportance ||
          b.confidence - a.confidence,
      )
      .slice(0, 2);
    for (const candidate of handCandidates) byId.set(candidate.candidateId, candidate);
  }

  return Array.from(byId.values())
    .sort(
      (a, b) =>
        b.strategicImportance - a.strategicImportance ||
        b.confidence - a.confidence ||
        a.candidateId.localeCompare(b.candidateId),
    )
    .slice(0, Math.max(1, Math.min(50, Number(maxCandidates) || 20)));
}
