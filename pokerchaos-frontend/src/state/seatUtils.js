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
  const count = Math.max(2, Math.min(9, Number(size) || 8));
  return {
    2: ["BTN", "BB"],
    3: ["BTN", "SB", "BB"],
    4: ["CO", "BTN", "SB", "BB"],
    5: ["UTG", "CO", "BTN", "SB", "BB"],
    6: ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
    7: ["UTG", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
    8: ["UTG", "UTG+1", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
    9: ["UTG", "UTG+1", "UTG+2", "LJ", "HJ", "CO", "BTN", "SB", "BB"],
  }[count];
}

export function occupiedScreenSeats(physicalSeatCount = 8, absentSeats = []) {
  const count = Math.max(2, Math.min(10, Number(physicalSeatCount) || 8));
  const absent = new Set((Array.isArray(absentSeats) ? absentSeats : []).map(Number));
  absent.delete(0);
  return Array.from({ length: count }, (_, seat) => seat).filter((seat) => !absent.has(seat));
}

export function previousSeatForNextHand(seat, size = 8) {
  const seats = seatsForTableSize(Number(size));
  const currentIndex = seats.indexOf(normalizeSeat(seat));
  if (currentIndex < 0) return normalizeSeat(seat);
  return seats[(currentIndex - 1 + seats.length) % seats.length];
}

// Local vision labels screen seats clockwise from Hero: Hero=0, V1, V2...
export function localBlindSeats(heroSeat, size = 8, absentSeats = [], physicalSeatCount = size) {
  const seats = seatsForTableSize(Number(size));
  const occupied = occupiedScreenSeats(physicalSeatCount, absentSeats);
  const heroIndex = seats.indexOf(normalizeSeat(heroSeat));
  const sbIndex = seats.indexOf("SB");
  const bbIndex = seats.indexOf("BB");
  if (heroIndex < 0 || sbIndex < 0 || bbIndex < 0 || occupied.length !== seats.length) return null;
  return {
    sb: occupied[(sbIndex - heroIndex + seats.length) % seats.length],
    bb: occupied[(bbIndex - heroIndex + seats.length) % seats.length],
  };
}

export function heroSeatFromDealerScreenSeat(dealerScreenSeat, size = 8, absentSeats = [], physicalSeatCount = size) {
  const seats = seatsForTableSize(Number(size));
  const occupied = occupiedScreenSeats(physicalSeatCount, absentSeats);
  const dealerSeat = Number(dealerScreenSeat);
  const dealerOffset = occupied.indexOf(dealerSeat);
  const buttonIndex = seats.indexOf("BTN");
  if (!Number.isInteger(dealerSeat) || dealerOffset < 0 || buttonIndex < 0 || occupied.length !== seats.length) return null;
  return seats[(buttonIndex - dealerOffset + seats.length) % seats.length];
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
