# LLM Categorization Rule Recommendations

## Status

Planned

## Goal

Add a Mastra-powered recommendation flow that learns from manually categorized transactions and suggests user-reviewable categorization rules. The LLM should propose rules in the existing categorization rule schema, use read-only tools to inspect existing rules and preview draft results, and never create or apply rules without user approval.

Locked assumptions from product discussion:

- Use Mastra in the backend as the agent framework.
- Use OpenAI via `OPENAI_API_KEY`.
- Use `gpt-5.4-mini` for the initial recommender model, configured through an environment variable so it can be changed without code edits.
- Recommendations are stored separately from active rules.
- If pending recommendations exist, the Settings button opens them.
- If none exist, the button starts async generation.
- Generation is resumable from the user's perspective: users can leave Settings and return later to see pending, processing, completed, or failed generation state.
- Regenerate archives or replaces current pending recommendations for the user, then starts a fresh async generation.
- Accepting a recommendation creates a normal categorization rule; it does not apply the rule to existing transactions unless the user uses the existing apply/preview flow.
- Manual categories are the only training labels. Rule-assigned categories are not used as labels.
- Do not display or persist a confidence value. Rank and filter suggestions with backend-computed metrics, but show concrete counts and rationale instead of confidence.

## Current Behavior

- `backend/src/transaction-categorization/transaction-categorization.module.ts` owns categorization rule API wiring.
- `backend/src/transaction-categorization/categorization-rule.entity.ts` stores user-owned deterministic rules with `name`, `priority`, `targetCategoryId`, `conditions`, and `archivedAt`.
- `backend/src/types/CategorizationRule.ts` defines Zod schemas for supported rule conditions, create/update DTOs, views, conflicts, and application preview responses.
- `backend/src/transaction-categorization/rule-based-categorization.engine.ts` normalizes text conditions, builds canonical condition keys, and evaluates active rules by priority, `createdAt`, then `id`.
- `backend/src/transaction-categorization/categorization-rule.service.ts` validates categories, rejects duplicate rules, previews existing-rule application, applies rules to eligible existing transactions, and skips manual category assignments.
- `backend/src/transaction-categorization/categorization-rule.controller.ts` exposes:
  - `GET /categorization-rules`
  - `POST /categorization-rules`
  - `PATCH /categorization-rules/:id`
  - `GET /categorization-rules/:id/application-preview`
  - `POST /categorization-rules/:id/apply`
- `frontend/src/components/settings/CategorizationRulesSection.tsx` owns the Settings rule list, drawer editor, archive/restore actions, apply modal, and preview transactions table/list.
- `frontend/src/components/settings/categorization/TransactionConditionInput.tsx` owns the condition editor and frontend condition DTO conversion.
- `frontend/src/components/TransactionsTable.tsx` and `frontend/src/components/transactions/TransactionsMobileList.tsx` already support read-only transaction previews.
- Generated frontend API files under `frontend/src/api/**` must be regenerated with `cd frontend && yarn orval` after backend OpenAPI changes.
- Backend dependencies do not currently include Mastra or an OpenAI model provider package. Add the required packages deliberately rather than hand-rolling model calls.
- There is no general-purpose queue framework. Existing background processing uses persisted status rows plus scheduled/in-process processors, such as notification push delivery under `backend/src/notification/`.

## Design Reference

Existing UI inspiration captured with `$agent-browser`:

- `tmp/screenshots/rule-recommendations-ux/categorization-rules-list.png`
- `tmp/screenshots/rule-recommendations-ux/new-rule-drawer.png`
- `tmp/screenshots/rule-recommendations-ux/analysis-rules-list.png`
- `tmp/screenshots/rule-recommendations-ux/analysis-new-rule-drawer.png`
- `tmp/screenshots/rule-recommendations-ux/categorization-rules-mobile.png`
- `tmp/screenshots/rule-recommendations-ux/new-rule-mobile-drawer.png`

