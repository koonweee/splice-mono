# Automatic Transaction Categorization Rules

## Status

Planned

## Goal

Automatically set an effective app category on provider transactions during ingestion using user-owned categorization rules, while recording whether the effective category came from a user action or a rule.

Users should be able to manage categorization rules from Settings with a rule-like UX grounded in the existing Analysis rules surface. Manual category edits remain authoritative and must not be overwritten by provider sync or automatic rules.

Locked assumptions from product discussion:

- `transaction.categoryId` remains the effective category used by the Transactions page, filters, analysis, MCP/export, and related consumers.
- Provider category hints remain informational inputs stored as `providerCategoryHint`; provider hints do not directly set the app category.
- Add only minimal category assignment provenance fields: assignment source and matched rule ID.
- Reuse the existing `categoryUpdatedAt` timestamp as the effective category assignment timestamp.
- Category assignment source values are `manual`, `rule`, or `null`; do not overload the existing `transaction.source` field, which means transaction origin.
- Rules are user-authored, user-owned, archived/restored, and evaluated deterministically.
- Rule conditions are combined with `AND` only in v1. Users can create multiple rules for `OR` behavior.
- Amount conditions compare the transaction amount number in its native currency and ignore currency in v1. No conversion and no currency selector.

## Current Behavior

- `backend/src/transaction/transaction.entity.ts` stores `categoryId`, `category`, and `categoryUpdatedAt` as the app category fields. It stores Plaid category guidance separately in `providerCategoryProvider`, `providerCategoryPrimary`, `providerCategoryDetailed`, icon, and confidence fields.
- `backend/src/types/Transaction.ts` exposes `categoryId`, `category`, `categoryUpdatedAt`, and `providerCategoryHint`.
- `backend/src/bank-link/providers/plaid/plaid.provider.ts` requests Plaid `include_personal_finance_category` and maps Plaid PFC values into `CreateTransactionDto.personalFinanceCategory`.
- `backend/src/transaction/transaction.service.ts` creates new provider-synced transactions with `categoryId: null` in `processSyncResults()`, while preserving provider hints. Modified sync updates provider fields but should not overwrite manual app category assignments.
- `backend/src/transaction/transaction.service.ts` implements single and bulk category updates through `updateCategory()`, `bulkUpdateCategories()`, and `undoBulkUpdateCategories()`. Bulk undo snapshots currently preserve `categoryId` and `categoryUpdatedAt`.
- `backend/src/category/category.service.ts` exposes active user-owned categories and validates assignable categories with `findActiveAssignableCategory()`.
- `frontend/src/components/settings/AnalysisRulesSection.tsx` provides the closest existing rule-management UX: searchable active/archive table, drawer create/edit form, duplicate conflict handling, restore action, summary panel, and mobile list behavior.
- `frontend/src/components/categories/CategorySelect.tsx` is the existing assignable-category selector used by transaction editing and category management.
- Settings tabs are owned by `frontend/src/routes/_authed/settings.tsx`; adding a new rule-management section requires extending the validated tab set and route UI.
- Generated frontend API files under `frontend/src/api/**` must not be hand-edited. Regenerate them with `cd frontend && yarn orval` after backend OpenAPI changes.
- The worktree currently has unrelated local edits in `backend/src/bank-link/providers/plaid/plaid.provider.ts` and `backend/test/bank-link/plaid.provider.spec.ts`; implementation should read and preserve those edits.

## Design Reference

Implementation should match the generated transaction-rules contact sheet as the target UX, while using the existing Analysis rules UI as the concrete component/style precedent:

- Existing Analysis rules reference screenshots:
  - `tmp/screenshots/analysis-rules-agent-list.png`
  - `tmp/screenshots/analysis-rules-agent-new-drawer.png`
- Generated transaction categorization rules contact sheet:
  - `tmp/screenshots/transaction-categorization-rules-contact-sheet.png`

Design decisions locked by the generated contact sheet:

- Add a first-class `Categorization` Settings tab between `Analysis` and `MCP`.
- Use the same dark Settings page chrome, tab treatment, table border treatment, muted panel backgrounds, purple primary action, and compact badges as the Analysis rules UI.
- The top-level section is titled `Categorization rules` with supporting copy `Rules set effective transaction categories during ingestion.`
- The desktop list uses table columns: `Name`, `Target category`, `Conditions`, `Priority`, `Status`, `Actions`.
- The primary action is `New rule`; secondary archive filter is `Archived`; search placeholder is `Search rules...`.
- Target category is displayed as a compact pill with a small category color dot and `Primary / Detailed` or existing app category label ordering chosen consistently with current category UI.
- Conditions are summarized as short, line-wrapped prose in the table, for example `Merchant contains Uber` and `AND Amount is outflow`.
- The rule editor is a right-side drawer titled `New categorization rule` / `Edit categorization rule`, not a modal.
- Drawer fields are ordered: `Name`, `Target category`, `Priority`, then `Conditions`.
- The condition editor uses a three-column row layout: `Field`, `Operator`, `Value`, plus a remove icon button per row.
- Multiple conditions show explicit `AND` separators between rows.
- Amount `between` uses two compact numeric inputs joined by inline `and`.
- The drawer summary card states the resulting behavior in one sentence, for example `If merchant name contains Uber, set category to Transport / Rideshare.`
- `Apply rule to existing transactions` uses a focused overlay/dialog or drawer state with a selected-rule card and result/count cards for `Matched`, `Updated`, and `Skipped manual`.
- The apply flow must visibly state `Manual categories are never overwritten.`
- Keep labels and controls dense enough for operational use; avoid marketing copy, decorative hero layouts, nested cards, or explanatory walls of text.

## Target Data Shape

Extend transaction persistence and API shape:

```ts
type Transaction = {
  categoryId: string | null
  category?: Category | null
  categoryUpdatedAt: Date | null
  categoryAssignmentSource: 'manual' | 'rule' | null
  categoryAssignmentRuleId: string | null
  providerCategoryHint: ProviderCategoryHint | null
}
```

Add a new categorization rule contract:

