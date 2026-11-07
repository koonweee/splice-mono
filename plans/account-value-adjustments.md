# Account value adjustments

## Status
Implemented and locally validated. Production delivery follows the Splice Deploy workflow and the Stack v2 image-pinned rollout plan.

## Goal
Allow every account to set expected value (>0%) and expected tax (0–100%).
Value queries use base × value/100 × (1−tax/100), under current assumptions.

## Current Behavior
Effective balances equal current balances; current account and holdings/MCP reads also bypass that helper.

## Target Data Shape
Account metadata: exact decimal strings `expectedValuePercent` (default 100),
`expectedTaxPercent` (default 0). `currentBalance` and snapshots stay base;
`effectiveBalance` is calculated. Current assumptions apply across all history.

## Milestones
### 1. Persistence and valuation
- Add constrained numeric columns and public create/update metadata.
- Apply one exact calculation to current/history/dashboard/MCP and portfolio values.
Exit criteria: defaults preserve values; linked sync preserves settings; snapshots remain base.

### 2. Account editor and examples
- Add the approved inline Details editor beside Notes, with no helper/formula prose.
- Preserve base balance editing and show adjusted/base values when configured.
- Update loading pairs, generated clients, cache invalidation and workbench fixtures.
Exit criteria: add/edit/remove/save/error/masking and responsive states work.

### 3. Validate and deploy
- Run targeted tests, lint/typechecks, token guards, workbench and production builds.
- Inspect actual workbench and local app, create/merge the feature PR and run Deploy.
Exit criteria: required CI passes and production serves the deployed change.

## Tests
### Backend
Exact arithmetic/defaults/sign/rounding/zero tax/100% tax/>100% value;
metadata ownership and persistence, history/FX and MCP values; migration constraints.
### Frontend
Unset/edit/save/remove/cancel/error/masking, base editing, cache invalidation and paired loading.

## Validation Commands
Backend: `yarn test --runInBand`, `yarn lint`, `yarn typecheck`.
Frontend: targeted `yarn test`, `yarn lint`, `yarn typecheck`, `yarn tokens:check`,
`yarn test workbench --maxWorkers=2`, `yarn workbench:build`, `yarn build`.

## Overall Exit Criteria
RSU 100k/50%/30% is 35k across value surfaces; base snapshots stay 100k.
The approved editor works on all accounts. CI and deployment pass.

## Validation evidence
- Backend targeted services/arithmetic: 20 suites / 375 tests, plus focused provider/MCP cases.
- PostgreSQL: 3 suites / 16 tests, including legacy backfill, constraints, raw snapshot preservation and retroactive history.
- Frontend/workbench: 21 suites / 154 tests. Lint, typechecks, token guard, workbench and production builds pass.
- Browser: light/dark/OLED at 320/390/1440px, save/remove, failed-save draft, masking; loading/loaded tab anchors have 0px shift at all three widths.
- Real local API/browser: synthetic 100k RSU saved at 50%/30%; account effective balance, dashboard and history are 35k, snapshot base remains 100k and the manual editor opens at 100k.
- Frontend release retains assets from the verified current production frontend eb0831b digest.
