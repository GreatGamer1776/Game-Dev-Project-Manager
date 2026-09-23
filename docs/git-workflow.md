# Git Branching & Workflow

This document describes how branches are used in this repository and how changes
flow from development to the deployed server.

## Branch overview

| Branch              | Purpose                                                                 | Buildable? | Deploys?                          |
| ------------------- | ----------------------------------------------------------------------- | ---------- | --------------------------------- |
| `main`              | **Production.** The full-stack app (web + API + Postgres, via Docker Compose). | Always | Yes — deploy on your server  |
| `dev`               | **Integration.** The full-stack app under active development — where feature work lands and is verified before promotion to `main`. | Always | Yes — deploy alongside `main` to preview |
| `legacy/*`          | **Frozen legacy builds.** e.g. `legacy/browser-local` — the last browser-local (IndexedDB) app, with its own static-only Docker deploy. | n/a | Optional — comparison/testing |
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
- **`legacy/*` and `backup/*` are frozen** — don't commit to them; create a new
  branch if a snapshot needs work.

## Deployment

The app is self-hosted — there is no CI deploy. On your server (or via a
Portainer stack pointed at the repo + branch):

```bash
git fetch origin
git switch main        # or dev / legacy/browser-local
git pull
docker compose up --build -d
```

`main` and `dev` run the full compose stack (`db` + `api` + `web`, HTTPS on 4443
by default). `legacy/browser-local` is static-only (single `web` service, HTTPS
on 4444). To run `dev` and `main` side by side, deploy each as its own
stack/clone with different project names and port overrides:

```bash
# main checkout  → https://server:4443
docker compose -p gdpm-main up --build -d

# dev checkout   → https://server:4444
WEB_PORT=8081 HTTPS_PORT=4444 API_PORT=3002 DB_PORT=5433 \
  docker compose -p gdpm-dev up --build -d
```

Each stack gets its own `pgdata` volume (compose project-scoped), so the two
databases stay fully independent.

All builds serve a self-signed cert by default — see the README's HTTPS section
for trusted-cert options (reverse proxy, mkcert, Tailscale).

## Current branches

- `main` — production / full-stack app (Postgres + Fastify + Docker).
- `dev` — integration / full-stack app under development.
- `legacy/browser-local` — frozen browser-local build (IndexedDB, no backend) for side-by-side comparison.
- `backup/main-browser-storage` — snapshot of `main` before the full-stack migration.
- `topic/fullstack-db-storage` — migration + auth work (merged).

## Quick reference

```bash
# Start new feature work
git switch dev && git switch -c topic/<name>

# Integrate a finished feature
git switch dev && git merge topic/<name> && npm run build

# Ship to production
git switch main && git merge dev && git push origin main
```
