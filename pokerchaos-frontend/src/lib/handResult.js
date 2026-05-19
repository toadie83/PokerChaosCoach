const STREET_ORDER = ["preflop", "flop", "turn", "river"];

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizePlayerName(value) {
  return String(value || "").trim().toLowerCase();
}

function isHeroAction(action, heroName) {
  const player = normalizePlayerName(action?.player);
  if (!player) return false;
  const normalizedHero = normalizePlayerName(heroName);
  if (normalizedHero && player === normalizedHero) return true;
  return player === "hero";
}

function heroInvestedChips(hand) {
  const heroName = hand?.heroName;
  let invested = 0;

  for (const street of STREET_ORDER) {
    const actions = Array.isArray(hand?.actionsByStreet?.[street])
      ? hand.actionsByStreet[street]
      : [];
    let committedThisStreet = 0;

    for (const action of actions) {
      if (!isHeroAction(action, heroName)) continue;

      const type = String(action?.type || "").trim().toLowerCase();
      const amount = toFiniteNumber(action?.amount);
      const toAmount = toFiniteNumber(action?.toAmount);

      if (
        type === "post_ante" ||
        type === "post_small_blind" ||
        type === "post_big_blind"
      ) {
        if (amount && amount > 0) {
          invested += amount;
          if (type !== "post_ante") {
            committedThisStreet += amount;
          }
        }
        continue;
      }

      if (type === "call" || type === "bet") {
        if (amount && amount > 0) {
          invested += amount;
          committedThisStreet += amount;
        }
        continue;
      }

      if (type === "return_uncalled") {
        if (amount && amount > 0) {
          invested -= amount;
          committedThisStreet = Math.max(0, committedThisStreet - amount);
        }
        continue;
      }

      if (type === "raise" || type === "jam") {
        if (toAmount && toAmount > 0) {
          const delta = Math.max(0, toAmount - committedThisStreet);
          invested += delta;
          committedThisStreet = Math.max(committedThisStreet, toAmount);
          continue;
        }
        if (amount && amount > 0) {
          invested += amount;
          committedThisStreet += amount;
        }
      }
    }
  }

  return invested;
}

export function resolveHandBbResult(hand) {
  const bigBlind = toFiniteNumber(hand?.blinds?.bigBlind);
  if (!bigBlind || bigBlind <= 0) {
    return {
      available: false,
      bb: null,
      label: "-",
      tone: "neutral",
      netChips: null,
    };
  }

  const invested = heroInvestedChips(hand);
  const wonAmount =
    toFiniteNumber(hand?.heroOutcome?.wonAmount) ??
    toFiniteNumber(hand?.heroResult?.wonAmount) ??
    0;
  const netChips = wonAmount - invested;
  const rawBb = netChips / bigBlind;
  const bb = Math.abs(rawBb) < 0.05 ? 0 : rawBb;
  const label = `${bb > 0 ? "+" : ""}${bb.toFixed(1)}bb`;
  const tone = bb > 0 ? "good" : bb < 0 ? "bad" : "neutral";

  return {
    available: true,
    bb,
    label,
    tone,
    netChips,
  };
}
