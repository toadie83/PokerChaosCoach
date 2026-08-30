export const DEFAULT_BOUNTY_MODE = "none";
export const BOUNTY_MODE_STORAGE_KEY = "pcc_bounty_mode";

export const BOUNTY_MODE_OPTIONS = Object.freeze([
  {
    code: "none",
    label: "Off",
    shortLabel: "Off",
    description: "Use standard tournament strategy without a bounty adjustment.",
  },
  {
    code: "unknown",
    label: "Bounty · Type unknown",
    shortLabel: "Bounty",
    description:
      "Apply a conservative coverage-aware bounty adjustment without assuming a KO structure or bounty value.",
  },
  {
    code: "standard_ko",
    label: "Standard KO",
    shortLabel: "KO",
    description:
      "Treat eliminations as carrying an ordinary fixed bounty, without inventing its cash or chip value.",
  },
  {
    code: "progressive_ko",
    label: "Progressive KO",
    shortLabel: "PKO",
    description:
      "Account qualitatively for progressive-bounty incentives; unknown individual bounty sizes keep close decisions lower confidence.",
  },
]);

const BOUNTY_MODE_CODES = new Set(
  BOUNTY_MODE_OPTIONS.map((option) => option.code),
);

export function normalizeBountyMode(value) {
  const code = String(value || "").trim().toLowerCase();
  return BOUNTY_MODE_CODES.has(code) ? code : DEFAULT_BOUNTY_MODE;
}

export function getBountyModeMeta(value) {
  const code = normalizeBountyMode(value);
  return (
    BOUNTY_MODE_OPTIONS.find((option) => option.code === code) ||
    BOUNTY_MODE_OPTIONS[0]
  );
}

export function isBountyTournament(value) {
  return normalizeBountyMode(value) !== DEFAULT_BOUNTY_MODE;
}
