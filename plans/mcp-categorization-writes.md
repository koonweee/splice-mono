# MCP Categorization Writes

## Status

Done

## Goal

Add a narrow, write-capable MCP surface for transaction categorization workflows.
The intended user flow is:

- An MCP client reads uncategorized transactions, categories, existing rules, and
  historical manual examples.
- The MCP client, usually backed by a smarter LLM than Splice's in-app
  recommender, proposes deterministic categorization rules.
- Splice evaluates those proposed rules with the backend rule engine, returns
  preview metrics and sample matched transactions, then persists and optionally
  applies only user-approved rules.

This plan intentionally keeps Splice as the source of truth for validation,
duplicate detection, category/account ownership, rule normalization, match
counts, manual-category protection, and transaction writes. It does not add
general MCP CRUD, account linking, bank sync, category management, analysis-rule
writes, manual transaction writes, recommendation generation, or MCP App write
controls.

MCP personal access tokens remain full-scope for this work. Existing PATs that
can access `/mcp` will be able to call the new categorization write tools after
deployment, so documentation and Settings copy must say that MCP keys can modify
categorization data.

## Current Behavior

- `backend/src/mcp/mcp.controller.ts` exposes `POST /mcp` as a stateless
  Streamable HTTP MCP endpoint protected by `@PersonalAccessTokenOnly()`.
  `GET` and `DELETE` return method-not-allowed responses.
- `backend/src/mcp/mcp.service.ts` registers all MCP resources, prompts, and
  tools in `SpliceMcpService.createServer()`. Every current tool uses
  `READ_ONLY_ANNOTATIONS` with `readOnlyHint: true`, `destructiveHint: false`,
  `idempotentHint: true`, and `openWorldHint: false`.
- Current MCP categorization reads are:
  - `list_transactions`, including `categoryId: "UNCATEGORIZED"` filtering,
    exact category IDs, detailed category filters, merchant query, amount sign,
    pending handling, cursor pagination, and converted money.
  - `list_categories`, including exact category IDs and category metadata.
  - `list_categorization_rules`, read-only rule introspection.
  - `list_categorization_rule_recommendations`, read-only pending recommendation
    state.
- `backend/src/mcp/mcp-read.service.ts` owns MCP read mapping for transactions,
  categories, rules, and recommendations. It already delegates rule reads to
  `TransactionCategorizationService` and recommendation reads to
  `CategorizationRuleRecommendationService`.
- `backend/src/transaction-categorization/categorization-rule.controller.ts`
  already exposes REST endpoints for rule list, create, draft application
  preview, update/archive/restore, saved-rule application preview, and apply.
- `backend/src/transaction-categorization/categorization-rule.service.ts`
  already implements the important domain semantics:
  - create/update normalize conditions and reject duplicate rules.
  - draft preview validates category ownership, account-condition ownership,
    duplicates, manual agreement/conflict counts, existing rule overlap, and
    sample transactions.
  - apply skips manual transactions and manual category assignments.
- Current saved-rule application is not cleanly idempotent because matched
  eligible rows are written again and receive a fresh `categoryUpdatedAt` on
  repeated apply calls, even when they already have the target category and rule
  assignment.
- `backend/src/transaction-categorization/recommendations/categorization-rule-recommendation.service.ts`
  already has useful evidence helpers for smarter clients:
  - `searchManualExamples()`
  - `listRuleCandidatePatternsForAgent()`
  - `previewDraftForAgent()`
  - `listExistingRulesForAgent()`
- `backend/README.md`, `MCP_GUIDE` in `backend/src/mcp/mcp.service.ts`, and
  `frontend/src/components/settings/McpConnectionSection.tsx` currently describe
  MCP as read-only or as a read-only connection surface. These must be updated.
- Existing MCP tests in `backend/test/mcp/mcp.service.spec.ts` assert every MCP
  tool is read-only. That assertion must change to validate read tools and write
  tools separately.

## Target Data Shape

No database schema change is required for the core MCP write tools because the
domain tables and services already exist. No Orval-generated frontend API
client changes are required because MCP contracts are not OpenAPI REST
contracts.

Add reusable MCP-facing schemas in `backend/src/mcp/mcp-schemas.ts` or a nearby
file. Implementation can refine field names, but the tool contracts should stay
close to these shapes:

```ts
type McpCategorizationRuleDraftInput = {
  name?: string;
  targetCategoryId: string;
  priority?: number;
  conditions: CategorizationRuleCondition[];
  ignoredManualCategoryIds?: string[];
};

type McpCategorizationRuleDraftPreview = {
  matched: number;
  updated: number;
  skippedManual: number;
  manualAgreement: number;
  manualConflicts: number;
  existingRuleOverlap: number;
  transactions: Transaction[];
  normalizedDraft: {
    targetCategoryId: string;
    priority: number;
    conditions: CategorizationRuleCondition[];
  };
  previewToken: string;
};

type McpCreateCategorizationRuleInput = {
  name: string;
  targetCategoryId: string;
  priority?: number;
  conditions: CategorizationRuleCondition[];
  previewToken: string;
};

type McpCreateCategorizationRuleOutput = {
  rule: CategorizationRuleView;
};

type McpRuleApplicationPreview = {
  matched: number;
  updated: number;
  skippedManual: number;
  transactions: Transaction[];
  previewToken: string;
};

type McpApplyCategorizationRuleOutput = {
  matched: number;
  updated: number;
  skippedManual: number;
};

type McpManualCategorizedExamplesOutput = {
  transactions: Array<{
    id: string;
    merchantName: string | null;
    providerTransactionName: string | null;
    originalDescription: string | null;
    providerCategoryPrimary: string | null;
    providerCategoryDetailed: string | null;
    website: string | null;
    merchantEntityId: string | null;
    amount: number;
    amountCurrency: string;
    amountSign: MoneySign;
    activityDate: string;
    accountLabel: string;
    categoryId: string | null;
    category: {
      id: string;
      primary: string;
      detailed: string;
    } | null;
  }>;
};

type McpRuleCandidatePatternsOutput = {
  filters: {
    fields: string[];
    minAgreement: number;
    maxConflictRate: number;
    limit: number;
  };
  candidates: Array<{
    field: string;
    operator: "equals";
    value: string;
    targetCategoryId: string;
    targetCategory: {
      id: string;
      primary: string;
      detailed: string;
    };
    conditions: CategorizationRuleCondition[];
    agreement: number;
    conflicts: number;
    conflictRate: number;
    totalManualMatches: number;
    historicalCategoryHint: boolean;
    preview: {
      matched: number;
      updated: number;
      skippedManual: number;
      manualAgreement: number;
      manualConflicts: number;
      existingRuleOverlap: number;
    };
  }>;
};
```

Use stateless, signed preview tokens rather than persisted preview records. The
token should bind the authenticated user ID, normalized draft or rule ID,
preview counts, and a short expiry. Reuse the existing `JWT_SECRET`-backed HMAC
pattern from `TransactionService` bulk-category undo if it fits, or extract a
small local MCP preview-token helper.

## Milestones

### 1. Add MCP Categorization Evidence Tools

Implementation tasks:

- Add backend MCP tools in `SpliceMcpService.TOOL_NAMES` and
  `SpliceMcpService.createServer()`:
  - `list_manual_categorized_transaction_examples`
  - `list_rule_candidate_patterns`
- Keep these tools read-only. They provide evidence for smarter MCP clients;
  they do not generate, accept, dismiss, create, or apply rules.
- Add or extract a small MCP categorization service seam, for example
  `backend/src/mcp/mcp-categorization.service.ts`, that delegates to
  `CategorizationRuleRecommendationService.searchManualExamples()` and
  `CategorizationRuleRecommendationService.listRuleCandidatePatternsForAgent()`.
- Support optional `ignoredCategoryIds` so clients can exclude historical or
  non-future-facing categories from manual evidence.
- Keep output structured and machine-readable. Do not force clients through
  free-form rationale text.
- Add output schemas to `backend/src/mcp/mcp-schemas.ts`.
- Update `MCP_GUIDE` so clients understand that these evidence tools support
  external rule proposal, but Splice still validates drafts through preview
  tools.

Exit criteria:

- `client.listTools()` includes both evidence tools with read-only annotations,
  output schemas, and closed-world metadata.
- Tool call tests in `backend/test/mcp/mcp.service.spec.ts` prove delegation and
  structured output for manual examples and candidate patterns.
- Existing `backend/test/transaction-categorization/categorization-rule-recommendation.service.spec.ts`
  coverage remains valid for the underlying evidence heuristics.

### 2. Add Draft Preview And Create Write Tools

Implementation tasks:

- Add `preview_categorization_rule_draft`.
  - Input should match `PreviewCategorizationRuleDraftDtoSchema` plus optional
    `ignoredManualCategoryIds`.
  - Delegate to `TransactionCategorizationService.previewDraftRuleApplication()`
    or the recommendation service's `previewDraftForAgent()`.
  - Return backend-computed metrics, preview transactions, normalized draft
    fields, and a signed preview token.
- Add `create_categorization_rule`.
  - Input should match `CreateCategorizationRuleDtoSchema` plus a required
    preview token.
  - Verify the token binds to the same authenticated user and normalized draft.
  - Delegate to `TransactionCategorizationService.create()`.
  - Return the persisted `CategorizationRuleView`.
- Add write annotations:
  - `preview_categorization_rule_draft`: read-only, idempotent.
  - `create_categorization_rule`: non-read-only, additive
    (`destructiveHint: false`), non-idempotent, closed-world.
- Do not expose update/archive/restore in this milestone. The first write path
  should support creating a new approved rule only.
- Update `backend/src/mcp/mcp-schemas.ts` with specific output schemas instead
  of using only loose `unknown` output.

Exit criteria:

- MCP tests prove draft preview returns computed metrics from the service and
  does not call rule persistence.
- MCP tests prove create rejects missing, expired, wrong-user, or mismatched
  preview tokens before calling `TransactionCategorizationService.create()`.
- MCP tests prove create delegates successfully with the normalized payload and
  returns `structuredContent.rule`.
- Existing categorization service tests continue to cover duplicate rejection,
  account-condition ownership, active target-category validation, and manual
  conflict metrics.

### 3. Make Saved-Rule Application Idempotent, Then Expose Preview/Apply

Implementation tasks:

- Update `TransactionCategorizationService.evaluateRuleLikeApplication()` so a
  transaction is counted as `updated` and saved only when its final assignment
  would actually change.
- A no-op row is one that already has:
  - the target `categoryId`,
  - `categoryAssignmentSource === "rule"`,
  - `categoryAssignmentRuleId === rule.id`.
- Preserve manual protection: manual transactions and manual category
  assignments remain skipped and are never overwritten.
- Adjust existing preview/apply behavior so repeated saved-rule application with
  unchanged data returns `updated: 0` and does not refresh `categoryUpdatedAt` or
  normal `updatedAt` for no-op rows.
- Add MCP tools:
  - `preview_categorization_rule_application`
  - `apply_categorization_rule`
- `preview_categorization_rule_application` delegates to
  `TransactionCategorizationService.previewRuleApplication()` and returns a
  signed preview token bound to user ID, rule ID, preview counts, and expiry.
- `apply_categorization_rule` requires the matching preview token, delegates to
  `TransactionCategorizationService.applyRuleToExisting()`, and returns the
  backend result.
- Add write annotations:
  - preview: read-only, idempotent.
  - apply: non-read-only, destructive, idempotent after the service no-op fix,
    closed-world.

Exit criteria:

- Unit tests under `backend/test/transaction-categorization/` prove repeated
  apply does not re-save no-op rows or refresh timestamps.
- MCP service tests prove application preview returns a token and apply rejects
  missing/expired/mismatched tokens.
- MCP service tests prove apply delegates to
  `TransactionCategorizationService.applyRuleToExisting()` and returns
  `matched`, `updated`, and `skippedManual`.
- Existing REST controller behavior remains compatible, except `updated` now
  means rows whose assignment actually changed.

### 4. Update MCP Registration, Guide, Docs, And Settings Copy

Implementation tasks:

- Split MCP annotations in `backend/src/mcp/mcp.service.ts` into explicit
  constants such as:
  - `READ_ONLY_ANNOTATIONS`
  - `ADDITIVE_WRITE_ANNOTATIONS`
  - `DESTRUCTIVE_IDEMPOTENT_WRITE_ANNOTATIONS`
- Update `backend/test/mcp/mcp.service.spec.ts` so it no longer asserts every
  tool is read-only. Instead, assert:
  - existing read tools remain read-only,
  - preview/evidence tools are read-only,
  - create/apply tools have the intended write annotations,
  - all tools still declare output schemas.
- Update `MCP_GUIDE` in `backend/src/mcp/mcp.service.ts`.
  - Explain the intended workflow: read context, client proposes, Splice
    previews, user approves, Splice creates, optional preview/apply.
  - State that MCP PATs are full-scope and write-capable once connected.
  - Tell clients not to trust their own match counts; use Splice preview tools.
- Update `backend/README.md` MCP section.
  - Remove "read-only MCP endpoint" and "Mutations are not exposed through MCP."
  - Document the new categorization write tools and the fact that PATs can
    modify categorization data.
