# Architecture

Splice is a TypeScript monorepo with a NestJS API in `backend/` and a React application in `frontend/`. PostgreSQL stores user, account, balance, transaction, investment, and configuration data.

## Type-safe API contract

1. Backend Zod schemas define runtime validation and domain types.
2. The backend publishes those schemas through OpenAPI.
3. Orval generates the frontend models and React Query clients.

After changing the API contract, run `yarn orval` from `frontend/` and format the generated output.

## User-owned data

User data is scoped by `userId`. Services built on `OwnedCrudService` apply that ownership boundary to standard create, read, update, and delete operations, while feature-specific queries apply the same user scope explicitly.

## Financial providers

Linked-account integrations implement `IBankLinkProvider`. Providers supply account discovery, link initiation, and webhook verification; optional hooks support link completion, status updates, transaction sync, pending-transaction reconciliation, and investment data.

Plaid provides bank and investment linking. Crypto providers use the same interface for supported wallet accounts.

## Money and balance history

Amounts are stored as integer minor units together with their currency and sign. This avoids floating-point arithmetic and supports currencies with different decimal precision.

Daily account snapshots power historical balances, period comparisons, and net-worth charts. Fiat exchange rates sync daily at 06:00 UTC, while BTC and ETH rates sync hourly at five minutes past the hour.

## Repository layout

```text
splice-mono/
├── backend/    # NestJS API, migrations, and backend tests
├── frontend/   # React application and frontend tests
├── docs/       # Architecture, deployment, and screenshots
├── plans/      # Product and implementation plans
└── scripts/    # Operational helpers
```
