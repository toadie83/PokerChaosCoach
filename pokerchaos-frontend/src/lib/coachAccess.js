export const COACH_CONTACT_EMAIL = "qacopilotdev@gmail.com";

export const COACH_ACCESS_DESCRIPTION =
  "Coach uses substantial AI token resources for personalised analysis, so early access is priced separately according to expected usage. It is not included in Tournament Review or its trial.";

export const COACH_EARLY_ACCESS_URL =
  `mailto:${COACH_CONTACT_EMAIL}?subject=${encodeURIComponent("Playback Poker Coach — early access request")}&body=${encodeURIComponent(
    "Hi Trev,\n\nI'd like to request early access to Playback Poker Coach.\n\nMy Playback Poker account email:\nHow I plan to use Coach:\nExpected sessions per week:\n\nI understand Coach uses substantial AI token resources and is priced separately according to usage. Please send me the early-access pricing and included usage allowance.\n\nThanks!",
  )}`;
