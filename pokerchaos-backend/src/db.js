import pg from "pg";
import { getLearningResourceCanonicalPath } from "./studySpots/taxonomy.js";

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

export async function closeDatabase() {
  if (pool) await pool.end();
  pool = null;
  poolInitialized = false;
}

export async function initDatabase() {
  const resolvedPool = getPool();
  if (!resolvedPool) return;

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS learning_resources (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      stack_depth_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      position_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      opponent_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      content_type TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      published BOOLEAN NOT NULL DEFAULT FALSE,
      publish_date DATE,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS learning_resources_published_category_idx
    ON learning_resources (published, category, priority DESC);
  `);

  await resolvedPool.query(`
    ALTER TABLE learning_resources
      ADD COLUMN IF NOT EXISTS external_id TEXT,
      ADD COLUMN IF NOT EXISTS series TEXT,
      ADD COLUMN IF NOT EXISTS lesson_number INTEGER,
      ADD COLUMN IF NOT EXISTS short_title TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS primary_tag TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS secondary_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS hero_position_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS villain_position_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS opponent_type_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS study_spot_types JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS example_spot TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS mistake TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS better_play TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS when_to_use JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS when_not_to_use JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS takeaway TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS instagram_caption TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS instagram_url TEXT,
      ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
  `);

  await resolvedPool.query(`
    UPDATE learning_resources
    SET
      status = CASE WHEN published THEN 'published' ELSE 'draft' END,
      published_at = COALESCE(published_at, publish_date::TIMESTAMPTZ),
      primary_tag = CASE
        WHEN primary_tag = '' AND jsonb_array_length(tags) > 0 THEN tags->>0
        ELSE primary_tag
      END,
      hero_position_tags = CASE
        WHEN hero_position_tags = '[]'::jsonb THEN position_tags
        ELSE hero_position_tags
      END,
      opponent_type_tags = CASE
        WHEN opponent_type_tags = '[]'::jsonb THEN opponent_tags
        ELSE opponent_type_tags
      END,
      source_url = CASE WHEN source_url = '' THEN url ELSE source_url END;
  `);

  await resolvedPool.query(`
    ALTER TABLE learning_resources
      ALTER COLUMN instagram_url DROP NOT NULL,
      ALTER COLUMN instagram_url DROP DEFAULT;

    UPDATE learning_resources
    SET instagram_url = NULL
    WHERE BTRIM(instagram_url) = '';
  `);

  await resolvedPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS learning_resources_external_id_uidx
    ON learning_resources (external_id)
    WHERE external_id IS NOT NULL;
  `);

  await resolvedPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS learning_resources_series_lesson_uidx
    ON learning_resources (series, lesson_number)
    WHERE series IS NOT NULL AND lesson_number IS NOT NULL;
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS learning_resources_status_category_idx
    ON learning_resources (status, category, priority DESC);
  `);

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
    CREATE TABLE IF NOT EXISTS study_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      status TEXT NOT NULL,
      hands_analysed INTEGER NOT NULL DEFAULT 0,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      spot_count INTEGER NOT NULL DEFAULT 0,
      pipeline_version TEXT NOT NULL,
      model TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE (id, user_id),
      FOREIGN KEY (user_id, tournament_id)
        REFERENCES tournament_uploads (user_id, tournament_id)
        ON DELETE CASCADE
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS study_reports_user_created_idx
    ON study_reports (user_id, created_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS study_spots (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      primary_hand_key TEXT NOT NULL,
      example_hand_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      why_study_this TEXT NOT NULL,
      confidence NUMERIC(5, 4) NOT NULL,
      rank_score NUMERIC(5, 4) NOT NULL,
      rank INTEGER NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      stack_depth_bb NUMERIC(8, 2),
      stack_depth_tag TEXT,
      hero_position TEXT NOT NULL DEFAULT 'unknown',
      villain_position TEXT NOT NULL DEFAULT 'unknown',
      opponent_type TEXT NOT NULL DEFAULT 'unknown',
      hand_context JSONB NOT NULL DEFAULT '{}'::jsonb,
      resource_matches JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (report_id, rank),
      FOREIGN KEY (report_id, user_id)
        REFERENCES study_reports (id, user_id)
        ON DELETE CASCADE
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS study_spots_report_rank_idx
    ON study_spots (report_id, rank ASC);
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS study_spots_user_category_idx
    ON study_spots (user_id, category, created_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS study_queue_items (
      user_id TEXT NOT NULL,
      study_spot_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'to_review',
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      PRIMARY KEY (user_id, study_spot_id),
      FOREIGN KEY (study_spot_id)
        REFERENCES study_spots (id)
        ON DELETE CASCADE
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS study_queue_user_status_idx
    ON study_queue_items (user_id, status, saved_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS content_gap_occurrences (
      study_spot_id TEXT NOT NULL,
      report_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (study_spot_id, tag),
      FOREIGN KEY (study_spot_id)
        REFERENCES study_spots (id)
        ON DELETE CASCADE,
      FOREIGN KEY (report_id, user_id)
        REFERENCES study_reports (id, user_id)
        ON DELETE CASCADE
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS content_gap_tag_seen_idx
    ON content_gap_occurrences (tag, last_seen DESC);
  `);

  await resolvedPool.query(`
    ALTER TABLE content_gap_occurrences
      ADD COLUMN IF NOT EXISTS primary_tag TEXT,
      ADD COLUMN IF NOT EXISTS study_spot_type TEXT,
      ADD COLUMN IF NOT EXISTS brief_id TEXT,
      ADD COLUMN IF NOT EXISTS linked_resource_id TEXT
        REFERENCES learning_resources (id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS covered_at TIMESTAMPTZ;
  `);

  await resolvedPool.query(`
    UPDATE content_gap_occurrences
    SET
      primary_tag = COALESCE(primary_tag, tag),
      study_spot_type = COALESCE(study_spot_type, 'interesting_spot')
    WHERE primary_tag IS NULL OR study_spot_type IS NULL;
  `);

  await resolvedPool.query(`
    UPDATE content_gap_occurrences
    SET brief_id = 'brief_' || MD5(study_spot_id || CHR(31) || tag)
    WHERE brief_id IS NULL;

    ALTER TABLE content_gap_occurrences
      ALTER COLUMN brief_id SET NOT NULL;
  `);

  await resolvedPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS content_gap_occurrences_brief_uidx
    ON content_gap_occurrences (brief_id);
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS content_gap_primary_type_seen_idx
    ON content_gap_occurrences (primary_tag, study_spot_type, last_seen DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS content_gaps (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      primary_tag TEXT NOT NULL,
      study_spot_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'complete')),
      resolved_resource_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      UNIQUE (category, primary_tag, study_spot_type),
      FOREIGN KEY (resolved_resource_id)
        REFERENCES learning_resources (id)
        ON DELETE SET NULL
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS content_gaps_status_updated_idx
    ON content_gaps (status, updated_at DESC);
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS content_gap_resources (
      content_gap_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (content_gap_id, resource_id),
      FOREIGN KEY (content_gap_id)
        REFERENCES content_gaps (id)
        ON DELETE CASCADE,
      FOREIGN KEY (resource_id)
        REFERENCES learning_resources (id)
        ON DELETE CASCADE
    );
  `);

  await resolvedPool.query(`
    INSERT INTO content_gaps (
      id,
      category,
      primary_tag,
      study_spot_type,
      created_at,
      updated_at
    )
    SELECT
      'gap_' || MD5(
        s.category || CHR(31) ||
        COALESCE(o.primary_tag, o.tag) || CHR(31) ||
        COALESCE(o.study_spot_type, 'interesting_spot')
      ),
      s.category,
      COALESCE(o.primary_tag, o.tag),
      COALESCE(o.study_spot_type, 'interesting_spot'),
      MIN(o.first_seen),
      MAX(o.last_seen)
    FROM content_gap_occurrences o
    JOIN study_spots s ON s.id = o.study_spot_id
    GROUP BY
      s.category,
      COALESCE(o.primary_tag, o.tag),
      COALESCE(o.study_spot_type, 'interesting_spot')
    ON CONFLICT (category, primary_tag, study_spot_type)
    DO NOTHING;
  `);

  await resolvedPool.query(`
    UPDATE content_gaps cg
    SET
      status = CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM content_gap_occurrences o
          JOIN study_spots s ON s.id = o.study_spot_id
          WHERE
            s.category = cg.category
            AND COALESCE(o.primary_tag, o.tag) = cg.primary_tag
            AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
            AND o.covered_at IS NULL
        ) THEN 'complete'
        WHEN EXISTS (
          SELECT 1
          FROM content_gap_occurrences o
          JOIN study_spots s ON s.id = o.study_spot_id
          WHERE
            s.category = cg.category
            AND COALESCE(o.primary_tag, o.tag) = cg.primary_tag
            AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
            AND o.linked_resource_id IS NOT NULL
        ) THEN 'in_progress'
        ELSE 'open'
      END,
      resolved_resource_id = CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM content_gap_occurrences o
          JOIN study_spots s ON s.id = o.study_spot_id
          WHERE
            s.category = cg.category
            AND COALESCE(o.primary_tag, o.tag) = cg.primary_tag
            AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
            AND o.covered_at IS NULL
        ) THEN (
          SELECT o.linked_resource_id
          FROM content_gap_occurrences o
          JOIN study_spots s ON s.id = o.study_spot_id
          WHERE
            s.category = cg.category
            AND COALESCE(o.primary_tag, o.tag) = cg.primary_tag
            AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
            AND o.covered_at IS NOT NULL
          ORDER BY o.covered_at DESC
          LIMIT 1
        )
        ELSE NULL
      END,
      completed_at = CASE
        WHEN NOT EXISTS (
          SELECT 1
          FROM content_gap_occurrences o
          JOIN study_spots s ON s.id = o.study_spot_id
          WHERE
            s.category = cg.category
            AND COALESCE(o.primary_tag, o.tag) = cg.primary_tag
            AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
            AND o.covered_at IS NULL
        ) THEN COALESCE(cg.completed_at, NOW())
        ELSE NULL
      END
    WHERE EXISTS (
      SELECT 1
      FROM content_gap_occurrences o
      JOIN study_spots s ON s.id = o.study_spot_id
      WHERE
        s.category = cg.category
        AND COALESCE(o.primary_tag, o.tag) = cg.primary_tag
        AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
    );
  `);

  await resolvedPool.query(`
    CREATE TABLE IF NOT EXISTS tournament_performance_snapshots (
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      tournament_name TEXT,
      tournament_played_at TIMESTAMPTZ,
      score_10 NUMERIC(4, 1) NOT NULL,
      score_pct NUMERIC(5, 1),
      sample_hands INTEGER,
      total_hands INTEGER,
      source_upload_saved BOOLEAN NOT NULL DEFAULT FALSE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, tournament_id)
    );
  `);

  await resolvedPool.query(`
    CREATE INDEX IF NOT EXISTS tournament_performance_user_played_at_idx
    ON tournament_performance_snapshots (
      user_id,
      tournament_played_at ASC NULLS LAST,
      created_at ASC
    );
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