```ts
type CategorizationRuleCondition =
  | {
      field:
        | 'merchantName'
        | 'providerTransactionName'
        | 'originalDescription'
        | 'merchantEntityId'
        | 'website'
        | 'providerCategoryPrimary'
        | 'providerCategoryDetailed'
      operator: 'equals' | 'contains' | 'startsWith' | 'endsWith'
      value: string
    }
  | {
      field: 'accountId'
      operator: 'equals' | 'in'
      value: string | string[]
    }
  | {
      field: 'amountSign'
      operator: 'equals'
      value: 'positive' | 'negative'
    }
  | {
      field: 'amount'
      operator: 'equals' | 'greaterThan' | 'lessThan' | 'between'
      value:
        | number
        | {
            min?: number
            max?: number
          }
    }

type CategorizationRule = {
  id: string
  name: string
  priority: number
  targetCategoryId: string
  targetCategory: Category
  conditions: CategorizationRuleCondition[]
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

Rule evaluation semantics:

- Active rules only.
- Lower `priority` evaluates first, then `createdAt`, then `id`.
- First matching rule wins.
- All conditions in a rule must match.
- Text matching is case-insensitive, trimmed, and whitespace-normalized.
- Amount matching uses `transaction.amount.money.amount` without currency conversion or currency checks.
- A rule match sets `categoryId`, `categoryAssignmentSource = 'rule'`, `categoryAssignmentRuleId`, and `categoryUpdatedAt`.
- A manual category action sets `categoryAssignmentSource = 'manual'`, clears `categoryAssignmentRuleId`, and updates or clears `categoryUpdatedAt` according to the category action.
- No match sets `categoryId = null`, `categoryAssignmentSource = null`, `categoryAssignmentRuleId = null`, and `categoryUpdatedAt = null` for newly ingested provider rows.

## Milestones

### 1. Transaction Assignment Provenance

Implementation tasks:

- Add a backend migration after the latest existing migration:
  - Add nullable `categoryAssignmentSource varchar` to `transaction_entity`.
  - Add nullable `categoryAssignmentRuleId uuid` to `transaction_entity`.
  - Backfill existing rows that have `categoryId IS NOT NULL` to `categoryAssignmentSource = 'manual'`, because existing app category assignments are user-controlled in the current model.
  - Leave uncategorized rows with null assignment fields.
  - Defer the foreign key for `categoryAssignmentRuleId` until the categorization rule table exists, or add it in the rule-table migration with `ON DELETE SET NULL`.
- Update `backend/src/transaction/transaction.entity.ts`:
  - Add entity columns and serialize the fields from `toObject()`.
  - Keep `transaction.source` unchanged as transaction origin.
  - Broaden comments around `categoryUpdatedAt` from user-selected timestamp to effective assignment timestamp.
- Update `backend/src/types/Transaction.ts`:
  - Add `CategoryAssignmentSourceSchema` with `manual` and `rule`.
  - Add `categoryAssignmentSource` and `categoryAssignmentRuleId` to `TransactionSchema`.
- Update `backend/src/transaction/transaction.service.ts`:
  - `create()`, `updateCategory()`, and `bulkUpdateCategories()` set `manual` source and clear rule ID when assigning a category.
  - Clearing a category through user action sets `categoryId = null`, `categoryAssignmentSource = 'manual'`, `categoryAssignmentRuleId = null`, and `categoryUpdatedAt = null` unless product decides later that manual uncategorized should preserve a timestamp.
  - Manual transactions created through `createManual()` use `categoryAssignmentSource = 'manual'`.
  - Bulk undo tokens preserve and restore `categoryAssignmentSource` and `categoryAssignmentRuleId` in addition to `categoryId` and `categoryUpdatedAt`.

Exit criteria:

- Existing categorized transactions serialize with `categoryAssignmentSource: 'manual'`.
- Existing uncategorized transactions serialize with null assignment provenance.
- Single and bulk category edits keep existing effective category behavior while recording manual assignment provenance.
- Bulk category undo restores provenance exactly.
- Migration applies and reverts cleanly on a local database.

### 2. Categorization Rule Backend API

Implementation tasks:

- Add `backend/src/transaction-categorization/` with:
  - `categorization-rule.entity.ts`
  - `categorization-rule.service.ts`
  - `categorization-rule.controller.ts`
  - `transaction-categorization.module.ts`
  - `rule-based-categorization.engine.ts`
  - condition normalization/matching helpers.
- Import the new module in `backend/src/app.module.ts`.
- Define Zod schemas in a new `backend/src/types/CategorizationRule.ts`:
  - condition discriminated unions
  - create/update DTOs
  - rule view schema including hydrated target category metadata
  - conflict schema for duplicate rule attempts.
- Add a migration for `categorization_rule_entity`:
  - `id uuid`
  - `userId uuid`
  - `name varchar(80)`
  - `priority integer`
  - `targetCategoryId uuid`
  - `conditions jsonb`
  - `archivedAt timestamptz nullable`
  - timestamps
  - FK to `category_entity(id)`
  - FK from `transaction_entity.categoryAssignmentRuleId` to this table with `ON DELETE SET NULL`.
- Implement endpoints mirroring analysis-rule conventions:
  - `GET /categorization-rules?archived=true`
  - `POST /categorization-rules`
  - `PATCH /categorization-rules/:id`
- Validate:
  - rule ownership by `userId`
  - target category exists, belongs to user, and is active for create/update assignment
  - archived target categories remain displayable for existing rules but cannot be selected for new active rule targets
  - conditions are valid for their field/operator/value shape
  - empty condition arrays are rejected.
- Use application-level duplicate detection similar to `AnalysisRuleService.assertNoDuplicate()`, normalizing conditions before comparison.
- Use default append priority for new rules, such as max existing active priority plus 10, while allowing explicit priority updates.

Exit criteria:

- Users can list active and archived categorization rules scoped to their account.
- Users can create, edit, archive, and restore rules.
- Cross-user category and rule references are rejected.
- Duplicate rules return a conflict payload that the frontend can use for restore UX.
- Rule views include enough target category metadata for table/list rendering without extra client joins.

### 3. Rule Evaluation On Provider Ingestion

Implementation tasks:

- Implement a `TransactionCategorizationService` in `backend/src/transaction-categorization/` that:
  - loads active rules for a user in priority order
  - extracts rule-matching features from a `TransactionEntity` or provider DTO plus internal account ID
  - evaluates conditions deterministically
  - returns the first matching target category and rule ID, or null.
- Inject `TransactionCategorizationService` into `TransactionService` through `TransactionModule`.
- Update `TransactionService.processSyncResults()`:
  - for added transactions, build the entity with internal account ID, run categorization before saving, and persist `categoryId`, `categoryAssignmentSource = 'rule'`, `categoryAssignmentRuleId`, and `categoryUpdatedAt` when a rule matches
  - for missing modified transactions that are inserted as new rows, apply the same categorization path
  - for matched pending transactions becoming posted, recategorize only if `categoryAssignmentSource !== 'manual'`
  - for modified existing transactions, refresh rule assignment only if `categoryAssignmentSource !== 'manual'` and relevant fields changed; manual assignments must not be overwritten.
- Keep Plaid provider hint mapping in `backend/src/bank-link/providers/plaid/plaid.provider.ts` as input metadata only.
- Keep `ProviderTransactionsSyncedEvent` behavior unchanged unless future UI notifications need assignment counts.
- Add structured logs for categorized counts and rule-match counts without logging raw sensitive payloads.

Exit criteria:

- New provider transactions receive effective categories when a user rule matches.
- New provider transactions remain uncategorized when no rule matches.
- Manual category assignments survive later provider modified sync.
- Pending-to-posted updates can refresh non-manual rule assignments.
- Provider hints remain visible as metadata and never directly set assignment source.

### 4. Rule Change Backfill And Reclassification Controls

Implementation tasks:

- Add a backend service method to apply one active rule to eligible existing transactions:
  - user-scoped provider transactions only
  - rows where `categoryAssignmentSource IS NULL` or `categoryAssignmentSource = 'rule'`
  - never rows where `categoryAssignmentSource = 'manual'`
  - optional dry-run count method for UI preview if inexpensive.
- Add an endpoint such as:
  - `POST /categorization-rules/:id/apply`
  - response: `{ updated: number, skippedManual: number, matched: number }`.
- When a rule is edited, do not automatically rewrite history in v1. Let the user explicitly apply the rule after saving.
- When a rule is archived, do not automatically clear existing transactions assigned by that rule in v1.
- Invalidate transaction and analysis consumers after rule application because effective categories may change historical results.

Exit criteria:

- Applying a rule updates only eligible non-manual transactions.
- Manual transactions and manual category assignments are never changed by rule application.
- Rule application is transactional or chunked with clear failure behavior and no partial silent failures.
- Analysis and transaction list queries reflect updated categories after invalidation.

### 5. Frontend API Client And Settings Navigation

Implementation tasks:

- Regenerate frontend API client after backend OpenAPI changes:

  ```bash
  cd frontend && yarn orval
  ```

- Update `frontend/src/routes/_authed/settings.tsx`:
  - add a first-class `categorization` settings tab between `analysis` and `mcp`, matching the generated design
  - update `SettingsTab`, `validateSearch`, `getInitialSettingsTab()`, and tab rendering
  - import and render a new `CategorizationRulesSection`.
- Ensure `frontend/src/routeTree.gen.ts` is regenerated by the TanStack router build/plugin if route changes require it.

Exit criteria:

- Generated API files expose categorization rule hooks and transaction provenance fields.
- `http://localhost:4000/settings?tab=categorization` deep-links to the categorization rules UI without breaking existing tabs.
- The Settings tab order is `General`, `Notifications`, `Access`, `Categories`, `Analysis`, `Categorization`, `MCP`.
- No generated files under `frontend/src/api/**` are hand-edited.

