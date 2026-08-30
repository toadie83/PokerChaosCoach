export const DEFAULT_TOURNAMENT_STAGE = "auto";
export const TOURNAMENT_STAGE_STORAGE_KEY = "pcc_tournament_stage";

export const TOURNAMENT_STAGE_OPTIONS = Object.freeze([
  {
    code: "auto",
    label: "Auto / Standard",
    shortLabel: "Auto",
    description:
      "Use the current stack, action, and table context without adding a manual tournament-stage bias.",
  },
  {
    code: "early_reentry",
    label: "Early / Re-entry",
    shortLabel: "Early",
    description:
      "Low approximate ICM pressure: prioritize clean value, position, and high-SPR discipline.",
  },
  {
    code: "middle_accumulation",
    label: "Middle / Accumulation",
    shortLabel: "Middle",
    description:
      "Antes and stack compression increase the value of selective steals, reshoves, and coherent stack plans.",
  },
  {
    code: "bubble_pressure",
    label: "Bubble Pressure",
    shortLabel: "Bubble",
    description:
      "Apply approximate bubble pressure according to stack coverage; exact ICM still requires field and payout data.",
  },
  {
    code: "post_bubble",
    label: "Post-Bubble / In the Money",
    shortLabel: "Post-bubble",
    description:
      "Rebase toward chip accumulation while anticipating increased short-stack shove frequency.",
  },
  {
    code: "late_endgame",
    label: "Late / Endgame",
    shortLabel: "Endgame",
    description:
      "Use qualitative payout pressure and stack roles without claiming exact final-table ICM.",
  },
]);

const TOURNAMENT_STAGE_CODES = new Set(
  TOURNAMENT_STAGE_OPTIONS.map((option) => option.code),
);

export function normalizeTournamentStage(value) {
  const code = String(value || "").trim().toLowerCase();
  return TOURNAMENT_STAGE_CODES.has(code)
    ? code
    : DEFAULT_TOURNAMENT_STAGE;
}

export function getTournamentStageMeta(value) {
  const code = normalizeTournamentStage(value);
  return (
    TOURNAMENT_STAGE_OPTIONS.find((option) => option.code === code) ||
    TOURNAMENT_STAGE_OPTIONS[0]
  );
}

export function isIcmSensitiveTournamentStage(value) {
  const code = normalizeTournamentStage(value);
  return code === "bubble_pressure" || code === "late_endgame";
}