function toLearningResourcePayload(row) {
  if (!row) return null;
  const canonicalPath = getLearningResourceCanonicalPath({
    slug: row.slug,
    resourceType: row.content_type,
    sourceUrl: row.source_url,
  });
  return {
    id: row.id,
    externalId: row.external_id || null,
    series: row.series || null,
    lessonNumber: row.lesson_number === null ? null : Number(row.lesson_number),
    slug: row.slug,
    canonicalPath,
    title: row.title,
    shortTitle: row.short_title || "",
    description: row.description,
    category: row.category,
    primaryTag: row.primary_tag || row.tags?.[0] || "",
    secondaryTags: Array.isArray(row.secondary_tags)
      ? row.secondary_tags
      : Array.isArray(row.tags) ? row.tags.slice(1) : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    stackDepthTags: Array.isArray(row.stack_depth_tags)
      ? row.stack_depth_tags
      : [],
    heroPositionTags: Array.isArray(row.hero_position_tags)
      ? row.hero_position_tags
      : [],
    villainPositionTags: Array.isArray(row.villain_position_tags)
      ? row.villain_position_tags
      : [],
    opponentTypeTags: Array.isArray(row.opponent_type_tags)
      ? row.opponent_type_tags
      : [],
    studySpotTypes: Array.isArray(row.study_spot_types)
      ? row.study_spot_types
      : [],
    positionTags: Array.isArray(row.hero_position_tags)
      ? row.hero_position_tags
      : Array.isArray(row.position_tags) ? row.position_tags : [],
    opponentTags: Array.isArray(row.opponent_type_tags)
      ? row.opponent_type_tags
      : Array.isArray(row.opponent_tags) ? row.opponent_tags : [],
    resourceType: row.content_type,
    contentType: row.content_type,
    body: row.body || "",
    exampleSpot: row.example_spot || "",
    mistake: row.mistake || "",
    betterPlay: row.better_play || "",
    whenToUse: Array.isArray(row.when_to_use) ? row.when_to_use : [],
    whenNotToUse: Array.isArray(row.when_not_to_use) ? row.when_not_to_use : [],
    takeaway: row.takeaway || "",
    status: row.status || (row.published ? "published" : "draft"),
    published: (row.status || (row.published ? "published" : "draft")) === "published",
    publishedAt: row.published_at || row.publish_date || null,
    publishDate: row.published_at || row.publish_date || null,
    instagramCaption: row.instagram_caption || "",
    instagramUrl: typeof row.instagram_url === "string" && row.instagram_url.trim()
      ? row.instagram_url.trim()
      : null,
    sourceUrl: row.source_url || "",
    url: canonicalPath,
    priority: Number(row.priority) || 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function learningResourceWriteValues(resource) {
  const published = resource.status === "published";
  const publishedAt = published
    ? resource.publishedAt || new Date().toISOString()
    : null;
  const canonicalPath = getLearningResourceCanonicalPath(resource);
  return [
    resource.id,
    resource.externalId || null,
    resource.series || null,
    resource.lessonNumber || null,
    resource.slug,
    resource.title,
    resource.shortTitle || "",
    resource.description,
    resource.category,
    resource.primaryTag,
    toJsonbParam(resource.secondaryTags, []),
    toJsonbParam(resource.tags, []),
    toJsonbParam(resource.stackDepthTags, []),
    toJsonbParam(resource.heroPositionTags, []),
    toJsonbParam(resource.villainPositionTags, []),
    toJsonbParam(resource.opponentTypeTags, []),
    toJsonbParam(resource.studySpotTypes, []),
    resource.resourceType,
    resource.body || "",
    resource.exampleSpot || "",
    resource.mistake || "",
    resource.betterPlay || "",
    toJsonbParam(resource.whenToUse, []),
    toJsonbParam(resource.whenNotToUse, []),
    resource.takeaway || "",
    resource.status,
    published,
    publishedAt,
    resource.instagramCaption || "",
    typeof resource.instagramUrl === "string" && resource.instagramUrl.trim()
      ? resource.instagramUrl.trim()
      : null,
    resource.sourceUrl || "",
    canonicalPath,
    Number(resource.priority) || 0,
  ];
}

async function writeLearningResource(client, resource, conflictTarget) {
  const conflictColumn = conflictTarget === "slug" ? "slug" : "id";
  const result = await client.query(
    `
      INSERT INTO learning_resources (
        id, external_id, series, lesson_number, slug, title, short_title,
        description, category, primary_tag, secondary_tags, tags,
        stack_depth_tags, hero_position_tags, villain_position_tags,
        opponent_type_tags, study_spot_types, position_tags, opponent_tags,
        content_type, body, example_spot, mistake, better_play, when_to_use,
        when_not_to_use, takeaway, status, published, published_at,
        publish_date, instagram_caption, instagram_url, source_url, url, priority
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb,
        $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb,
        $14::jsonb, $16::jsonb, $18, $19, $20, $21, $22, $23::jsonb,
        $24::jsonb, $25, $26, $27, $28, $28::timestamptz::date, $29, $30,
        $31, $32, $33
      )
      ON CONFLICT (${conflictColumn})
      DO UPDATE SET
        external_id = EXCLUDED.external_id,
        series = EXCLUDED.series,
        lesson_number = EXCLUDED.lesson_number,
        slug = EXCLUDED.slug,
        title = EXCLUDED.title,
        short_title = EXCLUDED.short_title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        primary_tag = EXCLUDED.primary_tag,
        secondary_tags = EXCLUDED.secondary_tags,
        tags = EXCLUDED.tags,
        stack_depth_tags = EXCLUDED.stack_depth_tags,
        hero_position_tags = EXCLUDED.hero_position_tags,
        villain_position_tags = EXCLUDED.villain_position_tags,
        opponent_type_tags = EXCLUDED.opponent_type_tags,
        study_spot_types = EXCLUDED.study_spot_types,
        position_tags = EXCLUDED.position_tags,
        opponent_tags = EXCLUDED.opponent_tags,
        content_type = EXCLUDED.content_type,
        body = EXCLUDED.body,
        example_spot = EXCLUDED.example_spot,
        mistake = EXCLUDED.mistake,
        better_play = EXCLUDED.better_play,
        when_to_use = EXCLUDED.when_to_use,
        when_not_to_use = EXCLUDED.when_not_to_use,
        takeaway = EXCLUDED.takeaway,
        status = EXCLUDED.status,
        published = EXCLUDED.published,
        published_at = EXCLUDED.published_at,
        publish_date = EXCLUDED.publish_date,
        instagram_caption = EXCLUDED.instagram_caption,
        instagram_url = EXCLUDED.instagram_url,
        source_url = EXCLUDED.source_url,
        url = EXCLUDED.url,
        priority = EXCLUDED.priority,
        updated_at = NOW()
      RETURNING *;
    `,
    learningResourceWriteValues(resource),
  );
  return toLearningResourcePayload(result.rows[0]);
}

export async function seedLearningResources(resources) {
  const resolvedPool = getRequiredPool();
  const items = Array.isArray(resources) ? resources : [];
  if (items.length === 0) return [];
  const client = await resolvedPool.connect();
  const seeded = [];
  try {
    await client.query("BEGIN");
    for (const resource of items) {
      seeded.push(await writeLearningResource(client, resource, "slug"));
    }
    await client.query("COMMIT");
    return seeded;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listLearningResources({
  publishedOnly = true,
  tag = null,
  category = null,
  resourceType = null,
  search = null,
} = {}) {
  const resolvedPool = getRequiredPool();
  const filters = [];
  const values = [];
  if (publishedOnly) filters.push("status = 'published'");
  if (tag) {
    values.push(JSON.stringify([String(tag)]));
    filters.push(`tags @> $${values.length}::jsonb`);
  }
  if (category) {
    values.push(String(category));
    filters.push(`category = $${values.length}`);
  }
  if (resourceType) {
    values.push(String(resourceType));
    filters.push(`content_type = $${values.length}`);
  }
  if (search) {
    values.push(`%${String(search).trim()}%`);
    filters.push(`(title ILIKE $${values.length} OR description ILIKE $${values.length})`);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await resolvedPool.query(
    `
      SELECT *
      FROM learning_resources
      ${where}
      ORDER BY priority DESC, published_at DESC NULLS LAST, title ASC;
    `,
    values,
  );
  return result.rows.map(toLearningResourcePayload);
}

export async function getLearningResourceById(id, { publishedOnly = false } = {}) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `SELECT * FROM learning_resources
     WHERE id = $1 ${publishedOnly ? "AND status = 'published'" : ""}
     LIMIT 1;`,
    [id],
  );
  return toLearningResourcePayload(result.rows[0]);
}

export async function getLearningResourceBySlug(slug, { publishedOnly = true } = {}) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `SELECT * FROM learning_resources
     WHERE slug = $1 ${publishedOnly ? "AND status = 'published'" : ""}
     LIMIT 1;`,
    [slug],
  );
  return toLearningResourcePayload(result.rows[0]);
}

export async function findLearningResourceDuplicates(resource, excludeId = null) {
  const resolvedPool = getRequiredPool();
  const values = [resource.slug, resource.externalId || null, resource.series || null, resource.lessonNumber || null];
  let exclusion = "";
  if (excludeId) {
    values.push(excludeId);
    exclusion = `AND id <> $${values.length}`;
  }
  const result = await resolvedPool.query(
    `
      SELECT id, slug, external_id, series, lesson_number
      FROM learning_resources
      WHERE (
        slug = $1
        OR ($2::text IS NOT NULL AND external_id = $2)
        OR ($3::text IS NOT NULL AND $4::integer IS NOT NULL AND series = $3 AND lesson_number = $4)
      )
      ${exclusion};
    `,
    values,
  );
  const duplicates = [];
  for (const row of result.rows) {
    if (row.slug === resource.slug) duplicates.push({ field: "slug", value: resource.slug, resourceId: row.id });
    if (resource.externalId && row.external_id === resource.externalId) duplicates.push({ field: "externalId", value: resource.externalId, resourceId: row.id });
    if (resource.series && resource.lessonNumber && row.series === resource.series && Number(row.lesson_number) === resource.lessonNumber) {
      duplicates.push({ field: "lessonNumber", value: `${resource.series} #${resource.lessonNumber}`, resourceId: row.id });
    }
  }
  return duplicates;
}

export async function createLearningResource(resource) {
  return writeLearningResource(getRequiredPool(), resource, "id");
}

export async function createLearningResourceForGap(resource, contentGapId, contentGapBriefId = null) {
  const resolvedPool = getRequiredPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    const gap = await client.query(
      "SELECT id FROM content_gaps WHERE id = $1 FOR UPDATE;",
      [contentGapId],
    );
    if (!gap.rows[0]) {
      const error = new Error("Content gap not found.");
      error.code = "CONTENT_GAP_NOT_FOUND";
      throw error;
    }
    if (contentGapBriefId) {
      const brief = await client.query(
        `
          SELECT o.brief_id
          FROM content_gap_occurrences o
          JOIN study_spots s ON s.id = o.study_spot_id
          JOIN content_gaps cg
            ON cg.id = $1
            AND cg.category = s.category
            AND cg.primary_tag = COALESCE(o.primary_tag, o.tag)
            AND cg.study_spot_type = COALESCE(o.study_spot_type, 'interesting_spot')
          WHERE o.brief_id = $2
          FOR UPDATE OF o;
        `,
        [contentGapId, contentGapBriefId],
      );
      if (!brief.rows[0]) {
        const error = new Error("Content gap Study Spot brief not found.");
        error.code = "CONTENT_GAP_BRIEF_NOT_FOUND";
        throw error;
      }
    }
    const created = await writeLearningResource(client, resource, "id");
    await client.query(
      `
        INSERT INTO content_gap_resources (content_gap_id, resource_id)
        VALUES ($1, $2)
        ON CONFLICT (content_gap_id, resource_id) DO NOTHING;
      `,
      [contentGapId, created.id],
    );
    await client.query(
      `
        UPDATE content_gaps
        SET
          status = CASE WHEN status = 'complete' THEN status ELSE 'in_progress' END,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [contentGapId],
    );
    if (contentGapBriefId) {
      await client.query(
        `
          UPDATE content_gap_occurrences
          SET linked_resource_id = $2, covered_at = NULL
          WHERE brief_id = $1;
        `,
        [contentGapBriefId, created.id],
      );
    }
    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLearningResource(resource) {
  const existing = await getLearningResourceById(resource.id);
  if (!existing) return null;
  return writeLearningResource(getRequiredPool(), resource, "id");
}

export async function setLearningResourceStatus(id, status) {
  const resolvedPool = getRequiredPool();
  const published = status === "published";
  const result = await resolvedPool.query(
    `
      UPDATE learning_resources
      SET
        status = $2,
        published = $3,
        published_at = CASE WHEN $3 THEN COALESCE(published_at, NOW()) ELSE NULL END,
        publish_date = CASE WHEN $3 THEN COALESCE(publish_date, CURRENT_DATE) ELSE NULL END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
    [id, status, published],
  );
  return toLearningResourcePayload(result.rows[0]);
}

export async function deleteLearningResource(id) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    "DELETE FROM learning_resources WHERE id = $1 RETURNING id;",
    [id],
  );
  return Boolean(result.rows[0]);
}

