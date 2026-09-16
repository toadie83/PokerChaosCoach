const STREETS = ["preflop", "flop", "turn", "river"];
const number = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const round = (value) => Math.round(value * 100) / 100;

export function replayActionLabel(event) {
  if (event.type === "start") return "Hand start";
  if (event.type === "street") return event.street === "showdown" ? "Showdown" : `Deal ${event.street}`;
  const verb = { post_ante: "posts ante", post_small_blind: "posts small blind", post_big_blind: "posts big blind", return_uncalled: "receives uncalled bet", collect: "collects", show: "shows", fold: "folds", check: "checks", call: "calls", bet: "bets", raise: "raises", jam: "all-in" }[event.type] || event.type;
  const amount = number(event.toAmount) ?? number(event.amount);
  return `${event.player}: ${verb}${amount === null ? "" : `${number(event.toAmount) !== null ? " to" : ""} ${amount.toLocaleString()}`}${event.type === "show" ? ` ${(event.cards || []).join(" ")}` : ""}`;
}

function legacyEvents(hand) {
  const events = [];
  const board = [];
  for (const street of STREETS) {
    const cards = street === "flop" ? hand.board?.flop || [] : street === "preflop" ? [] : [hand.board?.[street]].filter(Boolean);
    board.push(...cards);
    const actions = hand.actionsByStreet?.[street] || [];
    if (street !== "preflop" && (cards.length || actions.length)) events.push({ type: "street", street, cards: [...board] });
    events.push(...actions);
  }
  if (hand.hadShowdown || hand.showdown?.revealedCards?.length) {
    events.push({ type: "street", street: "showdown" });
    for (const reveal of hand.showdown?.revealedCards || []) events.push({ type: "show", ...reveal });
  }
  return events;
}

// Every frame owns its data. Seeking never mutates an earlier frame or the source hand.
export function buildHandReplay(hand = {}) {
  const ordered = Array.isArray(hand.replayEvents);
  const events = ordered ? hand.replayEvents : legacyEvents(hand);
  const heroName = hand.heroName || hand.seats?.find((seat) => seat.seat === hand.heroSeat)?.player || "Hero";
  const seats = (hand.seats || []).map((seat) => ({ ...seat }));
  const names = new Set(seats.map((seat) => seat.player));
  for (const name of [heroName, ...events.map((event) => event.player).filter(Boolean)]) {
    if (!names.has(name)) {
      seats.push({ player: name, chips: name === heroName ? hand.heroStack : null, position: name === heroName ? hand.heroPosition : null });
      names.add(name);
    }
  }
  seats.sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));
  const heroIndex = seats.findIndex((seat) => seat.player === heroName);
  const rotated = [...seats.slice(heroIndex), ...seats.slice(0, heroIndex)];
  let state = {
    street: "preflop", board: [], pot: 0, activePlayer: null,
    players: rotated.map((seat) => ({
      ...seat, isHero: seat.player === heroName, stack: number(seat.chips), bet: 0,
      folded: false, allIn: false, lastAction: "", lastActionLabel: "", cards: seat.player === heroName ? [...(hand.heroCards || [])] : [],
      dealer: seat.seat != null && seat.seat === hand.table?.buttonSeat,
    })),
  };
  const frames = [{ ...state, event: { type: "start" }, label: "Hand start" }];
  const warnings = new Set();
  if (!ordered) warnings.add("This saved hand has a partial replay timeline. Reveal timing and final payouts may be unavailable.");
  if (state.players.some((player) => player.stack === null)) warnings.add("Some starting stacks are unknown.");
  for (const event of events) {
    state = { ...state, board: [...state.board], players: state.players.map((player) => ({ ...player, cards: [...player.cards] })), activePlayer: event.player || null };
    if (event.type === "street") {
      state.street = event.street;
      if (event.cards) state.board = [...event.cards];
      state.players.forEach((player) => { player.bet = 0; player.lastAction = ""; player.lastActionLabel = ""; });
    } else {
      const player = state.players.find((item) => item.player === event.player);
      if (!player) continue;
      player.lastAction = event.type;
      player.lastActionLabel = replayActionLabel(event).replace(`${event.player}: `, "");
      if (event.type === "fold") player.folded = true;
      else if (event.type === "show") player.cards = [...(event.cards || [])];
      else if (["collect", "return_uncalled"].includes(event.type)) {
        const amount = number(event.amount);
        if (amount === null || amount < 0 || amount > state.pot + 0.01) warnings.add("The recorded chip movements are incomplete; pot and stacks may be partial.");
        if (amount !== null && amount >= 0) {
          state.pot = round(state.pot - amount);
          if (player.stack !== null) player.stack = round(player.stack + amount);
          if (event.type === "return_uncalled") {
            player.bet = Math.max(0, round(player.bet - amount));
            player.allIn = player.stack === 0;
          } else state.players.forEach((item) => { item.bet = 0; });
        }
      } else if (["post_ante", "post_small_blind", "post_big_blind", "call", "bet", "raise", "jam"].includes(event.type)) {
        let amount = number(event.toAmount) !== null ? round(Number(event.toAmount) - player.bet) : number(event.amount);
        if (amount === null || amount < 0) {
          warnings.add("An action has no usable amount; pot and stacks may be partial.");
        } else {
          if (player.stack !== null && amount > player.stack + 0.01) warnings.add("A recorded wager exceeds the known stack; chip totals may be partial.");
          amount = player.stack === null ? amount : Math.min(amount, player.stack);
          if (player.stack !== null) player.stack = round(player.stack - amount);
          if (event.type !== "post_ante") player.bet = round(player.bet + amount);
          state.pot = round(state.pot + amount);
        }
        player.allIn = Boolean(event.allIn) || player.stack === 0;
      } else if (event.type !== "check") warnings.add(`Unsupported action: ${event.type}.`);
    }
    frames.push({ ...state, event: { ...event }, label: replayActionLabel(event) });
  }
  return { frames, warnings: [...warnings], available: events.length > 0 };
}
