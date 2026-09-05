const EARLIEST_HAND_DATE = Date.UTC(2000, 0, 1);
const POSITION_ORDER = ["UTG", "UTG+1", "UTG+2", "EP", "LJ", "MP", "HJ", "CO", "BTN", "SB", "BB"];

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function handTimestamp(hand) {
  const direct = finiteNumber(hand?.playedAtEpoch);
  if (direct !== null && direct >= EARLIEST_HAND_DATE) return direct;
  const raw = String(hand?.playedAt || "").trim();
  const match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const epoch = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
  const date = new Date(epoch);
  if (
    epoch < EARLIEST_HAND_DATE ||
    date.getUTCFullYear() !== parts[0] || date.getUTCMonth() !== parts[1] - 1 ||
    date.getUTCDate() !== parts[2] || date.getUTCHours() !== parts[3] ||
    date.getUTCMinutes() !== parts[4] || date.getUTCSeconds() !== parts[5]
  ) return null;
  return epoch;
}

/** Start-of-hand stacks only. Missing stacks and tournament changes break the line. */
export function buildStackSeries(hands = []) {
  const source = (Array.isArray(hands) ? hands : []).map((hand, sourceIndex) => {
    const chips = finiteNumber(hand?.heroStack);
    const bigBlind = finiteNumber(hand?.blinds?.bigBlind);
    const stackBb = chips !== null && chips >= 0 && bigBlind !== null && bigBlind > 0
      ? chips / bigBlind
      : null;
    return {
      sourceIndex,
      handId: String(hand?.handId || `Hand ${sourceIndex + 1}`),
      tournamentId: String(hand?.tournamentId || ""),
      epoch: handTimestamp(hand),
      stackBb: Number.isFinite(stackBb) ? stackBb : null,
    };
  });
  const dated = source.filter((point) => point.epoch !== null);
  // If no timestamps are available, label the supplied order explicitly.
  const chronological = dated.length > 0;
  const ordered = chronological
    ? [...dated].sort((a, b) => a.epoch - b.epoch || a.sourceIndex - b.sourceIndex)
    : source;
  const points = ordered.map((point, index) => ({ ...point, index }));
  const validPoints = points.filter((point) => point.stackBb !== null);
  const segments = [];
  let segment = [];
  for (const point of points) {
    const previous = segment[segment.length - 1];
    if (point.stackBb === null || (previous && previous.tournamentId !== point.tournamentId)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (point.stackBb !== null) segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return {
    points,
    validPoints,
    segments,
    ordering: chronological ? "chronological" : "import",
    undatedCount: source.length - dated.length,
    omittedUndatedCount: chronological ? source.length - dated.length : 0,
    missingStackCount: points.length - validPoints.length,
    tournamentCount: new Set(points.map((point) => point.tournamentId).filter(Boolean)).size,
    maxStackBb: validPoints.reduce((max, point) => Math.max(max, point.stackBb), 0),
  };
}

export function buildPositionFrequencies(summary, mode = "open") {
  const rows = mode === "defend"
    ? summary?.preflopBreakdown?.defendByPositionRows
    : summary?.preflopBreakdown?.openByPositionRows;
  const numeratorKey = mode === "defend" ? "defends" : "opens";
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const spots = finiteNumber(row?.spots);
      const count = finiteNumber(row?.[numeratorKey]);
      if (spots === null || spots <= 0 || count === null || count < 0 || count > spots) return null;
      return {
        position: String(row?.position || "Unknown"),
        count,
        spots,
        percent: (count / spots) * 100,
        smallSample: spots < 8,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const rank = (position) => {
        const index = POSITION_ORDER.indexOf(position);
        return index < 0 ? POSITION_ORDER.length : index;
      };
      return rank(a.position) - rank(b.position) || a.position.localeCompare(b.position);
    });
}
