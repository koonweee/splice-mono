# Perceived performance, SSR, and data loading

## Status

Done — implemented and verified on 2026-09-05. Independent review: No major issues remain.

Measured outcomes and rollout: [validation report](../frontend/docs/performance-validation.md).

Full task ledger: [performance implementation ledger](./performance-implementation-ledger.md).

Grounded against checkout `f5f1298` on 2026-09-05. This plan covers findings
1–5 from the architecture audit: startup JavaScript, authenticated SSR,
theme startup, dashboard payloads, and navigation/mutation caching.

## Goal

Show useful authenticated content earlier on a cold load, reuse recently
loaded data on navigation, and keep edits responsive without changing the
meaning of financial results. Retain React, TanStack Start/Query, Nitro,
NestJS, TypeORM, PostgreSQL, and the generated OpenAPI client.

The user chose a **30-second reuse window for data cached in the current
tab**, with immediate updates/refetches after edits or syncs and no financial
data persisted to disk. Stale queries refresh on navigation, focus, and
reconnect. This is a cache freshness policy, not a new polling schedule or a
promise that an idle screen observes external writes within 30 seconds.

Decisions established by the repository and this plan:

- Preserve the current login flow, refresh recovery, and distinction between
  confirmed logout and temporary API/network failure.
- Keep financial data in request-scoped server memory and the current
  browser's in-memory Query cache. Authenticated HTML and API responses must
  not enter shared HTTP caches or service-worker caches.
- Preserve balance masking before first paint. Theme and masking preferences
  may use small browser cookies; these contain no financial data or tokens.
- Keep financial values and destructive operations server-confirmed. Use
  optimistic updates for reversible account names/notes; use authoritative
  mutation responses and targeted invalidation for financial/category/rule
  changes. Existing form drafts remain open on failure.
- Preserve URLs, query filters, chart sampling, currency precision, historical
  conversions, archived-account behavior, and account-modal capabilities.
- Add compatible dashboard APIs. Keep existing history APIs and MCP contracts.
- Deployment geography, infrastructure changes, database migration/index
  projects, analysis computation caching, mobile-list virtualization, and a
  local-first/offline architecture are outside this plan.

## Current Behavior

| Area              | Code-established behavior and relevant files                                                                                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering         | `frontend/vite.config.ts` already runs `tanstackStart()` and Nitro; `frontend/src/router.tsx` installs `setupRouterSsrQueryIntegration`. Primary pages have no data loaders.                                                                                                                    |
| Startup code      | `HomePage` and `SettingsPage` are exported from their route files and therefore excluded from automatic route-component splitting. `LandingPage` is exported too. Home eagerly imports `AccountModal` and charts; Settings imports all sections despite `Tabs keepMounted={false}`.             |
| Build evidence    | The earlier audit build emitted a 1,558.38 kB minified / 471.55 kB gzip main entry, with no Home or Settings route chunks. The checkout has since advanced; rebaseline before implementation and do not present the old figures as measurements of the new commit.                              |
| Session           | `frontend/src/routes/_authed.tsx` skips its server auth check. `lib/session.ts` uses `['session', 'me']` with `{ user }`; generated `useUserControllerMe` uses `['/user/me']` with `User`. Both request the same endpoint.                                                                      |
| Transport         | `frontend/src/api/axios.ts` owns a browser Axios singleton, refresh queue, and redirect handling. `lib/api-base-url.ts` derives browser origins and has no default internal server origin. Browser `withCredentials` does not forward an incoming SSR cookie.                                   |
| Refresh           | `backend/src/auth/auth.service.ts` already uses a database transaction, row lock, and short rotation grace that returns the same replacement token. `auth-cookies.ts` owns cookie attributes. Reuse these semantics.                                                                            |
| Theme             | `routes/__root.tsx` reads localStorage before paint and sets `data-splice-theme-loading` for non-default themes. `styles.css` hides the body until `AppThemeProvider` removes that attribute.                                                                                                   |
| Masking           | `routes/_authed/home.tsx` stores `splice:home-balances-hidden` in localStorage. `NetWorthCard`, account rows, and `AccountModal` receive the resulting flag. SSR must not briefly reveal previously hidden values.                                                                              |
| Dashboard         | `hooks/useBalanceData.ts` fetches `/balance-query/all-balances`. `BalanceQueryService.getSnapshotBalancesForDateRange` builds daily account objects, then `lib/balance-utils.ts` validates currencies, calculates summaries, and reduces long charts to month-first dates plus the latest date. |
| Shared balances   | `BalanceHistorySurfaceService` already exposes a backend summary for other consumers, but it first constructs the same daily matrix and lacks some Home fields, including account change amounts and valuation mode. It is not a drop-in compact dashboard implementation.                      |
| Navigation        | Global `staleTime` is zero, no intent preloading is configured, and Transactions constructs its infinite-query options inside the page. The first page is 50 rows. Auxiliary account/category queries are separate.                                                                             |
| Mutation/state UI | Many invalidations use substring predicates. `DataState` already retains cached content after failed refresh. `frontend/docs/ui-conventions.md` requires draft recovery, truthful errors, and existing responsive/form primitives.                                                              |

