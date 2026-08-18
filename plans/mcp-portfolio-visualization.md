# MCP Portfolio Visualization

## Status

Implementation Complete — ChatGPT Host Follow-up Pending

## Goal

Replace the dashboard-like **Portfolio Viewer** MCP App with a selectively
invoked, mobile-first **Portfolio** visualization that answers one question:

> What do I own right now, and where is my portfolio concentrated?

The completed App must:

- show the latest available holdings for all investment accounts or an optional
  model-selected subset;
- normalize every valued position to USD on the server using the existing
  exchange-rate service and the position's snapshot date;
- combine the same security across accounts after USD normalization;
- show one truthful USD portfolio total and a ranked concentration view;
- show the top five positions plus expandable `Other`;
- offer only lightweight inline position detail, including contributing
  accounts, quantity, value, and available price/snapshot evidence;
- update model context minimally when a position is selected so conversational
  follow-ups such as “tell me more about this holding” resolve correctly;
- remain read-only, truthful across lifecycle transitions, and complete through
  text/structured fallback when MCP Apps UI is unavailable;
- use the official MCP Apps bridge through the pinned
  `@koonweee/mcp-kit/apps` runtime; and
- pass repeated official-host visual refinement loops at desktop, iPhone, and
  320 px widths before production rollout.

The implementation must explicitly compare a ranked-only layout with a
pie/donut-plus-ranked layout using real fixture data in the official host. The
production choice is made from recorded evidence, not assumed in advance, and
the rejected variant must not remain as dormant production UI.

The model owns interpretation and prose. The App owns a concise visualization
and exact supporting evidence. The general product contract is defined in
[`docs/mcp-app-product-guidance.md`](../docs/mcp-app-product-guidance.md).

## Current Behavior

- `backend/src/mcp/mcp.definition.ts` registers
  `show_portfolio_viewer(accountIds?)`. The tool concurrently loads latest
  holdings and the first 25 investment-activity rows, then returns a generic App
  envelope through `appToolResult()`.
- `backend/src/mcp/mcp-apps.ts` links the launcher to
  `ui://splice/portfolio-viewer/v2.html` with App identity
  `portfolio_viewer` and title `Portfolio Viewer`.
- `backend/src/mcp/apps/app-runtime.ts` renders a miniature dashboard with an
  account selector, latest/date mode, snapshot date, search, sort, activity
  filter, reload, four metric cards, allocation bars, an activity table with
  pagination, and a holdings table.
- The current browser renderer sums `institutionValue` values and chooses a
  display currency from one row. Because holdings may have different source
  currencies, that aggregate is not a truthful mixed-currency portfolio total.
- `McpReadService.listInvestmentHoldings()` already enforces user ownership and
  returns account/security identity, account name, snapshot date, quantity,
  price, native position value, and currency. It supports latest holdings or an
  explicit snapshot date.
- `CurrencyConversionService` and `CurrencyExchangeService` are already
  available to the MCP module. They can load historical rates for a reference
  date, but investment position values are decimal major-unit values. The new
  mapper must use decimal-safe major-unit conversion and must not accidentally
  feed those values to a helper whose contract expects smallest units.
- Manual brokerage valuation already uses `decimal.js`; reuse the same
  precision and rounding discipline rather than browser `number` arithmetic.
- `backend/src/mcp/apps/app-shell.ts` embeds one deterministic browser bundle and
  provides official-host theme, font, safe-area, responsive, and shared CSS.
- `backend/src/mcp/apps/build-app-runtime.mjs` regenerates
  `app-runtime.generated.ts`; `yarn build` runs that generator before Nest
  compilation.
- `backend/test/mcp/fixtures/serve-mcp-app-fixture.ts` currently provides only a
  minimal Portfolio holding/activity fixture. `backend/scripts/mcp-apps/visual.mjs`
  can capture the Portfolio App, but lacks Portfolio-specific cases and visual
  variants.
- The current checkout contains unrelated, already validated Cash Flow currency
  presentation changes in the shared App runtime/shell/tests/docs. Preserve
  those edits, plus unrelated `logs/`, `tmp/backups/`, and `tmp/recordings/`.

## Constraints And Fixed Product Decisions

- Read `backend/CLAUDE.md`, `backend/src/mcp/AGENTS.md`,
  `docs/mcp-app-product-guidance.md`, and the official-host section of
  `docs/mcp.md` before implementation.
- Keep the vanilla TypeScript, deterministic single-file embedded resource
  approach. Do not add React or another UI framework.
- Keep `@koonweee/mcp-kit` pinned exactly. Do not import ext-apps directly or
  implement a Splice-local bridge. If a general mcp-kit capability is missing,
  stop at that seam, fix/test/document/release mcp-kit, registry-verify it, then
  pin the new exact version in Splice.