### 6. Categorization Rules Settings UX

Implementation tasks:

- Add `frontend/src/components/settings/CategorizationRulesSection.tsx`, following the interaction model of `AnalysisRulesSection`:
  - searchable active/archive list matching the `Rules list` panel in `tmp/screenshots/transaction-categorization-rules-contact-sheet.png`
  - desktop table and mobile `MobileTableList`
  - drawer create/edit form
  - archive/restore row actions
  - duplicate conflict alert with restore action
  - summary panel.
- Match the generated list layout:
  - title `Categorization rules`
  - support copy `Rules set effective transaction categories during ingestion.`
  - `New rule` button on the right
  - `Search rules...` input
  - `Archived` button
  - columns `Name`, `Target category`, `Conditions`, `Priority`, `Status`, `Actions`.
- Build a reusable condition editor, for example `frontend/src/components/settings/categorization/TransactionConditionInput.tsx`:
  - field selector
  - operator selector constrained by field type
  - value input appropriate to text, account, sign, or amount condition
  - add/remove condition controls
  - all conditions are shown as explicit `AND` separators between condition rows, matching the `Condition editor` panel in the contact sheet.
- Reuse `CategorySelect` for target category selection.
- Use account options from existing account APIs for `accountId` conditions.
- Display target category with color swatch and labels in rule table/list rows.
- Implement the drawer form to match the generated `New rule drawer` panel:
  - drawer title `New categorization rule` or `Edit categorization rule`
  - fields in order: `Name`, `Target category`, `Priority`, `Conditions`
  - condition row columns labeled `Field`, `Operator`, `Value`
  - `Add condition` button with plus icon
  - summary card with behavior sentence
  - bottom-right `Cancel` and `Save` actions.
