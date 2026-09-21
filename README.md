# Game Dev Project Manager

`Game Dev Project Manager` is a project planning workspace for software, web, and game projects. The in-app product name is `DevArchitect`.

The app keeps project documents, task planning, bug tracking, roadmaps, flowcharts, whiteboards, data grids, and project media in one workspace backed by a PostgreSQL database through a Fastify API, all runnable via Docker Compose.

## Current Feature Set

- Multi-project dashboard for creating, opening, updating, exporting, and deleting projects
- Nested project folders with drag-and-drop file organization
- Command palette for quickly opening files and creating common project artifacts
- In-app guide, help modal, and release notes
- Server-side persistence in PostgreSQL via a Fastify REST API
- Optional local folder linking through the File System Access API
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

The app persists data in PostgreSQL through the backend API, and supports optional local folder linking.

### Database storage

Projects created inside the app are saved to PostgreSQL via the Fastify API (`server/`). The schema is created automatically on API startup:

- `projects` — one row per project. Metadata (`name`, `type`, `description`, `last_modified`, `is_local`) is stored in columns; `files`, `folders`, and `assets` are stored as JSONB payloads since the app always reads and writes a project as a single aggregate.
- `app_state` — key-value table storing the session state (active project, active file, sidebar state).

IndexedDB is no longer used for project data. The single exception is `services/handleStore.ts`: File System Access directory handles are browser security tokens that can only be persisted in IndexedDB, so linked-folder handles are still remembered there.

### Local folder linking

Projects can be opened from a folder on disk with `Import Local Folder`, or an existing browser-stored project can be linked to a folder from the dashboard.

When a folder is linked, the app writes project changes back to disk automatically.

Expected folder layout:

```text
your-project-folder/
  project.json
  assets/
    <asset-id>.<ext>
```

Notes:

- `project.json` stores project metadata, folders, file records, and file contents.
- Binary assets are written into `assets/`.
- Local folder linking requires a Chromium-based desktop browser with File System Access API support.
- The app remembers granted folder handles in IndexedDB.

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

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get one project |
| `PUT` | `/api/projects/:id` | Create or update a project (upsert) |
| `DELETE` | `/api/projects/:id` | Delete a project |
| `GET` | `/api/state` | Load persisted session state |
| `PUT` | `/api/state` | Save session state |

## Project Structure

```text
App.tsx                  App shell, lazy editor routing, persistence, and disk I/O
components/              Editors and reusable UI surfaces
hooks/                   Shared hooks such as undo/redo
services/                API client, asset helpers, folder-handle store, integrations
stores/                  Zustand project/session store
server/                  Fastify + PostgreSQL backend (own package.json + Dockerfile)
  src/index.ts           Fastify bootstrap and REST routes
  src/db.ts              pg pool and schema initialization
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

- There is no authentication or multi-user support; the API is intended for local/self-hosted use.
- The GitHub Pages deploy (push to `main`) publishes only the static frontend, which then requires a reachable API — the full-stack app is meant to run via Docker Compose.
- ZIP export is supported, but ZIP import is not currently implemented.
- Local folder import expects an existing `project.json`.
- Local folder linking still requires a Chromium-based desktop browser; folder handles are remembered in IndexedDB (they cannot be stored server-side).
- Large embedded media assets increase project size because assets are stored as data URLs in the database.
