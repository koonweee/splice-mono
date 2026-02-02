# Splice Project Context

## Project Overview

Splice is a full-stack personal finance application designed for tracking net worth across multiple accounts and currencies. It features a monorepo structure containing a NestJS backend and a React frontend.

**Key Features:**

- Multi-account management (depository, investment, credit, loans).
- Bank account integration via Plaid.
- Net worth dashboard with historical tracking.
- Multi-currency support with automatic conversion.
- Transaction management and categorization.
- Daily historical balance snapshots.

## Repository Structure

The project is organized as a monorepo:

- **`backend/`**: NestJS API server. Handles business logic, database interactions, and banking integrations.
- **`frontend/`**: React Single Page Application (SPA). Provides the user interface, utilizing TanStack libraries.
- **`scripts/`**: Deployment and utility scripts.
- **`specs/`**: Product specifications and documentation.

## Tech Stack & Architecture

### Backend (`backend/`)

- **Framework:** NestJS
- **Database:** PostgreSQL (via Docker)
- **ORM:** TypeORM
- **Validation:** Zod (schemas flow to frontend via OpenAPI)
- **Logging:** `nestjs-pino` with `pino-seq` (structured logging)
- **Key Patterns:**
  - `OwnedCrudService`: Scopes data access to the authenticated user.
  - **Bank Link Providers:** Standardized interface for adding banking integrations (e.g., Plaid).
  - **Entity Pattern:** Entities implement `fromDto()` and `toObject()` for transformation.

### Frontend (`frontend/`)

- **Framework:** React 19
- **Routing:** TanStack Router (file-based routing in `src/routes/`).
- **State/Data Fetching:** TanStack Query.
- **Styling:** Tailwind CSS 4.
- **API Client:** Orval (auto-generates React Query hooks and types from backend OpenAPI spec).

### API Contract

Types are defined in the backend using Zod, exposed via OpenAPI, and consumed in the frontend using Orval.

1.  **Backend:** Define Zod schemas.
2.  **Backend:** Register schemas for OpenAPI.
3.  **Frontend:** Run `yarn orval` to generate typed hooks and models.

## Development Workflow

### Prerequisites

- Node.js
- Yarn (Strictly enforced)
- Docker (for PostgreSQL)

### Quick Start

1.  **Start Database:** `cd backend && docker-compose up -d`
2.  **Start Backend:** `cd backend && yarn start:dev` (runs on port 3000)
3.  **Start Frontend:** `cd frontend && yarn dev` (runs on port 4000)

### Key Commands

| Action          | Backend (`backend/`)              | Frontend (`frontend/`)                  |
| :-------------- | :-------------------------------- | :-------------------------------------- |
| **Run Dev**     | `yarn start:dev`                  | `yarn dev`                              |
| **Test**        | `yarn test`                       | `yarn test`                             |
| **Lint/Format** | `yarn lint` && `yarn format`      | `yarn lint` && `yarn format`            |
| **Typecheck**   | `yarn typecheck`                  | `yarn typecheck`                        |
| **API Sync**    | N/A                               | `yarn orval` (requires backend running) |
| **Migrations**  | `yarn migration:generate` / `run` | N/A                                     |

## Coding Conventions

### General

- **Package Manager:** Always use `yarn`.
- **DRY:** Strictly follow DRY principles.
- **Functional Programming:** Prefer `map`, `filter`, `reduce` over `for` loops. Use `Promise.all` for parallel async operations.
- **Type Safety:** Avoid type casting (`as`). Fix underlying types instead.

### Backend Specifics

- **Logging:** ALWAYS use structured logging. Pass context object first: `this.logger.log({ userId }, 'Message')`.
- **API Docs:** Use `@ZodApiResponse` and `@ZodApiBody` decorators.
- **Module Structure:** Consistent `entity`, `service`, `controller`, `module` files per feature.

### Frontend Specifics

- **React:** Avoid `useEffect` where possible. Use derived state, event handlers, or TanStack Query.
- **Routing:** Do not manually edit `routeTree.gen.ts`. Create files in `src/routes/`.
- **Data Fetching:** Use generated Orval hooks (`useGetAccounts`, etc.).

## Documentation

- **Backend API:** `http://localhost:3000/api` (Swagger UI)
- **Product Spec:** `specs/web-app.md`
