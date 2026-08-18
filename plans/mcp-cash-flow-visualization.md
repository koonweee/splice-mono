# MCP Cash Flow Visualization

## Status

Done

## Goal

Replace the current dashboard-like **Cashflow Explorer** MCP App with a
selectively invoked, mobile-first **Cash Flow** visualization that supports a
ChatGPT answer with concise visual evidence.

The completed App must:

- show how money moved during an exact model-supplied period;
- keep net cash flow, inflow versus outflow, and the most important category
  contributors visually primary;
- default to outflow categories and support an explicit income focus;
- support an optional, model-supplied comparison period without forcing a
  comparison into every invocation;
- show the top five categories, expandable `Other`, and explicit
  `Uncategorized` data;
- provide inline, largest-first transaction evidence with three rows initially
  and small incremental expansion;
- update model context when a category is selected so conversational references
  such as “why is this so high?” resolve correctly;
- explain rule/neutralization effects only through a compact conditional
  adjustment summary;
- remain read-only, truthful across lifecycle transitions, and useful through
  text/structured fallback on clients without MCP Apps;
- use the official MCP Apps bridge through the pinned
  `@koonweee/mcp-kit/apps` runtime; and
- pass repeated official-host visual refinement loops at desktop and phone
  widths before production rollout.

The model owns interpretation and prose. The App owns visualization and
supporting evidence. The target product contract is defined in
[`docs/mcp-app-product-guidance.md`](../docs/mcp-app-product-guidance.md).

## Current Behavior

- `backend/src/mcp/mcp.definition.ts` registers
  `show_cashflow_explorer(startDate, endDate)`. The tool calls
  `TransactionAnalysisService.getAnalysis()` and returns an App envelope through
  `appToolResult()`.
- `backend/src/mcp/mcp-apps.ts` links the launcher to
  `ui://splice/cashflow-explorer/v2.html` with the user-facing title
  `Cashflow Explorer`.
- `backend/src/mcp/apps/app-runtime.ts` renders a general-purpose surface with
  date inputs, a `This month` preset, reload, search, inflow/outflow controls,
  four metric cards, two side-by-side panels, an audit panel, and table-based
  transaction drilldown.
- The current App can call `get_cashflow_analysis`,
  `list_cashflow_category_transactions`, and
  `get_cashflow_analysis_audit` through the typed mcp-kit browser client.
- `TransactionAnalysisService.getAnalysis()` already returns sorted category
  aggregates, reporting currency, inflow/outflow/net totals, and uncategorized
  totals. `getCategoryTransactions()` returns the rule-adjusted real
  transactions for a category, currently newest-first. `getAnalysisAudit()`
  returns excluded rows and neutralized pairs.
- `backend/src/mcp/mcp-schemas.ts` validates the existing cash-flow analysis,
  category-transaction, audit, and generic App output contracts, but the App
  output schema does not describe a primary/comparison visualization payload.
- `backend/src/mcp/apps/app-shell.ts` embeds one deterministic browser bundle and
  provides host theme, font, safe-area, responsive, and shared component CSS.
- `backend/src/mcp/apps/build-app-runtime.mjs` bundles the browser runtime into
  `app-runtime.generated.ts`; `yarn build` regenerates it before the Nest build.
- `backend/test/mcp/fixtures/serve-mcp-app-fixture.ts` provides authenticated
  `populated`, `empty`, and `helper-error` scenarios through the real runtime.
- `backend/scripts/mcp-apps/dev.mjs` runs the tagged official ext-apps host and
  rebuilds the App on source changes. `backend/scripts/mcp-apps/visual.mjs`
  invokes real tools through that host and records desktop-dark, iPhone-dark,
  iPhone-light, loading-to-ready video, console, page-error, and network
  evidence.
- The current checkout already contains the two-App retirement work and the
  standardized mcp-kit Apps runtime. Preserve those changes and all unrelated
  `logs/`, `tmp/backups/`, and `tmp/recordings/` content.

## Constraints And Fixed Product Decisions

- Read `backend/src/mcp/AGENTS.md`, `backend/CLAUDE.md`,
  `docs/mcp-app-product-guidance.md`, and the official-host section of
  `docs/mcp.md` before implementation.
- Keep the current vanilla TypeScript, single-file embedded resource approach.
  Do not add React or another UI framework for this focused view.
- Keep `@koonweee/mcp-kit` pinned exactly. Do not import ext-apps directly or
  implement a Splice-local bridge. If a general mcp-kit capability is missing,
  stop at that seam, fix/test/document/release mcp-kit, registry-verify it, and
  then pin the new exact version in Splice.