Related plans: [auth session refresh and cache](./auth-session-refresh-and-cache.md),
[PWA shell and offline state](./pwa-shell-and-offline-state.md), and
[data truthfulness remediation](./p1-and-frontend-data-truthfulness.md).
Their completed behavior is a regression boundary. This plan supersedes the
old auth plan's client-only protected-rendering constraint with authenticated,
request-isolated SSR; it does not reopen the rest of those projects.

## Target Data Shape

Add registered Zod schemas in `backend/src/types/Dashboard.ts` and endpoints
on `BalanceQueryController`. The definitions below specify the wire contract;
reuse `MoneyWithSignSchema`, `AccountTypeSchema`, and
`AccountValuationModeSchema` rather than duplicate those definitions.

```ts
type DashboardPeriod =
  | "day"
  | "week"
  | "month"
  | "year"
  | "threeYears"
  | "fiveYears"
  | "tenYears";

type DashboardQuery = {
  period: DashboardPeriod;
  endDate: string; // Valid calendar date, YYYY-MM-DD; resolved once by the caller.
};

type DashboardRange = {
  period: DashboardPeriod;
  startDate: string;
  endDate: string;
  reportingCurrency: string;
  generatedAt: string; // Response generation time, not provider sync time.
};

type DashboardAccountSummary = {
  id: string;
  name: string;
  customName: string | null;
  type: AccountType;
  subType: string | null;
  valuationMode: AccountValuationMode;
  institutionName: string | null;
  archivedAt: string | null;
  syncedAt: string | null; // Latest real sync, including outside the selected range.
  effectiveBalance: MoneyWithSign;
  convertedEffectiveBalance?: MoneyWithSign;
  changeAmount?: MoneyWithSign;
  changePercent?: number;
};

// GET /balance-query/dashboard-summary?period=month&endDate=2026-09-05
type DashboardSummaryResponse = DashboardRange & {
  netWorth: MoneyWithSign;
  changeAmount: MoneyWithSign;
  changePercent?: number;
  assets: DashboardAccountSummary[];
  liabilities: DashboardAccountSummary[];
};

// GET /balance-query/dashboard-series?period=month&endDate=2026-09-05
type DashboardSeriesResponse = DashboardRange & {
  points: Array<{
    date: string;
    netWorth: MoneyWithSign;
  }>;
};
```

Contract rules:

- Derive the start date from the existing `PERIOD_DAYS` behavior: subtract
  1, 7, 30, 365, 1095, 1825, or 3650 days and include both endpoints. Keep
  current URL values from `frontend/src/lib/types.ts`.
- Summary calculation uses the actual first and last dates. Chart dates are
  all dates for day/week/month; for longer periods they are the existing
  month-first dates within the interval plus the final date, deduplicated.
  A ten-year series has at most 122 points. No full account object occurs in
  the series response.
- Resolve ownership and reporting currency from the authenticated user;
  neither is client-selectable in these endpoints. Validate period and real
  calendar dates and reject malformed input before querying.
- Money keeps a non-negative integer minor-unit magnitude and a separate
  sign through the contract. Convert to chart major units only in a small
  frontend presentation adapter. Missing required FX is an explicit error,
  not a native-currency fallback.
- Preserve the current account cohort and net-worth inclusion semantics.
  Hiding zero balances or archived account cards must not silently change
  totals. Preserve sorting by converted balance.
- Summary and series can complete independently and expose independent
  errors. A series error must not erase a valid summary or masquerade as an
  empty chart. The chart's final point must agree with the summary for an
  unchanged fixture; production reads may straddle a sync, as separate reads
  already can. Refetch both after a known balance-changing mutation.
- No database migration is expected. Existing `/balances` and `/all-balances`
  responses remain backward compatible.

Frontend cache and presentation contracts:

- Make the existing generated `['/user/me']` key and `User` payload canonical.
  `useSession` may select `{ user }` for callers, but must not store a second
  payload/query. Preserve refresh-aware error handling and the existing
  five-minute session freshness policy.
