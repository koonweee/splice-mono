# Performance implementation ledger

Source of scope: [approved plan](./perceived-performance-ssr-and-data-loading.md). Every task and milestone exit criterion is tracked. All 83 scoped items are verified. Independent review completed after three review passes: **No major issues remain.**

## 1. Establish a reproducible performance baseline

Status: verified

- **M1.1 — verified:** Record the implementation starting commit and current production build in `frontend/docs/performance-validation.md` (new). Use the actual Nitro output, not Vite development timings or the historical audit build.
- **M1.2 — verified:** Add a small build-report script under `frontend/scripts/` that reads the production manifest, follows static imports, and reports raw/gzip bytes for the entry and each route's initial dependency set. Do not count deferred chunks as initial bytes or claim that moving bytes into a required vendor chunk saves a transfer.
- **M1.3 — verified:** Use synthetic fixtures: an empty user; a mixed asset/liability user; and 20 accounts with ten years of snapshots, multiple currencies, currency changes, and sparse/forward-filled history. Use a separate local test database or mocked HTTP fixture server; do not overwrite the user's data.
- **M1.4 — verified:** Capture seven comparable runs for cold Home, Transactions, Accounts, and Analysis; warm navigation; period changes; account-modal opening; and one save. Record median, spread, first useful content, request counts/payloads, and console/hydration errors. Use desktop and phone viewports with the same browser/machine and fixture. Include a documented throttled profile (4x CPU slowdown, 150 ms network latency, 1.6 Mbps download).
- **M1.5 — verified:** Distinguish first useful content from LCP: Home means populated net-worth summary/account cards or intentional masked equivalents; Transactions means first rows or a truthful empty state. Add minimal opt-in performance marks if the browser trace alone cannot identify these reliably. Do not add an analytics backend or emit financial values in telemetry.
- **M1.6 — verified:** Baseline measurements and fixture/profile details are reproducible without production credentials. Build reports include transitive initial bytes.
- **M1.7 — verified:** Initial acceptance budgets are recorded: main-entry gzip at most 300 kB; cold Home median first-useful-content at least 25% below the matched baseline; no greater than 10% median regression in the other measured primary routes. These are implementation targets, not measured promises.
- **M1.8 — verified:** The implementation must investigate missed budgets rather than silently loosen them or claim improvement from bundle size alone.

## 2. Restore route splitting and defer secondary UI

Status: verified

- **M2.1 — verified:** Extract `HomePage`, `SettingsPage`, and `LandingPage` to feature/page modules under `frontend/src/components/pages/`. Keep route definitions, validators, and small loader/query dependencies in `src/routes/`. Move test helpers and shared constants to appropriate non-route modules and update imports.
- **M2.2 — verified:** Do not export component/loader functions from route files merely to test them. Keep page modules from importing route modules in a way that pulls heavy code back into the critical route graph; pass state/callbacks or use typed router hooks. Check the installed compiler and generated manifest.
- **M2.3 — verified:** Lazy-load `AccountModal`, secondary editors, Settings sections, and heavy chart renderers with local Suspense/error boundaries. Keep the numeric summary and primary navigation outside those boundaries. Preserve direct account-modal links and the selected Settings tab.
- **M2.4 — verified:** Respect `Tabs keepMounted={false}` and draft/unmount behavior. Prefetch modal code on clear user intent where useful, but do not fetch unopened modal data or every Settings section at startup.
- **M2.5 — verified:** Inspect the root's global chart/date/table stylesheet links and theme imports. Move feature-only styles with their consumers only when SSR and direct navigation remain styled before paint; retain genuinely shared Mantine styles. Avoid adding chunk rules that simply rename the same eagerly loaded dependency graph.
- **M2.6 — verified:** Regenerate the route tree through the normal build and retain generated output formatting. Rebaseline the production manifest after extraction.
- **M2.7 — verified:** Home and Settings have independently loadable component chunks. A landing request does not load their components; Home does not load closed account editors or inactive Settings sections.
- **M2.8 — verified:** Production startup meets the entry budget, with measured total initial route bytes reported separately. No blank unstyled interval, broken direct link, lost draft, or hydration mismatch is introduced.
- **M2.9 — verified:** Updated Home, Settings, and landing tests pass; frontend lint, typecheck, build, and focused `$agent-browser` navigation checks pass.

