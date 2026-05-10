# User-Configurable Analysis Rules Plan

## Status

Implemented

## Goal

Give users explicit control over how the Analysis page excludes and neutralizes transactions, with persisted user-owned rules that are applied automatically by backend analysis endpoints.

Users should be able to:

- Create named analysis rules from a new `Analysis` settings tab.
- Archive and restore rules instead of using a separate enabled toggle.
- Define exclusion rules that remove matching real transactions from analysis.
- Define neutralization rules that allow selected inflow categories to cancel selected outflow categories.
- Use exact category records in scopes, plus explicit `All categories` and `Uncategorized` options.
- See a `Rules` button on the Analysis page linking to `/settings?tab=analysis`, with active-rule count.

Boundaries:

- No default rules are created for existing or new users. This intentionally stops the current implicit all-inflow/all-outflow neutralization unless a user creates a rule.
- Rules apply only to real transactions. Synthetic `BALANCE_ADJUSTMENT` rows remain outside rule matching.
- No preview or per-transaction audit/explanation endpoint in v1.
- No merchant, account, amount, date-condition, or manual-order controls in v1. Date remains the request range on analysis endpoints.
- MCP remains out of scope, but future callers of `TransactionAnalysisService` should receive rule-adjusted results automatically because the service applies active rules internally.

## Current Behavior

- The Analysis page lives in `frontend/src/routes/_authed/analysis.tsx`.
- The page calls `useTransactionAnalysisControllerGetAnalysis({ startDate, endDate })`, then formats backend smallest-unit values as rounded major-unit money.
- Category drilldowns use `CategoryTransactionsModal`, which calls `/transaction-analysis/transactions` for real transactions and `/transaction-analysis/balance-adjustments` for synthetic balance adjustments.
- `backend/src/transaction-analysis/transaction-analysis.service.ts` currently loads posted in-range transactions, neutralizes exact equal-and-opposite same-currency/same-amount pairs globally, aggregates remaining rows by primary category, converts totals to preferred currency, then appends balance adjustments.
- `getCategoryTransactions` reuses the same posted-transaction load and neutralization before category and flow filtering.
- Activity date is centralized in `backend/src/transaction/transaction-date.ts` as `reportingDateOverride ?? authorizedDate ?? providerDate`.
- `backend/src/mcp/mcp.service.ts` does not expose cash-flow analysis. MCP lists raw transactions and balance snapshots only.
- Settings tabs are implemented in `frontend/src/routes/_authed/settings.tsx` with `general`, `access`, `categories`, and `mcp`.
- The closest management UX is `frontend/src/components/settings/CustomCategoriesSection.tsx`, which uses Mantine, `mantine-react-table`, search/filter controls, a drawer editor, archive/restore, duplicate conflict messaging, and archived duplicate restore actions.
- Category display and category rows are modeled in `backend/src/category/category.entity.ts`, `backend/src/category/category.service.ts`, and `backend/src/types/Category.ts`.

Known constraints:

- The current analysis output is primary-category based, while rule scopes should use exact category IDs for secondary-category precision.
- `UNCATEGORIZED` has no category ID and needs explicit scope support.
- `ALL` is a scope mode, not a category ID.
- Archived category rows may still be referenced by existing rules and must remain displayable.
- Duplicate-rule prevention should mirror category creation UX, but only through application-level validation. Do not add a canonical rule hash or DB unique constraint in v1.
- The neutralization specificity comparator must be documented in code because it encodes product behavior.

## Target Data Shape

Add a dedicated user-owned analysis rule resource.

```ts
type AnalysisRuleType = 'exclude' | 'neutralize'

type AnalysisCategoryScope =
  | { mode: 'all' }
  | {
      mode: 'selected'
      categoryIds: string[]
      includeUncategorized: boolean
    }

type AnalysisRule = {
  id: string
  userId: string
  name: string
  type: AnalysisRuleType
  excludeScope: AnalysisCategoryScope | null
  inflowScope: AnalysisCategoryScope | null
  outflowScope: AnalysisCategoryScope | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Response views should include enough category metadata for the settings table and drawer to render labels, colors, and archived badges without separate client joins:

```ts
type AnalysisCategoryScopeView =
  | { mode: 'all' }
  | {
      mode: 'selected'
      includeUncategorized: boolean
      categories: Array<{
        id: string
        primary: string
        detailed: string
        color: string
        archivedAt: string | null
      }>
    }

