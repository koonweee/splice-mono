# MCP Historical Financial Evidence

## Status

In Progress — repository inspected and goal started 2026-09-14.

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
