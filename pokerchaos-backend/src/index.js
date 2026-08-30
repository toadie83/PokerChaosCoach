import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { z } from "zod";
import { createClerkClient, verifyToken } from "@clerk/backend";
import {
  getAggressionPrompt,
  recognizeReplayCards,
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
  parseHandHistory,
  sortHands,
} from "./handHistoryService.js";
import { buildValidatedHandState } from "./handStateValidationService.js";
import { buildDeterministicIntelligence } from "./deterministicIntelligenceService.js";
import { attachReviewEvaluation } from "./reviewEvaluationService.js";
import {
  CAPABILITY_KEYS,
  canAccessCapability,
  createCapabilityGuard,
  resolveCapabilities,
} from "./capabilityService.js";
import {
  consumeAiTrialTokens,
  deleteAiHandReviewsForTournament,
  deleteTournamentPerformanceSnapshot,
  deleteTournamentUpload,
  ensureAiTrialCredits,
  getStudyReport,
  getAiHandReviewsForTournament,
  getMonthlyAiUsage,
  getTournamentUpload,
  getBillingCustomerByUserId,
  getUserBillingAiAccess,
  getUserIdByStripeCustomerId,
  initDatabase,
  insertTournamentPerformanceSnapshot,
  isDatabaseConfigured,
  listLearningResources,
  listStudyQueueItems,
  listStudyReports,
  listTournamentPerformanceSnapshots,
  listTournamentUploads,
  recordAiUsageEvent,
  deleteStudyQueueItem,
  saveStudyQueueItem,
  seedLearningResources,
  upsertAiHandReviews,
  upsertBillingCustomer,
  upsertBillingSubscription,
  updateStudyQueueItemStatus,
} from "./db.js";
import { LEARNING_RESOURCE_SEED } from "./studySpots/learningResourceSeed.js";
import { getStudySpotTaxonomy } from "./studySpots/taxonomy.js";
import {
  detectStudyUploadSite,
  logStudyTelemetry,
  telemetryKey,
} from "./studySpots/telemetry.js";
import {
  analyseSavedTournamentForStudy,
  analyseStudySpotsUpload,
} from "./studySpots/service.js";
import {
  TournamentUploadError,
  saveTournamentHistory,
} from "./tournamentUploadService.js";

dotenv.config();

const BASE_PORT = process.env.PORT ? Number(process.env.PORT) : 4011;
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((value) => String(value || "").trim())
  .filter(Boolean);
const allowedOrigins = FRONTEND_ORIGIN.length > 0 ? FRONTEND_ORIGIN : undefined;

if (!process.env.OPENAI_API_KEY) {
  console.warn("[pokerchaos-backend] OPENAI_API_KEY is not set.");
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn(
    "[pokerchaos-backend] STRIPE_SECRET_KEY is not set. Billing routes will be disabled.",
  );
}

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkIssuer = process.env.CLERK_ISSUER;
const reviewAllowAll =
  String(process.env.REVIEW_ALLOW_ALL || "true")
    .trim()
    .toLowerCase() !== "false";
const reviewAiAllowAll =
  String(process.env.REVIEW_AI_ALLOW_ALL || "false")
    .trim()
    .toLowerCase() === "true";
const reviewAiModel = String(process.env.REVIEW_AI_MODEL || "gpt-5.6-luna")
  .trim()
  .toLowerCase();
const studySpotsAiModel = String(
  process.env.STUDY_SPOTS_AI_MODEL || "gpt-5.6-luna",
)
  .trim()
  .toLowerCase();
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
const stripeWebhookSecret = String(
  process.env.STRIPE_WEBHOOK_SECRET || "",
).trim();
const stripePriceId = String(process.env.STRIPE_PRICE_ID || "").trim();
const stripeSuccessUrl = String(process.env.STRIPE_SUCCESS_URL || "").trim();
const stripeCancelUrl = String(process.env.STRIPE_CANCEL_URL || "").trim();
const stripePortalReturnUrl = String(
  process.env.STRIPE_PORTAL_RETURN_URL || "",
).trim();
const enableAiTrial =
  String(process.env.AI_ENABLE_TRIAL || "true")
    .trim()
    .toLowerCase() !== "false";
const aiTrialTokenGrantRaw = Number(process.env.AI_TRIAL_TOKEN_GRANT);
const aiTrialTokenGrant =
  Number.isFinite(aiTrialTokenGrantRaw) && aiTrialTokenGrantRaw > 0
    ? Math.floor(aiTrialTokenGrantRaw)
    : 100_000;
const aiMonthlyTokenCapRaw = Number(process.env.AI_MONTHLY_TOKEN_CAP);
const aiMonthlyTokenCap =
  Number.isFinite(aiMonthlyTokenCapRaw) && aiMonthlyTokenCapRaw > 0
    ? Math.floor(aiMonthlyTokenCapRaw)
    : 2_000_000;
const GPT_41_MINI_INPUT_COST_PER_TOKEN = 0.4 / 1_000_000;
const GPT_41_MINI_OUTPUT_COST_PER_TOKEN = 1.6 / 1_000_000;
const aiEstimatedHandReviewTokensPerHandRaw = Number(
  process.env.AI_ESTIMATED_HAND_REVIEW_TOKENS_PER_HAND,
);
const aiEstimatedSummaryTokensRaw = Number(
  process.env.AI_ESTIMATED_SUMMARY_TOKENS,
);
const aiEstimatedIcmTokensRaw = Number(process.env.AI_ESTIMATED_ICM_TOKENS);
const aiEstimatedBlindDefenseTokensRaw = Number(
  process.env.AI_ESTIMATED_BLIND_DEFENSE_TOKENS,
);
const aiEstimatedTableHintTokensRaw = Number(
  process.env.AI_ESTIMATED_TABLE_HINT_TOKENS,
);
const aiEstimatedHandReviewTokensPerHand =
  Number.isFinite(aiEstimatedHandReviewTokensPerHandRaw) &&
  aiEstimatedHandReviewTokensPerHandRaw > 0
    ? Math.floor(aiEstimatedHandReviewTokensPerHandRaw)
    : 5_000;
const aiEstimatedSummaryTokens =
  Number.isFinite(aiEstimatedSummaryTokensRaw) &&
  aiEstimatedSummaryTokensRaw > 0
    ? Math.floor(aiEstimatedSummaryTokensRaw)
    : 2_500;
const aiEstimatedIcmTokens =
  Number.isFinite(aiEstimatedIcmTokensRaw) && aiEstimatedIcmTokensRaw > 0
    ? Math.floor(aiEstimatedIcmTokensRaw)
    : 2_500;
const aiEstimatedBlindDefenseTokens =
  Number.isFinite(aiEstimatedBlindDefenseTokensRaw) &&
  aiEstimatedBlindDefenseTokensRaw > 0
    ? Math.floor(aiEstimatedBlindDefenseTokensRaw)
    : 2_500;
const aiEstimatedTableHintTokens =
  Number.isFinite(aiEstimatedTableHintTokensRaw) &&
  aiEstimatedTableHintTokensRaw > 0
    ? Math.floor(aiEstimatedTableHintTokensRaw)
    : 10_000;
const maxHandsPerAiReviewRequest = 30;
const reviewQaEnabled =
  String(process.env.REVIEW_QA_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false";
const reviewQaDevReportDefault =
  String(process.env.REVIEW_QA_DEV_REPORT || "false")
    .trim()
    .toLowerCase() === "true";
const coachAllowAll =
  String(process.env.COACH_ALLOW_ALL || "false")
    .trim()
    .toLowerCase() === "true";
const reviewQaMinCoherenceScore = Number(
  process.env.REVIEW_QA_MIN_COHERENCE_SCORE,
);
const reviewQaMaxHallucinationRisk = Number(
  process.env.REVIEW_QA_MAX_HALLUCINATION_RISK,
);
const clerkClient = clerkSecretKey
  ? createClerkClient({ secretKey: clerkSecretKey })
  : null;

let stripeClientPromise = null;
async function getStripeClient() {
  if (!stripeSecretKey) return null;
  if (!stripeClientPromise) {
    stripeClientPromise = import("stripe")
      .then((mod) => {
        const StripeCtor = mod?.default;
        if (!StripeCtor) {
          throw new Error("Stripe SDK default export not found.");
        }
        return new StripeCtor(stripeSecretKey);
      })
      .catch((error) => {
        stripeClientPromise = null;
        throw error;
      });
  }
  return stripeClientPromise;
}

const app = express();

app.use(
  cors({
    origin: allowedOrigins || true,
    credentials: false,
  }),
);

app.post(
  "/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const stripe = await getStripeClient().catch((error) => {
      console.error("[pokerchaos-backend] Stripe client load failed", error);
      return null;
    });
    if (!stripe) {
      return res.status(503).json({
        error: "Stripe is not configured.",
      });
    }

    let event = null;
    try {
      const signature = req.headers["stripe-signature"];
      if (stripeWebhookSecret && signature) {
        event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          stripeWebhookSecret,
        );
      } else {
        const textBody = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : String(req.body || "");
        event = JSON.parse(textBody || "{}");
      }
    } catch (error) {
      console.error(
        "[pokerchaos-backend] Stripe webhook signature error",
        error,
      );
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    try {
      await handleStripeWebhookEvent(event, stripe);
      return res.json({ received: true });
    } catch (error) {
      console.error(
        "[pokerchaos-backend] Stripe webhook handling error",
        error,
      );
      return res.status(500).json({ error: "Webhook handling failed." });
    }
  },
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
      .filter(Boolean),
  );
}

