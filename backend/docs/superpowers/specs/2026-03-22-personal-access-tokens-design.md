# Personal Access Tokens Design

## Summary

Add user-scoped personal access tokens (PATs) so agents and other machine clients can call the existing backend directly with `Authorization: Bearer <token>`.

This phase is intentionally narrow:

- Tokens act as a specific user
- Tokens have full access to the same API surface as that user
- Tokens are opaque random secrets, not JWTs
- Tokens are long-lived machine credentials, separate from login sessions
- Token creation is done through the authenticated user API

## Goals

- Let a user create a machine-readable token for direct API access
- Reuse the current authenticated controller surface without rewriting controllers
- Support revocation and basic auditability
- Avoid exposing raw tokens after creation

## Non-Goals

- Fine-grained scopes or per-endpoint permissions
- Third-party OAuth or app-level integrations
- Token exchange for short-lived access tokens
- UI work beyond the API surface and OpenAPI documentation

## Recommended Approach

Use opaque personal access tokens stored as hashes in the database.

Why this approach:

- Revocation is simple and immediate
- The raw token only needs to be shown once
- Audit fields such as `lastUsedAt` are easy to support
- It fits the current backend better than introducing another JWT lifecycle

Alternatives considered:

- Long-lived JWTs: simpler validation, weaker revocation story
- API key to short-lived JWT exchange: stronger model, unnecessary complexity for this rollout

## Data Model

Add a new `personal_access_tokens` table and corresponding TypeORM entity.

Fields:

- `id`: UUID primary key
- `userId`: foreign key to `user.id`
- `name`: user-provided display name
- `tokenHash`: SHA-256 hash of the raw PAT
- `prefix`: short identifier derived from the raw token for support and listing
- `lastUsedAt`: nullable timestamp
- `expiresAt`: nullable timestamp
- `revokedAt`: nullable timestamp
- `createdAt`: timestamp
- `updatedAt`: timestamp

Indexes:

- Unique index on `tokenHash`
- Index on `userId`
- Optional index on `(userId, revokedAt)` if token listing grows

Storage rules:

- Only store the hash, never the raw token
- Keep a short non-secret prefix for identifying tokens in list responses
- Use a high-entropy random token value generated server-side

Token format:

- Prefix raw token with a stable marker such as `splice_pat_`
- Append a cryptographically random secret
- Example shape: `splice_pat_<random>`

## Authentication Flow

The backend already supports bearer tokens and cookies through the global auth guard.

Phase-one behavior:

1. Read bearer token from the existing authorization-header path
2. If the bearer token starts with the PAT prefix, treat it as a personal access token
3. Hash the token and look up the PAT record
4. Reject the request if the PAT does not exist, is revoked, or is expired
5. Load the owning user and attach the same request user shape used today: `{ userId, email }`
6. Update `lastUsedAt`
7. If the bearer token does not match the PAT prefix, fall back to the current JWT strategy

This preserves controller behavior because protected endpoints already rely on `@CurrentUser()` and the current request user shape.

## API Surface

Add a small PAT management API under `/user/tokens`.

### `POST /user/tokens`

Create a token for the authenticated user.

Request body:

- `name`: required string
- `expiresAt`: optional ISO timestamp or omitted

Response body:

- `id`
- `name`
- `token`: raw secret, returned once only
- `tokenPreview`: short display-safe preview
- `expiresAt`
- `createdAt`

Notes:

- This endpoint should require a normal logged-in user session or JWT, not a PAT
- That avoids self-replicating machine credentials in phase one

### `GET /user/tokens`

List the current user's tokens without exposing raw secrets.

Response items:

- `id`
- `name`
- `tokenPreview`
- `lastUsedAt`
- `expiresAt`
- `revokedAt`
- `createdAt`

### `DELETE /user/tokens/:id`

Revoke one token owned by the current user.

Behavior:

- Mark `revokedAt`
- Return `204` on success
- Return `404` if the token is not owned by the user or does not exist

## Authorization Rules

- PATs are user-scoped and inherit full access to the user's existing API permissions
- No scopes are introduced in this phase
- PATs may be used for ordinary protected API endpoints
- PATs may not be used to create more PATs in this phase
- PAT list and revoke endpoints should stay user-owned and scoped by authenticated user ID

## Error Handling

PAT authentication failures return `401 Unauthorized`.

Do not reveal whether a rejected token was:

- malformed
- unknown
- revoked
- expired

Use one generic authentication failure path.

Token management endpoints should return:

- `400` for invalid request payloads
- `401` for unauthenticated requests
- `404` when a token ID is not found for the authenticated user

## Logging And Security

Extend the existing structured log redaction to cover PAT-related data.

Redact at minimum:

- authorization headers
- raw PAT values in request bodies or service logs
- response fields containing the newly created token

Security rules:

- Show the raw PAT only once at creation time
- Never log the raw PAT
- Never return the raw PAT from list endpoints
- Use constant-time comparison only if comparing raw values in memory; database lookup should operate on the hash
- Use cryptographically secure random token generation

## OpenAPI And Developer Experience

Document the PAT management endpoints in Swagger.

Clarify in endpoint descriptions that:

- PATs are sent as bearer tokens
- PATs are intended for machine clients
- The raw token is only returned once

No separate auth scheme is required in OpenAPI because bearer auth already exists.

## Implementation Shape

Keep the change localized to the existing auth and user modules.

Expected additions:

- PAT entity and migration
- PAT service for create, list, revoke, and validate
- Auth strategy or guard update that supports PAT plus existing JWT fallback
- User controller endpoints for PAT management
- Zod request and response schemas for the new endpoints

Recommended placement:

- Auth validation logic stays under `src/auth/`
- PAT persistence can live under `src/auth/` or a small dedicated module if it remains focused
- User-facing management endpoints stay under `src/user/`

## Testing Strategy

Add tests for:

- token creation stores only a hash and returns the raw token once
- token listing omits the raw token
- token revocation prevents future use
- expired token rejection
- PAT authentication success on an existing protected endpoint
- fallback to JWT authentication still works
- PAT creation endpoint rejects PAT-authenticated callers

Verification should also confirm:

- migration creates the expected table and indexes
- logger redaction covers PAT-related fields

## Rollout Notes

Operational expectations:

- Existing browser cookie auth remains unchanged
- Existing mobile or CLI JWT auth remains unchanged
- Agents can authenticate by sending a PAT in the bearer header

Example request:

```http
Authorization: Bearer splice_pat_...
```

## Open Questions Deferred

These are intentionally deferred from phase one:

- read-only versus read-write scopes
- mandatory expirations
- per-token IP restrictions
- token usage history beyond `lastUsedAt`
- UI for token management

Deferring them keeps the implementation focused and appropriate for a single planning and delivery cycle.
