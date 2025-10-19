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

const VALID_ACTIONS = [
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

const RANK_VALUES = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};

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

function buildStyleTone(style) {
  switch (style) {
    case "controlled_maniac":
      return "Tone: measured chaos - confident but strategic aggression.";
    case "villain_mode":
      return "Tone: theatrical villain - cocky, taunting, fearless.";
    case "chaos_shark":
    default:
      return "Tone: primal shark - fearless, hungry, relentless.";
  }
}

function buildMixHint(context) {
  try {
    const branch = String(context?.branch || "");
    const historyCount = context?.previousActions?.length ?? 0;
    let n = historyCount + branch.length;
    if (branch.startsWith("preflop_opened_to_me")) {
      n += 3;
    }
    const bucket = n % 7;
    if (bucket === 0) return "Mix mode: trap - favor checks and calls that invite mistakes.";
    if (bucket === 1) return "Mix mode: oddsize - pick eye-catching sizes like 61%, 77%, 133%, or 4.7x.";
    if (bucket === 2) return "Mix mode: level - favor deceptive moves (check-raise, small bet, slow play).";
    if (bucket === 3) return "Mix mode: dominance - assume strong image and keep maximum pressure on.";
    return "Mix mode: pressure - assertive aggression with calculated pauses.";
  } catch {
    return "Mix mode: pressure";
  }
}

function sizingCue(ctx) {
  try {
    const branch = String(ctx?.branch || "");
    const seat = String(ctx?.heroSeat || "").toUpperCase();
    const size = Number(ctx?.tableSize || 8);
    if (
      branch.startsWith("preflop_unopened") ||
      branch.startsWith("preflop_hero_opened")
    ) {
      const lateSeats = new Set(["BTN", "CO"]);
      const midSeats = new Set(["HJ", "LJ"]);
      const epSeats = new Set(["UTG", "UTG+1", "UTG+2"]);
      const optionsLate = ["2.2x", "2.3x", "2.5x", "2.7x", "3x"];
      const optionsMid = ["2.5x", "2.7x", "3x", "3.2x", "3.5x"];
      const optionsEP = ["2.7x", "3x", "3.2x", "3.5x", "3.8x"];
      const bump = (arr) =>
        size >= 9
          ? arr.map((v) => v.replace("2.", "2.").replace("3.", "3."))
          : arr;
      let pool = bump(optionsMid);
      if (lateSeats.has(seat)) pool = bump(optionsLate);
      else if (epSeats.has(seat)) pool = bump(optionsEP);
      const branchLen = branch.length;
      const prevCount = ctx?.previousActions?.length ?? 0;
      const idx = (branchLen + prevCount) % pool.length;
      const preferred = pool[idx];
      return `Open size preferences: ${pool.join(", ")}. Prefer: ${preferred}.`;
    }
    if (branch.startsWith("preflop_opened_to_me")) {
      const inPos = new Set(["BTN", "CO"]);
      const outPos = new Set(["SB", "BB"]);
      const poolIP = ["3x", "3.3x", "3.5x", "3.7x"];
      const poolOOP = ["4x", "4.3x", "4.5x"];
      const pool = inPos.has(seat)
        ? poolIP
        : outPos.has(seat)
        ? poolOOP
        : ["3.5x", "3.8x", "4x"];
      const idx =
        ((ctx?.previousActions?.length ?? 0) + branch.length) % pool.length;
      const preferred = pool[idx];
      return `3-bet size preferences: ${pool.join(", ")}. Prefer: ${preferred}.`;
    }
  } catch {}
  return "";
}

function formatHeroHand(context = {}) {
  const raw = typeof context?.heroHand === "string" ? context.heroHand.trim() : "";
  if (raw && raw.length >= 4) {
    const compact = raw.replace(/\s+/g, "");
    const readable = raw.length === 4 ? `${raw.slice(0, 2)} ${raw.slice(2)}` : raw;
    return { compact, readable };
  }
  const cards = context?.heroCards || {};
  const c1 = cards.card1;
  const c2 = cards.card2;
  if (!c1 || !c2) return { compact: null, readable: null };
  const compact = `${String(c1)}${String(c2)}`.replace(/\s+/g, "");
  const readable = `${c1} ${c2}`;
  return { compact, readable };
}

