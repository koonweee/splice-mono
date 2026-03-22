# Ask Section Design

**Date:** 2026-03-22

## Goal

Add a dedicated `Ask` section to Splice that gives users a chat-like interface for asking questions about their finances. V1 is strictly read-only. Answers must be grounded in the user's existing accounts and transactions and must always show the evidence used to produce the answer.

## Product Scope

### In Scope for V1

- Dedicated `/ask` route in the authenticated frontend shell
- Chat-style UI with streaming assistant responses
- Questions over:
  - account balances and account composition
  - transactions
  - merchants
  - categories
  - period-over-period spending comparisons
  - recurring/subscription-like charges where detectable from transaction history
- Evidence shown for every answer
- Explicit query scope shown for every answer
- Read-only behavior only

### Out of Scope for V1

- Any mutation from chat
- Recategorization, rule creation, or transaction edits
- Long-term assistant memory outside the current conversation
- Vector search / RAG over external documents
- Separate AI microservice
- Autonomous follow-up jobs or background agents

## UX Design

### Route and Navigation

- Add `Ask` to the existing authenticated navbar alongside `Home`, `Accounts`, `Transactions`, `Analysis`, and `Settings`
- New route file: `frontend/src/routes/_authed/ask.tsx`
- Use the existing app shell from `frontend/src/routes/_authed.tsx`

### Page Layout

Desktop layout:
- Left: existing app navigation only
- Center: chat timeline plus composer
- Right: evidence panel for the currently selected or most recent assistant answer

Mobile layout:
- Chat timeline and composer remain primary
- Evidence collapses inline under the assistant answer instead of a persistent side panel

### UI Principles

- No starter prompts or suggestion chips in the base layout
- No marketing-style explanatory title
- The page should feel like a plain product surface, not a demo
- Evidence must be legible and inspectable without overwhelming the answer body

### Message Model in UI

Each assistant response should render:
- Natural-language answer text
- Query scope summary
- Evidence summary
- Optional follow-up suggestions

The UI should support:
- Streaming text updates
- Loading state while tools are running
- Error state with retry
- Selection of a prior message to inspect its evidence

## Architecture

Use the existing Nest backend as the AI orchestration boundary.

### Frontend

- Use AI SDK `useChat` for the chat interaction model and streaming UX
- Point `useChat` at a custom backend endpoint such as `POST /ask/messages`
- Render assistant responses from structured payloads, not plain text alone

Frontend responsibilities:
- Send conversation history and new user message
- Render streaming assistant output
- Render structured evidence and scope data
- Preserve current chat thread state in the route/page

### Backend

Add a new Nest module:
- `backend/src/ask/ask.module.ts`
- `backend/src/ask/ask.controller.ts`
- `backend/src/ask/ask.service.ts`
- `backend/src/ask/ask-query.service.ts`
- `backend/src/ask/ask.types.ts`

Backend responsibilities:
- Authenticate user with the existing JWT guard
- Register the bounded toolset used by the model
- Reuse existing domain/business logic wherever possible
- Stream structured answers to the frontend
- Ensure all evidence is user-scoped and read-only

## Core Design Rule: Reuse Existing Business Logic

`Ask` should be another consumer of Splice's finance logic, not a parallel implementation.

Reuse order:
1. Reuse existing service-layer logic directly inside Nest
2. Reuse existing query shapes and normalization already used by current UI flows
3. Add small read-only service extensions when current methods are too UI-specific
4. Avoid building separate AI-only balance, transaction, or analysis logic

Concretely:
- Account access should reuse `backend/src/account/account.service.ts`
- Transaction retrieval should reuse and extend `backend/src/transaction/transaction.service.ts`
- Category/cash-flow analysis should reuse logic patterns from `backend/src/transaction-analysis/transaction-analysis.service.ts`
- Currency conversion should keep using the current conversion services so Ask matches the rest of the product

Avoid:
- Calling the backend's own HTTP endpoints from inside the backend
- Recomputing finance rules only in prompts
- Introducing a separate AI datastore for V1

## Request Flow

1. User opens `/ask`
2. User submits a finance question
3. Frontend sends the current message history to `POST /ask/messages`
4. Backend authenticates the request
5. `AskService` invokes the model with a bounded read-only toolset
6. The model calls one or more tools to fetch or summarize finance data
7. `AskService` emits a final structured answer containing answer text, scope, and evidence
8. Frontend renders the answer and evidence together

## Tooling Model

The model should not answer finance questions from prompt text alone. It must answer through explicit tools that return structured data.

### V1 Tool Set

#### `get_accounts_snapshot`

Purpose:
- Answer current-balance and account-composition questions

Returns:
- account IDs
- account display names
- institution names when available
- account types
- balances in source currency
- converted balances where appropriate
- grouped classifications like cash / credit / investment / liability

Primary backing logic:
- `backend/src/account/account.service.ts`
- existing conversion logic where needed

#### `search_transactions`

Purpose:
- Retrieve a capped set of matching transactions for merchant, category, account, and date-based questions

