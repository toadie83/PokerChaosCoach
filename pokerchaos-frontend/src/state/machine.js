import { positionCategory } from "./seatUtils.js";
import { actsFirstOnStreet } from "./seatUtils.js";

export const initialState = {
  street: "preflop",
  heroSeat: "",
  tableSize: 8,
  openSize: 2.5,
  history: [],
  actions: [],
  previousActions: [],
  lastEvent: null,
  lastEventAt: 0,
  aggressors: 0,
  opens: 0,
  threeBets: 0,
  momentum: 0,
  handComplete: false,
  style: "chaos_shark"
};

export function applyEvent(state, event) {
  const now = Date.now();
  if (now - (state.lastEventAt || 0) < 250) return state; // debounce spam
  const s = { ...state };
  const push = (code) => {
    s.actions = [...s.actions, { code, at: now, street: s.street }];
    s.previousActions = [...s.previousActions, code];
  };

  switch (event) {
    // Preflop
    case "opened_to_me": {
      push("preflop_opened_to_me");
      s.opens += 1;
      s.aggressors += 1;
      break;
    }
    case "unopened": {
      push("preflop_unopened");
      break;
    }
    case "faced_3bet": {
      push("preflop_faced_3bet");
      s.threeBets += 1;
      s.aggressors += 1;
      break;
    }
    case "hero_opened": {
      push("preflop_hero_opened");
      s.opens += 1;
      break;
    }
    // Postflop
    case "checked_to_me": {
      push(`${s.street}_checked_to_me`);
      break;
    }
    case "faced_bet": {
      push(`${s.street}_faced_bet`);
      s.aggressors += 1;
      break;
    }
    case "multiway": {
      push(`${s.street}_multiway`);
      break;
    }
    case "headsup": {
      push(`${s.street}_headsup`);
      break;
    }
    case "first_to_act": {
      push(`${s.street}_first_to_act`);
      break;
    }
    case "next_street": {
      push(`${s.street}_advance`);
      if (s.street === "river") {
        push("hand_complete");
        s.handComplete = true;
      } else {
        s.street = nextStreet(s.street);
      }
      break;
    }
    case "reset_hand": {
      const keep = { heroSeat: s.heroSeat, tableSize: s.tableSize, style: s.style, openSize: s.openSize };
      return { ...initialState, ...keep };
    }
    case "opp_all_fold": {
      push(`${s.street}_opp_all_fold`);
      break;
    }
    case "opp_one_call": {
      push(`${s.street}_opp_one_call`);
      break;
    }
    case "opp_multi_call": {
      push(`${s.street}_opp_multi_call`);
      break;
    }
    case "opp_4bet": {
      push(`${s.street}_opp_4bet`);
      break;
    }
    case "opp_shove": {
      push(`${s.street}_opp_shove`);
      break;
    }
    case "opp_fold": {
      push(`${s.street}_opp_fold`);
      break;
    }
    case "opp_call": {
      push(`${s.street}_opp_call`);
      break;
    }
    case "opp_raise": {
      push(`${s.street}_opp_raise`);
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
    preflop_unopened: "Hero in unopened pot — suggest open raise sizing (3x–4x)",
    preflop_opened_to_me: "Facing an open — suggest 3-bet or call with swagger",
    preflop_faced_3bet: "Facing a 3-bet — suggest 4-bet or fold with attitude",
    preflop_hero_opened: "Hero opened — suggest plan vs callers/3-bets",
    // Postflop
    flop_checked_to_me: "Checked to hero — suggest continuation bet (half to full pot)",
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
    flop_first_to_act: "First to act — suggest c-bet, small probe, or check-trap",
    turn_first_to_act: "First to act — suggest second barrel, small stab, or trap",
    river_first_to_act: "First to act — thin value, block bet, or bluff shove",
    // Opponent reactions (preflop)
    preflop_opp_all_fold: "Everyone folded — reflect table image next hand",
    preflop_opp_one_call: "Single caller — prepare flop plan and initiative",
    preflop_opp_multi_call: "Multiway pot — prepare pressure lines",
    preflop_opp_4bet: "Facing 4-bet — suggest plan (shove or fold with swagger)",
    preflop_opp_shove: "Facing shove — decisive response with presence",
    // Opponent reactions (postflop generic)
    flop_opp_fold: "Villain folded — keep pressure narrative",
    flop_opp_call: "Caller on flop — plan next barrel",
    flop_opp_raise: "Facing raise — escalate or contain with swagger",
    turn_opp_fold: "Villain folded — cement image",
    turn_opp_call: "Caller on turn — plan river pressure",
    turn_opp_raise: "Facing turn raise — bold reply",
    river_opp_fold: "Villain folded — table image established",
    river_opp_call: "Caller on river — reflect table dynamics",
    river_opp_raise: "Facing river raise — audacious counter"
  };
  return map[branch] || "Generate a short, high-energy chaos line.";
}

export function summarizeForAI(state) {
  const branch = deriveBranch(state);
  const instruction = instructionForBranch(branch);
  const history = Array.isArray(state.history) ? state.history.slice(-8) : [];
  return {
    context: {
      street: state.street,
      heroSeat: state.heroSeat,
      tableSize: state.tableSize,
      previousActions: state.previousActions,
      aggressors: state.aggressors,
      style: state.style || "chaos_shark",
      branch,
      history
    },
    instruction
  };
}

export function getAvailableActions(state, hasCoach) {
  if (state.handComplete) {
    return [];
  }
  const isPre = state.street === "preflop";
  const last = state.previousActions[state.previousActions.length - 1] || "";
  const isAlreadyOpp = /_opp_/.test(last);
  if (hasCoach && last && !isAlreadyOpp) {
    if (isPre) {
      return [
        { code: "opp_one_call", label: "1 Caller" },
        { code: "opp_multi_call", label: "Multi callers" },
        { code: "opp_all_fold", label: "All folded" },
        { code: "opp_4bet", label: "4-bet" },
        { code: "opp_shove", label: "Shoved" }
      ];
    }
    // Postflop: prefer perception-based options instead of generic opp reactions
    const pos = positionCategory(state.heroSeat, state.tableSize);
    const base = [
      { code: "checked_to_me", label: "Checked to me" },
      { code: "faced_bet", label: "Bet to me" },
      { code: "multiway", label: "Multiway" },
      { code: "headsup", label: "Heads-up" },
      { code: "next_street", label: "Next Street" }
    ];
    if (actsFirstOnStreet(state.street, state.heroSeat)) {
      base.unshift({ code: "first_to_act", label: "First to act" });
    }
    if (pos === "early") return [base[1], base[0], ...base.slice(2)];
    if (pos === "late") return base;
    return base;
  }

  if (isPre) {
    return [
      { code: "unopened", label: "Unopened pot" },
      { code: "opened_to_me", label: "Opened to me" },
      { code: "faced_3bet", label: "3-Bet to me" },
      { code: "hero_opened", label: "Hero opened" }
    ];
  }
  const pos = positionCategory(state.heroSeat, state.tableSize);
  const base = [
    { code: "checked_to_me", label: "Checked to me" },
    { code: "faced_bet", label: "Bet to me" },
    { code: "multiway", label: "Multiway" },
    { code: "headsup", label: "Heads-up" },
    { code: "next_street", label: "Next Street" }
  ];
  if (actsFirstOnStreet(state.street, state.heroSeat)) {
    base.unshift({ code: "first_to_act", label: "First to act" });
  }
  if (pos === "early") return [base[1], base[0], ...base.slice(2)];
  if (pos === "late") return base;
  return base;
}
