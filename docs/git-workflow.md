# Git Branching & Workflow

This document describes how branches are used in this repository and how changes
flow from development to the deployed server.

## Branch overview

| Branch              | Purpose                                                                 | Buildable? | Deploys?                          |
| ------------------- | ----------------------------------------------------------------------- | ---------- | --------------------------------- |
| `main`              | **Production.** The full-stack app (web + API + Postgres, via Docker Compose). | Always | Yes — deploy on your server  |
| `dev`               | **Integration.** Where test/work-in-progress code lands and is verified. *Currently frozen at the last browser-local (IndexedDB) build for side-by-side testing.* | Always | Optional — deployable legacy build for comparison |
| `backup/*`          | **Snapshots.** Frozen copies kept for rollback (e.g. `backup/main-browser-storage`). | n/a | No |
| `topic/*`           | **Feature branches.** Isolated work (e.g. `topic/ui-redesign`).         | Not required | No                              |
| `gh-pages`          | **Stale remnant** of the old GitHub Pages deploy — the workflow has been removed. Safe to delete. | n/a | No |

## How code flows

```
topic/my-feature  ──►  dev  ──►  main  ──►  your server (docker compose)
   (feature work)    (test &    (prod)      (self-hosted deploy)
                      verify)
```

1. **Do feature work on a `topic/*` branch.** Branch off `dev`:
   ```bash
   git switch dev
   git switch -c topic/my-feature
   ```
   *Note: while `dev` is pinned to the legacy browser-local build for
   comparison testing, branch new work off `main` instead — then merge `main`
   into `dev` once you're done comparing.*
2. **Merge into `dev` to integrate and test.** `dev` must always build
   (`npm run build` succeeds). Verify before merging up.
   ```bash
   git switch dev
   git merge topic/my-feature
   npm run build   # must pass
   ```
3. **Promote to `main` only when production-ready.**
   ```bash
   git switch main
   git merge dev
   git push origin main
   ```

## Branch rules

- **`main` is production.** Only merge stable, tested code here.
- **`main` and `dev` must always be buildable.** Run `npm run build` before
  merging into either.
- **Test/experimental code goes on `dev`** (or a `topic/*` branch), never
  directly on `main`.
- **`topic/*` branches** are for focused work and can be freely rebased or
  squashed before merging into `dev`.

## Deployment

The app is self-hosted — there is no CI deploy. On your server:

```bash
git fetch origin
git switch main        # or dev, to run the comparison build
git pull
docker compose up --build -d
```

The compose stack runs three services: `db` (Postgres + `pgdata` volume), `api`
(Fastify), and `web` (nginx serving the frontend and proxying `/api`). To run
`dev` and `main` side by side, check out each branch in a separate directory
clone and give each its own `WEB_PORT`/`DB_PORT`/`API_PORT` and project name:

```bash
# main checkout
docker compose -p gdpm-main up --build -d          # http://server:8080

# dev checkout
WEB_PORT=8081 docker compose -p gdpm-dev up --build -d   # http://server:8081
```

Note: the `dev` (legacy) branch predates the Docker files, so deploy it as a
plain static frontend instead — `npm install && npm run build`, then serve
`dist/` with any static server (e.g. `npx serve dist` or nginx). It needs no
backend.

## Current branches

- `main` — production / full-stack app (Postgres + Fastify + Docker).
- `dev` — frozen at the last browser-local (IndexedDB) build for side-by-side testing; merge `main` into it to resume normal integration work.
- `backup/main-browser-storage` — snapshot of `main` before the full-stack migration.
- `topic/fullstack-db-storage` — migration + auth work (merged into `main`).

## Quick reference

```bash
# Start new feature work (off main while dev is pinned to the legacy build)
git switch main && git switch -c topic/<name>

# Integrate a finished feature
git switch dev && git merge topic/<name> && npm run build

# Ship to production
git switch main && git merge dev && git push origin main
```
