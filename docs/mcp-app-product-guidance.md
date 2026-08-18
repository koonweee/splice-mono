# MCP App Product and UX Guidance

This document is the product and interaction contract for Splice MCP Apps. It
applies when adding an App, changing an App-backed tool, or reviewing an App UI.
The transport, authentication, resource metadata, and production procedures
remain documented in [mcp.md](./mcp.md).

## Product role

Splice MCP Apps are curated visual evidence that the model can bring into a
conversation when a question benefits from seeing the underlying financial
data. They are not miniature copies of the Splice web application and should
not become general-purpose dashboards by default.

The model explains and interprets. The App shows the values, relationships, and
supporting evidence. Avoid repeating generated narrative inside the App.

Create or retain an App only when a visual or lightweight interactive surface
materially improves on a normal structured/text tool result. A tool does not
need an App merely because its data can be rendered.

## Invocation contract

- Give App-backed tools names and descriptions that state the specific visual
  job they perform. Prefer `visualize_*` over generic `show_*` or `explore_*`
  naming when introducing a new public contract.
- Make invocation selective. The tool description should lead the model to use
  the App for questions that benefit from the visualization, not for capability
  discovery, metadata questions, hypothetical discussion, or simple facts that
  prose communicates more clearly.
- Let conversation own parameters such as period, comparison, direction, or
  focus unless direct manipulation inside the App provides clear additional
  value. A user follow-up can produce a fresh invocation and a truthful new
  result.
- Preserve useful `content` and `structuredContent` for clients without MCP App
  support. The visualization is progressive enhancement, never the only answer.

## Interaction model

- Start with one stable visual grammar per App. Add alternate charts or modes
  only for a distinct, demonstrated user question.
- Optimize the initial view for an answer, not configuration. Put the key value
  and its most important contributors above the fold; move filters, provenance,
  and supporting rows behind progressive disclosure.
- Keep first releases read-only unless a write is the App's explicit product
  job. Do not mix incidental editing or administrative controls into an
  explanatory visualization.
- Prefer lightweight exploration: selection, focused drilldown, limited
  expansion, and a reliable return to the prior visual state.
- When a selection gives meaning to a conversational follow-up, update model
  context with the minimum semantic state needed to resolve references such as
  “this” or “that category.” Do not automatically send a message or perform a
  write because the user selected something.
- Treat an explicit App-to-conversation action as an opt-in fallback, not a
  substitute for passive selection context. It may be shown only after a user
  selects an item, only when the host advertises text-message support, and only
  when the user must click it deliberately. The sent message should identify
  the selected item with the minimum useful label, contain no financial values
  or internal identifiers, and fail locally without exposing host errors.
- Do not put model-generated conclusions inside the App when the surrounding
  response already owns interpretation. Factual labels, exact deltas,
  provenance, and data-quality warnings are appropriate.
- Expose analysis adjustments only when they materially affect what the user is
  seeing. Summarize them plainly and disclose technical audit detail only on
  demand.

## Visual and responsive design

- Design mobile-first. ChatGPT mobile is a primary host, not a compressed
  desktop afterthought.
- Prefer precise, scannable encodings over decorative complexity. Ranked bars,
  compact comparisons, and restrained detail generally work better than dense
  tables, Sankey diagrams, or multi-ring charts in a narrow embedded pane.
- Keep the initial height bounded. Rank or aggregate long tails, while keeping
  material data-quality states such as uncategorized values explicit.
- Support host theme, fonts, safe-area insets, keyboard navigation, readable
  contrast, and touch targets. Avoid horizontal scrolling at phone widths.
- Treat loading, ready, empty, partial, and error states as first-class designs.
  Loading must not contain fixture data; error and new-result transitions must
  not reveal or restore stale business data.

## Concept ideation boundary

Before implementing a new App or a material UI redesign, use ImageGen once to
produce a constrained contact sheet of three or four mobile concepts. Give it
the resolved product job, above-the-fold hierarchy, allowed interactions, and
host constraints. Ask for alternatives within those boundaries, not invented
features or a generic finance dashboard.

Critique the concepts against this product contract and representative shapes
from the real tool schema before choosing a direction. Record the useful ideas
and the rejected ideas in the owning plan so later implementation does not
silently reintroduce rejected chrome or complexity.

Generated amounts, labels, layouts, and interactions are ideation material,
not contract or implementation truth. Never copy mock business data into
fixtures or production, and never use a generated concept as validation
evidence. Acceptance still requires the implemented tool-to-resource flow in
the official host with deterministic test-owned data.

## Data and lifecycle boundaries

- Render business data only from the authenticated result for the current tool
  invocation or from authorized helper calls made for that result.
- Treat every new primary result, loading transition, error, cancellation, and
  teardown as a generation boundary. Clear result-derived caches and ignore
  late helper responses from older generations.
- Rebase retained presentation choices against the current result. Never carry
  account IDs, transaction IDs, category IDs, or other business identity into a
  result that does not contain them.
- Keep fixtures in test-owned hosts. Production resources must start with a
  neutral loading state and must never substitute sample data for a failed
  bridge or helper call.