- Add shared query-option factories outside generated files, under
  `frontend/src/lib/queries/`, for session, dashboard summary/series, accounts,
  transaction pages, analysis, and supporting lookup data. Loaders and hooks
  must use identical normalized parameters and keys.
- Keep a QueryClient per SSR request and bind the browser cache lifecycle to
  the verified login identity. Cancel and discard old queries on logout or
  identity change before rendering another user's content; late responses and
  mutation callbacks from the previous identity must not repopulate it.
- Add a small root presentation bootstrap containing the validated theme ID,
  masking preference, and resolved initial calendar date. Serialize the
  effective inputs once so browser hydration does not recompute a different
  date or preference. Never serialize access/refresh tokens or raw headers.

## Milestones

### 1. Establish a reproducible performance baseline

Implementation tasks:

- Record the implementation starting commit and current production build in
  `frontend/docs/performance-validation.md` (new). Use the actual Nitro output,
  not Vite development timings or the historical audit build.
- Add a small build-report script under `frontend/scripts/` that reads the
  production manifest, follows static imports, and reports raw/gzip bytes for
  the entry and each route's initial dependency set. Do not count deferred
  chunks as initial bytes or claim that moving bytes into a required vendor
  chunk saves a transfer.
- Use synthetic fixtures: an empty user; a mixed asset/liability user; and
  20 accounts with ten years of snapshots, multiple currencies, currency
  changes, and sparse/forward-filled history. Use a separate local test
  database or mocked HTTP fixture server; do not overwrite the user's data.
- Capture seven comparable runs for cold Home, Transactions, Accounts, and
  Analysis; warm navigation; period changes; account-modal opening; and one
  save. Record median, spread, first useful content, request counts/payloads,
  and console/hydration errors. Use desktop and phone viewports with the same
  browser/machine and fixture. Include a documented throttled profile
  (4x CPU slowdown, 150 ms network latency, 1.6 Mbps download).
- Distinguish first useful content from LCP: Home means populated net-worth
  summary/account cards or intentional masked equivalents; Transactions
  means first rows or a truthful empty state. Add minimal opt-in performance
  marks if the browser trace alone cannot identify these reliably. Do not
  add an analytics backend or emit financial values in telemetry.

Exit criteria:

- Baseline measurements and fixture/profile details are reproducible without
  production credentials. Build reports include transitive initial bytes.
- Initial acceptance budgets are recorded: main-entry gzip at most 300 kB;
  cold Home median first-useful-content at least 25% below the matched
  baseline; no greater than 10% median regression in the other measured
  primary routes. These are implementation targets, not measured promises.
- The implementation must investigate missed budgets rather than silently
  loosen them or claim improvement from bundle size alone.

### 2. Restore route splitting and defer secondary UI

Implementation tasks:

- Extract `HomePage`, `SettingsPage`, and `LandingPage` to feature/page modules
  under `frontend/src/components/pages/`. Keep route definitions, validators,
  and small loader/query dependencies in `src/routes/`. Move test helpers and
  shared constants to appropriate non-route modules and update imports.
- Do not export component/loader functions from route files merely to test
  them. Keep page modules from importing route modules in a way that pulls
  heavy code back into the critical route graph; pass state/callbacks or use
  typed router hooks. Check the installed compiler and generated manifest.
- Lazy-load `AccountModal`, secondary editors, Settings sections, and heavy
  chart renderers with local Suspense/error boundaries. Keep the numeric
  summary and primary navigation outside those boundaries. Preserve direct
  account-modal links and the selected Settings tab.
- Respect `Tabs keepMounted={false}` and draft/unmount behavior. Prefetch
  modal code on clear user intent where useful, but do not fetch unopened
  modal data or every Settings section at startup.
- Inspect the root's global chart/date/table stylesheet links and theme
  imports. Move feature-only styles with their consumers only when SSR and
  direct navigation remain styled before paint; retain genuinely shared
  Mantine styles. Avoid adding chunk rules that simply rename the same
  eagerly loaded dependency graph.
- Regenerate the route tree through the normal build and retain generated
  output formatting. Rebaseline the production manifest after extraction.

Exit criteria:

- Home and Settings have independently loadable component chunks. A landing
  request does not load their components; Home does not load closed account
  editors or inactive Settings sections.
- Production startup meets the entry budget, with measured total initial
  route bytes reported separately. No blank unstyled interval, broken direct
  link, lost draft, or hydration mismatch is introduced.