function parseEmailSet(raw) {
  if (typeof raw !== "string" || !raw.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
}

const reviewAllowedUserIds = parseUserIdSet(
  process.env.REVIEW_ALLOWED_USER_IDS,
);
const reviewAiAllowedUserIds = parseUserIdSet(
  process.env.REVIEW_AI_ALLOWED_USER_IDS,
);
const coachAllowedUserIds = parseUserIdSet(
  process.env.COACH_ALLOWED_USER_IDS,
);
const adminUserIds = parseUserIdSet(process.env.ADMIN_ALLOWED_USER_IDS);
const reviewAllowedEmails = parseEmailSet(process.env.REVIEW_ALLOWED_EMAILS);
const reviewAiAllowedEmails = parseEmailSet(
  process.env.REVIEW_AI_ALLOWED_EMAILS,
);
const coachAllowedEmails = parseEmailSet(process.env.COACH_ALLOWED_EMAILS);
const adminAllowedEmails = parseEmailSet(process.env.ADMIN_ALLOWED_EMAILS);
const developerQaAllowedEmails = new Set([
  "frosttrev@gmail.com",
  ...parseEmailSet(process.env.DEVELOPER_QA_ALLOWED_EMAILS),
]);
const shouldLookupUserEmails =
  reviewAllowedEmails.size > 0 ||
  reviewAiAllowedEmails.size > 0 ||
  coachAllowedEmails.size > 0 ||
  adminAllowedEmails.size > 0 ||
  developerQaAllowedEmails.size > 0;

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
  if (!(allowedEmailSet instanceof Set) || allowedEmailSet.size === 0)
    return false;
  const emails = Array.isArray(candidateEmails) ? candidateEmails : [];
  return emails.some((email) => allowedEmailSet.has(normalizeEmail(email)));
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveSessionRole(session = {}) {
  const candidates = [
    session?.role,
    session?.publicMetadata?.role,
    session?.public_metadata?.role,
    session?.unsafeMetadata?.role,
    session?.unsafe_metadata?.role,
    session?.metadata?.role,
  ];
  for (const candidate of candidates) {
    const role = normalizeRole(candidate);
    if (role) return role;
  }
  return "";
}

function buildEntitlements(userId, userEmails = [], options = {}) {
  const uid = String(userId || "").trim();
  const userRole = normalizeRole(options?.userRole);
  const isAdmin =
    adminUserIds.has(uid) ||
    hasAnyMatchingEmail(userEmails, adminAllowedEmails);
  const isDeveloper =
    userRole === "developer" ||
    isAdmin ||
    hasAnyMatchingEmail(userEmails, developerQaAllowedEmails);
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
    coachAllowAll ||
    isDeveloper ||
    coachAllowedUserIds.has(uid) ||
    hasAnyMatchingEmail(userEmails, coachAllowedEmails);
  return {
    review,
    reviewAi,
    coach,
    admin: isAdmin,
    developer: isDeveloper,
    role: userRole || null,
    emails: Array.isArray(userEmails) ? userEmails : [],
  };
}

async function resolveBillingAiAccessForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !isDatabaseConfigured()) {
    return {
      subscription: null,
      hasActiveSubscription: false,
      subscriptionStatus: null,
      trial: {
        userId: uid,
        grantedTokens: 0,
        usedTokens: 0,
        remainingTokens: 0,
        grantedAt: null,
        updatedAt: null,
      },
      reviewAiGranted: false,
    };
  }

  if (enableAiTrial && aiTrialTokenGrant > 0) {
    try {
      await ensureAiTrialCredits(uid, aiTrialTokenGrant);
    } catch (error) {
      console.error(
        "[pokerchaos-backend] Failed to ensure AI trial credits",
        error,
      );
    }
  }

  return getUserBillingAiAccess(uid);
}

function mergeEntitlementsWithBilling(baseEntitlements, billingAiAccess) {
  const base = baseEntitlements || {};
  const billing = billingAiAccess || {};
  const merged = {
    ...base,
    reviewAi: Boolean(base.reviewAi || billing.reviewAiGranted),
    billing: {
      hasActiveSubscription: Boolean(billing.hasActiveSubscription),
      subscriptionStatus: billing.subscriptionStatus || null,
      subscription: billing.subscription || null,
      trial: billing.trial || null,
    },
  };
  return {
    ...merged,
    capabilities: resolveCapabilities(merged),
  };
}

function extractSubscriptionPriceId(subscription) {
  const priceId =
    subscription?.items?.data?.[0]?.price?.id || subscription?.plan?.id || null;
  return typeof priceId === "string" && priceId.trim() ? priceId.trim() : null;
}

async function syncSubscriptionFromStripeObject(
  stripeSubscription,
  explicitUserId = null,
) {
  const subscriptionId = String(stripeSubscription?.id || "").trim();
  const stripeCustomerId = String(stripeSubscription?.customer || "").trim();
  if (!subscriptionId || !stripeCustomerId) return null;

  const status = String(stripeSubscription?.status || "unknown")
    .trim()
    .toLowerCase();
  const candidateUserId =
    String(
      explicitUserId ||
        stripeSubscription?.metadata?.userId ||
        stripeSubscription?.metadata?.user_id ||
        "",
    ).trim() || null;
  const mappedUserId = await getUserIdByStripeCustomerId(stripeCustomerId);
  const userId = candidateUserId || mappedUserId;
  if (!userId) {
    console.warn(
      "[pokerchaos-backend] Could not map Stripe subscription to user",
      subscriptionId,
    );
    return null;
  }
  if (!mappedUserId) {
    await upsertBillingCustomer({
      userId,
      stripeCustomerId,
      email: null,
    });
  }

  await upsertBillingSubscription({
    userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId,
    status,
    priceId: extractSubscriptionPriceId(stripeSubscription),
    currentPeriodStartEpoch: Number.isFinite(
      Number(stripeSubscription?.current_period_start),
    )
      ? Number(stripeSubscription.current_period_start)
      : null,
    currentPeriodEndEpoch: Number.isFinite(
      Number(stripeSubscription?.current_period_end),
    )
      ? Number(stripeSubscription.current_period_end)
      : null,
    cancelAtPeriodEnd: Boolean(stripeSubscription?.cancel_at_period_end),
    canceledAtEpoch: Number.isFinite(Number(stripeSubscription?.canceled_at))
      ? Number(stripeSubscription.canceled_at)
      : null,
    raw: stripeSubscription || {},
  });
  return userId;
}