function describeHand(compact) {
  if (!compact || compact.length < 4) return null;
  const rank1 = compact[0]?.toUpperCase();
  const suit1 = compact[1]?.toLowerCase();
  const rank2 = compact[2]?.toUpperCase();
  const suit2 = compact[3]?.toLowerCase();
  if (!rank1 || !rank2 || !suit1 || !suit2) return null;
  if (rank1 === rank2) return `${rank1}${rank2} pocket pair`;
  const suited = suit1 === suit2;
  return `${rank1}${rank2} ${suited ? "suited" : "offsuit"}`;
}

function sortRanksDescending(rankA, rankB) {
  const a = RANK_VALUES[rankA] || 0;
  const b = RANK_VALUES[rankB] || 0;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function categorizeRangeHand(compact) {
  if (!compact || compact.length < 4) {
    return { tier: "unknown", label: "unknown hand" };
  }
  const r1 = compact[0]?.toUpperCase();
  const s1 = compact[1]?.toLowerCase();
  const r2 = compact[2]?.toUpperCase();
  const s2 = compact[3]?.toLowerCase();
  if (!RANK_VALUES[r1] || !RANK_VALUES[r2]) {
    return { tier: "unknown", label: "unknown hand" };
  }
  const pair = r1 === r2;
  const suited = s1 === s2;
  const ranks = [r1, r2].sort(sortRanksDescending);
  const hi = ranks[0];
  const lo = ranks[1];
  const hiVal = RANK_VALUES[hi];
  const loVal = RANK_VALUES[lo];
  const gap = Math.max(0, hiVal - loVal - 1);

  if (pair) {
    if (hiVal >= 13) return { tier: "premium", label: `${hi}${hi} premium pair` };
    if (hiVal >= 11) return { tier: "strong", label: `${hi}${hi} strong pair` };
    if (hiVal >= 9) return { tier: "medium", label: `${hi}${hi} medium pair` };
    if (hiVal >= 6) return { tier: "marginal", label: `${hi}${hi} small pair` };
    return { tier: "trash", label: `${hi}${hi} bottom pair` };
  }

  if (suited) {
    if (hiVal >= 13 && loVal >= 11) return { tier: "premium", label: `${hi}${lo}s premium suited` };
    if (hiVal >= 12 && loVal >= 9) return { tier: "strong", label: `${hi}${lo}s strong suited` };
    if (hiVal >= 11 && loVal >= 7 && gap <= 3)
      return { tier: "medium", label: `${hi}${lo}s playable suited connector` };
    if (hiVal >= 10 && loVal >= 6 && gap <= 4)
      return { tier: "marginal", label: `${hi}${lo}s speculative suited` };
    return { tier: "trash", label: `${hi}${lo}s weak suited` };
  }

  // offsuit
  if (hiVal >= 14 && loVal >= 11) return { tier: "strong", label: `${hi}${lo}o strong offsuit broadway` };
  if (hiVal >= 13 && loVal >= 10 && gap <= 2)
    return { tier: "medium", label: `${hi}${lo}o playable offsuit broadway` };
  if (hiVal >= 12 && loVal >= 9 && gap <= 3)
    return { tier: "marginal", label: `${hi}${lo}o marginal offsuit` };
  return { tier: "trash", label: `${hi}${lo}o offsuit trash` };
}

function positionCategory(seat) {
  const s = String(seat || "").toUpperCase();
  if (!s) return "unknown";
  if (["BTN", "CO"].includes(s)) return "late";
  if (["HJ", "LJ"].includes(s)) return "mid";
  if (["UTG", "UTG+1", "UTG+2"].includes(s)) return "early";
  if (["SB", "BB"].includes(s)) return "blind";
  return "unknown";
}

function actionContext(previousActions = [], branch = "") {
  const last = previousActions.slice(-1)[0] || "";
  const list = [...previousActions, branch].filter(Boolean);
  const context = {
    facingOpen: false,
    facing3bet: false,
    heroOpened: false,
    multiway: false,
  };
  for (const code of list) {
    if (/preflop_opened_to_me/.test(code)) context.facingOpen = true;
    if (/preflop_faced_3bet/.test(code) || /_opp_4bet/.test(code)) context.facing3bet = true;
    if (/preflop_hero_opened/.test(code)) context.heroOpened = true;
    if (/multi/.test(code)) context.multiway = true;
  }
  return context;
}

function stackSnapshot(context = {}) {
  const hero = Number(context?.heroStackBB ?? 0);
  const villain = Number(context?.villainStackBB ?? 0);
  const heroValid = Number.isFinite(hero) && hero > 0;
  const villainValid = Number.isFinite(villain) && villain > 0;
  const effective = heroValid
    ? villainValid
      ? Math.min(hero, villain)
      : hero
    : villainValid
    ? villain
    : null;
  return {
    hero: heroValid ? hero : null,
    villain: villainValid ? villain : null,
    effective,
  };
}

async function completePrompt({
  system,
  user,
  temperature = 0.6,
  top_p = 0.85,
  max_tokens = 120,
}) {
  const completion = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    temperature,
    top_p,
    max_tokens,
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

  if (!parsed && process.env.DEBUG_AI_OUTPUTS === "true") {
    console.warn("[ChaosCoach] Raw AI output (unparsed):", content);
  }

  return { parsed, completion };
}

function buildResponse(parsed, completion, fallbackFlavor, fallbackAction = "aggress") {
  let hero_action = String(parsed?.hero_action || fallbackAction).trim();
  const normalized = hero_action.toLowerCase();
  if (!VALID_ACTIONS.includes(normalized)) {
    hero_action = fallbackAction;
  }
  let sizing = String(parsed?.sizing || "pot").trim();
  if (!sizing) sizing = "pot";
  let flavor_text = String(parsed?.flavor_text || fallbackFlavor).trim();
  if (!flavor_text) flavor_text = fallbackFlavor;
  const usage = completion.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens ?? null,
        completion_tokens: completion.usage.completion_tokens ?? null,
        total_tokens: completion.usage.total_tokens ?? null,
      }
    : null;
  return { hero_action, sizing, flavor_text, usage };
}

