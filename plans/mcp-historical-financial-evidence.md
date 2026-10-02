# MCP Historical Financial Evidence

## Status

Done — implemented, validated and deployed 2026-09-14. Available authenticated production smoke passes; direct production calls of the three new tool names remain unverified because the connected catalog has not refreshed.

## Goal

Expose read-only recorded balance changes and bounded historical evidence so clients can reconcile net worth and distinguish observations from assumed explanations. Do not encode a host conclusion, mutate finances, or add MCP Apps. Preserve existing clients through additive fields and tools.

## Current Behavior

- `BalanceQueryService.loadBalanceProjection` reads owned accounts and snapshots under repeatable read, selects the latest snapshot on or before each date, uses zero before the first snapshot, and converts with exact minor-unit arithmetic. Boundary-only projection already avoids daily expansion.
- `balance-projection.ts` subtracts credit/loan liabilities from net worth regardless of stored positive debt signs. FX resolution preserves actual `rateDate` and DB/forward/backward-fill source. Missing nonzero FX fails rather than mixing currencies.
- `BalanceHistorySurfaceService` streams daily chart values and closing account summaries. Its legacy `syncedAt` is latest sync, not historical valuation. Selected snapshot provenance and opening account balances are absent. Same-currency conversion is omitted.
- `HoldingsQueryService` selects provider-appropriate headers (including empty snapshots) under repeatable read, with exact-date or unbounded latest selection. Security identifiers and price timestamps exist in stored security/holding records but are omitted from MCP.
- `MarketPriceProvider` and `YahooFinanceMarketPriceProvider` provide current quotes only. Existing Yahoo client can be extended for bounded daily chart evidence; only stored Yahoo provider identities are safe automatic mappings. Plaid identifiers must remain explicitly unmapped unless an exact mapping exists.
- MCP tools are declared in `mcp.definition.ts`, schemas in `mcp-schemas.ts`, and guide in `mcp.extensions.ts`. Runtime applies OAuth read scope and ownership. Production promotion is `.github/workflows/deploy.yml` after normal main PR/CI gates; SF listener operation is documented in `docs/mcp.md` and stack repository.
- Existing expansion plan is complete; this plan extends its historical semantics without rewriting historical evidence.

## Target Data Shape

- Add explicit reporting balances and snapshot provenance to shared balance results without removing native/legacy fields.
- Add `get_balance_change_attribution(startDate,endDate,accountIds?)`: reporting opening/closing net worth, signed per-account contributions ranked by absolute magnitude, native endpoint balances, snapshot/FX evidence, totals and exact zero reconciliation residual. Label as recorded changes, with missing snapshots explicit.
- Add opening/closing endpoint evidence to history; preserve legacy sync fields but add historical snapshot and latest sync separately.
- Extend holdings with `dateMode=exact|on_or_before` (exact remains default), lower bound for bounded carry-forward, selected header provenance and empty/missing distinction. Add bounded available-date discovery with truncation metadata.
- Add `get_historical_valuation_evidence(securityIds,startDate,endDate,reportingCurrency)`: bounded prices, currency and FX evidence, actual dates, source, mapping status, missing/error statuses and price-basis/corporate-action limits. No computed P&L or observed-chart substitution. Reuse Yahoo provider; no proxy inference.

## Milestones

### 1. Balance provenance and attribution

Implementation tasks:

- Extend `types/BalanceQuery.ts`, `balance-projection.ts`, and `BalanceQueryService.buildAccountBalanceResult` with native/reporting currency consistency and selected snapshot ID/date/type/record update timestamps plus carried-forward/missing flags.
- Build attribution from the existing boundary-only projection, sharing liability sign and exact totals. Expose endpoint evidence in history and register typed read-only tool.

Exit criteria:

- Synthetic tests prove same-currency fields, FX/native changes, liabilities, past-only carry-forward, zero-before-first with missing evidence, and exact reconciliation. Legacy fields and chart values remain valid.

### 2. Holdings coverage and historical evidence

Implementation tasks:

- Extend shared holdings header selection with explicit exact versus on-or-before semantics and lower date bound; expose selected header metadata and stored identifiers/price dates without implying mutable security metadata was historical.
- Add bounded owned/provider-aware available-date discovery, including actual zero-holding headers.
- Extend Yahoo provider with bounded daily prices using installed client API; historical evidence only automatically maps Yahoo identities. Read stored position prices for other securities with explicit institution price basis; report unsupported/missing mappings and provider errors separately.
- Resolve existing FX evidence in bounded batches, retain identity and actual fallback dates, and report missing coverage without fabricated quotes.

Exit criteria:

- Tests cover sparse/empty/missing holdings, date bounds, ownership, unsupported mapping, missing quotes, provider failure, FX alignment and backwards compatibility. Evidence remains separate from chart values.