- Add an explicit `Apply rule to existing transactions` action after save or in row actions, backed by the rule apply endpoint.
- Implement the apply UI to match the generated `Apply to existing` panel:
  - title `Apply rule to existing transactions`
  - selected rule card with target category
  - result/count cards for `Matched`, `Updated`, and `Skipped manual`
  - note `Manual categories are never overwritten.`
  - `Close` and `Apply rule` actions.
- Invalidate categorization rules, transaction list, category, and transaction-analysis queries after create/update/archive/restore/apply where relevant.

Exit criteria:

- The desktop UI visually matches the generated contact sheet for list, drawer, condition editor, and apply flow within the existing Splice design system.
- Users can create rules for text, provider category code, account, amount sign, and amount conditions.
- The rule summary clearly reflects the exact `AND` matching behavior.
- Mobile and desktop settings UI both support create/edit/archive/restore/apply.
- Rule controls fit common mobile widths without overlapping text or controls.
- `$agent-browser` validation captures desktop and mobile screenshots for:
  - categorization rules list
  - new rule drawer
  - condition editor with at least three conditions and visible `AND` separators
  - apply-to-existing dialog/drawer with count cards and manual-overwrite note.

### 7. Transaction UI Provenance Display

Implementation tasks:

- Update generated transaction model usage in:
  - `frontend/src/components/TransactionsTable.tsx`
  - `frontend/src/components/transactions/TransactionsMobileList.tsx`
  - `frontend/src/routes/_authed/transactions.tsx`
  - tests under `frontend/src/components/TransactionsTable.test.tsx` and `frontend/src/components/transactions/TransactionsMobileList.test.tsx`.