Returns:
- transaction IDs
- date
- merchant name
- account ID and account display name
- category
- amount and sign
- converted amount when available
- pending status
- matched count and truncation flag

Expected filters:
- date range
- account IDs
- category primary
- merchant text
- amount min/max
- sign
- pending/includePending
- result limit

Primary backing logic:
- shared query logic from `backend/src/transaction/transaction.service.ts`

#### `summarize_transactions`

Purpose:
- Answer aggregate questions over a filtered transaction set

Returns:
- total inflow
- total outflow
- net
- transaction count
- grouped totals by category
- grouped totals by account
- top merchants

Primary backing logic:
- shared transaction querying plus aggregation patterns already present in `transaction-analysis`

#### `compare_periods`

Purpose:
- Answer "what changed" questions

Returns:
- current-period total
- prior-period total
- absolute delta
- percent delta
- biggest category changes
- biggest merchant changes
- biggest account changes

Primary backing logic:
- deterministic aggregation over transaction data
- reuse existing transaction-analysis patterns instead of prompting the model to infer deltas

#### `find_balance_changes`

Purpose:
- Answer account movement questions where historical balances exist

Returns:
- accounts with biggest increases/decreases
- balance deltas
- coverage note when snapshot history is incomplete

Primary backing logic:
- existing balance snapshot and/or balance query services when available

## Structured Answer Contract

Final assistant responses should be shaped as structured output with at least:

- `answerText`
- `confidence`
- `queryScope`
- `evidence.accounts`
- `evidence.transactions`
- `evidence.aggregates`
- `followups`

### Query Scope

Every answer should state what data window was used. Example elements:
- date range
- posted vs pending treatment
- account scope
- comparison basis
- truncation notes

### Evidence Requirements

Every answer must include evidence derived directly from tool outputs.

Evidence should be capped:
- top 20 transactions
- top 10 accounts/categories/merchants
- explicit `matchedCount`
- explicit `truncated` boolean

This keeps the answer auditable without flooding the model context or UI.

## Prompting Rules

The model is responsible for:
- understanding the user question
- choosing the right tools
- synthesizing a readable answer from tool outputs

The model is not responsible for:
- inventing finance math
- inferring unsupported facts
- accessing raw user data outside tool outputs

Behavior rules:
- If the question is ambiguous, ask a follow-up or answer conservatively with explicit scope
- If data is insufficient, say so directly
- If too many matches exist, summarize and show capped evidence
- Prefer posted transactions by default unless the question implies pending activity matters

## API Design

### Chat Endpoint

Add a dedicated streaming endpoint:
- `POST /ask/messages`

Suggested request body:
- chat messages
- optional conversation ID or client message ID

Suggested response:
- streamed AI SDK-compatible chat/event stream
- final structured answer payload attached to the assistant message

The chat endpoint will be custom rather than OpenAPI-generated CRUD because it streams and returns richer structured assistant data.

## Data Access Strategy

The backend should access current services directly rather than calling its own REST endpoints internally.

Where current methods are too UI-shaped:
- extract shared query helpers into the existing service
- let both UI controllers and `AskQueryService` depend on those shared methods

This keeps one source of truth for finance behavior.

## Rollout Plan

### Phase 1: Internal Alpha

Support a small set of reliable questions:
- spend by category
- spend by merchant
- current account snapshot
- subscriptions / recurring charges
- period-over-period spending comparison

### Phase 2

Add:
- balance change questions
- richer account movement questions
- better ambiguity handling based on observed usage

Expansion should follow real usage patterns and failure logs rather than broad speculative scope.

## Safety and Trust

This feature is finance-facing, so trust matters more than fluency.

Rules:
- Every answer must have evidence
- Every answer must declare scope
- Unsupported questions should trigger clarification or an explicit limitation
- No hidden mutations
- No implied certainty when underlying data is incomplete

## Testing Strategy

### Unit Tests

Add unit tests for each Ask tool:
- account snapshot behavior
- transaction search filters
- aggregation correctness
- comparison correctness
- evidence capping and truncation flags

### Integration Tests

Add streaming endpoint tests that verify:
- authenticated access only
- tool-backed answers
- structured answer payload shape
- graceful failure behavior

### Prompt/Contract Tests

Add stable tests for canonical prompts such as:
- "How much did I spend on groceries last month?"
- "Which accounts dropped the most?"
- "What changed in my spending this month?"

Assertions should verify:
- tools are used
- answer includes scope
- answer includes evidence
- unsupported queries do not hallucinate

## Open Questions for Implementation

- Whether to persist chat threads in V1 or keep them page-local only
- Whether balance-change questions should launch only after verifying snapshot coverage per user
- Whether the evidence panel should support click-through into existing Accounts or Transactions surfaces in the first release

## Recommended Next Step

After spec approval, create an implementation plan that:
- introduces the Ask backend module
- defines the AI SDK streaming contract
- adds the `/ask` frontend route
- adds the first bounded toolset using shared service-layer logic
- covers verification and regression tests
