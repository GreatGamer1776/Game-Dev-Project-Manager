# Game Dev Project Manager

`Game Dev Project Manager` is a local-first planning workspace for software, web, and game projects. The app is branded in the UI as `DevArchitect` and combines documents, task tracking, roadmaps, flowcharts, whiteboards, data grids, and an asset library in a single browser-based workspace.

## What It Does

- Create and manage multiple projects from a dashboard
- Organize project files inside nested folders
- Edit typed project files with purpose-built editors:
  - Documents
  - Changelogs
  - Flowcharts
  - Task Lists
  - Bug Trackers
  - Roadmaps
  - Data Grids
  - Whiteboards
  - Asset Library
- Link files, tasks, and embedded assets from documents
- Persist projects locally in the browser with IndexedDB
- Export projects as `.zip` archives
- Link a project to a local folder on disk with the File System Access API

## Storage Model

The app currently supports two persistence modes:

### 1. Browser-local storage

Projects created inside the app are saved to IndexedDB. This is the default experience and works without any backend.

### 2. Local folder linking

Projects can be opened from a folder on disk using `Import Local Folder`, or an existing browser-stored project can be linked to a folder from the dashboard. When a valid folder is linked, edits are written back to disk automatically.

The expected folder layout is:

```text
your-project-folder/
  project.json
  assets/
    <asset-id>.<ext>
```

Notes:

- `project.json` stores the project structure and file contents
- Binary assets are written into the `assets/` folder
- Local folder linking requires a Chromium-based browser with File System Access API support
- The app remembers previously granted folder handles in IndexedDB

## Tech Stack

- React 18
- TypeScript
- Vite
- Zustand
- React Flow
- JSZip
- Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ recommended
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
App.tsx                  Main app shell, routing, persistence, and disk I/O
components/              Editors and UI surfaces
hooks/                   Shared hooks such as undo/redo
services/                Utility helpers
stores/                  Zustand state store
types.ts                 Shared TypeScript types
```

## Editor Notes

- Documents support Markdown-style content plus in-app linking syntax
- Whiteboards export as images from the editor UI
- Task Lists, Bug Trackers, Roadmaps, and Asset Libraries are treated as single-instance project files
- Assets are stored as data URLs in memory/browser storage and are materialized as files when exporting or writing to disk

## Known Constraints

- There is currently no backend or cloud sync
- ZIP export is supported, but this codebase does not currently include a ZIP import flow
- Local folder import expects an existing `project.json`
- Clearing browser storage will remove projects that only exist in IndexedDB

## Development Notes

- The package name is currently `dev-architect`
- The app uses `React.StrictMode`
- There is no automated test suite configured yet