- Updated Home, Settings, and landing tests pass; frontend lint, typecheck,
  build, and focused `$agent-browser` navigation checks pass.

### 3. Unify session state and introduce request-isolated server transport

Implementation tasks:

- Update `lib/session.ts`, `lib/auth.ts`, `router.tsx`, `_authed.tsx`, landing,
  Home, Analysis, and Settings to consume the canonical user query. Replace
  production duplicate user hooks with the shared refresh-aware factory;
  update Settings/user mutation cache writes against that same payload.
- Retain generated endpoint functions and adapt `src/api/axios.ts`, the Orval
  mutator, through a small isomorphic dispatch layer. Browser calls retain
  Axios and the browser refresh coordinator. Server calls use a new
  server-only transport, e.g. `src/lib/server/api-client.server.ts`, initialized
  in TanStack Start request middleware. Use installed `createIsomorphicFn`
  and server request/response APIs; keep Node/server modules out of client
  bundles.
- Give each SSR request its own cookie jar, sanitized session result, pending
  refresh promise, abort state, and QueryClient. Forward only Splice session
  cookies to a trusted configured backend origin. Do not reuse module-global
  Axios credentials, queues, promises, or headers between requests.
- Add server-only `SPLICE_INTERNAL_API_BASE_URL` configuration. Document local
  `http://localhost:3000` in `frontend/.env.example` and README; give the
  existing frontend Docker runner the overrideable runtime default
  `http://splice-backend:3000`, matching the existing Compose service name.
  Never derive this trusted origin from an incoming Host header. Preserve
  browser `VITE_API_BASE_URL` and split-origin OAuth behavior. No stack repo
  change or live deployment is part of this plan.
- Resolve authentication before flushing protected HTML: `/user/me`, optional
  refresh, then retry. Reuse backend rotation/grace behavior. Forward each
  upstream `Set-Cookie` separately with its original attributes; update the
  request-local cookie jar before subsequent reads. Do not serialize the
  refresh endpoint's token response body into loader/query data.
- Preserve confirmed-anonymous versus temporary-unavailable outcomes and
  safe redirect targets. Public landing must still render when the backend
  is down. Missing credentials do not imply an authenticated session; cookie
  presence alone never authorizes protected rendering. Propagate a sanitized
  anonymous outcome so hydration does not immediately repeat a known failed
  session probe.
- Centralize auth-cache teardown. Preserve push-subscription cleanup, cancel
  pending work, and prevent delayed responses/mutations from a prior login
  generation writing into the next user's cache. Handle cross-tab logout or
  identity changes without broadcasting financial data or raw credentials.

Exit criteria:

- One valid-session `/user/me` request populates both layout and page callers;
  hydration does not issue a duplicate. Refresh recovery remains one
  coordinated sequence per request/browser coordinator, not per widget.
- Concurrent SSR requests for two users cannot exchange data, cookies, or
  refresh results. Two requests presenting the same old refresh token still
  recover using existing backend grace handling.
- Invalid auth returns the existing login flow without protected HTML;
  temporary failures retain recoverable error behavior. Logout/identity
  switching cannot reveal previous-user cached content or accept late writes.
- Session/transport/auth tests, frontend checks, and backend auth regression
  tests pass. The client bundle contains no server credentials or internal
  request implementation.

### 4. Make theme and masking correct on the first paint

Implementation tasks:

- Add shared validated presentation-preference helpers, e.g.
  `frontend/src/lib/presentation-preferences.ts`. Resolve authenticated theme
  from the canonical user's saved setting; use a validated last-saved theme
  cookie for anonymous rendering and the existing default when absent.
- Pass the chosen theme into `AppThemeProvider` for both server rendering and
  initial hydration. Generate `ColorSchemeScript`, root attributes, and
  Mantine styles consistently. Remove the whole-body hiding mechanism from
  `__root.tsx` and `styles.css` after this path works.
- Mirror saved theme and balance masking in small same-site browser cookies
  usable by SSR, preserving existing localStorage compatibility and storage
  events. Only saved theme changes update the cookie; Settings previews stay
  reversible and failed saves restore the last saved theme.
- Treat the saved user theme as authoritative after login. Import an old
  localStorage theme for anonymous presentation when appropriate; never let
  that migration overwrite the authenticated user's saved preference.
- Mirror the existing Home masking flag immediately on toggle. With no
  masking cookie, server-render only the monetary surfaces masked, then
  migrate the localStorage preference/default during hydration and write the
  cookie. The rest of the page stays visible. Existing hidden balances must
  never flash, including chart tooltips, change popovers, and direct modals.
