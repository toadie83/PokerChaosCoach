import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { z } from "zod";
import { createClerkClient, verifyToken } from "@clerk/backend";
import {
  getAggressionPrompt,
  reviewBlindDefenseSummary,
  reviewIcmSpotSummary,
  reviewCurrentTableHint,
  reviewTournamentHand,
  reviewTournamentSummary,
} from "./openaiService.js";
import {
  buildOpponentSnapshot,
  compactHandForApi,
  filterHandsForReview,
  parseGgTournamentHistory,
  sortHands,
} from "./handHistoryService.js";
import {
  deleteTournamentUpload,
  getTournamentUpload,
  initDatabase,
  isDatabaseConfigured,
  listTournamentUploads,
  upsertTournamentUpload,
} from "./db.js";

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
const reviewAllowAll = String(process.env.REVIEW_ALLOW_ALL || "true")
  .trim()
  .toLowerCase() !== "false";
const reviewAiAllowAll = String(process.env.REVIEW_AI_ALLOW_ALL || "false")
  .trim()
  .toLowerCase() === "true";
const coachAllowAll = String(process.env.COACH_ALLOW_ALL || "false")
  .trim()
  .toLowerCase() === "true";
const clerkClient = clerkSecretKey
  ? createClerkClient({ secretKey: clerkSecretKey })
  : null;

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