async function handleStripeWebhookEvent(event, stripe) {
  const type = String(event?.type || "").trim();
  const object = event?.data?.object || null;
  if (!type || !object) return;

  if (type === "checkout.session.completed") {
    const customerId = String(object?.customer || "").trim();
    const userId = String(
      object?.client_reference_id ||
        object?.metadata?.userId ||
        object?.metadata?.user_id ||
        "",
    ).trim();
    const email = String(object?.customer_details?.email || "").trim() || null;
    if (userId && customerId) {
      await upsertBillingCustomer({
        userId,
        stripeCustomerId: customerId,
        email,
      });
      if (enableAiTrial && aiTrialTokenGrant > 0) {
        await ensureAiTrialCredits(userId, aiTrialTokenGrant);
      }
    }

    if (object?.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(object.subscription);
        await syncSubscriptionFromStripeObject(sub, userId || null);
      } catch (error) {
        console.error(
          "[pokerchaos-backend] Failed to retrieve subscription after checkout completion",
          error,
        );
      }
    }
    return;
  }

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    await syncSubscriptionFromStripeObject(object, null);
    return;
  }
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
          error,
        );
      }
    }
    const userRole = resolveSessionRole(session);
    req.auth = { userId, role: userRole || null };
    const baseEntitlements = buildEntitlements(userId, userEmails, {
      userRole,
    });
    const billingAiAccess = await resolveBillingAiAccessForUser(userId);
    req.entitlements = mergeEntitlementsWithBilling(
      baseEntitlements,
      billingAiAccess,
    );
    req.aiAccess = billingAiAccess;
    return next();
  } catch (error) {
    console.warn("[pokerchaos-backend] Auth failed", error);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

function requireCapability(capabilityKey) {
  return createCapabilityGuard(capabilityKey, {
    onDenied: (req, denial) =>
      logStudyTelemetry("capability_access_denied", {
        userId: req.auth?.userId,
        capability: capabilityKey,
        capabilityState: denial.capabilityState,
        method: req.method,
      }),
  });
}

const liveActionSchema = z.enum([
  "open",
  "call",
  "3-bet",
  "4-bet",
  "check",
  "bet",
  "raise",
  "jam",
  "fold",
]);

const liveDecisionNodeSchema = z
  .object({
    street: z.enum(["preflop", "flop", "turn", "river"]),
    decisionKind: z.string().nullable().optional(),
    heroSeat: z.string().nullable().optional(),
    opponentSeat: z.string().nullable().optional(),
    relativePosition: z.enum(["ip", "oop", "unknown", "not_applicable"]),
    tableSize: z.number().int().min(2).max(10),
    playersInHand: z.number().int().min(2).max(10),
    playersLiveAtDecision: z.number().int().min(1).max(10).optional(),
    playersYetToActSeats: z.array(z.string()).max(9).optional(),
    playersYetToActCount: z.number().int().min(0).max(9).optional(),
    playersYetToActStacksKnown: z.boolean().optional(),
    gameType: z.enum(["tournament", "cash"]),
    bountyMode: z
      .enum(["none", "unknown", "standard_ko", "progressive_ko"])
      .catch("none")
      .optional(),
    anteBB: z.number().nonnegative(),
    potBB: z.number().positive().nullable(),
    rawPotBB: z.number().positive().nullable().optional(),
    contestablePotBB: z.number().positive().nullable().optional(),
    uncalledExcessBB: z.number().nonnegative().optional(),
    potCorrectionBB: z.number().nonnegative().optional(),
    effectiveStackBB: z.number().positive().nullable(),
    primaryOpponentEffectiveStackBB: z.number().positive().nullable().optional(),
    startingEffectiveStackBB: z.number().positive().nullable().optional(),
    startingHeroStackBB: z.number().positive().nullable().optional(),
    startingOpponentStackBB: z.number().positive().nullable().optional(),
    heroStackBehindBB: z.number().nonnegative().nullable().optional(),
    opponentStackBehindBB: z.number().nonnegative().nullable().optional(),
    heroStackAfterCallBB: z.number().nonnegative().nullable().optional(),
    heroTotalCommittedBB: z.number().nonnegative().optional(),
    opponentTotalCommittedBB: z.number().nonnegative().optional(),
    maxHeroTotalToBB: z.number().positive().nullable().optional(),
    maxOpponentTotalToBB: z.number().positive().nullable().optional(),
    heroMaximumExposureBB: z.number().positive().nullable().optional(),
    heroExposureBeyondPrimaryOpponentBB: z.number().nonnegative().nullable().optional(),
    strategicRestrictions: z
      .array(
        z.object({
          action: liveActionSchema,
          code: z.string(),
          reason: z.string(),
        }),
      )
      .max(6)
      .optional(),
    effectiveStackToPotRatio: z.number().nonnegative().nullable().optional(),
    heroStackToPotRatio: z.number().nonnegative().nullable().optional(),
    potSource: z
      .enum([
        "running_from_manual_override",
        "estimated_from_actions",
        "manual_override",
        "forced_preflop_baseline",
        "unknown",
      ])
      .optional(),
    spr: z.number().nonnegative().nullable(),
    potOddsPct: z.number().min(0).max(100).nullable(),
    potOdds: z
      .object({
        requiredEquityPct: z.number().min(0).max(100),
        callAmountBB: z.number().positive(),
        potBeforeCallBB: z.number().positive(),
        potAfterCallBB: z.number().positive(),
      })
      .nullable()
      .optional(),
    minimumRaiseToBB: z.number().positive().nullable(),
    minimumBetBB: z.number().positive().nullable(),
    heroCommittedBB: z.number().nonnegative(),
    opponentCommittedBB: z.number().nonnegative(),
    currentBetBB: z.number().nonnegative(),
    preflopSequence: z
      .object({
        kind: z.literal("open_then_3bet"),
        initialOpenAmountBB: z.number().positive(),
        initialOpenerSeat: z.string().nullable().optional(),
        threeBetToBB: z.number().positive(),
        threeBettorSeat: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    facingAction: z
      .object({
        type: z.string(),
        actorSeat: z.string().nullable().optional(),
        amountBB: z.number().positive().nullable(),
        toAmountBB: z.number().positive().nullable(),
        callAmountBB: z.number().positive().nullable(),
        allIn: z.boolean(),
        initialOpenAmountBB: z.number().positive().nullable().optional(),
        initialOpenerSeat: z.string().nullable().optional(),
        openerStillActive: z.boolean().optional(),
      })
      .nullable(),
    lastAggressorSeat: z.string().nullable().optional(),
    legalActions: z.array(liveActionSchema).min(1).max(9),
    heroCards: z.array(z.string()).max(2),
    boardCards: z.array(z.string()).max(5),
    actionHistory: z.array(z.record(z.any())).max(40),
    missingInformation: z.array(z.string()).max(12),
  })
  .passthrough();

const livePromptContextSchema = z
  .object({
    street: z.enum(["preflop", "flop", "turn", "river"]).optional(),
    heroSeat: z.string().optional(),
    tableSize: z.number().int().min(2).max(10).optional(),
    tournamentStage: z
      .enum([
        "auto",
        "early_reentry",
        "middle_accumulation",
        "bubble_pressure",
        "post_bubble",
        "late_endgame",
      ])
      .catch("auto")
      .optional(),
    bountyMode: z
      .enum(["none", "unknown", "standard_ko", "progressive_ko"])
      .catch("none")
      .optional(),
    persona: z.string().optional(),
    heroCards: z.record(z.any()).optional(),
    board: z.record(z.any()).optional(),
    decisionNode: liveDecisionNodeSchema.optional(),
    legalActions: z.array(liveActionSchema).max(9).optional(),
    history: z.array(z.record(z.any())).max(40).optional(),
  })
  .passthrough();

const promptSchema = z.object({
  context: livePromptContextSchema.optional().default({}),
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
  selectedHands: z
    .array(z.record(z.any()))
    .min(1)
    .max(maxHandsPerAiReviewRequest),
  opponentSnapshot: z.record(z.any()).optional(),
  instruction: z.string().trim().max(700).optional(),
  model: z.string().trim().optional(),
  includeEvaluationReport: z.boolean().optional().default(false),
  evaluationThresholds: z
    .object({
      minimum_coherence_score: z.number().min(0).max(100).optional(),
      maximum_hallucination_risk: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

const replayImageDataUrlSchema = z
  .string()
  .max(6_000_000)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,/i);
const replayCardCodeSchema = z.string().regex(/^[AKQJT2-9][shdc]$/i);
const replayVisionSchema = z
  .object({
    boardImageDataUrl: replayImageDataUrlSchema.optional(),
    heroImageDataUrl: replayImageDataUrlSchema.optional(),
    imageDataUrl: replayImageDataUrlSchema.optional(),
    expectedBoardCount: z.union([
      z.literal(0),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    readHeroStack: z.boolean().optional().default(false),
    knownHeroCards: z.array(replayCardCodeSchema).max(2).optional().default([]),
    knownBoardCards: z.array(replayCardCodeSchema).max(5).optional().default([]),
  })
  .refine(
    (value) =>
      Boolean(value.imageDataUrl) ||
      Boolean(value.boardImageDataUrl && value.heroImageDataUrl),
    { message: "Provide both card crops or one legacy composite image." },
  );

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
  reviewsByHandKey: z.record(z.any()).optional(),
});

const studySpotsAnalyseSchema = tournamentUploadSchema.omit({
  reviewsByHandKey: true,
});

const studyReportIdParamSchema = z.object({
  reportId: z.string().uuid(),
});

const studySpotIdParamSchema = z.object({
  studySpotId: z.string().uuid(),
});

const studyQueueStatusSchema = z.object({
  status: z.enum(["to_review", "completed"]),
});

const tournamentIdParamSchema = z.object({
  tournamentId: z.string().trim().min(1).max(80),
});

const tournamentPerformanceSchema = z.object({
  tournamentId: z.string().trim().min(1).max(80),
  tournamentName: z.string().trim().max(160).optional().nullable(),
  tournamentPlayedAt: z
    .string()
    .trim()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (!Number.isFinite(parsed.getTime())) return null;
      if (parsed.getTime() < Date.UTC(2000, 0, 1)) return null;
      return value;
    }),
  score10: z.coerce.number().min(0).max(10),
  scorePct: z.coerce.number().min(0).max(100).optional().nullable(),
  sampleHands: z.coerce.number().int().nonnegative().optional().nullable(),
  totalHands: z.coerce.number().int().nonnegative().optional().nullable(),
  sourceUploadSaved: z.boolean().optional().default(false),
  metadata: z.record(z.any()).optional().default({}),
});

const checkoutSessionSchema = z.object({
  successUrl: z.string().trim().url().optional(),
  cancelUrl: z.string().trim().url().optional(),
});

const portalSessionSchema = z.object({
  returnUrl: z.string().trim().url().optional(),
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
      String(action?.type || "") === "fold",
  );
  if (foldAt >= 0) {
    clone.actionsByStreet[foldedStreet] = foldedActions.slice(0, foldAt + 1);
  }

  const heroFoldedActions = Array.isArray(
    clone?.heroActionsByStreet?.[foldedStreet],
  )
    ? clone.heroActionsByStreet[foldedStreet]
    : [];
  const heroFoldAt = heroFoldedActions.findIndex(
    (action) => String(action?.type || "") === "fold",
  );
  if (heroFoldAt >= 0) {
    clone.heroActionsByStreet[foldedStreet] = heroFoldedActions.slice(
      0,
      heroFoldAt + 1,
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
      foldToPreflopRaisePct: toFiniteNumberOrNull(
        item?.foldToPreflopRaise?.pct,
      ),
      postflopAggressionFrequencyPct: toFiniteNumberOrNull(
        item?.postflopAggression?.frequencyPct,
      ),
      postflopAggressionFactor: toFiniteNumberOrNull(
        item?.postflopAggression?.factor,
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

app.get("/me/entitlements", requireAuth, (req, res) => {
  const trial = req.entitlements?.billing?.trial;
  const capabilities = req.entitlements?.capabilities || resolveCapabilities();
  return res.json({
    userId: req.auth?.userId || null,
    emails: Array.isArray(req.entitlements?.emails)
      ? req.entitlements.emails
      : [],
    capabilities,
    features: {
      review: canAccessCapability(
        capabilities,
        CAPABILITY_KEYS.TOURNAMENT_REVIEW,
      ),
      reviewAi: Boolean(req.entitlements?.reviewAi),
      coach: canAccessCapability(capabilities, CAPABILITY_KEYS.COACH),
      admin: Boolean(req.entitlements?.admin),
      developer: Boolean(req.entitlements?.developer),
    },
    billing: {
      hasActiveSubscription: Boolean(
        req.entitlements?.billing?.hasActiveSubscription,
      ),
      subscriptionStatus: req.entitlements?.billing?.subscriptionStatus || null,
      trial: trial
        ? {
            grantedTokens: toNonNegativeInt(trial.grantedTokens),
            usedTokens: toNonNegativeInt(trial.usedTokens),
            remainingTokens: toNonNegativeInt(trial.remainingTokens),
          }
        : null,
    },
  });
});

app.get(
  "/study-spots/taxonomy",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  (_req, res) => res.json(getStudySpotTaxonomy()),
);

app.get(
  "/learning-resources",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: "Learning resources require a configured database.",
        code: "DATABASE_UNAVAILABLE",
      });
    }
    try {
      const tag = String(req.query?.tag || "").trim() || null;
      const requestedUnpublished = String(req.query?.published || "true") === "false";
      const publishedOnly = !requestedUnpublished || !req.entitlements?.admin;
      const resources = await listLearningResources({ publishedOnly, tag });
      return res.json({ resources });
    } catch (error) {
      console.error("[pokerchaos-backend] Learning resource list error", error);
      return res.status(500).json({
        error: "Failed to list learning resources.",
        code: "LEARNING_RESOURCE_LIST_FAILED",
      });
    }
  },
);

app.post(
  "/study-spots/analyse",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: "Study Spots requires a configured database.",
        code: "DATABASE_UNAVAILABLE",
      });
    }
    const parsed = studySpotsAnalyseSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body.",
        code: "MALFORMED_UPLOAD",
        details: parsed.error.flatten(),
      });
    }
    const analysisStartedAt = Date.now();
    const userId = req.auth?.userId || "";
    logStudyTelemetry("study_spots_upload_started", {
      userId,
      uploadSource: parsed.data.uploadSource || "unknown",
      inputBytes: Buffer.byteLength(parsed.data.historyText, "utf8"),
      retry: false,
    });
    try {
      const result = await analyseStudySpotsUpload({
        userId,
        ...parsed.data,
        model: studySpotsAiModel,
      });
      if (result.usage) {
        await trackAiUsage({
          userId,
          endpoint: "/study-spots/analyse",
          model: studySpotsAiModel,
          usage: result.usage,
          hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
          consumeTrialCredits: false,
        });
      }
      logStudyTelemetry("study_spots_analysis_completed", {
        userId,
        handCount: result.report?.handsAnalysed,
        candidateCount: result.report?.candidateCount,
        spotCount: result.report?.spotCount,
        durationMs: Date.now() - analysisStartedAt,
        pipelineVersion: result.report?.pipelineVersion,
        model: result.report?.model,
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens,
        retry: false,
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof TournamentUploadError) {
        logStudyTelemetry("study_spots_parse_failed", {
          userId,
          errorCode: error.code,
          detectedSite: detectStudyUploadSite(parsed.data.historyText),
          durationMs: Date.now() - analysisStartedAt,
        });
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...error.details,
        });
      }
      logStudyTelemetry("study_spots_analysis_failed", {
        userId,
        stage: error?.reportId ? "classification" : "persistence",
        errorCode: "ANALYSIS_FAILED",
        durationMs: Date.now() - analysisStartedAt,
        retry: false,
      });
      console.error("[pokerchaos-backend] Study Spot analysis error", error);
      return res.status(502).json({
        error: "Study Spot analysis failed. Your tournament was saved for retry.",
        code: "ANALYSIS_FAILED",
        reportId: error?.reportId || null,
      });
    }
  },
);

