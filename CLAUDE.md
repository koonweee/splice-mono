# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Splice is a full-stack financial management application with a NestJS backend and React frontend. The monorepo structure separates concerns while sharing API contracts via OpenAPI.

## Repository Structure

```
splice-mono/
├── backend/     # NestJS API server (see backend/CLAUDE.md)
├── frontend/    # React SPA with TanStack (see frontend/CLAUDE.md)
└── scripts/     # Deployment scripts
```

## Development

### Package Manager

Always use `yarn`, never `npm`.

### Running the Full Stack

```bash
# Backend (in backend/)
docker-compose up          # Start with PostgreSQL

# Frontend (in frontend/)
yarn dev                   # Starts on port 4000
```

### Code Quality

Both projects share the same quality workflow:

```bash
yarn format     # Prettier
yarn lint       # ESLint with auto-fix
yarn test       # Run tests
```

### API Contract

The backend exposes OpenAPI documentation at `http://localhost:3000/api`. The frontend generates its API client from this spec:

```bash
# In frontend/ (requires backend running)
yarn orval      # Regenerates src/api/clients and src/api/models
```

After modifying backend API endpoints, regenerate the frontend client to keep types in sync.

## Code Style

### Loop Preference

Prefer functional array methods over `for` loops:
- Use `forEach` for iteration with side effects
- Use `map` for transformations
- Use `filter`, `find`, `some`, `every` for searching/filtering
- Use `reduce` for accumulation

For async operations that can run in parallel, use `Promise.all` or `Promise.allSettled`:
```typescript
// Parallel execution
const results = await Promise.all(items.map(item => processItem(item)));

// Parallel with error handling
const results = await Promise.allSettled(items.map(item => processItem(item)));
```

### TypeScript

Avoid type casting (`as`, `<Type>`). If types don't match, fix the underlying type definitions rather than casting. Type assertions hide potential bugs and reduce type safety.

### React

Avoid `useEffect` when possible. Prefer:
- **Derived state**: Compute values directly during render instead of syncing with useEffect
- **Event handlers**: Handle side effects in response to user actions
- **TanStack Query**: Use for data fetching instead of useEffect + useState
- **useMemo/useCallback**: For expensive computations or stable references

## Architecture Notes

- **Backend**: NestJS with TypeORM, JWT auth, Zod validation. All routes protected by default.
- **Frontend**: React 19 with TanStack Router (file-based) and TanStack Query. Uses Orval-generated API client.
- **Type Safety**: Zod schemas on backend flow through OpenAPI to generated TypeScript types on frontend.

See individual CLAUDE.md files in `backend/` and `frontend/` for detailed guidance.
