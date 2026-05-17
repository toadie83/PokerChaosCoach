import { z } from "zod";

const STREETS = ["preflop", "flop", "turn", "river"];
const DECISION_ACTIONS = new Set(["fold", "check", "call", "bet", "raise", "jam"]);
const CONTRIBUTION_ACTIONS = new Set([
  "post_ante",
  "post_small_blind",
  "post_big_blind",
  "call",
  "bet",
  "raise",
  "jam",
]);
const AGGRESSIVE_ACTIONS = new Set(["bet", "raise", "jam"]);
const LEGAL_ACTIONS = ["check", "bet", "call", "fold", "raise"];

const cardSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);
const handStateSchema = z.object({
  street: z.enum(STREETS),
  heroPosition: z.string(),
  heroHand: z.array(cardSchema).max(2),
  effectiveStackBB: z.number().nonnegative().nullable(),
  potSize: z.number().nonnegative().nullable(),
  facingBet: z.number().nonnegative().nullable(),
  legalActions: z.array(z.enum(LEGAL_ACTIONS)),
  heroCanRaise: z.boolean(),
  math: z.object({
    callAmount: z.number().nonnegative().nullable(),
    finalPotIfCall: z.number().nonnegative().nullable(),
    potOddsRatio: z.string().nullable(),
    spr: z.number().nonnegative().nullable(),
  }),
  boardCards: z.array(cardSchema),
  villainActions: z.array(
    z.object({
      street: z.enum(STREETS),
      player: z.string(),
      type: z.string(),
      amount: z.number().nonnegative().nullable(),
      toAmount: z.number().nonnegative().nullable(),
    }),
  ),
  actionHistory: z.array(
    z.object({
      street: z.enum(STREETS),
      actor: z.enum(["hero", "villain"]),
      player: z.string(),
      type: z.string(),
      amount: z.number().nonnegative().nullable(),
      toAmount: z.number().nonnegative().nullable(),
    }),
  ),
  isAllInFacingAction: z.boolean(),
});

function normalizeCard(card) {
  if (typeof card !== "string") return null;
  const trimmed = card.trim();
  if (!/^[2-9TJQKA][cdhs]$/i.test(trimmed)) return null;
  return `${trimmed[0].toUpperCase()}${trimmed[1].toLowerCase()}`;
}

function toFiniteOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toChipAmountOrNull(value) {
  const numeric = toFiniteOrNull(value);
  if (numeric === null) return null;
  if (numeric < 0) return null;
  return Number(numeric.toFixed(2));
}

function normalizeStreet(rawStreet) {
  const street = String(rawStreet || "")
    .trim()
    .toLowerCase();
  return STREETS.includes(street) ? street : null;
}

function flattenActionsByStreet(actionsByStreet) {
  const flattened = [];
  for (const street of STREETS) {
    const actions = Array.isArray(actionsByStreet?.[street])
      ? actionsByStreet[street]
      : [];
    for (const action of actions) {
      flattened.push({
        street,
        player: String(action?.player || "").trim() || "Unknown",
        type: String(action?.type || "").trim().toLowerCase(),
        amount: toChipAmountOrNull(action?.amount),
        toAmount: toChipAmountOrNull(action?.toAmount),
      });
    }
  }
  return flattened;
}

function collectBoardCardsForStreet(board, street) {
  if (street === "preflop") return [];
  const cards = [];
  const flop = Array.isArray(board?.flop) ? board.flop : [];
  for (const card of flop) {
    const normalized = normalizeCard(card);
    if (normalized) cards.push(normalized);
  }
  if (street === "turn" || street === "river") {
    const turn = normalizeCard(board?.turn);
    if (turn) cards.push(turn);
  }
  if (street === "river") {
    const river = normalizeCard(board?.river);
    if (river) cards.push(river);
  }
  return cards;
}

