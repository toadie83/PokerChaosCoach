const HAND_SPLIT_REGEX = /(?=^Poker Hand #)/m;

const POSITION_TEMPLATE = {
  2: ["SB", "BB"],
  3: ["SB", "BB", "BTN"],
  4: ["SB", "BB", "CO", "BTN"],
  5: ["SB", "BB", "UTG", "CO", "BTN"],
  6: ["SB", "BB", "UTG", "HJ", "CO", "BTN"],
  7: ["SB", "BB", "UTG", "UTG+1", "HJ", "CO", "BTN"],
  8: ["SB", "BB", "UTG", "UTG+1", "LJ", "HJ", "CO", "BTN"],
  9: ["SB", "BB", "UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN"],
};

function toNumber(raw) {
  if (typeof raw !== "string") return null;
  const normalized = raw.replace(/,/g, "").trim();
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCardList(raw) {
  if (typeof raw !== "string") return [];
  return raw
    .trim()
    .split(/\s+/)
    .map((card) => card.trim())
    .filter((card) => /^[2-9TJQKA][cdhs]$/i.test(card))
    .map((card) => `${card[0].toUpperCase()}${card[1].toLowerCase()}`);
}

function parseActionLine(line) {
  const basicMatch = /^([^:]+):\s+(.+)$/.exec(line);
  if (!basicMatch) return null;

  const player = basicMatch[1].trim();
  const details = basicMatch[2].trim();
  const allIn = /all-?in/i.test(details);

  if (/^folds\b/i.test(details)) {
    return { player, type: "fold", raw: line, allIn };
  }
  if (/^checks\b/i.test(details)) {
    return { player, type: "check", raw: line, allIn };
  }

  const callMatch = /^calls\s+([\d,]+)/i.exec(details);
  if (callMatch) {
    return {
      player,
      type: allIn ? "jam" : "call",
      amount: toNumber(callMatch[1]),
      raw: line,
      allIn,
    };
  }

  const betMatch = /^bets\s+([\d,]+)/i.exec(details);
  if (betMatch) {
    return {
      player,
      type: allIn ? "jam" : "bet",
      amount: toNumber(betMatch[1]),
      raw: line,
      allIn,
    };
  }

  const raiseMatch = /^raises\s+([\d,]+)\s+to\s+([\d,]+)/i.exec(details);
  if (raiseMatch) {
    return {
      player,
      type: allIn ? "jam" : "raise",
      raiseBy: toNumber(raiseMatch[1]),
      toAmount: toNumber(raiseMatch[2]),
      raw: line,
      allIn,
    };
  }

  const anteMatch = /^posts the ante\s+([\d,]+)/i.exec(details);
  if (anteMatch) {
    return {
      player,
      type: "post_ante",
      amount: toNumber(anteMatch[1]),
      raw: line,
      allIn: false,
    };
  }

  const sbMatch = /^posts small blind\s+([\d,]+)/i.exec(details);
  if (sbMatch) {
    return {
      player,
      type: "post_small_blind",
      amount: toNumber(sbMatch[1]),
      raw: line,
      allIn: false,
    };
  }

  const bbMatch = /^posts big blind\s+([\d,]+)/i.exec(details);
  if (bbMatch) {
    return {
      player,
      type: "post_big_blind",
      amount: toNumber(bbMatch[1]),
      raw: line,
      allIn: false,
    };
  }

  const collectMatch = /^collected\s+([\d,]+)\s+from pot/i.exec(details);
  if (collectMatch) {
    return {
      player,
      type: "collect",
      amount: toNumber(collectMatch[1]),
      raw: line,
      allIn: false,
    };
  }

  return null;
}

function parsePlayedAtEpoch(raw) {
  if (typeof raw !== "string") return null;
  const match =
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function seatOrderFromButton(seatNumbers = [], buttonSeat) {
  const ordered = [...seatNumbers]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!ordered.length) return [];
  const buttonIndex = ordered.indexOf(Number(buttonSeat));
  if (buttonIndex === -1) return ordered;

  const clockwise = [];
  for (let i = 1; i <= ordered.length; i += 1) {
    clockwise.push(ordered[(buttonIndex + i) % ordered.length]);
  }
  return clockwise;
}

function assignPositions(seats, buttonSeat) {
  if (!Array.isArray(seats) || seats.length === 0) return;
  const order = seatOrderFromButton(
    seats.map((seat) => seat.seat),
    buttonSeat
  );
  const template =
    POSITION_TEMPLATE[order.length] ||
    POSITION_TEMPLATE[9].slice(0, Math.min(order.length, 9));
  const bySeat = new Map();
  for (const seat of seats) {
    bySeat.set(seat.seat, seat);
  }
  order.forEach((seatNumber, idx) => {
    const seat = bySeat.get(seatNumber);
    if (seat) {
      seat.position = template[idx] || `P${idx + 1}`;
    }
  });
}

function buildHeroPreflopSummary(actions, heroName) {
  const heroActions = actions.filter((item) => item.player === heroName);
  const preflopDecisions = heroActions.filter(
    (item) =>
      item.type !== "post_ante" &&
      item.type !== "post_small_blind" &&
      item.type !== "post_big_blind"
  );
  const didFold = preflopDecisions.some((item) => item.type === "fold");
  const acted = preflopDecisions.length > 0;
  const vpip = preflopDecisions.some((item) =>
    ["call", "raise", "bet", "jam"].includes(item.type)
  );
  return {
    actions: preflopDecisions,
    didFold,
    acted,
    continued: acted && !didFold,
    vpip,
  };
}

function streetLabel(streetCode) {
  if (streetCode === "preflop") return "preflop";
  if (streetCode === "flop") return "flop";
  if (streetCode === "turn") return "turn";
  if (streetCode === "river") return "river";
  return null;
}

function lastMeaningfulActionStreet(actionsByStreet) {
  const order = ["river", "turn", "flop", "preflop"];
  for (const street of order) {
    const actions = Array.isArray(actionsByStreet?.[street])
      ? actionsByStreet[street]
      : [];
    const hasMeaningful = actions.some(
      (action) =>
        !String(action?.type || "").startsWith("post_") &&
        String(action?.type || "") !== "collect"
    );
    if (hasMeaningful) return street;
  }
  return null;
}

function deriveHeroOutcome({
  heroSummaryLine,
  heroWonAmount,
  hadRevealedShowdownCards,
  board,
  actionsByStreet,
  heroName,
}) {
  const hasBoardCards = Boolean(
    (Array.isArray(board?.flop) && board.flop.length > 0) ||
      board?.turn ||
      board?.river
  );

  if (Number(heroWonAmount) > 0) {
    const wonAtShowdown = hadRevealedShowdownCards;
    const resolvedStreet =
      lastMeaningfulActionStreet(actionsByStreet) ||
      (hasBoardCards
        ? board?.river
          ? "river"
          : board?.turn
          ? "turn"
          : "flop"
        : "preflop");
    return {
      code: wonAtShowdown
        ? "won_showdown"
        : `won_no_showdown_${resolvedStreet}`,
      label: wonAtShowdown
        ? "Won at showdown"
        : `Won without showdown (${streetLabel(resolvedStreet)})`,
      wonAmount: heroWonAmount,
      resolvedStreet,
      foldedStreet: null,
    };
  }

  if (typeof heroSummaryLine === "string" && heroSummaryLine.trim()) {
    if (/folded before flop/i.test(heroSummaryLine)) {
      return {
        code: "folded_preflop",
        label: "Folded preflop",
        wonAmount: 0,
        resolvedStreet: "preflop",
        foldedStreet: "preflop",
      };
    }
    const foldStreet = /folded on the (flop|turn|river)/i.exec(heroSummaryLine);
    if (foldStreet) {
      const street = foldStreet[1].toLowerCase();
      return {
        code: `folded_${street}`,
        label: `Folded ${street}`,
        wonAmount: 0,
        resolvedStreet: street,
        foldedStreet: street,
      };
    }
  }

  for (const street of ["river", "turn", "flop", "preflop"]) {
    const fold = (actionsByStreet?.[street] || []).find(
      (item) => item.player === heroName && item.type === "fold"
    );
    if (fold) {
      return {
        code: `folded_${street}`,
        label: `Folded ${streetLabel(street)}`,
        wonAmount: 0,
        resolvedStreet: street,
        foldedStreet: street,
      };
    }
  }

  if (hadRevealedShowdownCards) {
    return {
      code: "lost_showdown",
      label: "Lost at showdown",
      wonAmount: 0,
      resolvedStreet: "river",
      foldedStreet: null,
    };
  }

  const resolvedStreet =
    lastMeaningfulActionStreet(actionsByStreet) ||
    (hasBoardCards
      ? board?.river
        ? "river"
        : board?.turn
        ? "turn"
        : "flop"
      : "preflop");
  return {
    code: `not_won_no_showdown_${resolvedStreet}`,
    label: `Did not win (no showdown, ${streetLabel(resolvedStreet)})`,
    wonAmount: 0,
    resolvedStreet,
    foldedStreet: null,
  };
}

function parseSingleHand(rawChunk, heroName) {
  const lines = rawChunk
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const headerLine = lines[0];
  const dateSplitAt = headerLine.lastIndexOf(" - ");
  if (dateSplitAt === -1) return null;

  const playedAtRaw = headerLine.slice(dateSplitAt + 3).trim();
  const prefix = headerLine.slice(0, dateSplitAt).trim();
  const prefixMatch =
    /^Poker Hand #([^:]+): Tournament #([^,]+),\s+(.+?)\s+-\s+Level(.+)$/.exec(
      prefix
    );
  if (!prefixMatch) return null;

  const levelBlock = prefixMatch[4].trim();
  const levelOpen = levelBlock.indexOf("(");
  const levelClose = levelBlock.lastIndexOf(")");
  const level =
    levelOpen === -1
      ? levelBlock
      : levelBlock.slice(0, levelOpen).trim() || levelBlock;
  const blindLabel =
    levelOpen === -1 || levelClose <= levelOpen
      ? null
      : levelBlock.slice(levelOpen + 1, levelClose).trim();

  const table = {
    id: null,
    maxPlayers: null,
    buttonSeat: null,
  };
  const seats = [];
  const actionsByStreet = {
    preflop: [],
    flop: [],
    turn: [],
    river: [],
  };
  const board = {
    flop: [],
    turn: null,
    river: null,
  };
  const dealtCards = new Map();
  const revealedCards = new Map();

  let totalPot = null;
  let currentStreet = null;
  let inSummary = false;
  let hadShowdown = false;
  let heroSummaryLine = null;
  let heroWonAmount = null;
  let heroCollectedAmount = 0;

  for (const line of lines.slice(1)) {
    if (/^\*\*\* HOLE CARDS \*\*\*/.test(line)) {
      currentStreet = "preflop";
      inSummary = false;
      continue;
    }
    if (/^\*\*\* FLOP \*\*\*/.test(line)) {
      currentStreet = "flop";
      inSummary = false;
      const match = /^\*\*\* FLOP \*\*\* \[([^\]]+)\]/.exec(line);
      if (match) board.flop = parseCardList(match[1]);
      continue;
    }
    if (/^\*\*\* TURN \*\*\*/.test(line)) {
      currentStreet = "turn";
      inSummary = false;
      const groups = Array.from(line.matchAll(/\[([^\]]+)\]/g));
      if (groups.length >= 2) {
        const cards = parseCardList(groups[1][1]);
        board.turn = cards[0] || null;
      }
      continue;
    }
    if (/^\*\*\* RIVER \*\*\*/.test(line)) {
      currentStreet = "river";
      inSummary = false;
      const groups = Array.from(line.matchAll(/\[([^\]]+)\]/g));
      if (groups.length >= 2) {
        const cards = parseCardList(groups[1][1]);
        board.river = cards[0] || null;
      }
      continue;
    }
    if (/^\*\*\* SUMMARY \*\*\*/.test(line)) {
      currentStreet = null;
      inSummary = true;
      continue;
    }
    if (/^\*\*\* SHOWDOWN \*\*\*/.test(line)) {
      currentStreet = null;
      inSummary = false;
      hadShowdown = true;
      continue;
    }

    const tableMatch = /^Table '([^']+)'\s+(\d+)-max Seat #(\d+) is the button$/.exec(
      line
    );
    if (tableMatch) {
      table.id = tableMatch[1];
      table.maxPlayers = Number(tableMatch[2]);
      table.buttonSeat = Number(tableMatch[3]);
      continue;
    }

    const seatMatch = /^Seat (\d+):\s+(.+?)\s+\(([\d,]+) in chips\)$/.exec(line);
    if (seatMatch) {
      seats.push({
        seat: Number(seatMatch[1]),
        player: seatMatch[2],
        chips: toNumber(seatMatch[3]),
        position: null,
      });
      continue;
    }

    const dealtMatch = /^Dealt to (.+?)\s+\[([^\]]+)\]$/.exec(line);
    if (dealtMatch) {
      dealtCards.set(dealtMatch[1], parseCardList(dealtMatch[2]));
      continue;
    }
    const showMatch = /^([^:]+):\s+shows\s+\[([^\]]+)\]/i.exec(line);
    if (showMatch) {
      revealedCards.set(showMatch[1].trim(), parseCardList(showMatch[2]));
      continue;
    }

    const totalPotMatch = /^Total pot ([\d,]+)\s+\|/.exec(line);
    if (totalPotMatch) {
      totalPot = toNumber(totalPotMatch[1]);
      continue;
    }

    if (inSummary) {
      const heroSummaryPattern = new RegExp(
        `^Seat \\d+:\\s+${escapeRegExp(heroName)}(?:\\s+\\([^)]*\\))?\\s*(.*)$`,
        "i"
      );
      const heroSummaryMatch = heroSummaryPattern.exec(line);
      if (heroSummaryMatch) {
        heroSummaryLine = line;
        const detailText = String(heroSummaryMatch[1] || "");
        const wonMatch = /\bwon\s+\(([\d,]+)\)/i.exec(detailText);
        if (wonMatch) {
          heroWonAmount = toNumber(wonMatch[1]);
        }
        const collectedMatch = /\bcollected\s+\(([\d,]+)\)/i.exec(detailText);
        if (collectedMatch) {
          heroWonAmount = toNumber(collectedMatch[1]);
        }
      }
      continue;
    }

    const collectNoColonMatch = /^(.+?)\s+collected\s+([\d,]+)\s+from pot$/i.exec(
      line
    );
    if (collectNoColonMatch) {
      const player = collectNoColonMatch[1].trim();
      const amount = toNumber(collectNoColonMatch[2]);
      if (player === heroName && amount) {
        heroCollectedAmount += amount;
      }
      continue;
    }

    const action = parseActionLine(line);
    if (!action) continue;
    if (action.type === "collect" && action.player === heroName) {
      heroCollectedAmount += action.amount ?? 0;
    }
    const streetKey =
      !currentStreet && action.type.startsWith("post_")
        ? "preflop"
        : currentStreet;
    if (!streetKey || !actionsByStreet[streetKey]) continue;
    actionsByStreet[streetKey].push(action);
  }

  assignPositions(seats, table.buttonSeat);

  const heroSeat = seats.find((seat) => seat.player === heroName) || null;
  const heroCards = dealtCards.get(heroName) || null;
  const heroPreflop = buildHeroPreflopSummary(actionsByStreet.preflop, heroName);

  const smallBlindPost = actionsByStreet.preflop.find(
    (item) => item.type === "post_small_blind"
  );
  const bigBlindPost = actionsByStreet.preflop.find(
    (item) => item.type === "post_big_blind"
  );
  const antePost = actionsByStreet.preflop.find(
    (item) => item.type === "post_ante"
  );

  const playedAtEpoch = parsePlayedAtEpoch(playedAtRaw);
  if (!heroWonAmount && heroCollectedAmount > 0) {
    heroWonAmount = heroCollectedAmount;
  }
  const hadRevealedShowdownCards = revealedCards.size > 0;
  const showdown = {
    revealedCards: Array.from(revealedCards.entries()).map(([player, cards]) => ({
      player,
      cards,
    })),
  };
  const heroOutcome = deriveHeroOutcome({
    heroSummaryLine,
    heroWonAmount,
    hadRevealedShowdownCards,
    board,
    actionsByStreet,
    heroName,
  });

  return {
    handId: prefixMatch[1].trim(),
    tournamentId: prefixMatch[2].trim(),
    game: prefixMatch[3].trim(),
    level,
    blindLabel,
    playedAt: playedAtRaw,
    playedAtEpoch,
    table,
    seats,
    heroName,
    heroSeat: heroSeat?.seat ?? null,
    heroPosition: heroSeat?.position ?? null,
    heroStack: heroSeat?.chips ?? null,
    heroCards,
    blinds: {
      ante: antePost?.amount ?? null,
      smallBlind: smallBlindPost?.amount ?? null,
      bigBlind: bigBlindPost?.amount ?? null,
    },
    board,
    totalPot,
    heroResult: {
      summary: heroSummaryLine,
      wonAmount: heroWonAmount,
    },
    showdown,
    heroOutcome,
    hadShowdown,
    heroPreflop,
    actionsByStreet,
    rawText: rawChunk,
  };
}