Generated rule-suggestions contact sheet:

- `tmp/screenshots/rule-recommendations-ux/rule-suggestions-contact-sheet.png`

Use the generated contact sheet as the concrete target for recommendation states and layout coverage: desktop entry, suggestions, generating, preview, mobile entry, and mobile suggestions.

Implementation must apply these corrections over the first-pass contact sheet:

- The magic/sparkle recommendation button appears after the `New rule` button, not before it.
- The magic/sparkle button uses the same visual styling as the existing primary buttons but contains only the sparkle icon and no text.
- Suggestion-card action items are small icon-only actions with no visible background or border by default.
- Suggestion-card actions are right-aligned in the card.
- Suggestion cards should be more compact than the generated first-pass sheet, with less vertical padding and no oversized action buttons.
- The generating surface must make it clear users can leave and come back later; generation status is persisted and recoverable.

## Target Data Shape

Add persisted recommendation batches and suggestions. Exact entity names may vary, but the API shape should be stable around batches and suggestions.

```ts
type CategorizationRuleSuggestionStatus =
  | 'pending'
  | 'accepted'
  | 'dismissed'
  | 'superseded'

type CategorizationRuleSuggestionGenerationStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'

type CategorizationRuleSuggestion = {
  id: string
  userId: string
  generationId: string
  name: string
  targetCategoryId: string
  targetCategory: CategorizationRuleCategoryView
  priority: number
  conditions: CategorizationRuleCondition[]
  rationale: string
  status: CategorizationRuleSuggestionStatus
  acceptedRuleId: string | null
  matched: number
  updated: number
  skippedManual: number
  manualAgreement: number
  manualConflicts: number
  existingRuleOverlap: number
  previewTransactions: Transaction[]
  generatedBy: 'mastra'
  model: string
  createdAt: Date
  updatedAt: Date
}

type CategorizationRuleSuggestionGeneration = {
  id: string
  userId: string
  status: CategorizationRuleSuggestionGenerationStatus
  model: string
  startedAt: Date | null
  completedAt: Date | null
  failedAt: Date | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}
```

Add draft preview support so suggestions and the Mastra agent can test unsaved rules:

```ts
type PreviewCategorizationRuleDraftDto = {
  targetCategoryId: string
  priority?: number
  conditions: CategorizationRuleCondition[]
}

type CategorizationRuleDraftPreview = {
  matched: number
  updated: number
  skippedManual: number
  manualAgreement: number
  manualConflicts: number
  existingRuleOverlap: number
  transactions: Transaction[]
}
```

## Mastra Agent Configuration

Add a backend recommender module under `backend/src/transaction-categorization/recommendations/`:

- `categorization-rule-recommendation.entity.ts`
- `categorization-rule-recommendation-generation.entity.ts`
- `categorization-rule-recommendation.service.ts`
- `categorization-rule-recommendation.controller.ts`
- `categorization-rule-recommendation.processor.ts`
- `categorization-rule-recommendation.agent.ts`
- `categorization-rule-recommendation.tools.ts`
- `categorization-rule-recommendation.prompt.ts`

Add dependencies to `backend/package.json`:

- `@mastra/core`
- `@ai-sdk/openai`
- any Mastra storage/telemetry package only if the selected Mastra version requires it for the local runtime

Configuration:

```env
OPENAI_API_KEY=
CATEGORIZATION_RULE_RECOMMENDER_MODEL=gpt-5.4-mini
CATEGORIZATION_RULE_RECOMMENDER_MAX_TOOL_STEPS=30
```

The service should fail gracefully when `OPENAI_API_KEY` is missing:

- list pending recommendations normally
- reject generation requests with a clear 503-style API error
- do not break normal categorization rule CRUD or ingestion

Prompt requirements:

- Recommend deterministic categorization rules only.
- Use only the existing `CategorizationRuleCondition` schema.
- Base recommendations only on manually categorized transactions.
- Avoid duplicate existing rules and duplicate pending suggestions.
- Prefer text conditions over amount conditions.
- Reject broad processor-only text values such as `SQ`, `TST`, or `PAYPAL` unless combined with a more specific condition.
- Call the preview tool before returning a suggestion.
- Return a strict JSON object containing candidate suggestions and no prose outside the schema.
- Do not ask the model for confidence. The model can explain why a suggestion may be useful, but the backend should rank/filter candidates from concrete preview metrics.

Read-only tools:

- `listExistingCategorizationRules`
  - Returns active rules and enough condition/category metadata for duplicate avoidance.
- `searchManualCategorizedTransactions`
  - Returns compact transaction examples scoped to the user. Include only fields needed for recommendation: merchant/provider names, raw description, provider categories, website, merchant entity id, amount, amount sign, date, account label, and manual category.
- `previewDraftCategorizationRule`
  - Validates a draft rule against the existing schema and returns backend-computed preview metrics plus up to 10 recent eligible transactions.

Expected agent loop:

1. Read existing rules.
2. Inspect manually categorized examples.
3. Propose a draft candidate.
4. Call `previewDraftCategorizationRule`.
5. Revise or discard weak candidates.
6. Return only candidates with strong evidence and low conflicts.
7. Backend revalidates everything before persistence.

Backend recommendation scoring:

- Rank and filter suggestions using deterministic metrics such as manual agreement count/rate, manual conflict count/rate, eligible update count, and existing-rule overlap.
- Treat model rationale as explanation only.
- Do not display a confidence value in the UI.

## Milestones

### 1. Backend Suggestion Persistence And Draft Preview

Implementation tasks:

- Add migrations after `backend/src/migrations/1777200000000-AddCategorizationRules.ts` for:
  - `categorization_rule_suggestion_generation_entity`
  - `categorization_rule_suggestion_entity`
  - indexes on `userId`, `status`, `generationId`, and pending suggestion lookup
  - optional FK from suggestion `acceptedRuleId` to `categorization_rule_entity(id)` with `ON DELETE SET NULL`
- Add Zod schemas to `backend/src/types/CategorizationRule.ts` or a new `backend/src/types/CategorizationRuleSuggestion.ts`:
  - generation view
  - suggestion view
  - draft preview DTO
  - draft preview response
  - accept/dismiss response shapes if needed
- Extend `TransactionCategorizationService` with draft-rule validation and preview helpers that reuse `RuleBasedCategorizationEngine`.
- Ensure draft preview validates:
  - target category belongs to the user and is active
  - account IDs in conditions belong to the user
  - condition values are complete and normalized
  - duplicate canonical condition/category combinations are detected against active rules
- Add `POST /categorization-rules/application-preview` or a similarly named draft-preview endpoint.
- Add recommendation CRUD endpoints, likely under `categorization-rule-recommendations`:
  - `GET /categorization-rule-recommendations`
  - `POST /categorization-rule-recommendations/generate`
  - `POST /categorization-rule-recommendations/regenerate`
  - `POST /categorization-rule-recommendations/:id/accept`
  - `POST /categorization-rule-recommendations/:id/dismiss`

Exit criteria:

- Draft preview works without saving a rule.
- Pending recommendations can be listed, accepted, dismissed, and superseded by regeneration.
- Accepting a recommendation creates a normal `CategorizationRuleEntity` through the same service path as manual rule creation.
- Manual category assignments are never overwritten by recommendation APIs.
- Migrations run and revert locally.

### 2. Mastra Recommendation Harness

Implementation tasks:

- Add Mastra dependencies and wire the model provider through `OPENAI_API_KEY`.
- Implement `categorization-rule-recommendation.agent.ts` with the `gpt-5.4-mini` model configured by env.
- Implement read-only Mastra tools in `categorization-rule-recommendation.tools.ts`:
  - existing rules
  - manual categorized examples
  - draft rule preview