- The App visualizes current ownership and concentration. It must not include
  investment activity, performance, gains/losses, historical comparison,
  trading, account administration, or transaction editing.
- Latest-only is intentional. Conversation may supply optional `accountIds`;
  the App has no account selector, snapshot-date control, search, sort, reload,
  tabs, or configuration toolbar.
- Combine contributions with the same stable `securityId` into one position
  after converting each contribution to USD. Keep account contributions as
  detail evidence, not primary rows.
- Normalize all values to USD on the server using the rate applicable to each
  holding's snapshot date. Display compact `$` values and one small footer,
  `All values in USD`, rather than repeating `USD` throughout the surface.
- Missing source currency, missing/invalid position value, missing required FX
  rate, unsafe numeric range, or an otherwise incomplete normalization must fail
  the primary visualization atomically with a safe public error. Never omit a
  position, mix currencies, or display a knowingly partial total.
- Empty authorized holdings are a purposeful empty state, not a failure.
- Show one headline total and top-five concentration evidence. `Other` is the
  sum of all remaining positions and expands in place.
- Tapping a position opens compact inline detail. Tapping `Other` reveals the
  remaining ranked positions. No separate detail page is introduced.
- Account allocation is not a second initial chart. Account names appear only
  in position detail or when the model scopes the invocation to accounts.
- The chart decision is deliberately open until the first refinement pass:
  compare ranked-only against pie/donut-plus-ranked using real fixture data.
  Evaluate whether the chart adds comprehension without duplicating labels or
  consuming the phone viewport. Retain exactly one final composition.
- A primary result failure replaces the App with the safe error state. A
  model-context failure stays localized/nonfatal and cannot discard valid data.
- No database migration, frontend route, generated frontend client, Auth0, DNS,
  ingress, or mcp-kit change is expected.

## Target Data Shape

Replace the launcher with this model-facing input contract:

```ts
type VisualizePortfolioInput = {
  accountIds?: string[]; // optional user-owned investment-account subset
};
```

Return a strict visualization payload inside the existing App envelope:

```ts
type PortfolioAccountContribution = {
  accountId: string;
  accountName: string | null;
  snapshotDate: string;
  quantity: string | null;
  valueUsd: McpMoney; // positive USD major-unit value
  priceUsd: McpMoney | null;
};

type PortfolioPosition = {
  securityId: string;
  securityName: string | null;
  tickerSymbol: string | null;
  type: string | null;
  subtype: string | null;
  quantity: string | null;
  valueUsd: McpMoney;
  allocationBps: number; // exact bounded basis points; UI formats percentage
  contributions: PortfolioAccountContribution[];
};

type PortfolioVisualizationData = {
  reportingCurrency: "USD";
  totalValueUsd: McpMoney;
  snapshotRange: {
    earliest: string;
    latest: string;
  } | null;
  selectedAccountIds?: string[];
  positions: PortfolioPosition[]; // descending value, stable tie-break
};
```

Implementation rules for this shape:

- Author a dedicated strict Zod schema; do not hide the visualization behind
  `z.unknown()` or reuse the generic holdings output schema.
- Call `listInvestmentHoldings(userId, { accountIds, latestOnly: true })` once.
  Do not load investment activity.
- Normalize currency codes before lookup. Fetch the required source-to-USD rate
  for each distinct `(currency, snapshotDate)` pair, including identity rate
  `1` for USD.
- Convert decimal major-unit position values with `decimal.js`, round to USD
  precision at the output boundary, and reject nonfinite/unsafe results. Do not
  use floating-point browser arithmetic for portfolio totals or percentages.
- Normalize prices with the same source/date rate when present. If price or
  quantity is absent, keep it `null`; a missing optional detail field must not
  invalidate an otherwise fully valued position.
- Aggregate by stable `securityId`. Sum USD value and compatible quantities,
  retain sorted account contributions, and use deterministic identity/name
  tie-breaks. If quantities are not safely additive, expose aggregate quantity
  as `null` and preserve contribution quantities.
- Compute portfolio total from normalized position values. Compute allocation
  basis points using decimal arithmetic and deterministic rounding; ensure the
  rendered top rows plus `Other` truthfully represent the complete total.
- Define and test an explicit policy for zero or negative position values before
  rendering percentages. The default implementation should reject unsupported
  negative exposures safely rather than presenting a misleading long-only
  allocation; zero-value positions may remain detail-only or be omitted from
  the ranked allocation only when the payload discloses that policy.
- `snapshotRange` is `null` for an empty portfolio. When accounts have different
  latest dates, show the range factually rather than implying a single common
  valuation instant.