export async function getAggressionPrompt(context = {}, instruction) {
  const persona = String(context?.persona || "chaos_shark");
  if (persona === "cash_game_crusher") {
    return runCashGameCrusher(context, instruction);
  }
  if (persona === "exploit_detective") {
    return runExploitDetective(context, instruction);
  }
  if (persona === "range_professor") {
    return runRangeProfessor(context, instruction);
  }
  if (persona === "short_stack_ninja") {
    return runShortStackNinja(context, instruction);
  }
  return runChaosCoach(context, instruction);
}

async function runChaosCoach(context = {}, instruction) {
  const styleTone = buildStyleTone(context?.style);
  const system = `You are ChaosCoach - an AI poker hype bot.
You never reference hole cards, board cards, math, or odds.
You always respond with valid JSON only - no markdown or commentary.

${styleTone}

Flavor inspirations (mix in sparingly, max 1 per response):
- "Alligator blood. We keep coming."
- "Pay that man his money."
- "If you can't spot the sucker, change the table."
- "Splash the pot? I insist."
- "Rounders Teachings: grind, glide, then strike."
- "Shower them with fear."
- "Stop playing patty-cake. Jam the gas."
- "No more training wheels. Fire or fold."
- "Worm says tighten up? Tell him to railbird."
- "I like you. I'll bust you last."
- "They think you're meek; prove them wrong."
- "This table smells scared."
- "Ace up, heart out - pressure now."
- "Destiny favors maniacs."
- "Bankroll talks; whisper is for folding."
- "Stack their chips before dessert."
- "We don't check back winning hands."
- "Fear is the underdog. Crush it."
- "Grease the gears and fire again."
- "Michael McDermott would 3-bet here."
- "Grandma plays softer - make her proud by blasting."

Output strict JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: one of "open","call","3-bet","4-bet","check","bet","raise","jam","fold" (aggressive bias)
- sizing: fun, loose, or odd (e.g. "4x open","77% pot","133% overbet","4.7x squeeze")
- flavor_text: short, hype-driven, max 20 words. Lean into Rounders quotes, iconic poker lines, or needle the hero for being too soft. Rotate phrasing.
- No card or probability mentions.
- If context.history is present, use it to maintain narrative consistency (keep sizing vibe, mix traps after heavy aggression). Do not repeat the history; just use the signal in the next JSON output.`;

  const mixHint = buildMixHint(context);
  const hypeLevel = Math.min((context?.previousActions?.length ?? 0) * 5, 100);
  const sizingPref = sizingCue(context);
  const historyHint = summarizeHistory(context?.history);

  const user = `Context: ${JSON.stringify(context || {}, null, 2)}
${mixHint}
${sizingPref ? `${sizingPref}\n` : ""}${historyHint ? `History hint: ${historyHint}\n` : ""}Hype level: ${hypeLevel}
Instruction: ${
    instruction ||
    "Suggest the next aggressive or deceptive action for this branch."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.6,
    top_p: 0.85,
    max_tokens: 120,
  });

  return buildResponse(parsed, completion, "Apply pressure.");
}

async function runCashGameCrusher(context = {}, instruction) {
  const stacks = stackSnapshot(context);
  const effective = stacks.effective || stacks.hero || 100;
  const villainType = String(context?.villainType || "fishy");
  const villainNotes = {
    balanced: "Balanced regular - pressure capped ranges, respect reraises.",
    nit: "Nitty villain - bluff scare cards, fold to aggression, isolate limps.",
    station: "Calling station - bet big for value, keep bluffing frequency low.",
    maniac: "Maniac - let them hang themselves, 3-bet premiums, pot control marginal.",
    fishy: "Loose-passive fish - iso wide, overbet value, deny equity."
  };
  const villainPlan = villainNotes[villainType] || villainNotes.fishy;
  const posCategory = positionCategory(context?.heroSeat);
  const { compact, readable } = formatHeroHand(context);
  const handCategory = compact ? categorizeRangeHand(compact) : null;
  const handTier = handCategory?.tier || "unknown";
  const isWeakHand = ["trash", "marginal"].includes(handTier);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);

  const stackNote =
    effective >= 140
      ? `Deep stack ${effective} BB - room for triple-barrels and check-raise traps.`
      : effective <= 60
      ? `Effective stack ${effective} BB - trim bluff frequency, prioritize value.`
      : `Effective stack ${effective} BB - standard 100 BB cash depth.`;
  const multiOpened = previous.some((code) =>
    /preflop_multiple_villains_opened/.test(String(code))
  );
  const multiwayNote = multiOpened
    ? "Preflop: multiple villains entered before hero - expect multiway pots."
    : null;
  const facingOpen = previous.some((code) =>
    /preflop_opened_to_me|preflop_multiple_villains_opened|preflop_faced_3bet/.test(
      String(code)
    )
  );
  const fallbackAction = isWeakHand && facingOpen ? "fold" : "bet";
  const weakHandNote =
    isWeakHand && facingOpen
      ? "Hand tier is weak; prioritize folding or cheap over-limps unless a clear exploit exists."
      : null;

  const focusLines = [
    "Game type: low/mid stakes cash (no ICM).",
    stackNote,
    `Villain profile: ${villainType}`,
    villainPlan,
    posCategory !== "unknown" ? `Hero seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    previous.length ? `Previous actions: ${previous.join(" | ")}` : "",
    readable ? `Hero hand: ${readable}` : "",
    handCategory ? `Hand evaluation: ${handCategory.label}` : "",
    multiwayNote,
    weakHandNote,
    historyHint ? `Recent history: ${historyHint}` : ""
  ].filter(Boolean);

  const cashContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    villainType,
    heroHand: compact,
    heroCards: context?.heroCards,
    stacks: {
      hero: stacks.hero,
      villain: stacks.villain,
      effective
    },
    multiVillainsOpened: multiOpened,
    handTier
  };

  const system = `You are Cash Game Crusher - a deep-stack cash poker coach who exploits loose low-stakes opponents.
Focus on building pots with value, isolating weak players, leveraging position, and adjusting aggression to stack depth.
No ICM or payout concerns ever enter the plan.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: pick among "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- sizing: specify cash-game sizes (e.g., "raise to 3.5x", "70% pot", "overbet 135%").
- flavor_text: <= 20 words, highlight exploit reasoning (value targeting, isolating fish, pressure capped range).
- Mention the follow-up plan vs calls or raises (e.g., double barrel, check back turn).
- Assume effective stacks around 100 BB unless context specifies otherwise.
- If hand tier is trash or marginal and facing raises out of position, default to folding or cheap over-limps unless a clear exploit warrants aggression.`;

  const user = `Context: ${JSON.stringify(cashContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the most profitable cash-game line given deep-stack dynamics and villain profile."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.5,
    top_p: 0.85,
    max_tokens: 160,
  });

  return buildResponse(
    parsed,
    completion,
    "Extract max value from the cash table.",
    fallbackAction
  );
}

async function runExploitDetective(context = {}, instruction) {
  const villainType = String(context?.villainType || "balanced");
  const villainNotes = {
    balanced: "Solid, balanced villain - mix pressure but respect resistance.",
    nit: "Over-folds and protects premiums only - attack with bluffs and steals.",
    station: "Calls too wide - bet big for value, keep bluffs sparse.",
    maniac: "Over-aggressive - trap with strong hands, induce bluffs, control pot.",
    fishy: "Loose-passive - bet for value, avoid massive bluffs, isolate often."
  };
  const villainPlan = villainNotes[villainType] || villainNotes.balanced;
  const posCategory = positionCategory(context?.heroSeat);
  const { compact, readable } = formatHeroHand(context);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);
  const stacks = stackSnapshot(context);
  const multiOpened = previous.some((code) =>
    /preflop_multiple_villains_opened/.test(String(code))
  );

  const focusLines = [
    `Villain profile: ${villainType}`,
    villainPlan,
    posCategory !== "unknown" ? `Hero seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    previous.length ? `Previous actions: ${previous.join(" | ")}` : "",
    stacks.effective ? `Effective stack ~ ${stacks.effective} BB` : "",
    readable ? `Hero hand (optional): ${readable}` : "",
    multiOpened
      ? "Multiple villains entered preflop - expect more callers and capped ranges."
      : "Assume heads-up pot versus the villain.",
    historyHint ? `Recent history: ${historyHint}` : ""
  ].filter(Boolean);

  const exploitContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    villainType,
    heroHand: compact,
    heroCards: context?.heroCards,
    stacks,
    multiVillainsOpened: multiOpened
  };

  const system = `You are Exploit Detective - a heads-up poker specialist who tailors lines to villain tendencies.
Reference specific leaks (over-folding, calling wide, over-aggression) and adjust aggression, sizing, and trap frequency accordingly.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose from "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- sizing: give precise exploit sizing (e.g., "65% pot value bet", "small 2.2x stab", "overbet scare card").
- flavor_text: <= 20 words, call out the exploit rationale (e.g., "value vs station", "pressure the nit's cap").
- Discuss plan vs likely villain reactions (calls, raises, folds) in the line description.
- Assume heads-up dynamics; no multiway considerations.`;

  const user = `Context: ${JSON.stringify(exploitContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the most exploitative line given the villain profile and recent action."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.45,
    top_p: 0.8,
    max_tokens: 150,
  });

  return buildResponse(parsed, completion, "Exploit their leak with precision.", "aggress");
}

async function runShortStackNinja(context = {}, instruction) {
  const stacks = stackSnapshot(context);
  if (!stacks.hero && !stacks.effective) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Need hero stack in BB for shove-or-fold advice.",
      usage: null,
    };
  }

  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Select hero cards for Short-Stack Ninja.",
      usage: null,
    };
  }
  const descriptor = compact ? describeHand(compact) : null;
  const posCategory = positionCategory(context?.heroSeat);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const actionInfo = actionContext(previous, context?.branch);
  const historyHint = summarizeHistory(context?.history);

  const focusLines = [
    `Hero stack: ${stacks.hero ?? stacks.effective ?? "?"} BB`,
    stacks.villain ? `Villain stack: ${stacks.villain} BB` : "",
    stacks.effective ? `Effective stack: ${stacks.effective} BB` : "",
    readable ? `Hero hand: ${readable}${descriptor ? ` (${descriptor})` : ""}` : "",
    posCategory !== "unknown" ? `Seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    actionInfo.facingOpen ? "Facing an open raise." : "",
    actionInfo.facing3bet ? "Facing a 3-bet or shove." : "",
    actionInfo.heroOpened ? "Hero opened the pot already." : "",
    actionInfo.multiway ? "Pot is multiway." : "",
    stacks.effective && stacks.effective <= 12
      ? "Short-stack zone: prepare jam-or-fold decisions."
      : "",
    historyHint ? `Recent history: ${historyHint}` : "",
  ].filter(Boolean);

  const shortContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    history: context?.history,
    aggressors: context?.aggressors,
    heroHand: compact,
    heroCards: context?.heroCards,
    stacks,
    actionContext: actionInfo,
  };

  const system = `You are Short-Stack Ninja - an expert at shove-or-fold tournament spots.
Specialize in effective stacks of 20 BB or less, and call out when depth is beyond that zone.
Use disciplined push/fold charts, blocker logic, and fold equity calculations.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose from "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- Emphasize jam/fold/induce logic. If recommending min-raise, specify follow-up plan vs shove.
- sizing: provide precise guidance ("jam", "min-raise to 2.1x", "fold").
- flavor_text: <= 18 words, concise, tactical, reference fold equity, blockers, or ladder awareness. No hype.
- Default to folding trash hands with <12 BB when facing raises unless blockers or antes justify aggression.
- Mention how to respond vs calls, reshoves, or folds in the next beats.`;

  const user = `Context: ${JSON.stringify(shortContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Recommend the optimal short-stack line using shove/fold logic and plan for villain reactions."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.35,
    top_p: 0.7,
    max_tokens: 140,
  });

  return buildResponse(parsed, completion, "Stay sharp with shove-or-fold discipline.", "jam");
}

async function runRangeProfessor(context = {}, instruction) {
  const { compact, readable } = formatHeroHand(context);
  if (!compact) {
    return {
      hero_action: "...",
      sizing: "",
      flavor_text: "Select hero cards for Range Professor.",
      usage: null,
    };
  }

  const descriptor = describeHand(compact);
  const handCategory = categorizeRangeHand(compact);
  const posCategory = positionCategory(context?.heroSeat);
  const actionInfo = actionContext(context?.previousActions || [], context?.branch);
  const previous = Array.isArray(context?.previousActions)
    ? context.previousActions
    : [];
  const historyHint = summarizeHistory(context?.history);
  const focusLines = [
    `Hero hand: ${readable}${descriptor ? ` (${descriptor})` : ""}`,
    `Hand tier: ${handCategory.label} (tier=${handCategory.tier})`,
    context?.heroSeat ? `Hero seat: ${String(context.heroSeat)}` : "",
    posCategory !== "unknown" ? `Seat category: ${posCategory}` : "",
    context?.street ? `Street: ${String(context.street)}` : "",
    previous.length ? `Previous actions: ${previous.join(" | ")}` : "",
    actionInfo.facingOpen ? "Facing an open raise." : "",
    actionInfo.facing3bet ? "Facing a 3-bet or 4-bet." : "",
    actionInfo.heroOpened ? "Hero has already opened the pot." : "",
    actionInfo.multiway ? "Pot is multiway." : "",
    typeof context?.aggressors === "number"
      ? `Aggressors seen: ${context.aggressors}`
      : "",
    historyHint ? `Recent history: ${historyHint}` : "",
  ].filter(Boolean);

  const rangeContext = {
    street: context?.street,
    branch: context?.branch,
    heroSeat: context?.heroSeat,
    tableSize: context?.tableSize,
    previousActions: previous,
    aggressors: context?.aggressors,
    history: context?.history,
    heroHand: compact,
    heroCards: context?.heroCards,
    handTier: handCategory.tier,
    handDescription: handCategory.label,
    seatCategory: posCategory,
    actionContext: actionInfo,
  };

  const system = `You are Range Professor - a disciplined poker strategy coach.
