function parseMultiplier(text) {
  const m = String(text || "").match(/([0-9]+(?:\.[0-9]+)?)\s*x/i);
  return m ? parseFloat(m[1]) : null;
}

function parsePercent(text) {
  const m = String(text || "").match(/([0-9]+(?:\.[0-9]+)?)\s*%/i);
  return m ? parseFloat(m[1]) / 100 : null;
}

export function parseSizing(text) {
  const mult = parseMultiplier(text);
  if (mult) return { kind: "multiplier", value: mult };
  const pct = parsePercent(text);
  if (pct) return { kind: "percent", value: pct };
  const t = String(text || "").toLowerCase();
  if (/(^|\s)pot(\s|$)/.test(t)) return { kind: "percent", value: 1 };
  if (/half/.test(t)) return { kind: "percent", value: 0.5 };
  if (/third/.test(t)) return { kind: "percent", value: 1 / 3 };
  if (/quarter/.test(t)) return { kind: "percent", value: 0.25 };
  if (/overbet/.test(t)) return { kind: "percent", value: 1.25 };
  return { kind: "unknown", value: null };
}

export function inferPreflopCallers(previousActions = []) {
  const last = previousActions.slice().reverse().find((a) => a.startsWith("preflop_")) || "";
  if (last.includes("opp_multi_call")) return 2;
  if (last.includes("opp_one_call")) return 1;
  return 0;
}

export function computeSizingNote(state, coach) {
  try {
    if (!coach) return null;
    const { hero_action, sizing } = coach;
    const street = state.street;
    const parsed = parseSizing(sizing);
    const open = Number(state.openSize || 2.5);

    // Preflop open sizing
    if (street === "preflop" && /open/i.test(hero_action || "")) {
      if (parsed.kind === "multiplier" && parsed.value) {
        const toBB = parsed.value;
        const callers = inferPreflopCallers(state.previousActions);
        const potBefore = 1.5 + open * callers; // before hero opens
        const potRatio = toBB / Math.max(0.5, potBefore);
        return `≈ ${toBB.toFixed(1)}bb (≈ ${potRatio.toFixed(2)}× pot${callers ? ` with ${callers} caller${callers>1?'s':''}`: ''})`;
      }
      return null;
    }

    // Preflop 3-bet sizing
    if (street === "preflop" && /(3\s*-?bet|squeeze|re-?raise)/i.test(hero_action || "")) {
      if (parsed.kind === "multiplier" && parsed.value) {
        const toBB = parsed.value * open; // vs open size
        const callers = inferPreflopCallers(state.previousActions);
        const potBefore = 1.5 + open * (1 + callers); // blinds + open + callers
        const potRatio = toBB / Math.max(0.5, potBefore);
        return `≈ ${toBB.toFixed(1)}bb (≈ ${potRatio.toFixed(2)}× pot${callers ? ` with ${callers} caller${callers>1?'s':''}`: ''})`;
      }
      return null;
    }

    // Postflop percent-based sizing → just show pot ratio
    if (parsed.kind === "percent" && parsed.value) {
      return `≈ ${(parsed.value * 100).toFixed(0)}% pot`;
    }
    // Postflop multiplier with no context → relative to bet
    if (parsed.kind === "multiplier" && parsed.value) {
      return `≈ ${parsed.value.toFixed(1)}× bet`;
    }
    return null;
  } catch {
    return null;
  }
}

