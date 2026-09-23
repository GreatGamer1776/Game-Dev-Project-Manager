import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'crypto';
import { initDb, pool } from './db.js';
import {
  createSession,
  deleteSession,
  hashPassword,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  requireAdmin,
  requireAuth,
  validateCredentials,
  verifyPassword,
} from './auth.js';
import { AppState, Project, ProjectRow, UserRow, rowToProject } from './types.js';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const APP_STATE_KEY = 'session';

// Projects embed base64 assets, so payloads can be several MB.
const app = Fastify({
  logger: true,
  bodyLimit: 50 * 1024 * 1024,
});

await app.register(cors, { origin: true });

app.get('/api/health', async () => ({ ok: true }));

// --- Auth ---

interface AuthBody {
  username?: unknown;
  password?: unknown;
}

// Lets the frontend decide between "create admin" (first run) and "sign in".
app.get('/api/auth/setup', async () => {
  const { rows } = await pool.query<{ c: string }>('SELECT COUNT(*) AS c FROM users');
  return { needsSetup: Number(rows[0]?.c ?? 0) === 0 };
});

// Public registration only while no users exist — the first account is the
// admin. Afterwards only admins can create accounts (see POST /api/users).
app.post<{ Body: AuthBody }>('/api/auth/register', async (req, reply) => {
  const { rows } = await pool.query<{ c: string }>('SELECT COUNT(*) AS c FROM users');
  if (Number(rows[0]?.c ?? 0) > 0) {
    return reply.code(403).send({ error: 'Public registration is disabled — ask an admin for an account' });
  }

  const creds = validateCredentials(req.body?.username, req.body?.password);
  if ('error' in creds) {
    return reply.code(400).send({ error: creds.error });
  }

  const id = randomUUID();
  try {
    await pool.query(
      'INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES ($1, $2, $3, true, $4)',
      [id, creds.username, hashPassword(creds.password), Date.now()]
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Username is already taken' });
    }
    throw err;
  }

  // Claim any projects created before accounts existed (single-user upgrades).
  await pool.query('UPDATE projects SET user_id = $1 WHERE user_id IS NULL', [id]);

  const token = await createSession(id);
  return { token, user: { id, username: creds.username, isAdmin: true } };
});

app.post<{ Body: AuthBody }>('/api/auth/login', async (req, reply) => {
  const creds = validateCredentials(req.body?.username, req.body?.password);
  if ('error' in creds) {
    return reply.code(400).send({ error: creds.error });
  }

  const { rows } = await pool.query<UserRow>(
    'SELECT * FROM users WHERE username = $1',
    [creds.username]
  );
  const user = rows[0];
  // Same error for unknown user and wrong password — no account enumeration.
  if (!user || !verifyPassword(creds.password, user.password_hash)) {
    return reply.code(401).send({ error: 'Invalid username or password' });
  }

  const token = await createSession(user.id);
  return { token, user: { id: user.id, username: user.username, isAdmin: user.is_admin } };
});

app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => ({
  user: req.user,
}));

app.post('/api/auth/logout', { preHandler: requireAuth }, async (req) => {
  await deleteSession(req.sessionToken!);
  return { ok: true };
});

// --- User management (admin only) ---

interface UserParams {
  id: string;
}

interface CreateUserBody {
  username?: unknown;
  password?: unknown;
  isAdmin?: unknown;
}

interface UpdateUserBody {
  password?: unknown;
  isAdmin?: unknown;
}

const toAdminUser = (row: Pick<UserRow, 'id' | 'username' | 'is_admin' | 'created_at'>) => ({
  id: row.id,
  username: row.username,
  isAdmin: row.is_admin,
  createdAt: Number(row.created_at) || 0,
});

app.get('/api/users', { preHandler: requireAdmin }, async () => {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, username, is_admin, created_at FROM users ORDER BY created_at ASC'
  );
  return rows.map(toAdminUser);
});

app.post<{ Body: CreateUserBody }>('/api/users', { preHandler: requireAdmin }, async (req, reply) => {
  const creds = validateCredentials(req.body?.username, req.body?.password);
  if ('error' in creds) {
    return reply.code(400).send({ error: creds.error });
  }
  const isAdmin = req.body?.isAdmin === true;

  const id = randomUUID();
  try {
    await pool.query(
      'INSERT INTO users (id, username, password_hash, is_admin, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, creds.username, hashPassword(creds.password), isAdmin, Date.now()]
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      return reply.code(409).send({ error: 'Username is already taken' });
    }
    throw err;
  }
  return reply.code(201).send({ id, username: creds.username, isAdmin, createdAt: Date.now() });
});

