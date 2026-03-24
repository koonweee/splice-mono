# Ask Surface Alignment Design

## Goal

Rewrite Ask so it answers questions using the same underlying data semantics the user sees in the product, while keeping model-facing tools well defined and easy to use.

The rewrite should make Ask feel grounded in the app's visible finance concepts instead of a parallel Ask-only query layer.

## Current Problems

### Ask Uses a Narrow, Ask-Specific Query Surface

The current Ask backend exposes four Ask-specific tools with semantics that only partially overlap the frontend:
- account snapshot
- transaction search
- transaction summary
- period comparison

This lets Ask answer many common questions, but it does not align cleanly with the product's visible concepts.

### Frontend and Ask Semantics Can Drift

The frontend currently answers user-visible questions through multiple domain-specific paths:
- accounts inventory and balances
- balance history and net worth trends
- transaction listing and filtering
- cashflow analysis and category breakdowns

Ask does not share those semantics directly. As a result, a user can ask about what they see on screen and receive an answer produced by different rules.

### Tool Contracts Are Too Loose

The current Ask tool layer does not give the model enough explicit guidance about:
- when to use each tool
- what defaults apply
- whether pending data is included
- how currency conversion works
- whether results are truncated
- which fields are intended for user-facing explanation versus helper metadata

This raises the risk of the model using the right data incorrectly.

## Non-Goals

- No attempt to mirror frontend route structure one-for-one inside Ask
- No rewrite of frontend UI components as part of this design
- No expansion into settings, sync controls, backfill flows, or other account-management actions
- No general-purpose BI or arbitrary SQL-style Ask interface
- No requirement that Ask expose only fields that are literally rendered on screen

## Design

### 1. Use User-Visible Concepts, Not Page Boundaries

Ask should be grounded in the product's visible finance concepts, but it should not be coupled tightly to route structure.

The first-class Ask concepts for v1 are:
- accounts
- balance history
- transactions
- cashflow analysis

This means:
- `Home` is treated as a composition of balance history plus accounts, not as its own special Ask domain
- `Accounts` maps primarily to account inventory and current balances
- `Transactions` maps to row-level lookup and filtering
- `Analysis` maps to category, inflow, outflow, and period comparison semantics

The model may combine tools from multiple concepts in one answer.

### 2. Shared Semantic Services Behind Frontend and Ask

Ask and the frontend should share business semantics through concept-aligned services, not through shared controllers.

Recommended service boundaries:
- `AccountsSurfaceService`
- `BalanceHistorySurfaceService`
- `TransactionsSurfaceService`
- `CashflowAnalysisSurfaceService`

Responsibilities of each surface service:
- define the canonical meaning of the visible concept
- own defaults and filter semantics
- apply the same pending, balance, date, and currency rules used by the frontend
- return stable structured outputs that can be consumed by both Ask and frontend controllers

Responsibilities that stay outside surface services:
- frontend-specific response shaping that only exists for components
- Ask-specific orchestration and prompting
- visual formatting concerns such as chart colors, icons, and layout text

This keeps one source of truth for user-visible finance semantics without freezing the frontend into Ask-shaped contracts.

### 3. Replace Ask-Specific Tools With Concept-Oriented Tools

Ask v1 should use a new tool set:
- `get_accounts_snapshot`
- `get_balance_history`
- `search_transactions`
- `get_cashflow_analysis`

These tools should be model-oriented wrappers over the shared surface services.

They should not expose raw frontend HTTP contracts directly. Instead, each tool should provide:
- a precise description of when to use it
- explicit rules for when not to use it
- clear defaults
- compact but expressive structured outputs
- helper metadata where useful

The model should be instructed to use the smallest set of tools needed for a grounded answer.

### 4. Treat Tool Contracts as Product Interfaces

Each Ask tool contract should be explicit enough that the model can make correct decisions without guessing.

Every tool definition should include:
- intended use cases
- non-use cases
- required inputs
- optional inputs and their defaults
- semantic flags such as pending inclusion, truncation, or comparison mode
- output fields divided between user-facing values and helper metadata

Each output should distinguish between:
- raw fields for stable machine interpretation
- display fields for user-facing language

Examples:
- `primaryCategory: "FOOD_AND_DRINK"`
- `primaryCategoryLabel: "Food & Drink"`

The model prompt should explicitly tell the assistant to prefer display fields and user-friendly language unless the user asks for raw detail.

### 5. Push Stable Humanization Into Shared Outputs

Some frontend transformations represent product semantics rather than presentation. Those should move into or be exposed by the shared surface services.

Move backward into shared outputs:
- enum/code to stable user-facing labels where that label is part of how the product explains the data
- normalized category labels
- stable account grouping labels such as cash, credit, investment, and liability
- consistent names for balances, inflows, outflows, net worth, and comparison windows

Keep in the frontend:
- colors
- icons
- layout-specific labels
- chart decoration
- locale-specific presentation details

For v1, shared surface outputs should generally provide both raw and display values where applicable.

### 6. Model Behavior Rules