- Preserve the distinction between display masking and authentication:
  authenticated query data can still hydrate in memory, but visible HTML
  must respect masking. Cookies are UI preferences, never auth evidence.

Exit criteria:

- Default, light, Dracula, and OLED themes render visibly before hydration,
  with no whole-page visibility gate and no hydration warning.
- Saved themes survive reload and successful saves; preview/cancel/failure
  behavior and cross-tab synchronization remain correct.
- Delayed-JavaScript and old-localStorage-only browser cases reveal no
  previously hidden monetary values; nonfinancial navigation remains visible.
- Preference/bootstrap tests and `$agent-browser` first-paint captures pass
  at phone and desktop sizes.

### 5. Add compact dashboard summary and series APIs

Implementation tasks:

- Add `Dashboard.ts` schemas and the two compatible controller endpoints.
  Register a dedicated `DashboardQueryService` in `balance-query.module.ts`.
  Keep controllers thin and enforce the existing global auth/ownership model.
- Extract reusable snapshot loading, fill-forward selection, effective-money
  conversion, and aggregation primitives from `BalanceQueryService` and the
  existing summary implementations. Keep web display fields in the new
  adapter and preserve `BalanceHistorySurfaceService` output for its callers.
  Do not add a third divergent implementation of financial arithmetic.
- Summary reads only what is needed for endpoint balances, account summaries,
  comparisons, and latest real sync timestamps. Load account metadata once.
  Series loads normalized snapshots/rates and produces compact net-worth
  points without constructing or serializing the full daily account matrix.
- Use an ordered forward-fill cursor instead of scanning every snapshot for
  every absent day. For the series, retain complete required-date FX
  validation while emitting only the selected chart points, so a missing
  conversion on a discarded date is not silently accepted.
- Parallelize independent account/user queries and independent snapshot/rate
  queries; reuse already loaded accounts. Query count must not grow per
  account or per day. Do not add Redis, persistent summary caches, or
  materialized views for this change.
- Protect historical currency changes, zero balances, missing prior
  snapshots, liabilities, integer precision, undefined percentage changes
  from a zero baseline, and latest sync outside the period with regression
  fixtures. Preserve chart final-date inclusion and current archived-account
  inclusion/display semantics.
- Regenerate `frontend/src/api/**` with `yarn orval`; do not hand-edit generated
  types or query hooks. Add only a small frontend chart/date adapter, leaving
  the existing history API path available to `AccountModal` and other clients.

Exit criteria:

- On unchanged fixtures, summary values/account ordering match the existing
  Home transform and chart dates/values match current downsampling exactly.
  Empty and FX-error cases have explicit expected outcomes.
- Combined uncompressed summary-plus-series bytes are at least 90% below the
  old all-balances response on the 20-account/ten-year fixture. Report gzip
  bytes as well. Series has at most 122 points and contains no account copies.
- No full account-by-day matrix is allocated on the new path. Repository
  query count is bounded independently of date/account counts, with no N+1
  access. Existing balance/history-surface tests and callers still pass.
- New controller/service tests cover invalid input, auth, ownership, empty
  data, currency errors, and schema/OpenAPI correctness; backend lint,
  typecheck, build, and client generation pass.

### 6. Prefetch primary route data and stream secondary content

Implementation tasks:

- Create shared query factories for Home, Transactions, Accounts, Analysis,
  and the selected Settings tab under `src/lib/queries/`. Add route loaders
  and `loaderDeps` that reflect actual data dependencies, not incidental modal
  or UI-only state. Use the approved 30-second freshness policy for these
  primary read queries as they are introduced.
- On cold requests, complete the request-scoped auth/bootstrap first; then
  start independent page reads together. Await only essential content and
  let secondary work stream through the existing Query SSR integration.
  Never start a refresh that sets cookies after protected output is flushed.
- Home: await the compact summary; start series concurrently without delaying
  account cards. Split `useBalanceData` into summary and series consumers,
  update `NetWorthCard` to give the chart its own pending/error/retry boundary,
  and remove the full-history transformation from Home. Preserve a direct
  `accountId` URL and fetch full account history only when its modal is open.
- Transactions: extract the current parameter builder and infinite-query
  options, including `initialPageParam`, `pageParams`, 50-row pages, sorting,
  and `getNextPageParam`. Prefetch only the first page; reuse it on hydration.
  Start accounts/category lookups concurrently without blocking readable
  rows. Preserve local filter edits, URL-provided filters, and pagination.
- Accounts: prefetch the current account list. Analysis: prefetch the selected
  date-range response while chart code, audit, and drilldowns stay secondary.
  Settings: reuse the canonical user and prefetch only the selected tab's
  needed data, never all management sections.
