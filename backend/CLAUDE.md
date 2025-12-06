# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Splice is a NestJS application for managing financial accounts and transactions. It integrates with banking providers (Plaid) to sync account data and track balances.

## Commands

```bash
# Development
yarn start:dev          # Start with hot-reload
docker-compose up       # Start with PostgreSQL (recommended)
docker-compose up --build  # Rebuild after dependency changes

# Testing
yarn test               # Run all tests
yarn test path/to/test.spec.ts  # Run specific test
yarn test:watch         # Watch mode
yarn test:cov           # Coverage report

# Code Quality
yarn lint               # ESLint with auto-fix
yarn format             # Prettier formatting
```

## Architecture

### Module Structure

Each feature module follows a consistent pattern in `src/{module}/`:
- `{module}.entity.ts` - TypeORM entity with `fromDto()` and `toObject()` methods
- `{module}.service.ts` - Business logic extending base CRUD services
- `{module}.controller.ts` - HTTP endpoints with Zod validation
- `{module}.module.ts` - NestJS module definition

### Base Services (`src/common/`)

- **`OwnedCrudService`** - For user-owned entities (Account, BalanceSnapshot, BankLink). All operations are scoped by `userId`.
- **`BaseCrudService`** - For non-owned entities. Standard CRUD without user scoping.

Services must implement `applyUpdate(entity, dto)` to define field update logic.

### Type System (`src/types/`)

- All domain types use Zod schemas for validation
- Pattern: `{Type}Schema`, `Create{Type}DtoSchema`, `Update{Type}DtoSchema`
- Types are inferred with `z.infer<typeof Schema>`
- Controllers use `ZodValidationPipe` for request validation
- Schemas exposed in API must be wrapped with `registerSchema()` for proper OpenAPI naming:

```typescript
import { registerSchema } from '../common/zod-api-response';

export const UserSchema = registerSchema('User', z.object({ ... }));
export const CreateUserDtoSchema = registerSchema('CreateUserDto', z.object({ ... }));
```

### API Documentation (`src/common/zod-api-response.ts`)

Use `@ZodApiResponse` and `@ZodApiBody` decorators to document endpoints in OpenAPI/Swagger. These decorators accept Zod schemas directly, eliminating the need for separate DTO classes.

```typescript
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import { CreateTransactionDtoSchema, TransactionSchema } from '../types/Transaction';

// Request body
@ZodApiBody({ schema: CreateTransactionDtoSchema })

// Single object response
@ZodApiResponse({
  status: 200,
  description: 'Returns the transaction',
  schema: TransactionSchema,
})

// Array response
@ZodApiResponse({
  status: 200,
  description: 'Returns all transactions',
  schema: TransactionSchema,
  isArray: true,
})
```

For error responses without a body, continue using `@ApiResponse`:
```typescript
@ApiResponse({ status: 404, description: 'Transaction not found' })
```

### Entity Pattern

Entities flatten nested domain objects into columns and provide transformation methods:
```typescript
// Entity must implement:
static fromDto(dto, userId?): Entity  // DTO → Entity for persistence
toObject(): DomainType                // Entity → Domain for API responses
```

### Authentication

- JWT-based auth with global `JwtAuthGuard` (all routes protected by default)
- Use `@Public()` decorator to mark unprotected endpoints
- Use `@CurrentUser()` decorator to get authenticated user in controllers

### Testing (`test/`)

- Tests mirror `src/` structure: `test/{module}/{module}.service.spec.ts`
- Mocks in `test/mocks/{module}/`: entity mocks, service mocks, repository mocks
- Controller tests: verify HTTP behavior, mock service dependencies
- Service tests: verify business logic, mock repository

### Bank Link Providers (`src/bank-link/providers/`)

Provider interface pattern for banking integrations:
- `BankLinkProviderInterface` defines the contract
- Implementations (e.g., `PlaidProvider`) registered in `ProviderRegistry`
- Scheduled sync jobs in `bank-link.scheduled.ts`

### Events (`src/events/`)

Uses `@nestjs/event-emitter` for domain events (e.g., `AccountUpdatedEvent`).
