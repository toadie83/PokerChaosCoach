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
