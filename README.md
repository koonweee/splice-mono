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
| Auth | Google OAuth browser login, JWT with HTTP-only cookies, personal access tokens for API/MCP access |

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

#### Money Handling
Amounts stored as integer cents to avoid floating-point precision issues.

#### Scheduled Background Tasks
- **Exchange Rate Sync** - Daily at 6 AM UTC, fetches rates for all currency pairs

---

## Development

### Prerequisites
- Node.js
- Yarn
- Docker (for PostgreSQL)

### Running Locally

Copy `backend/.env.example` and `frontend/.env.example` to local `.env` files before starting the apps.

```bash
# Start PostgreSQL
cd backend && docker-compose up -d

# Start backend (port 3000)
cd backend && yarn start:dev

# Start frontend (port 4000)
cd frontend && yarn dev
```

### Google OAuth Setup

Splice uses Google OAuth for browser sign-in. Password login and password registration are intentionally removed. Existing users sign in with a whitelisted, verified Google account that uses the same email address as their existing Splice account.

Create a Google Cloud OAuth 2.0 Web client and configure:

- Authorized JavaScript origin: `http://localhost:4000`
- Authorized redirect URI: `http://localhost:3000/user/oauth/google/callback`

Set these backend environment variables locally:

```bash
GOOGLE_OAUTH_CLIENT_ID=<google web client id>
GOOGLE_OAUTH_CLIENT_SECRET=<google web client secret>
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/user/oauth/google/callback
GOOGLE_ALLOWED_EMAILS=alice@example.com,bob@example.com
```

`GOOGLE_ALLOWED_EMAILS` is a comma-separated allowlist. Only verified Google accounts whose normalized email appears in that list can sign in or be provisioned. Restart the backend after changing these values.

For staging and production, set `API_DOMAIN` to the public backend origin and `FRONTEND_DOMAIN` to the public frontend origin. Set `GOOGLE_OAUTH_CALLBACK_URL=${API_DOMAIN}/user/oauth/google/callback`, add that exact URL to the Google OAuth client's authorized redirect URIs, and add the frontend origin to authorized JavaScript origins. Store `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_ALLOWED_EMAILS` in the deployment secret manager or environment configuration before deploying the hard cut.

Non-browser API and MCP access uses personal access tokens from the Settings page. Do not use browser session login credentials for API automation.

### Deployment Checklist

- Google OAuth client exists for each deployed environment.
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_CALLBACK_URL`, and `GOOGLE_ALLOWED_EMAILS` are configured.
- `GOOGLE_OAUTH_CALLBACK_URL` exactly matches an authorized redirect URI.
- `FRONTEND_DOMAIN` exactly matches an authorized JavaScript origin and CORS origin.
- Backend and frontend are deployed together for the password-auth hard cut.
- Smoke test Google login, token refresh, logout, and PAT-authenticated API/MCP access.

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