function toPerformanceSnapshotPayload(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name,
    tournamentPlayedAt: row.tournament_played_at,
    score10: parseNumericDbValue(row.score_10),
    scorePct:
      row.score_pct === null || row.score_pct === undefined
        ? null
        : parseNumericDbValue(row.score_pct),
    sampleHands:
      row.sample_hands === null || row.sample_hands === undefined
        ? null
        : Number(row.sample_hands),
    totalHands:
      row.total_hands === null || row.total_hands === undefined
        ? null
        : Number(row.total_hands),
    sourceUploadSaved: Boolean(row.source_upload_saved),
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTournamentPerformanceSnapshots(userId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT *
      FROM tournament_performance_snapshots
      WHERE user_id = $1
      ORDER BY tournament_played_at ASC NULLS LAST, created_at ASC;
    `,
    [userId],
  );
  return result.rows.map(toPerformanceSnapshotPayload).filter(Boolean);
}

export async function insertTournamentPerformanceSnapshot({
  userId,
  tournamentId,
  tournamentName = null,
  tournamentPlayedAt = null,
  score10,
  scorePct = null,
  sampleHands = null,
  totalHands = null,
  sourceUploadSaved = false,
  metadata = {},
}) {
  const resolvedPool = getRequiredPool();
  try {
    const result = await resolvedPool.query(
      `
        INSERT INTO tournament_performance_snapshots (
          user_id,
          tournament_id,
          tournament_name,
          tournament_played_at,
          score_10,
          score_pct,
          sample_hands,
          total_hands,
          source_upload_saved,
          metadata
        ) VALUES (
          $1,
          $2,
          $3,
          $4::timestamptz,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb
        )
        RETURNING *;
      `,
      [
        userId,
        tournamentId,
        tournamentName || null,
        tournamentPlayedAt || null,
        score10,
        scorePct,
        sampleHands,
        totalHands,
        Boolean(sourceUploadSaved),
        toJsonbParam(metadata, {}),
      ],
    );
    return toPerformanceSnapshotPayload(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      const duplicateError = new Error("Tournament performance already saved.");
      duplicateError.code = "duplicate_performance_snapshot";
      throw duplicateError;
    }
    throw error;
  }
}

export async function deleteTournamentPerformanceSnapshot(userId, tournamentId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      DELETE FROM tournament_performance_snapshots
      WHERE user_id = $1 AND tournament_id = $2;
    `,
    [userId, tournamentId],
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

function toStudySpotPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    reportId: row.report_id,
    primaryHandKey: row.primary_hand_key,
    exampleHandKeys: Array.isArray(row.example_hand_keys)
      ? row.example_hand_keys
      : [],
    type: row.type,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    title: row.title,
    summary: row.summary,
    whyStudyThis: row.why_study_this,
    confidence: Number(row.confidence) || 0,
    rankScore: Number(row.rank_score) || 0,
    rank: Number(row.rank) || 0,
    occurrenceCount: Number(row.occurrence_count) || 1,
    stackDepthBb:
      row.stack_depth_bb === null ? null : Number(row.stack_depth_bb),
    stackDepthTag: row.stack_depth_tag || null,
    heroPosition: row.hero_position || "unknown",
    villainPosition: row.villain_position || "unknown",
    opponentType: row.opponent_type || "unknown",
    handContext:
      row.hand_context && typeof row.hand_context === "object"
        ? row.hand_context
        : {},
    resourceMatches: Array.isArray(row.resource_matches)
      ? row.resource_matches
      : [],
    createdAt: row.created_at || null,
  };
}