- Keep `list_investment_holdings` and `list_investment_activity` as independent
  headless tools. Their current non-App callers and schemas remain valid.
- Keep JSON text fallback structurally equivalent to `structuredContent`, so a
  non-App client can answer the same portfolio question.

## Milestones

### 1. Capture The Baseline And Lock The Acceptance Scorecard

Implementation tasks:

- Run the current focused MCP App tests, typecheck, and deterministic App build
  before changing the Portfolio launcher.
- Capture the current populated and empty Portfolio Viewer through the tagged
  official host under stable `tmp/recordings/mcp-apps/` directories.
- Record desktop dark, iPhone dark/light, and 320 px hierarchy, rendered height,
  above-the-fold content, control density, overflow, loading transition, console
  errors, page errors, and network boundary.
- Add an execution log to this plan. Every iteration records evidence location,
  findings, changes, and pass/fail result.
- Use this scorecard for every variant and refinement pass:
  - total USD value and the largest concentrations are understandable without
    interaction;
  - useful holdings evidence appears above the fold on a phone;
  - no activity, date, account, reload, search, sort, or dashboard controls
    remain;
  - long security/account names and large values remain readable;
  - a chart, if retained, adds comprehension rather than repeating the ranked
    list or pushing it below the phone viewport;
  - inline detail and `Other` disclosure have clear 44 px touch targets, focus
    states, and expanded semantics;
  - no horizontal overflow exists at 320 px or iPhone 12 width;
  - dark/light theme, reduced motion, and safe-area padding match the host;
  - loading, empty, normalization failure, and context failure are truthful;
  - only current authenticated result data is rendered; and
  - page-error, severe-console, sensitive-log, and unexpected-network lists are
    empty.

Exit criteria:

- Baseline tests and `yarn build:mcp-apps` pass.
- Before screenshots/contact sheets/videos are captured and logged.
- The scorecard—not aesthetic preference alone—is the acceptance contract.

### 2. Introduce The Selective Portfolio Contract And USD Normalization

Implementation tasks:

- Replace `show_portfolio_viewer` with `visualize_portfolio`. Keep the overall
  tool count unchanged; do not retain a duplicate legacy alias.
- Use title `Visualize Portfolio` and selective wording that recommends the App
  for portfolio value, ownership, allocation, exposure, or concentration
  questions. Discourage use for capability discovery, hypothetical discussion,
  metadata questions, or simple facts that prose answers clearly.
- Add the exact input/output schemas above in `backend/src/mcp/mcp-schemas.ts`.
- Implement a focused server-side Portfolio visualization mapper/service using
  `McpReadService`, `CurrencyConversionService`, and decimal-safe aggregation.
  Keep all ownership checks before data loading and all FX/valuation failures
  inside the existing sanitized MCP error boundary.
- Load latest holdings only. Remove the launcher dependency on
  `listInvestmentActivity()`.
- Update `backend/src/mcp/mcp-apps.ts` to identity `portfolio`, title
  `Portfolio`, launcher `visualize_portfolio`, and cache-busting resource URI
  `ui://splice/portfolio/v3.html`. Preserve canonical domain, enforced CSP,
  `splice:read`, border preference, and OpenAI compatibility metadata.
- Update current inventory, guide resource, fallback copy, tool/resource link,
  fixtures, and current protocol assertions. Historical plans may retain the old
  name when clearly labeled historical.

Exit criteria:

- Discovery contains `visualize_portfolio` exactly once and not
  `show_portfolio_viewer`.
- Tool and resource both require `splice:read`, remain read-only, and link to the
  exact `v3` URI.
- Same-currency, mixed-currency, multi-date, same-security/multi-account, empty,
  missing-rate, missing-value, unsafe-range, and unauthorized-account tests
  pass.
- No activity service call occurs through the visualization launcher.
- Structured and JSON text fallback both contain the complete typed USD result.
- `validateMcpApps(..., { profile: 'openai-submission' })` passes for Portfolio
  and Cash Flow.

### 3. Build A Pure Typed Portfolio Presentation Model

Implementation tasks:

- Extract Portfolio-specific presentation logic from the generic browser
  renderer into `backend/src/mcp/apps/portfolio-model.ts` (or equivalently
  focused module) while keeping it in the deterministic bundle.
- Implement pure transformations for:
  - descending position ranking with stable tie-breaks;
  - top five plus exact summed `Other`;
  - expansion of remaining positions;
  - selected-position validation against the current generation;
  - concise snapshot-range and account-contribution labels;
  - percentage formatting from basis points;
  - compact `$` formatting with a single USD footer; and
  - the minimum model-context selection payload.
