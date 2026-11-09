# Preserve account identity after Plaid reconnect

## Status

Implementation complete; validation and production rollout in progress.

## Goal

Restore an existing Splice account after Plaid rotates its provider account ID, preserving the Splice UUID and its financial history. Use the account explicitly selected for repair rather than metadata guesses.

## Current Behavior

Fix launches a bank-link update without identifying its originating Splice account. Both reported sessions succeeded in Plaid but account import rejected the old provider ID's disappearance. Plaid documents this ID rotation after permission restoration: https://plaid.com/docs/errors/invalid-input/#invalid_account_id. Names and masks are not unique identifiers. persistent_account_id is limited to certain depository institutions and is unavailable for this brokerage.

## Target Data Shape

The linking request gains optional reconnectAccountId. The server validates the user/account/connection relationship and stores the selected Splice UUID and its current provider ID in the existing private session context. No migration or financial schema change is required.

## Milestones

### 1. Explicit, conservative reconnect reconciliation

- Carry the target from Fix through the persisted session and verified completion webhook.
- Match unchanged provider IDs first. Replace the selected missing ID only when every sibling ID is accounted for and exactly one previously unknown ID remains within that connection.
- Retain the original account UUID, history and user settings. Commit the provider-ID binding and bank-link ID cache atomically under the existing lifecycle lock.
- Reject ambiguous, archived and stale targets. Ordinary background imports and health checks do not guess replacements. Legacy sessions can infer a target only on a single-account connection.

Exit criteria: meaningful ownership, ambiguity, idempotency, concurrent reconnect, rollback and historical-preservation tests pass. No name, mask, balance, institution-specific parsing or scoring is used for identity decisions.

### 2. Release and recovery

- Pass required lint/type/build and API regeneration checks; merge source and complete protected promotion.
- Publish immutable images, preserve the actual current frontend asset graph, update reviewed Stack pins, and deploy only splice-sf.
- Resume the already authenticated single-account repair using the deployed implementation; verify the same Splice UUID, retained historical records, current provider ID and healthy connection. Retain previous immutable pins for code rollback.

Exit criteria: source CI/promotion and production acceptance pass; exact release provenance and acceptance are recorded in the owning Stack v2 release record.

## Tests

Backend: 231 bank-link tests including real PostgreSQL transaction rollback, concurrent reconnects, session context ownership/roundtrip, unchanged IDs, legacy single-account sessions, rejected ambiguous candidates, preserved UUID/snapshot/settings and ordinary sync refusing ID replacement.
Frontend: Fix forwards the stable account UUID with its connection; generated linking request remains compatible with older callers. Existing workbench states cover this request-only change.

## Validation Commands

- backend: yarn test test/bank-link --runInBand; yarn lint; yarn typecheck; yarn build
- frontend: yarn orval; yarn test src/components/accounts/AccountRow.test.tsx; yarn lint; yarn typecheck
- release: source CI/protected promotion, Stack app validator, guarded pull/deploy, production acceptance

## Overall Exit Criteria

The reported repair restores the existing account without creating a duplicate or rewriting historical rows. Multi-account ambiguity fails closed. The shared bank-link health state clears only after current account access is verified.
