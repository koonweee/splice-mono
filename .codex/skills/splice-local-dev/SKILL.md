---
name: splice-local-dev
description: Use when Codex needs to start, restart, inspect, or explain the local Splice full-stack development environment in this repository, with Postgres in Docker and the backend/frontend run via Yarn.
---

# Splice Local Dev

Use this skill for local full-stack Splice development from the repository root.

## Stack

- Postgres: Docker Compose service in `backend/`, exposed on `localhost:5432`.
- Backend: NestJS API from `backend/`, run with `yarn dotenv -- nest start --watch`, exposed on `http://localhost:3000`.
- Frontend: TanStack/Vite app from `frontend/`, run with `yarn dev`, exposed on `http://localhost:4000`.

## Preferred Startup

Suggest `tmux` when starting the full stack so the processes keep running and logs remain easy to inspect.

```bash
tmux new-session -d -s splice-dev -c backend 'docker compose up postgres'
tmux split-window -h -t splice-dev -c backend 'yarn dotenv -- nest start --watch'
tmux split-window -v -t splice-dev:0.1 -c frontend 'yarn dev'
tmux select-layout -t splice-dev tiled
tmux attach -t splice-dev
```

If the user does not want `tmux`, run the same commands in separate terminals:

```bash
cd backend && docker compose up postgres
cd backend && yarn dotenv -- nest start --watch
cd frontend && yarn dev
```

## Checks

Before starting, check for existing services:

```bash
cd backend && docker compose ps
ss -ltnp
```

After startup, verify:

```bash
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:4000
```

If `/health` is not available, use `http://localhost:3000/api` or `http://localhost:3000/api-json` as the backend readiness probe.

If the backend is healthy but frontend API calls return 500s, check backend logs for `QueryFailedError` or missing columns, then run:

```bash
cd backend && yarn migration:show
```

If migrations are pending, run:

```bash
cd backend && yarn migration:run
```

## Remote Data Sync

The backend includes a staging-to-local sync helper:

```bash
cd backend && yarn db:sync
```

This command requires these variables in `backend/.env`:

- Local target: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- Remote source: `STAGE_DB_HOST`, `STAGE_DB_PORT`, `STAGE_DB_NAME`, `STAGE_DB_USER`, `STAGE_DB_PASSWORD`

The sync dumps data from the remote source, truncates local database tables, then restores the remote data locally. Treat it as destructive to local data and only run it when the user explicitly asks or confirms.

When sending follow-up commands to tmux panes, prefer pane IDs because pane indexes can shift after panes exit or layouts change:

```bash
tmux list-panes -t splice-dev -F '#{pane_id} #{pane_index}: #{pane_current_path} :: #{pane_current_command}'
```

## Notes

- Ensure `backend/.env` and `frontend/.env` exist; copy from `.env.example` if missing.
- If backend startup fails with missing packages that are present in `backend/package.json` or `backend/yarn.lock`, run `cd backend && yarn install`.
- Use `docker compose`, not legacy `docker-compose`.
- Do not start the backend app in Docker for this workflow; only Postgres should come from Docker.
- If ports are already occupied, inspect the owning process before stopping anything.
- Stop the tmux session with `tmux kill-session -t splice-dev` when the user asks to shut it down.