function toStudyReportPayload(row, spots = []) {
  if (!row) return null;
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name || null,
    status: row.status,
    handsAnalysed: Number(row.hands_analysed) || 0,
    candidateCount: Number(row.candidate_count) || 0,
    spotCount: Number(row.spot_count) || 0,
    pipelineVersion: row.pipeline_version,
    model: row.model || null,
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at || null,
    completedAt: row.completed_at || null,
    spots,
  };
}

export async function createStudyReport({
  id,
  userId,
  tournamentId,
  handsAnalysed,
  candidateCount,
  pipelineVersion,
  model = null,
}) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      INSERT INTO study_reports (
        id,
        user_id,
        tournament_id,
        status,
        hands_analysed,
        candidate_count,
        pipeline_version,
        model
      )
      VALUES ($1, $2, $3, 'analysing', $4, $5, $6, $7)
      RETURNING *;
    `,
    [
      id,
      userId,
      tournamentId,
      Number(handsAnalysed) || 0,
      Number(candidateCount) || 0,
      pipelineVersion,
      model,
    ],
  );
  return toStudyReportPayload(result.rows[0]);
}

export async function completeStudyReport({ id, userId, spots }) {
  const resolvedPool = getRequiredPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    const reportResult = await client.query(
      `
        SELECT *
        FROM study_reports
        WHERE id = $1 AND user_id = $2 AND status = 'analysing'
        FOR UPDATE;
      `,
      [id, userId],
    );
    if (!reportResult.rows[0]) {
      const error = new Error("Analysing Study Report not found.");
      error.code = "REPORT_NOT_FOUND";
      throw error;
    }

    for (const spot of Array.isArray(spots) ? spots : []) {
      await client.query(
        `
          INSERT INTO study_spots (
            id,
            report_id,
            user_id,
            primary_hand_key,
            example_hand_keys,
            type,
            category,
            tags,
            title,
            summary,
            why_study_this,
            confidence,
            rank_score,
            rank,
            occurrence_count,
            stack_depth_bb,
            stack_depth_tag,
            hero_position,
            villain_position,
            opponent_type,
            hand_context,
            resource_matches
          )
          VALUES (
            $1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb,
            $22::jsonb
          );
        `,
        [
          spot.id,
          id,
          userId,
          spot.primaryHandKey,
          toJsonbParam(spot.exampleHandKeys, []),
          spot.type,
          spot.category,
          toJsonbParam(spot.tags, []),
          spot.title,
          spot.summary,
          spot.whyStudyThis,
          Number(spot.confidence) || 0,
          Number(spot.rankScore) || 0,
          Number(spot.rank) || 0,
          Number(spot.occurrenceCount) || 1,
          spot.stackDepthBb ?? null,
          spot.stackDepthTag || null,
          spot.heroPosition || "unknown",
          spot.villainPosition || "unknown",
          spot.opponentType || "unknown",
          toJsonbParam(spot.handContext, {}),
          toJsonbParam(spot.resourceMatches, []),
        ],
      );

      if (!Array.isArray(spot.resourceMatches) || spot.resourceMatches.length === 0) {
        const tags = Array.isArray(spot.tags) ? spot.tags : [];
        const gapTag = String(spot.contentGapTag || tags.at(-1) || spot.category).trim();
        if (gapTag) {
          const occurrence = await client.query(
            `
              INSERT INTO content_gap_occurrences (
                study_spot_id,
                report_id,
                user_id,
                tag,
                primary_tag,
                study_spot_type,
                brief_id
              )
              VALUES ($1, $2, $3, $4, $4, $5, 'brief_' || MD5($1 || CHR(31) || $4))
              ON CONFLICT (study_spot_id, tag)
              DO NOTHING
              RETURNING study_spot_id;
            `,
            [spot.id, id, userId, gapTag, spot.type || "interesting_spot"],
          );
          if (occurrence.rows[0]) {
            await client.query(
              `
                INSERT INTO content_gaps (
                  id,
                  category,
                  primary_tag,
                  study_spot_type
                )
                VALUES (
                  'gap_' || MD5($1 || CHR(31) || $2 || CHR(31) || $3),
                  $1,
                  $2,
                  $3
                )
                ON CONFLICT (category, primary_tag, study_spot_type)
                DO UPDATE SET
                  status = CASE
                    WHEN content_gaps.status = 'complete' THEN 'open'
                    ELSE content_gaps.status
                  END,
                  resolved_resource_id = CASE
                    WHEN content_gaps.status = 'complete' THEN NULL
                    ELSE content_gaps.resolved_resource_id
                  END,
                  completed_at = CASE
                    WHEN content_gaps.status = 'complete' THEN NULL
                    ELSE content_gaps.completed_at
                  END,
                  updated_at = NOW();
              `,
              [spot.category, gapTag, spot.type || "interesting_spot"],
            );
          }
        }
      }
    }

    const completed = await client.query(
      `
        UPDATE study_reports
        SET
          status = 'complete',
          spot_count = $3,
          error_code = NULL,
          error_message = NULL,
          completed_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *;
      `,
      [id, userId, Array.isArray(spots) ? spots.length : 0],
    );
    await client.query("COMMIT");
    return toStudyReportPayload(completed.rows[0], spots);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failStudyReport({
  id,
  userId,
  errorCode = "ANALYSIS_FAILED",
  errorMessage = "Study Spot analysis failed.",
}) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      UPDATE study_reports
      SET
        status = 'failed',
        error_code = $3,
        error_message = $4,
        completed_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status = 'analysing'
      RETURNING *;
    `,
    [id, userId, errorCode, errorMessage],
  );
  return toStudyReportPayload(result.rows[0]);
}