## 3. Unify session state and introduce request-isolated server transport

Status: verified

- **M3.1 — verified:** Update `lib/session.ts`, `lib/auth.ts`, `router.tsx`, `_authed.tsx`, landing, Home, Analysis, and Settings to consume the canonical user query. Replace production duplicate user hooks with the shared refresh-aware factory; update Settings/user mutation cache writes against that same payload.
- **M3.2 — verified:** Retain generated endpoint functions and adapt `src/api/axios.ts`, the Orval mutator, through a small isomorphic dispatch layer. Browser calls retain Axios and the browser refresh coordinator. Server calls use a new server-only transport, e.g. `src/lib/server/api-client.server.ts`, initialized in TanStack Start request middleware. Use installed `createIsomorphicFn` and server request/response APIs; keep Node/server modules out of client bundles.
- **M3.3 — verified:** Give each SSR request its own cookie jar, sanitized session result, pending refresh promise, abort state, and QueryClient. Forward only Splice session cookies to a trusted configured backend origin. Do not reuse module-global Axios credentials, queues, promises, or headers between requests.
- **M3.4 — verified:** Add server-only `SPLICE_INTERNAL_API_BASE_URL` configuration. Document local `http://localhost:3000` in `frontend/.env.example` and README; give the existing frontend Docker runner the overrideable runtime default `http://splice-backend:3000`, matching the existing Compose service name. Never derive this trusted origin from an incoming Host header. Preserve browser `VITE_API_BASE_URL` and split-origin OAuth behavior. No stack repo change or live deployment is part of this plan.
- **M3.5 — verified:** Resolve authentication before flushing protected HTML: `/user/me`, optional refresh, then retry. Reuse backend rotation/grace behavior. Forward each upstream `Set-Cookie` separately with its original attributes; update the request-local cookie jar before subsequent reads. Do not serialize the refresh endpoint's token response body into loader/query data.
- **M3.6 — verified:** Preserve confirmed-anonymous versus temporary-unavailable outcomes and safe redirect targets. Public landing must still render when the backend is down. Missing credentials do not imply an authenticated session; cookie presence alone never authorizes protected rendering. Propagate a sanitized anonymous outcome so hydration does not immediately repeat a known failed session probe.
- **M3.7 — verified:** Centralize auth-cache teardown. Preserve push-subscription cleanup, cancel pending work, and prevent delayed responses/mutations from a prior login generation writing into the next user's cache. Handle cross-tab logout or identity changes without broadcasting financial data or raw credentials.
- **M3.8 — verified:** One valid-session `/user/me` request populates both layout and page callers; hydration does not issue a duplicate. Refresh recovery remains one coordinated sequence per request/browser coordinator, not per widget.
- **M3.9 — verified:** Concurrent SSR requests for two users cannot exchange data, cookies, or refresh results. Two requests presenting the same old refresh token still recover using existing backend grace handling.
- **M3.10 — verified:** Invalid auth returns the existing login flow without protected HTML; temporary failures retain recoverable error behavior. Logout/identity switching cannot reveal previous-user cached content or accept late writes.
- **M3.11 — verified:** Session/transport/auth tests, frontend checks, and backend auth regression tests pass. The client bundle contains no server credentials or internal request implementation.

## 4. Make theme and masking correct on the first paint

Status: verified

