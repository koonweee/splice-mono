# Analysis Sankey Diagram

## Status

Planned

## Goal

Add a user-level setting that lets a user render the Analysis page as a Sankey-style cashflow diagram instead of the current separate inflow and outflow donut chart sections.

The first implementation should reuse the existing analysis response and drilldown modal: clicking or tapping an inflow or outflow category label in the Sankey view opens the same category drilldown used by the current legend rows.

Settled product decisions:

- The first Sankey is an aggregate cashflow view, not a true category-to-category allocation model.
- Category labels, nodes, and unambiguous category-specific links should open drilldown. The central "Available" hub is display-only.
- The Settings page preference saves immediately when toggled, with pending and error handling.

## Current Behavior

- `frontend/src/routes/_authed/analysis.tsx` fetches `useTransactionAnalysisControllerGetAnalysis({ startDate, endDate })`, shows `SummaryStrip`, then renders two `FlowSection` cards: one for `analysis.inflows` and one for `analysis.outflows`.
- `FlowSection` is currently embedded in `analysis.tsx`. It uses Mantine `DonutChart` from `@mantine/charts`, API-provided category colors via `getDisplayCategoryColor`, and `CategoryTransactionsModal` for category drilldown.
- `CategoryTransactionsModal` already accepts `categoryPrimary`, `flowDirection`, `startDate`, and `endDate`, including special handling for `BALANCE_ADJUSTMENT`, so Sankey category interactions can call the existing `handleCategoryClick(category, direction)`.
- `frontend/src/routes/_authed/settings.tsx` stores general user settings in local component state and saves them through `useUserControllerUpdateSettings`. The Analysis tab currently mounts `AnalysisRulesSection` and passes the neutralization lookaround setting connector.
- `backend/src/types/UserSettings.ts` owns the stored settings schema, update DTO schema, defaults, and normalization. `backend/src/user/user.service.ts` manually merges each setting during partial updates.
- User settings are stored in `user_entity.settings` JSONB. Prior settings additions use explicit migrations, for example `backend/src/migrations/1776400000000-AddNeutralizationLookaroundSetting.ts`.
- Generated frontend API models under `frontend/src/api/**` must not be hand-edited; after backend schema changes, regenerate with `cd frontend && yarn orval`.
- Existing mobile behavior is driven by `frontend/src/lib/hooks.ts` via `useIsMobile()` and mocked with `window.matchMedia` in route/component tests.

Library check:

- Prefer Recharts `Sankey` directly. Recharts is already installed in `frontend/package.json`, and its Sankey API supports `ResponsiveContainer`, custom `node` and `link` renderers, and click/mouse handlers. Source: https://recharts.github.io/en-US/api/Sankey/
- Mantine Charts wraps Recharts for many chart types and recommends using Recharts docs for advanced features outside Mantine's wrappers. Source: https://mantine.dev/charts/getting-started/
- `d3-sankey` is the lower-level layout engine and gives maximum SVG control, but it adds implementation work that Recharts can avoid for this first slice. Source: https://github.com/d3/d3-sankey
- `@nivo/sankey` is a polished React option built on `d3-sankey` with theming and interactivity, but it would add another chart system while the repo already uses Recharts through Mantine. Source: https://nivo.rocks/sankey/
- `@visx/sankey` wraps `d3-sankey` and is useful if Recharts customization is insufficient, but it is also a new dependency and a lower-level rendering path.

## Target Data Shape

Add one persisted user setting:

```ts
type UserSettings = {
  currency: string
  timezone: string
  hideZeroBalanceAccounts: boolean
  theme: UserThemePreference
  neutralizationLookaroundDays: number
  analysisSankeyEnabled: boolean
}

type UpdateUserSettingsDto = Partial<Pick<UserSettings, 'analysisSankeyEnabled' /* plus existing settings */>>
```

The transaction analysis API response should not change in the first implementation. Build the Sankey view from the current `TransactionAnalysisResponse`:

```ts
type AnalysisSankeyNode = {
  id: string
  name: string
  kind: 'inflow' | 'hub' | 'outflow' | 'net'
  categoryPrimary?: string
  flowDirection?: 'inflow' | 'outflow'
  color?: string
  value: number
}

type AnalysisSankeyLink = {
  source: number
  target: number
  value: number
  categoryPrimary?: string
  flowDirection?: 'inflow' | 'outflow'
  color?: string
}
```

Represent this as an aggregate cashflow diagram, not a literal transaction-level allocation from each income category to each spending category:

- Inflow category nodes flow into a central "Available" node.
- The central node flows to each outflow category.
- If `netFlow > 0`, add a "Net saved" node from the central node.
- If `netFlow < 0`, add a "Prior balance" node into the central node so total outflow can still be represented without implying an income category funded the deficit.
- If `totalInflow === totalOutflow`, no net node is needed.
- The central hub value should equal `max(totalInflow, totalOutflow)` in major currency units so Recharts can balance the visual flow.

## Milestones

### 1. Persist The User Setting

Implementation tasks:

- Add `analysisSankeyEnabled: z.boolean().default(false)` to `UserSettingsSchema` in `backend/src/types/UserSettings.ts`.
- Add `analysisSankeyEnabled: z.boolean().optional()` to `UpdateUserSettingsDtoSchema`.
- Add the default value to `DEFAULT_USER_SETTINGS` and normalize missing legacy values to `false`.
- Update `UserService.updateSettings` to preserve and merge `analysisSankeyEnabled` without emitting currency/timezone backfill events.
- Add a migration similar to `1776400000000-AddNeutralizationLookaroundSetting.ts` that backfills missing `settings.analysisSankeyEnabled` and updates the JSONB column default.
- Update backend settings tests in `backend/test/types/user-settings.spec.ts`, `backend/test/user/user.service.spec.ts`, and add a focused migration test following `backend/test/migrations/add-neutralization-lookaround-setting.spec.ts`.

Exit criteria:

- Existing users without the key normalize to `analysisSankeyEnabled: false`.
- `PATCH /user/settings` accepts `{ analysisSankeyEnabled: true }` without dropping existing settings.
- Backend targeted tests pass:

```bash
cd backend && yarn test test/types/user-settings.spec.ts test/user/user.service.spec.ts
```

### 2. Expose The Setting In Settings UI

Implementation tasks:

- Regenerate frontend API models after the backend schema change:

```bash
cd frontend && yarn orval
```

- In `frontend/src/routes/_authed/settings.tsx`, add local state for `analysisSankeyEnabled` and initialize it from `user.settings.analysisSankeyEnabled ?? false`.
- Add a `Switch` under the Analysis tab above `AnalysisRulesSection` so this preference lives near analysis-specific configuration. Use direct wording such as "Use Sankey diagram on Analysis".
- Save the switch immediately from the Analysis tab with a focused `useUserControllerUpdateSettings` call, similar to the existing neutralization lookaround save path, then invalidate `getUserControllerMeQueryOptions().queryKey`. Do not rely on the General tab's "Save Changes" button for an Analysis-tab control.
- Disable or show loading on the switch while the save is pending. If the save fails, restore the previous checked state and show an inline error near the switch.
- Because the Analysis tab currently delegates most UI to `AnalysisRulesSection`, keep the new setting in `settings.tsx` first unless the section grows enough to justify extracting an `AnalysisDisplaySettingsSection`.
- Keep using the existing `updateSettingsMutation` object unless implementation complexity requires a second mutation instance; if one mutation causes unrelated General-tab loading/error states to flash during the Analysis switch save, split it into separate mutation hooks.
- Update `frontend/src/routes/_authed/settings.test.tsx` to cover initialization, direct switch save payload, query invalidation, pending and failed save states, rollback on failure, and preservation of the existing Analysis tab content.

Exit criteria:

- The setting is visible on `/settings?tab=analysis`, persists through `useUserControllerUpdateSettings`, and does not depend on or affect unrelated General-tab settings saves.
- Frontend targeted settings tests pass:

```bash
cd frontend && yarn test src/routes/_authed/settings.test.tsx
```

### 3. Build The Sankey View Component

Implementation tasks:

- Add `frontend/src/components/analysis/AnalysisSankeyChart.tsx` plus a focused CSS module if needed.
- Import Recharts directly, for example `ResponsiveContainer`, `Sankey`, and `Tooltip`, instead of adding a new chart dependency.
- Add a pure transformer such as `buildAnalysisSankeyData(analysis)` that maps `inflows`, `outflows`, totals, `netFlow`, and category colors into Recharts' `nodes` and `links` arrays.
- Keep amounts in major currency units for Recharts link widths and tooltips, while labels continue to use existing `formatMoneyNumber`/`formatAmount` helpers.
- Use custom node rendering to apply Mantine theme colors, category colors, accessible text labels, hover/focus states, and a pointer cursor only for clickable category nodes.
- Make category labels, category nodes, and unambiguous category-specific links call `onCategoryClick(categoryPrimary, flowDirection)` and reuse the existing `CategoryTransactionsModal`.
- Keep the central "Available" node and non-category net/prior-balance nodes inert unless a future API adds an all-transactions drilldown scope.
- Add an adjacent accessible category drilldown list under the chart if custom SVG nodes cannot expose reliable keyboard/touch semantics. It can reuse the same category rows as the current `FlowSection` legend, but should be visually secondary to the Sankey.
- Preserve the current empty-state behavior when both inflows and outflows are empty.

Exit criteria:

- With `analysisSankeyEnabled: true`, the Analysis page renders one Sankey card instead of the two `FlowSection` cards.
- Clicking an inflow category opens the modal with `flowDirection="inflow"`; clicking an outflow category opens it with `flowDirection="outflow"`.
- The central "Available" hub does not open a modal.
- Category colors in nodes/links match the existing donut legend color logic.

### 4. Wire Analysis Page Selection And Tests

Implementation tasks:

- In `frontend/src/routes/_authed/analysis.tsx`, fetch `useUserControllerMe` or use an existing route context if introduced later; read `user?.settings.analysisSankeyEnabled ?? false`.
- Do not block analysis data loading on the settings request. Default to existing donut behavior until the user settings query resolves.
- Gate the chart area:
  - `false`: current two-column `FlowSection` behavior.
  - `true`: new `AnalysisSankeyChart`.
- Keep `SummaryStrip`, date range, audit drawer, loading, error, and empty state unchanged.
- Update `frontend/src/routes/_authed/analysis.test.tsx` to mock `useUserControllerMe`, assert the default donut behavior remains, assert Sankey mode replaces donut charts, and assert category click drilldown wiring.
- Add component-level tests for `buildAnalysisSankeyData`, including positive net flow, negative net flow, no inflows, no outflows, and `BALANCE_ADJUSTMENT` categories.

Exit criteria:

- Existing Analysis tests still pass in default mode.
- Sankey mode has focused tests for rendering, click behavior, and data transformation.

### 5. Responsive And Browser Validation

Implementation tasks:

- Desktop and tablet: render a horizontal three-column Sankey with stable card height derived from category count, minimum usable height around 360px, and no label overlap in common cases.
- Mobile: render the same Sankey in a horizontally scrollable viewport with a practical min width, reduced node width/padding, and a visible category drilldown list below the chart if SVG labels become too dense.
- Limit label density with responsive typography and truncation. Do not hide the clickable category affordance completely on mobile; tapping a category must remain discoverable and reliable.
- Add browser validation with `$agent-browser` after implementation:
  - `/analysis` at desktop width with setting off.
  - `/analysis` at desktop width with setting on.
  - `/analysis` at mobile width with setting on.
  - Click or tap one inflow label and one outflow label and verify the modal opens with the expected title.