export async function getStudyReport(userId, reportId) {
  const resolvedPool = getRequiredPool();
  const reportResult = await resolvedPool.query(
    `
      SELECT r.*, t.tournament_name
      FROM study_reports r
      JOIN tournament_uploads t
        ON t.user_id = r.user_id AND t.tournament_id = r.tournament_id
      WHERE r.id = $1 AND r.user_id = $2
      LIMIT 1;
    `,
    [reportId, userId],
  );
  if (!reportResult.rows[0]) return null;
  const spotsResult = await resolvedPool.query(
    `
      SELECT *
      FROM study_spots
      WHERE report_id = $1 AND user_id = $2
      ORDER BY rank ASC;
    `,
    [reportId, userId],
  );
  return toStudyReportPayload(
    reportResult.rows[0],
    spotsResult.rows.map(toStudySpotPayload),
  );
}

export async function listStudyReports(userId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      SELECT r.*, t.tournament_name
      FROM study_reports r
      JOIN tournament_uploads t
        ON t.user_id = r.user_id AND t.tournament_id = r.tournament_id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC;
    `,
    [userId],
  );
  return result.rows.map((row) => toStudyReportPayload(row));
}

export async function deleteStudyReport(userId, reportId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      DELETE FROM study_reports
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `,
    [reportId, userId],
  );
  return Boolean(result.rows[0]);
}

