import OpenAI from "openai";

let openaiClient = null;
function getClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function getAggressionPrompt(context = {}, instruction) {
  // Style tone per context.style
  const styleTone = (() => {
    switch (context?.style) {
      case "controlled_maniac":
        return "Tone: measured chaos — confident but strategic aggression.";
      case "villain_mode":
        return "Tone: theatrical villain — cocky, taunting, fearless.";
      case "chaos_shark":
      default:
        return "Tone: primal shark — fearless, hungry, relentless.";
    }
  })();

  const system = `You are ChaosCoach — an AI poker hype bot.
You never reference hole cards, board cards, math, or odds.
You always respond with valid JSON only — no markdown or commentary.

${styleTone}

Output strict JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: one of "open","call","3-bet","4-bet","check","bet","raise","jam","fold" (aggressive bias)
- sizing: fun, loose, or odd (e.g. "4x open","77% pot","133% overbet","4.7x squeeze")
- flavor_text: short, hype-driven, max 20 words.
- No card or probability mentions.
- If context.history is present, use it to maintain narrative consistency (e.g., keep sizing vibe, mix traps after heavy aggression). Do not repeat the history; just incorporate its signal into the next JSON output.`;

  // Deterministic mix mode for variety
  const mixHint = (() => {
    try {
      const branch = String(context?.branch || "");
      const n = (context?.previousActions?.length ?? 0) + branch.length;
      const bucket = n % 7;
      if (bucket === 0)
        return "Mix mode: trap — favor checks/calls that invite mistakes.";
      if (bucket === 1)
        return "Mix mode: oddsize — favor eye-catching sizes like 61%, 77%, 133%, or 4.7x.";
      if (bucket === 2)
        return "Mix mode: level — favor deceptive actions (check-raise, small bet, slowplay).";
      if (bucket === 3)
        return "Mix mode: dominance — assume strong image, prefer maximum pressure lines.";
      return "Mix mode: pressure — assertive aggression with occasional pauses.";
    } catch {
      return "Mix mode: pressure";
    }
  })();

  // Lightweight hype level to ramp tone
  const hypeLevel = Math.min((context?.previousActions?.length ?? 0) * 5, 100);

  // Summarize history for compact, deterministic hinting
  function summarizeHistory(history) {
    try {
      if (!Array.isArray(history) || history.length === 0) return "";
      const lastHero = [...history].reverse().find((h) => h?.actor === "hero");
      const lastOpp = [...history].reverse().find((h) => h?.actor === "opp");
      const aggrWords = [
        "bet",
        "raise",
        "jam",
        "3-bet",
        "4-bet",
        "open",
        "squeeze",
      ];
      const aggr = history.reduce(
        (n, h) =>
          n +
          (aggrWords.some((w) =>
            String(h?.action || "")
              .toLowerCase()
              .includes(w)
          )
            ? 1
            : 0),
        0
      );
      const oddSize = history.some((h) => {
        const s = h?.sizing;
        if (!s || s.value == null) return false;
        if (s.kind === "x")
          return Math.abs(s.value - Math.round(s.value)) > 0.05; // non-round x
        if (s.kind === "pct") {
          const common = [0.5, 0.66, 0.75, 1.0, 1.33];
          return !common.some((v) => Math.abs(v - s.value) < 0.02);
        }
        return false;
      });
      const parts = [];
      if (lastHero)
        parts.push(
          `last_hero=${lastHero.action}${
            lastHero.sizing
              ? `(${lastHero.sizing.kind}:${lastHero.sizing.value})`
              : ""
          }`
        );
      if (lastOpp) parts.push(`last_opp=${lastOpp.action}`);
      parts.push(`agg=${aggr}`);
      if (oddSize) parts.push("theme=oddsize");
      return parts.join(", ");
    } catch {
      return "";
    }
  }

  // Sizing cue to add variety for preflop opens (and simple 3-bet prefs)
  function sizingCue(ctx) {
    try {
      const branch = String(ctx?.branch || "");
      const seat = String(ctx?.heroSeat || "").toUpperCase();
      const size = Number(ctx?.tableSize || 8);
      // Preflop unopened or hero opened -> open size guidance
      if (
        branch.startsWith("preflop_unopened") ||
        branch.startsWith("preflop_hero_opened")
      ) {
        const lateSeats = new Set(["BTN", "CO"]);
        const midSeats = new Set(["HJ", "LJ"]);
        const epSeats = new Set(["UTG", "UTG+1", "UTG+2"]);
        const optionsLate = ["2.2x", "2.3x", "2.5x", "2.7x", "3x"]; // BTN/CO
        const optionsMid = ["2.5x", "2.7x", "3x", "3.2x", "3.5x"]; // HJ/LJ
        const optionsEP = ["2.7x", "3x", "3.2x", "3.5x", "3.8x"]; // UTG variants
        // Slightly larger in 9-max games
        const bump = (arr) =>
          size >= 9
            ? arr.map((v) => v.replace("2.", "2.").replace("3.", "3."))
            : arr;
        let pool = optionsMid;
        if (lateSeats.has(seat)) pool = optionsLate;
        else if (epSeats.has(seat)) pool = optionsEP;
        // Deterministic pick index using mix bucket
        const branchLen = branch.length;
        const prevCount = ctx?.previousActions?.length ?? 0;
        const idx = (branchLen + prevCount) % pool.length;
        const preferred = pool[idx];
        return `Open Size Preferences: ${pool.join(
          ", "
        )}. Prefer: ${preferred}.`;
      }
      // Facing open -> 3-bet guidance (rough, position-aware)
      if (branch.startsWith("preflop_opened_to_me")) {
        const inPos = new Set(["BTN", "CO"]);
        const outPos = new Set(["SB", "BB"]);
        const poolIP = ["3x", "3.3x", "3.5x", "3.7x"]; // in position vs open size
        const poolOOP = ["4x", "4.3x", "4.5x"]; // out of position
        const pool = inPos.has(seat)
          ? poolIP
          : outPos.has(seat)
          ? poolOOP
          : ["3.5x", "3.8x", "4x"]; // default mid
        const idx =
          ((ctx?.previousActions?.length ?? 0) + branch.length) % pool.length;
        const preferred = pool[idx];
        return `3-Bet Size Preferences: ${pool.join(
          ", "
        )}. Prefer: ${preferred}.`;
      }
    } catch {}
    return "";
  }

  const sizingPref = sizingCue(context);
  const historyHint = summarizeHistory(context?.history);

  const user = `Context: ${JSON.stringify(
    context || {},
    null,
    2
  )}\n${mixHint}\n${sizingPref ? `${sizingPref}\n` : ""}${
    historyHint ? `History Hint: ${historyHint}\n` : ""
  }Hype Level: ${hypeLevel}\nInstruction: ${
    instruction ||
    "Suggest the next aggressive or deceptive action for this branch."
  }`;

  const completion = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.6,
    top_p: 0.85,
    max_tokens: 120,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  });

  const choice = completion.choices?.[0]?.message;
  const content = choice?.content?.trim() || "";
  const parsed =
    (choice && Object.prototype.hasOwnProperty.call(choice, "parsed")
      ? choice.parsed
      : undefined) || safeJsonParse(content);

  const validActions = [
    "open",
    "call",
    "3-bet",
    "4-bet",
    "check",
    "bet",
    "raise",
    "jam",
    "fold",
  ];

  if (!parsed && process.env.DEBUG_AI_OUTPUTS === "true") {
    console.warn("[ChaosCoach] Raw AI output (unparsed):", content);
  }

  let hero_action = String(parsed?.hero_action || "aggress").trim();
  const normalized = hero_action.toLowerCase();
  if (!validActions.includes(normalized)) {
    hero_action = "aggress";
  }
  const sizing = String(parsed?.sizing || "pot").trim();
  const flavor_text = String(parsed?.flavor_text || "Apply pressure.").trim();
  const usage = completion.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;
  return { hero_action, sizing, flavor_text, usage };
}