app.get(
  "/study-spots/reports",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: "Study Reports require a configured database.",
        code: "DATABASE_UNAVAILABLE",
      });
    }
    try {
      const reports = await listStudyReports(req.auth?.userId || "");
      return res.json({ reports });
    } catch (error) {
      console.error("[pokerchaos-backend] Study Report list error", error);
      return res.status(500).json({
        error: "Failed to list Study Reports.",
        code: "REPORT_LIST_FAILED",
      });
    }
  },
);

app.get(
  "/study-spots/reports/:reportId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    const parsed = studyReportIdParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid report ID.",
        code: "REPORT_NOT_FOUND",
      });
    }
    try {
      const report = await getStudyReport(
        req.auth?.userId || "",
        parsed.data.reportId,
      );
      if (!report) {
        return res.status(404).json({
          error: "Study Report not found.",
          code: "REPORT_NOT_FOUND",
        });
      }
      return res.json({ report });
    } catch (error) {
      console.error("[pokerchaos-backend] Study Report read error", error);
      return res.status(500).json({
        error: "Failed to load Study Report.",
        code: "REPORT_READ_FAILED",
      });
    }
  },
);

app.post(
  "/study-spots/reports/:reportId/retry",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    const parsed = studyReportIdParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid report ID.",
        code: "REPORT_NOT_FOUND",
      });
    }
    const analysisStartedAt = Date.now();
    const userId = req.auth?.userId || "";
    try {
      const failedReport = await getStudyReport(
        userId,
        parsed.data.reportId,
      );
      if (!failedReport) {
        return res.status(404).json({
          error: "Study Report not found.",
          code: "REPORT_NOT_FOUND",
        });
      }
      if (failedReport.status !== "failed") {
        return res.status(409).json({
          error: "Only failed Study Reports can be retried.",
          code: "REPORT_NOT_RETRYABLE",
        });
      }
      const tournament = await getTournamentUpload(
        userId,
        failedReport.tournamentId,
      );
      if (!tournament) {
        return res.status(404).json({
          error: "Saved tournament not found.",
          code: "TOURNAMENT_NOT_FOUND",
        });
      }
      logStudyTelemetry("study_spots_upload_started", {
        userId,
        uploadSource: "saved-tournament",
        inputBytes: 0,
        retry: true,
      });
      const result = await analyseSavedTournamentForStudy({
        userId,
        tournamentId: tournament.tournamentId,
        compactHands: Array.isArray(tournament.parsedHands)
          ? tournament.parsedHands
          : [],
        model: studySpotsAiModel,
      });
      if (result.usage) {
        await trackAiUsage({
          userId,
          endpoint: "/study-spots/retry",
          model: studySpotsAiModel,
          usage: result.usage,
          hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
          consumeTrialCredits: false,
        });
      }
      logStudyTelemetry("study_spots_analysis_completed", {
        userId,
        handCount: result.report?.handsAnalysed,
        candidateCount: result.report?.candidateCount,
        spotCount: result.report?.spotCount,
        durationMs: Date.now() - analysisStartedAt,
        pipelineVersion: result.report?.pipelineVersion,
        model: result.report?.model,
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        totalTokens: result.usage?.total_tokens,
        retry: true,
      });
      return res.json(result);
    } catch (error) {
      logStudyTelemetry("study_spots_analysis_failed", {
        userId,
        stage: "retry",
        errorCode: "ANALYSIS_FAILED",
        durationMs: Date.now() - analysisStartedAt,
        retry: true,
      });
      console.error("[pokerchaos-backend] Study Report retry error", error);
      return res.status(502).json({
        error: "Study Spot analysis retry failed.",
        code: "ANALYSIS_FAILED",
        reportId: error?.reportId || null,
      });
    }
  },
);

