# Ask Polish Design

## Goal

Tighten the Ask experience so it behaves like a stable in-product chat surface:
- the layout stays contained under the frozen header/nav
- money shown to the model uses major units instead of cents
- assistant answers render full markdown cleanly

This is a polish pass on the existing Ask feature, not a redesign of the overall route or evidence model.

## Current Problems

### Layout

The Ask route currently lets the conversation grow the page vertically. Because the app has a frozen header/nav, this can push content below the usable viewport and makes the composer feel unstable.

### Money Contract

Ask evidence is inconsistent:
- account and transaction money values use `MoneyWithSign`
- aggregate and summary values are plain numbers in minor units

This means the model can receive values like `1948364` and reason incorrectly unless it infers that the value is cents.

### Markdown

Assistant replies are rendered as plain text. Markdown syntax from the model is visible to the user instead of being rendered.

## Non-Goals

- No redesign of the evidence panel information architecture
- No rich text editor in the composer
- No custom markdown dialect
- No generalized app-wide layout refactor beyond the Ask route

## Design

### 1. Viewport-Contained Ask Layout

The Ask route should compute its available height relative to the viewport minus the frozen header/nav. The route should not rely on unconstrained page growth.

Desktop behavior:
- the route root gets a bounded height based on the available viewport under the frozen header
- the conversation pane becomes a vertical flex column
- the message list is the only scrollable region in the conversation pane
- the composer stays visible at the bottom of the pane
- the evidence pane uses the same bounded height and scrolls internally when needed

Mobile behavior:
- the layout collapses to one column
- the route still uses the same viewport-minus-header height rule
- the message region scrolls
- the composer remains visible at the bottom

The result should be:
- no page overflow caused by the chat transcript
- no evidence panel overflow past the viewport
- no composer pushed below the fold

### 2. Major-Unit Ask Money Contract

The Ask orchestration layer should normalize model-facing money into major units before returning Ask evidence and summaries.

Rules:
- transaction and account evidence can keep existing `MoneyWithSign` transport for UI formatting
- aggregate and summary values exposed to the model should be major-unit numbers with currency context
- recurring transaction amounts should also be exposed in major units
- comparison totals and deltas should use major units

Implementation boundary:
- normalization should happen in the Ask backend layer, close to Ask query/summary assembly
- the model should never need to infer whether a numeric aggregate is cents

Expected outcome:
- the model sees values like `19483.64` instead of `1948364`
- prompts and answers become more reliable for totals, biggest spend, and comparisons

### 3. Markdown Rendering

Assistant answers should render through a standard markdown renderer instead of plain text.

Library choice:
- use `react-markdown`
- add `remark-gfm`

Supported output:
- emphasis
- paragraphs and line breaks
- ordered and unordered lists
- links
- code spans and fenced code blocks
- tables when the model emits them

Rendering constraints:
- keep styling aligned with the existing Ask cards
- no raw HTML rendering
- use markdown rendering only for assistant content
- continue to render user messages as plain text

## Data Flow

1. User sends a question from the Ask route.
2. Backend Ask orchestration gathers evidence.
3. Ask query/summary results normalize model-facing totals into major units.
4. The model generates an answer using major-unit values.
5. Frontend renders the answer markdown inside the assistant message card.
6. The conversation and evidence panes remain height-bounded and scroll internally.

## Testing

### Backend

- Add Ask tests that verify aggregate and summary values are normalized to major units.
- Add or update tests around recurring/comparison outputs where raw minor-unit numbers previously leaked through.

### Frontend

- Add tests for Ask helper/rendering logic so empty assistant shell messages do not render.
- Add markdown rendering tests for bold text, lists, links, and table-safe rendering.
- Verify layout behavior manually on desktop and mobile with long transcripts and long evidence lists.

## Risks

### Mixed Money Semantics

If only some Ask outputs are converted to major units, the model will continue to receive inconsistent signals. The implementation should make the major-unit boundary explicit and test it directly.

### Layout Regressions

The frozen-header-aware layout depends on matching the app shell height correctly. The route should avoid hard-coded assumptions where possible and should be checked against the existing shell on both desktop and mobile.

### Markdown Styling Drift

Default markdown styles can look unlike the rest of the app. The renderer should inherit the Ask card style and add only the minimal markdown-specific rules needed for readability.

## Recommended Implementation Order

1. Fix the Ask layout containment under the frozen header.
2. Normalize Ask model-facing monetary aggregates to major units.
3. Add markdown rendering with `react-markdown` and `remark-gfm`.
4. Verify the combined flow manually with real Ask prompts.
