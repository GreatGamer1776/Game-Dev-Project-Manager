# Game Dev Project Manager

`Game Dev Project Manager` is a local-first project planning workspace for software, web, and game projects. The in-app product name is `DevArchitect`.

The app keeps project documents, task planning, bug tracking, roadmaps, flowcharts, whiteboards, data grids, and project media in one browser-based workspace with no backend requirement.

## Current Feature Set

- Multi-project dashboard for creating, opening, updating, exporting, and deleting projects
- Nested project folders with drag-and-drop file organization
- Command palette for quickly opening files and creating common project artifacts
- In-app guide, help modal, and release notes
- Browser-local persistence with IndexedDB
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

The app supports two persistence modes.

### Browser-local storage

Projects created inside the app are saved to IndexedDB. This is the default mode and works without a server.

IndexedDB stores:

- project records
- remembered File System Access handles
- app session state such as the active project, active file, and sidebar state

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

- React 18
- TypeScript
- Vite 5
- Zustand
- React Flow
- JSZip
- Tailwind CSS
- Lucide React icons

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run the app

```bash
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

## Project Structure

```text
App.tsx                  App shell, lazy editor routing, persistence, and disk I/O
components/              Editors and reusable UI surfaces
hooks/                   Shared hooks such as undo/redo
services/                Utility helpers for assets, app changelog, and integrations
stores/                  Zustand project/session store
types.ts                 Shared TypeScript models
tailwind.config.js       Tailwind source scanning and theme config
vite.config.ts           Vite configuration
```

## Validation

The current codebase does not include an automated test suite yet. Use these checks before shipping changes:

```bash
npx tsc --noEmit
npm run build
```

## Known Constraints

- There is no backend or cloud sync.
- ZIP export is supported, but ZIP import is not currently implemented.
- Local folder import expects an existing `project.json`.
- Projects stored only in IndexedDB are removed if browser storage is cleared.
- Large embedded media assets increase project size because assets are stored as data URLs in browser storage.
