# Personal Access Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-scoped personal access tokens that let agents call protected API endpoints with `Authorization: Bearer splice_pat_...` while keeping existing JWT and cookie auth working.

**Architecture:** Keep the existing JWT strategy for browser/mobile auth and extend the global auth guard to recognize PAT bearer tokens before falling back to JWT. Store PATs as hashed opaque secrets in a new table, expose create/list/revoke endpoints under `/user/tokens`, and block PATs from managing other PATs in phase one.

**Tech Stack:** NestJS, TypeORM, Zod, Jest, nestjs-pino, Passport JWT

---

## File Map

**Create**

- `src/auth/personal-access-token.entity.ts`
- `src/auth/personal-access-token.service.ts`
- `src/auth/decorators/session-jwt-only.decorator.ts`
- `src/types/PersonalAccessToken.ts`
- `src/migrations/1774188000000-AddPersonalAccessTokens.ts`
- `test/auth/personal-access-token.service.spec.ts`
- `test/auth/jwt-auth.guard.spec.ts`

**Modify**

- `src/auth/auth.module.ts`
- `src/auth/guards/jwt-auth.guard.ts`
- `src/user/user.controller.ts`
- `src/app.module.ts`
- `test/user/user.controller.spec.ts`

**Why these files**

- `src/auth/personal-access-token.entity.ts`: persistence model for hashed PATs and metadata
- `src/auth/personal-access-token.service.ts`: create, list, revoke, validate, and prefix detection logic
- `src/auth/decorators/session-jwt-only.decorator.ts`: route metadata for endpoints that must reject PAT auth
- `src/auth/auth.module.ts`: repository wiring and PAT service export
- `src/auth/guards/jwt-auth.guard.ts`: PAT-or-JWT request authentication path
- `src/types/PersonalAccessToken.ts`: request/response schemas for `/user/tokens`
- `src/user/user.controller.ts`: token management endpoints using `@CurrentUser()`
- `src/app.module.ts`: redact PAT-related fields in structured logs
- `src/migrations/1774188000000-AddPersonalAccessTokens.ts`: schema change for the PAT table and indexes
- `test/auth/personal-access-token.service.spec.ts`: service-level behavior tests
- `test/auth/jwt-auth.guard.spec.ts`: guard branching and PAT restriction tests
- `test/user/user.controller.spec.ts`: controller contract tests for create/list/revoke

### Task 1: Add Personal Access Token Persistence And Service

**Files:**
- Create: `src/auth/personal-access-token.entity.ts`
- Create: `src/auth/personal-access-token.service.ts`
- Modify: `src/auth/auth.module.ts`
- Test: `test/auth/personal-access-token.service.spec.ts`

- [ ] **Step 1: Write the failing service tests**

Add focused tests for:
- creating a PAT stores only a hash and returns the raw token once
- listing tokens excludes `tokenHash` and raw token
- revoking a token marks it unusable
- validating a PAT returns `{ userId, email }`
- expired or revoked PATs return `null`

Example assertions:

```ts
expect(mockRepository.save).toHaveBeenCalledWith(
  expect.objectContaining({
    name: 'codex-local',
    userId: 'user-123',
    tokenHash: expect.any(String),
  }),
);
expect(result.token).toMatch(/^splice_pat_/);
expect(result.tokenHash).toBeUndefined();
expect(result.tokenPreview).toMatch(/^splice_pat_/);
```

- [ ] **Step 2: Run the targeted test to confirm it fails**

Run: `yarn test test/auth/personal-access-token.service.spec.ts --runInBand`

Expected: FAIL because `PersonalAccessTokenService` and `PersonalAccessTokenEntity` do not exist yet.

- [ ] **Step 3: Implement the entity and service**

Create `src/auth/personal-access-token.entity.ts` with fields matching the spec:

```ts
@Entity('personal_access_token')
export class PersonalAccessTokenEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'varchar' }) name: string;
  @Column({ type: 'varchar', unique: true }) tokenHash: string;
  @Column({ type: 'varchar' }) prefix: string;
  @Column({ type: 'timestamp', nullable: true }) lastUsedAt: Date | null;
  @Column({ type: 'timestamp', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'timestamp', nullable: true }) revokedAt: Date | null;
}
```

Create `src/auth/personal-access-token.service.ts` with methods along these lines:

```ts
createToken(user: JwtUser, dto: CreatePersonalAccessTokenDto)
listTokens(userId: string)
revokeToken(userId: string, tokenId: string)
isPersonalAccessToken(rawToken: string): boolean
validateToken(rawToken: string): Promise<JwtUser | null>
```

