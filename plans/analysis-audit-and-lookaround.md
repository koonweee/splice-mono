# Analysis Audit And Lookaround Neutralization Plan

## Status

Done

## Goal

Make Analysis rule behavior explainable and better at handling refund timing across date boundaries.

Users should be able to:

- Open an `Audit` drawer from the Analysis page to see which rules affected the selected date range.
- See excluded transactions grouped by the exclusion rule that removed them.
- See neutralized transaction pairs grouped by the neutralization rule that matched them.
- Navigate from the audit drawer to Settings -> Analysis to manage rules.
- Configure one user-level neutralization lookaround setting, defaulting to `60` days, rendered as a singleton rule-like row in the Settings -> Analysis rules table.

Behavioral target:

- Analysis summaries and transaction drilldowns still report only the selected date range.
- Neutralization may use out-of-range transactions as candidates within the configured lookaround window.
- Out-of-range candidates never directly contribute to summary totals or drilldown rows.
- Out-of-range candidates can cause an in-range transaction to disappear when they form a valid matched pair.
- The audit endpoint explains these rule effects for the selected date range.

## Current Behavior

- Analysis UI lives in `frontend/src/routes/_authed/analysis.tsx`.
- The page currently shows a `Rules` button beside `DateRangeControl`, linking directly to `/settings?tab=analysis` with an active-rule count.
- Analysis summary data comes from `useTransactionAnalysisControllerGetAnalysis({ startDate, endDate })`.
- Category drilldowns use `frontend/src/components/CategoryTransactionsModal.tsx`.
- On mobile, transaction drilldowns now reuse `TransactionsMobileList`; desktop uses `TransactionsTable`.
- Backend summary and real-transaction drilldowns are implemented in `backend/src/transaction-analysis/transaction-analysis.service.ts`.
- `getAnalysis` and `getCategoryTransactions` currently load posted transactions only inside the requested `startDate` / `endDate`.
- `applyAnalysisRules` applies active exclusions first, then active neutralization rules sorted by `AnalysisRuleService.compareNeutralizationRules`.
- Existing neutralization constraints are same original currency and same absolute smallest-unit amount.
- Existing neutralization matching currently allows either date order and chooses nearest positive activity date for each negative transaction.
- Rule CRUD and duplicate handling live in `backend/src/analysis-rule/analysis-rule.service.ts`.
- Rule DTOs and views live in `backend/src/types/AnalysisRule.ts`.
- User settings are stored as JSONB on `UserEntity.settings`, shaped by `backend/src/types/UserSettings.ts`, updated through `UserService.updateSettings`, and surfaced in `frontend/src/routes/_authed/settings.tsx`.
- Existing plan `plans/user-configurable-analysis-rules.md` is implemented and explicitly left audit/explanation out of v1.

Known constraints:

- The audit endpoint must match summary and drilldown rule behavior exactly, so rule application should not be forked into separate summary-only and audit-only implementations.
- Out-of-range candidate transactions must not affect balance adjustment logic. Balance adjustments remain synthetic rows based on the selected date range.
- Rule effects can be numerous. The first version can be unpaginated, but the API shape should not block future pagination.
- The singleton lookaround setting should be displayed in the rules table but should not be stored as a normal `analysis_rule_entity`.

## Target Data Shape

### User settings

Add a user-level setting:

```ts
type UserSettings = {
  currency: string
  timezone: string
  hideZeroBalanceAccounts: boolean
  theme: UserThemePreference
  neutralizationLookaroundDays: number
}
```

Validation:

- Default: `60`.
- Minimum: `0`.
- Maximum: `180`.
- Must be an integer.

### Audit transaction summary

Return compact summaries rather than full `Transaction` objects:

```ts
type AnalysisAuditTransaction = {
  id: string
  activityDate: string
  merchantName: string | null
  originalDescription: string | null
  accountName: string
  categoryPrimary: string
  categoryDetailed: string | null
  amount: {
    amount: number
    currency: string
    sign: 'positive' | 'negative'
  }
}
```

### Audit rows

Return flat rows with grouping fields. The frontend groups rows by `groupKey`.

```ts
type AnalysisAuditRow =
  | {
      id: string
      type: 'excluded'
      groupKey: string
      groupLabel: string
      ruleId: string
      ruleName: string
      transaction: AnalysisAuditTransaction
    }
  | {
      id: string
      type: 'neutralized'
      groupKey: string
      groupLabel: string
      ruleId: string
      ruleName: string
      outflow: AnalysisAuditTransaction
      inflow: AnalysisAuditTransaction
    }
```

Response shape:

```ts
type TransactionAnalysisAuditResponse = {
  startDate: string
  endDate: string
  neutralizationLookaroundDays: number
  rows: AnalysisAuditRow[]
}
```

Group labels:

- Exclusion: `Excluded by "<rule name>"`.
- Neutralization: `Neutralized by "<rule name>"`.

Rows included:

- Exclusion rows include every excluded transaction whose activity date is inside the selected range.
- Neutralization rows include matched pairs where at least one side is inside the selected range.
- Fully out-of-range neutralized pairs are omitted because they do not affect the selected report.

### API endpoints

Add:

- `GET /transaction-analysis/audit?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

Keep existing endpoints:

- `GET /transaction-analysis`
- `GET /transaction-analysis/transactions`
- `GET /transaction-analysis/balance-adjustments`
- `PATCH /user/settings`
- `GET /user/me`

Regenerate frontend API models and hooks with `cd frontend && yarn orval`.

## Rule Semantics

### Lookaround window

For analysis rule application, define:

```ts
candidateStartDate = startDate - neutralizationLookaroundDays
candidateEndDate = endDate + neutralizationLookaroundDays
```

Use the selected range for report rows:

```ts
reportStartDate = startDate
reportEndDate = endDate
```

Summary and transaction drilldowns should:

1. Load posted candidate transactions from `candidateStartDate` through `candidateEndDate`.
2. Apply exclusion rules to candidate transactions.
3. Apply neutralization rules to remaining candidate transactions.
4. Return or aggregate only remaining transactions whose activity date is inside `reportStartDate` through `reportEndDate`.

Balance adjustment calculations continue using the selected report range, not the enlarged candidate window.

### Exclusion

- Exclusion rules still compose as a union.
- Excluded candidate transactions cannot participate in neutralization.
- Exclusion audit rows are emitted only for excluded transactions inside the selected range.

### Neutralization

Neutralization remains rule-scoped and specificity-ordered:

1. Active neutralization rules run from smallest pool to broadest using `AnalysisRuleService.compareNeutralizationRules`.
2. A transaction consumed by a more-specific rule is unavailable to later rules.
3. Positive transactions must match the rule's `inflowScope`.
4. Negative transactions must match the rule's `outflowScope`.
5. Matches require:
   - same original currency
   - same absolute amount in smallest units
   - `outflow.activityDate <= inflow.activityDate`
6. Within each same-currency/same-amount bucket, each inflow selects the closest earlier unmatched outflow.
7. Tie-break same-distance outflows by existing stable transaction order: activity date, then transaction id.
8. Each inflow and each outflow can be matched at most once.

Audit rows are emitted for neutralized pairs where either transaction is inside the selected range.

## Milestones

### 1. User Setting For Lookaround

Implementation tasks:

- Add `neutralizationLookaroundDays` to `backend/src/types/UserSettings.ts`.
- Update `DEFAULT_USER_SETTINGS` and `normalizeUserSettings`.
- Extend `UpdateUserSettingsDtoSchema` with integer validation from `0` to `180`.
- Update `backend/src/user/user.service.ts` merge logic to preserve/update the new field.
- Add a migration to update the `user_entity.settings` JSONB default and existing rows with `neutralizationLookaroundDays: 60`.
- Regenerate frontend API models after backend schema changes.
- Update Settings page local state and save payload handling in `frontend/src/routes/_authed/settings.tsx` or pass the setting/mutation into `AnalysisRulesSection`.

Exit criteria:

- Existing users normalize to `neutralizationLookaroundDays = 60`.
- New users receive the default in stored settings.
- `PATCH /user/settings` accepts valid integer values from `0` to `180`.
- Invalid values are rejected by backend validation.
- Generated frontend `UserSettings` and `UpdateUserSettingsDto` models include `neutralizationLookaroundDays`.

### 2. Directional Lookaround Rule Engine

Implementation tasks:

- Introduce a shared rule application result type in `TransactionAnalysisService`, such as:

  ```ts
  type AnalysisRuleApplicationResult = {
    remainingReportTransactions: TransactionEntity[]
    auditRows: AnalysisAuditRow[]
  }
  ```

- Add date helpers for:
  - subtracting/adding lookaround days
  - checking whether a transaction activity date is inside the selected report range
- Change `getAnalysis` and `getCategoryTransactions` to load posted candidate transactions from the enlarged candidate range.
- Keep selected-range account sets for balance adjustment behavior so out-of-range candidates do not expand synthetic balance adjustment inputs.
- Replace current neutralization internals with directional matching:
  - bucket by original currency and absolute smallest-unit amount
  - process inflows deterministically
  - eligible outflows must be unmatched and have `activityDate <= inflow.activityDate`
  - choose closest earlier outflow, then stable date/id fallback
- Preserve exclusion-first behavior and rule specificity ordering.
- Return only `remainingReportTransactions` to summary aggregation and real-transaction drilldowns.
- Generate audit rows during the same rule application pass so audit and summary cannot diverge.

Exit criteria:

- With `neutralizationLookaroundDays = 0`, behavior matches strict selected-range candidate loading.
- With default `60`, an in-range purchase can be neutralized by a later out-of-range refund inside the lookaround window.
- Later outflows cannot be neutralized by earlier inflows.
- Excluded out-of-range candidates do not participate in neutralization.
- Fully out-of-range matched pairs are not returned in audit rows.
- Balance adjustments are unchanged by candidate lookaround.

### 3. Analysis Audit Endpoint

Implementation tasks:

- Add audit schemas to `backend/src/types/TransactionAnalysis.ts`:
  - `AnalysisAuditTransactionSchema`
  - `AnalysisAuditExcludedRowSchema`
  - `AnalysisAuditNeutralizedRowSchema`
  - `TransactionAnalysisAuditResponseSchema`
- Add `GET /transaction-analysis/audit` to `backend/src/transaction-analysis/transaction-analysis.controller.ts`.
- Validate `startDate <= endDate` consistently with existing analysis endpoints.
- Add `TransactionAnalysisService.getAnalysisAudit(startDate, endDate, userId)`.
- Reuse the shared rule application pipeline from Milestone 2.
- Return `startDate`, `endDate`, `neutralizationLookaroundDays`, and flat `rows`.
- Keep `GET /transaction-analysis` response shape unchanged.

Exit criteria:

- Audit endpoint returns empty `rows` when no rule effects affect the selected range.
- Audit endpoint returns excluded rows grouped by stable `groupKey` / `groupLabel`.
- Audit endpoint returns one neutralized row per matched pair, not one row per transaction.
- Audit rows use compact transaction summaries.
- Generated frontend API client contains the audit hook and models.

### 4. Settings Rules Singleton Row

Implementation tasks:

- Update `frontend/src/components/settings/AnalysisRulesSection.tsx` to render a singleton rule-like row for the user-level lookaround setting.
- Store it separately from `analysis_rule_entity` rows in local row data, with a discriminated table item type.
- Suggested row presentation:
  - Name: `Neutralization lookaround`
  - Type badge: `Setting`
  - Scope: `60 days before/after selected range`
  - Status: `Active`
  - Actions: edit only
- Hide the singleton row in archived mode.
- Add an edit drawer or reuse the existing drawer shell with a `NumberInput`.
- Validate `0..180` on the client and submit through `useUserControllerUpdateSettings`.
- Invalidate `user/me`, `transaction-analysis`, and `transaction-analysis/audit` queries on save.
- Do not include this singleton row in duplicate-rule checks, archive/restore actions, or rule create/update DTOs.

Exit criteria:

- Settings -> Analysis shows the singleton row above or alongside normal rules.
- Editing the setting persists to the user and updates the visible row.
- The setting remains available when there are no analysis rules.
- Archived rules mode does not show the singleton as an archived rule.

### 5. Analysis Audit Drawer

Implementation tasks:

- Replace the top-level `Rules` button in `frontend/src/routes/_authed/analysis.tsx` with an `Audit` button.
- Style the `Audit` button like the current rules button and match `DateRangeControl` sizing.
- Use a suitable lucide icon such as `ClipboardList` or `ListChecks`.
- Do not show an eager count or badge.
- Add a drawer component, for example `frontend/src/components/analysis/AnalysisAuditDrawer.tsx`.
- Open the drawer from the `Audit` button.
- Fetch `GET /transaction-analysis/audit` only when the drawer is open.
- Drawer title: `Analysis audit`.
- Include a `Manage rules` button/link to `/settings?tab=analysis` inside the drawer.
- Empty state: `No rule effects for this date range.` with a secondary `Manage rules` action.
- Loading and error states should stay inside the drawer.
- Group flat audit rows by `groupKey`, displaying `groupLabel` as the section header.
- Render excluded rows as individual transaction rows.
- Render neutralized rows as one paired row showing outflow date/transaction and inflow date/transaction.
- Keep dates visible instead of adding in-range/out-of-range badges.
- Use responsive layout:
  - desktop: right drawer with table/list sections
  - mobile: bottom or full-height drawer with list-style rows and only the drawer content scrolling

Exit criteria:

- Analysis page top actions show date range and `Audit`; direct `Rules` navigation is no longer top-level.
- Opening `Audit` fetches audit rows for the selected date range.
- Users can navigate to rules settings from inside the drawer.
- Group headers avoid repeating long reason text on every row.
- Mobile drawer avoids nested incoherent scrolling.

### 6. Documentation And API Notes

Implementation tasks:

- Update `backend/README.md` or nearby API notes to document:
  - analysis rules are backend-applied
  - neutralization uses the user lookaround setting
  - audit endpoint explains rule effects
- Update `plans/user-configurable-analysis-rules.md` status or notes only if needed to point to this follow-up plan; do not rewrite its implemented history.
- Add concise code comments near the directional matching logic explaining:
  - same currency and amount are match requirements
  - outflow must be on or before inflow
  - closest earlier outflow wins
  - out-of-range rows are candidates only

Exit criteria:

- Future implementers can find the audit and lookaround semantics without reconstructing product decisions from tests.
- Swagger/OpenAPI descriptions no longer imply neutralization is limited only to the requested range.

## Tests

### Backend

- `UserSettingsSchema` normalizes missing `neutralizationLookaroundDays` to `60`.
- `UpdateUserSettingsDtoSchema` accepts integer values `0`, `60`, and `180`.
- `UpdateUserSettingsDtoSchema` rejects negative, over-max, and non-integer values.
- `UserService.updateSettings` merges the new setting without dropping existing settings.
- Migration updates existing rows and user settings default.
- `TransactionAnalysisService` with lookaround `0` only matches within selected range.
- `TransactionAnalysisService` with lookaround `60` matches an in-range outflow to a later out-of-range inflow.
- `TransactionAnalysisService` does not match an in-range outflow to an earlier inflow.
- `TransactionAnalysisService` matches each inflow and outflow at most once.
- Closest earlier outflow wins when repeated same-amount outflows exist.
- Exclusion audit rows include only in-range excluded transactions.
- Neutralization audit rows include pairs with at least one in-range side.
- Fully out-of-range pairs are omitted from audit output.
- Excluded candidates do not participate in neutralization.
- More-specific neutralization rules still run before broader rules.
- `GET /transaction-analysis` keeps existing response shape.
- `GET /transaction-analysis/transactions` uses the same rule application as summary.
- `GET /transaction-analysis/audit` validates date ranges and returns expected row shapes.
- Balance adjustments remain selected-range based and rule/audit agnostic.

### Frontend

- `AnalysisRulesSection` renders the singleton lookaround row in active mode.
- `AnalysisRulesSection` hides the singleton lookaround row in archived mode.
- Editing lookaround days validates `0..180` and calls `useUserControllerUpdateSettings`.
- Updating lookaround invalidates user, analysis, and audit queries.
- Analysis page renders an `Audit` button instead of the top-level `Rules` button.
- Audit button opens the drawer and triggers the audit query only while open.
- Drawer loading, error, and empty states render correctly.
- Empty state includes `Manage rules` link to `/settings?tab=analysis`.
- Audit rows group by `groupKey` and render `groupLabel` once per group.
- Excluded audit rows render compact transaction details and dates.
- Neutralized audit rows render paired outflow/inflow transaction details and dates.
- Mobile drawer layout remains usable without nested scroll conflicts.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/user/user.service.spec.ts
cd backend && yarn test test/transaction-analysis/transaction-analysis.service.spec.ts
cd backend && yarn test test/transaction-analysis/transaction-analysis.controller.spec.ts
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/settings/AnalysisRulesSection.test.tsx
cd frontend && yarn test src/routes/_authed/analysis.test.tsx
cd frontend && yarn test src/components/analysis/AnalysisAuditDrawer.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

UI validation:

- Start the local backend and frontend with the repository local dev workflow.
- Use browser validation for `/analysis` on desktop and mobile.
- Verify the top action button is `Audit` and opens the drawer.
- Verify `Manage rules` opens `/settings?tab=analysis`.
- Verify the drawer empty state with no matching rule effects.
- Create an exclusion rule, open Analysis audit, and verify grouped excluded transactions.
- Create a neutralization rule, use transactions across a date boundary, and verify paired audit rows.
- Verify mobile drawer content scrolls coherently and row text does not overlap.

## Overall Exit Criteria

- Analysis users can inspect rule effects for the selected date range without leaving the page.
- The Analysis page no longer exposes a top-level `Rules` button; rule management is reachable from the audit drawer.
- Exclusion and neutralization rule effects are grouped by reason and shown with compact transaction details.
- Neutralization handles common refund timing across date boundaries using the user-level lookaround setting.
- The singleton lookaround setting is editable from Settings -> Analysis as a rule-like row while remaining stored as user settings.
- Existing summary and drilldown endpoints remain compatible for existing callers.
- Backend tests, frontend tests, generated API client, lint, typecheck, and browser validation pass.
