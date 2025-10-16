# PokerChaosCoach

AI-driven Poker Aggression Trainer for fun, non-competitive sessions.

This project mirrors the SickDayGPT split frontend/backend structure and conventions.

- Frontend: Vite + React app in `pokerchaos-frontend`
- Backend: Express API in `pokerchaos-backend`
- Env handling: `dotenv` in backend, `VITE_...` vars in frontend

## Getting Started

1) Backend

- Copy `pokerchaos-backend` to your new project
- Create `.env` from `.env.example`
- Install deps and run:

```
cd pokerchaos-backend
npm install
npm run dev
```

2) Frontend

- Copy `pokerchaos-frontend` to your new project
- Optionally create `.env` to set `VITE_API_BASE_URL`
- Install deps and run:

```
cd pokerchaos-frontend
npm install
npm run dev
```

## API Overview

- `POST /prompts` accepts `{ context: { ... } }` and returns a short, swagger-filled poker “ChaosCoach” line from OpenAI.