Implementation notes:
- use `crypto.randomBytes(...)` for the raw token
- hash with SHA-256 before persistence
- derive `tokenPreview` from the prefix plus a short suffix
- inject both PAT and user repositories so validation can return `{ userId, email }`
- update `lastUsedAt` during successful validation

Update `src/auth/auth.module.ts` to register `PersonalAccessTokenEntity` and `UserEntity` in `TypeOrmModule.forFeature(...)`, provide `PersonalAccessTokenService`, and export it.

- [ ] **Step 4: Re-run the targeted service test**

Run: `yarn test test/auth/personal-access-token.service.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 5: Commit the persistence/service slice**

```bash
git add src/auth/personal-access-token.entity.ts src/auth/personal-access-token.service.ts src/auth/auth.module.ts test/auth/personal-access-token.service.spec.ts
git commit -m "feat: add personal access token service"
```

### Task 2: Extend The Global Auth Guard For PATs

**Files:**
- Create: `src/auth/decorators/session-jwt-only.decorator.ts`
- Modify: `src/auth/guards/jwt-auth.guard.ts`
- Test: `test/auth/jwt-auth.guard.spec.ts`

- [ ] **Step 1: Write the failing guard tests**

Cover these cases:
- public routes still bypass auth
- PAT bearer token validates through `PersonalAccessTokenService`
- request user is attached for valid PAT auth
- routes marked `@SessionJwtOnly()` reject PATs
- non-PAT requests still fall back to the existing Passport JWT guard path

Example expectation:

```ts
await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
expect(mockPatService.validateToken).toHaveBeenCalledWith(rawPat);
expect(request.user).toEqual({ userId: 'user-123', email: 'user@example.com' });
```

- [ ] **Step 2: Run the guard test to confirm it fails**

Run: `yarn test test/auth/jwt-auth.guard.spec.ts --runInBand`

Expected: FAIL because the PAT branch and route metadata do not exist yet.

- [ ] **Step 3: Implement the decorator and guard changes**

Create `src/auth/decorators/session-jwt-only.decorator.ts`:

```ts
export const SESSION_JWT_ONLY_KEY = 'sessionJwtOnly';
export const SessionJwtOnly = () => SetMetadata(SESSION_JWT_ONLY_KEY, true);
```

Update `src/auth/guards/jwt-auth.guard.ts` to:
- keep the existing `@Public()` bypass
- inspect the `Authorization` header before calling `super.canActivate(...)`
- if the bearer token matches the PAT prefix, validate it with `PersonalAccessTokenService`
- attach `request.user` directly for successful PAT auth
- reject PAT auth on routes marked `@SessionJwtOnly()`
- otherwise defer to Passport JWT auth for cookie/header JWTs

Implementation sketch:

```ts
const rawBearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
if (rawBearer && this.patService.isPersonalAccessToken(rawBearer)) {
  if (sessionJwtOnly) throw new UnauthorizedException();
  const user = await this.patService.validateToken(rawBearer);
  if (!user) throw new UnauthorizedException();
  request.user = user;
  return true;
}
return super.canActivate(context);
```

- [ ] **Step 4: Re-run the guard test**

Run: `yarn test test/auth/jwt-auth.guard.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 5: Commit the auth-guard slice**

```bash
git add src/auth/decorators/session-jwt-only.decorator.ts src/auth/guards/jwt-auth.guard.ts test/auth/jwt-auth.guard.spec.ts
git commit -m "feat: allow personal access token auth"
```

### Task 3: Add `/user/tokens` Schemas And Controller Endpoints

**Files:**
- Create: `src/types/PersonalAccessToken.ts`
- Modify: `src/user/user.controller.ts`
- Modify: `test/user/user.controller.spec.ts`

- [ ] **Step 1: Write the failing controller tests**

Add tests for:
- `createToken` returns the one-time token payload
- `listTokens` returns sanitized token metadata
- `revokeToken` delegates to the PAT service and the controller method resolves `void`
- PAT-management endpoints call the PAT service, not `AuthService`

Example test setup:

```ts
const mockPatService = {
  createToken: jest.fn().mockResolvedValue(mockCreateResponse),
  listTokens: jest.fn().mockResolvedValue([mockListItem]),
  revokeToken: jest.fn().mockResolvedValue(undefined),
};
```

- [ ] **Step 2: Run the controller test to confirm it fails**

Run: `yarn test test/user/user.controller.spec.ts --runInBand`

Expected: FAIL because the controller does not inject `PersonalAccessTokenService` or expose `/user/tokens` methods yet.

- [ ] **Step 3: Add Zod schemas and controller methods**