- Resolve initial dates once and serialize them. Honor explicit valid URL
  dates. For missing dates use the user's valid configured timezone, falling
  back to a browser timezone preference when available and UTC otherwise;
  do not independently use Node and browser local clocks. This deliberately
  defines the previously implicit default at timezone boundaries. Preserve
  day-count period semantics and test midnight/back-forward transitions.
- Configure intent preloading for primary navigation using shared query
  options. Treat cached stale data as immediately renderable and revalidate
  in the background; do not make an existing-content navigation wait for a
  blocking `fetchQuery`. Uncached essential data gets a bounded local pending
  state, not an empty page.
- Use `DataState` and existing responsive primitives. Add `private, no-store`
  response behavior to authenticated HTML, SSR data transport, and relevant
  authenticated API responses. Verify the service worker still caches no
  financial response; public static hashed assets retain their normal cache.

Exit criteria:

- Raw HTML for a valid session contains Home summary/account text and first
  Transactions rows (or truthful empty states) before JavaScript runs.
  Delayed chart code/data does not block the Home summary.
- Hydration reuses session and primary route queries without duplicate
  requests or mismatched date/currency/filter keys. Direct links and
  back/forward behavior work on desktop and phone.
- Opening a closed modal, audit drawer, or unselected Settings tab is what
  triggers its secondary data. No speculative writes or all-tabs fetch occurs.
- Masked, anonymous, expired-access/valid-refresh, invalid-refresh, temporary
  backend failure, and two-user SSR tests pass. Runtime HTML/header and browser
  evidence demonstrate private response handling and safe cookie forwarding.

### 7. Apply the cache policy and targeted mutation reconciliation

Implementation tasks:

- Add a centralized policy and query-family invalidation module outside
  generated code, e.g. `lib/query-policy.ts` and `lib/query-invalidation.ts`.
  Apply 30 seconds to financial/lookup/settings read queries; keep session at
  five minutes and security-sensitive token inventory fresh on entry.
  Preserve the normal inactive cache cleanup and no persistence plugin.
- Replace touched broad substring predicates with named query-key prefixes
  and explicit dependencies. Use the same helpers from desktop and mobile
  transaction editors, account editors, Settings, and modal callbacks.
- Reconcile authoritative mutation responses into known matching caches
  immediately. Invalidate all cached filter variants whose membership,
  sorting, totals, or derived values may change; refetch active affected
  views and mark inactive affected views stale. Do not patch one row while
  leaving the wrong row count or an invalid filtered result presented as fresh.
- Add rollback-safe optimistic account-name/notes updates with cancellation,
  previous values, and mutation-generation checks. Serialize concurrent writes
  to the same field/entity so an older failure cannot overwrite a later
  success. Do not optimistically fabricate balances, holdings values, or
  analysis totals. Preserve existing server-confirmed category bulk edit and
  undo semantics and form success/failure behavior.
- Reuse already cached content for the same query during refresh. For filter
  transitions, retain prior results only with an explicit updating state tied
  to the prior filter context; disable stale-result bulk/edit actions until
  the new result is known. Do not label old rows/totals as the new filter's
  answer. A failure leaves an actionable error plus clearly previous data.
- Keep dirty Settings drafts isolated from background cache updates. On a
  successful currency change invalidate both dashboard endpoints, converted
  transactions/holdings, analysis, and account history; hide old-unit values
  until their matching-currency replacements arrive.
- Verify the mutation dependency table below against all touched call sites.
  External provider updates are observed through existing sync completion,
  stale focus/navigation/reconnect, or explicit refresh; add no polling/SSE
  system in this plan.

| Mutation                                                                                          | Required reconciliation/invalidation                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account name/notes                                                                                | Matching account list, dashboard summary, and account-detail/history metadata; optimistic local fields with rollback.                                                                                      |
| Account creation/archive, balance edit, CSV backfill, sync, holdings/prices                       | Account list, dashboard summary and series, relevant history/holdings/activity; include transactions/analysis/category lookups when the operation can change them.                                         |
| Manual transaction create/edit/delete, category override, bulk category/undo, reporting-date edit | Affected transaction query variants and drilldowns, Analysis summary/audit, and relevant category/rule inputs. Manual transaction changes do not alter balances by themselves.                             |
| Categories, analysis/categorization rules, recurring schedules                                    | Corresponding management lists/previews and affected transaction/analysis/lookups according to actual backend behavior; schedule edits must not claim materialized transactions changed when they did not. |
| User settings                                                                                     | Canonical user query and presentation bootstrap; invalidate converted financial queries for currency changes and analysis for lookaround changes.                                                          |
| Logout or identity transition                                                                     | Cancel/discard private cache and pending writes before rendering another identity; preserve the existing push cleanup sequence.                                                                            |