- The App visualizes flows over a period. It must not include balances, net
  worth, holdings, budgeting, goals, transaction editing, recategorization, or
  rule management.
- Conversation supplies dates, direction, comparison, and optional category
  focus. The App has no date picker, preset, reload, search, or general
  configuration toolbar.
- Use one stable visual grammar. Do not add Sankey, donut, alternate chart, or
  dashboard modes in this plan.
- Default category direction is outflow. The tool may explicitly request
  inflow. Do not expose an in-App direction switch in the initial design.
- The App contains no model-generated insight text. It may show exact values,
  exact deltas, factual labels, data-quality states, and an adjustment summary.
- Category selection is read-only. It may update model context, but it must not
  automatically send a message, call a write tool, or mutate Splice data.
- A primary tool/result failure replaces the App with the safe error state. A
  secondary drilldown or model-context failure stays localized and must not
  discard the valid primary visualization.
- A comparison is all-or-nothing: when explicitly requested, failure to load or
  validate either period returns the safe tool error instead of displaying a
  misleading partial comparison.
- No database migration, frontend route, generated frontend API client, Auth0,
  DNS, ingress, or mcp-kit change is expected.

## Target Data Shape

Revise the App launcher to this model-facing input contract:

```ts
type VisualizeCashFlowInput = {
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string; // YYYY-MM-DD, inclusive
  direction?: "outflow" | "inflow"; // defaults to outflow
  focusCategoryPrimary?: string;
  comparison?: {
    startDate: string; // exact model-selected range; never inferred by the App
    endDate: string;
  };
};
```

Return a typed visualization payload inside the existing App envelope:

```ts
type CashFlowAdjustmentSummary = {
  affected: boolean;
  excludedTransactionCount: number;
  neutralizedPairCount: number;
};

type CashFlowPeriod = {
  analysis: CashflowAnalysisOutput;
  adjustments: CashFlowAdjustmentSummary;
};

type CashFlowVisualizationData = {
  presentation: {
    direction: "outflow" | "inflow";
    focusCategoryPrimary?: string;
  };
  current: CashFlowPeriod;
  comparison?: CashFlowPeriod;
};
```

Implementation rules for this shape:

- All dates are exact inclusive ranges and must pass `assertDateRange()`.
- `comparison.startDate` and `comparison.endDate` must be supplied together by
  virtue of the nested object schema. Do not silently infer a previous period.
- Reuse `mcpCashflowAnalysis()` so all money remains normalized to major units
  with explicit currency and sign.
- Build adjustment counts from the current audit discriminant: `excluded` rows
  count excluded transactions and `neutralized` rows count neutralized pairs.
  Do not include raw audit transactions or rule internals in the visualization
  payload.
- Load analysis and audit for a requested period concurrently. When comparison
  is present, load both complete period pairs concurrently and fail atomically.
- Ignore `focusCategoryPrimary` when that identity is absent from the selected
  direction in the current result. Never retain it across a later result that
  does not contain it.
- Keep `get_cashflow_analysis`, `list_cashflow_category_transactions`, and
  `get_cashflow_analysis_audit` as independent headless tools. Their existing
  read scope and non-App uses remain valid.
- Do not change the historical pre-port parity fixture solely because this
  post-port product contract is intentionally changing. Update current inventory
  and protocol assertions instead.

## Milestones

### 1. Capture The Baseline And Lock The Acceptance Scorecard

Implementation tasks:

- Run the current focused MCP App tests and build before changing the launcher.
- Capture the current Explorer through the tagged official host with a stable
  output path under `tmp/recordings/mcp-apps/` for `populated` and `empty`
  scenarios. Preserve these as local before evidence, not committed product
  assets.
- Record the current desktop and iPhone hierarchy, rendered height, control
  density, initial above-the-fold content, theme behavior, loading transition,
  page errors, console output, and network boundary.
- Add an iteration log to this plan when execution begins. Each pass records its
  evidence directory, major findings, changes made, and result.
- Use this scorecard for every visual pass:
  - the period, currency, net flow, and inflow/outflow relationship are clear
    without interaction;
  - the first meaningful category contributors are visible on a phone without
    navigating through configuration;
  - no date, reload, search, audit-log, editing, or dashboard controls remain;
  - text remains readable with long category and merchant labels;
  - tap targets, focus indicators, and expanded/collapsed semantics are clear;
  - there is no horizontal overflow at 320 px or an iPhone 12 viewport;
  - dark/light theme and safe-area padding match the official host;
  - loading, empty, partial-helper-error, and primary-error states are truthful;
  - only current authenticated result data is rendered; and
  - all browser page-error and unexpected external-network lists are empty.