- Check browser console for runtime SVG/Recharts errors.

Exit criteria:

- The Sankey card does not overlap page chrome, date range controls, audit button, summary strip, modal, or labels at desktop and mobile widths.
- Mobile users can still inspect the diagram and open category drilldowns without relying on hover.
- Keyboard users can reach category drilldowns either through SVG node controls or the adjacent accessible list.

## Tests

### Backend

- `backend/test/types/user-settings.spec.ts`
  - defaults include `analysisSankeyEnabled: false`
  - update DTO accepts both `true` and `false`
  - normalization fills missing legacy values with `false`
- `backend/test/user/user.service.spec.ts`
  - partial update saves `analysisSankeyEnabled` without dropping existing settings
  - no currency/timezone update event is emitted for this display-only setting
- New migration test
  - existing users are backfilled
  - column default includes the new key
  - down migration removes the key and restores the prior default

### Frontend

- `frontend/src/routes/_authed/settings.test.tsx`
  - Analysis tab shows the Sankey switch
  - toggling it sends the expected direct update payload and invalidates the current user query
  - failed saves restore the previous checked state and show an inline error
  - existing Analysis rules section and lookaround connector remain mounted
- `frontend/src/routes/_authed/analysis.test.tsx`
  - default setting renders existing donut sections
  - enabled setting renders Sankey instead of donut sections
  - category click opens drilldown with the correct direction
  - central hub click does not open drilldown
- `frontend/src/components/analysis/AnalysisSankeyChart.test.tsx`
  - data transformation covers inflows, outflows, net saved, net deficit, zero data, colors, and balance adjustments

## Validation Commands

Backend:

```bash
cd backend && yarn test test/types/user-settings.spec.ts test/user/user.service.spec.ts
cd backend && yarn test test/migrations/add-analysis-sankey-setting.spec.ts
cd backend && yarn lint
cd backend && yarn typecheck
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/routes/_authed/settings.test.tsx src/routes/_authed/analysis.test.tsx src/components/analysis/AnalysisSankeyChart.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Browser:

```bash
cd frontend && yarn dev
```

Use the local auth bypass if needed:

```text
http://localhost:3000/user/dev/login?redirect=/analysis
```

Then validate desktop and mobile layouts with `$agent-browser`.

## Overall Exit Criteria

- A user can enable or disable "Use Sankey diagram on Analysis" from `/settings?tab=analysis`.
- The setting saves immediately on toggle, shows pending state, and rolls back with an inline error if saving fails.
- The preference is persisted per user and defaults to off for all existing and new users.
- With the preference off, the Analysis page behaves as it does today.
- With the preference on, the Analysis page replaces separate inflow/outflow donut sections with one themed Sankey cashflow diagram.
- Clicking/tapping an inflow or outflow category label, node, or category-specific link opens the existing drilldown modal for that category and flow direction.
- The central hub and net/prior-balance nodes do not open drilldown.
- The Sankey view uses existing category colors and Mantine theme tokens and remains usable on desktop and mobile.
- Backend tests, frontend tests, lint, typecheck, and browser validation pass.

## Risks And Open Questions

- The existing analysis API does not define literal links from an income category to a spending category. This is settled for the first version as an aggregate cashflow Sankey through an "Available" hub. If product later wants true allocation, that requires a new allocation model and likely new API semantics.
- Recharts Sankey may not provide enough accessible semantics out of the box. Custom node rendering should add keyboard/tap-friendly category controls where practical; if SVG accessibility blocks this, use an adjacent accessible category list as the interaction surface.
- Large category counts can create crowded diagrams. Start with full category fidelity, then consider an explicit "group small categories" follow-up only if browser validation shows the chart is unreadable.
- If Recharts Sankey customization is insufficient, the fallback path is `d3-sankey` or `@visx/sankey` for layout/rendering control, not `@nivo/sankey`, because this app already owns Mantine/Recharts chart styling.