app.get(
  "/study-queue",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    const status = String(req.query?.status || "").trim() || null;
    if (status && !["to_review", "completed"].includes(status)) {
      return res.status(400).json({
        error: "Invalid queue status.",
        code: "INVALID_QUEUE_STATUS",
      });
    }
    try {
      const items = await listStudyQueueItems(req.auth?.userId || "", status);
      return res.json({ items });
    } catch (error) {
      console.error("[pokerchaos-backend] Study queue list error", error);
      return res.status(500).json({
        error: "Failed to load My Study.",
        code: "STUDY_QUEUE_READ_FAILED",
      });
    }
  },
);

app.put(
  "/study-queue/:studySpotId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    const parsed = studySpotIdParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid Study Spot ID.",
        code: "STUDY_SPOT_NOT_FOUND",
      });
    }
    try {
      const item = await saveStudyQueueItem(
        req.auth?.userId || "",
        parsed.data.studySpotId,
      );
      if (!item) {
        return res.status(404).json({
          error: "Study Spot not found.",
          code: "STUDY_SPOT_NOT_FOUND",
        });
      }
      logStudyTelemetry("study_spot_saved", {
        userId: req.auth?.userId,
        spotKey: telemetryKey(parsed.data.studySpotId),
      });
      return res.json({ item });
    } catch (error) {
      console.error("[pokerchaos-backend] Study queue save error", error);
      return res.status(500).json({
        error: "Failed to save Study Spot.",
        code: "STUDY_QUEUE_SAVE_FAILED",
      });
    }
  },
);

app.patch(
  "/study-queue/:studySpotId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    const params = studySpotIdParamSchema.safeParse(req.params ?? {});
    const body = studyQueueStatusSchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return res.status(400).json({
        error: "Invalid queue update.",
        code: "INVALID_QUEUE_STATUS",
      });
    }
    try {
      const item = await updateStudyQueueItemStatus(
        req.auth?.userId || "",
        params.data.studySpotId,
        body.data.status,
      );
      if (!item) {
        return res.status(404).json({
          error: "Study queue item not found.",
          code: "STUDY_SPOT_NOT_FOUND",
        });
      }
      if (body.data.status === "completed") {
        logStudyTelemetry("study_spot_completed", {
          userId: req.auth?.userId,
          spotKey: telemetryKey(params.data.studySpotId),
        });
      }
      return res.json({ item });
    } catch (error) {
      console.error("[pokerchaos-backend] Study queue update error", error);
      return res.status(500).json({
        error: "Failed to update Study Spot.",
        code: "STUDY_QUEUE_UPDATE_FAILED",
      });
    }
  },
);

app.delete(
  "/study-queue/:studySpotId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.STUDY_SPOTS),
  async (req, res) => {
    const parsed = studySpotIdParamSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid Study Spot ID.",
        code: "STUDY_SPOT_NOT_FOUND",
      });
    }
    try {
      const deleted = await deleteStudyQueueItem(
        req.auth?.userId || "",
        parsed.data.studySpotId,
      );
      if (!deleted) {
        return res.status(404).json({
          error: "Study queue item not found.",
          code: "STUDY_SPOT_NOT_FOUND",
        });
      }
      return res.json({ deleted: true });
    } catch (error) {
      console.error("[pokerchaos-backend] Study queue delete error", error);
      return res.status(500).json({
        error: "Failed to remove Study Spot.",
        code: "STUDY_QUEUE_DELETE_FAILED",
      });
    }
  },
);

app.get("/me/ai-usage", requireAuth, async (req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error:
        "Database is required for AI usage tracking. Configure DATABASE_URL and restart backend.",
    });
  }
  try {
    const userId = req.auth?.userId || "";
    const [usage, aiAccess] = await Promise.all([
      getMonthlyAiUsage(userId, new Date()),
      resolveBillingAiAccessForUser(userId),
    ]);
    const usedTokens = toNonNegativeInt(usage.totalTokens);
    return res.json({
      periodMonth: usage.periodMonth,
      limitTokens: aiMonthlyTokenCap,
      usedTokens,
      remainingTokens: Math.max(0, aiMonthlyTokenCap - usedTokens),
      usedCostUsd: usage.totalCostUsd,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      inputCostUsd: usage.inputCostUsd,
      outputCostUsd: usage.outputCostUsd,
      model: reviewAiModel,
      billing: {
        hasActiveSubscription: Boolean(aiAccess.hasActiveSubscription),
        subscriptionStatus: aiAccess.subscriptionStatus || null,
        trialRemainingTokens: toNonNegativeInt(
          aiAccess?.trial?.remainingTokens,
        ),
      },
      pricing: {
        inputPer1MUsd: 0.4,
        outputPer1MUsd: 1.6,
      },
    });
  } catch (error) {
    console.error("[pokerchaos-backend] AI usage read error", error);
    return res.status(500).json({
      error: "Failed to read AI usage for this account.",
    });
  }
});

app.get("/me/billing", requireAuth, async (req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error:
        "Database is required for billing data. Configure DATABASE_URL and restart backend.",
    });
  }
  try {
    const userId = req.auth?.userId || "";
    const customer = await getBillingCustomerByUserId(userId);
    const access = await resolveBillingAiAccessForUser(userId);
    return res.json({
      stripeConfigured: Boolean(stripeSecretKey && stripePriceId),
      customer: customer
        ? {
            stripeCustomerId: customer.stripeCustomerId,
            email: customer.email,
          }
        : null,
      subscription: access.subscription
        ? {
            status: access.subscription.status,
            priceId: access.subscription.priceId,
            currentPeriodEnd: access.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: access.subscription.cancelAtPeriodEnd,
          }
        : null,
      trial: access.trial
        ? {
            grantedTokens: toNonNegativeInt(access.trial.grantedTokens),
            usedTokens: toNonNegativeInt(access.trial.usedTokens),
            remainingTokens: toNonNegativeInt(access.trial.remainingTokens),
          }
        : null,
      reviewAiGranted: Boolean(access.reviewAiGranted),
    });
  } catch (error) {
    console.error("[pokerchaos-backend] Billing status read error", error);
    return res.status(500).json({ error: "Failed to load billing status." });
  }
});