export function parseGgTournamentHistory(historyText, options = {}) {
  const heroName =
    typeof options.heroName === "string" && options.heroName.trim()
      ? options.heroName.trim()
      : "Hero";
  const normalized = String(historyText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!normalized) return [];

  const chunks = normalized
    .split(HAND_SPLIT_REGEX)
    .map((chunk) => chunk.trim())
    .filter((chunk) => /^Poker Hand #/.test(chunk));

  return chunks
    .map((chunk) => parseSingleHand(chunk, heroName))
    .filter(Boolean);
}

export function filterHandsForReview(hands, options = {}) {
  const includeOnlyHeroDidNotFoldPreflop =
    options.includeOnlyHeroDidNotFoldPreflop ?? true;

  return (Array.isArray(hands) ? hands : []).filter((hand) => {
    if (!includeOnlyHeroDidNotFoldPreflop) return true;
    return Boolean(hand?.heroPreflop?.acted) && !hand?.heroPreflop?.didFold;
  });
}

export function sortHands(hands, sortDirection = "newest") {
  const list = Array.isArray(hands) ? [...hands] : [];
  const direction = sortDirection === "oldest" ? "oldest" : "newest";

  list.sort((a, b) => {
    const aTime = Number(a?.playedAtEpoch) || 0;
    const bTime = Number(b?.playedAtEpoch) || 0;
    return direction === "oldest" ? aTime - bTime : bTime - aTime;
  });

  return list;
}

export function compactHandForApi(hand) {
  const heroStreetActions = {};
  for (const street of ["preflop", "flop", "turn", "river"]) {
    heroStreetActions[street] = (hand.actionsByStreet?.[street] || [])
      .filter((item) => item.player === hand.heroName)
      .map((item) => ({
        type: item.type,
        amount: item.amount ?? null,
        toAmount: item.toAmount ?? null,
      }));
  }

  return {
    handId: hand.handId,
    tournamentId: hand.tournamentId,
    playedAt: hand.playedAt,
    heroName: hand.heroName,
    heroPosition: hand.heroPosition,
    heroStack: hand.heroStack,
    heroCards: hand.heroCards,
    blinds: hand.blinds,
    totalPot: hand.totalPot,
    board: hand.board,
    heroPreflop: hand.heroPreflop,
    heroResult: hand.heroResult,
    showdown: hand.showdown,
    heroOutcome: hand.heroOutcome,
    hadShowdown: hand.hadShowdown,
    actionsByStreet: hand.actionsByStreet,
    heroActionsByStreet: heroStreetActions,
  };
}
