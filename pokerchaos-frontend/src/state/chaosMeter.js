const STREET_ORDER = ["preflop", "flop", "turn", "river"];

function streetIndex(street) {
  const i = STREET_ORDER.indexOf(String(street || "").toLowerCase());
  return i >= 0 ? i : 0;
}

function countAggroEvents(previous = []) {
  const needles = [
    "3bet",
    "4bet",
    "raise",
    "shove",
    "jam",
    "faced_bet",
    "opp_raise",
    "opp_shove"
  ];
  const joined = previous.join(" ");
  return needles.reduce((n, term) => (joined.includes(term) ? n + 1 : n), 0);
}

export function computeChaosScore(state) {
  const base = streetIndex(state.street);
  const aggr = Math.min(Number(state.aggressors || 0), 2);
  const events = Math.min(countAggroEvents(state.previousActions || []), 2);
  let score = base + aggr + events;
  const last = (state.previousActions || []).slice(-1)[0] || "";
  if (/opp_shove|opp_4bet|jam/.test(last)) score += 2;
  if (score < 0) score = 0;
  if (score > 5) score = 5;
  return score;
}

export function chaosFace(score) {
  const faces = ["🙂", "😌", "😏", "😈", "🔥😈", "🤯🔥"];
  return faces[score] ?? faces[0];
}

export function getChaosMood(state) {
  const level = computeChaosScore(state);
  return { level, emoji: chaosFace(level) };
}