Exit criteria:

- The baseline focused tests and `yarn build:mcp-apps` pass.
- The before screenshots/contact sheets and their evidence directory are
  recorded in the execution log.
- The scorecard is used as the acceptance contract rather than ad hoc visual
  preference during implementation.

### 2. Introduce The Selective Visualization Tool Contract

Implementation tasks:

- In `backend/src/mcp/mcp.definition.ts`, replace
  `show_cashflow_explorer` with `visualize_cash_flow`. Keep the overall tool
  count unchanged and do not retain a legacy alias that would expose duplicate
  App launchers.
- Use the user-facing title `Visualize Cash Flow`. Write a selective description
  that recommends the tool for actual user cash-flow, spending, income, or
  comparison questions that benefit from a visual answer. Explicitly discourage
  use for capability discovery, hypothetical discussion, metadata questions,
  and simple facts that prose answers clearly.
- Add the exact input shape above with described dates, default outflow focus,
  optional inflow focus, optional category focus, and optional explicit
  comparison period.
- Add strict Zod schemas in `backend/src/mcp/mcp-schemas.ts` for the visualization
  payload instead of hiding its contract behind `z.unknown()`.
- Add a small pure mapper in `backend/src/mcp/mcp.extensions.ts` (or a focused
  sibling module if clearer) that converts audit rows into the adjustment
  summary without exposing audit row contents.
- Update `backend/src/mcp/mcp-apps.ts` to the App identity `cash_flow`, title
  `Cash Flow`, launcher `visualize_cash_flow`, and cache-busting resource URI
  `ui://splice/cash-flow/v3.html`. Keep the canonical widget domain, CSP,
  `splice:read`, border preference, and OpenAI compatibility metadata unchanged.
- Update the current server inventory constant, MCP guide text, app resource
  linkage, fallback copy, monthly cash-flow prompt guidance, and current tests.
- Keep the fallback complete: it must contain both requested period results,
  presentation focus, and adjustment counts so a non-App client can answer the
  same question.

Exit criteria:

- Discovery contains `visualize_cash_flow` exactly once and does not contain
  `show_cashflow_explorer`.
- The new tool and resource both require `splice:read`, remain read-only, and
  link to the exact `v3` URI.
- Single-period, inflow-focus, category-focus, comparison, invalid-date, and
  comparison-failure protocol tests pass.
- The App result validates against its typed output schema and preserves the
  JSON-equivalent text fallback.
- `validateMcpApps(..., { profile: 'openai-submission' })` passes with the new
  resource and existing Portfolio resource.

### 3. Build A Typed Cash Flow Presentation Model

Implementation tasks:

- Extract Cash Flow-specific normalization and presentation calculations from
  the generic browser event/rendering block in
  `backend/src/mcp/apps/app-runtime.ts` into a focused typed module that is still
  bundled by `build-app-runtime.mjs`. Do not rewrite the Portfolio view.
- Define pure transformations for:
  - current and optional comparison amounts/deltas;
  - outflow/inflow category selection;
  - descending absolute-value ranking;
  - separating `UNCATEGORIZED` from ranked categories;
  - top five plus a summed `Other` row and expandable remainder;
  - validating an optional focused category against the current result;
  - largest-first transaction ordering using `convertedAmount` when present and
    raw `amount` only as the same-currency fallback;
  - initial three-row drilldown and increments of three; and
  - the minimum structured selection context sent back to the model.
- Keep the App's query identity immutable for an invocation. Drilldown helper
  arguments must use the validated current result dates and presentation
  direction, not values read from editable DOM controls.
- Add focused unit tests for the pure presentation model, including ties,
  negative/positive signs, zero totals, absent colors, long labels, more than
  five categories, explicit uncategorized values, missing focus category,
  multi-currency converted transaction ordering, and comparison deltas.
- Preserve the lifecycle generation boundary. Loading, new primary results,
  errors, cancellation, and teardown must clear Cash Flow selection, drilldown,
  expansion, and helper state; late promises from earlier generations must be
  ignored.

Exit criteria:

- Cash Flow calculations are independently testable without a DOM or host.
- Portfolio behavior and focused Portfolio tests are unchanged.
- No old category, transaction, comparison, or selection identity can appear
  after a new primary result or error.
- The generated bundle is deterministic across two consecutive builds.

### 4. Implement The Mobile-First Cash Flow View