app.post("/billing/checkout-session", requireAuth, async (req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error:
        "Database is required for billing. Configure DATABASE_URL and restart backend.",
    });
  }
  if (!stripePriceId) {
    return res.status(500).json({
      error: "STRIPE_PRICE_ID is not configured.",
    });
  }

  const parsed = checkoutSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const successUrl = parsed.data.successUrl || stripeSuccessUrl;
  const cancelUrl = parsed.data.cancelUrl || stripeCancelUrl;
  if (!successUrl || !cancelUrl) {
    return res.status(500).json({
      error:
        "Stripe checkout URLs are not configured. Set STRIPE_SUCCESS_URL and STRIPE_CANCEL_URL.",
    });
  }

  const stripe = await getStripeClient().catch((error) => {
    console.error("[pokerchaos-backend] Stripe client load failed", error);
    return null;
  });
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured." });
  }

  try {
    const userId = req.auth?.userId || "";
    const access = await resolveBillingAiAccessForUser(userId);
    if (access.hasActiveSubscription) {
      return res.status(409).json({
        error: "An active subscription already exists for this account.",
        code: "SUBSCRIPTION_ALREADY_ACTIVE",
      });
    }

    const existingCustomer = await getBillingCustomerByUserId(userId);
    let stripeCustomerId = existingCustomer?.stripeCustomerId || null;
    if (!stripeCustomerId) {
      const email = Array.isArray(req.entitlements?.emails)
        ? req.entitlements.emails[0] || undefined
        : undefined;
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      stripeCustomerId = String(customer?.id || "").trim() || null;
      if (!stripeCustomerId) {
        throw new Error("Stripe customer creation did not return an ID.");
      }
      await upsertBillingCustomer({
        userId,
        stripeCustomerId,
        email: email || null,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: userId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
      },
    });

    return res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("[pokerchaos-backend] Stripe checkout session error", error);
    return res.status(502).json({
      error: "Failed to create Stripe checkout session.",
    });
  }
});

app.post("/billing/portal-session", requireAuth, async (req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error:
        "Database is required for billing. Configure DATABASE_URL and restart backend.",
    });
  }

  const parsed = portalSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const stripe = await getStripeClient().catch((error) => {
    console.error("[pokerchaos-backend] Stripe client load failed", error);
    return null;
  });
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured." });
  }

  const returnUrl =
    parsed.data.returnUrl ||
    stripePortalReturnUrl ||
    stripeCancelUrl ||
    stripeSuccessUrl;
  if (!returnUrl) {
    return res.status(500).json({
      error:
        "Stripe portal return URL is not configured. Set STRIPE_PORTAL_RETURN_URL.",
    });
  }

  try {
    const userId = req.auth?.userId || "";
    const customer = await getBillingCustomerByUserId(userId);
    if (!customer?.stripeCustomerId) {
      return res.status(404).json({
        error: "No Stripe customer found for this account yet.",
      });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: returnUrl,
    });
    return res.json({
      url: session.url,
    });
  } catch (error) {
    console.error("[pokerchaos-backend] Stripe portal session error", error);
    return res.status(502).json({
      error: "Failed to create Stripe portal session.",
    });
  }
});

function requireReviewAi(req, res, next) {
  if (req.entitlements?.reviewAi) return next();
  return res.status(403).json({
    error: "AI help currently disabled for this user.",
    requiredFeature: "reviewAi",
  });
}

function toNonNegativeInt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
  }
  const promptTokens = toNonNegativeInt(usage.prompt_tokens);
  const completionTokens = toNonNegativeInt(usage.completion_tokens);
  const totalTokens = toNonNegativeInt(usage.total_tokens);
  const safeTotal = totalTokens || promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: safeTotal,
  };
}

function sumUsageEntries(usageEntries = []) {
  const aggregate = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  const entries = Array.isArray(usageEntries) ? usageEntries : [];
  for (const entry of entries) {
    const usage = normalizeUsage(entry);
    aggregate.prompt_tokens += usage.prompt_tokens;
    aggregate.completion_tokens += usage.completion_tokens;
    aggregate.total_tokens += usage.total_tokens;
  }
  return aggregate;
}

function calculateUsageCost(usage) {
  const safeUsage = normalizeUsage(usage);
  const inputCostUsd =
    safeUsage.prompt_tokens * GPT_41_MINI_INPUT_COST_PER_TOKEN;
  const outputCostUsd =
    safeUsage.completion_tokens * GPT_41_MINI_OUTPUT_COST_PER_TOKEN;
  const totalCostUsd = inputCostUsd + outputCostUsd;
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
  };
}

async function ensureAiQuota(req, res, estimatedTokens, endpointLabel) {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({
      error:
        "Database is required for AI usage tracking. Configure DATABASE_URL and restart backend.",
      endpoint: endpointLabel,
    });
  }

  const userId = req.auth?.userId || "";
  const estimate = toNonNegativeInt(estimatedTokens);
  try {
    const aiAccess =
      req.aiAccess || (await resolveBillingAiAccessForUser(userId));
    const hasActiveSubscription = Boolean(aiAccess?.hasActiveSubscription);
    const trialRemainingTokens = toNonNegativeInt(
      aiAccess?.trial?.remainingTokens,
    );
    const shouldEnforceTrial =
      !hasActiveSubscription &&
      enableAiTrial &&
      !Boolean(req.entitlements?.admin) &&
      !reviewAiAllowAll;
    if (shouldEnforceTrial) {
      if (trialRemainingTokens <= 0) {
        return res.status(429).json({
          error:
            "AI trial tokens are exhausted. Start a subscription to continue using AI reviews.",
          code: "AI_TRIAL_TOKENS_EXHAUSTED",
          endpoint: endpointLabel,
          trialRemainingTokens: 0,
        });
      }
      if (estimate > trialRemainingTokens) {
        return res.status(429).json({
          error:
            "This request exceeds remaining AI trial tokens. Reduce request size or subscribe.",
          code: "AI_TRIAL_TOKENS_INSUFFICIENT",
          endpoint: endpointLabel,
          trialRemainingTokens,
          estimatedTokens: estimate,
        });
      }
    }

    const usage = await getMonthlyAiUsage(userId, new Date());
    const usedTokens = toNonNegativeInt(usage.totalTokens);
    const projectedTokens = usedTokens + estimate;
    if (
      usedTokens >= aiMonthlyTokenCap ||
      projectedTokens > aiMonthlyTokenCap
    ) {
      const remainingTokens = Math.max(0, aiMonthlyTokenCap - usedTokens);
      return res.status(429).json({
        error: "Monthly AI token limit reached for this account.",
        code: "AI_MONTHLY_TOKEN_LIMIT_REACHED",
        endpoint: endpointLabel,
        limitTokens: aiMonthlyTokenCap,
        usedTokens,
        remainingTokens,
        periodMonth: usage.periodMonth,
      });
    }
    return null;
  } catch (error) {
    console.error("[pokerchaos-backend] AI quota check failed", error);
    return res.status(500).json({
      error: "Failed to check AI usage limits. Please try again shortly.",
      endpoint: endpointLabel,
    });
  }
}

async function trackAiUsage({
  userId,
  endpoint,
  model,
  usage,
  hasActiveSubscription = false,
  consumeTrialCredits = true,
}) {
  const safeUsage = normalizeUsage(usage);
  const costs = calculateUsageCost(safeUsage);
  const monthlyUsage = await recordAiUsageEvent({
    userId,
    endpoint,
    model,
    promptTokens: safeUsage.prompt_tokens,
    completionTokens: safeUsage.completion_tokens,
    totalTokens: safeUsage.total_tokens,
    inputCostUsd: costs.inputCostUsd,
    outputCostUsd: costs.outputCostUsd,
    totalCostUsd: costs.totalCostUsd,
  });
  let trial = null;
  if (consumeTrialCredits && enableAiTrial && !hasActiveSubscription) {
    trial = await consumeAiTrialTokens(userId, safeUsage.total_tokens);
  }
  return { monthlyUsage, trial };
}

app.post(
  "/prompts",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.COACH),
  async (req, res) => {
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
      parsed.data.instruction,
    );
    return res.json(result);
  } catch (error) {
    console.error("[pokerchaos-backend] OpenAI error", error);
    return res.status(502).json({
      error: "Failed to generate ChaosCoach line. Please try again later.",
    });
  }
  },
);

app.post(
  "/replay-vision/cards",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.COACH),
  async (req, res) => {
    const parsed = replayVisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid replay image",
        details: parsed.error.flatten(),
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    }

    try {
      const result = await recognizeReplayCards(parsed.data);
      return res.json(result);
    } catch (error) {
      console.error("[pokerchaos-backend] Replay vision error", error);
      return res.status(502).json({
        error: "Failed to recognize replay cards. Please try again.",
      });
    }
  },
);