- Keep the App query immutable for one invocation. There are no DOM-driven
  account/date/filter helper arguments.
- Preserve lifecycle generation boundaries. Loading, replacement, primary
  error, cancellation, and teardown clear selected position, expanded `Other`,
  and context state; late context completions cannot republish stale identities.
- Add focused pure-model tests for one/five/more-than-five holdings, ties, same
  security across accounts, long labels, absent optional detail, multiple
  snapshot dates, zero total, empty result, and exact `Other` arithmetic.

Exit criteria:

- Portfolio calculations are independently testable without the DOM or host.
- Cash Flow behavior and tests remain unchanged.
- No position, account, amount, selection, or expansion can survive a new
  primary generation incorrectly.
- Two consecutive browser bundle builds are byte-identical.

### 4. Compare Ranked And Pie/Donut Visual Variants

Implementation tasks:

- Use `$imagegen` once before material UI implementation to generate a contact
  sheet containing three or four constrained mobile Portfolio concepts. Include
  at least one ranked-only concept and one pie/donut-plus-ranked concept. Prompt
  for the fixed real content hierarchy, not generic finance-dashboard chrome.
- Record accepted and rejected ideas in this plan. Treat generated copy, values,
  colors, and layouts as ideation only—not fixtures, requirements, or validation
  truth.
- Implement two temporary, explicitly selectable development variants over the
  same typed fixture result:
  1. **Ranked-only:** headline total followed immediately by top-five bars and
     `Other`.
  2. **Pie/donut-plus-ranked:** one compact allocation chart paired with the
     same ranked evidence, with accessible text and no chart-only information.
- Add a test/harness-only `--variant ranked|pie` route or fixture selection. Do
  not add an end-user toggle or expose the variant through the production tool
  schema.
- Capture both variants through a real authenticated tool call, v3 resource
  read, and official sandbox using identical desktop dark, iPhone dark/light,
  320 px, long-label, two-position, and eight-plus-position data.
- Compare them against the scorecard, specifically:
  - time to identify the largest holding and its percentage;
  - whether the first five positions remain above/near the phone fold;
  - label legibility and color dependence;
  - duplicated information and vertical cost;
  - behavior with highly concentrated and nearly even portfolios; and
  - usefulness in screenshots embedded in a conversational answer.
- Record the decision and evidence. Delete the losing production branch, CSS,
  and runtime code. Keep only narrowly useful fixture/harness support if it is
  clearly labeled as historical comparison evidence; otherwise remove that too.

Exit criteria:

- Both variants are captured with the same truthful data and host conditions.
- The selected design has a written evidence-based rationale.
- Exactly one visual composition remains in the production bundle.
- If the chart wins, the ranked list remains the accessible source of exact
  labels/values; if it loses, no dormant canvas/SVG/chart code remains.

### 5. Implement The Curated Mobile-First Portfolio View

Implementation tasks:

- Build the winning composition with this stable hierarchy:
  1. `Portfolio`, current/latest-available context, and safe status;
  2. one headline total in USD;
  3. top-five concentration evidence and `Other`;
  4. inline detail immediately after the selected row; and
  5. compact snapshot/currency disclosure, including `All values in USD`.
- Remove the account selector, latest/date mode, snapshot date, search, sort,
  activity filter, reload, metric-card grid, activity panel/table/pagination, and
  holdings table.
- Use a restrained, consistent palette and exact text/value labels. Never rely
  on color or chart geometry alone.
- Expand `Other` in place into the remaining ranked positions. Do not treat the
  aggregate `Other` row as a selectable security.
- Selecting a position opens inline detail with value, allocation, combined
  quantity when valid, price when valid, contributing account names/values, and
  truthful snapshot date/range. Start concise and reveal all contributions only
  if needed for readability.
- Render empty holdings as a short purposeful state. Render normalization or
  primary failures as a safe generic unavailable state with no stale data.
- Preserve official host theme, fonts, safe-area element, reduced motion,
  keyboard navigation, visible focus, and at least 44 px touch targets.
- Regenerate `app-runtime.generated.ts` only through `yarn build:mcp-apps`.

Exit criteria:

- The view answers the fixed product question without dashboard controls.
- Total, top concentrations, `Other`, selection detail, empty, and error states
  render correctly with realistic values and long names.
- Phone layouts have no horizontal overflow, truncated critical values,
  overlapping host chrome, or inaccessible offscreen interaction.
- Loading/error shells contain no fixture or previous-generation business data.

### 6. Connect Minimal Model Context

Implementation tasks:

- On a real user position selection, call typed
  `mcpRuntime.app.updateModelContext()` with only:
  - visualization identity `portfolio`;
  - reporting currency `USD`;
  - security ID, display name, and ticker;
  - position USD value and allocation basis points;
  - contributing account display names; and
  - snapshot range.
- Do not send raw provider payloads, full holdings arrays, account IDs, messages,
  action requests, or write instructions through model context.
- Closing selection publishes a minimal cleared selection. New results, errors,
  cancellation, and teardown best-effort clear previously published selection
  before discarding local state.
- Treat context failure as nonfatal/private. Guard all async continuations with
  generation/request identity.
- Add regressions for select, deselect, replacement, primary error, context
  rejection, late resolution/rejection, and teardown.

Exit criteria:

- A follow-up such as “tell me more about this holding” resolves to the selected
  security without leaking unnecessary account or portfolio data.
- Selection context cannot outlive the current authenticated primary result.
- No App interaction invokes a write tool or mutates Splice data.

### 7. Run The UI Refinement Loops

Implementation tasks:

- Expand `serve-mcp-app-fixture.ts` with deterministic Portfolio cases covering:
  - eight or more positions, including a dominant holding and nearly even set;
  - one security contributed by multiple accounts;
  - mixed source currencies normalized to USD;
  - multiple latest snapshot dates;
  - long security and account names;
  - absent optional price/quantity;
  - exact top-five/`Other` arithmetic;
  - empty holdings;
  - primary FX/valuation failure; and
  - context failure in runtime tests.
- Keep identities obviously test-owned and values in the domain's actual units
  before server normalization.
- Extend `visual.mjs` with Portfolio-specific `--case` selections and the
  temporary visual-variant selector required by Milestone 4. Preserve real MCP
  call, resource read, official sandbox, console/page-error/network capture,
  loading-to-ready recording, contact sheets, and automatic cleanup.
- Run at least three post-selection refinement passes:
  1. **Information hierarchy:** total and concentration scan correctly on phone;
     selected chart/list decision survives realistic portfolios.
  2. **Exploration:** refine row selection, inline detail, `Other`, long account
     contributions, close/return state, and localized failure behavior.
  3. **Responsive/accessibility polish:** refine 320 px, iPhone dark/light,
     desktop, large values, long labels, touch/focus order, safe area, and motion.
- After every pass: run focused tests, rebuild, capture the official host to a
  stable directory, inspect every still/contact sheet/WebM/JSON artifact at
  100%, record findings, and fix every major issue before continuing.
- Keep one Cash Flow isolation capture in the final pass because shell/runtime
  changes are shared.
- Perform ChatGPT Web and mobile/iOS smoke after deployment; the tagged official
  host cannot prove host-specific embedding and cache behavior.

Exit criteria:

- Variant comparison plus three refinement passes are documented with evidence.
- No major visual, responsive, accessibility, lifecycle, console, privacy, or
  network issue remains.
- Automated evidence proves the real `visualize_portfolio` call, v3 resource,
  official sandbox, and production-equivalent data path.
- Production bundle contains no fixture labels, IDs, dates, values, or rejected
  variant code.

### 8. Complete Regression, Documentation, Review, And Rollout Gates

Implementation tasks:

- Update MCP service/runtime/App tests for exact inventory, selective wording,
  typed USD contract, scope/risk, v3 linkage, fallback parity, authorization,
  lifecycle, and old-name absence.
- Update `backend/README.md`, `docs/mcp.md`, MCP guide resource,
  `docs/mcp-app-product-guidance.md`, and `plans/index.md` with the implemented
  Portfolio contract, chosen visual variant, USD normalization policy, evidence
  loop, ChatGPT refresh requirement, and rollback procedure.
- Add artifact scans rejecting fixture data and stale
  `show_portfolio_viewer`/`portfolio-viewer/v2` strings outside clearly marked
  historical records.
- Run an independent read-only review focused on valuation/currency correctness,
  atomic completeness, authorization, fallback parity, stale-data/privacy,
  context minimization, selected visual rationale, responsive UI, and official
  bridge use. Fix every major issue and re-review.
- Run frozen install, focused/full backend validation, deterministic bundle
  comparison, Node 24 image build, Compose rendering, and diff/format checks.
- Deploy only through the protected `main` to `deploy` workflow after every
  local/review gate passes.
- In ChatGPT developer mode, run Refresh/Scan Tools and use a fresh conversation.
  No OAuth reconnect, Auth0, DNS, or ingress change is expected.
- Smoke prompts must include: portfolio value/concentration (should render), a
  selected holding follow-up, account-scoped portfolio, a simple holding fact
  (prefer prose when sufficient), investment activity (must not invoke this
  visualization merely because it concerns investments), and a capability/meta
  question (must not render).