### 3. Contract, guide and synthetic evaluation

Implementation tasks:

- Update MCP input/output schemas, tool descriptions, capability names, and `MCP_GUIDE`/`docs/mcp.md` for effective current balance semantics, snapshot versus sync dates, fill sources, date modes, limits, missing versus errors and evidence limitations.
- Add a synthetic example where exact reconciliation does not establish market/spending causation, and changing native debt disproves an FX-only debt explanation.
- Run relevant unit/integration/transport checks, backend lint/typecheck/build and applicable CI checks. No UI changes require browser validation.

Exit criteria:

- New reads have read scope/annotations, validation and JSON-equivalent fallback; prior inputs remain usable. No private records or conversations are tracked.

### 4. Review, deploy and callback

Implementation tasks:

- Review final diff; commit/push a `codex/` branch, create main PR, satisfy required CI/review gates, merge and dispatch documented Deploy workflow. Every gh command uses escalation.
- Inspect stack instructions before live operations; confirm protected deployment revision and deployed backend revision/image. Redeploy only required Splice services through authorized documented mechanism if promotion does not deploy automatically.
- Perform read-only live MCP discovery/contract and bounded evidence smoke with process-local credentials, logging only sanitized assertions/counts. No finance writes or messaging.
- Record deployment/test evidence here and in plan index; send callback to parent task `01a0a170-375b-75a2-9f19-4525aeab34f2` before marking goal complete.

Exit criteria:

- Required CI and production promotion pass, deployed revision is confirmed, available authorized read-only MCP smoke succeeds, exact smoke coverage/limitations reported to parent and callback delivered. Concrete provider/auth/review gaps must be reported if unavailable; independent scope is completed.

## Tests

### Backend

Existing balance projection/query/history and MCP runtime/service/read tests plus focused historical evidence and holdings coverage tests using synthetic fixtures. PostgreSQL integration where query selection needs real database evidence. Validate read scope, cross-owner access, bounds, same-currency and missing/error distinctions.

### Frontend

No UI change. Shared REST balance schemas are additive; regenerate generated API contracts if exposed OpenAPI changes require them.

## Validation Commands

```bash
cd backend && yarn test --runInBand test/balance-query test/mcp test/investment test/market-price
cd backend && yarn lint
cd backend && yarn typecheck
cd backend && yarn build
```

Run required GitHub CI and Deploy workflow, then sanitized read-only live smoke.

## Overall Exit Criteria

All six requested scope areas implemented and verified with additive compatibility; exact chart reconciliation is available without causal assertions; actual snapshot/price/FX coverage and failures are visible; deployment confirmed; parent callback sent. No private financial records, infrastructure secrets, finance mutations, or downstream Kirbot edits.

## Evidence

- Initial worktree clean at `09b0094`. Worktree dependency links reuse the existing local checkout; no dependency or lockfile changes.
- Milestones 1–3 implemented. Current account and raw balance snapshot reads also expose explicit reporting amounts/FX coverage; shared REST balance types regenerated through the existing database-free OpenAPI exporter and Orval. Unchanged generated endpoint ordering churn was discarded.
- Synthetic unit/SDK contract tests: 65 passed across five focused suites. Authenticated HTTP + evidence/model/provider suite: 83 passed across six suites. Broader relevant run: 326 passed; only loopback-listener sandbox failures occurred, and those two suites subsequently passed outside sandbox (26 tests). Added final HTTP evidence case also passed.
- PostgreSQL synthetic checks: 19 passed across holdings, balance consistency and MCP repeatable-read suites, including historical institution prices/identity FX, sparse bounds, empty portfolios and cross-owner rejection. Dedicated local benchmark database only; isolated test schemas cleaned by suites.
- Backend lint/typecheck/build passed. Frontend lint/typecheck passed; 25 existing frontend warnings, no errors. No UI changes or browser validation.
- Main ruleset requires Backend Lint, Backend Typecheck, Detect Changes, Frontend Typecheck; no required PR review rule. Protected rollback deploy revision `47db6255455176d4c286858e32b4fe792c697f9f`; prior backend build 0.0.141 and frontend 0.0.138, built from `47db625`. Stack source revision `8e304e0182977dd5ac7068fe731f759d7c1bac96`; SF running stack metadata deployed `f6db4cb` before rollout.
- Parent confirmed there is no standalone authenticated HTTP MCP helper/token. Use the authorized connected tools for available live checks; direct live calls of new tool names must remain explicitly unverified if the connector catalog cannot refresh. No Kirbot OAuth credential extraction/copying.