You evaluate hands with range logic, blockers, and positional awareness.
Respond only with strict JSON (no markdown).

Output JSON:
{
  "hero_action": "string",
  "sizing": "string",
  "flavor_text": "string"
}

Rules:
- hero_action: choose one of "open","call","3-bet","4-bet","check","bet","raise","jam","fold".
- sizing: supply a concrete size tied to the line (e.g. "55% pot","3.5x 3-bet","jam").
- flavor_text: <= 22 words, analytical, reference range or blocker insights when useful, no hype.
- Consider hero hand ${readable} and anticipate likely villain responses for the next decisions.
- Mention plan adjustments when facing calls, raises, or folds.
- Default to folding hands marked tier=trash or tier=marginal when facing strong action unless clear exploitative rationale exists; explain any deviation.
- Early and middle positions require tighter continuing ranges against opens.`;

  const user = `Context: ${JSON.stringify(rangeContext, null, 2)}
${focusLines.length ? `Notes:\n${focusLines.join("\n")}\n` : ""}Instruction: ${
    instruction ||
    "Provide the highest EV line considering hero hand strength, position, and likely opponent reactions."
  }`;

  const { parsed, completion } = await completePrompt({
    system,
    user,
    temperature: 0.35,
    top_p: 0.75,
    max_tokens: 160,
  });

  return buildResponse(parsed, completion, "Balance range discipline.", "fold");
}
