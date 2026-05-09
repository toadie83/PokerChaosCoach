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

function toPercent(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return 0;
  return Number(((n / d) * 100).toFixed(1));
}

function toDecimal(value, precision = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = 10 ** Math.max(0, Number(precision) || 0);
  return Math.round(num * factor) / factor;
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

const VPIP_ACTION_TYPES = new Set(["call", "raise", "bet", "jam"]);
const PREFLOP_RAISE_ACTION_TYPES = new Set(["raise", "bet", "jam"]);
const POSTFLOP_AGGRESSIVE_TYPES = new Set(["bet", "raise", "jam"]);
const DECISION_ACTION_TYPES = new Set([
  "fold",
  "check",
  "call",
  "bet",
  "raise",
  "jam",
]);

function isDecisionAction(action) {
  const type = String(action?.type || "").toLowerCase();
  if (!type) return false;
  if (type === "collect" || type.startsWith("post_")) return false;
  return DECISION_ACTION_TYPES.has(type);
}

function buildOpponentTags({
  handsSeen,
  enteredPotPct,
  foldedPreflopPct,
  preflopRaisePct,
  foldToPreflopRaisePct,
  facedPreflopRaiseCount,
  postflopAggressionFrequencyPct,
  postflopDecisionCount,
}) {
  const tags = [];
  const pushTag = (code, label) => {
    if (!tags.some((item) => item.code === code)) {
      tags.push({ code, label });
    }
  };

  if (handsSeen < 8) pushTag("small_sample", "Small sample");

  const vpip = Number(enteredPotPct) || 0;
  const pfr = Number(preflopRaisePct) || 0;
  const vpipPfrGap = vpip - pfr;
  const reliablePreflopSample = handsSeen >= 10;
  const reliableFacingOpenSample = facedPreflopRaiseCount >= 6;
  const reliablePostflopSample = postflopDecisionCount >= 10;

  if (reliablePreflopSample) {
    if (vpip >= 45 && pfr >= 28) {
      pushTag("maniac_preflop", "Maniac preflop");
    } else if (vpip >= 32 && pfr >= 22 && vpipPfrGap <= 12) {
      pushTag("lag_preflop", "LAG preflop");
    } else if (vpip >= 34 && pfr <= 16) {
      pushTag("loose_passive", "Loose-passive");
    } else if (vpip <= 16 && pfr <= 12) {
      pushTag("nit_preflop", "Nit preflop");
    } else if (vpip >= 18 && vpip <= 30 && pfr >= 14 && pfr <= 24 && vpipPfrGap <= 10) {
      pushTag("tag_preflop", "TAG preflop");
    } else if (vpip <= 22 && pfr >= 18 && vpipPfrGap <= 6) {
      pushTag("tight_aggressive_preflop", "Tight-aggressive preflop");
    }
  } else if (vpip >= 45) {
    pushTag("loose_preflop_tentative", "Loose preflop (tentative)");
  } else if (vpip <= 12) {
    pushTag("tight_preflop_tentative", "Tight preflop (tentative)");
  }

  if (handsSeen >= 12 && foldedPreflopPct >= 74) {
    pushTag("overfolding_preflop", "Overfolding preflop");
  }
  if (reliableFacingOpenSample && foldToPreflopRaisePct !== null) {
    if (foldToPreflopRaisePct >= 68) {
      pushTag("folds_to_opens", "Folds too much vs opens");
    } else if (foldToPreflopRaisePct <= 38) {
      pushTag("defends_vs_opens_wide", "Defends vs opens wide");
    }
  }

  if (reliablePostflopSample) {
    if (postflopAggressionFrequencyPct >= 45) {
      pushTag("aggressive_postflop", "Aggressive postflop");
    } else if (postflopAggressionFrequencyPct <= 22) {
      pushTag("passive_postflop", "Passive postflop");
    }
    if (postflopAggressionFrequencyPct <= 26 && vpip >= 35) {
      pushTag("call_heavy_postflop", "Call-heavy postflop");
    }
  }

  if (tags.length === 0 || (tags.length === 1 && tags[0].code === "small_sample")) {
    if (vpip >= 34) pushTag("vpip_high", "VPIP high");
    else if (vpip <= 18) pushTag("vpip_low", "VPIP low");
  }

  return tags;
}

function opponentNoteConfidence(handsSeen) {
  const sample = Number(handsSeen) || 0;
  if (sample >= 30) return "high";
  if (sample >= 12) return "medium";
  return "low";
}

function buildOpponentPlayNote({
  handsSeen,
  enteredPotPct,
  foldedPreflopPct,
  preflopRaisePct,
  foldToPreflopRaisePct,
  facedPreflopRaiseCount,
  postflopAggressionFrequencyPct,
  postflopDecisionCount,
  tags,
}) {
  const confidence = opponentNoteConfidence(handsSeen);
  const tagCodes = new Set(
    (Array.isArray(tags) ? tags : [])
      .map((tag) => String(tag?.code || "").trim())
      .filter(Boolean)
  );

  let text = "Use baseline ranges; no strong exploit read yet.";
  if (
    tagCodes.has("overfolding_preflop") ||
    tagCodes.has("folds_to_opens") ||
    (foldedPreflopPct >= 74 && handsSeen >= 12) ||
    (facedPreflopRaiseCount >= 6 &&
      foldToPreflopRaisePct !== null &&
      foldToPreflopRaisePct >= 68)
  ) {
    text = "Steal wider in late position; small opens and c-bets should show profit.";
  } else if (
    tagCodes.has("call_heavy_postflop") ||
    tagCodes.has("passive_postflop") ||
    tagCodes.has("loose_passive") ||
    (postflopDecisionCount >= 8 &&
      postflopAggressionFrequencyPct !== null &&
      postflopAggressionFrequencyPct <= 22)
  ) {
    text = "Value bet thinner and bigger; reduce pure bluffs, especially on later streets.";
  } else if (
    tagCodes.has("maniac_preflop") ||
    tagCodes.has("lag_preflop") ||
    tagCodes.has("aggressive_postflop") ||
    tagCodes.has("defends_vs_opens_wide") ||
    (enteredPotPct >= 38 && preflopRaisePct >= 22)
  ) {
    text = "Tighten marginal continues out of position; trap stronger hands and bluff-catch selectively.";
  } else if (
    tagCodes.has("nit_preflop") ||
    tagCodes.has("tight_preflop_tentative") ||
    tagCodes.has("vpip_low")
  ) {
    text = "Pressure unopened pots and attack capped checking lines from position.";
  } else if (
    tagCodes.has("tag_preflop") ||
    tagCodes.has("tight_aggressive_preflop")
  ) {
    text = "Respect their stronger ranges; take thinner edges in position and avoid punt bluffs.";
  } else if (tagCodes.has("loose_preflop_tentative")) {
    text = "Isolate preflop and play straightforward value-heavy postflop lines.";
  }

  if (confidence === "low") {
    text = `Low confidence: ${text}`;
  }

  return {
    text,
    confidence,
  };
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

export function buildOpponentSnapshot(hands, options = {}) {
  const list = Array.isArray(hands) ? hands : [];
  const minHands =
    Number.isFinite(Number(options.minHands)) && Number(options.minHands) >= 1
      ? Math.floor(Number(options.minHands))
      : 1;
  const fallbackHeroName =
    typeof options.heroName === "string" && options.heroName.trim()
      ? options.heroName.trim()
      : "Hero";
  const latestHand = list.reduce((best, hand) => {
    if (!best) return hand;
    const bestEpoch = Number(best?.playedAtEpoch);
    const handEpoch = Number(hand?.playedAtEpoch);
    if (!Number.isFinite(handEpoch)) return best;
    if (!Number.isFinite(bestEpoch) || handEpoch > bestEpoch) return hand;
    return best;
  }, null);
  const latestHeroName =
    typeof latestHand?.heroName === "string" && latestHand.heroName.trim()
      ? latestHand.heroName.trim()
      : fallbackHeroName;
  const currentTableSeats = Array.isArray(latestHand?.seats)
    ? latestHand.seats
    : [];
  const currentTablePlayers = currentTableSeats
    .filter((seat) => String(seat?.player || "").trim() !== latestHeroName)
    .map((seat) => ({
      player: String(seat?.player || "").trim() || null,
      seat: Number.isFinite(Number(seat?.seat)) ? Number(seat.seat) : null,
      position:
        typeof seat?.position === "string" && seat.position.trim()
          ? seat.position.trim()
          : null,
      chips: Number.isFinite(Number(seat?.chips)) ? Number(seat.chips) : null,
    }))
    .filter((seat) => seat.player);
  const currentTablePlayerSet = new Set(
    currentTablePlayers.map((seat) => seat.player)
  );

  const players = new Map();
  const ensurePlayer = (player) => {
    if (!players.has(player)) {
      players.set(player, {
        player,
        handsSeen: 0,
        enteredPotCount: 0,
        foldedPreflopCount: 0,
        preflopRaiseCount: 0,
        facedPreflopRaiseCount: 0,
        foldToPreflopRaiseCount: 0,
        postflopDecisionCount: 0,
        postflopAggressiveCount: 0,
        postflopCallCount: 0,
        lastSeenAt: null,
        lastSeenAtEpoch: null,
        latestSeatNumber: null,
        latestSeatPosition: null,
        latestStack: null,
        latestTableId: null,
      });
    }
    return players.get(player);
  };

  for (const hand of list) {
    const heroName =
      typeof hand?.heroName === "string" && hand.heroName.trim()
        ? hand.heroName.trim()
        : fallbackHeroName;
    const seats = Array.isArray(hand?.seats) ? hand.seats : [];
    const preflopActions = Array.isArray(hand?.actionsByStreet?.preflop)
      ? hand.actionsByStreet.preflop
      : [];
    const postflopActions = [
      ...(Array.isArray(hand?.actionsByStreet?.flop)
        ? hand.actionsByStreet.flop
        : []),
      ...(Array.isArray(hand?.actionsByStreet?.turn)
        ? hand.actionsByStreet.turn
        : []),
      ...(Array.isArray(hand?.actionsByStreet?.river)
        ? hand.actionsByStreet.river
        : []),
    ];

    for (const seat of seats) {
      const player = String(seat?.player || "").trim();
      if (!player || player === heroName) continue;

      const state = ensurePlayer(player);
      state.handsSeen += 1;

      const playedAtEpoch = Number(hand?.playedAtEpoch);
      if (
        Number.isFinite(playedAtEpoch) &&
        (!Number.isFinite(Number(state.lastSeenAtEpoch)) ||
          playedAtEpoch > Number(state.lastSeenAtEpoch))
      ) {
        state.lastSeenAtEpoch = playedAtEpoch;
        state.lastSeenAt = String(hand?.playedAt || "") || null;
        state.latestSeatNumber = Number.isFinite(Number(seat?.seat))
          ? Number(seat.seat)
          : null;
        state.latestSeatPosition =
          typeof seat?.position === "string" && seat.position.trim()
            ? seat.position.trim()
            : null;
        state.latestStack = Number.isFinite(Number(seat?.chips))
          ? Number(seat.chips)
          : null;
        state.latestTableId =
          typeof hand?.table?.id === "string" && hand.table.id.trim()
            ? hand.table.id.trim()
            : null;
      }

      const playerPreflopActions = preflopActions.filter(
        (action) => String(action?.player || "").trim() === player
      );
      const playerPreflopDecisions = playerPreflopActions.filter((action) =>
        isDecisionAction(action)
      );

      if (
        playerPreflopDecisions.some((action) =>
          VPIP_ACTION_TYPES.has(String(action?.type || "").toLowerCase())
        )
      ) {
        state.enteredPotCount += 1;
      }
      if (
        playerPreflopDecisions.some(
          (action) => String(action?.type || "").toLowerCase() === "fold"
        )
      ) {
        state.foldedPreflopCount += 1;
      }
      if (
        playerPreflopDecisions.some((action) =>
          PREFLOP_RAISE_ACTION_TYPES.has(String(action?.type || "").toLowerCase())
        )
      ) {
        state.preflopRaiseCount += 1;
      }

      const firstPreflopDecisionIndex = preflopActions.findIndex(
        (action) =>
          String(action?.player || "").trim() === player && isDecisionAction(action)
      );
      if (firstPreflopDecisionIndex >= 0) {
        const facedRaise = preflopActions
          .slice(0, firstPreflopDecisionIndex)
          .some(
            (action) =>
              String(action?.player || "").trim() !== player &&
              PREFLOP_RAISE_ACTION_TYPES.has(
                String(action?.type || "").toLowerCase()
              )
          );
        if (facedRaise) {
          state.facedPreflopRaiseCount += 1;
          const firstDecision = preflopActions[firstPreflopDecisionIndex];
          if (String(firstDecision?.type || "").toLowerCase() === "fold") {
            state.foldToPreflopRaiseCount += 1;
          }
        }
      }

      for (const action of postflopActions) {
        if (String(action?.player || "").trim() !== player) continue;
        const type = String(action?.type || "").toLowerCase();
        if (!isDecisionAction(action)) continue;

        state.postflopDecisionCount += 1;
        if (type === "call") state.postflopCallCount += 1;
        if (POSTFLOP_AGGRESSIVE_TYPES.has(type)) {
          state.postflopAggressiveCount += 1;
        }
      }
    }
  }

  const result = Array.from(players.values())
    .filter((state) => state.handsSeen >= minHands)
    .map((state) => {
      const enteredPotPct = toPercent(state.enteredPotCount, state.handsSeen);
      const foldedPreflopPct = toPercent(
        state.foldedPreflopCount,
        state.handsSeen
      );
      const preflopRaisePct = toPercent(
        state.preflopRaiseCount,
        state.handsSeen
      );
      const foldToPreflopRaisePct =
        state.facedPreflopRaiseCount > 0
          ? toPercent(state.foldToPreflopRaiseCount, state.facedPreflopRaiseCount)
          : null;
      const postflopAggressionFrequencyPct =
        state.postflopDecisionCount > 0
          ? toPercent(state.postflopAggressiveCount, state.postflopDecisionCount)
          : null;
      const postflopAggressionFactor =
        state.postflopCallCount > 0
          ? toDecimal(state.postflopAggressiveCount / state.postflopCallCount, 2)
          : null;
      const tagMetrics = {
        handsSeen: state.handsSeen,
        enteredPotPct,
        foldedPreflopPct,
        preflopRaisePct,
        foldToPreflopRaisePct,
        facedPreflopRaiseCount: state.facedPreflopRaiseCount,
        postflopAggressionFrequencyPct:
          postflopAggressionFrequencyPct === null
            ? 0
            : postflopAggressionFrequencyPct,
        postflopDecisionCount: state.postflopDecisionCount,
      };
      const tags = buildOpponentTags(tagMetrics);
      const playNote = buildOpponentPlayNote({
        ...tagMetrics,
        postflopAggressionFrequencyPct,
        tags,
      });

      return {
        player: state.player,
        handsSeen: state.handsSeen,
        lastSeenAt: state.lastSeenAt,
        latestStack: state.latestStack,
        latestTableId: state.latestTableId,
        latestSeat: {
          number: state.latestSeatNumber,
          position: state.latestSeatPosition,
        },
        isCurrentTablePlayer: currentTablePlayerSet.has(state.player),
        enteredPot: {
          pct: enteredPotPct,
          count: state.enteredPotCount,
          total: state.handsSeen,
        },
        foldedPreflop: {
          pct: foldedPreflopPct,
          count: state.foldedPreflopCount,
          total: state.handsSeen,
        },
        preflopRaise: {
          pct: preflopRaisePct,
          count: state.preflopRaiseCount,
          total: state.handsSeen,
        },
        foldToPreflopRaise: {
          pct: foldToPreflopRaisePct,
          count: state.foldToPreflopRaiseCount,
          total: state.facedPreflopRaiseCount,
        },
        postflopAggression: {
          frequencyPct: postflopAggressionFrequencyPct,
          aggressiveActions: state.postflopAggressiveCount,
          calls: state.postflopCallCount,
          decisions: state.postflopDecisionCount,
          factor: postflopAggressionFactor,
        },
        tags,
        playNote,
      };
    })
    .sort((a, b) => {
      if (b.handsSeen !== a.handsSeen) return b.handsSeen - a.handsSeen;
      if (b.enteredPot.pct !== a.enteredPot.pct) {
        return b.enteredPot.pct - a.enteredPot.pct;
      }
      return a.player.localeCompare(b.player);
    });

  return {
    heroName: fallbackHeroName,
    totalHandsTracked: list.length,
    totalOpponents: result.length,
    minHands,
    currentTableGuess: {
      tableId:
        typeof latestHand?.table?.id === "string" && latestHand.table.id.trim()
          ? latestHand.table.id.trim()
          : null,
      maxPlayers: Number.isFinite(Number(latestHand?.table?.maxPlayers))
        ? Number(latestHand.table.maxPlayers)
        : null,
      playedAt:
        typeof latestHand?.playedAt === "string" && latestHand.playedAt.trim()
          ? latestHand.playedAt.trim()
          : null,
      playedAtEpoch: Number.isFinite(Number(latestHand?.playedAtEpoch))
        ? Number(latestHand.playedAtEpoch)
        : null,
      players: currentTablePlayers,
    },
    players: result,
  };
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
    level: hand.level ?? null,
    blindLabel: hand.blindLabel ?? null,
    playedAt: hand.playedAt,
    playedAtEpoch: hand.playedAtEpoch ?? null,
    seats: (Array.isArray(hand.seats) ? hand.seats : []).map((seat) => ({
      seat: seat?.seat ?? null,
      player: seat?.player ?? null,
      position: seat?.position ?? null,
      chips: seat?.chips ?? null,
    })),
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