- **M4.1 — verified:** Add shared validated presentation-preference helpers, e.g. `frontend/src/lib/presentation-preferences.ts`. Resolve authenticated theme from the canonical user's saved setting; use a validated last-saved theme cookie for anonymous rendering and the existing default when absent.
- **M4.2 — verified:** Pass the chosen theme into `AppThemeProvider` for both server rendering and initial hydration. Generate `ColorSchemeScript`, root attributes, and Mantine styles consistently. Remove the whole-body hiding mechanism from `__root.tsx` and `styles.css` after this path works.
- **M4.3 — verified:** Mirror saved theme and balance masking in small same-site browser cookies usable by SSR, preserving existing localStorage compatibility and storage events. Only saved theme changes update the cookie; Settings previews stay reversible and failed saves restore the last saved theme.
- **M4.4 — verified:** Treat the saved user theme as authoritative after login. Import an old localStorage theme for anonymous presentation when appropriate; never let that migration overwrite the authenticated user's saved preference.
- **M4.5 — verified:** Mirror the existing Home masking flag immediately on toggle. With no masking cookie, server-render only the monetary surfaces masked, then migrate the localStorage preference/default during hydration and write the cookie. The rest of the page stays visible. Existing hidden balances must never flash, including chart tooltips, change popovers, and direct modals.
- **M4.6 — verified:** Preserve the distinction between display masking and authentication: authenticated query data can still hydrate in memory, but visible HTML must respect masking. Cookies are UI preferences, never auth evidence.
- **M4.7 — verified:** Default, light, Dracula, and OLED themes render visibly before hydration, with no whole-page visibility gate and no hydration warning.
- **M4.8 — verified:** Saved themes survive reload and successful saves; preview/cancel/failure behavior and cross-tab synchronization remain correct.
- **M4.9 — verified:** Delayed-JavaScript and old-localStorage-only browser cases reveal no previously hidden monetary values; nonfinancial navigation remains visible.
- **M4.10 — verified:** Preference/bootstrap tests and `$agent-browser` first-paint captures pass at phone and desktop sizes.

## 5. Add compact dashboard summary and series APIs

Status: verified

- **M5.1 — verified:** Add `Dashboard.ts` schemas and the two compatible controller endpoints. Register a dedicated `DashboardQueryService` in `balance-query.module.ts`. Keep controllers thin and enforce the existing global auth/ownership model.
- **M5.2 — verified:** Extract reusable snapshot loading, fill-forward selection, effective-money conversion, and aggregation primitives from `BalanceQueryService` and the existing summary implementations. Keep web display fields in the new adapter and preserve `BalanceHistorySurfaceService` output for its callers. Do not add a third divergent implementation of financial arithmetic.
- **M5.3 — verified:** Summary reads only what is needed for endpoint balances, account summaries, comparisons, and latest real sync timestamps. Load account metadata once. Series loads normalized snapshots/rates and produces compact net-worth points without constructing or serializing the full daily account matrix.
- **M5.4 — verified:** Use an ordered forward-fill cursor instead of scanning every snapshot for every absent day. For the series, retain complete required-date FX validation while emitting only the selected chart points, so a missing conversion on a discarded date is not silently accepted.
- **M5.5 — verified:** Parallelize independent account/user queries and independent snapshot/rate queries; reuse already loaded accounts. Query count must not grow per account or per day. Do not add Redis, persistent summary caches, or materialized views for this change.
- **M5.6 — verified:** Protect historical currency changes, zero balances, missing prior snapshots, liabilities, integer precision, undefined percentage changes from a zero baseline, and latest sync outside the period with regression fixtures. Preserve chart final-date inclusion and current archived-account inclusion/display semantics.
- **M5.7 — verified:** Regenerate `frontend/src/api/**` with `yarn orval`; do not hand-edit generated types or query hooks. Add only a small frontend chart/date adapter, leaving the existing history API path available to `AccountModal` and other clients.
- **M5.8 — verified:** On unchanged fixtures, summary values/account ordering match the existing Home transform and chart dates/values match current downsampling exactly. Empty and FX-error cases have explicit expected outcomes.
- **M5.9 — verified:** Combined uncompressed summary-plus-series bytes are at least 90% below the old all-balances response on the 20-account/ten-year fixture. Report gzip bytes as well. Series has at most 122 points and contains no account copies.
- **M5.10 — verified:** No full account-by-day matrix is allocated on the new path. Repository query count is bounded independently of date/account counts, with no N+1 access. Existing balance/history-surface tests and callers still pass.
- **M5.11 — verified:** New controller/service tests cover invalid input, auth, ownership, empty data, currency errors, and schema/OpenAPI correctness; backend lint, typecheck, build, and client generation pass.