export async function saveStudyQueueItem(userId, studySpotId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      INSERT INTO study_queue_items (user_id, study_spot_id, status)
      SELECT $1, s.id, 'to_review'
      FROM study_spots s
      WHERE s.id = $2 AND s.user_id = $1
      ON CONFLICT (user_id, study_spot_id)
      DO UPDATE SET status = 'to_review', completed_at = NULL
      RETURNING user_id, study_spot_id, status, saved_at, completed_at;
    `,
    [userId, studySpotId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    studySpotId: row.study_spot_id,
    status: row.status,
    savedAt: row.saved_at,
    completedAt: row.completed_at,
  };
}

export async function updateStudyQueueItemStatus(userId, studySpotId, status) {
  const resolvedPool = getRequiredPool();
  const completedAt = status === "completed" ? new Date() : null;
  const result = await resolvedPool.query(
    `
      UPDATE study_queue_items
      SET status = $3, completed_at = $4
      WHERE user_id = $1 AND study_spot_id = $2
      RETURNING user_id, study_spot_id, status, saved_at, completed_at;
    `,
    [userId, studySpotId, status, completedAt],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    studySpotId: row.study_spot_id,
    status: row.status,
    savedAt: row.saved_at,
    completedAt: row.completed_at,
  };
}

export async function deleteStudyQueueItem(userId, studySpotId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      DELETE FROM study_queue_items
      WHERE user_id = $1 AND study_spot_id = $2
      RETURNING study_spot_id;
    `,
    [userId, studySpotId],
  );
  return Boolean(result.rows[0]);
}

export async function listStudyQueueItems(userId, status = null) {
  const resolvedPool = getRequiredPool();
  const values = [userId];
  const statusFilter = status ? "AND q.status = $2" : "";
  if (status) values.push(status);
  const result = await resolvedPool.query(
    `
      SELECT
        q.status AS queue_status,
        q.saved_at,
        q.completed_at,
        s.*,
        r.tournament_id,
        t.tournament_name
      FROM study_queue_items q
      JOIN study_spots s ON s.id = q.study_spot_id AND s.user_id = q.user_id
      JOIN study_reports r ON r.id = s.report_id AND r.user_id = q.user_id
      JOIN tournament_uploads t
        ON t.user_id = r.user_id AND t.tournament_id = r.tournament_id
      WHERE q.user_id = $1 ${statusFilter}
      ORDER BY q.saved_at DESC;
    `,
    values,
  );
  return result.rows.map((row) => ({
    ...toStudySpotPayload(row),
    queueStatus: row.queue_status,
    savedAt: row.saved_at,
    completedAt: row.completed_at,
    tournamentId: row.tournament_id,
    tournamentName: row.tournament_name || null,
  }));
}

function uniqueStrings(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  ));
}

function sanitizedGapHandContext(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const board = Array.isArray(source.board)
    ? uniqueStrings(source.board).slice(0, 5)
    : source.board && typeof source.board === "object"
      ? uniqueStrings([
          ...(Array.isArray(source.board.flop) ? source.board.flop : []),
          source.board.turn,
          source.board.river,
        ]).slice(0, 5)
      : [];
  const evidence = source.evidence && typeof source.evidence === "object" && !Array.isArray(source.evidence)
    ? Object.fromEntries(
        Object.entries(source.evidence)
          .filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))
          .slice(0, 8),
      )
    : {};
  return {
    heroCards: uniqueStrings(source.heroCards).slice(0, 2),
    board,
    street: String(source.street || "").trim() || null,
    actionTaken: String(source.actionTaken || "").trim() || null,
    evidence,
  };
}

function toContentGapSummary(row) {
  return {
    id: row.id,
    category: row.category,
    primaryTag: row.primary_tag,
    tag: row.primary_tag,
    studySpotType: row.study_spot_type,
    status: row.status,
    studySpotCount: Number(row.study_spot_count) || 0,
    decisionCount: Number(row.decision_count) || 0,
    occurrenceCount: Number(row.decision_count) || 0,
    stackDepthTags: uniqueStrings(row.stack_depth_tags),
    heroPositions: uniqueStrings(row.hero_positions),
    villainPositions: uniqueStrings(row.villain_positions),
    opponentTypes: uniqueStrings(row.opponent_types),
    secondaryTags: [],
    briefs: [],
    linkedResources: [],
    resolvedResourceId: row.resolved_resource_id || null,
    firstSeen: row.first_seen || row.created_at || null,
    lastSeen: row.last_seen || row.updated_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
  };
}

