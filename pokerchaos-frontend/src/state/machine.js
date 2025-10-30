import { positionCategory } from "./seatUtils.js";

export const initialState = {
  street: "preflop",
  heroSeat: "",
  tableSize: 8,
  openSize: 2.5,
  history: [],
  actions: [],
  previousActions: [],
  nextActor: "hero",
  lastEvent: null,
  lastEventAt: 0,
  aggressors: 0,
  opens: 0,
  threeBets: 0,
  momentum: 0,
  handComplete: false,
  style: "chaos_shark",
  persona: "chaos_shark",
  heroCards: { card1: null, card2: null },
  board: {
    flop: [null, null, null],
    turn: null,
    river: null,
  },
  heroStackBB: 100,
  villainStackBB: 100,
  villainType: "fishy",
  stakeTier: "unknown",
};

export function applyEvent(state, event) {
  const now = Date.now();
  if (now - (state.lastEventAt || 0) < 250) return state; // debounce spam
  const s = { ...state };
  const push = (code) => {
    s.actions = [...s.actions, { code, at: now, street: s.street }];
    s.previousActions = [...s.previousActions, code];
  };

  const advanceStreet = () => {
    const currentStreet = s.street;
    push(`${currentStreet}_advance`);
    if (currentStreet === "river") {
      push("hand_complete");
      s.handComplete = true;
      s.nextActor = "hero";
    } else {
      s.street = nextStreet(currentStreet);
      s.nextActor = "hero";
    }
  };

  switch (event) {
    // Preflop
    case "opened_to_me": {
      push("preflop_opened_to_me");
      s.opens += 1;
      s.aggressors += 1;
      s.nextActor = "hero";
      break;
    }
    case "multiple_villains_opened": {
      push("preflop_multiple_villains_opened");
      s.opens += 1;
      s.aggressors += 2;
      s.nextActor = "hero";
      break;
    }
    case "button_steal": {
      push("preflop_button_steal");
      s.opens += 1;
      s.aggressors += 1;
      s.nextActor = "hero";
      break;
    }
    case "unopened": {
      push("preflop_unopened");
      s.nextActor = "hero";
      break;
    }
    case "faced_3bet": {
      push("preflop_faced_3bet");
      s.threeBets += 1;
      s.aggressors += 1;
      s.nextActor = "hero";
      break;
    }
    case "hero_opened": {
      push("preflop_hero_opened");
      s.opens += 1;
      s.nextActor = "hero";
      break;
    }
    // Postflop
    case "checked_to_me": {
      push(`${s.street}_checked_to_me`);
      s.nextActor = "hero";
      break;
    }
    case "faced_bet": {
      push(`${s.street}_faced_bet`);
      s.aggressors += 1;
      s.nextActor = "hero";
      break;
    }
    case "multiway": {
      push(`${s.street}_multiway`);
      s.nextActor = "hero";
      break;
    }
    case "headsup": {
      push(`${s.street}_headsup`);
      s.nextActor = "hero";
      break;
    }
    case "first_to_act": {
      push(`${s.street}_first_to_act`);
      s.nextActor = "hero";
      break;
    }
    case "next_street": {
      push(`${s.street}_advance`);
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        s.street = nextStreet(s.street);
        s.nextActor = "hero";
      }
      break;
    }
    case "reset_hand": {
      const keep = {
        heroSeat: s.heroSeat,
        tableSize: s.tableSize,
        style: s.style,
        openSize: s.openSize,
        persona: s.persona,
        heroCards: s.heroCards,
        heroStackBB: s.heroStackBB,
        villainStackBB: s.villainStackBB,
        villainType: s.villainType,
        preflopLimpers: s.preflopLimpers,
        preflopCallers: s.preflopCallers,
        stakeTier: s.stakeTier,
      };
      return { ...initialState, ...keep };
    }
    case "opp_all_fold": {
      push(`${s.street}_opp_all_fold`);
      push("hand_complete");
      s.handComplete = true;
      s.nextActor = "hero";
      break;
    }
    case "opp_one_call": {
      push(`${s.street}_opp_one_call`);
      if (s.street === "preflop") {
        advanceStreet();
      } else {
        s.nextActor = "hero";
      }
      break;
    }
    case "opp_multi_call": {
      push(`${s.street}_opp_multi_call`);
      if (s.street === "preflop") {
        advanceStreet();
      } else {
        s.nextActor = "hero";
      }
      break;
    }
    case "opp_4bet": {
      push(`${s.street}_opp_4bet`);
      s.nextActor = "hero";
      break;
    }
    case "opp_shove": {
      push(`${s.street}_opp_shove`);
      s.nextActor = "hero";
      break;
    }
    case "opp_fold": {
      push(`${s.street}_opp_fold`);
      push("hand_complete");
      s.handComplete = true;
      s.nextActor = "hero";
      break;
    }
    case "opp_call": {
      push(`${s.street}_opp_call`);
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        advanceStreet();
      }
      break;
    }
    case "opp_check_back": {
      push(`${s.street}_opp_check_back`);
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
        s.nextActor = "hero";
      } else {
        advanceStreet();
      }
      break;
    }
    case "opp_raise": {
      push(`${s.street}_opp_raise`);
      if (s.street === "preflop") {
        push("preflop_faced_3bet");
      }
      s.nextActor = "hero";
      break;
    }
    default:
      break;
  }
  s.lastEvent = event;
  s.lastEventAt = now;
  return s;
}