The Ask prompt should encode behavior that matches user expectations:
- use the fewest tools needed
- combine tools when the question spans multiple concepts
- prefer cashflow analysis for "why did spending change" questions
- pair analysis with transaction search when concrete examples are needed
- use balance history plus accounts for net worth and balance questions
- present user-friendly explanations unless raw detail is requested
- state when data is truncated, ambiguous, or unavailable
- do not infer semantics that are not present in tool output

The model does not need to report the frontend surfaces it used unless that becomes useful later.

## Tool Contract Direction

### `get_accounts_snapshot`

Use for:
- account inventory
- current balances
- account grouping questions

Do not use for:
- balance trends over time
- category spend explanations
- merchant-level lookups

Inputs:
- optional `accountIds`
- optional inclusion flags if needed later, but keep v1 minimal

Outputs:
- account identifiers
- raw and display account names
- institution names
- grouping labels
- current balances
- helper metadata such as counts and truncation

### `get_balance_history`

Use for:
- net worth trend
- account trend
- balance changes over time
- current versus prior-period balance questions

Do not use for:
- category spend analysis
- merchant-level explanations

Inputs:
- scope across all accounts or selected account IDs
- `startDate`
- `endDate`
- interval or granularity where needed

Outputs:
- time series points
- latest balances
- deltas
- comparison metadata
- affected account metadata
- helper fields such as counts and truncation

### `search_transactions`

Use for:
- transaction examples
- merchant lookup
- finding concrete rows behind a question

Do not use for:
- high-level causal analysis unless paired with analysis
- balance-trend questions

Inputs:
- date range
- account filters
- category filters
- merchant query
- sign filters
- amount bounds
- pending control
- limit and pagination metadata where needed

Outputs:
- matched transactions
- raw and display labels
- matched counts
- truncation flags
- helper metadata useful for grounding follow-up reasoning

### `get_cashflow_analysis`

Use for:
- spend totals
- inflow/outflow summaries
- category breakdowns
- "why did this change" questions
- period comparisons

Do not use for:
- row-level evidence by itself when examples are required
- balance-trend questions

Inputs:
- date range
- optional account filters
- optional comparison window
- explicit semantic flags when comparison mode is requested

Outputs:
- totals
- category breakdowns
- merchant and account drivers where supported by the shared semantics
- uncategorized totals
- comparison deltas
- semantic flags describing pending and neutralization behavior

## Data Flow

1. User submits a question in Ask.
2. Ask orchestration decides which concept tools to call.
3. Ask tools call the corresponding shared surface services.
4. Shared surface services apply the same semantics used by the frontend-visible data concepts.
5. Tool outputs return raw fields, display fields, and semantic metadata.
6. The model answers using user-friendly language grounded in those outputs.
7. Ask surfaces truncation, ambiguity, and missing-data conditions explicitly instead of hiding them.

## Error Handling

Tool responses should expose structured states rather than relying on empty arrays alone.

Recommended structured conditions:
- `ok`
- `no_data`
- `truncated`
- `invalid_scope`
- `internal_error`

Rules:
- if one tool fails but another provides enough evidence, Ask may answer narrowly
- if a question cannot be grounded in the available concept tools, Ask should say so
- date defaults and pending rules should live in tool and service semantics, not only in prompt prose

## Testing

### Shared Surface Services

- Add parity tests that verify shared surface services preserve current frontend-visible semantics.
- Lock down pending behavior, date range interpretation, currency conversion, and comparison rules.
- Add regression tests for display-field generation so enum values do not leak unexpectedly.

### Ask Tool Contracts

- Add tests for each Ask tool schema, defaults, truncation handling, and structured status conditions.
- Verify that tool outputs carry both raw and display values where expected.
- Verify that tool descriptions and model-facing contracts stay aligned with the implemented semantics.

### Ask End-to-End

Add representative Ask tests for:
- current balances and account inventory
- net worth or balance trend questions
- merchant or transaction lookup questions
- cashflow summary questions
- "why did this change" questions that combine cashflow analysis with transactions

## Risks

### Over-Coupling to Current Screens

If the rewrite mirrors pages too literally, Ask will become brittle as the frontend evolves. The concept-oriented design avoids this by sharing semantics rather than route shape.

### Shared Layer Becomes Too Generic

If all finance semantics are pushed into one giant query abstraction, future changes will become harder. The service boundaries must stay small and concept-aligned.

### Inconsistent Humanization

If only some outputs include display fields, Ask will continue to expose enum-like values inconsistently. The raw-plus-display rule should be enforced in tests.

### Semantic Drift Survives the Refactor

If frontend controllers keep custom business logic outside the shared surface services, Ask and frontend answers can still diverge. The migration needs to move semantic decisions into the shared concept services, not just rename existing Ask queries.

## Recommended Implementation Order

1. Define the concept-oriented Ask tool contracts and shared output conventions.
2. Extract or introduce the four shared surface services behind current frontend-visible concepts.
3. Rewire existing frontend controllers to use those services while keeping HTTP contracts stable.
4. Rewrite Ask orchestration and tool registration to use the new concept-oriented tools.
5. Add parity and end-to-end tests before removing the old Ask-specific query behavior.