- Pre-rollout SF backend image ID/digest: `sha256:0bf6c515e838b71e4c854fa154c0c4dda8c43656b08143b32d17571895b2e986`; frontend: `sha256:c062107d8a50f058f83c4413ec819dfdd96c4cd5c994e14a0c888156d498e806`. Read-only ListStackServices confirmed both healthy before rollout.
- Main PR: [#303](https://github.com/koonweee/splice-mono/pull/303); initial implementation commit `9851184`. No finance mutation performed.

- Final full relevant suite outside sandbox, with the isolated benchmark DB: 31 suites / 377 tests passed. Public Yahoo historical capability smoke returned 4 in-range daily quotes with USD currency and exchange timezone. Final review additionally rejects mixed-case unofficial price units as FX inputs rather than silently uppercasing GBp into GBP.

- Final implementation head `c1674a922317ce5d9109273c31258300f1733fae`: backend build and 46 final MCP contract/evidence tests passed after the currency-unit review fix. [CI run 34892117327](https://github.com/koonweee/splice-mono/actions/runs/34892117327) passed all jobs, including backend/frontend lint/typecheck, workbench and PWA lifecycle; GitGuardian passed.
- Release gate: the exact-head protected-main merge was rejected twice by automatic approval review. The first reason was missing recognized authorization for this high-impact mutation. A read-only check of the parent task verified the user's explicit request to implement and deploy and the handoff's PR/workflow scope, but the retry was rejected because that evidence came through tool output. No merge, workflow dispatch, build execution or infrastructure mutation followed the rejection. A direct trusted user approval is required to continue merging PR #303 and deploying this Splice release.
- Authenticated production baseline through existing connected reads succeeds for bounded balance history, two raw snapshot records and latest holdings. The deployed baseline does not contain the new endpoint/reporting/header-ID fields. This is pre-release evidence only. New-name production calls and post-rollout semantics are unverified; the connector exposes the old tool catalog and no standalone authorized HTTP credential helper is available.
- Direct user approval subsequently received. PR #303 merged through normal protection at `08533305e031461adddb475fdda330047493b2a8`. [Deploy workflow 34893177647](https://github.com/koonweee/splice-mono/actions/runs/34893177647) created [protected deploy PR #304](https://github.com/koonweee/splice-mono/pull/304) and dispatched [comparison CI 34893194659](https://github.com/koonweee/splice-mono/actions/runs/34893194659).
- Refreshed infrastructure source-of-truth remote `fa6cc36` has no changes to Splice resources/compose from SF's deployed `f6db4cb`. Pre-rollout API `/health`, frontend, MCP `/healthz`, protected-resource metadata return 200; unauthenticated MCP returns 401 with Bearer challenge.
- Final PR-head [CI 34892942603](https://github.com/koonweee/splice-mono/actions/runs/34892942603) and protected comparison CI passed all jobs. Deploy workflow succeeded; PR #304 merged at protected deploy revision `01447f43c1aa72737689125549f067f8144a3df2`. Komodo automatically started both Splice image builds after promotion; no duplicate build request was issued.
- Backend build `0.0.142` and frontend build `0.0.139` both succeeded from `01447f4`. Only SF backend was rolled out: Komodo confirmed the `DeployStackService` update is `Complete`, `success=true`, and the SF backend is healthy on a new image. The frontend remains healthy on its prior image (only generated TypeScript changed). No Splice configuration diff, VPS/SG rollout, migration or financial mutation. Infrastructure update/container identifiers are kept out of these release notes.
- Post-rollout public health and metadata checks pass (API/frontend/MCP 200; unauthenticated MCP 401 with Bearer challenge). Authenticated existing-tool smoke passes all 16 assertions: history endpoints reconcile signed changes exactly across 35 accounts including liabilities; closing total matches history; ranking, reporting amounts, same-currency identity FX, past-only selected snapshots, coverage and actual FX dates are explicit; two raw snapshots include reporting/FX/update evidence; 20 latest holdings across seven headers expose snapshot and price/security metadata; current account reporting/date basis is explicit. An exact holdings read passes six additional assertions with 17 rows, five recorded headers and two missing headers, no carry-forward or other-date positions. Only sanitized checks/counts are recorded.
- Production verification limitation: the native connector still exposes 33 old tool names, so direct new-name calls and new holdings `on_or_before` inputs cannot be exercised through it. Their authenticated HTTP/SDK/schema/bounds/ownership behavior is covered locally, and the same attribution core is verified live via history endpoints. Public Yahoo historical capability was independently verified; no private production security series is claimed. Refresh the catalog before downstream new-name smoke. Missing/unmapped institution identities remain explicit evidence gaps rather than guessed proxies.
- Parent receives the deployed commit/version, contract changes, validation, exact live coverage and limitations before the goal is marked complete. Downstream action: refresh the Splice/Kirbot tool catalog and use snapshot/FX provenance; keep any constant-holdings estimate and causal interpretation separate from recorded chart attribution.