## 6. Prefetch primary route data and stream secondary content

Status: verified

- **M6.1 — verified:** Create shared query factories for Home, Transactions, Accounts, Analysis, and the selected Settings tab under `src/lib/queries/`. Add route loaders and `loaderDeps` that reflect actual data dependencies, not incidental modal or UI-only state. Use the approved 30-second freshness policy for these primary read queries as they are introduced.
- **M6.2 — verified:** On cold requests, complete the request-scoped auth/bootstrap first; then start independent page reads together. Await only essential content and let secondary work stream through the existing Query SSR integration. Never start a refresh that sets cookies after protected output is flushed.
- **M6.3 — verified:** Home: await the compact summary; start series concurrently without delaying account cards. Split `useBalanceData` into summary and series consumers, update `NetWorthCard` to give the chart its own pending/error/retry boundary, and remove the full-history transformation from Home. Preserve a direct `accountId` URL and fetch full account history only when its modal is open.
- **M6.4 — verified:** Transactions: extract the current parameter builder and infinite-query options, including `initialPageParam`, `pageParams`, 50-row pages, sorting, and `getNextPageParam`. Prefetch only the first page; reuse it on hydration. Start accounts/category lookups concurrently without blocking readable rows. Preserve local filter edits, URL-provided filters, and pagination.
- **M6.5 — verified:** Accounts: prefetch the current account list. Analysis: prefetch the selected date-range response while chart code, audit, and drilldowns stay secondary. Settings: reuse the canonical user and prefetch only the selected tab's needed data, never all management sections.
- **M6.6 — verified:** Resolve initial dates once and serialize them. Honor explicit valid URL dates. For missing dates use the user's valid configured timezone, falling back to a browser timezone preference when available and UTC otherwise; do not independently use Node and browser local clocks. This deliberately defines the previously implicit default at timezone boundaries. Preserve day-count period semantics and test midnight/back-forward transitions.
- **M6.7 — verified:** Configure intent preloading for primary navigation using shared query options. Treat cached stale data as immediately renderable and revalidate in the background; do not make an existing-content navigation wait for a blocking `fetchQuery`. Uncached essential data gets a bounded local pending state, not an empty page.
- **M6.8 — verified:** Use `DataState` and existing responsive primitives. Add `private, no-store` response behavior to authenticated HTML, SSR data transport, and relevant authenticated API responses. Verify the service worker still caches no financial response; public static hashed assets retain their normal cache.
- **M6.9 — verified:** Raw HTML for a valid session contains Home summary/account text and first Transactions rows (or truthful empty states) before JavaScript runs. Delayed chart code/data does not block the Home summary.
- **M6.10 — verified:** Hydration reuses session and primary route queries without duplicate requests or mismatched date/currency/filter keys. Direct links and back/forward behavior work on desktop and phone.
- **M6.11 — verified:** Opening a closed modal, audit drawer, or unselected Settings tab is what triggers its secondary data. No speculative writes or all-tabs fetch occurs.
- **M6.12 — verified:** Masked, anonymous, expired-access/valid-refresh, invalid-refresh, temporary backend failure, and two-user SSR tests pass. Runtime HTML/header and browser evidence demonstrate private response handling and safe cookie forwarding.

## 7. Apply the cache policy and targeted mutation reconciliation

Status: verified