app.post(
  "/hand-history/parse",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
  async (req, res) => {
    const parsed = handHistorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    try {
      const allHands = parseHandHistory(parsed.data.historyText, {
        heroName: parsed.data.heroName,
      });
      const heroFoldedPreflopCount = allHands.filter((hand) =>
        Boolean(hand?.heroPreflop?.didFold),
      ).length;
      const heroEnteredPreflopCount = allHands.filter(
        (hand) =>
          Boolean(hand?.heroPreflop?.acted) &&
          !Boolean(hand?.heroPreflop?.didFold),
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
  },
);

app.post(
  "/performance/tournaments",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    const parsed = tournamentPerformanceSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    try {
      const snapshot = await insertTournamentPerformanceSnapshot({
        userId: req.auth?.userId || "",
        tournamentId: parsed.data.tournamentId,
        tournamentName: parsed.data.tournamentName || null,
        tournamentPlayedAt: parsed.data.tournamentPlayedAt || null,
        score10: parsed.data.score10,
        scorePct: parsed.data.scorePct ?? null,
        sampleHands: parsed.data.sampleHands ?? null,
        totalHands: parsed.data.totalHands ?? null,
        sourceUploadSaved: parsed.data.sourceUploadSaved,
        metadata: parsed.data.metadata || {},
      });
      return res.json({ snapshot });
    } catch (error) {
      if (error?.code === "duplicate_performance_snapshot") {
        return res.status(409).json({
          error: "Tournament performance already saved.",
          code: "duplicate_performance_snapshot",
        });
      }
      console.error(
        "[pokerchaos-backend] Tournament performance save error",
        error,
      );
      return res.status(500).json({
        error: "Failed to save tournament performance snapshot.",
      });
    }
  },
);

app.get(
  "/performance/tournaments",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
  async (req, res) => {
    if (!isDatabaseConfigured()) {
      return res.status(500).json({
        error:
          "Database is not configured. Set DATABASE_URL (or PG* env vars) and restart the backend.",
      });
    }

    try {
      const snapshots = await listTournamentPerformanceSnapshots(
        req.auth?.userId || "",
      );
      return res.json({ snapshots });
    } catch (error) {
      console.error(
        "[pokerchaos-backend] Tournament performance list error",
        error,
      );
      return res.status(500).json({
        error: "Failed to list tournament performance snapshots.",
      });
    }
  },
);

app.delete(
  "/performance/tournaments/:tournamentId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      const deleted = await deleteTournamentPerformanceSnapshot(
        req.auth?.userId || "",
        parsedParams.data.tournamentId,
      );
      if (!deleted) {
        return res.status(404).json({
          error: "Tournament performance snapshot not found.",
        });
      }
      return res.json({
        ok: true,
        deletedTournamentId: parsedParams.data.tournamentId,
      });
    } catch (error) {
      console.error(
        "[pokerchaos-backend] Tournament performance delete error",
        error,
      );
      return res.status(500).json({
        error: "Failed to delete tournament performance snapshot.",
      });
    }
  },
);

app.post(
  "/tournaments/upload",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      const upload = await saveTournamentHistory({
        userId: req.auth?.userId || "",
        historyText: parsed.data.historyText,
        heroName: parsed.data.heroName,
        tournamentId: parsed.data.tournamentId,
        tournamentName: parsed.data.tournamentName,
        uploadSource: parsed.data.uploadSource,
      });
      const { compactHands, saved, summary, tournamentId } = upload;
      const suppliedReviewsByHandKey =
        parsed.data.reviewsByHandKey &&
        typeof parsed.data.reviewsByHandKey === "object"
          ? parsed.data.reviewsByHandKey
          : null;
      if (suppliedReviewsByHandKey) {
        const allowedHandKeys = new Set(
          compactHands
            .map((hand) => String(hand?.handKey || "").trim())
            .filter(Boolean)
        );
        const filteredReviewsByHandKey = {};
        for (const [rawKey, review] of Object.entries(suppliedReviewsByHandKey)) {
          const handKey = String(rawKey || "").trim();
          if (!handKey || !allowedHandKeys.has(handKey)) continue;
          if (!review || typeof review !== "object") continue;
          filteredReviewsByHandKey[handKey] = review;
        }
        if (Object.keys(filteredReviewsByHandKey).length > 0) {
          await upsertAiHandReviews({
            userId: req.auth?.userId || "",
            tournamentId,
            reviewsByHandKey: filteredReviewsByHandKey,
          });
        }
      }

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
      });
    } catch (error) {
      if (error instanceof TournamentUploadError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...error.details,
        });
      }
      console.error("[pokerchaos-backend] Tournament upload error", error);
      return res.status(500).json({
        error: "Failed to upload tournament history. Please try again.",
      });
    }
  },
);

app.get(
  "/tournaments",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
  },
);

app.get(
  "/tournaments/:tournamentId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
        parsedParams.data.tournamentId,
      );
      if (!record) {
        return res.status(404).json({ error: "Tournament upload not found." });
      }

      const reviewsByHandKey = await getAiHandReviewsForTournament(
        req.auth?.userId || "",
        parsedParams.data.tournamentId
      );

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
          reviewsByHandKey,
          historyText: record.historyText || "",
        },
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament get error", error);
      return res.status(500).json({
        error: "Failed to load tournament upload.",
      });
    }
  },
);

app.delete(
  "/tournaments/:tournamentId",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      await deleteAiHandReviewsForTournament(
        req.auth?.userId || "",
        parsedParams.data.tournamentId
      );
      const deleted = await deleteTournamentUpload(
        req.auth?.userId || "",
        parsedParams.data.tournamentId,
      );
      if (!deleted) {
        return res.status(404).json({ error: "Tournament upload not found." });
      }
      return res.json({
        ok: true,
        deletedTournamentId: parsedParams.data.tournamentId,
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament delete error", error);
      return res.status(500).json({
        error: "Failed to delete tournament upload.",
      });
    }
  },
);

app.post(
  "/tournaments/:tournamentId/delete",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      await deleteAiHandReviewsForTournament(
        req.auth?.userId || "",
        parsedParams.data.tournamentId
      );
      const deleted = await deleteTournamentUpload(
        req.auth?.userId || "",
        parsedParams.data.tournamentId,
      );
      if (!deleted) {
        return res.status(404).json({ error: "Tournament upload not found." });
      }
      return res.json({
        ok: true,
        deletedTournamentId: parsedParams.data.tournamentId,
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Tournament delete error", error);
      return res.status(500).json({
        error: "Failed to delete tournament upload.",
      });
    }
  },
);