- Verify ChatGPT Web and mobile/iOS loading, total, ranking/chart, `Other`, detail,
  USD footer, model context, themes, safe area, and stale-data boundaries.
- Record application/deploy revisions, image digest, resource URI, refresh time,
  screenshots/videos, sanitized log result, and rollback inputs in `docs/mcp.md`.

Exit criteria:

- Focused MCP Apps, all MCP, full backend, typecheck, lint, build, Node 24 image,
  Compose, documentation, and `git diff --check` gates pass.
- Two consecutive App bundle builds are byte-identical.
- Independent re-review reports no major issue.
- Production discovery exposes exactly `visualize_portfolio` linked to v3, and
  no retired launcher.
- Selective desktop/mobile ChatGPT smokes pass and rollback evidence is durable.

## Tests

### Backend And Protocol

- Exact discovery inventory: new launcher once, old launcher absent.
- Input: omitted/account-scoped IDs, duplicate IDs, invalid UUID, unowned ID.
- Delegation: latest holdings only, no activity call, authenticated user binding.
- FX: USD identity, mixed currencies/date pairs, filled historical rate, missing
  rate, invalid rate, missing value/currency, unsafe aggregate, atomic failure.
- Aggregation: same security across accounts, stable sorting, quantity policy,
  account contributions, top-level total, basis-point rounding, snapshot range.
- Empty and unsupported negative-exposure policy.
- Output: strict schema, USD money semantics, App envelope, JSON text parity.
- Resource: `splice:read`, v3 URI, domain/CSP/border, MIME, linkage, OpenAI
  submission validation.

### Browser Runtime And Presentation

- Pure top-five/`Other`, ties, long labels, large values, empty, and missing
  optional detail.
- Selected position inline ordering, account contributions, `Other` expansion,
  close, model-context payload, and clearing.
- Loading, ready, primary error, context error, cancellation, teardown, repeated
  invocation, and stale async completion.
- Compact `$` formatting and one `All values in USD` disclosure.
- Rejected visual variant absent from production artifact.
- Cash Flow isolation after shared shell/runtime edits.

### Visual And Host Validation

- Baseline current Viewer.
- Ranked-only and pie/donut-plus-ranked comparison using identical fixtures.
- Final populated/concentrated/even/multi-account/long-label/empty/error cases.
- Desktop dark, iPhone dark/light, and narrow 320 px screenshots/contact sheets.
- Loading-to-ready and selection/`Other` interaction recordings.
- No page errors, sensitive console output, or unexpected external network.
- Final ChatGPT Web and mobile/iOS smoke after Scan Tools.

## Validation Commands

Focused implementation loop:

```bash
cd backend
yarn test --runInBand test/mcp/mcp-portfolio-model.spec.ts
yarn test --runInBand test/mcp/mcp-app-runtime.spec.ts test/mcp/mcp.service.spec.ts
yarn typecheck
yarn lint
yarn build:mcp-apps
yarn mcp-apps:dev --scenario populated
```

Official-host evidence loop:

```bash
cd backend
yarn test:mcp-apps
yarn mcp-apps:visual --app portfolio --scenario populated
yarn mcp-apps:visual --app portfolio --scenario empty
yarn mcp-apps:visual --app portfolio --scenario primary-error
```

During Milestone 4, use the implemented test-only variant selector for identical
ranked and pie captures. Remove or narrowly quarantine it after the decision.

Final repository validation:

```bash
cd backend
yarn install --frozen-lockfile
yarn typecheck
yarn lint
yarn test --runInBand test/mcp
yarn test --runInBand
yarn build
docker build -t splice-backend:portfolio-v3 .
docker run --rm --entrypoint node splice-backend:portfolio-v3 --version
```

Artifact checks:

```bash
cd backend
yarn build:mcp-apps
yarn ts-node -r tsconfig-paths/register \
  test/mcp/fixtures/render-mcp-app-resource.ts \
  /tmp/splice-mcp-app-resources
rg -n "fixture-|Rendering local fixture|show_portfolio_viewer|portfolio-viewer/v2" \
  /tmp/splice-mcp-app-resources src/mcp/apps/app-runtime.generated.ts
```

The final search must return no production artifact match. Historical plan and
rollout records may retain retired names when clearly labeled historical.

## UI Refinement Log

Populate during execution. Do not mark the plan complete without the variant
decision, three refinement passes, and final independent review.