export function nextStreet(street) {
  const order = ["preflop", "flop", "turn", "river"];
  const idx = order.indexOf(street);
  return order[Math.min(order.length - 1, Math.max(0, idx + 1))] || "river";
}

export function deriveBranch(state) {
  const last = state.previousActions[state.previousActions.length - 1];
  if (last) return last; // already encoded as street_event
  if (state.street === "preflop") return "preflop_unopened";
  return `${state.street}_checked_to_me`;
}

export function instructionForBranch(branch) {
  const map = {
    // Preflop
    preflop_unopened:
      "Hero in unopened pot — suggest open raise sizing (3x–4x)",
    preflop_opened_to_me:
      "Facing an open - lead with 3-bet aggression, mix traps when image insists",
    preflop_multiple_villains_opened:
      "Multiple players entered preflop - exploit loose callers or over-isolate as hero",
    preflop_button_steal:
      "Button opened into blinds - defend with balanced 3-bets and strategic calls",
    preflop_faced_3bet: "Facing a 3-bet — suggest 4-bet or fold with attitude",
    preflop_hero_opened: "Hero opened — suggest plan vs callers/3-bets",
    // Postflop
    flop_checked_to_me:
      "Checked to hero — suggest continuation bet (half to full pot)",
    flop_faced_bet: "Facing bet — suggest check-raise or float for chaos",
    flop_multiway: "Multiway pot — suggest pressure or positioning play",
    flop_headsup: "Heads-up pot — suggest pressure line",
    turn_checked_to_me: "Turn checked to hero — double barrel or overbet",
    turn_faced_bet: "Turn facing bet — apply pressure or call for image",
    turn_multiway: "Turn multiway — suggest decisive pressure",
    turn_headsup: "Turn heads-up — suggest pressure line",
    river_checked_to_me: "River checked to hero — thin value or bluff shove",
    river_faced_bet: "River facing bet — heroic call or audacious raise",
    river_multiway: "River multiway — polarized pressure",
    river_headsup: "River heads-up — decisive finisher",
    // First to act (postflop)
    flop_first_to_act:
      "First to act — suggest c-bet, small probe, or check-trap",
    turn_first_to_act:
      "First to act — suggest second barrel, small stab, or trap",
    river_first_to_act: "First to act — thin value, block bet, or bluff shove",
    // Opponent reactions (preflop)
    preflop_opp_all_fold: "Everyone folded — reflect table image next hand",
    preflop_opp_one_call: "Single caller — prepare flop plan and initiative",
    preflop_opp_multi_call: "Multiway pot — prepare pressure lines",
    preflop_opp_4bet:
      "Facing 4-bet — suggest plan (shove or fold with swagger)",
    preflop_opp_shove: "Facing shove — decisive response with presence",
    // Opponent reactions (postflop generic)
    flop_opp_fold: "Villain folded — keep pressure narrative",
    flop_opp_call: "Caller on flop — plan next barrel",
    flop_opp_check_back: "Villain checked back flop - exploit capped range",
    flop_opp_raise: "Facing raise — escalate or contain with swagger",
    turn_opp_fold: "Villain folded — cement image",
    turn_opp_call: "Caller on turn — plan river pressure",
    turn_opp_check_back: "Villain checked back turn - punish delayed weakness",
    turn_opp_raise: "Facing turn raise — bold reply",
    river_opp_fold: "Villain folded — table image established",
    river_opp_call: "Caller on river — reflect table dynamics",
    river_opp_check_back: "Villain checked back river - assess showdown plan",
    river_opp_raise: "Facing river raise — audacious counter",
  };
  return map[branch] || "Generate a short, high-energy chaos line.";
}