app.put<{ Params: UserParams; Body: UpdateUserBody }>(
  '/api/users/:id',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    const { password, isAdmin } = req.body ?? {};

    // Prevent admins from locking themselves (and potentially everyone) out.
    if (id === req.user!.id && isAdmin === false) {
      return reply.code(400).send({ error: 'You cannot remove your own admin access' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (password !== undefined) {
      if (
        typeof password !== 'string' ||
        password.length < MIN_PASSWORD_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH
      ) {
        return reply.code(400).send({ error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters` });
      }
      values.push(hashPassword(password));
      updates.push(`password_hash = $${values.length}`);
    }

    if (isAdmin !== undefined) {
      values.push(isAdmin === true);
      updates.push(`is_admin = $${values.length}`);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'Nothing to update' });
    }

    values.push(id);
    const { rowCount } = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    if (!rowCount) {
      return reply.code(404).send({ error: 'User not found' });
    }
    // Invalidate the target's sessions so a stolen/forgotten password stops working.
    if (password !== undefined) {
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    }
    return { ok: true };
  }
);

app.delete<{ Params: UserParams }>(
  '/api/users/:id',
  { preHandler: requireAdmin },
  async (req, reply) => {
    const { id } = req.params;
    if (id === req.user!.id) {
      return reply.code(400).send({ error: 'You cannot delete your own account' });
    }
    // sessions / projects / app_state cascade via ON DELETE CASCADE.
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    if (!rowCount) {
      return reply.code(404).send({ error: 'User not found' });
    }
    return { ok: true };
  }
);

// --- Projects (all scoped to the authenticated user) ---

app.get('/api/projects', { preHandler: requireAuth }, async (req) => {
  const { rows } = await pool.query<ProjectRow>(
    'SELECT * FROM projects WHERE user_id = $1 ORDER BY last_modified DESC',
    [req.user!.id]
  );
  return rows.map(rowToProject);
});

app.get<{ Params: { id: string } }>(
  '/api/projects/:id',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { rows } = await pool.query<ProjectRow>(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id]
    );
    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return rowToProject(rows[0]);
  }
);

app.put<{ Params: { id: string }; Body: Project }>(
  '/api/projects/:id',
  { preHandler: requireAuth },
  async (req, reply) => {
    const project = req.body;
    if (!project || typeof project !== 'object' || !project.id || !project.name) {
      return reply.code(400).send({ error: 'Invalid project payload' });
    }
    if (project.id !== req.params.id) {
      return reply.code(400).send({ error: 'Project id mismatch' });
    }

    const { rows } = await pool.query<ProjectRow>(
      `INSERT INTO projects (id, user_id, name, type, description, last_modified, files, folders, assets)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         last_modified = EXCLUDED.last_modified,
         files = EXCLUDED.files,
         folders = EXCLUDED.folders,
         assets = EXCLUDED.assets
       WHERE projects.user_id = $2
       RETURNING *`,
      [
        project.id,
        req.user!.id,
        project.name,
        project.type ?? 'Software',
        project.description ?? '',
        Math.trunc(project.lastModified ?? Date.now()),
        JSON.stringify(project.files ?? []),
        JSON.stringify(project.folders ?? []),
        JSON.stringify(project.assets ?? {}),
      ]
    );
    if (rows.length === 0) {
      // Exists but owned by someone else — do not leak its existence.
      return reply.code(404).send({ error: 'Project not found' });
    }
    return rowToProject(rows[0]);
  }
);

app.delete<{ Params: { id: string } }>(
  '/api/projects/:id',
  { preHandler: requireAuth },
  async (req, reply) => {
    await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user!.id,
    ]);
    return reply.code(204).send();
  }
);

// --- Per-user session/app state ---

app.get('/api/state', { preHandler: requireAuth }, async (req) => {
  const { rows } = await pool.query<{ value: AppState }>(
    'SELECT value FROM app_state WHERE user_id = $1 AND key = $2',
    [req.user!.id, APP_STATE_KEY]
  );
  return rows[0]?.value ?? null;
});

app.put<{ Body: AppState }>(
  '/api/state',
  { preHandler: requireAuth },
  async (req, reply) => {
    const state = req.body;
    if (!state || typeof state !== 'object') {
      return reply.code(400).send({ error: 'Invalid app state payload' });
    }
    await pool.query(
      `INSERT INTO app_state (user_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [req.user!.id, APP_STATE_KEY, JSON.stringify(state)]
    );
    return { ok: true };
  }
);

const start = async () => {
  try {
    await initDb();
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
