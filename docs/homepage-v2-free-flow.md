# Homepage V2 Free Tournament Flow

## Purpose

Homepage V2 includes a public tournament-learning preview that is independent of the registered Playback Poker tools.

The public journey is:

1. Select one completed GGPoker or PokerStars `.txt` tournament export in the homepage hero.
2. Enter the poker screen name used in that hand history.
3. Submit the tournament to `POST /public/study-plan/analyse`.
4. See the real five-stage analysis modal while the request is running.
5. Continue automatically to `/free-study-plan` for up to three learning suggestions and matched published lessons.
6. Record one successful anonymous plan in `localStorage`; failed uploads and failed analyses do not consume the browser allowance.
7. After three successful homepage plans, replace the uploader with an invitation to register for free Study Spot reviews and a customised learning plan.

## Separation from registered tools

The public endpoint reuses the existing parser, candidate extraction, AI classification, ranking, and published learning-resource matcher. It does not call the registered tournament persistence or Study Report orchestration.

The public flow therefore does not:

- require a Clerk session or capability;
- create a `tournament_uploads` record;
- create a `study_reports` or `study_spots` record;
- add anything to a registered user's study queue;
- expose full Learning Library article bodies in its response.

The authenticated endpoint remains `POST /study-spots/analyse` and its behaviour is unchanged.

## Result lifetime and privacy

The raw hand history and supplied poker screen name are sent to the analysis endpoint and retained only in application memory for the duration of that request. The public flow does not write the raw upload, parsed tournament, or screen name to the Playback Poker database or application logs. The endpoint response contains tournament summary counts, up to three sanitized Study Spots, and compact metadata for matched published lessons.

The frontend stores that sanitized response in same-tab `sessionStorage` so `/free-study-plan` can render it. The raw hand history is not placed in browser storage. A separate `localStorage` value, `playback_free_study_plan_allowance_v1`, contains only the successful-plan count and update timestamp. The result and privacy pages are marked `noindex`.

When AI classification is required, only compact structured decision candidates are sent to the configured OpenAI API model. The uploaded file and poker screen name are not included in that AI request. OpenAI API data controls and retention terms still apply; the public privacy page links to the current official sources.

## Abuse protection

The anonymous flow uses two complementary controls:

- a browser allowance of three successful plans, after which the uploader becomes a registration invitation;
- an in-memory API limit per client network address, which also protects against clearing or disabling browser storage.

The API defaults are:

- `FREE_STUDY_RATE_LIMIT_MAX`, default `3`;
- `FREE_STUDY_RATE_LIMIT_WINDOW_MS`, default `86400000` milliseconds (24 hours).

The server ignores caller-supplied `X-Forwarded-For` values and uses the address resolved by Express. Accepted and rejected responses are marked `private, no-store` and expose standard limit, remaining, reset, and retry headers.

The local browser count improves the user experience but is not a security boundary. For a multi-instance production deployment, the in-memory API limiter should be replaced or supplemented by a shared rate-limit store and managed bot challenge. Any production proxy trust configuration must be explicit and restricted to known proxy hops.

## Learning Library cadence

The hero states that new tournament lessons are added daily at 09:00 UK time. This is an editorial publishing commitment; the homepage does not itself schedule or publish Learning Library content.

## Follow-up product work

- Add a distributed limiter before running more than one backend instance.
- Add lifecycle analytics for free-result lesson clicks and registration completion without recording cards or hand-history text.
- If shareable or cross-device free results are required, introduce short-lived opaque result tokens and an expiring datastore. The current result is intentionally tab-scoped.