| Pass                            | Evidence directory                                                                                                                                                                                                                                   | Major findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Changes made                                                                                                                                                                                                                                         | Result |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Baseline                        | `tmp/recordings/mcp-apps/portfolio-v2-baseline-populated/`; `tmp/recordings/mcp-apps/portfolio-v2-baseline-empty/`                                                                                                                                   | The legacy view put six controls and a reload action before useful evidence on phone, split one question across allocation/activity/holdings, and rendered zero-value dashboard chrome instead of a purposeful empty state. The official-host traces observed the real `show_portfolio_viewer` call, v2 resource read, and sandbox load with no page errors or external network requests.                                                                                                                                                                                                                                                                                                                                                                                                                 | None; this pass records the pre-change contract. Focused MCP Apps tests (4 suites/77 tests), typecheck, and deterministic App build passed before implementation.                                                                                    | Pass   |
| Ranked versus pie/donut         | `tmp/recordings/mcp-apps/portfolio-v3-variant-ranked/`; `tmp/recordings/mcp-apps/portfolio-v3-variant-donut/`                                                                                                                                        | Ranked placed the first holding immediately after the total. The donut duplicated the ranked data, added substantial phone-height cost, relied on unlabeled color/geometry, and pushed exact evidence lower without making the 45% dominant position easier to identify. Both used the same authenticated concentrated fixture, v3 tool/resource, responsive host settings, and clean browser/network boundary.                                                                                                                                                                                                                                                                                                                                                                                           | Selected ranked-only. Removed the donut runtime/CSS/tests and temporary input selector from the production bundle and ongoing harness.                                                                                                               | Pass   |
| Information hierarchy           | `tmp/recordings/mcp-apps/portfolio-v3-information-hierarchy-final/`                                                                                                                                                                                  | The total and first ranked position are immediately visible, while concentrated, nearly-even, two-position, and long-label portfolios preserve exact totals, ordering, top-five/`Other` arithmetic, and snapshot disclosure. Official-host validation exposed a binary-float `multipleOf: 0.01` false rejection for a correctly rounded FX price; the schema boundary was corrected to semantic Decimal cent validation before this pass was accepted. Sixteen responsive captures, four loading-to-ready WebMs, and their browser evidence were reviewed with no page, console, or network failure.                                                                                                                                                                                                      | Kept the ranked-only composition, corrected the cent-validation boundary, added deterministic fixture shapes, and made the harness wait for the App region before capture.                                                                           | Pass   |
| Exploration                     | `tmp/recordings/mcp-apps/portfolio-v3-exploration-final-d986/`                                                                                                                                                                                       | The frozen bundle (`sha256:d9869b308e1234b9a250695f844b8a7d3a1e708a3facc9f21cf97f7ec30fe7d0`) was exercised through the authenticated official host on 2026-08-18 UTC. Selecting a position opens inline evidence and publishes a 527-character minimal Portfolio model context; `Other` expands, a long-tail position can be selected, and collapsing `Other` clears its hidden selection and restores exact context `{ "visualization": "portfolio", "selection": null }`. Every still, the 5.5-second interaction WebM and review sheet, and the JSON evidence summary were inspected with no page/console error or unexpected network origin/status. Focused runtime regressions cover select/deselect, result replacement, nonfatal context rejection, late completion, primary error, and teardown. | Added inline detail, limited initially visible account contributions with on-demand expansion, made `Other` collapse clear a hidden selection and model context, and recaptured the interaction after the final context privacy/race fix.            | Pass   |
| Responsive/accessibility polish | `tmp/recordings/mcp-apps/portfolio-v3-responsive-polish-final/`; `tmp/recordings/mcp-apps/portfolio-v3-empty-final/`; `tmp/recordings/mcp-apps/portfolio-v3-primary-error-final/`; `tmp/recordings/mcp-apps/portfolio-v3-cash-flow-isolation-final/` | Desktop dark, iPhone dark/light, and 320 px captures preserve long labels and values without horizontal overflow. Empty and safe primary-error states remain purposeful, and Cash Flow remains unchanged. Every contact sheet and still plus all four 1.75-second loading-to-ready WebMs were reviewed; 48 page-error, console, and network JSON files contain no page error, severe console error, external request, or bad HTTP status.                                                                                                                                                                                                                                                                                                                                                                 | Added a 450 ms responsive settle and reliable visible-App-region capture, preserved host theme/safe-area behavior, and removed every rejected variant and fixture-only production seam.                                                              | Pass   |
| Final independent review        | Frozen tree; exact final host evidence at `tmp/recordings/mcp-apps/portfolio-v3-exploration-final-d986/`                                                                                                                                             | Independent review found and drove fixes for stale model context during failed selection replacement and lifecycle-clear rejection/races, missing unowned-account and invalid-UUID acceptance regressions, and stale current-v2 operator guidance. Re-review covered the frozen server, runtime, tests, runbook, and exact final host evidence and concluded: “No major issues remain.”                                                                                                                                                                                                                                                                                                                                                                                                                   | Track the last successfully published identity, retry failed clears and restore newer context after stale clears; add ownership/input regressions; update current v3 runbook guidance; recapture exploration against the final deterministic bundle. | Pass   |