export function summarizeForAI(state) {
  const branch = deriveBranch(state);
  const instruction = instructionForBranch(branch);
  const history = Array.isArray(state.history) ? state.history.slice(-8) : [];
  const heroCards = state.heroCards || {};
  const heroHand =
    heroCards.card1 && heroCards.card2
      ? String(heroCards.card1) + String(heroCards.card2)
      : null;
  const normalizeCard = (card) =>
    typeof card === "string" && card.trim().length === 2
      ? card.trim().toUpperCase()
      : null;
  const flopCards = Array.isArray(state.board?.flop)
    ? state.board.flop.map(normalizeCard)
    : [null, null, null];
  const boardContext = {};
  if (flopCards.some((card) => card)) {
    boardContext.flop = flopCards;
  }
  const turnCard = normalizeCard(state.board?.turn);
  if (turnCard) boardContext.turn = turnCard;
  const riverCard = normalizeCard(state.board?.river);
  if (riverCard) boardContext.river = riverCard;
  return {
    context: {
      street: state.street,
      heroSeat: state.heroSeat,
      tableSize: state.tableSize,
      previousActions: state.previousActions,
      aggressors: state.aggressors,
      style: state.style || "chaos_shark",
      branch,
      history,
      persona: state.persona || "chaos_shark",
      heroCards,
      heroHand,
      board: Object.keys(boardContext).length ? boardContext : undefined,
      heroStackBB:
        typeof state.heroStackBB === "number" &&
        Number.isFinite(state.heroStackBB)
          ? state.heroStackBB
          : null,
      villainStackBB:
        typeof state.villainStackBB === "number" &&
        Number.isFinite(state.villainStackBB)
          ? state.villainStackBB
          : null,
      villainType: state.villainType || "balanced",
      preflopLimpers:
        typeof state.preflopLimpers === "number" ? state.preflopLimpers : 0,
      preflopCallers:
        typeof state.preflopCallers === "number" ? state.preflopCallers : 0,
      stakeTier: state.stakeTier || "unknown",
    },
    instruction,
  };
}

export function getAvailableActions(state, hasCoach) {
  if (state.handComplete) {
    return [];
  }
  const isPre = state.street === "preflop";
  const next = state.nextActor || "hero";

  if (next === "opp" && hasCoach) {
    if (isPre) {
      return [
        { code: "opp_all_fold", label: "All folded" },
        { code: "opp_one_call", label: "1 caller" },
        { code: "opp_multi_call", label: "Multi callers" },
        { code: "opp_raise", label: "Re-raise (3-bet)" },
        { code: "opp_4bet", label: "4-bet" },
        { code: "opp_shove", label: "Shoved" },
      ];
    }
    return [
      { code: "opp_fold", label: "Villain fold" },
      { code: "opp_check_back", label: "Villain checked back" },
      { code: "opp_call", label: "Villain call" },
      { code: "opp_raise", label: "Villain raise" },
      { code: "opp_shove", label: "Villain shove" },
    ];
  }

  if (isPre) {
    const heroSeat = String(state.heroSeat || "").toUpperCase();
    const actions = [
      { code: "unopened", label: "Unopened pot" },
      { code: "opened_to_me", label: "Opened to me" },
      { code: "multiple_villains_opened", label: "Multiple villains opened" },
      { code: "faced_3bet", label: "3-Bet to me" },
    ];
    if (heroSeat === "SB" || heroSeat === "BB") {
      actions.splice(2, 0, {
        code: "button_steal",
        label: "Button Open",
      });
    }
    return actions;
  }
  const pos = positionCategory(state.heroSeat, state.tableSize);
  const base = [
    { code: "first_to_act", label: "First to act" },
    { code: "checked_to_me", label: "Checked to me" },
    { code: "faced_bet", label: "Bet to me" },
    { code: "multiway", label: "Multiway" },
    { code: "headsup", label: "Heads-up" },
  ];
  if (pos === "early") {
    return [
      base[2], // faced bet
      base[1], // checked
      base[0], // first to act
      ...base.slice(3),
    ];
  }
  if (pos === "late") {
    return [
      base[1], // checked
      base[2], // faced bet
      base[0], // first to act
      ...base.slice(3),
    ];
  }
  return base;
}