function findDuplicateCards(cards = []) {
  const seen = new Set();
  const duplicates = new Set();
  for (const card of cards) {
    const key = String(card || "").trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return Array.from(duplicates.values());
}

function formatOddsRatio(potSize, callAmount) {
  const pot = Number(potSize);
  const call = Number(callAmount);
  if (!Number.isFinite(pot) || !Number.isFinite(call) || call <= 0) return null;
  return `${(pot / call).toFixed(2)}:1`;
}

function computeContribution(action, currentCommitted) {
  const type = String(action?.type || "").toLowerCase();
  if (!CONTRIBUTION_ACTIONS.has(type)) return 0;

  if (type === "raise" || type === "jam") {
    if (action?.toAmount !== null) {
      const delta = Number(action.toAmount) - Number(currentCommitted || 0);
      return Number.isFinite(delta) && delta > 0 ? delta : 0;
    }
  }

  const amount = Number(action?.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function deriveEffectiveStackBB({
  hand,
  heroName,
  lastAggressor,
  opponentsInDecisionPath,
}) {
  const bigBlind = toFiniteOrNull(hand?.blinds?.bigBlind);
  const heroStack = toFiniteOrNull(hand?.heroStack);
  if (!bigBlind || bigBlind <= 0 || !heroStack || heroStack <= 0) return null;

  const seatRows = Array.isArray(hand?.seats) ? hand.seats : [];
  const seatByPlayer = new Map(
    seatRows.map((seat) => [
      String(seat?.player || "").trim(),
      toFiniteOrNull(seat?.chips),
    ]),
  );

  let referenceOpponentStack = null;
  if (lastAggressor && lastAggressor !== heroName) {
    const candidate = seatByPlayer.get(lastAggressor);
    if (Number.isFinite(candidate) && candidate > 0) {
      referenceOpponentStack = candidate;
    }
  }

  if (referenceOpponentStack === null) {
    const stacks = Array.from(opponentsInDecisionPath)
      .filter((player) => player !== heroName)
      .map((player) => seatByPlayer.get(player))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (stacks.length > 0) {
      referenceOpponentStack = Math.max(...stacks);
    }
  }

  const effectiveChips =
    Number.isFinite(referenceOpponentStack) && referenceOpponentStack > 0
      ? Math.min(heroStack, referenceOpponentStack)
      : heroStack;

  return Number((effectiveChips / bigBlind).toFixed(2));
}

export function buildValidatedHandState(hand = {}) {
  const issues = [];
  const heroName = String(hand?.heroName || "Hero").trim() || "Hero";
  const flatActions = flattenActionsByStreet(hand?.actionsByStreet || {});
  const heroDecisionIndexes = [];

  for (let index = 0; index < flatActions.length; index += 1) {
    const action = flatActions[index];
    if (action.player !== heroName) continue;
    if (!DECISION_ACTIONS.has(action.type)) continue;
    heroDecisionIndexes.push(index);
  }

  const decisionIndex =
    heroDecisionIndexes.length > 0
      ? heroDecisionIndexes[heroDecisionIndexes.length - 1]
      : -1;

  if (decisionIndex === -1) {
    issues.push("No hero decision action found in hand history.");
  }

  const fallbackStreet = normalizeStreet(hand?.heroOutcome?.resolvedStreet) || "preflop";
  const decisionAction = decisionIndex >= 0 ? flatActions[decisionIndex] : null;
  const decisionStreet = decisionAction?.street || fallbackStreet;

  const committedByStreet = new Map();
  const totalContribByPlayer = new Map();
  const livePlayers = new Set(
    (Array.isArray(hand?.seats) ? hand.seats : [])
      .map((seat) => String(seat?.player || "").trim())
      .filter(Boolean),
  );
  if (!livePlayers.has(heroName)) livePlayers.add(heroName);

  const actionHistory = [];
  const villainActions = [];
  const opponentsInDecisionPath = new Set();

  let currentStreet = "preflop";
  let currentBet = 0;
  let pot = 0;
  let lastAggressor = null;
  let lastAggressiveType = null;

  const resetStreetState = (nextStreet) => {
    currentStreet = nextStreet;
    currentBet = 0;
    committedByStreet.clear();
  };

  for (let index = 0; index < flatActions.length; index += 1) {
    if (index === decisionIndex) break;
    const action = flatActions[index];
    if (action.street !== currentStreet) {
      resetStreetState(action.street);
    }

    const player = action.player;
    if (!player) continue;
    const type = action.type;
    const actor = player === heroName ? "hero" : "villain";
    const priorCommitted = committedByStreet.get(player) || 0;
    const contribution = computeContribution(action, priorCommitted);

    if (contribution > 0) {
      pot += contribution;
      committedByStreet.set(player, priorCommitted + contribution);
      totalContribByPlayer.set(
        player,
        (totalContribByPlayer.get(player) || 0) + contribution,
      );
      currentBet = Math.max(currentBet, committedByStreet.get(player) || 0);
    }

    if (type === "fold") {
      livePlayers.delete(player);
    }
    if (AGGRESSIVE_ACTIONS.has(type)) {
      lastAggressor = player;
      lastAggressiveType = type;
    }

    const normalizedAction = {
      street: action.street,
      actor,
      player,
      type,
      amount: action.amount,
      toAmount: action.toAmount,
    };
    actionHistory.push(normalizedAction);
    if (actor === "villain") {
      villainActions.push({
        street: action.street,
        player,
        type,
        amount: action.amount,
        toAmount: action.toAmount,
      });
      opponentsInDecisionPath.add(player);
    }
  }

  if (decisionAction && decisionAction.street !== currentStreet) {
    resetStreetState(decisionAction.street);
  }

  const heroCommittedStreet = committedByStreet.get(heroName) || 0;
  const facingBet = Math.max(0, currentBet - heroCommittedStreet);
  const heroStartStack = toFiniteOrNull(hand?.heroStack);
  const heroContributedTotal = totalContribByPlayer.get(heroName) || 0;
  const heroRemainingStack =
    Number.isFinite(heroStartStack) && heroStartStack >= 0
      ? Math.max(0, heroStartStack - heroContributedTotal)
      : null;

  const isAllInFacingAction =
    facingBet > 0 && lastAggressiveType === "jam" && lastAggressor !== heroName;
  const heroCanRaise =
    facingBet > 0 &&
    !isAllInFacingAction &&
    heroRemainingStack !== null &&
    heroRemainingStack > facingBet;

  const legalActions = [];
  if (facingBet > 0) {
    legalActions.push("call", "fold");
    if (heroCanRaise) legalActions.push("raise");
  } else {
    legalActions.push("check");
    if (heroRemainingStack === null || heroRemainingStack > 0) {
      legalActions.push("bet");
    }
  }

  const heroCardsRaw = Array.isArray(hand?.heroCards) ? hand.heroCards : [];
  const heroHand = heroCardsRaw.map(normalizeCard).filter(Boolean).slice(0, 2);
  if (heroHand.length !== 2) {
    issues.push("Hero cards are missing or invalid.");
  }

  const heroPosition = String(hand?.heroPosition || "").trim() || "UNKNOWN";
  const boardCards = collectBoardCardsForStreet(hand?.board || {}, decisionStreet);
  const allKnownBoardCards = collectBoardCardsForStreet(hand?.board || {}, "river");
  const duplicateCards = findDuplicateCards([...heroHand, ...allKnownBoardCards]);
  if (duplicateCards.length > 0) {
    issues.push(`Duplicate cards detected: ${duplicateCards.join(", ")}.`);
  }
  const effectiveStackBB = deriveEffectiveStackBB({
    hand,
    heroName,
    lastAggressor,
    opponentsInDecisionPath,
  });

  if (facingBet > 0 && legalActions.length === 0) {
    issues.push("Unable to derive legal actions while facing a bet.");
  }
  const callAmount = facingBet > 0 ? Number(facingBet.toFixed(2)) : null;
  const finalPotIfCall =
    callAmount !== null ? Number((pot + callAmount).toFixed(2)) : null;
  const potOddsRatio = formatOddsRatio(pot, callAmount);
  const bigBlind = toFiniteOrNull(hand?.blinds?.bigBlind);
  const potBb =
    Number.isFinite(bigBlind) && bigBlind > 0 && pot > 0 ? pot / bigBlind : null;
  const spr =
    Number.isFinite(Number(effectiveStackBB)) &&
    Number.isFinite(potBb) &&
    potBb > 0
      ? Number((Number(effectiveStackBB) / potBb).toFixed(2))
      : null;

  const rawHandState = {
    street: decisionStreet,
    heroPosition,
    heroHand,
    effectiveStackBB,
    potSize: Number(pot.toFixed(2)),
    facingBet: Number(facingBet.toFixed(2)),
    legalActions,
    heroCanRaise,
    math: {
      callAmount,
      finalPotIfCall,
      potOddsRatio,
      spr,
    },
    boardCards,
    villainActions,
    actionHistory,
    isAllInFacingAction,
  };

  const parsed = handStateSchema.safeParse(rawHandState);
  if (!parsed.success) {
    issues.push("Validated hand state schema failed.");
    for (const issue of parsed.error.issues) {
      issues.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const handState = parsed.success
    ? parsed.data
    : {
        street: "preflop",
        heroPosition,
        heroHand,
        effectiveStackBB: null,
        potSize: null,
        facingBet: null,
        legalActions: [],
        heroCanRaise: false,
        math: {
          callAmount: null,
          finalPotIfCall: null,
          potOddsRatio: null,
          spr: null,
        },
        boardCards: [],
        villainActions: [],
        actionHistory: [],
        isAllInFacingAction: false,
      };

  return {
    handState,
    validation: {
      isValid: issues.length === 0,
      issues,
      selectedHeroDecision: decisionAction
        ? {
            street: decisionAction.street,
            type: decisionAction.type,
            amount: decisionAction.amount,
            toAmount: decisionAction.toAmount,
          }
        : null,
    },
  };
}