- **M7.1 — verified:** Add a centralized policy and query-family invalidation module outside generated code, e.g. `lib/query-policy.ts` and `lib/query-invalidation.ts`. Apply 30 seconds to financial/lookup/settings read queries; keep session at five minutes and security-sensitive token inventory fresh on entry. Preserve the normal inactive cache cleanup and no persistence plugin.
- **M7.2 — verified:** Replace touched broad substring predicates with named query-key prefixes and explicit dependencies. Use the same helpers from desktop and mobile transaction editors, account editors, Settings, and modal callbacks.
- **M7.3 — verified:** Reconcile authoritative mutation responses into known matching caches immediately. Invalidate all cached filter variants whose membership, sorting, totals, or derived values may change; refetch active affected views and mark inactive affected views stale. Do not patch one row while leaving the wrong row count or an invalid filtered result presented as fresh.
- **M7.4 — verified:** Add rollback-safe optimistic account-name/notes updates with cancellation, previous values, and mutation-generation checks. Serialize concurrent writes to the same field/entity so an older failure cannot overwrite a later success. Do not optimistically fabricate balances, holdings values, or analysis totals. Preserve existing server-confirmed category bulk edit and undo semantics and form success/failure behavior.
- **M7.5 — verified:** Reuse already cached content for the same query during refresh. For filter transitions, retain prior results only with an explicit updating state tied to the prior filter context; disable stale-result bulk/edit actions until the new result is known. Do not label old rows/totals as the new filter's answer. A failure leaves an actionable error plus clearly previous data.
- **M7.6 — verified:** Keep dirty Settings drafts isolated from background cache updates. On a successful currency change invalidate both dashboard endpoints, converted transactions/holdings, analysis, and account history; hide old-unit values until their matching-currency replacements arrive.
- **M7.7 — verified:** Verify the mutation dependency table below against all touched call sites. External provider updates are observed through existing sync completion, stale focus/navigation/reconnect, or explicit refresh; add no polling/SSE system in this plan.
- **M7.8 — verified:** Navigation to a matching query within 30 seconds displays cached content immediately with no new data request. A stale navigation displays cached content while one deduplicated refresh runs; focus/reconnect behave alike.
- **M7.9 — verified:** Edits and syncs bypass the freshness window for affected data, including inactive cached variants revisited afterward. Unaffected families do not refetch merely because their key contains a matching substring.
- **M7.10 — verified:** Tests cover success/failure, rapid consecutive edits, invalidation during an in-flight read, late replies after logout, filtered list membership/counts, bulk undo, currency changes, and dirty Settings drafts.
- **M7.11 — verified:** No stale rows become an actionable answer to a different filter. Financial content remains exclusively in memory and existing PWA/offline errors work.

## 8. Verify the complete experience and document rollout

Status: verified

- **M8.1 — verified:** Repeat milestone 1's production-build measurements with identical fixtures, browser profiles, throttling, viewports, and run counts. Record entry bytes, total initial route bytes, request sequences, payloads, first useful content, chart readiness, and navigation/save behavior in the validation document.
- **M8.2 — verified:** Use `$splice-local-dev` for backend/Postgres setup and local auth bypass. Use a separate production Nitro frontend process/port for final performance evidence; Vite dev is useful for interaction debugging, not acceptance timing. Inspect existing processes before starting or stopping services.
- **M8.3 — verified:** Use `$agent-browser` for real-browser validation. Load its current core workflow first, run all agent-browser commands outside the sandbox as required by AGENTS.md, and close every session started for this work.
- **M8.4 — verified:** Cover phone, tablet, and desktop navigation, keyboard focus, touch controls, lazy editor opening, selected Settings tabs, cached refresh failures, malformed/deep URLs, refresh recovery across tabs, masking, and all themes. Delay JavaScript/chart/API responses independently to verify first-paint behavior. Inspect actual network responses and hydration errors.
- **M8.5 — verified:** Update `frontend/README.md` with server-origin configuration and the SSR boundary, `frontend/docs/ui-conventions.md` with query/loader/cache ownership, and the validation report with measured outcomes and remaining limits.
- **M8.6 — verified:** Prepare backend-compatible-first release notes: deploy additive backend APIs before a frontend that requires them; verify the internal API origin in the existing frontend runtime. Use the repository's normal protected Deploy workflow only when deployment is requested. No infrastructure-topology change or live mutation is required to complete implementation validation.
- **M8.7 — verified:** Rollback order is frontend first, then backend if needed. Old clients retain the old endpoints. Preference cookies are optional hints that old clients can ignore. Keep private-response headers intact during rollback.
- **M8.8 — verified:** Performance budgets from milestone 1 pass with paired measurements, and payload/chunk/request-count improvements have concrete recorded evidence. Any remaining gap is explicit rather than marked complete by assumption.
- **M8.9 — verified:** All required focused tests and owning-app lint/typecheck/build checks pass; browser verification finds no blocking functional, auth, financial, responsiveness, or first-paint regression.
- **M8.10 — verified:** No generated client/route file was edited manually, no production data was copied into evidence, and all agent-browser sessions have been closed.
- **M8.11 — verified:** Validation and rollout/rollback notes are sufficient for a reviewer to assess the result without repeating the architecture investigation.