type AnalysisRuleView = {
  id: string
  name: string
  type: AnalysisRuleType
  excludeScope: AnalysisCategoryScopeView | null
  inflowScope: AnalysisCategoryScopeView | null
  outflowScope: AnalysisCategoryScopeView | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Create/update DTOs:

```ts
type CreateAnalysisRuleDto =
  | {
      name: string
      type: 'exclude'
      excludeScope: AnalysisCategoryScope
    }
  | {
      name: string
      type: 'neutralize'
      inflowScope: AnalysisCategoryScope
      outflowScope: AnalysisCategoryScope
    }

type UpdateAnalysisRuleDto = Partial<CreateAnalysisRuleDto> & {
  archived?: boolean
}
```

Duplicate conflict response:

```ts
type AnalysisRuleConflict = {
  ruleId: string
  name: string
  type: AnalysisRuleType
  label: string
  archivedAt: string | null
}
```

Proposed endpoints:

- `GET /analysis-rules?archived=false|true`: current user's rules, active by default.
- `POST /analysis-rules`: create a rule after validation and duplicate check.
- `PATCH /analysis-rules/:id`: update name, type, scopes, or archive state for one owned rule.
- Optional route aliases if clearer for the frontend: `PATCH /analysis-rules/:id/archive` and `PATCH /analysis-rules/:id/restore`.
- `GET /transaction-analysis`: apply active rules automatically before aggregation.
- `GET /transaction-analysis/transactions`: apply active exclusion and neutralization rules before drilldown filtering.
- `GET /transaction-analysis/balance-adjustments`: unchanged except any shared helper should continue ignoring rules for synthetic adjustments.

## Rule Semantics

Exclusion:

- Active exclusion rules compose as a union.
- A real transaction is excluded if any active exclusion rule matches its current effective category.
- Exclusions run before neutralization.
- Excluded transactions never participate in neutralization, aggregation, or real-transaction drilldowns.

Neutralization:

- Active neutralization rules define rule-specific cancellation pools.
- Rules are applied automatically from most specific to broadest; users do not manually order rules.
- For each rule, only transactions still available after prior exclusions and more-specific neutralization passes may participate.
- A positive transaction is eligible only if it matches the rule's `inflowScope`.
- A negative transaction is eligible only if it matches the rule's `outflowScope`.
- The same category may appear on both sides of a neutralization rule.
- Within a rule's eligible pool, reuse the existing matching constraints:
  - same currency
  - same absolute amount in smallest units
  - deterministic negative ordering by activity date then ID
  - nearest positive activity-date tie-break, with deterministic fallback
- Matched transactions are removed from later neutralization passes and from aggregation.

Specificity ordering:

```ts
scopeSpecificity =
  scope.mode === 'all'
    ? 1_000_000
    : scope.categoryIds.length + (scope.includeUncategorized ? 1 : 0)

ruleSpecificity = inflowScopeSpecificity + outflowScopeSpecificity
```

Sort active neutralization rules by:

1. Smaller `ruleSpecificity`.
2. Fewer `all` sides.
3. Older `createdAt`.
4. `id` as final deterministic tie-break.

This comparator should have an inline code comment explaining that it implements "smallest pool first" so specific rules run before broad catch-all rules.

Category lifecycle:

- Scope matching evaluates the transaction's current effective category at query time.
- New rule selectors show active categories plus `All categories` and `Uncategorized`.
- Existing rules that reference archived categories continue to resolve and match those category IDs.
- Archived category references are shown with an archived badge in the rule table and drawer.
- Restored archived rules remain valid even if they reference archived categories.

Duplicate prevention:

- Duplicate checks are application-level in `AnalysisRuleService`; do not add a DB unique hash/key in v1.
- `type` must match.
- For `exclude`, the normalized `excludeScope` must match.
- For `neutralize`, normalized `inflowScope` and normalized `outflowScope` must both match.
- Scope normalization sorts and de-dupes category IDs.
- `includeUncategorized` participates in equality.
- `mode: all` ignores category IDs and `includeUncategorized`.
- Rule `name` is ignored for duplicate identity.
- Conflicts return `409` with `AnalysisRuleConflict`.
- If the conflicting rule is archived, the UI offers `Restore existing rule`.

## Milestones

### 1. Backend Rule Resource

Implementation tasks:

- Add `backend/src/analysis-rule/analysis-rule.entity.ts` with `id`, `userId`, `name`, `type`, JSONB scope columns or nullable typed JSONB fields, `archivedAt`, and timestamps.
- Add `backend/src/types/AnalysisRule.ts` with Zod schemas for scopes, DTOs, views, conflict payloads, and response arrays.
- Add `backend/src/analysis-rule/analysis-rule.service.ts` for owned CRUD, archive/restore, duplicate detection, scope normalization, category metadata hydration, and active-rule loading.
- Add `backend/src/analysis-rule/analysis-rule.controller.ts` for `GET`, `POST`, and `PATCH` endpoints.
- Add `backend/src/analysis-rule/analysis-rule.module.ts` and import it in `backend/src/app.module.ts`.
- Add a TypeORM migration for the analysis rule table.
- Validate referenced category IDs belong to the current user and exist. Active selectors should avoid archived categories, but backend should allow archived references already present on update/restore.
- Return `409 Conflict` for duplicate active or archived rules with conflict metadata.

Exit criteria:

- A user can create, list, update, archive, and restore their own rules.
- Users cannot read or mutate another user's rules.
- Duplicate create/update/restore returns a conflict payload that the frontend can render without extra lookup.
- Archived rules are excluded from active lists by default and from analysis execution.

### 2. Rule Engine Integration

Implementation tasks:

- Extract the current neutralization helpers in `TransactionAnalysisService` so they can operate on a provided candidate list while preserving existing tie-breaking.
- Add an analysis rule application pipeline:
  1. load active rules for `userId`
  2. apply exclusion union to posted transactions
  3. sort neutralization rules by documented specificity
  4. run existing same-currency/same-amount neutralization per rule pool
  5. return remaining real transactions for aggregation/drilldown
- Inject `AnalysisRuleService` into `TransactionAnalysisService`.
- Update `getAnalysis` to aggregate post-rule transactions.
- Update `getCategoryTransactions` to return post-rule, post-neutralization unmatched real transactions.
- Keep `getBalanceAdjustmentData` and `getBalanceAdjustments` rule-agnostic.
- Preserve preferred-currency conversion and balance-adjustment behavior after rule filtering.
- Ensure no active neutralization rules means no neutralization.

Exit criteria:

- With no rules, equal-and-opposite transactions both remain in analysis.
- Exclusion rules remove matching real transactions from summary and real-transaction drilldowns.
- Neutralization rules remove only eligible matched pairs.
- More-specific neutralization rules run before broader rules, with deterministic behavior across date ranges.
- `BALANCE_ADJUSTMENT` rows are unchanged by category rules.

### 3. Generated Client and Settings Tab

Implementation tasks:

- Regenerate the frontend API client with `cd frontend && yarn orval` after backend OpenAPI updates.
- Extend `SettingsTab` in `frontend/src/routes/_authed/settings.tsx` to include `analysis`.
- Add a `Tabs.Tab value="analysis">Analysis</Tabs.Tab` and route search validation for `/settings?tab=analysis`.
- Add `frontend/src/components/settings/AnalysisRulesSection.tsx`.
- Follow `CustomCategoriesSection` table patterns:
  - Mantine table with search, archived toggle/filter, active/archived status badge, type badge, scope summary, and actions.
  - Drawer editor for create/edit/details.
  - Archive/restore actions.
  - Duplicate conflict alert with restore action for archived duplicate rules.
- Do not include rule descriptions.
- Require `name` with a short max length, such as 80 characters.
- Show columns for `Name`, `Type`, `Scope`, `Status`, and row actions.

Exit criteria:

- `/settings?tab=analysis` opens the Analysis settings tab directly.
- Users can create, edit, archive, and restore rules from a drawer.
- Duplicate conflict UX mirrors category creation closely enough that archived duplicate rules can be restored from the conflict alert.
- The table remains usable on desktop and mobile.

### 4. Category Scope Input

Implementation tasks:

- Add a reusable `CategoryScopeInput` component under `frontend/src/components/categories/` or `frontend/src/components/settings/analysis-rules/`.
- Use Mantine primitives to support:
  - `All categories` vs `Selected categories` mode.
  - Autocomplete/search for selected categories.
  - Multi-select category values with color swatches and primary/detailed labels.
  - `Include uncategorized` checkbox for selected mode.
  - `Clear all` action.
  - Archived badge for existing archived references.
  - Responsive sizing for desktop drawer and mobile drawer.
- Reuse category color helpers from `frontend/src/lib/category-colors.ts`.
- Reuse category option shaping patterns from `CategorySelect` where practical, but do not overload the single-select `CategorySelect` API.

Exit criteria:

- Scope inputs can represent `all`, selected category IDs, and uncategorized inclusion without lossy conversion.
- Users can search categories by primary or detailed labels.
- Users can clear selected categories in one action.
- Existing archived references remain visible and removable.
- The input does not overflow or obscure controls on mobile or desktop.

### 5. Analysis Page Visibility

Implementation tasks:

- Add a `Rules` button to `frontend/src/routes/_authed/analysis.tsx` near the date range controls.
- Link it to `/settings?tab=analysis`.
- Fetch active rules with `GET /analysis-rules?archived=false`.
- Show a compact badge or label for active count, such as `No rules` or `3 active`.
- Keep `/transaction-analysis` response shape unchanged.

Exit criteria:

- Analysis users can navigate directly to rule settings.
- The page gives a lightweight signal when no active rules exist.
- Existing date range behavior and chart layout remain intact.

### 6. Documentation and Future Surface Notes

Implementation tasks:

- Update backend README or relevant API notes to say analysis rules are backend-applied to transaction analysis endpoints.
- Keep MCP docs unchanged except do not claim MCP exposes analysis rules or cash-flow analysis.
- Add code comments near the specificity comparator and rule pipeline documenting the product semantics.
- Add concise frontend helper text in Settings explaining that rules apply to the selected analysis date range and future analysis callers automatically.

Exit criteria:

- A future implementer can find the rule semantics in code and this plan without rediscovering decisions.
- MCP remains explicitly out of scope for v1.

## Tests

### Backend

- `AnalysisRuleService` creates exclude and neutralize rules for the current user.
- Rule create/update validates name, type, and scope shape.
- Rule create/update rejects category IDs not owned by the current user.
- Rule create/update supports `all` and `includeUncategorized`.
- Duplicate exclude rules return `409` and conflict metadata.
- Duplicate neutralization rules return `409` and conflict metadata even when category ID order differs.
- Duplicate detection ignores rule name.
- Archived duplicate conflict includes `archivedAt` so the UI can offer restore.
- Archive removes rules from active analysis execution.
- Restore reactivates rules unless it conflicts.
- Transaction analysis with no rules performs no neutralization.
- Exclusion rules remove matching real transactions before aggregation and drilldown.
- Exclusion rules union across multiple active rules.
- Neutralization rules match only eligible sign-specific scopes.
- Same category on inflow and outflow sides is allowed and works.
- Neutralization specificity ordering runs narrower rules before broader rules.
- Existing same-currency, same-absolute-smallest-unit, nearest-positive tie-break behavior is preserved inside rule pools.
- Foreign-currency conversion remains anchored to `endDate`.
- Balance adjustments are unchanged by rule scopes.
- Archived category references still match transactions that use those category IDs.
- `UNCATEGORIZED` scope matches transactions with no effective category.
- Controller tests cover ownership, validation, and conflict responses.
- Migration/schema test or focused migration review covers the new table.

### Frontend

- Settings route accepts and renders `tab=analysis`.
- Analysis rules table renders loading, error, empty, active, and archived states.
- Create drawer validates required name and required scopes.
- Exclude rule form shows one `CategoryScopeInput`.
- Neutralize rule form shows inflow and outflow `CategoryScopeInput`s.
- `CategoryScopeInput` supports all mode, selected mode, autocomplete/search, clear all, uncategorized checkbox, and archived selected references.
- Duplicate conflict alert renders conflict label and restore action when archived.
- Archive/restore invalidates rules and transaction-analysis queries.
- Analysis page shows `Rules` button and active-rule count.
- Analysis page navigation points to `/settings?tab=analysis`.
- Mobile layout keeps drawer controls and multi-select values usable without overlap.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/analysis-rule
cd backend && yarn test test/transaction-analysis/transaction-analysis.service.spec.ts
cd backend && yarn test test/transaction-analysis/transaction-analysis.controller.spec.ts
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/settings/AnalysisRulesSection.test.tsx
cd frontend && yarn test src/components/categories/CategoryScopeInput.test.tsx
cd frontend && yarn test src/routes/_authed/settings.test.tsx
cd frontend && yarn test src/routes/_authed/analysis.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

UI validation:

- Start backend and frontend with the local dev workflow.
- Use browser validation for `/settings?tab=analysis` on desktop and mobile widths.
- Create, edit, archive, restore, and duplicate-conflict a rule.
- Verify `/analysis` shows the Rules button and count.
- Verify analysis numbers change only after saving rule changes and refreshing/refetching data.

## Overall Exit Criteria

- Users can manage persisted analysis rules from Settings without needing any one-off setup elsewhere.
- Analysis summary and real-transaction drilldowns automatically apply active rules for every caller of the analysis endpoints.
- No-rule behavior is explicit: no neutralization occurs unless the user creates a neutralization rule.
- Exclusions, neutralization specificity, archived category references, and uncategorized matching are deterministic and covered by tests.
- Existing balance-adjustment behavior remains intact.
- The Analysis page exposes rule control through a `Rules` button and active-rule count.
- API client generation, backend tests, frontend tests, lint, typecheck, and browser validation pass.
