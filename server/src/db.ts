import pg from 'pg';

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://devarchitect:devarchitect@localhost:5432/devarchitect';

export const pool = new Pool({ connectionString });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  last_modified BIGINT NOT NULL DEFAULT 0,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  folders JSONB NOT NULL DEFAULT '[]'::jsonb,
  assets JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects (user_id);

CREATE TABLE IF NOT EXISTS app_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (user_id, key)
);
`;

// Conditional migrations for deployments created before auth/user-scoping.
// app_state is ephemeral UI state, so it is safe to drop and recreate when its
// shape predates per-user keys.
const MIGRATIONS = `
ALTER TABLE IF EXISTS projects ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS projects DROP COLUMN IF EXISTS is_local;
ALTER TABLE IF EXISTS users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_state')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'app_state' AND column_name = 'user_id'
     ) THEN
    DROP TABLE app_state;
  END IF;
END $$;

-- Upgraded databases have users but no admin: promote the earliest account.
-- Nested IFs, not AND: Postgres does not short-circuit AND, so referencing the
-- users table in the same condition crashes on fresh databases where it does
-- not exist yet (SCHEMA runs after MIGRATIONS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_admin') THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE is_admin) THEN
      UPDATE users SET is_admin = true
      WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);
    END IF;
  END IF;
END $$;
`;

export const initDb = async (retries = 10, delayMs = 1500): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(MIGRATIONS);
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
