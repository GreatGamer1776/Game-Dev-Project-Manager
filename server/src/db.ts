import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://devarchitect:devarchitect@localhost:5432/devarchitect';

export const pool = new Pool({ connectionString });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  last_modified BIGINT NOT NULL DEFAULT 0,
  is_local BOOLEAN NOT NULL DEFAULT FALSE,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  folders JSONB NOT NULL DEFAULT '[]'::jsonb,
  assets JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
`;

export const initDb = async (retries = 10, delayMs = 1500): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(SCHEMA);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
};