## Review and final verification

- verified: Review pass 1 fixes: anonymous error hydration, generation-bound request replay, mounted identity privacy, actual settings response reconciliation, Settings first paint, and primary Retry actions.
- verified: Owning-app lint/typecheck/build; 410 frontend tests; 114 backend auth/balance/FX tests, 26 portfolio integration regressions, and 2 separately enabled PostgreSQL tests.
- verified: Backend regression, PostgreSQL bounded-query tests, and 42 actual frontend financial differential cases.
- verified: Final paired browser measurements, preference/interaction/refresh captures, and report. All nine performance budgets pass; first-modal cost is explicitly recorded.
- verified: README, UI conventions, validation report, and backend-first rollout / frontend-first rollback instructions.
- verified: Three independent review passes completed. Final acceptance checked the complete evidence and all 83 scoped items: **No major issues remain.**
- verified: User-requested interactive explanation created and browser-checked at 360px dark and 736px light, including changed values after button activation. Implementation, verification, final review and requested explanation are complete.

## Inspected verification evidence

- Production manifest: [baseline](../frontend/docs/performance/baseline-bundles.json) and [final build](../frontend/docs/performance/after-bundles.json); main entry gzip 472,784 → 227,796 bytes.
- [Preference/browser report](../frontend/docs/performance/preferences/README.md): 19 first-paint cases plus anonymous hydration and settled two-tab logout; parent inspected phone masking and saved Settings screenshots.
- [Financial differential](../frontend/docs/performance/dashboard-parity.json): 42 actual frontend-transform cases. Backend SQL checks used disposable PostgreSQL; no user database was synchronized or modified.
- `frontend/scripts/verify-ssr.mjs` passes against final Nitro: two-user isolation, same-old-token concurrent recovery using the backend grace contract, safe headers/cookies, summary streaming, real first rows, selected Settings data, cold Home/Analysis Retry, and anonymous/transient sessions.
- `yarn test --maxWorkers=3`: 67 files / 410 tests pass. Frontend lint/typecheck/build pass; lint has three nonblocking require-await warnings. Backend lint/typecheck/build pass.
- Review pass 2 settings-write concurrency finding is fixed with a shared per-user queue and mounted-generation checks. Pass 3 read-only code review found no remaining major code issue.

- [Final comparison](../frontend/docs/performance/comparison.json): all nine budgets pass across 112 matched cold loads, 14 additional baseline chart captures and 112 measured interactions.
- [Browser completion](../frontend/docs/performance/interaction-completion.json): actual touch, 50→65 pagination, selected Settings queries, zero-request fresh navigation, and a real 31-second stale error/retry cycle pass.
- [Two-tab refresh](../frontend/docs/performance/refresh-qa.md): two concurrent 401s produce one coordinated refresh and two successful retries with HTTP-only cookie rotation, stable identity and no page errors.
- All task-owned browsers, synthetic API and baseline/final Nitro servers are closed. User dev processes and databases were left intact. No commit, push or deployment was performed.