export async function listContentGaps({ status = null } = {}) {
  const resolvedPool = getRequiredPool();
  const values = [];
  const statusFilter = status ? "AND cg.status = $1" : "";
  if (status) values.push(status);
  const result = await resolvedPool.query(
    `
      SELECT
        cg.*,
        COUNT(*)::INTEGER AS study_spot_count,
        COALESCE(SUM(s.occurrence_count), 0)::INTEGER AS decision_count,
        ARRAY_AGG(DISTINCT s.stack_depth_tag)
          FILTER (WHERE s.stack_depth_tag IS NOT NULL) AS stack_depth_tags,
        ARRAY_AGG(DISTINCT s.hero_position)
          FILTER (WHERE s.hero_position <> 'unknown') AS hero_positions,
        ARRAY_AGG(DISTINCT s.villain_position)
          FILTER (WHERE s.villain_position <> 'unknown') AS villain_positions,
        ARRAY_AGG(DISTINCT s.opponent_type)
          FILTER (WHERE s.opponent_type <> 'unknown') AS opponent_types,
        MIN(o.first_seen) AS first_seen,
        MAX(o.last_seen) AS last_seen
      FROM content_gaps cg
      JOIN content_gap_occurrences o
        ON COALESCE(o.primary_tag, o.tag) = cg.primary_tag
        AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
      JOIN study_spots s
        ON s.id = o.study_spot_id
        AND s.category = cg.category
      WHERE TRUE ${statusFilter}
      GROUP BY cg.id
      ORDER BY
        CASE cg.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        decision_count DESC,
        last_seen DESC;
    `,
    values,
  );
  const gaps = result.rows.map(toContentGapSummary);
  if (gaps.length === 0) return [];

  const gapIds = gaps.map((gap) => gap.id);
  const [tagResult, briefResult, resourceResult] = await Promise.all([
    resolvedPool.query(
      `
        SELECT cg.id, tag.value AS tag
        FROM content_gaps cg
        JOIN content_gap_occurrences o
          ON COALESCE(o.primary_tag, o.tag) = cg.primary_tag
          AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
        JOIN study_spots s ON s.id = o.study_spot_id AND s.category = cg.category
        CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS_TEXT(s.tags) AS tag(value)
        WHERE cg.id = ANY($1::text[]) AND tag.value <> cg.primary_tag
        GROUP BY cg.id, tag.value;
      `,
      [gapIds],
    ),
    resolvedPool.query(
      `
        SELECT
          cg.id AS gap_id,
          o.brief_id,
          o.covered_at,
          s.title,
          s.summary,
          s.why_study_this,
          s.occurrence_count,
          s.stack_depth_bb,
          s.stack_depth_tag,
          s.hero_position,
          s.villain_position,
          s.opponent_type,
          s.tags,
          s.hand_context,
          o.last_seen,
          linked.id AS linked_resource_id,
          linked.title AS linked_resource_title,
          linked.slug AS linked_resource_slug,
          linked.content_type AS linked_resource_type,
          linked.source_url AS linked_resource_source_url,
          linked.status AS linked_resource_status,
          linked.instagram_url AS linked_resource_instagram_url
        FROM content_gaps cg
        JOIN content_gap_occurrences o
          ON COALESCE(o.primary_tag, o.tag) = cg.primary_tag
          AND COALESCE(o.study_spot_type, 'interesting_spot') = cg.study_spot_type
        JOIN study_spots s ON s.id = o.study_spot_id AND s.category = cg.category
        LEFT JOIN learning_resources linked ON linked.id = o.linked_resource_id
        WHERE cg.id = ANY($1::text[])
        ORDER BY cg.id, o.covered_at NULLS FIRST, o.last_seen DESC, s.rank_score DESC;
      `,
      [gapIds],
    ),
    resolvedPool.query(
      `
        SELECT cgr.content_gap_id, cgr.linked_at, r.*
        FROM content_gap_resources cgr
        JOIN learning_resources r ON r.id = cgr.resource_id
        WHERE cgr.content_gap_id = ANY($1::text[])
        ORDER BY cgr.linked_at DESC;
      `,
      [gapIds],
    ),
  ]);

  const byId = new Map(gaps.map((gap) => [gap.id, gap]));
  for (const row of tagResult.rows) {
    byId.get(row.id)?.secondaryTags.push(row.tag);
  }
  for (const row of briefResult.rows) {
    const gap = byId.get(row.gap_id);
    if (!gap) continue;
    const linkedResource = row.linked_resource_id ? {
      id: row.linked_resource_id,
      title: row.linked_resource_title,
      status: row.linked_resource_status,
      instagramUrl: row.linked_resource_instagram_url || null,
      canonicalPath: getLearningResourceCanonicalPath({
        slug: row.linked_resource_slug,
        resourceType: row.linked_resource_type,
        sourceUrl: row.linked_resource_source_url,
      }),
    } : null;
    gap.briefs.push({
      id: row.brief_id,
      status: row.covered_at ? "covered" : linkedResource ? "in_progress" : "open",
      coveredAt: row.covered_at || null,
      title: row.title,
      summary: row.summary,
      whyStudyThis: row.why_study_this,
      occurrenceCount: Number(row.occurrence_count) || 1,
      stackDepthBb: row.stack_depth_bb === null ? null : Number(row.stack_depth_bb),
      stackDepthTag: row.stack_depth_tag || null,
      heroPosition: row.hero_position || "unknown",
      villainPosition: row.villain_position || "unknown",
      opponentType: row.opponent_type || "unknown",
      tags: uniqueStrings(row.tags),
      handContext: sanitizedGapHandContext(row.hand_context),
      linkedResource,
    });
  }
  for (const row of resourceResult.rows) {
    const gap = byId.get(row.content_gap_id);
    if (!gap) continue;
    gap.linkedResources.push({
      ...toLearningResourcePayload(row),
      linkedAt: row.linked_at || null,
    });
  }
  for (const gap of gaps) gap.examples = gap.briefs;
  return gaps;
}

export async function getContentGapById(contentGapId) {
  const gaps = await listContentGaps();
  return gaps.find((gap) => gap.id === contentGapId) || null;
}

