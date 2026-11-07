# Home discounted-account visibility

## Status
Implementation validated; release pending.

## Goal
Add a stock-chart icon immediately beside the eye using its existing ActionIcon treatment. Toggle accounts with expectedValuePercent < 100 across Home rows, totals, period comparisons and the complete history. Keep default Home row presentation; deploy both changes.

## Current Behavior
The default-row follow-up is PR #325. Home summary and series use compact independent queries; masking uses a cookie-backed presentation context. Cached Home has its own validated saved data.

## Target Data Shape
Optional hideDiscountedAccounts boolean on dashboard summary/series queries and responses, with a local presentation cookie. No database change. Existing API calls and saved snapshots default to including all accounts.

## Milestones
### 1. Scoped calculation and header
Filter owned accounts before snapshots/FX reads for both projections and all-history start dates. Reuse the eye's Mantine ActionIcon styles and accessible pressed/action labels.
Exit: strictly <100 is hidden, including linked/manual accounts; 100, above100 and tax-only adjustments remain.

### 2. Consistent Home delivery
Separate query caches by filter scope, publish both responses together on scope changes, propagate SSR/cached-launch state and keep default account rows.
Exit: delayed/reversed responses never mix scopes; refresh restores the chosen view; saved snapshots cannot bind one scope to another.

### 3. Validate and release
Regenerate clients, run service/PostgreSQL/component/cache tests and lint/typechecks, review workbench and real browser. Merge PR and Deploy workflow, pin matching runtime images in Stack v2, pull/deploy and verify.
Exit: both changes are live with healthy services and old frontend asset compatibility.

## Tests
Backend: query parsing, exact threshold and totals/comparison/full history including all-hidden and missing FX exclusions.
Frontend: header states, scoped cache/transition behavior, cookie/SSR/offline snapshots and saved-value controls.

## Validation Commands
Backend: targeted yarn test, yarn lint, yarn typecheck.
Frontend: targeted yarn test, yarn lint, yarn typecheck, yarn tokens:check, yarn workbench:build, yarn build; yarn orval against local API.

## Overall Exit Criteria
The header toggle changes all Home value surfaces together. Effective calculations/settings/snapshots remain unchanged. CI and production rollout pass.

## Validation Evidence
- Backend: 10 focused suites / 104 tests passed against isolated PostgreSQL, including exact threshold, all-hidden, all-history, and excluded FX.
- Frontend: 35 affected suites / 272 tests passed; 20 final focused checks also passed, including saved-view, cleared-cache and workbench isolation regressions.
- Backend and frontend lint/typechecks passed; production and workbench builds passed.
- Real authenticated local Home: saved RSU base $100k, effective $35k plus $100k checking changes total $135k to $100k. Filtered daily comparison is $10k and full history is $90k to $100k. Toggle/reload/SSR agree; default account row presentation and no browser errors.
- Inspected actual Home phone/desktop and workbench Light 390px, Dark 1440px, OLED 320px captures; no horizontal overflow. Workbench has isolated toggle state with no device preference writes.

Final responsive check: every header button is fully within the header at 320, 375, 390, 744, 1024 and 1440px. Home uses a shared 104px header/content offset at 384px and below and keeps the standard 60px header above that; failure/idle status slots retain their geometry.