app.post(
  "/hand-history/review",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
  requireReviewAi,
  async (req, res) => {
    const selectedHandsRaw = Array.isArray(req.body?.selectedHands)
      ? req.body.selectedHands
      : [];
    if (selectedHandsRaw.length > maxHandsPerAiReviewRequest) {
      return res.status(400).json({
        error: `You can review up to ${maxHandsPerAiReviewRequest} hands at once.`,
        code: "HAND_REVIEW_LIMIT_EXCEEDED",
        maxHandsPerRequest: maxHandsPerAiReviewRequest,
        selectedHands: selectedHandsRaw.length,
      });
    }

    const parsed = handReviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured" });
    }

    const estimatedTokens = Math.max(
      1,
      parsed.data.selectedHands.length * aiEstimatedHandReviewTokensPerHand,
    );
    const quotaResponse = await ensureAiQuota(
      req,
      res,
      estimatedTokens,
      "/hand-history/review",
    );
    if (quotaResponse) return quotaResponse;

    try {
      const opponentLookup = buildOpponentLookup(parsed.data.opponentSnapshot);
      const isDeveloperQaObserver = Boolean(req.entitlements?.developer);
      const reviews = [];
      const usageEntries = [];
      for (const hand of parsed.data.selectedHands) {
        const compactHand = sanitizeHandForStreetFairness(hand);
        const reviewHandWithOpponents = attachOpponentContextToHand(
          compactHand,
          opponentLookup,
        );
        const { handState, validation } = buildValidatedHandState(
          reviewHandWithOpponents,
        );
        const deterministicIntelligence = buildDeterministicIntelligence({
          hand: reviewHandWithOpponents,
          validatedHandState: handState,
          handStateValidation: validation,
        });
        const reviewHand = {
          ...reviewHandWithOpponents,
          validatedHandState: handState,
          handStateValidation: validation,
          deterministicIntelligence,
        };
        const review = await reviewTournamentHand(
          reviewHand,
          parsed.data.instruction,
          reviewAiModel,
        );
        const shouldAttachEvaluation =
          reviewQaEnabled ||
          Boolean(parsed.data.includeEvaluationReport) ||
          isDeveloperQaObserver;
        const reviewWithEvaluation = shouldAttachEvaluation
          ? attachReviewEvaluation({
              review,
              hand: reviewHandWithOpponents,
              thresholds: {
                minimum_coherence_score: Number.isFinite(reviewQaMinCoherenceScore)
                  ? reviewQaMinCoherenceScore
                  : parsed.data?.evaluationThresholds?.minimum_coherence_score,
                maximum_hallucination_risk: Number.isFinite(
                  reviewQaMaxHallucinationRisk,
                )
                  ? reviewQaMaxHallucinationRisk
                  : parsed.data?.evaluationThresholds?.maximum_hallucination_risk,
              },
              includeDetailedReport:
                reviewQaDevReportDefault ||
                Boolean(parsed.data.includeEvaluationReport) ||
                isDeveloperQaObserver,
            })
          : review;
        usageEntries.push(reviewWithEvaluation?.usage || null);
        reviews.push({
          handKey: String(compactHand?.handKey || "").trim() || null,
          hand: compactHand,
          validatedHandState: handState,
          handStateValidation: validation,
          review: reviewWithEvaluation,
        });
      }

      const aggregateUsage = sumUsageEntries(usageEntries);
      const usageState = await trackAiUsage({
        userId: req.auth?.userId || "",
        endpoint: "/hand-history/review",
        model: reviewAiModel,
        usage: aggregateUsage,
        hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
      });

      return res.json({
        summary: {
          selectedHands: parsed.data.selectedHands.length,
          reviewedHands: reviews.length,
          usage: aggregateUsage,
          monthlyUsage: {
            periodMonth: usageState.monthlyUsage.periodMonth,
            usedTokens: usageState.monthlyUsage.totalTokens,
            tokenLimit: aiMonthlyTokenCap,
            remainingTokens: Math.max(
              0,
              aiMonthlyTokenCap -
                toNonNegativeInt(usageState.monthlyUsage.totalTokens),
            ),
            usedCostUsd: usageState.monthlyUsage.totalCostUsd,
            trialRemainingTokens: toNonNegativeInt(
              usageState.trial?.remainingTokens,
            ),
          },
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
  },
);

app.post(
  "/hand-history/summary-review",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured" });
    }

    const quotaResponse = await ensureAiQuota(
      req,
      res,
      aiEstimatedSummaryTokens,
      "/hand-history/summary-review",
    );
    if (quotaResponse) return quotaResponse;

    try {
      const review = await reviewTournamentSummary(
        parsed.data.summary,
        parsed.data.instruction,
        reviewAiModel,
      );
      const usageState = await trackAiUsage({
        userId: req.auth?.userId || "",
        endpoint: "/hand-history/summary-review",
        model: reviewAiModel,
        usage: review?.usage || null,
        hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
      });
      return res.json({
        review,
        usage: normalizeUsage(review?.usage),
        monthlyUsage: {
          periodMonth: usageState.monthlyUsage.periodMonth,
          usedTokens: usageState.monthlyUsage.totalTokens,
          tokenLimit: aiMonthlyTokenCap,
          remainingTokens: Math.max(
            0,
            aiMonthlyTokenCap -
              toNonNegativeInt(usageState.monthlyUsage.totalTokens),
          ),
          usedCostUsd: usageState.monthlyUsage.totalCostUsd,
          trialRemainingTokens: toNonNegativeInt(
            usageState.trial?.remainingTokens,
          ),
        },
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Session Summary review error", error);
      return res.status(502).json({
        error:
          "Failed to review Session Summary with AI. Please try again in a moment.",
      });
    }
  },
);

app.post(
  "/hand-history/icm-review",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured" });
    }

    const quotaResponse = await ensureAiQuota(
      req,
      res,
      aiEstimatedIcmTokens,
      "/hand-history/icm-review",
    );
    if (quotaResponse) return quotaResponse;

    try {
      const review = await reviewIcmSpotSummary(
        parsed.data.icmSummary,
        parsed.data.instruction,
        reviewAiModel,
      );
      const usageState = await trackAiUsage({
        userId: req.auth?.userId || "",
        endpoint: "/hand-history/icm-review",
        model: reviewAiModel,
        usage: review?.usage || null,
        hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
      });
      return res.json({
        review,
        usage: normalizeUsage(review?.usage),
        monthlyUsage: {
          periodMonth: usageState.monthlyUsage.periodMonth,
          usedTokens: usageState.monthlyUsage.totalTokens,
          tokenLimit: aiMonthlyTokenCap,
          remainingTokens: Math.max(
            0,
            aiMonthlyTokenCap -
              toNonNegativeInt(usageState.monthlyUsage.totalTokens),
          ),
          usedCostUsd: usageState.monthlyUsage.totalCostUsd,
          trialRemainingTokens: toNonNegativeInt(
            usageState.trial?.remainingTokens,
          ),
        },
      });
    } catch (error) {
      console.error("[pokerchaos-backend] ICM review error", error);
      return res.status(502).json({
        error:
          "Failed to review ICM spots with AI. Please try again in a moment.",
      });
    }
  },
);

app.post(
  "/hand-history/blind-defense-review",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured" });
    }

    const quotaResponse = await ensureAiQuota(
      req,
      res,
      aiEstimatedBlindDefenseTokens,
      "/hand-history/blind-defense-review",
    );
    if (quotaResponse) return quotaResponse;

    try {
      const review = await reviewBlindDefenseSummary(
        parsed.data.blindDefenseSummary,
        parsed.data.instruction,
        reviewAiModel,
      );
      const usageState = await trackAiUsage({
        userId: req.auth?.userId || "",
        endpoint: "/hand-history/blind-defense-review",
        model: reviewAiModel,
        usage: review?.usage || null,
        hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
      });
      return res.json({
        review,
        usage: normalizeUsage(review?.usage),
        monthlyUsage: {
          periodMonth: usageState.monthlyUsage.periodMonth,
          usedTokens: usageState.monthlyUsage.totalTokens,
          tokenLimit: aiMonthlyTokenCap,
          remainingTokens: Math.max(
            0,
            aiMonthlyTokenCap -
              toNonNegativeInt(usageState.monthlyUsage.totalTokens),
          ),
          usedCostUsd: usageState.monthlyUsage.totalCostUsd,
          trialRemainingTokens: toNonNegativeInt(
            usageState.trial?.remainingTokens,
          ),
        },
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Blind defense review error", error);
      return res.status(502).json({
        error:
          "Failed to review blind defense spots with AI. Please try again in a moment.",
      });
    }
  },
);

app.post(
  "/hand-history/table-hint",
  requireAuth,
  requireCapability(CAPABILITY_KEYS.TOURNAMENT_REVIEW),
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
      return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured" });
    }

    const quotaResponse = await ensureAiQuota(
      req,
      res,
      aiEstimatedTableHintTokens,
      "/hand-history/table-hint",
    );
    if (quotaResponse) return quotaResponse;

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
        reviewAiModel,
      );
      const usageState = await trackAiUsage({
        userId: req.auth?.userId || "",
        endpoint: "/hand-history/table-hint",
        model: reviewAiModel,
        usage: review?.usage || null,
        hasActiveSubscription: Boolean(req.aiAccess?.hasActiveSubscription),
      });
      return res.json({
        review,
        usage: normalizeUsage(review?.usage),
        monthlyUsage: {
          periodMonth: usageState.monthlyUsage.periodMonth,
          usedTokens: usageState.monthlyUsage.totalTokens,
          tokenLimit: aiMonthlyTokenCap,
          remainingTokens: Math.max(
            0,
            aiMonthlyTokenCap -
              toNonNegativeInt(usageState.monthlyUsage.totalTokens),
          ),
          usedCostUsd: usageState.monthlyUsage.totalCostUsd,
          trialRemainingTokens: toNonNegativeInt(
            usageState.trial?.remainingTokens,
          ),
        },
      });
    } catch (error) {
      console.error("[pokerchaos-backend] Current table hint error", error);
      return res.status(502).json({
        error:
          "Failed to generate current table hint with AI. Please try again in a moment.",
      });
    }
  },
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
          `[pokerchaos-backend] Port ${port} in use. Retrying on ${next}...`,
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
      await seedLearningResources(LEARNING_RESOURCE_SEED);
      console.log("[pokerchaos-backend] Postgres initialized.");
    } catch (error) {
      console.error(
        "[pokerchaos-backend] Failed to initialize Postgres",
        error,
      );
      process.exit(1);
    }
  } else {
    console.warn(
      "[pokerchaos-backend] Postgres not configured. Tournament uploads and AI usage tracking are disabled.",
    );
  }

  startServer(BASE_PORT);
}

boot();