export async function linkContentGapResource(contentGapId, resourceId, briefId = null) {
  const resolvedPool = getRequiredPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        INSERT INTO content_gap_resources (content_gap_id, resource_id)
        SELECT cg.id, lr.id
        FROM content_gaps cg
        CROSS JOIN learning_resources lr
        WHERE cg.id = $1 AND lr.id = $2
        ON CONFLICT (content_gap_id, resource_id) DO NOTHING
        RETURNING content_gap_id;
      `,
      [contentGapId, resourceId],
    );
    if (!result.rows[0]) {
      const exists = await client.query(
        `SELECT
          EXISTS(SELECT 1 FROM content_gaps WHERE id = $1) AS gap_exists,
          EXISTS(SELECT 1 FROM learning_resources WHERE id = $2) AS resource_exists;`,
        [contentGapId, resourceId],
      );
      if (!exists.rows[0]?.gap_exists || !exists.rows[0]?.resource_exists) {
        const error = new Error(!exists.rows[0]?.gap_exists ? "Content gap not found." : "Learning resource not found.");
        error.code = !exists.rows[0]?.gap_exists ? "CONTENT_GAP_NOT_FOUND" : "LEARNING_RESOURCE_NOT_FOUND";
        throw error;
      }
    }
    await client.query(
      `
        UPDATE content_gaps
        SET
          status = CASE WHEN status = 'complete' THEN status ELSE 'in_progress' END,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [contentGapId],
    );
    if (briefId) {
      const brief = await client.query(
        `
          UPDATE content_gap_occurrences o
          SET linked_resource_id = $3, covered_at = NULL
          FROM study_spots s, content_gaps cg
          WHERE
            o.brief_id = $2
            AND s.id = o.study_spot_id
            AND cg.id = $1
            AND cg.category = s.category
            AND cg.primary_tag = COALESCE(o.primary_tag, o.tag)
            AND cg.study_spot_type = COALESCE(o.study_spot_type, 'interesting_spot')
          RETURNING o.brief_id;
        `,
        [contentGapId, briefId, resourceId],
      );
      if (!brief.rows[0]) {
        const error = new Error("Content gap Study Spot brief not found.");
        error.code = "CONTENT_GAP_BRIEF_NOT_FOUND";
        throw error;
      }
    }
    await client.query("COMMIT");
    return getContentGapById(contentGapId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function refreshContentGapStatusFromBriefs(client, contentGapId) {
  await client.query(
    `
      WITH brief_status AS (
        SELECT
          COUNT(*) FILTER (WHERE o.covered_at IS NULL)::INTEGER AS uncovered_count,
          COUNT(*) FILTER (WHERE o.linked_resource_id IS NOT NULL)::INTEGER AS linked_count,
          (ARRAY_AGG(o.linked_resource_id ORDER BY o.covered_at DESC)
            FILTER (WHERE o.covered_at IS NOT NULL AND o.linked_resource_id IS NOT NULL))[1]
            AS resolved_resource_id
        FROM content_gaps grouped_gap
        JOIN content_gap_occurrences o
          ON COALESCE(o.primary_tag, o.tag) = grouped_gap.primary_tag
          AND COALESCE(o.study_spot_type, 'interesting_spot') = grouped_gap.study_spot_type
        JOIN study_spots s
          ON s.id = o.study_spot_id
          AND s.category = grouped_gap.category
        WHERE grouped_gap.id = $1
      )
      UPDATE content_gaps cg
      SET
        status = CASE
          WHEN brief_status.uncovered_count = 0 THEN 'complete'
          WHEN brief_status.linked_count > 0 THEN 'in_progress'
          ELSE 'open'
        END,
        resolved_resource_id = CASE
          WHEN brief_status.uncovered_count = 0 THEN brief_status.resolved_resource_id
          ELSE NULL
        END,
        completed_at = CASE
          WHEN brief_status.uncovered_count = 0 THEN COALESCE(cg.completed_at, NOW())
          ELSE NULL
        END,
        updated_at = NOW()
      FROM brief_status
      WHERE cg.id = $1;
    `,
    [contentGapId],
  );
}

export async function markContentGapBriefCovered(contentGapId, briefId) {
  const resolvedPool = getRequiredPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        UPDATE content_gap_occurrences o
        SET covered_at = NOW()
        FROM study_spots s, content_gaps cg
        WHERE
          o.brief_id = $2
          AND s.id = o.study_spot_id
          AND cg.id = $1
          AND cg.category = s.category
          AND cg.primary_tag = COALESCE(o.primary_tag, o.tag)
          AND cg.study_spot_type = COALESCE(o.study_spot_type, 'interesting_spot')
        RETURNING o.brief_id;
      `,
      [contentGapId, briefId],
    );
    if (!result.rows[0]) {
      const error = new Error("Content gap Study Spot brief not found.");
      error.code = "CONTENT_GAP_BRIEF_NOT_FOUND";
      throw error;
    }
    await refreshContentGapStatusFromBriefs(client, contentGapId);
    await client.query("COMMIT");
    return getContentGapById(contentGapId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenContentGapBrief(contentGapId, briefId) {
  const resolvedPool = getRequiredPool();
  const client = await resolvedPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        UPDATE content_gap_occurrences o
        SET covered_at = NULL
        FROM study_spots s, content_gaps cg
        WHERE
          o.brief_id = $2
          AND s.id = o.study_spot_id
          AND cg.id = $1
          AND cg.category = s.category
          AND cg.primary_tag = COALESCE(o.primary_tag, o.tag)
          AND cg.study_spot_type = COALESCE(o.study_spot_type, 'interesting_spot')
        RETURNING o.brief_id;
      `,
      [contentGapId, briefId],
    );
    if (!result.rows[0]) {
      const error = new Error("Content gap Study Spot brief not found.");
      error.code = "CONTENT_GAP_BRIEF_NOT_FOUND";
      throw error;
    }
    await refreshContentGapStatusFromBriefs(client, contentGapId);
    await client.query("COMMIT");
    return getContentGapById(contentGapId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeContentGap(contentGapId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      UPDATE content_gaps cg
      SET
        status = 'complete',
        resolved_resource_id = (
          SELECT lr.id
          FROM content_gap_resources cgr
          JOIN learning_resources lr ON lr.id = cgr.resource_id
          WHERE cgr.content_gap_id = cg.id AND lr.status = 'published'
          ORDER BY cgr.linked_at DESC
          LIMIT 1
        ),
        completed_at = NOW(),
        updated_at = NOW()
      WHERE cg.id = $1
        AND EXISTS (
        SELECT 1
        FROM content_gap_resources cgr
        JOIN learning_resources lr ON lr.id = cgr.resource_id
        WHERE cgr.content_gap_id = cg.id AND lr.status = 'published'
      )
      RETURNING cg.id;
    `,
    [contentGapId],
  );
  if (!result.rows[0]) {
    const exists = await resolvedPool.query("SELECT id FROM content_gaps WHERE id = $1;", [contentGapId]);
    const error = new Error(exists.rows[0]
      ? "Publish a linked lesson before completing this content gap."
      : "Content gap not found.");
    error.code = exists.rows[0] ? "CONTENT_GAP_REQUIRES_PUBLISHED_RESOURCE" : "CONTENT_GAP_NOT_FOUND";
    throw error;
  }
  return getContentGapById(contentGapId);
}

export async function reopenContentGap(contentGapId) {
  const resolvedPool = getRequiredPool();
  const result = await resolvedPool.query(
    `
      UPDATE content_gaps
      SET status = 'open', resolved_resource_id = NULL, completed_at = NULL, updated_at = NOW()
      WHERE id = $1
      RETURNING id;
    `,
    [contentGapId],
  );
  return result.rows[0] ? getContentGapById(contentGapId) : null;
}