Implementation tasks:

- Replace the Explorer layout with one consistent visual composition:
  1. `Cash Flow`, exact period, and reporting currency;
  2. net cash flow as the visual headline;
  3. a compact, precisely labeled inflow-versus-outflow comparison;
  4. `Top spending categories` by default or `Income sources` for inflow focus;
  5. top five ranked bars, expandable `Other`, and explicit
     `Uncategorized`; and
  6. inline transaction evidence for the selected category.
- Remove date fields, preset, reload, direction tabs, category search, generic
  metric-card grid, audit button, audit rows, side-by-side desktop split, and
  the transaction table.
- Use category colors where available while retaining accessible text and value
  labels that do not rely on color alone.
- If a comparison exists, show exact current-versus-comparison deltas within the
  same visual grammar. Do not introduce a second chart family or imply that
  unequal date spans are normalized.
- Render `Other` as a disclosure that expands the remaining ranked categories
  in place. Do not use `Other` as a drilldown category because it has no stable
  domain identity.
- Render `Uncategorized` as a separate data-quality row and allow it to use the
  existing `UNCATEGORIZED` drilldown identity.
- Render category drilldown as an inline disclosure with category total,
  transaction count, three largest contributing transactions, merchant or
  description, date, and amount. Expand three at a time and provide an explicit
  close/back affordance that restores the prior scroll and visual state.
- Convert primary no-data results into a purposeful empty state rather than a
  blank chart. Keep primary errors safe and generic. Keep helper errors local to
  the drilldown with retry/close affordances and leave the primary visualization
  intact.
- Show a compact factual “How this was calculated” disclosure only when the
  current adjustment summary is affected. Display counts and plain-language
  definitions; do not render raw audit rows or rule-management controls.
- Keep all primary content useful at 320 px, iPhone 12, and desktop widths.
  Respect official host theme/fonts/safe-area insets, reduced motion, keyboard
  navigation, focus visibility, and at least 44 px touch targets for interactive
  rows.
- Bump the browser App info/resource version consistently and regenerate
  `backend/src/mcp/apps/app-runtime.generated.ts` only through
  `yarn build:mcp-apps`.

Exit criteria:

- The resulting screen matches the product contract and contains none of the
  intentionally removed dashboard controls.
- Default outflow, explicit inflow, focused category, comparison, `Other`,
  uncategorized, empty, and long-label cases render correctly.
- Phone layouts have no horizontal overflow, truncated money, overlapping host
  chrome, or inaccessible offscreen interaction.
- Loading and primary error shells contain no fixture or prior business data.

### 5. Connect Lightweight Drilldown And Model Context

Implementation tasks:

- Keep `list_cashflow_category_transactions` as the read-only helper. Sort its
  current result in the typed presentation layer by absolute converted amount
  before display; this first version may retain the existing complete helper
  response while progressively disclosing rows client-side.
- On category selection, render a local loading state for the detail region and
  call the helper with the exact current period, direction, and category.
- After selection, call the typed official
  `mcpRuntime.app.updateModelContext()` with only:
  - visualization identity `cash_flow`;
  - current start/end dates;
  - direction;
  - category primary code and display label;
  - category total/currency; and
  - transaction count.
- Do not send raw transaction rows, account IDs, a message, or an action request
  through model context. Clearing/closing the selection must publish a cleared
  selection context.
- Treat model-context update failure as nonfatal and local. It must not remove
  valid financial data or expose an internal failure message.
- Add regressions for select, deselect, replaced result, missing category,
  helper failure, context failure, late helper completion, late context
  completion, and teardown.
- Document the deliberate first-version tradeoff that the helper returns the
  complete category result even though the UI progressively discloses it. Track
  cursor pagination as a later optimization only if real payload size warrants
  it; do not add speculative pagination in this plan.

Exit criteria:

- A user can select a category, inspect largest-first evidence, expand it in
  increments of three, close it, and retain the primary visualization.
- Model-context tests prove that “this category” can be resolved without leaking
  transaction or account details.
- Selection and helper state never survive a new invocation generation.
- The feature remains entirely read-only at both MCP annotation and domain-call
  levels.

### 6. Run The UI Refinement Loops

Implementation tasks:

- Before implementation, generate one constrained ImageGen contact sheet with
  three or four mobile Cash Flow concepts. Critique the concepts against the
  fixed product contract and representative real result shapes, record the
  selected and rejected ideas below, and treat all generated labels, amounts,
  and layout as ideation only rather than implementation or validation truth.