function parseUserIdSet(raw) {
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function parseEmailSet(raw) {
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

const reviewAllowedUserIds = parseUserIdSet(process.env.REVIEW_ALLOWED_USER_IDS);
const reviewAiAllowedUserIds = parseUserIdSet(
  process.env.REVIEW_AI_ALLOWED_USER_IDS
);
const coachAllowedUserIds = parseUserIdSet(process.env.COACH_ALLOWED_USER_IDS);
const adminUserIds = parseUserIdSet(process.env.ADMIN_ALLOWED_USER_IDS);
const reviewAllowedEmails = parseEmailSet(process.env.REVIEW_ALLOWED_EMAILS);
const reviewAiAllowedEmails = parseEmailSet(process.env.REVIEW_AI_ALLOWED_EMAILS);
const coachAllowedEmails = parseEmailSet(process.env.COACH_ALLOWED_EMAILS);
const adminAllowedEmails = parseEmailSet(process.env.ADMIN_ALLOWED_EMAILS);
const shouldLookupUserEmails =
  reviewAllowedEmails.size > 0 ||
  reviewAiAllowedEmails.size > 0 ||
  coachAllowedEmails.size > 0 ||
  adminAllowedEmails.size > 0;

function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function extractUserEmails(user) {
  const emails = new Set();
  const addEmail = (value) => {
    const normalized = normalizeEmail(value);
    if (normalized) emails.add(normalized);
  };

  const primaryEmail = user?.primaryEmailAddress;
  addEmail(primaryEmail?.emailAddress || primaryEmail?.email_address || null);

  const emailAddresses = Array.isArray(user?.emailAddresses)
    ? user.emailAddresses
    : [];
  for (const item of emailAddresses) {
    addEmail(item?.emailAddress || item?.email_address || null);
  }
  return Array.from(emails);
}

function hasAnyMatchingEmail(candidateEmails, allowedEmailSet) {
  if (!(allowedEmailSet instanceof Set) || allowedEmailSet.size === 0) return false;
  const emails = Array.isArray(candidateEmails) ? candidateEmails : [];
  return emails.some((email) => allowedEmailSet.has(normalizeEmail(email)));
}

function buildEntitlements(userId, userEmails = []) {
  const uid = String(userId || "").trim();
  const isAdmin =
    adminUserIds.has(uid) || hasAnyMatchingEmail(userEmails, adminAllowedEmails);
  const review =
    isAdmin ||
    reviewAllowAll ||
    reviewAllowedUserIds.has(uid) ||
    hasAnyMatchingEmail(userEmails, reviewAllowedEmails);
  const reviewAi =
    isAdmin ||
    reviewAiAllowAll ||
    reviewAiAllowedUserIds.has(uid) ||
    hasAnyMatchingEmail(userEmails, reviewAiAllowedEmails);
  const coach =
    isAdmin ||
    coachAllowAll ||
    coachAllowedUserIds.has(uid) ||
    hasAnyMatchingEmail(userEmails, coachAllowedEmails);
  return {
    review,
    reviewAi,
    coach,
    admin: isAdmin,
    emails: Array.isArray(userEmails) ? userEmails : [],
  };
}

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
    const userId = session.sub;
    let userEmails = [];
    if (shouldLookupUserEmails && clerkClient && userId) {
      try {
        const clerkUser = await clerkClient.users.getUser(userId);
        userEmails = extractUserEmails(clerkUser);
      } catch (error) {
        console.warn(
          `[pokerchaos-backend] Failed to resolve Clerk user emails for ${userId}`,
          error
        );
      }
    }
    req.auth = { userId };
    req.entitlements = buildEntitlements(userId, userEmails);
    return next();
  } catch (error) {
    console.warn("[pokerchaos-backend] Auth failed", error);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

function requireFeature(featureKey) {
  return function featureGuard(req, res, next) {
    const features = req.entitlements || {};
    if (features[featureKey]) return next();
    return res.status(403).json({
      error: "Feature is not enabled for this account.",
      requiredFeature: featureKey,
    });
  };
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

const summaryReviewSchema = z.object({
  summary: z.record(z.any()),
  instruction: z.string().trim().max(700).optional(),
  model: z.string().trim().optional(),
});

const icmReviewSchema = z.object({
  icmSummary: z.record(z.any()),
  instruction: z.string().trim().max(700).optional(),
  model: z.string().trim().optional(),
});

const blindDefenseReviewSchema = z.object({
  blindDefenseSummary: z.record(z.any()),
  instruction: z.string().trim().max(700).optional(),
  model: z.string().trim().optional(),
});

const tableHintSchema = z.object({
  tableContext: z.record(z.any()),
  opponents: z.array(z.record(z.any())).optional().default([]),
  sessionSummary: z.record(z.any()).optional(),
  instruction: z.string().trim().max(700).optional(),
  model: z.string().trim().optional(),
});

const tournamentUploadSchema = z.object({
  historyText: z.string().trim().min(1).max(2_000_000),
  heroName: z.string().trim().min(1).max(64).optional().default("Hero"),
  tournamentId: z.string().trim().min(1).max(80).optional(),
  tournamentName: z.string().trim().max(160).optional(),
  uploadSource: z.string().trim().min(1).max(40).optional().default("ggpoker"),
});

const tournamentIdParamSchema = z.object({
  tournamentId: z.string().trim().min(1).max(80),
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

function summarizeTournamentHands(allHands, filteredHands, heroName, sortDirection, limit) {
  const heroFoldedPreflopCount = allHands.filter((hand) =>
    Boolean(hand?.heroPreflop?.didFold)
  ).length;
  const heroEnteredPreflopCount = allHands.filter(
    (hand) => Boolean(hand?.heroPreflop?.acted) && !Boolean(hand?.heroPreflop?.didFold)
  ).length;

  return {
    heroName,
    totalHands: allHands.length,
    filteredHands: filteredHands.length,
    returnedHands: Math.min(filteredHands.length, limit),
    heroFoldedPreflopCount,
    heroEnteredPreflopCount,
    sort: sortDirection,
  };
}

function resolveTournamentPlayedAtEpoch(hands) {
  const epochs = (Array.isArray(hands) ? hands : [])
    .map((hand) => Number(hand?.playedAtEpoch))
    .filter((value) => Number.isFinite(value));
  if (!epochs.length) return null;
  return Math.min(...epochs);
}

function resolveTournamentIdFromHands(hands, requestedTournamentId) {
  const requested = typeof requestedTournamentId === "string"
    ? requestedTournamentId.trim()
    : "";
  const ids = Array.from(
    new Set(
      hands
        .map((hand) => String(hand?.tournamentId || "").trim())
        .filter(Boolean)
    )
  );

  if (requested) {
    return { tournamentId: requested, ids };
  }

  if (ids.length === 1) {
    return { tournamentId: ids[0], ids };
  }

  if (ids.length === 0) {
    return { tournamentId: "", ids };
  }

  return { tournamentId: "", ids };
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

app.get("/me/entitlements", requireAuth, (req, res) => {
  return res.json({
    userId: req.auth?.userId || null,
    emails: Array.isArray(req.entitlements?.emails) ? req.entitlements.emails : [],
    features: {
      review: Boolean(req.entitlements?.review),
      reviewAi: Boolean(req.entitlements?.reviewAi),
      coach: Boolean(req.entitlements?.coach),
      admin: Boolean(req.entitlements?.admin),
    },
  });
});

function requireReviewAi(req, res, next) {
  if (req.entitlements?.reviewAi) return next();
  return res.status(403).json({
    error: "AI help currently disabled for this user.",
    requiredFeature: "reviewAi",
  });
}

app.post("/prompts", requireAuth, requireFeature("coach"), async (req, res) => {
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

app.post("/hand-history/parse", requireAuth, requireFeature("review"), async (req, res) => {
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
    const heroFoldedPreflopCount = allHands.filter((hand) =>
      Boolean(hand?.heroPreflop?.didFold)
    ).length;
    const heroEnteredPreflopCount = allHands.filter(
      (hand) => Boolean(hand?.heroPreflop?.acted) && !Boolean(hand?.heroPreflop?.didFold)
    ).length;
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
        heroFoldedPreflopCount,
        heroEnteredPreflopCount,
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

app.post(
  "/tournaments/upload",
  requireAuth,
  requireFeature("review"),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    const parsed = tournamentUploadSchema.safeParse(req.body ?? {});
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
      if (!allHands.length) {
        return res.status(400).json({
          error:
            "No valid hands were found in the upload. Verify the hand history format.",
        });
      }

      const { tournamentId, ids } = resolveTournamentIdFromHands(
        allHands,
        parsed.data.tournamentId
      );
      if (!tournamentId) {
        return res.status(400).json({
          error:
            "Unable to resolve a single tournament ID from this upload. Provide tournamentId explicitly.",
          detectedTournamentIds: ids,
        });
      }

      let resolvedTournamentId = tournamentId;
      let tournamentHands = allHands.filter(
        (hand) => String(hand?.tournamentId || "").trim() === tournamentId
      );
      if (!tournamentHands.length && ids.length === 1) {
        resolvedTournamentId = ids[0];
        tournamentHands = allHands.filter(
          (hand) => String(hand?.tournamentId || "").trim() === resolvedTournamentId
        );
      }
      if (!tournamentHands.length) {
        return res.status(400).json({
          error:
            "No hands matched the provided tournamentId in this upload.",
          tournamentId: resolvedTournamentId,
          detectedTournamentIds: ids,
        });
      }

      const filtered = filterHandsForReview(tournamentHands, {
        includeOnlyHeroDidNotFoldPreflop: false,
      });
      const sorted = sortHands(filtered, "newest");
      const tournamentPlayedAtEpoch =
        resolveTournamentPlayedAtEpoch(tournamentHands);
      const summary = summarizeTournamentHands(
        tournamentHands,
        filtered,
        parsed.data.heroName,
        "newest",
        sorted.length
      );
      const opponents = buildOpponentSnapshot(tournamentHands, {
        heroName: parsed.data.heroName,
        minHands: 1,
      });
      const compactHands = sorted.map(compactHandForApi);

      const saved = await upsertTournamentUpload({
        userId: req.auth?.userId || "",
        tournamentId: resolvedTournamentId,
        heroName: parsed.data.heroName,
        tournamentName: parsed.data.tournamentName,
        tournamentPlayedAtEpoch,
        uploadSource: parsed.data.uploadSource,
        historyText: parsed.data.historyText,
        parsedHands: compactHands,
        opponentSnapshot: opponents,
        summary,
      });

      return res.json({
        saved: {
          tournamentId: saved.tournamentId,
          heroName: saved.heroName,
          tournamentName: saved.tournamentName,
          tournamentPlayedAt: saved.tournamentPlayedAt,
          updatedAt: saved.updatedAt,
          createdAt: saved.createdAt,
        },
        summary,
        resolvedTournamentId:
          resolvedTournamentId !== tournamentId ? resolvedTournamentId : undefined,
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament upload error", error);
      return res.status(500).json({
        error: "Failed to upload tournament history. Please try again.",
      });
    }
  }
);

app.get(
  "/tournaments",
  requireAuth,
  requireFeature("review"),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    try {
      const items = await listTournamentUploads(req.auth?.userId || "");
      return res.json({ tournaments: items });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament list error", error);
      return res.status(500).json({
        error: "Failed to list tournaments.",
      });
    }
  }
);

app.get(
  "/tournaments/:tournamentId",
  requireAuth,
  requireFeature("review"),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    const parsedParams = tournamentIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return res.status(400).json({
        error: "Invalid tournament ID",
        details: parsedParams.error.flatten(),
      });
    }

    try {
      const record = await getTournamentUpload(
        req.auth?.userId || "",
        parsedParams.data.tournamentId
      );
      if (!record) {
        return res.status(404).json({ error: "Tournament upload not found." });
      }

      return res.json({
        tournament: {
          tournamentId: record.tournamentId,
          heroName: record.heroName,
          tournamentName: record.tournamentName,
          tournamentPlayedAt: record.tournamentPlayedAt,
          uploadSource: record.uploadSource,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          summary: record.summary || {},
          opponents: record.opponentSnapshot || {},
          hands: Array.isArray(record.parsedHands) ? record.parsedHands : [],
          historyText: record.historyText || "",
        },
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament get error", error);
      return res.status(500).json({
        error: "Failed to load tournament upload.",
      });
    }
  }
);

app.delete(
  "/tournaments/:tournamentId",
  requireAuth,
  requireFeature("review"),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    const parsedParams = tournamentIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return res.status(400).json({
        error: "Invalid tournament ID",
        details: parsedParams.error.flatten(),
      });
    }

    try {
      const deleted = await deleteTournamentUpload(
        req.auth?.userId || "",
        parsedParams.data.tournamentId
      );
      if (!deleted) {
        return res.status(404).json({ error: "Tournament upload not found." });
      }
      return res.json({ ok: true, deletedTournamentId: parsedParams.data.tournamentId });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament delete error", error);
      return res.status(500).json({
        error: "Failed to delete tournament upload.",
      });
    }
  }
);

app.post(
  "/tournaments/:tournamentId/delete",
  requireAuth,
  requireFeature("review"),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    const parsedParams = tournamentIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) {
      return res.status(400).json({
        error: "Invalid tournament ID",
        details: parsedParams.error.flatten(),
      });
    }

    try {
      const deleted = await deleteTournamentUpload(
        req.auth?.userId || "",
        parsedParams.data.tournamentId
      );
      if (!deleted) {
        return res.status(404).json({ error: "Tournament upload not found." });
      }
      return res.json({ ok: true, deletedTournamentId: parsedParams.data.tournamentId });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament delete error", error);
      return res.status(500).json({
        error: "Failed to delete tournament upload.",
      });
    }
  }
);

app.post(
  "/hand-history/review",
  requireAuth,
  requireFeature("review"),
  requireReviewAi,
  async (req, res) => {
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
  }
);

app.post(
  "/hand-history/summary-review",
  requireAuth,
  requireFeature("review"),
  requireReviewAi,
  async (req, res) => {
    const parsed = summaryReviewSchema.safeParse(req.body ?? {});
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
      const review = await reviewTournamentSummary(
        parsed.data.summary,
        parsed.data.instruction,
        parsed.data.model
      );
      return res.json({ review });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament summary review error", error);
      return res.status(502).json({
        error:
          "Failed to review tournament summary with AI. Please try again in a moment.",
      });
    }
  }
);

app.post(
  "/hand-history/icm-review",
  requireAuth,
  requireFeature("review"),
  requireReviewAi,
  async (req, res) => {
    const parsed = icmReviewSchema.safeParse(req.body ?? {});
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
      const review = await reviewIcmSpotSummary(
        parsed.data.icmSummary,
        parsed.data.instruction,
        parsed.data.model
      );
      return res.json({ review });
    } catch (error) {
      console.error("[pokerchaos-backend] ICM review error", error);
      return res.status(502).json({
        error: "Failed to review ICM spots with AI. Please try again in a moment.",
      });
    }
  }
);

app.post(
  "/hand-history/blind-defense-review",
  requireAuth,
  requireFeature("review"),
  requireReviewAi,
  async (req, res) => {
    const parsed = blindDefenseReviewSchema.safeParse(req.body ?? {});
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
      const review = await reviewBlindDefenseSummary(
        parsed.data.blindDefenseSummary,
        parsed.data.instruction,
        parsed.data.model
      );
      return res.json({ review });
    } catch (error) {
      console.error("[pokerchaos-backend] Blind defense review error", error);
      return res.status(502).json({
        error:
          "Failed to review blind defense spots with AI. Please try again in a moment.",
      });
    }
  }
);

app.post(
  "/hand-history/table-hint",
  requireAuth,
  requireFeature("review"),
  requireReviewAi,
  async (req, res) => {
    const parsed = tableHintSchema.safeParse(req.body ?? {});
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
      const tableHintContext = {
        tableContext: parsed.data.tableContext || {},
        opponents: Array.isArray(parsed.data.opponents)
          ? parsed.data.opponents
          : [],
        sessionSummary:
          parsed.data.sessionSummary &&
          typeof parsed.data.sessionSummary === "object"
            ? parsed.data.sessionSummary
            : {},
      };
      const review = await reviewCurrentTableHint(
        tableHintContext,
        parsed.data.instruction,
        parsed.data.model
      );
      return res.json({ review });
    } catch (error) {
      console.error("[pokerchaos-backend] Current table hint error", error);
      return res.status(502).json({
        error:
          "Failed to generate current table hint with AI. Please try again in a moment.",
      });
    }
  }
);

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

async function boot() {
  if (isDatabaseConfigured()) {
    try {
      await initDatabase();
      console.log("[pokerchaos-backend] Postgres initialized.");
    } catch (error) {
      console.error("[pokerchaos-backend] Failed to initialize Postgres", error);
      process.exit(1);
    }
  } else {
    console.warn(
      "[pokerchaos-backend] Postgres not configured. Tournament uploads are disabled."
    );
  }

  startServer(BASE_PORT);
}

boot();
