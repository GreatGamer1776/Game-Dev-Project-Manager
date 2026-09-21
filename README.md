# Game Dev Project Manager

`Game Dev Project Manager` is a project planning workspace for software, web, and game projects. The in-app product name is `DevArchitect`.

The app keeps project documents, task planning, bug tracking, roadmaps, flowcharts, whiteboards, data grids, and project media in one workspace backed by a PostgreSQL database through a Fastify API, all runnable via Docker Compose.

## Current Feature Set

- Multi-project dashboard for creating, opening, updating, exporting, and deleting projects
- Nested project folders with drag-and-drop file organization
- Command palette for quickly opening files and creating common project artifacts
- In-app guide, help modal, and release notes
- Username/password accounts — no email or PII collected
- Server-side persistence in PostgreSQL via a Fastify REST API, with per-user data isolation
- ZIP export for portable project backups
- Cross-file links from documents, task lists, and bug descriptions
- Task links from documents into the task list editor
- Shared asset library for images, videos, and audio used by documents and whiteboards

## Editor Types

| Type | Purpose | Notes |
| --- | --- | --- |
| Document | Markdown-style project docs, GDDs, specs, notes | Supports headings, lists, code, blockquotes, media embeds, file links, and task links |
| Flowchart | Node-and-edge diagrams | Built on React Flow |
| Task List | Todo and production task tracking | Single-instance project file |
| Bug Tracker | Kanban-style bug tracking | Single-instance project file |
| Roadmap | Phase and milestone planning | Single-instance project file |
| Data Grid | Lightweight tabular project data | Supports CSV-style import/export from the editor |
| Whiteboard | Freeform visual planning | Supports media elements and image export |
| Asset Library | Project media repository | Single-instance project file backed by project assets |

## Performance Model

- Editor components are lazy-loaded with `React.lazy`, so the initial app bundle does not include every editor up front.
- The document preview renderer is custom and optimized for large markdown files:
  - preview rendering is skipped in edit-only mode
  - preview updates are debounced
  - parsing is scheduled during browser idle time when available
  - block rendering uses chunked string assembly
  - inline markdown is parsed in a single token pass
- Tailwind scans only application source paths, avoiding `node_modules` during development and production builds.

## Storage Model

All project data persists in PostgreSQL through the backend API, behind per-user accounts.

### Authentication

Accounts are username + password only — no email or other PII is collected or stored. Passwords are hashed with Node's built-in `crypto.scrypt` (per-user salt). Sessions are random bearer tokens; only their SHA-256 hash is stored server-side. Tokens expire after 30 days.

### Database storage

The schema is created automatically on API startup:

- `users` — `id`, `username` (unique), `password_hash`, `created_at`
- `sessions` — `token_hash`, `user_id`, `created_at`, `expires_at`
- `projects` — one row per project, owned by a user (`user_id`). Metadata (`name`, `type`, `description`, `last_modified`) is stored in columns; `files`, `folders`, and `assets` are stored as JSONB payloads since the app always reads and writes a project as a single aggregate.
- `app_state` — per-user key-value table storing session state (active project, active file, sidebar state).

No project data is stored in the browser — clearing browser data only signs you out. The browser only holds the session token (localStorage) and appearance preferences.

### Migrating an existing database

If you deployed the pre-auth version, the schema migrates automatically on API startup (`user_id` column added, `is_local` dropped, `app_state` recreated per-user). Orphaned projects (created before accounts existed) are claimed by the first user who registers.

## Tech Stack

Frontend:

- React 18
- TypeScript
- Vite 5
- Zustand
- React Flow
- JSZip
- Tailwind CSS
- Lucide React icons

Backend (`server/`):

- Fastify 5
- PostgreSQL 16
- node-postgres (`pg`)

## Getting Started

### Run everything with Docker

Requires Docker with Compose v2.

```bash
docker compose up --build
```

Then open http://localhost:8080

Services:

| Service | Description | Port |
| --- | --- | --- |
| `web` | Nginx serving the built frontend; proxies `/api` to the API | 8080 |
| `api` | Fastify REST API | 3001 |
| `db` | PostgreSQL with a persistent `pgdata` volume | 5432 |

Environment overrides (optional): `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_PORT`, `API_PORT`, `WEB_PORT` — set them in a root `.env` file or inline.

### Local development without Docker

Prerequisites: Node.js 18+, npm, and a PostgreSQL instance.

```bash
# 1. Start PostgreSQL and create a database, e.g.
#    createdb devarchitect
#    (or run just the db service: docker compose up db)

# 2. Point the API at it (default: postgres://devarchitect:devarchitect@localhost:5432/devarchitect)
export DATABASE_URL=postgres://user:pass@localhost:5432/devarchitect

# 3. Install dependencies
npm install
npm --prefix server install

# 4. Run the API (port 3001) and the Vite dev server (port 5173, proxies /api)
npm run dev:api
npm run dev
```

### Build for production

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## API

All endpoints except `/api/health` and the auth routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account; returns `{ token, user }` |
| `POST` | `/api/auth/login` | Sign in; returns `{ token, user }` |
| `GET` | `/api/auth/me` | Current session's user |
| `POST` | `/api/auth/logout` | Invalidate the session token |
| `GET` | `/api/projects` | List the current user's projects |
| `GET` | `/api/projects/:id` | Get one project |
| `PUT` | `/api/projects/:id` | Create or update a project (upsert) |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/state` | Load persisted session state |
| `PUT` | `/api/state` | Save session state |

## Project Structure

```text
App.tsx                  App shell, auth gating, lazy editor routing, persistence
components/              Editors, AuthView, and reusable UI surfaces
hooks/                   Shared hooks such as undo/redo
services/                API client, asset helpers, and integrations
stores/                  Zustand project/session/auth stores
server/                  Fastify + PostgreSQL backend (own package.json + Dockerfile)
  src/index.ts           Fastify bootstrap and REST routes
  src/auth.ts            scrypt password hashing and bearer-token sessions
  src/db.ts              pg pool, schema, and conditional migrations
  src/types.ts           Server-side project/app-state models
types.ts                 Shared TypeScript models
docker-compose.yml       db + api + web orchestration
Dockerfile               Frontend production image (vite build -> nginx)
nginx.conf               Web server config: SPA fallback + /api proxy
tailwind.config.js       Tailwind source scanning and theme config
vite.config.ts           Vite configuration (including /api dev proxy)
```

## Validation

The current codebase does not include an automated test suite yet. Use these checks before shipping changes:

```bash
npx tsc --noEmit
npm run build
npm --prefix server run build
```

## Known Constraints

- No password recovery or account deletion UI — accounts are username + password only.
- No rate limiting on auth endpoints — keep the API private/self-hosted or put it behind a reverse proxy with rate limiting.
- The GitHub Pages deploy (push to `main`) publishes only the static frontend, which then requires a reachable API — the full-stack app is meant to run via Docker Compose.
- ZIP export is supported, but ZIP import is not currently implemented.
- Large embedded media assets increase project size because assets are stored as data URLs in the database.