- Update `frontend/src/components/settings/McpConnectionSection.tsx`.
  - Replace read-only wording with copy that says connected AI tools can read
    Splice data and modify categorization rules/assignments through MCP.
  - Keep the endpoint/config UI behavior unchanged.
- Update `frontend/src/components/settings/McpConnectionSection.test.tsx` only
  if assertions need to cover the changed warning/copy.

Exit criteria:

- Backend README, frontend Settings MCP copy, and `splice://mcp-guide` agree on
  read/write behavior.
- Existing read-only MCP Apps remain read-only. `show_category_rule_workbench`
  must not gain create/apply/edit/archive UI controls in this plan.
- Frontend MCP connection section still renders and copies endpoint/config as
  before.

### 5. Final Hardening And Regression Pass

Implementation tasks:

- Add negative MCP tests for user scoping and ownership where practical:
  - invalid target category,
  - account condition outside current user,
  - rule ID not owned by current user,
  - preview token for another user,
  - preview token for another draft/rule.
- Ensure MCP errors are clear enough for clients to ask the user for corrected
  input instead of guessing.
- Avoid exposing provider category hints as assignable categories; clients must
  still use `list_categories` for category IDs.
- Keep generated frontend API files untouched unless REST contracts are changed
  outside this plan.
- Recheck docs for stale "read-only MCP" claims.

Exit criteria:

- Focused MCP and categorization tests pass.
- Backend typecheck and lint pass.
- Frontend tests/typecheck pass if Settings copy changes.
- No generated frontend API artifacts are modified unless a separate REST API
  contract change is introduced.

## Tests

### Backend

- Update `backend/test/mcp/mcp.service.spec.ts`:
  - expected tool list,
  - read/write annotation expectations,
  - output schema expectations,
  - evidence-tool delegation,
  - draft preview/create tool calls,
  - application preview/apply tool calls,
  - preview-token rejection cases.
- Add or update a focused MCP helper spec if `mcp.service.spec.ts` becomes too
  large:
  - `backend/test/mcp/mcp-categorization-writes.spec.ts`
  - `backend/test/mcp/mcp-preview-token.spec.ts`
- Update or add `backend/test/transaction-categorization/` coverage:
  - repeated apply is idempotent,
  - no-op rows are not saved,
  - manual transactions and manual assignments are still skipped,
  - `updated` counts only changed rows.
- Keep existing tests for draft preview and recommendations:
  - `backend/test/transaction-categorization/categorization-rule-draft-preview.spec.ts`
  - `backend/test/transaction-categorization/categorization-rule-recommendation.service.spec.ts`
  - `backend/test/transaction-categorization/rule-based-categorization.engine.spec.ts`

### Frontend

- Update `frontend/src/components/settings/McpConnectionSection.test.tsx` if the
  copy changes are asserted.
- Do not add low-value tests for CSS or static layout. The section is simple
  text/config UI; browser validation is only needed if implementation changes
  layout, interactions, or responsive behavior beyond copy.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/mcp
cd backend && yarn test test/transaction-categorization
cd backend && yarn typecheck
cd backend && yarn lint
```

Frontend, only if Settings copy or tests change:

```bash
cd frontend && yarn test src/components/settings/McpConnectionSection.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

No browser-visible workflow validation is expected for backend-only MCP tools.
If the Settings MCP section receives more than copy changes, use `$agent-browser`
against `/settings?tab=mcp` to verify desktop/mobile rendering, copy buttons,
and console cleanliness.

## Overall Exit Criteria

- MCP clients can gather categorization context and historical manual examples
  through read-only MCP tools.
- MCP clients can propose categorization rule drafts, but Splice computes all
  preview metrics and validates all ownership, duplicate, and rule-engine
  behavior.
- MCP clients can create a user-approved categorization rule only after a
  matching Splice preview.
- MCP clients can preview and apply a saved categorization rule to eligible
  historical transactions only after a matching Splice preview.
- Manual transactions and manual category assignments are never overwritten by
  rule application.
- Reapplying the same saved rule against unchanged data is idempotent and does
  not refresh timestamps or save no-op rows.
- MCP write tools use accurate annotations and output schemas.
- Backend README, `splice://mcp-guide`, and Settings MCP copy make clear that
  MCP PATs are full-scope and can mutate categorization data.
- The read-only MCP App panes remain read-only.
- Required backend tests, typecheck, and lint pass; frontend validation passes if
  frontend files change.