Exit criteria:

- Navigation to a matching query within 30 seconds displays cached content
  immediately with no new data request. A stale navigation displays cached
  content while one deduplicated refresh runs; focus/reconnect behave alike.
- Edits and syncs bypass the freshness window for affected data, including
  inactive cached variants revisited afterward. Unaffected families do not
  refetch merely because their key contains a matching substring.
- Tests cover success/failure, rapid consecutive edits, invalidation during an
  in-flight read, late replies after logout, filtered list membership/counts,
  bulk undo, currency changes, and dirty Settings drafts.
- No stale rows become an actionable answer to a different filter. Financial
  content remains exclusively in memory and existing PWA/offline errors work.

### 8. Verify the complete experience and document rollout

Implementation tasks:

- Repeat milestone 1's production-build measurements with identical fixtures,
  browser profiles, throttling, viewports, and run counts. Record entry bytes,
  total initial route bytes, request sequences, payloads, first useful content,
  chart readiness, and navigation/save behavior in the validation document.
- Use `$splice-local-dev` for backend/Postgres setup and local auth bypass.
  Use a separate production Nitro frontend process/port for final performance
  evidence; Vite dev is useful for interaction debugging, not acceptance
  timing. Inspect existing processes before starting or stopping services.
- Use `$agent-browser` for real-browser validation. Load its current core
  workflow first, run all agent-browser commands outside the sandbox as
  required by AGENTS.md, and close every session started for this work.
- Cover phone, tablet, and desktop navigation, keyboard focus, touch controls,
  lazy editor opening, selected Settings tabs, cached refresh failures,
  malformed/deep URLs, refresh recovery across tabs, masking, and all themes.
  Delay JavaScript/chart/API responses independently to verify first-paint
  behavior. Inspect actual network responses and hydration errors.
- Update `frontend/README.md` with server-origin configuration and the SSR
  boundary, `frontend/docs/ui-conventions.md` with query/loader/cache ownership,
  and the validation report with measured outcomes and remaining limits.
- Prepare backend-compatible-first release notes: deploy additive backend APIs
  before a frontend that requires them; verify the internal API origin in the
  existing frontend runtime. Use the repository's normal protected Deploy
  workflow only when deployment is requested. No infrastructure-topology
  change or live mutation is required to complete implementation validation.
- Rollback order is frontend first, then backend if needed. Old clients retain
  the old endpoints. Preference cookies are optional hints that old clients
  can ignore. Keep private-response headers intact during rollback.

Exit criteria:

- Performance budgets from milestone 1 pass with paired measurements, and
  payload/chunk/request-count improvements have concrete recorded evidence.
  Any remaining gap is explicit rather than marked complete by assumption.
- All required focused tests and owning-app lint/typecheck/build checks pass;
  browser verification finds no blocking functional, auth, financial,
  responsiveness, or first-paint regression.
- No generated client/route file was edited manually, no production data was
  copied into evidence, and all agent-browser sessions have been closed.
- Validation and rollout/rollback notes are sufficient for a reviewer to
  assess the result without repeating the architecture investigation.

## Tests

### Backend

- Add `backend/test/balance-query/dashboard-query.service.spec.ts` and
  `dashboard-query.controller.spec.ts` with the contract, financial parity,
  input/ownership, payload-shape, and bounded-query cases above.
- Run the existing `balance-query.service.spec.ts`,
  `balance-history-surface.service.spec.ts`, currency-exchange tests, and auth
  service/cookie tests. Add PostgreSQL-backed integration coverage when shared
  repository queries change; mocks alone cannot prove SQL ordering, query
  count, or fill-forward selection on real rows.
- Use synthetic differential fixtures against the existing Home transform,
  checked against independent expected values for signs, JPY/USD precision,
  zero baselines, sparse histories, changing snapshot currencies, missing FX,
  archived accounts, and period boundaries. Do not merely assert that two
  copies of the same new calculation agree.

### Frontend

- Extend `lib/session.test.ts`, `lib/session-refresh.test.ts`, `lib/auth.test.ts`,
  and `api/axios.test.ts`; add request-transport and auth-cache isolation tests.
