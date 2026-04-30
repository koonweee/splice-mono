---
name: splice-local-dev
description: Use when Codex needs to start, restart, inspect, or explain the local Splice full-stack development environment in this repository, with Postgres in Docker and the backend/frontend run via Yarn.
---

# Splice Local Dev

Use this skill for local full-stack Splice development from the repository root.

## Stack

- Postgres: Docker Compose service in `backend/`, exposed on `localhost:5432`.
- Backend: NestJS API from `backend/`, run with `yarn start:dev`, exposed on `http://localhost:3000`.
- Frontend: TanStack/Vite app from `frontend/`, run with `yarn dev`, exposed on `http://localhost:4000`.

## Preferred Startup

Suggest `tmux` when starting the full stack so the processes keep running and logs remain easy to inspect.

```bash
tmux new-session -d -s splice-dev -c backend 'docker compose up postgres'
tmux split-window -h -t splice-dev -c backend 'yarn start:dev'
tmux split-window -v -t splice-dev:0.1 -c frontend 'yarn dev'
tmux select-layout -t splice-dev tiled
tmux attach -t splice-dev
```

If the user does not want `tmux`, run the same commands in separate terminals:

```bash
cd backend && docker compose up postgres
cd backend && yarn start:dev
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

## Notes

- Ensure `backend/.env` and `frontend/.env` exist; copy from `.env.example` if missing.
- Use `docker compose`, not legacy `docker-compose`.
- Do not start the backend app in Docker for this workflow; only Postgres should come from Docker.
- If ports are already occupied, inspect the owning process before stopping anything.
- Stop the tmux session with `tmux kill-session -t splice-dev` when the user asks to shut it down.
