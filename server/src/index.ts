import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb, pool } from './db.js';
import { AppState, Project, ProjectRow, rowToProject } from './types.js';

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

app.get('/api/projects', async () => {
  const { rows } = await pool.query<ProjectRow>(
    'SELECT * FROM projects ORDER BY last_modified DESC'
  );
  return rows.map(rowToProject);
});

app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
  const { rows } = await pool.query<ProjectRow>(
    'SELECT * FROM projects WHERE id = $1',
    [req.params.id]
  );
  if (rows.length === 0) {
    return reply.code(404).send({ error: 'Project not found' });
  }
  return rowToProject(rows[0]);
});

app.put<{ Params: { id: string }; Body: Project }>(
  '/api/projects/:id',
  async (req, reply) => {
    const project = req.body;
    if (!project || typeof project !== 'object' || !project.id || !project.name) {
      return reply.code(400).send({ error: 'Invalid project payload' });
    }
    if (project.id !== req.params.id) {
      return reply.code(400).send({ error: 'Project id mismatch' });
    }

    const { rows } = await pool.query<ProjectRow>(
      `INSERT INTO projects (id, name, type, description, last_modified, is_local, files, folders, assets)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         description = EXCLUDED.description,
         last_modified = EXCLUDED.last_modified,
         is_local = EXCLUDED.is_local,
         files = EXCLUDED.files,
         folders = EXCLUDED.folders,
         assets = EXCLUDED.assets
       RETURNING *`,
      [
        project.id,
        project.name,
        project.type ?? 'Software',
        project.description ?? '',
        Math.trunc(project.lastModified ?? Date.now()),
        Boolean(project.isLocal),
        JSON.stringify(project.files ?? []),
        JSON.stringify(project.folders ?? []),
        JSON.stringify(project.assets ?? {}),
      ]
    );
    return rowToProject(rows[0]);
  }
);

app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
  await pool.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  return reply.code(204).send();
});

app.get('/api/state', async () => {
  const { rows } = await pool.query<{ value: AppState }>(
    'SELECT value FROM app_state WHERE key = $1',
    [APP_STATE_KEY]
  );
  return rows[0]?.value ?? null;
});

app.put<{ Body: AppState }>('/api/state', async (req, reply) => {
  const state = req.body;
  if (!state || typeof state !== 'object') {
    return reply.code(400).send({ error: 'Invalid app state payload' });
  }
  await pool.query(
    `INSERT INTO app_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [APP_STATE_KEY, JSON.stringify(state)]
  );
  return { ok: true };
});

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