- Add real server-render/hydration integration coverage for root preferences,
  concurrent users, token refresh/Set-Cookie forwarding, private headers,
  serialized data, date consistency, and hydration query reuse. Existing
  mocked route tests alone do not cover SSR behavior. Use a Node test
  environment for server transport tests and exercise a real built Nitro
  request handler for header/streaming acceptance, with controlled backend
  responses rather than production sessions.
- Update Home/Settings/landing route tests after component extraction, and
  `hooks/useBalanceData.test.tsx`, `lib/balance-utils-transform.test.ts`,
  `NetWorthCard.test.tsx`, and `AccountModal.test.tsx` for split summary/series
  behavior and compatibility. Preserve history-transform regression tests.
- Add query-policy/invalidation tests using real QueryClient instances and
  controlled time/delayed responses; cover warm/stale reuse, identity changes,
  optimistic rollback, overlapping mutations, and affected query families.
- Extend Transactions/Analysis/Settings and shared `DataState` tests for
  truthful retained content, filter transitions, errors/retries, currency
  changes, dirty drafts, and direct navigation. Validate visual details in
  the browser rather than asserting CSS strings or chunk hash names.

## Validation Commands

Run commands in the owning app directory. Paths below are relative to that
directory; new test filenames refer to files introduced by the milestones.

Backend:

```bash
yarn test test/balance-query test/currency-exchange test/auth --runInBand
yarn lint
yarn typecheck
yarn build
```

Frontend:

```bash
yarn orval
yarn test src/lib/session.test.ts src/lib/session-refresh.test.ts src/lib/auth.test.ts src/api/axios.test.ts
yarn test src/hooks/useBalanceData.test.tsx src/lib/balance-utils-transform.test.ts
yarn test src/routes src/components/pages src/components/NetWorthCard.test.tsx src/components/AccountModal.test.tsx
yarn test src/lib/queries src/lib/server src/lib/query-policy.test.ts src/lib/query-invalidation.test.ts
yarn lint
yarn typecheck
yarn build
```

`yarn orval` requires the updated backend OpenAPI document (`/api-json`), or an
explicit `ORVAL_API_INPUT` exported specification. Run added integration tests
with the implementation's documented local fixture command and record that
exact command in `frontend/docs/performance-validation.md`. Run relevant
existing Settings/transaction editor tests for changed mutation call sites.

Final browser checks use `$agent-browser` against the production Nitro output
and the local API, after loading `$splice-local-dev`. Do not sync/truncate a
database, replace an existing dev process, or deploy as a hidden prerequisite
to these checks. Any `gh` operation must request sandbox escalation.

## Overall Exit Criteria

- [x] Route splitting and secondary loading meet the measured startup budget.
- [x] Valid authenticated HTML contains useful primary content before client
      JavaScript; the same data hydrates without duplicate initial requests.
- [x] Themes render visibly from the start; saved hidden balances never flash.
- [x] Home uses compact summary/series APIs with financial parity and bounded
      response shape, while existing history and MCP contracts remain compatible.
- [x] The user-selected 30-second in-memory reuse policy is effective, with
      immediate reconciliation after edits/syncs and truthful stale/error states.
- [x] SSR and browser auth caches preserve identity boundaries, refresh
      recovery, cookie handling, logout cleanup, and no persistent finance cache.
- [x] The paired performance, focused test, lint/typecheck/build, generated
      contract, and real-browser evidence passes and is saved for review.

## Risks and remaining questions

No product decision blocks implementation after the freshness interview.
The following are engineering checks with explicit resolution points:

- **Streaming and response headers:** verify installed TanStack/Nitro behavior
  in milestone 3 before enabling private-data SSR in milestone 6. Auth refresh
  must finish before headers are committed; never work around this with a
  shared server session singleton.
- **Financial parity:** inspect both `balance-utils.ts` and
  `balance-history-surface.service.ts` during milestone 5. They do not expose
  identical summary shapes. Preserve existing consumers while extracting
  reusable primitives, and retain independent correctness assertions.
- **Bundle floor and measurement noise:** milestone 1 establishes current
  baselines; milestone 8 measures gains. If shared Mantine/theme dependencies
  keep required bytes high, investigate the import graph rather than widening
  this into a UI-library migration or lowering the budget silently.
- **Separate summary/series snapshots:** these endpoints are not a database
  snapshot spanning two HTTP requests. Keep results independently labeled by
  range/currency, handle refresh honestly, and test mutations between reads.
  A durable read-version system is not justified by this scope.
- **Current code changes:** re-read the current checkout and test inventory
  when implementing; preserve subsequent UI/convention changes. This plan is
  grounded in the code, not in stale status labels on older plans.
