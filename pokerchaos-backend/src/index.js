import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { z } from "zod";
import { verifyToken } from "@clerk/backend";
import { getAggressionPrompt, reviewTournamentHand } from "./openaiService.js";
import {
  buildOpponentSnapshot,
  compactHandForApi,
  filterHandsForReview,
  parseGgTournamentHistory,
  sortHands,
} from "./handHistoryService.js";

dotenv.config();

const BASE_PORT = process.env.PORT ? Number(process.env.PORT) : 4011;
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .filter(Boolean);
const allowedOrigins = FRONTEND_ORIGIN.length > 0 ? FRONTEND_ORIGIN : undefined;

if (!process.env.OPENAI_API_KEY) {
  console.warn("[pokerchaos-backend] OPENAI_API_KEY is not set.");
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkIssuer = process.env.CLERK_ISSUER;

const app = express();

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: false,
  })
);
app.use(express.json({ limit: "8mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "pokerchaos-backend" });
});

async function requireAuth(req, res, next) {
  if (!clerkSecretKey) {
    return res
      .status(500)
      .json({ error: "Authentication is not configured on the server." });
  }

  const header = req.headers.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return res.status(401).json({ error: "Missing authentication token." });
  }

  try {
    const session = await verifyToken(token, {
      secretKey: clerkSecretKey,
      issuer: clerkIssuer,
    });
    req.auth = { userId: session.sub };
    return next();
  } catch (error) {
    console.warn("[pokerchaos-backend] Auth failed", error);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

const promptSchema = z.object({
  context: z.record(z.any()).optional().default({}),
  instruction: z.string().trim().max(500).optional(),
});

const handHistorySchema = z.object({
  historyText: z.string().trim().min(1).max(2_000_000),
  heroName: z.string().trim().min(1).max(64).optional().default("Hero"),
  includeOnlyHeroDidNotFoldPreflop: z.boolean().optional().default(true),
  sort: z.enum(["newest", "oldest"]).optional().default("newest"),
  limit: z.number().int().min(1).max(500).optional().default(200),
});

const handReviewSchema = z.object({
  selectedHands: z.array(z.record(z.any())).min(1).max(30),
  opponentSnapshot: z.record(z.any()).optional(),
  instruction: z.string().trim().max(700).optional(),
  model: z.string().trim().optional(),
});

function sanitizeHandForStreetFairness(hand) {
  const clone = JSON.parse(JSON.stringify(hand ?? {}));
  const heroName = String(clone?.heroName || "Hero");
  const foldedStreet = String(clone?.heroOutcome?.foldedStreet || "")
    .trim()
    .toLowerCase();
  const order = ["preflop", "flop", "turn", "river"];
  const foldIndex = order.indexOf(foldedStreet);

  if (foldIndex === -1) {
    clone.reviewContext = {
      heroFoldedStreet: null,
      futureStreetsHidden: false,
    };
    return clone;
  }

  const hideStreet = (street) => {
    if (!clone?.actionsByStreet) clone.actionsByStreet = {};
    if (!clone?.heroActionsByStreet) clone.heroActionsByStreet = {};
    clone.actionsByStreet[street] = [];
    clone.heroActionsByStreet[street] = [];
    if (!clone?.board) clone.board = {};
    if (street === "flop") clone.board.flop = [];
    if (street === "turn") clone.board.turn = null;
    if (street === "river") clone.board.river = null;
  };

  const foldedActions = Array.isArray(clone?.actionsByStreet?.[foldedStreet])
    ? clone.actionsByStreet[foldedStreet]
    : [];
  const foldAt = foldedActions.findIndex(
    (action) =>
      String(action?.player || "") === heroName &&
      String(action?.type || "") === "fold"
  );
  if (foldAt >= 0) {
    clone.actionsByStreet[foldedStreet] = foldedActions.slice(0, foldAt + 1);
  }

  const heroFoldedActions = Array.isArray(clone?.heroActionsByStreet?.[foldedStreet])
    ? clone.heroActionsByStreet[foldedStreet]
    : [];
  const heroFoldAt = heroFoldedActions.findIndex(
    (action) => String(action?.type || "") === "fold"
  );
  if (heroFoldAt >= 0) {
    clone.heroActionsByStreet[foldedStreet] = heroFoldedActions.slice(
      0,
      heroFoldAt + 1
    );
  }

  for (let i = foldIndex + 1; i < order.length; i += 1) {
    hideStreet(order[i]);
  }

  clone.reviewContext = {
    heroFoldedStreet: foldedStreet,
    futureStreetsHidden: true,
  };
  return clone;
}

function toFiniteNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildOpponentLookup(opponentSnapshot) {
  const lookup = new Map();
  const players = Array.isArray(opponentSnapshot?.players)
    ? opponentSnapshot.players
    : [];
  for (const item of players) {
    const player = String(item?.player || "").trim();
    if (!player) continue;

    const tagLabels = Array.isArray(item?.tags)
      ? item.tags
          .map((tag) => String(tag?.label || tag?.code || "").trim())
          .filter(Boolean)
      : [];

    lookup.set(player, {
      player,
      handsSeen: toFiniteNumberOrNull(item?.handsSeen) ?? 0,
      latestStack: toFiniteNumberOrNull(item?.latestStack),
      latestTableId:
        typeof item?.latestTableId === "string" && item.latestTableId.trim()
          ? item.latestTableId.trim()
          : null,
      latestSeat: {
        number: toFiniteNumberOrNull(item?.latestSeat?.number),
        position:
          typeof item?.latestSeat?.position === "string" &&
          item.latestSeat.position.trim()
            ? item.latestSeat.position.trim()
            : null,
      },
      isCurrentTablePlayer: Boolean(item?.isCurrentTablePlayer),
      enteredPotPct: toFiniteNumberOrNull(item?.enteredPot?.pct),
      foldedPreflopPct: toFiniteNumberOrNull(item?.foldedPreflop?.pct),
      preflopRaisePct: toFiniteNumberOrNull(item?.preflopRaise?.pct),
      foldToPreflopRaisePct: toFiniteNumberOrNull(item?.foldToPreflopRaise?.pct),
      postflopAggressionFrequencyPct: toFiniteNumberOrNull(
        item?.postflopAggression?.frequencyPct
      ),
        postflopAggressionFactor: toFiniteNumberOrNull(
          item?.postflopAggression?.factor
        ),
        tags: tagLabels,
        playNote: {
          text:
            typeof item?.playNote?.text === "string" && item.playNote.text.trim()
              ? item.playNote.text.trim()
              : null,
          confidence:
            typeof item?.playNote?.confidence === "string" &&
            item.playNote.confidence.trim()
              ? item.playNote.confidence.trim()
              : null,
        },
      });
  }
  return lookup;
}

function attachOpponentContextToHand(hand, opponentLookup) {
  const heroName = String(hand?.heroName || "Hero").trim();
  const seats = Array.isArray(hand?.seats) ? hand.seats : [];
  const opponentsInHand = [];
  const seenPlayers = new Set();
  for (const seat of seats) {
    const player = String(seat?.player || "").trim();
    if (!player || player === heroName || seenPlayers.has(player)) continue;
    seenPlayers.add(player);
    const stats = opponentLookup.get(player);
    if (!stats) continue;
    opponentsInHand.push(stats);
  }

  opponentsInHand.sort((a, b) => {
    if (b.handsSeen !== a.handsSeen) return b.handsSeen - a.handsSeen;
    return a.player.localeCompare(b.player);
  });

  const tagCounts = new Map();
  for (const opponent of opponentsInHand) {
    for (const tag of opponent.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const topTagHints = Array.from(tagCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 5)
    .map(([tag, count]) => `${tag}${count > 1 ? ` x${count}` : ""}`);

  hand.opponentContext = {
    snapshotIncluded: opponentsInHand.length > 0,
    opponentsInHand,
    topTagHints,
  };
  return hand;
}

app.post("/prompts", requireAuth, async (req, res) => {
  const parsed = promptSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  }

  try {
    const result = await getAggressionPrompt(
      parsed.data.context,
      parsed.data.instruction
    );
    return res.json(result);
  } catch (error) {
    console.error("[pokerchaos-backend] OpenAI error", error);
    return res.status(502).json({
      error: "Failed to generate ChaosCoach line. Please try again later.",
    });
  }
});

app.post("/hand-history/parse", requireAuth, async (req, res) => {
  const parsed = handHistorySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  try {
    const allHands = parseGgTournamentHistory(parsed.data.historyText, {
      heroName: parsed.data.heroName,
    });
    const filtered = filterHandsForReview(allHands, {
      includeOnlyHeroDidNotFoldPreflop:
        parsed.data.includeOnlyHeroDidNotFoldPreflop,
    });
    const sorted = sortHands(filtered, parsed.data.sort);
    const limited = sorted.slice(0, parsed.data.limit);
    const opponents = buildOpponentSnapshot(allHands, {
      heroName: parsed.data.heroName,
      minHands: 1,
    });

    return res.json({
      summary: {
        heroName: parsed.data.heroName,
        totalHands: allHands.length,
        filteredHands: filtered.length,
        returnedHands: limited.length,
        sort: parsed.data.sort,
      },
      opponents,
      hands: limited.map(compactHandForApi),
    });
  } catch (error) {
    console.error("[pokerchaos-backend] Hand parse error", error);
    return res.status(500).json({
      error: "Failed to parse hand history. Check file format and try again.",
    });
  }
});

app.post("/hand-history/review", requireAuth, async (req, res) => {
  const parsed = handReviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  }

  try {
    const opponentLookup = buildOpponentLookup(parsed.data.opponentSnapshot);
    const reviews = [];
    for (const hand of parsed.data.selectedHands) {
      const compactHand = sanitizeHandForStreetFairness(hand);
      const reviewHand = attachOpponentContextToHand(compactHand, opponentLookup);
      const review = await reviewTournamentHand(
        reviewHand,
        parsed.data.instruction,
        parsed.data.model
      );
      reviews.push({
        hand: compactHand,
        review,
      });
    }

    return res.json({
      summary: {
        selectedHands: parsed.data.selectedHands.length,
        reviewedHands: reviews.length,
      },
      reviews,
    });
  } catch (error) {
    console.error("[pokerchaos-backend] Hand review error", error);
    return res.status(502).json({
      error:
        "Failed to review hand history with AI. Please try again in a moment.",
    });
  }
});

function startServer(port, attempts = 0) {
  const server = app
    .listen(port, () => {
      console.log(`pokerchaos-backend listening on http://localhost:${port}`);
    })
    .on("error", (err) => {
      if (err && err.code === "EADDRINUSE" && attempts < 5) {
        const next = port + 1;
        console.warn(
          `[pokerchaos-backend] Port ${port} in use. Retrying on ${next}...`
        );
        startServer(next, attempts + 1);
      } else {
        console.error("[pokerchaos-backend] Failed to bind port", err);
        process.exit(1);
      }
    });
  return server;
}

startServer(BASE_PORT);
