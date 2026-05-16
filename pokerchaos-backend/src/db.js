import pg from "pg";

const { Pool } = pg;

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).trim().toLowerCase() === "true";
}

function createPool() {
  const hasConnectionString = Boolean(process.env.DATABASE_URL);
  const hasHostConfig =
    Boolean(process.env.PGHOST) ||
    Boolean(process.env.PGHOSTADDR) ||
    Boolean(process.env.PGDATABASE);
  if (!hasConnectionString && !hasHostConfig) return null;

  const shouldUseSsl = parseBoolean(process.env.PGSSL, false);
  const sslRejectUnauthorized = parseBoolean(
    process.env.PGSSL_REJECT_UNAUTHORIZED,
    false
  );

  const config = {};
  if (hasConnectionString) {
    config.connectionString = process.env.DATABASE_URL;
  }
  if (shouldUseSsl) {
    config.ssl = { rejectUnauthorized: sslRejectUnauthorized };
  }
  return new Pool(config);
}

let pool = null;
let poolInitialized = false;

function getPool() {
  if (poolInitialized) return pool;
  poolInitialized = true;
  pool = createPool();
  if (pool) {
    pool.on("error", (error) => {
      console.error("[pokerchaos-backend] Postgres pool error", error);
    });
  }
  return pool;
}

function getRequiredPool() {
  const resolvedPool = getPool();
  if (!resolvedPool) {
    throw new Error("Database is not configured.");
  }
  return resolvedPool;
}

export function isDatabaseConfigured() {
  return Boolean(getPool());
}