Create `src/types/PersonalAccessToken.ts` with:
- `CreatePersonalAccessTokenDtoSchema`
- `PersonalAccessTokenSchema`
- `CreatePersonalAccessTokenResponseSchema`

Suggested request/response shape:

```ts
export const CreatePersonalAccessTokenDtoSchema = registerSchema(
  'CreatePersonalAccessTokenDto',
  z.object({
    name: z.string().min(1).max(100),
    expiresAt: z.string().datetime().optional(),
  }),
);
```

Update `src/user/user.controller.ts` to:
- inject `PersonalAccessTokenService`
- add `@SessionJwtOnly()` to all `/user/tokens` endpoints
- expose `POST /user/tokens`, `GET /user/tokens`, `DELETE /user/tokens/:id`
- add `@HttpCode(204)` to the delete endpoint and return `Promise<void>`
- use `@ZodApiBody` and `@ZodApiResponse`
- keep all responses free of `tokenHash`

Implementation sketch:

```ts
@Post('tokens')
@SessionJwtOnly()
async createToken(
  @CurrentUser() currentUser: JwtUser,
  @Body(new ZodValidationPipe(CreatePersonalAccessTokenDtoSchema)) dto: CreatePersonalAccessTokenDto,
) {
  return this.personalAccessTokenService.createToken(currentUser, dto);
}
```

- [ ] **Step 4: Re-run the controller test**

Run: `yarn test test/user/user.controller.spec.ts --runInBand`

Expected: PASS

- [ ] **Step 5: Commit the controller/API slice**

```bash
git add src/types/PersonalAccessToken.ts src/user/user.controller.ts test/user/user.controller.spec.ts
git commit -m "feat: add personal access token management endpoints"
```

### Task 4: Add Migration, Logging Redaction, And Final Verification

**Files:**
- Create: `src/migrations/1774188000000-AddPersonalAccessTokens.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 1: Write the migration and redaction changes**

Create a manual migration that:
- creates `personal_access_token`
- adds a foreign key to `user_entity(id)` with `ON DELETE CASCADE`
- adds a unique index on `tokenHash`
- adds an index on `userId`

Migration sketch:

```ts
await queryRunner.query(
  `CREATE TABLE "personal_access_token" (..., "tokenHash" character varying NOT NULL, ...)`,
);
await queryRunner.query(
  `CREATE UNIQUE INDEX "IDX_personal_access_token_hash" ON "personal_access_token" ("tokenHash")`,
);
await queryRunner.query(
  `CREATE INDEX "IDX_personal_access_token_user_id" ON "personal_access_token" ("userId")`,
);
```

Update `src/app.module.ts` redaction paths to cover PAT-related fields without weakening existing auth logs. Add at minimum:

```ts
'req.body.token',
'req.body.personalAccessToken',
'*.tokenHash',
'*.rawToken',
```

- [ ] **Step 2: Run targeted verification**

Run:

```bash
yarn test test/auth/personal-access-token.service.spec.ts --runInBand
yarn test test/auth/jwt-auth.guard.spec.ts --runInBand
yarn test test/user/user.controller.spec.ts --runInBand
yarn typecheck
yarn lint
```

Expected:
- all targeted Jest suites PASS
- `yarn typecheck` exits `0`
- `yarn lint` exits `0`

- [ ] **Step 3: Verify the migration in the local dev environment**

If Docker dev services are already running:

```bash
yarn docker:migration:run
```

Expected: output includes that `AddPersonalAccessTokens...` executed successfully.

If Docker is not running, start it first with `yarn docker:up` in a separate step, then rerun the migration command.

- [ ] **Step 4: Smoke-check the API contract**

With the server running, verify:
- Swagger shows the new `/user/tokens` endpoints
- a normal JWT-authenticated request can create a PAT
- a PAT can call an existing protected endpoint such as `GET /user/me`
- the same PAT is rejected from `/user/tokens`

Suggested manual curl sequence:

```bash
curl -X POST http://localhost:3000/user/tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"codex-local"}'
```

Then:

```bash
curl http://localhost:3000/user/me \
  -H "Authorization: Bearer splice_pat_..."
```

- [ ] **Step 5: Commit the migration and verification slice**

```bash
git add src/migrations/1774188000000-AddPersonalAccessTokens.ts src/app.module.ts
git commit -m "feat: persist and secure personal access tokens"
```

## Completion Criteria

- PATs are created, listed, and revoked through `/user/tokens`
- PATs authenticate ordinary protected endpoints through the global auth guard
- JWT and cookie auth still work unchanged
- PATs cannot manage PATs
- Raw PAT values are only returned once and are never persisted in plaintext
- Targeted tests, typecheck, lint, and migration verification all pass