- Expand `backend/test/mcp/fixtures/serve-mcp-app-fixture.ts` with deterministic
  Cash Flow data that exercises:
  - at least eight outflow categories and multiple inflow categories;
  - distinct category colors and one long label;
  - nonzero `Uncategorized`;
  - positive and negative comparison deltas;
  - excluded and neutralized adjustment counts;
  - more than six drilldown transactions with converted amounts; and
  - empty and localized helper-error states.
- Keep fixture money in domain smallest units before MCP normalization and keep
  every sample identity obviously test-owned.
- Extend `backend/scripts/mcp-apps/visual.mjs` with a focused Cash Flow filter
  and deterministic overview, comparison, and focused-category capture cases.
  Retain the real authenticated MCP call, resource read, official sandbox,
  console/page-error capture, network allowlist, loading-to-ready recording, and
  automatic session/process cleanup.
- Add a narrow 320 px capture if the existing iPhone device viewport does not
  exercise that boundary. Continue capturing desktop dark and phone dark/light.
- Run at least these three explicit refinement passes:
  1. **Information hierarchy:** simplify until period, net, flow relationship,
     and first contributors scan correctly on a phone.
  2. **Exploration:** refine category selection, `Other`, uncategorized,
     largest-first detail, loading, localized helper error, and return state.
  3. **Responsive/accessibility polish:** refine long labels, currencies,
     positive/negative/zero values, light/dark themes, focus order, touch
     targets, safe-area padding, and motion.
- After every pass:
  1. run focused model/runtime/protocol tests;
  2. rebuild the deterministic bundle;
  3. run the official-host visual capture to a stable iteration directory;
  4. inspect every contact sheet at 100%, WebM, console JSON, page-error JSON,
     and network JSON;
  5. record findings and evidence in the iteration log; and
  6. fix every major issue before starting the next pass.
- Use `yarn mcp-apps:dev --scenario ...` for manual category interaction in the
  official host. Because the host sandbox is intentionally cross-origin, keep
  helper interaction behavior covered by runtime tests and record manual host
  interaction evidence rather than adding a local bridge workaround.
- Perform a final ChatGPT Web desktop and ChatGPT mobile/iOS smoke after
  deployment, because the tagged basic host cannot guarantee host-specific
  presentation.

Exit criteria:

- Three refinement passes are documented with evidence and no major visual,
  responsive, accessibility, lifecycle, console, or network issue remains.
- The final phone view meets the scorecard at both iPhone 12 and 320 px widths.
- Automated capture still proves the real tool call, `v3` resource read, and
  official sandbox load.
- The production bundle contains no fixture labels, IDs, dates, or amounts.

### 7. Complete Protocol, Regression, Documentation, And Review Gates

Implementation tasks:

- Update `backend/test/mcp/mcp.service.spec.ts` for the exact tool inventory,
  new typed input/output, read scope/risk, App metadata, fallback, resource URI,
  current/comparison results, adjustment summary, and old-name absence.
- Update `backend/test/mcp/mcp-app-runtime.spec.ts` for the new identity and all
  presentation, interaction, context, localized-error, and stale-generation
  behaviors. Prefer behavior assertions over CSS implementation-string tests.
- Add focused pure presentation tests rather than expanding the existing
  broad unsafe-`any` runtime harness for every calculation.
- Update the authenticated fixture and runtime tests to prove missing
  `splice:read` denies both the App tool and resource before domain/render calls.
- Update artifact scans to reject production fixture data and stale
  `Cashflow Explorer`, `show_cashflow_explorer`, and
  `ui://splice/cashflow-explorer/v2.html` references outside explicitly marked
  historical plans/records.
- Update `backend/README.md`, `docs/mcp.md`, the MCP guide resource,
  `docs/mcp-app-product-guidance.md`, and `plans/index.md` with the implemented
  name, selective invocation contract, `v3` resource, new visual loop cases,
  ChatGPT refresh requirement, and rollback procedure.
- Run an independent read-only review focused on product-contract fidelity,
  selective tool wording, money/currency correctness, App authorization,
  stale-data/privacy boundaries, fallback parity, responsive UI, and official
  bridge usage. Fix every major issue and repeat focused/full validation.

Exit criteria:

- Focused MCP Apps tests, all MCP tests, backend typecheck, lint, full tests, and
  build pass.
- Two consecutive browser bundle builds are byte-identical.
- `git diff --check` and documentation formatting pass.
- Independent re-review reports no major issue.
- No required implementation or test work remains before rollout.

### 8. Roll Out, Refresh ChatGPT, Smoke Test, And Preserve Rollback