export async function initDatabase() {
  const resolvedPool = getPool();
  if (!resolvedPool) return;

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS tournament_uploads (
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      hero_name TEXT NOT NULL,
      tournament_name TEXT,
      tournament_played_at TIMESTAMPTZ,
      upload_source TEXT NOT NULL DEFAULT 'ggpoker',
      history_text TEXT NOT NULL,
      parsed_hands JSONB NOT NULL,
      opponent_snapshot JSONB NOT NULL,
      summary JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, tournament_id)
    );
  `);

  await resolvedPool.query(`
    ALTER TABLE tournament_uploads
    ADD COLUMN IF NOT EXISTS tournament_played_at TIMESTAMPTZ;
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS tournament_uploads_user_updated_idx
    ON tournament_uploads (user_id, updated_at DESC);
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS tournament_uploads_user_played_at_idx
    ON tournament_uploads (user_id, tournament_played_at DESC, updated_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS ai_hand_reviews (
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      hand_key TEXT NOT NULL,
      overall_score INTEGER,
      review_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, tournament_id, hand_key)
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS ai_hand_reviews_user_score_idx
    ON ai_hand_reviews (user_id, tournament_id, overall_score, updated_at DESC);
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS ai_hand_reviews_user_updated_idx
    ON ai_hand_reviews (user_id, updated_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_events (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      period_month DATE NOT NULL,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      input_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      output_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      total_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS ai_usage_events_user_period_idx
    ON ai_usage_events (user_id, period_month, created_at DESC);
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx
    ON ai_usage_events (created_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS ai_usage_monthly (
      user_id TEXT NOT NULL,
      period_month DATE NOT NULL,
      prompt_tokens BIGINT NOT NULL DEFAULT 0,
      completion_tokens BIGINT NOT NULL DEFAULT 0,
      total_tokens BIGINT NOT NULL DEFAULT 0,
      input_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      output_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      total_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, period_month)
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS ai_usage_monthly_period_idx
    ON ai_usage_monthly (period_month, total_tokens DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS billing_customers (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT NOT NULL UNIQUE,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS billing_customers_customer_idx
    ON billing_customers (stripe_customer_id);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      user_id TEXT PRIMARY KEY,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      price_id TEXT,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      canceled_at TIMESTAMPTZ,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx
    ON billing_subscriptions (stripe_customer_id);
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS billing_subscriptions_status_idx
    ON billing_subscriptions (status, current_period_end DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS ai_trial_credits (
      user_id TEXT PRIMARY KEY,
      granted_tokens BIGINT NOT NULL DEFAULT 0,
      used_tokens BIGINT NOT NULL DEFAULT 0,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function toRowPayload(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    tournamentId: row.tournament_id,
    heroName: row.hero_name,
    tournamentName: row.tournament_name,
    tournamentPlayedAt: row.tournament_played_at,
    uploadSource: row.upload_source,
    historyText: row.history_text,
    parsedHands: Array.isArray(row.parsed_hands) ? row.parsed_hands : [],
    opponentSnapshot:
      row.opponent_snapshot && typeof row.opponent_snapshot === "object"
        ? row.opponent_snapshot
        : null,
    summary: row.summary && typeof row.summary === "object" ? row.summary : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toEpochOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toJsonbParam(value, fallback) {
  const input = value === undefined ? fallback : value;
  try {
    return JSON.stringify(input);
  } catch {
    return JSON.stringify(fallback);
  }
}

function toIntOrZero(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function toCostOrZero(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric;
}

function toBigIntOrZero(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function monthStartUtc(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function toMonthDateString(date = new Date()) {
  const month = monthStartUtc(date);
  const year = month.getUTCFullYear();
  const mm = String(month.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${mm}-01`;
}

function parseNumericDbValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function epochToIsoOrNull(epochSeconds) {
  const numeric = Number(epochSeconds);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return new Date(numeric * 1000).toISOString();
}

function toMonthlyUsagePayload(row, periodMonth) {
  const fallbackMonth = toMonthDateString(periodMonth || new Date());
  if (!row) {
    return {
      periodMonth: fallbackMonth,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      updatedAt: null,
    };
  }
  return {
    periodMonth: row.period_month || fallbackMonth,
    promptTokens: parseNumericDbValue(row.prompt_tokens),
    completionTokens: parseNumericDbValue(row.completion_tokens),
    totalTokens: parseNumericDbValue(row.total_tokens),
    inputCostUsd: parseNumericDbValue(row.input_cost_usd),
    outputCostUsd: parseNumericDbValue(row.output_cost_usd),
    totalCostUsd: parseNumericDbValue(row.total_cost_usd),
    updatedAt: row.updated_at || null,
  };
}

export async function upsertTournamentUpload({
  userId,
  tournamentId,
  heroName,
  tournamentName,
  tournamentPlayedAtEpoch = null,
  uploadSource = "ggpoker",
  historyText,
  parsedHands,
  opponentSnapshot,
  summary,
}) {
  const resolvedPool = getRequiredPool();

  const query = `
    INSERT INTO tournament_uploads (
      user_id,
      tournament_id,
      hero_name,
      tournament_name,
      tournament_played_at,
      upload_source,
      history_text,
      parsed_hands,
      opponent_snapshot,
      summary
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      CASE
        WHEN $5::double precision IS NULL THEN NULL
        ELSE to_timestamp($5::double precision / 1000.0)
      END,
      $6,
      $7,
      $8::jsonb,
      $9::jsonb,
      $10::jsonb
    )
    ON CONFLICT (user_id, tournament_id)
    DO UPDATE SET
      hero_name = EXCLUDED.hero_name,
      tournament_name = EXCLUDED.tournament_name,
      tournament_played_at = EXCLUDED.tournament_played_at,
      upload_source = EXCLUDED.upload_source,
      history_text = EXCLUDED.history_text,
      parsed_hands = EXCLUDED.parsed_hands,
      opponent_snapshot = EXCLUDED.opponent_snapshot,
      summary = EXCLUDED.summary,
      updated_at = NOW()
    RETURNING *;
  `;

  const result = await resolvedPool.query(query, [
    userId,
    tournamentId,
    heroName,
    tournamentName || null,
    toEpochOrNull(tournamentPlayedAtEpoch),
    uploadSource,
    historyText,
    toJsonbParam(parsedHands, []),
    toJsonbParam(opponentSnapshot, {}),
    toJsonbParam(summary, {}),
  ]);
  return toRowPayload(result.rows[0]);
}

export async function listTournamentUploads(userId) {
  const resolvedPool = getRequiredPool();

  const result = await resolvedPool.query(
    `
      SELECT
        user_id,
        tournament_id,
        hero_name,
        tournament_name,
        tournament_played_at,
        upload_source,
        summary,
        created_at,
        updated_at
      FROM tournament_uploads
      WHERE user_id = $1
      ORDER BY tournament_played_at DESC NULLS LAST, updated_at DESC;
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    tournamentId: row.tournament_id,
    heroName: row.hero_name,
    tournamentName: row.tournament_name,
    tournamentPlayedAt: row.tournament_played_at,
    uploadSource: row.upload_source,
    summary: row.summary && typeof row.summary === "object" ? row.summary : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getTournamentUpload(userId, tournamentId) {
  const resolvedPool = getRequiredPool();

  const result = await resolvedPool.query(
    `
      SELECT *
      FROM tournament_uploads
      WHERE user_id = $1 AND tournament_id = $2
      LIMIT 1;
    `,
    [userId, tournamentId]
  );
  return toRowPayload(result.rows[0] || null);
}

export async function deleteTournamentUpload(userId, tournamentId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      DELETE FROM tournament_uploads
      WHERE user_id = $1 AND tournament_id = $2;
    `,
    [userId, tournamentId]
  );
  return Number(result.rowCount) > 0;
}

export async function upsertAiHandReviews({
  userId,
  tournamentId,
  reviewsByHandKey,
}) {
  const resolvedPool = getRequiredPool();
  const entries = Object.entries(
    reviewsByHandKey && typeof reviewsByHandKey === "object"
      ? reviewsByHandKey
      : {}
  )
    .map(([handKey, review]) => ({
      handKey: String(handKey || "").trim(),
      review: review && typeof review === "object" ? review : null,
    }))
    .filter((item) => item.handKey && item.review);

  if (!entries.length) return { upserted: 0 };

  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    for (const item of entries) {
      const overallScoreRaw = Number(item.review?.overall_score);
      const overallScore = Number.isFinite(overallScoreRaw)
        ? Math.trunc(overallScoreRaw)
        : null;
      await client.query(
        `
          INSERT INTO ai_hand_reviews (
            user_id,
            tournament_id,
            hand_key,
            overall_score,
            review_json
          ) VALUES ($1, $2, $3, $4, $5::jsonb)
          ON CONFLICT (user_id, tournament_id, hand_key)
          DO UPDATE SET
            overall_score = EXCLUDED.overall_score,
            review_json = EXCLUDED.review_json,
            updated_at = NOW();
        `,
        [
          userId,
          tournamentId,
          item.handKey,
          overallScore,
          toJsonbParam(item.review, {}),
        ]
      );
    }
    await client.query("COMMIT");
    return { upserted: entries.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAiHandReviewsForTournament(userId, tournamentId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT hand_key, review_json
      FROM ai_hand_reviews
      WHERE user_id = $1 AND tournament_id = $2
      ORDER BY updated_at DESC;
    `,
    [userId, tournamentId]
  );
  const reviewsByHandKey = {};
  for (const row of result.rows) {
    const key = String(row?.hand_key || "").trim();
    if (!key) continue;
    const review =
      row?.review_json && typeof row.review_json === "object"
        ? row.review_json
        : null;
    if (!review) continue;
    reviewsByHandKey[key] = review;
  }
  return reviewsByHandKey;
}

export async function deleteAiHandReviewsForTournament(userId, tournamentId) {
  const resolvedPool = getRequiredPool();
  await resolvedPool.query(
    `
      DELETE FROM ai_hand_reviews
      WHERE user_id = $1 AND tournament_id = $2;
    `,
    [userId, tournamentId]
  );
}

export async function getMonthlyAiUsage(userId, periodMonth = new Date()) {
  const resolvedPool = getRequiredPool();
  const monthKey = toMonthDateString(periodMonth);
  const result = await resolvedPool.query(
    `
      SELECT
        user_id,
        period_month,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        input_cost_usd,
        output_cost_usd,
        total_cost_usd,
        updated_at
      FROM ai_usage_monthly
      WHERE user_id = $1 AND period_month = $2::date
      LIMIT 1;
    `,
    [userId, monthKey]
  );
  return toMonthlyUsagePayload(result.rows[0] || null, monthKey);
}

export async function recordAiUsageEvent({
  userId,
  endpoint,
  model,
  promptTokens,
  completionTokens,
  totalTokens,
  inputCostUsd,
  outputCostUsd,
  totalCostUsd,
  createdAt = new Date(),
}) {
  const resolvedPool = getRequiredPool();
  const monthKey = toMonthDateString(createdAt);
  const safePromptTokens = toIntOrZero(promptTokens);
  const safeCompletionTokens = toIntOrZero(completionTokens);
  const safeTotalTokens = toIntOrZero(totalTokens);
  const safeInputCostUsd = toCostOrZero(inputCostUsd);
  const safeOutputCostUsd = toCostOrZero(outputCostUsd);
  const safeTotalCostUsd = toCostOrZero(totalCostUsd);

  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO ai_usage_events (
          user_id,
          period_month,
          endpoint,
          model,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          input_cost_usd,
          output_cost_usd,
          total_cost_usd
        )
        VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10);
      `,
      [
        userId,
        monthKey,
        String(endpoint || "unknown"),
        String(model || "unknown"),
        safePromptTokens,
        safeCompletionTokens,
        safeTotalTokens,
        safeInputCostUsd,
        safeOutputCostUsd,
        safeTotalCostUsd,
      ]
    );

    const monthlyResult = await client.query(
      `
        INSERT INTO ai_usage_monthly (
          user_id,
          period_month,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          input_cost_usd,
          output_cost_usd,
          total_cost_usd,
          updated_at
        )
        VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id, period_month)
        DO UPDATE SET
          prompt_tokens = ai_usage_monthly.prompt_tokens + EXCLUDED.prompt_tokens,
          completion_tokens = ai_usage_monthly.completion_tokens + EXCLUDED.completion_tokens,
          total_tokens = ai_usage_monthly.total_tokens + EXCLUDED.total_tokens,
          input_cost_usd = ai_usage_monthly.input_cost_usd + EXCLUDED.input_cost_usd,
          output_cost_usd = ai_usage_monthly.output_cost_usd + EXCLUDED.output_cost_usd,
          total_cost_usd = ai_usage_monthly.total_cost_usd + EXCLUDED.total_cost_usd,
          updated_at = NOW()
        RETURNING
          user_id,
          period_month,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          input_cost_usd,
          output_cost_usd,
          total_cost_usd,
          updated_at;
      `,
      [
        userId,
        monthKey,
        safePromptTokens,
        safeCompletionTokens,
        safeTotalTokens,
        safeInputCostUsd,
        safeOutputCostUsd,
        safeTotalCostUsd,
      ]
    );

    await client.query("COMMIT");
    return toMonthlyUsagePayload(monthlyResult.rows[0] || null, monthKey);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertBillingCustomer({
  userId,
  stripeCustomerId,
  email = null,
}) {
  const resolvedPool = getRequiredPool();
  const normalizedEmail =
    typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
  const result = await resolvedPool.query(
    `
      INSERT INTO billing_customers (
        user_id,
        stripe_customer_id,
        email
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        email = COALESCE(EXCLUDED.email, billing_customers.email),
        updated_at = NOW()
      RETURNING user_id, stripe_customer_id, email, created_at, updated_at;
    `,
    [userId, stripeCustomerId, normalizedEmail]
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    email: row.email || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getBillingCustomerByUserId(userId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT user_id, stripe_customer_id, email, created_at, updated_at
      FROM billing_customers
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    email: row.email || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getUserIdByStripeCustomerId(stripeCustomerId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT user_id
      FROM billing_customers
      WHERE stripe_customer_id = $1
      LIMIT 1;
    `,
    [stripeCustomerId]
  );
  return result.rows[0]?.user_id || null;
}

export async function upsertBillingSubscription({
  userId,
  stripeSubscriptionId,
  stripeCustomerId,
  status,
  priceId = null,
  currentPeriodStartEpoch = null,
  currentPeriodEndEpoch = null,
  cancelAtPeriodEnd = false,
  canceledAtEpoch = null,
  raw = {},
}) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      INSERT INTO billing_subscriptions (
        user_id,
        stripe_subscription_id,
        stripe_customer_id,
        status,
        price_id,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        canceled_at,
        raw
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        CASE WHEN $6::double precision IS NULL THEN NULL ELSE to_timestamp($6::double precision) END,
        CASE WHEN $7::double precision IS NULL THEN NULL ELSE to_timestamp($7::double precision) END,
        $8,
        CASE WHEN $9::double precision IS NULL THEN NULL ELSE to_timestamp($9::double precision) END,
        $10::jsonb
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        status = EXCLUDED.status,
        price_id = EXCLUDED.price_id,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        canceled_at = EXCLUDED.canceled_at,
        raw = EXCLUDED.raw,
        updated_at = NOW()
      RETURNING
        user_id,
        stripe_subscription_id,
        stripe_customer_id,
        status,
        price_id,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        canceled_at,
        created_at,
        updated_at;
    `,
    [
      userId,
      stripeSubscriptionId,
      stripeCustomerId,
      String(status || "unknown"),
      priceId || null,
      Number.isFinite(Number(currentPeriodStartEpoch))
        ? Number(currentPeriodStartEpoch)
        : null,
      Number.isFinite(Number(currentPeriodEndEpoch))
        ? Number(currentPeriodEndEpoch)
        : null,
      Boolean(cancelAtPeriodEnd),
      Number.isFinite(Number(canceledAtEpoch)) ? Number(canceledAtEpoch) : null,
      toJsonbParam(raw, {}),
    ]
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    userId: row.user_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    status: row.status,
    priceId: row.price_id || null,
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    canceledAt: row.canceled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getBillingSubscriptionByUserId(userId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT
        user_id,
        stripe_subscription_id,
        stripe_customer_id,
        status,
        price_id,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        canceled_at,
        created_at,
        updated_at
      FROM billing_subscriptions
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    userId: row.user_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    status: row.status,
    priceId: row.price_id || null,
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    canceledAt: row.canceled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function ensureAiTrialCredits(userId, grantedTokens) {
  const resolvedPool = getRequiredPool();
  const safeGranted = toBigIntOrZero(grantedTokens);
  const result = await resolvedPool.query(
    `
      INSERT INTO ai_trial_credits (
        user_id,
        granted_tokens,
        used_tokens
      )
      VALUES ($1, $2, 0)
      ON CONFLICT (user_id)
      DO NOTHING
      RETURNING user_id, granted_tokens, used_tokens, granted_at, updated_at;
    `,
    [userId, safeGranted]
  );
  if (result.rows[0]) {
    const row = result.rows[0];
    return {
      userId: row.user_id,
      grantedTokens: parseNumericDbValue(row.granted_tokens),
      usedTokens: parseNumericDbValue(row.used_tokens),
      remainingTokens: Math.max(
        0,
        parseNumericDbValue(row.granted_tokens) - parseNumericDbValue(row.used_tokens)
      ),
      grantedAt: row.granted_at || null,
      updatedAt: row.updated_at || null,
      created: true,
    };
  }
  const existing = await getAiTrialCredits(userId);
  return { ...existing, created: false };
}

export async function getAiTrialCredits(userId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT user_id, granted_tokens, used_tokens, granted_at, updated_at
      FROM ai_trial_credits
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );
  const row = result.rows[0] || null;
  if (!row) {
    return {
      userId,
      grantedTokens: 0,
      usedTokens: 0,
      remainingTokens: 0,
      grantedAt: null,
      updatedAt: null,
    };
  }
  const grantedTokens = parseNumericDbValue(row.granted_tokens);
  const usedTokens = parseNumericDbValue(row.used_tokens);
  return {
    userId: row.user_id,
    grantedTokens,
    usedTokens,
    remainingTokens: Math.max(0, grantedTokens - usedTokens),
    grantedAt: row.granted_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function consumeAiTrialTokens(userId, consumedTokens) {
  const resolvedPool = getRequiredPool();
  const safeConsumed = toBigIntOrZero(consumedTokens);
  if (safeConsumed <= 0) {
    return getAiTrialCredits(userId);
  }
  const result = await resolvedPool.query(
    `
      UPDATE ai_trial_credits
      SET
        used_tokens = LEAST(granted_tokens, used_tokens + $2),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING user_id, granted_tokens, used_tokens, granted_at, updated_at;
    `,
    [userId, safeConsumed]
  );
  const row = result.rows[0] || null;
  if (!row) return getAiTrialCredits(userId);
  const grantedTokens = parseNumericDbValue(row.granted_tokens);
  const usedTokens = parseNumericDbValue(row.used_tokens);
  return {
    userId: row.user_id,
    grantedTokens,
    usedTokens,
    remainingTokens: Math.max(0, grantedTokens - usedTokens),
    grantedAt: row.granted_at || null,
    updatedAt: row.updated_at || null,
  };
}

export async function getUserBillingAiAccess(userId) {
  const [subscription, trial] = await Promise.all([
    getBillingSubscriptionByUserId(userId),
    getAiTrialCredits(userId),
  ]);
  const activeSubscriptionStatuses = new Set(["active", "trialing"]);
  const status = String(subscription?.status || "").trim().toLowerCase();
  const hasActiveSubscription = activeSubscriptionStatuses.has(status);
  return {
    subscription: subscription || null,
    hasActiveSubscription,
    subscriptionStatus: status || null,
    trial,
    reviewAiGranted: hasActiveSubscription || (trial?.remainingTokens || 0) > 0,
  };
}