- Use the official MCP Apps bridge through the pinned mcp-kit Apps runtime. Do
  not implement a Splice-local transport or host-protocol adapter.

## Product design checklist

Before implementing or materially expanding an App, write down and resolve:

1. What user question does this App answer better than text or structured data?
2. What exact prompts should cause the model to invoke it, and which should not?
3. What is the one primary visual story?
4. What must be visible above the fold on a phone?
5. What interaction helps verify or explore the answer without turning the App
   into a dashboard?
6. What selection state, if any, should be shared with the model?
7. What data is secondary, aggregated, or disclosed only on demand?
8. What are the truthful loading, empty, partial, and error states?
9. Does a non-App client still receive a complete, useful fallback?
10. Is a new App actually warranted, or is a normal tool result sufficient?

For a material UI change, also record the constrained ImageGen contact sheet
and its selected/rejected ideas before implementation begins.

If those answers are unclear, stop and resolve the product job before designing
screens or adding controls.

## Current Cash Flow contract

Cash Flow is the reference implementation for these principles. Its product job
is: **show how money moved during a selected period and provide evidence for the
largest contributors.**

- User-facing name: **Cash Flow**.
- Public tool name: `visualize_cash_flow`; avoid implying a general dashboard
  or open-ended explorer.
- Invoke it selectively for actual cash-flow, spending, income, or comparison
  questions that benefit from a visual answer.
- Visualize period movement only. Balances, net worth, and holdings belong to
  other product surfaces.
- The model supplies the period conversationally. The App has no date picker,
  preset, or reload control in the target design.
- Use one consistent composition: period, net cash flow, compact inflow versus
  outflow, and a ranked category breakdown. Format amounts with the currency's
  compact local symbol and disclose the reporting currency once in subdued text
  at the bottom instead of repeating its ISO code beside every value.
- Default the category focus to outflows; use inflows when the question is about
  income.
- Show the top five categories, aggregate the remainder as `Other`, and keep
  `Uncategorized` explicit. Let `Other` expand on demand.
- Support an optional comparison only when the question calls for it. Do not
  force prior-period context into every visualization.
- Category drilldown is inline and largest-first, initially showing the three
  transactions that contribute most, with limited incremental expansion.
- Selecting a category updates model context with the period, direction,
  category identity, total, and transaction count so conversational references
  remain meaningful. It does not send a message or mutate data.
- Show a compact “how calculated” notice only when transfers, refunds, rules, or
  neutralization materially affect the result.
- Do not include generated insights, editing, recategorization, rule management,
  dashboard configuration, multiple chart families, or in-App period
  navigation in the initial design.

## Current Portfolio contract

Portfolio's product job is: **show what the user owns now and where the current
portfolio is concentrated.**

- User-facing name: **Portfolio**.
- Public tool name: `visualize_portfolio`; invoke it selectively for actual
  portfolio value, holdings, allocation, exposure, or concentration questions.
  Capability discovery, hypothetical discussion, investment activity, and
  simple holding facts should normally remain prose or use a headless tool.
- Use the latest available holding for each selected investment account. The
  model may supply an account subset conversationally; the App has no account
  picker, date mode, search, sort, reload, activity panel, or configuration
  toolbar.
- Normalize every valued contribution to USD on the server at its snapshot
  date. Fail the whole visualization safely when normalization is incomplete;
  never mix currencies, omit an unconvertible position, or show a partial
  total. Use compact `$` amounts and disclose `All values in USD` once.
- Combine the same stable security across accounts after normalization. Account
  contributions are supporting evidence in inline detail, not competing
  initial rows.
- Show one headline total followed by the top five positions and exact `Other`
  remainder. Expand `Other` in place. Selecting a position reveals compact
  value, allocation, quantity/price when available, contributing accounts, and
  snapshot evidence.
- Share only the selected security's minimum semantic context with the model so
  follow-ups such as “tell me more about this holding” resolve correctly.
- Because some hosts accept passive model context without applying it to the
  next manually typed turn, selected detail may additionally offer **Ask about
  this holding**. Feature-detect text `ui/message`; never auto-send on
  selection, hide the action when unsupported, and send only the selected
  security name/ticker plus a concise request for Splice-backed explanation.
- Keep the App latest-only and read-only. Performance, gain/loss, historical
  comparison, investment activity, trading, and account administration are
  separate product questions.
- Use the ranked-only composition. Its official-host comparison against a
  compact donut showed the chart duplicated exact evidence, depended on color,
  and pushed useful holdings lower on a phone. Do not restore an end-user chart
  toggle or dormant chart variant without a new product question and evidence.

## Validation expectation

Follow the official-host development and visual workflow in
[mcp.md](./mcp.md#local-mcp-app-standard-host-validation). For every material
App UI change, validate the real tool-to-resource flow and inspect desktop and
phone widths in dark and light themes. Cover loading-to-ready behavior, empty
data, helper failure where applicable, selection/model-context behavior,
teardown, console errors, network boundaries, and stale-data regressions.
