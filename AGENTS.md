# Repository Guidelines

## Project Structure & Module Organization
Splice is a monorepo with two primary apps:

- `backend/`: NestJS API (`src/`, `test/`, `docker-compose.yml`, migrations in `src/migrations/`).
- `frontend/`: TanStack React app (`src/routes/`, `src/components/`, `src/lib/`, `src/api/`).
- `scripts/`: deployment helper scripts.
- `docs/`, `specs/`: design and product documentation.

For implementation details unique to each app, follow the app-level guidance in `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Build, Test, and Development Commands
Use `yarn` (per project convention) and run commands in the owning project directory unless noted.

- `cd backend && yarn install`
- `cd backend && yarn start:dev` – API with hot reload on port 3000.
- `cd backend && yarn test` – Jest unit tests.
- `cd backend && yarn test:e2e` – End-to-end suite.
- `cd backend && yarn lint` / `yarn format` – ESLint + Prettier (auto-fix enabled).
- `cd backend && yarn migration:generate|run|revert|show` – TypeORM schema changes.
- `cd frontend && yarn install`
- `cd frontend && yarn dev` – SPA on port 4000.
- `cd frontend && yarn build` – production build.
- `cd frontend && yarn test` – Vitest.
- `cd frontend && yarn typecheck` – strict TypeScript check.
- `cd frontend && yarn orval` – regenerate API client from backend OpenAPI.

## Deployment
Production deploys are handled by merging `main` into the protected `deploy` branch through `.github/workflows/deploy.yml`.
The workflow creates or reuses a `main` → `deploy` PR, runs the required CI checks for that deploy comparison, waits for them to pass, then merges the PR.

- GitHub UI: open the repo’s **Actions** tab, select **Deploy**, click **Run workflow**, keep `confirm` set to `deploy`, and run it from `main`.
- GitHub CLI: `gh workflow run deploy.yml -R koonweee/splice-mono --ref main -f confirm=deploy`
- No deploy token secret is required; the workflow uses `GITHUB_TOKEN` with explicit workflow permissions.

## Coding Style & Naming Conventions
- Backend enforces TypeScript type safety and linted style through ESLint/Prettier.
  - Backend `prettier`: `singleQuote`, `trailingComma: all` (default semicolons).
- Frontend `prettier`: `semi: false`, `singleQuote`, `trailingComma: all`.
- Prefer conventional naming:
  - Backend modules/services/controllers: `foo.module.ts`, `foo.service.ts`, `foo.controller.ts`, `foo.entity.ts`.
  - Frontend routes in `src/routes` drive paths directly (e.g., `accounts.tsx`, `accounts.$id.tsx`).
- Prefer explicit types and avoid unnecessary assertions; pass linted, readable code over shortcuts.

## Testing Guidelines
- Backend tests: `backend/test/**/*.spec.ts`; keep service/controller tests scoped by feature.
- Frontend tests: `*.test.ts` / `*.test.tsx` under `src/`.
- Use targeted runs when possible (`yarn test path/to/file` in backend, Vitest file patterns in frontend).
- CI (`.github/workflows/ci.yml`) runs lint/typecheck for changed areas; add regressions before merge.

## Commit & Pull Request Guidelines
Recent commit history uses Conventional Commit-style prefixes (`feat:`, `fix:`, `test:`, `docs:`, `chore:`) for most direct commits.  
Recommended format:
`type(scope): short imperative summary` (e.g., `feat: sync ask UI with backend contract`).

Pull requests should include:
- What changed, why it changed, and how it was validated.
- API or DB implications (migrations, contract changes, breaking behavior).
- For UI changes, include before/after validation (description or screenshot).

## Security & Configuration Tips
- Copy `.env.example` to `.env` in each app and do not commit secrets.
- Keep production credentials out of `docs` and history.
- Backend API contract lives at `http://localhost:3000/api`; keep frontend client regeneration in sync with endpoint changes.
