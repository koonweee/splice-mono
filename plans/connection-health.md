# Detect and repair stalled bank connections

## Status

Implementation and local validation complete; production rollout pending

## Goal

Expose repair actions when a provider stops exposing an existing linked account. Validate reconnects, classify sync errors, and detect silent stalls without treating inactivity as a broken login.

## Current Behavior

Plaid webhooks drive status and attention notifications. Reconnect completion sets OK after fetching accounts, without verifying existing account membership. Home warns after seven days but that warning does not expose repair actions.

## Target Data Shape

Bank links gain nullable connection health plus durable check/lease timestamps. Health records distinguish healthy, delayed, attention and unknown states with provider and import timestamps. Dashboard summaries expose sanitized connection status/health. Existing status values remain compatible.

## Milestones

### 1. Backend health and recovery

- Add additive migration, typed provider diagnostics and cached checks with database claims and lifecycle guards.
- Validate reconnect account membership; classify actionable errors from account, transaction and holdings fetches.
- Check stale connections on demand and all active Plaid connections daily; reuse existing attention notification delivery.

Exit criteria: targeted tests cover missing/empty accounts, benign empty holdings, errors, caching, ownership, concurrent checks, archive/reconnect races and deduplication. Existing sync tests pass.

### 2. UI and API integration

- Regenerate the client; check stale connections after Home/Accounts load, then invalidate affected queries.
- Show delayed/attention details and repair actions; retain reconnect access for healthy links.
- Update real-component workbench examples and regression coverage.

Exit criteria: lint/typecheck, relevant tests, workbench and phone/desktop visual checks pass. Existing loading geometry remains stable.

### 3. Release

- Commit/PR/CI/merge source; publish both reviewed images.
- Pin backend/migration together and frontend in stack-v2, preserving the actual deployed frontend asset graph.
- Validate/push configuration, refresh Stack cache and explicitly deploy only splice-sf.

Exit criteria: healthy production containers and authenticated health check identify SG IBKR as needing attention without changing holdings/balances. Record release hashes and results here.

## Tests

Backend: provider mapping, health transitions, ownership, throttle/lease recovery, stale-vs-broken, lifecycle race, reconnect validation and sync failure propagation; migration up/down on isolated PostgreSQL.
Frontend: stale-load check throttling/invalidation, reconnect/Fix behavior, delayed details and workbench states.

## Validation Commands

- backend: yarn test <targeted suites> --runInBand; yarn lint; yarn typecheck
- frontend: yarn orval; yarn test <targeted suites>; yarn lint; yarn typecheck; yarn workbench:build; yarn build
- stack-v2: .venv/bin/python scripts/validate-apps.py splice; configuration tests; git diff --check

## Overall Exit Criteria

All three hooks and unattended detection work. Empty provider account coverage never clears an issue or erases stored financial data. Repeated probes do not spam notifications. Production shows the SG account needs attention and provides the existing Plaid repair flow.

## Rollback

Restore prior immutable images and redeploy only splice-sf. Keep additive nullable health columns and all application data. No credential rotation, source data deletion or unrelated service changes.

## Validation evidence

- Backend: 20 feature/regression suites passed (286 tests), followed by 121 final health/sync/migration tests; strict typecheck/lint and production build passed.
- Frontend: 107 related/workbench tests passed; strict typecheck, token checks and both production/workbench builds passed. All 130 frontend suites / 993 tests pass after correcting three stale main-branch test harnesses and adding the new hook harnesses.
- Browser: real components checked in Light/Dark at 1440px and OLED at 390px; no horizontal overflow or runtime errors. Phone touch Reconnect is present. Real local bypass login, Accounts rendering, Fix, and cached authenticated health endpoint passed using synthetic data.
- Production rollback pins: backend/migration `51a03c5@sha256:56e37978fb8190801a6b7faad40b5baf5489f72952135f38c548696bb63ef1aa`; frontend `51a03c5@sha256:7b0d7049f42c5b30e9c9d6ccb299b23ea182e6247b9cc2b363c83207b61b7db0`. The new frontend preserves that asset graph.

- Final PostgreSQL health/migration suite: 17 tests pass, including cross-endpoint incident deduplication. Production rollout evidence will be recorded in the owning Stack v2 release plan.