Implementation tasks:

- Build the final Node 24 backend image after the generated `v3` resource is
  current. Verify the image's Node version, mcp-kit pin, generated resource,
  fixture exclusion, and new/old tool-name scans.
- Use the repository's protected `main` to `deploy` workflow only after all
  implementation, review, and local validation gates pass.
- Confirm the deployed backend is healthy and production discovery exposes
  exactly `visualize_cash_flow`, not `show_cashflow_explorer`, linked to the
  exact `ui://splice/cash-flow/v3.html` resource.
- In the existing ChatGPT developer plugin, run **Refresh** or **Scan Tools**.
  No Auth0, DNS, ingress, or reconnection change is expected. Use a fresh
  conversation because old conversations may cache the retired descriptor.
- Run selective production prompts:
  - a real period question that should render Cash Flow;
  - an income-focused question;
  - an explicit comparison question;
  - a category selection followed by “why is this so high?”;
  - a simple finance fact that should remain prose/tool-only; and
  - a capability/meta question that must not render Cash Flow.
- Verify on ChatGPT Web and mobile/iOS: loading-to-ready, period/currency, net,
  inflow/outflow, ranked categories, `Other`, uncategorized, optional comparison,
  category detail, model-context follow-up, theme, safe area, and no stale data.
- Inspect sanitized production logs for successful App calls and absence of
  claims, tool arguments, results, transaction values, and internal failures.
- Record the application revision, deploy revision, image digest, resource URI,
  ChatGPT refresh time, screenshots/videos, and smoke results in `docs/mcp.md`.
- Preserve the prior deploy revision and image digest. Roll back through the
  protected deployment path if primary visualization loading, authorization,
  money correctness, stale-data privacy, or host compatibility fails; then
  refresh ChatGPT tool metadata again.

Exit criteria:

- Production serves the exact reviewed build and the new selective App contract.
- Expected visualization prompts render correctly on desktop and mobile; meta
  and simple-fact prompts do not spuriously render it.
- No write, Auth0, DNS, ingress, or frontend behavior changed.
- Rollback inputs and operator evidence are recorded durably.

## Tests

### Backend And Protocol

- Exact discovery inventory: new launcher present once, old launcher absent.
- Input validation: primary dates, invalid primary order, comparison pair,
  invalid comparison order, direction default/override, category focus.
- Domain delegation: primary analysis/audit, optional comparison analysis/audit,
  atomic failure, authenticated user ownership, and no write-service calls.
- Output validation: major-unit money, signs/currency, adjustment counts,
  current/comparison shape, App envelope, JSON text fallback.
- App resource: `splice:read` enforcement, `v3` URI, domain/CSP/border metadata,
  MIME type, resource/tool linkage, OpenAI submission validation.
- Non-App parity: structured/text output contains every fact required for the
  same answer.

### Browser Runtime And Presentation

- Pure category ranking, top five, `Other`, uncategorized separation, inflow
  focus, focus-category validation, comparison deltas, and transaction ordering.
- Loading, ready, empty, primary error, localized helper error, context error,
  teardown, and repeated invocation lifecycle.
- Category selection, three-row initial detail, incremental expansion, close,
  model-context payload, model-context clearing, and no auto-send/write.
- Late helper/context results cannot restore previous category, transaction,
  date, comparison, or user identity.
- Long labels, zero values, mixed money signs, converted-amount preference, and
  missing optional fields remain safe.
- Production resource contains no fixture data and standalone extraction remains
  neutral loading outside an official host.

### Visual And Host Validation

- Populated overview, populated comparison, focused category, empty, and helper
  error through the real authenticated fixture and official host.
- Desktop dark, iPhone dark/light, and narrow 320 px screenshots.
- Loading-to-ready video and manual category drilldown interaction evidence.
- Contact-sheet review, no page errors, no sensitive console output, and no
  external network outside the official loopback host/fixture.
- Final ChatGPT Web and mobile/iOS smoke after Scan Tools.

## Validation Commands

Focused implementation loop:

```bash
cd backend
yarn test --runInBand test/mcp/mcp-cash-flow-model.spec.ts
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
yarn mcp-apps:visual --app cash-flow --scenario populated
yarn mcp-apps:visual --app cash-flow --scenario empty
```

Use `--case overview|inflow|comparison|focus` to narrow one populated Cash Flow
invocation. The scenario selects truthful data or failure behavior; the App and
case filters select what the official host invokes and captures.

Final repository validation:

```bash
cd backend
yarn install --frozen-lockfile
yarn typecheck
yarn lint
yarn test --runInBand test/mcp
yarn test --runInBand
yarn build
docker build -t splice-backend:cash-flow-v3 .
docker run --rm --entrypoint node splice-backend:cash-flow-v3 --version
```

Artifact and stale-contract checks:

```bash
cd backend
yarn build:mcp-apps
yarn ts-node -r tsconfig-paths/register \
  test/mcp/fixtures/render-mcp-app-resource.ts \
  /tmp/splice-mcp-app-resources
rg -n "fixture-|Rendering local fixture|show_cashflow_explorer|cashflow-explorer/v2" \
  /tmp/splice-mcp-app-resources src/mcp/apps/app-runtime.generated.ts
```

The final search must return no production artifact match. Historical plan and
rollout records may retain the old name when clearly labeled historical.

## UI Refinement Log

Populate this table during execution. Do not mark the plan complete without all
three passes and a final independent review.

The pre-implementation ImageGen concept sheet is local ideation evidence at
`/Users/jtkw/.codex/generated_images/01a00cc6-ceac-78d2-a5ae-62cad0928fb6/exec-e15f9b52-6405-41f8-b8f7-e7d3ba26a563.png`.
It reinforced the selected editorial hierarchy, compact flow relationship, and
conversational inline evidence. Decorative icons, always-expanded calculation
detail, and additional dashboard chrome were explicitly rejected. Its mock
copy, amounts, and layouts were not adopted as contract, fixture, or validation
truth.

| Pass                            | Evidence directory                                                                                                                                                                                                                                  | Major findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Changes made                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Result                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Baseline                        | `tmp/recordings/mcp-apps/cash-flow-v3-baseline-populated/`; `tmp/recordings/mcp-apps/cash-flow-v3-baseline-empty/`                                                                                                                                  | Desktop is a dense dashboard with configuration, four metric cards, split panels, and audit UI. On iPhone, date/preset/reload/audit controls and large metric cards consume the initial App viewport, so no category contributor is visible above the fold. The empty case repeats the full long dashboard shell. Dark/light rendering works; recorded page-error, console-error, and external-network lists are empty.                                                                                                                                                                                                                                                                                      | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Captured; target hierarchy is not met     |
| Information hierarchy           | `tmp/recordings/mcp-apps/cash-flow-v3-pass-1-information-hierarchy/`; `tmp/recordings/mcp-apps/cash-flow-v3-focus-race-repro/`                                                                                                                      | The period, currency, net flow, inflow/outflow relationship, and first contributors are visible without configuration controls on desktop, iPhone, and 320 px captures. Inflow stays compact; comparison labels its exact unnormalized range; long labels wrap without horizontal overflow. One fixed-time focused still landed exactly while the official host was navigating its sandbox; network timestamps proved the App mounted and loaded its helper immediately afterward.                                                                                                                                                                                                                           | Removed the invented `0 transactions` sublabel when the Uncategorized count is unknown. Replaced brittle fixed-time still capture with readiness at the launcher call, resource read, sandbox load, and focused helper call, followed by a short paint settle. Retained the race and clean artifacts as harness regression evidence.                                                                                                                                                         | Passed after fixes; exploration continues |
| Exploration                     | `tmp/recordings/mcp-apps/cash-flow-v3-pass-2-exploration/`; `tmp/recordings/mcp-apps/cash-flow-v3-pass-2-focus-ready/`                                                                                                                              | Overview, inflow, and comparison remain concise at desktop and phone widths. A model-supplied Groceries focus loads automatically; largest-first converted amounts and long merchant names remain readable at 320 px. Detail now appears immediately after the selected category rather than below the complete category block, avoiding a confusing phone scroll.                                                                                                                                                                                                                                                                                                                                           | Made model-supplied focus load without republishing context, moved detail inline after the selected row, expanded `Other` when it owns the focus, removed host resize feedback, and used transport-aware still readiness.                                                                                                                                                                                                                                                                    | Passed                                    |
| Responsive/accessibility polish | `tmp/recordings/mcp-apps/cash-flow-v3-pass-3-empty/`; `tmp/recordings/mcp-apps/cash-flow-v3-pass-3-helper-error/`; `tmp/recordings/mcp-apps/cash-flow-v3-pass-3-primary-error/`; `tmp/recordings/mcp-apps/cash-flow-v3-pass-3-portfolio-isolation/` | Empty data stays concise and truthful; a primary failure renders only the safe unavailable state. The first helper-error capture incorrectly treated a resolved MCP `isError` result as an empty transaction array. After correction, the selected category retains the current summary and shows localized unavailable copy with Retry and Close at desktop, iPhone dark/light, and 320 px. Contact sheets show no Cash Flow overflow; page errors, severe console messages, and external HTTP requests are empty. Terminal-state WebMs cover all four scenarios through the same official-host browser session. Portfolio still renders unchanged, although its pre-existing mobile surface remains dense. | Made the browser client reject top-level and wrapped `isError: true` tool results before structured parsing, then recaptured the complete helper-error matrix. Replaced the host recorder's unreliable fresh browser target with frames from the working official-host session, gated on the MCP call/resource/sandbox/helper transport boundary and encoded into WebM. Preserved Cash Flow summary data, localized failure handling, host theme, and the existing Portfolio implementation. | Passed after helper-error fix             |
| Final independent review        | Read-only cross-review of the completed server, App runtime, presentation model, harness, evidence, tests, and documentation                                                                                                                        | The first review found stale user-selected model context across replacement/error/teardown boundaries and a missing pure-model suite in the durable Apps test command. Both were fixed and regression-tested. Re-review covered authorization, money/currency signs, fallback parity, official bridge usage, stale generations, model-context clearing, localized errors, responsive/touch/reduced-motion behavior, the 25-tool inventory, two scoped App resources, and the `v3` linkage.                                                                                                                                                                                                                   | Added best-effort selection-context clearing on generation/lifecycle boundaries, guarded late callbacks, four lifecycle regressions, and `mcp-cash-flow-model.spec.ts` to `test:mcp-apps`. Re-ran both independent reviews after the fixes.                                                                                                                                                                                                                                                  | Passed; no major issues remain            |

