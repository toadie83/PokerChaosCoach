const POS_ORDER_8MAX = ["UTG", "UTG+1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

export function normalizeSeat(seat) {
  const s = String(seat || "").trim().toUpperCase();
  if (POS_ORDER_8MAX.includes(s)) return s;
  const map = { MP: "UTG+1" };
  return map[s] || s;
}

export function actsFirstOnStreet(street, seat) {
  if (street === "preflop") return false;
  const s = normalizeSeat(seat);
  return s === "SB" || s === "BB";
}

export function seatsForTableSize(size) {
  if (size <= 6) {
    return ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  }
  if (size === 8) {
    return ["UTG", "UTG+1", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  }
  // 9-max or more
  return ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
}

export function positionCategory(seat, size = 8) {
  const s = normalizeSeat(seat);
  const late = new Set(["BTN"]);
  const middle = new Set(["CO", "HJ"]);
  const early = new Set(["UTG", "UTG+1", "UTG+2", "LJ", "SB", "BB"]);
  if (late.has(s)) return "late";
  if (middle.has(s)) return "middle";
  if (early.has(s)) return "early";
  return "middle";
}