- Implement prompt text in `categorization-rule-recommendation.prompt.ts` with strict schema guidance and safety constraints.
- Add `CategorizationRuleRecommendationProcessor` for in-process async execution:
  - acquire pending generations
  - mark stale `processing` rows as failed or retryable
  - run the Mastra agent
  - validate final candidates
  - persist accepted-by-backend pending suggestions
  - log structured generation metrics without raw secrets
- Add backend thresholds before persistence:
  - minimum updated count
  - maximum manual conflict rate
  - maximum existing rule overlap rate
  - maximum condition count
  - reject amount-only rules unless explicitly allowed by threshold logic
  - reject short or generic text matches
- Store backend-computed preview and quality metrics as authoritative. Treat model rationale as explanation only.
- Persist generation state so users can leave the page while generation is pending or processing, then return later to see current status and completed suggestions.

Exit criteria:

- Generation can be triggered asynchronously from an authenticated request.
- Users do not need to keep the generating drawer/modal open for generation to finish.
- Missing `OPENAI_API_KEY` produces a controlled generation failure and readable API state.
- The agent can preview drafts but cannot mutate rules or transactions.
- Backend validation rejects malformed, duplicate, too-broad, or weak suggestions even if the LLM returns them.
- Structured logs include `userId`, `generationId`, candidate counts, persisted counts, and failure reason without leaking transaction payloads unnecessarily.

### 3. Frontend Recommendations UX

Implementation tasks:

- Run `cd frontend && yarn orval` after backend OpenAPI updates.
- Refactor reusable rule rendering helpers out of `frontend/src/components/settings/CategorizationRulesSection.tsx` where practical:
  - category swatch/label rendering
  - condition summary rendering
  - compact rule card/list row display
- Add an icon button immediately after `New rule` in `CategorizationRulesSection`:
  - use a lucide icon such as `Sparkles`
  - tooltip explains recommendation state briefly
  - no visible text inside the button
  - same primary-button color, radius, height, and hover treatment as the existing `New rule` button
  - mobile sizing matches existing icon-button sizing and touch targets
- Add a recommendations modal or drawer:
  - if pending suggestions exist, list them immediately
  - if no suggestions exist, start generation and show async loading state
  - while generation is pending/processing, tell users they can close the surface and return later
  - show regenerate button when pending suggestions exist or generation has completed
  - show failed state with retry/regenerate action
- Reuse existing rule-like presentation where possible:
  - target category swatch/label
  - condition summary prose
  - priority badge
  - transaction preview table/list from the existing apply modal
- Suggestion actions:
  - preview results using draft preview or stored backend metrics
  - accept creates a rule and invalidates categorization, transaction, category, and analysis consumers
  - edit opens the existing rule drawer prefilled with suggestion values
  - dismiss hides the suggestion
  - regenerate supersedes pending suggestions and starts a fresh generation
- Render suggestion-card actions as compact right-aligned icon-only controls:
  - no visible background or border by default
  - use tooltips or accessible labels for `Preview`, `Edit`, `Accept`, and `Dismiss`
  - keep `Accept` visually clear but compact; do not use a large filled button inside each card
  - preserve comfortable mobile touch targets without making cards feel tall

Exit criteria:

- Users can open recommendations from the icon-only sparkle button immediately after `New rule`.
- Existing pending suggestions are shown without triggering a new generation.
- Empty state triggers async generation and shows progress plus return-later copy.
- Suggestions render with the same visual language as existing categorization rules.
- Suggestion cards are compact, with right-aligned icon-only actions and no bordered action buttons.
- Accepting a suggestion adds it to the rule list.
- Preview uses the same desktop/mobile transaction list components as the apply-rule modal.
- `$agent-browser` validation covers desktop and mobile Settings > Categorization interactions.

### 4. Tests, Regeneration, And Operational Hardening

Implementation tasks:

- Add backend service tests for:
  - draft preview metrics
  - ownership validation for categories and account conditions
  - duplicate active-rule rejection
  - pending suggestion listing
  - accept/dismiss/regenerate state transitions
  - missing API key behavior
  - Mastra tool harness with mocked agent output
  - backend rejection of malformed or broad LLM candidates
- Add controller tests for the new endpoints and authorization scoping.
- Add frontend tests for:
  - recommendation icon behavior
  - pending suggestion list
  - generation loading/error states
  - return-later generation state copy and reopening behavior
  - preview modal/drawer behavior
  - accept/dismiss/regenerate interactions
  - edit-from-suggestion prefill
- Add a small prompt fixture test or snapshot-style assertion for the structured prompt contract if useful.
- Confirm generated API client changes are committed and no generated files are hand-edited.

Exit criteria:

- Focused backend tests cover all recommendation state transitions and validation gates.
- Focused frontend tests cover the new Settings UX paths.
- Full lint/typecheck passes for changed app areas.
- Browser validation verifies that text, buttons, icons, and transaction previews do not overlap on desktop or mobile.

## Tests

### Backend

- `backend/test/transaction-categorization/rule-based-categorization.engine.spec.ts`
  - add any draft-preview-specific engine cases if condition semantics change.
- New `backend/test/transaction-categorization/categorization-rule-recommendation.service.spec.ts`
  - recommendation persistence, validation, accept/dismiss/regenerate.
- New `backend/test/transaction-categorization/categorization-rule-recommendation.processor.spec.ts`
  - mocked Mastra generation, missing API key, bad candidates, successful persistence.
- Existing `backend/test/transaction/transaction.service.spec.ts`
  - update only if draft preview or accept behavior touches transaction assignment behavior.

### Frontend

- `frontend/src/components/settings/CategorizationRulesSection.test.tsx`
  - recommendation button, modal/drawer, empty-generation behavior, pending list, accept/dismiss/regenerate.
- `frontend/src/components/TransactionsTable.test.tsx`
  - update only if shared preview props change.
- `frontend/src/components/transactions/TransactionsMobileList.test.tsx`
  - update only if shared preview props change.

## Validation Commands

Backend:

```bash
cd backend && yarn migration:run
cd backend && yarn migration:revert
cd backend && yarn typecheck
cd backend && yarn lint
cd backend && yarn test test/transaction-categorization/categorization-rule-recommendation.service.spec.ts
cd backend && yarn test test/transaction-categorization/categorization-rule-recommendation.processor.spec.ts
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn typecheck
cd frontend && yarn lint
cd frontend && yarn test src/components/settings/CategorizationRulesSection.test.tsx
```

Browser validation:

```text
$agent-browser
Open http://localhost:3000/user/dev/login?redirect=%2Fsettings%3Ftab%3Dcategorization
Validate desktop and mobile recommendation-button, generation, suggestion list, preview, accept, dismiss, and regenerate flows.
```

## Overall Exit Criteria

- A user can request recommendations from Settings > Categorization with one icon-only sparkle button immediately after `New rule`.
- Pending recommendations are shown before triggering new generation.
- Regeneration replaces or supersedes current pending suggestions and starts a fresh async Mastra generation.
- Users can leave the recommendations surface while generation runs and return later to the persisted generation state.
- The Mastra agent uses `gpt-5.4-mini`, `OPENAI_API_KEY`, and only read-only tools.
- The agent can preview draft rules, but backend validation and preview metrics remain authoritative.
- Only validated, user-owned, non-duplicate suggestions with strong backend-computed evidence are persisted.
- Accepting a suggestion creates a normal categorization rule and refreshes the rule list.
- Users can preview recommendation effects with the existing transaction preview components.
- Normal categorization rule CRUD, ingestion-time categorization, and manual category authority continue to work unchanged.
- Required backend/frontend tests, typecheck, lint, API regeneration, migration checks, and `$agent-browser` validation pass.