Baseline validation on 2026-08-17 passed `yarn test:mcp-apps` (3 suites,
57 tests) and `yarn build:mcp-apps`. The two evidence directories contain
desktop-dark, iPhone dark/light, loading-to-ready WebM, console, page-error,
network, and contact-sheet artifacts captured through the authenticated MCP
fixture and tagged official ext-apps host.

## Risks And Deferred Work

- **Tool/resource cache:** ChatGPT may retain the old launcher or resource in an
  existing conversation. The hard rename plus `v3` URI requires Scan Tools and
  a fresh conversation; it does not require OAuth reconnection.
- **Comparison cost:** a comparison invokes two analysis/audit period pairs.
  Execute them concurrently and observe latency in the official host and
  production logs. Optimize the domain pipeline later only if measured cost is
  material.
- **Complete category helper result:** initial detail progressively discloses
  rows but the helper still returns the full category. Add cursor pagination in
  a separate measured optimization if payload size becomes a real problem.
- **Category labels:** aggregates currently expose primary category codes and
  colors, not a dedicated display label. Continue the existing deterministic
  formatting unless the taxonomy already provides an authorized label without
  an extra query; do not add speculative taxonomy loading solely for cosmetic
  copy.
- **Unequal comparison ranges:** show exact periods and raw deltas. Do not imply
  normalization or percentage comparability when spans differ.
- **Host automation boundary:** the official host's nested sandbox may prevent
  outer agent-browser automation from clicking App controls. Keep protocol and
  helper behavior in focused tests and capture the manual official-host/ChatGPT
  interaction instead of weakening origin isolation.
- **Portfolio isolation:** shared shell/runtime changes can regress Portfolio.
  Retain its focused tests and one final visual capture, but do not redesign it
  under this plan.

## Overall Exit Criteria

- The old Cashflow Explorer launcher/resource is replaced by one selectively
  described `visualize_cash_flow` tool linked to the `Cash Flow` `v3` App.
- Single-period and optional comparison results are typed, authorized,
  major-unit correct, complete for non-App clients, and read-only.
- The App presents period/currency, net, inflow/outflow, top categories,
  expandable `Other`, explicit uncategorized data, conditional adjustment
  summary, and largest-first inline evidence with no dashboard controls.
- Category selection updates only the minimum model context and supports a
  natural follow-up without auto-sending or mutating data.
- Lifecycle, stale-data, fixture-exclusion, safe-error, authorization, and
  fallback invariants remain intact.
- Three official-host UI refinement passes and final independent review leave no
  major product, visual, responsive, accessibility, console, network, privacy,
  or protocol issue.
- Focused/full backend validation, deterministic bundle build, Node 24 image
  check, and `git diff --check` pass.
- Production rollout, ChatGPT Scan Tools, selective desktop/mobile smoke, logs,
  evidence, and rollback inputs are complete and documented.
