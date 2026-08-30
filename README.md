# PokerChaosCoach

AI-driven Poker Aggression Trainer for fun, non-competitive sessions.

This project mirrors the SickDayGPT split frontend/backend structure and conventions.

- Frontend: Vite + React app in `pokerchaos-frontend`
- Backend: Express API in `pokerchaos-backend`
- Env handling: `dotenv` in backend, `VITE_...` vars in frontend

## Getting Started

### Quick start (all services)

Start the frontend, livestream, and backend together from the repository root:

```bash
npm run dev
```

Press `Ctrl+C` to stop all three processes.

Before the first run, install the application dependencies in each folder if
you have not already done so:

```bash
npm --prefix pokerchaos-frontend install
npm --prefix pokerchaos-backend install
```

### Start services separately

1. Backend

- Copy `pokerchaos-backend` to your new project
- Create `.env` from `.env.example`
- Install deps and run:

```bash
cd pokerchaos-backend
npm install
npm run dev
```

2. Frontend

- Copy `pokerchaos-frontend` to your new project
- Optionally create `.env` to set `VITE_API_BASE_URL`
- Install deps and run:

```bash
cd pokerchaos-frontend
npm install
npm run dev
```

## API Overview

- `GET /me/entitlements` returns current feature flags for the signed-in user.
- `POST /prompts` (requires `coach` entitlement) accepts `{ context: { ... } }` and returns a short ChaosCoach line from OpenAI.
- `POST /hand-history/parse` (requires `review` entitlement) accepts GG hand-history text and returns parsed hands with Hero preflop filtering.
- `POST /hand-history/review` (requires `review` entitlement) accepts selected parsed hands and returns AI hand reviews with per-street scoring.
- `POST /hand-history/summary-review` (requires `review` entitlement) accepts Session Summary stats and returns AI leak diagnosis with prioritized actions.
- `POST /tournaments/upload` (requires `review` entitlement) accepts tournament hand-history text, parses it, and upserts by `(user_id, tournament_id)`.
- `GET /tournaments` (requires `review` entitlement) lists saved tournament uploads for the current user (ordered by tournament played date, then most recently updated).
- `GET /tournaments/:tournamentId` (requires `review` entitlement) loads one saved tournament (summary, opponent snapshot, parsed hands).

## Postgres Setup

Tournament uploads require Postgres.

Set either:

- `DATABASE_URL=postgres://...`

Or standard PG vars:

- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

Optional SSL toggles:

- `PGSSL=true`
- `PGSSL_REJECT_UNAUTHORIZED=false` (default)

## Feature Entitlements

Backend feature access is configured by env vars:

- `REVIEW_ALLOW_ALL` (`true` by default): allow all signed-in users to access hand review.
- `COACH_ALLOW_ALL` (`false` by default): allow all signed-in users to access coach.
- `REVIEW_ALLOWED_USER_IDS`: comma-separated Clerk user IDs with review access.
- `COACH_ALLOWED_USER_IDS`: comma-separated Clerk user IDs with coach access.
- `ADMIN_ALLOWED_USER_IDS`: comma-separated Clerk user IDs with access to all features.
- `REVIEW_ALLOWED_EMAILS`: comma-separated email addresses with review access.
- `COACH_ALLOWED_EMAILS`: comma-separated email addresses with coach access.
- `ADMIN_ALLOWED_EMAILS`: comma-separated email addresses with access to all features.
- `LEARNING_IMPORT_ALLOWED_USER_IDS`: comma-separated Clerk user IDs restricted to learning-resource preview and import.
- `LEARNING_IMPORT_ALLOWED_EMAILS`: comma-separated Clerk emails restricted to learning-resource preview and import.
- `LEARNING_ADMIN_ALLOWED_USER_IDS`: comma-separated Clerk user IDs with access to Learning Library management only.
- `LEARNING_ADMIN_ALLOWED_EMAILS`: comma-separated Clerk emails with access to Learning Library management only.
