// Screen seats remain fixed; poker positions are deliberately not guessed
// when occupancy or the dealer anchor is uncertain.
const LEGACY_TURBO_REGIONS = [
  { panel: [0.43, 0.80, 0.15, 0.13], bet: [0.46, 0.64, 0.10, 0.05], cards: [0.44, 0.70, 0.14, 0.13] },
  { panel: [0.15, 0.68, 0.14, 0.12], bet: [0.28, 0.58, 0.10, 0.05], cards: [0.14, 0.57, 0.13, 0.13] },
  { panel: [0.01, 0.43, 0.14, 0.12], bet: [0.15, 0.47, 0.10, 0.05], cards: [0.00, 0.34, 0.13, 0.14] },
  { panel: [0.17, 0.21, 0.13, 0.11], bet: [0.29, 0.33, 0.10, 0.05], cards: [0.16, 0.10, 0.13, 0.14] },
  { panel: [0.43, 0.15, 0.14, 0.11], bet: [0.45, 0.30, 0.10, 0.05], cards: [0.42, 0.04, 0.14, 0.14] },
  { panel: [0.71, 0.20, 0.14, 0.12], bet: [0.62, 0.33, 0.10, 0.05], cards: [0.70, 0.10, 0.14, 0.14] },
  { panel: [0.86, 0.43, 0.13, 0.12], bet: [0.78, 0.47, 0.08, 0.05], cards: [0.84, 0.34, 0.15, 0.14] },
  { panel: [0.73, 0.69, 0.14, 0.11], bet: [0.64, 0.60, 0.10, 0.05], cards: [0.70, 0.57, 0.14, 0.13] },
];

// The GG dealer puck sits clockwise and inward from each player panel. These
// are deliberately small search windows; users can refine them in calibration.
const DEFAULT_DEALER_REGIONS = [
  [0.39, 0.54, 0.09, 0.10],
  [0.25, 0.51, 0.09, 0.10],
  [0.18, 0.31, 0.09, 0.10],
  [0.32, 0.24, 0.09, 0.10],
  [0.52, 0.23, 0.09, 0.10],
  [0.62, 0.25, 0.09, 0.10],
  [0.75, 0.48, 0.09, 0.10],
  [0.62, 0.61, 0.09, 0.10],
];

function derivedRegion(panel, type) {
  const [x, y, width, height] = panel;
  if (type === "action") {
    return [x + width * 0.2, y + height * 0.32, width * 0.6, Math.max(0.02, height * 0.26)];
  }
  return [x + width * 0.15, y + height * 0.7, width * 0.7, Math.max(0.02, height * 0.24)];
}

export function normalizeTurboRegions(regions) {
  if (!Array.isArray(regions) || regions.length !== 8 || regions.some((region) =>
    !region || !Array.isArray(region.panel) || region.panel.length !== 4 ||
    !Array.isArray(region.bet) || region.bet.length !== 4 ||
    !Array.isArray(region.cards) || region.cards.length !== 4
  )) return null;
  return regions.map((region, seat) => ({
    ...region,
    action: region?.action || derivedRegion(region.panel, "action"),
    stack: region?.stack || derivedRegion(region.panel, "stack"),
    dealer: region?.dealer || DEFAULT_DEALER_REGIONS[seat],
    totalPot:
      seat === 0 && Array.isArray(region?.totalPot)
        ? region.totalPot
        : null,
  }));
}

export const DEFAULT_TURBO_REGIONS = normalizeTurboRegions(LEGACY_TURBO_REGIONS);

export function validTurboRegions(regions) {
  const validRect = r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) &&
    r[0] >= 0 && r[1] >= 0 && r[2] >= 0.02 && r[3] >= 0.02 &&
    r[0] + r[2] <= 1.001 && r[1] + r[3] <= 1.001;
  return Array.isArray(regions) && regions.length === 8 && regions.every(r =>
    r && validRect(r.panel) && validRect(r.bet) && validRect(r.cards) &&
    validRect(r.action) && validRect(r.stack) && validRect(r.dealer) &&
    (r.totalPot === null || validRect(r.totalPot)));
}

export function tablePositions(seats) {
  if (seats.length !== 8 || new Set(seats.map(s => s.seat)).size !== 8 ||
    seats.some(s => s.occupied === null || s.confidence !== "high")) return {};
  const occupied = seats.filter(s => s.occupied).sort((a, b) => a.seat - b.seat);
  const buttons = occupied.filter(s => s.dealer === true);
  // Heads-up, dead-button, and short-table conventions need separate validation.
  if (buttons.length !== 1 || occupied.length < 3) return {};
  const labels = {
    3: ["BTN", "SB", "BB"], 4: ["BTN", "SB", "BB", "UTG"],
    5: ["BTN", "SB", "BB", "UTG", "CO"],
    6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
    7: ["BTN", "SB", "BB", "UTG", "LJ", "HJ", "CO"],
    8: ["BTN", "SB", "BB", "UTG", "UTG+1", "LJ", "HJ", "CO"],
  }[occupied.length];
  const start = occupied.findIndex(s => s.dealer);
  return Object.fromEntries(labels.map((label, i) => [occupied[(start + i) % occupied.length].seat, label]));
}

export function observationChanges(previous, current) {
  if (!previous) return ["First snapshot; earlier action history is unknown."];
  const changes = [];
  if (previous.street !== current.street) changes.push(`Street observed: ${current.street}.`);
  for (const seat of current.seats) {
    const before = previous.seats.find(s => s.seat === seat.seat);
    if (!before || seat.confidence !== "high") continue;
    const label = seat.seat === 0 ? "Hero" : `V${seat.seat}`;
    if (before.name && seat.name && before.name !== seat.name) {
      changes.push(`${label}: occupant changed; continuity unknown.`);
      continue;
    }
    if (seat.action !== "unknown" && seat.action !== before.action)
      changes.push(`${label}: visible ${seat.action} label.`);
    if (seat.contributionBB !== null && seat.contributionBB !== before.contributionBB)
      changes.push(`${label}: ${seat.contributionBB} BB visible on felt.`);
    if (seat.stackBB !== null && seat.stackBB !== before.stackBB)
      changes.push(`${label}: ${seat.stackBB} BB behind.`);
  }
  return changes;
}