- Keep the displayed category as `transaction.category`, because `categoryId` remains effective.
- Add a subtle provenance indicator only when useful:
  - `manual` could use existing edit/reset affordance language
  - `rule` can show a tooltip-backed badge/icon such as `Rule`
  - null keeps the existing uncategorized/provider-hint behavior.
- Preserve provider hint rendering for uncategorized or rule-categorized transactions as informational metadata only.
- Ensure inline category edits set manual provenance through the existing update endpoint response.

Exit criteria:

- Rule-assigned transactions display their effective category in table and mobile list.
- Users can still manually change or clear a category, and the response updates provenance.
- Provider hint metadata remains available without implying it is the assigned category source.
- Transaction row text and action controls remain stable on desktop and mobile.

## Tests

### Backend

- Add `backend/test/transaction-categorization/categorization-rule.service.spec.ts`:
  - create/update/archive/restore
  - duplicate detection with normalized condition order/values
  - cross-user target category rejection
  - archived target category handling for existing rule views.
- Add `backend/test/transaction-categorization/rule-based-categorization.engine.spec.ts`:
  - text `equals`, `contains`, `startsWith`, `endsWith`
  - `accountId` `equals`/`in`
  - `amountSign`
  - amount `equals`, `greaterThan`, `lessThan`, `between`
  - AND semantics and priority ordering
  - currency ignored for amount matching.
- Update `backend/test/transaction/transaction.service.spec.ts`:
  - new provider sync rows are categorized when rules match
  - no-match rows remain uncategorized with null provenance
  - manual assignments survive modified sync
  - pending-to-posted non-manual rows can recategorize
  - bulk undo restores provenance fields.
- Add or update controller specs for `/categorization-rules` endpoints and rule apply endpoint.
- Add migration tests if the existing migration test harness supports the new migration shape.

### Frontend

- Add `frontend/src/components/settings/CategorizationRulesSection.test.tsx`:
  - loads active rules
  - search and archive toggle
  - create/edit drawer validation
  - condition add/remove
  - duplicate conflict restore action
  - apply-to-existing action result notification.
- Add tests for the condition input component:
  - field/operator compatibility
  - amount condition validation
  - text normalization expectations where visible.
- Update transaction table and mobile list tests for provenance display and manual category mutation responses.
- Update settings route tests for the new tab/deep link behavior.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/transaction-categorization/categorization-rule.service.spec.ts
cd backend && yarn test test/transaction-categorization/rule-based-categorization.engine.spec.ts
cd backend && yarn test test/transaction/transaction.service.spec.ts
cd backend && yarn test test/transaction/transaction.controller.spec.ts
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/settings/CategorizationRulesSection.test.tsx
cd frontend && yarn test src/components/TransactionsTable.test.tsx
cd frontend && yarn test src/components/transactions/TransactionsMobileList.test.tsx
cd frontend && yarn test src/routes/_authed/settings.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Browser validation:

```text
$agent-browser: open http://localhost:4000/settings?tab=categorization, verify and screenshot desktop and mobile rule list, drawer create/edit flow, condition controls with AND separators, archive/restore controls, and apply-to-existing feedback. Compare against tmp/screenshots/transaction-categorization-rules-contact-sheet.png.
```

## Overall Exit Criteria

- Provider transaction ingestion automatically sets `categoryId` when an active user rule matches.
- `categoryAssignmentSource` and `categoryAssignmentRuleId` explain whether the effective category came from a manual action or a rule.
- Manual category edits remain authoritative and are never overwritten by sync, rule edits, or rule application.
- Users can manage categorization rules from Settings with UX consistent with existing analysis rules.
- The implemented categorization rules UI matches the generated contact sheet direction: first-class Categorization tab, list columns, drawer form, condition editor, and apply-to-existing count flow.
- Rule matching supports v1 text, stable ID/code, amount sign, and amount conditions with deterministic AND semantics.
- Amount rules ignore currency as agreed for v1.
- Generated API clients are updated and no generated files are hand-edited.
- Backend tests, frontend tests, lint, typecheck, and browser validation pass for the feature.
