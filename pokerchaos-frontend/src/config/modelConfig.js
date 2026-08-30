export const DEFAULT_COACH_MODEL = "gpt-5.6-luna";
export const LEGACY_DEFAULT_COACH_MODEL = "gpt-4.1-mini";
export const FAST_LUNA_COACH_MODEL = "gpt-5.6-luna-fast";

export const COACH_MODEL_OPTIONS = Object.freeze([
  { code: "gpt-5.6-luna", label: "GPT-5.6 Luna (Recommended)" },
  {
    code: FAST_LUNA_COACH_MODEL,
    label: "GPT-5.6 Luna Fast (2× price)",
  },
  { code: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { code: "gpt-4.1", label: "GPT-4.1" },
  { code: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
]);

export const MODEL_DEFAULT_MIGRATION_KEY = "pcc_model_default_migration";
export const MODEL_DEFAULT_MIGRATION_VERSION = "gpt-5.6-luna-v1";
