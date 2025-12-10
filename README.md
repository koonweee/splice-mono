# Splice

A full-stack personal finance application for tracking net worth across multiple accounts and currencies.

## Features

### Multi-Account Financial Management
- Support for multiple account types: depository, investment, credit, and loans
- Real-time balance tracking with available and current balances
- Account metadata including institution names and account masks

### Bank Account Integration (Plaid)
- OAuth-based linking with Plaid
- Webhook-driven account sync for real-time balance updates
- Extensible provider architecture for adding additional banking providers

### Net Worth Dashboard
- Dynamic net worth calculation with period-over-period change tracking
- Account summaries categorized as assets vs liabilities
- Historical net worth charting with daily data points

### Multi-Currency Support
- User-configurable preferred display currency
- Historical exchange rate tracking with daily sync
- Automatic balance conversion across all views

### Transaction Management
- Transaction tracking linked to accounts
- Merchant information and logos
- Pending vs posted transaction distinction
- Transaction categorization

### Historical Balance Snapshots
- Daily balance snapshots for all accounts
- Automatic gap-filling ensures continuous historical data
- Powers net worth charts and period comparisons

### User Settings
- Timezone configuration (IANA timezone strings)
- Display currency preferences

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS, TypeORM, PostgreSQL |
| Frontend | React 19, TanStack Router, TanStack Query, Mantine UI, Tailwind CSS |
| API Contract | Zod schemas → OpenAPI → Orval-generated client |
| Auth | JWT with HTTP-only cookies |

### Repository Structure

```
splice-mono/
├── backend/     # NestJS API server
├── frontend/    # React SPA
└── scripts/     # Deployment scripts
```

### Type-Safe API Contract

Types flow end-to-end from backend to frontend:

1. **Define** - Zod schemas in backend define all types and validation
2. **Generate** - OpenAPI spec auto-generated from Zod schemas
3. **Consume** - Orval generates React Query hooks and TypeScript types for frontend

```bash
# After backend API changes, regenerate frontend client:
cd frontend && yarn orval
```

### Key Architectural Patterns

#### User-Owned Data Scoping
All user data operations are automatically scoped by `userId`. A base `OwnedCrudService` class enforces this pattern across all entities (accounts, transactions, snapshots, etc.), preventing cross-user data access.

#### Bank Link Provider Interface
Banking integrations follow a provider pattern with a standardized 4-step flow:
1. `initiateLinking()` - Generate link URL, create pending webhook event
2. User completes OAuth in provider UI
3. `processWebhook()` - Extract accounts from webhook payload
4. `getAccounts()` - Fetch updated accounts using stored credentials

New banking providers can be added by implementing the `IBankLinkProvider` interface.

#### Multi-Currency Balance Conversion
- Amounts stored as integer cents to avoid floating-point precision issues
- `BalanceConversionHelper` handles batch conversion with exchange rate caching
- Historical rates preserved for accurate point-in-time conversions

#### Scheduled Background Tasks
- **Exchange Rate Sync** - Daily at 6 AM UTC, fetches rates for all currency pairs
- **Balance Snapshot Forward-Fill** - Every 6 hours, ensures continuous daily data by copying from most recent snapshot when no sync occurred

#### Net Worth Aggregation
Dashboard service classifies accounts as assets (depository, investment) vs liabilities (credit, loans), calculates net worth as `assets - |liabilities|`, and generates daily chart data with timezone-aware date handling.

---

## Development

### Prerequisites
- Node.js
- Yarn
- Docker (for PostgreSQL)

### Running Locally

```bash
# Start PostgreSQL
cd backend && docker-compose up -d

# Start backend (port 3000)
cd backend && yarn start:dev

# Start frontend (port 4000)
cd frontend && yarn dev
```

### Commands

```bash
# Code quality (both projects)
yarn format     # Prettier
yarn lint       # ESLint
yarn test       # Run tests

# Backend-specific
yarn migration:generate   # Generate TypeORM migration
yarn migration:run        # Run migrations

# Frontend-specific
yarn orval      # Regenerate API client from backend OpenAPI
yarn typecheck  # TypeScript checking
```

### API Documentation

OpenAPI docs available at `http://localhost:3000/api` when backend is running.