### ImageGen ideation record

- Contact sheet:
  `/Users/jtkw/.codex/generated_images/01a00cc6-ceac-78d2-a5ae-62cad0928fb6/exec-b812ee5a-ea17-4140-a625-075d471a09b3.png`
- Accepted: concept A's ranked hierarchy and inline detail. Concept B was used
  as the real chart challenger, then rejected after official-host comparison
  because the donut duplicated evidence and consumed scarce phone height.
- Rejected during ideation: concept C's solid pie because its labels were
  crowded and meaning depended too heavily on color; concept D's deterministic
  insight card because it duplicated model interpretation and added dashboard
  chrome.
- Generated copy, amounts, colors, and layouts are ideation only. The real
  official-host ranked-versus-donut comparison remains the design authority.

### Local visual-validation record

- Stable acceptance evidence is the three final refinement directories and the
  empty, primary-error, and Cash Flow isolation directories listed above.
  Earlier or superseded captures are diagnostic history, not acceptance
  evidence.
- The information-hierarchy pass covers all four portfolio shapes at every
  supported viewport and includes one reviewed loading-to-ready WebM per shape.
- The exploration pass records collapsed, primary-selected, expanded-`Other`,
  long-tail-selected, and return-to-collapsed states plus the interaction
  recording and exact selected/cleared host model-context observations. Its
  evidence summary pins the final deterministic bundle SHA.
- Every responsive still, contact sheet, WebM, and browser JSON artifact in the
  final directories was inspected. Protected deployment, metadata refresh,
  live ChatGPT Web rendering, selective prose routing, and sanitized production
  logging now pass and are recorded in `docs/mcp.md`. ChatGPT Web still ignores
  the standards-based selected-holding model context on the next manually typed
  turn, and native ChatGPT iOS smoke remains operator work.

## Risks And Deferred Work

- **FX completeness:** the visualization intentionally fails rather than show a
  partial or mixed-currency total. Rate freshness/coverage must be measured with
  real production holdings before rollout.
- **Major/minor units:** existing investment holdings expose decimal major-unit
  values while some shared conversion helpers accept smallest units. The typed
  mapper and tests must make this boundary explicit.
- **Snapshot skew:** latest holdings may come from different dates. Display the
  range; do not imply one synchronized market close.
- **Negative exposure:** short/negative positions need explicit gross/net
  semantics. This plan defaults to safe rejection rather than inventing them.
  Add a separate product decision if real data requires short support.
- **Performance:** returns, cost basis, and historical change are intentionally
  deferred to a separate focused visualization.
- **Investment activity:** activity remains a headless capability and is not
  part of Portfolio. Consider a separate visualization only after demonstrated
  conversational demand.
- **Tool/resource cache:** the hard rename and v3 URI require ChatGPT Scan Tools
  and a fresh conversation, but should not require reconnecting OAuth.
- **Chart choice:** ImageGen and variants are ideation/evidence tools. A pie or
  donut is not automatically accepted merely because it was requested for
  comparison.
- **Host automation boundary:** preserve the official sandbox. Use protocol
  tests and same-session evidence rather than adding bridge workarounds if outer
  automation cannot click cross-origin controls.
- **Cash Flow isolation:** the Apps share a runtime and shell. Preserve the
  current Cash Flow contract and run its focused tests/capture after shared
  changes.

## Overall Exit Criteria

- `show_portfolio_viewer`/v2 is replaced by one selectively described
  `visualize_portfolio` tool linked to the Portfolio v3 resource.
- The server returns a strict, complete, user-owned, latest-only USD portfolio
  with decimal-safe FX conversion and security-level aggregation.
- The App shows one headline total, top-five concentration evidence, expandable
  `Other`, inline position/account detail, snapshot disclosure, and one USD
  footer—with no dashboard controls or investment activity.
- Ranked-only and pie/donut variants are compared in the official host; exactly
  one evidence-backed composition ships.
- Selection updates only minimum model context and cannot leak across result,
  error, cancellation, or teardown boundaries.
- Authorization, fallback, safe-error, stale-data, fixture-exclusion, and
  deterministic-build invariants hold.
- Three refinement passes and final independent review leave no major product,
  visual, responsive, accessibility, console, network, privacy, valuation, or
  protocol issue.
- Full backend validation, Node 24 image, Compose checks, protected deployment,
  ChatGPT refresh, Web/mobile smoke, logs, evidence, and rollback records are
  complete.
