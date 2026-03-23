# Ask Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing Ask experience so the chat stays bounded under the frozen header, the model reasons over major-unit monetary values, and assistant replies render full markdown cleanly.

**Architecture:** Keep the existing Ask route and backend orchestration shape, but tighten three boundaries. Frontend layout becomes viewport-bounded with an internal scrolling transcript; backend Ask summaries normalize model-facing totals into major units while preserving currency; assistant cards render markdown through a standard React markdown pipeline instead of plain text.

**Tech Stack:** NestJS, TypeScript, Zod, AI SDK, React 19, TanStack Router, Mantine, Vitest, Jest, `react-markdown`, `remark-gfm`

---

### File Structure

**Backend files to modify**
- `backend/src/ask/ask.types.ts`
- `backend/src/ask/ask-query.service.ts`
- `backend/src/ask/ask.service.ts` (only if prompt/evidence wording must align with normalized units)
- `backend/src/transaction/transaction.service.ts`
- `backend/test/ask/ask.query.service.spec.ts`
- `backend/test/ask/ask.service.spec.ts`
- `backend/test/transaction/transaction.service.spec.ts`

**Frontend files to modify**
- `frontend/package.json`
- `frontend/src/routes/_authed/ask.tsx`
- `frontend/src/components/ask/AskConversation.tsx`
- `frontend/src/components/ask/AskMessageCard.tsx`
- `frontend/src/components/ask/AskEvidencePanel.tsx`
- `frontend/src/components/ask/ask.module.css`
- `frontend/src/lib/ask-chat.ts`
- `frontend/src/lib/ask-chat.test.ts`
- `frontend/src/lib/ask-types.ts`

**Potential frontend files to create**
- `frontend/src/components/ask/AskMarkdown.tsx`
- `frontend/src/components/ask/AskMarkdown.test.tsx`

**Docs to modify**
- `backend/README.md` (only if Ask money semantics or local testing notes need clarification)
- `frontend/README.md` (only if the markdown dependency or local Ask base URL workflow needs documentation)

### Task 1: Constrain Ask Layout Under The Frozen Header

**Files:**
- Modify: `frontend/src/routes/_authed/ask.tsx`
- Modify: `frontend/src/components/ask/AskConversation.tsx`
- Modify: `frontend/src/components/ask/ask.module.css`
- Test: manual verification in browser on desktop and mobile widths

- [ ] **Step 1: Identify the current layout boundary and write down the intended viewport math**

Use the existing app shell and Ask route to determine the practical available height below the frozen header/nav.

Notes to capture in code comments or plan execution notes:
- which element should own the bounded height
- which element should be scrollable
- which element must remain pinned

- [ ] **Step 2: Verify the current broken behavior before changing code**

Run:
```bash
cd frontend
yarn dev --port 4000
```

Manual check:
- open `/ask`
- send enough messages to exceed one screen
- confirm the whole page grows and the composer/evidence panel are not stably contained

Expected: current layout overflows the usable viewport.

- [ ] **Step 3: Implement the bounded Ask layout**

Apply the smallest CSS/layout changes that make the route viewport-aware:

```tsx
// ask.tsx
return (
  <div className={styles.routeViewport}>
    <AskConversation ... />
  </div>
)
```

```css
.routeViewport {
  height: calc(100vh - var(--app-shell-offset));
  min-height: 0;
}

.page {
  height: 100%;
  min-height: 0;
}

.conversationPane {
  min-height: 0;
}

.messages {
  overflow-y: auto;
  min-height: 0;
}

.desktopEvidence {
  overflow-y: auto;
  min-height: 0;
}
```

Implementation requirements:
- subtract the frozen header/nav height instead of relying on raw document flow
- keep the composer visible at the bottom of the conversation pane
- keep only the transcript/evidence content scrollable
- preserve the current one-column mobile collapse

- [ ] **Step 4: Verify the bounded layout manually**

Run:
```bash
cd frontend
yarn dev --port 4000
```

Manual checks:
- desktop width with a long transcript
- desktop width with a long evidence panel
- mobile width with multiple messages

Expected:
- the Ask page no longer increases total page height
- the transcript scrolls internally
- the composer remains visible
- the evidence pane scrolls internally on desktop

- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/_authed/ask.tsx \
  frontend/src/components/ask/AskConversation.tsx \
  frontend/src/components/ask/ask.module.css
git commit -m "feat: constrain ask layout to viewport"
```

### Task 2: Normalize Ask Model-Facing Money To Major Units

**Files:**
- Modify: `backend/src/ask/ask.types.ts`
- Modify: `backend/src/ask/ask-query.service.ts`
- Modify: `backend/src/transaction/transaction.service.ts`
- Modify: `frontend/src/lib/ask-types.ts`
- Modify: `frontend/src/components/ask/AskEvidencePanel.tsx`
- Test: `backend/test/ask/ask.query.service.spec.ts`
- Test: `backend/test/transaction/transaction.service.spec.ts`

- [ ] **Step 1: Write failing backend tests for major-unit Ask outputs**

Add tests that prove Ask aggregate and summary outputs are normalized to major units:

```ts
it('returns top category totals in major units for Ask summaries', async () => {
  const result = await service.summarizeTransactions('user-1', {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  });

  expect(result.topCategories[0]).toMatchObject({
    amount: 19483.64,
    currency: 'USD',
  });
});

it('returns comparison totals in major units', async () => {
  const result = await service.comparePeriods('user-1', {
    currentStartDate: '2026-02-01',
    currentEndDate: '2026-02-28',
    previousStartDate: '2026-01-01',
    previousEndDate: '2026-01-31',
  });

  expect(result.currentTotalOutflow).toBeCloseTo(19483.64);
});
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run:
```bash
cd backend
yarn test test/ask/ask.query.service.spec.ts --runInBand
yarn test test/transaction/transaction.service.spec.ts --runInBand
```

Expected: FAIL because Ask aggregates and summary totals still use minor units.

- [ ] **Step 3: Add explicit major-unit normalization in the Ask backend layer**

Keep raw transaction/account evidence intact where `MoneyWithSign` is already used, but normalize model-facing aggregates and summaries:

```ts
function toMajorUnitAmount(amountInMinorUnits: number, currency: string): number {
  const decimals = getDecimalPlaces(currency);
  return amountInMinorUnits / Math.pow(10, decimals);
}
```

Apply it to:
- `AskEvidenceAggregate.amount`
- recurring transaction summary amounts
- `totalInflow`
- `totalOutflow`
- `net`
- `currentTotalOutflow`
- `previousTotalOutflow`
- `absoluteDelta`

If needed, introduce dedicated Ask summary/aggregate helpers instead of mixing unit conversion into unrelated transaction-domain logic.

- [ ] **Step 4: Align frontend Ask types and evidence rendering with major-unit values**

Make the frontend assume Ask aggregates are already major units:

```ts
export type AskEvidenceAggregate = {
  label: string
  amount: number // major units
  currency: string
  kind: 'category' | 'merchant' | 'account' | 'summary'
}
```

Update evidence rendering so aggregate values format correctly without double-dividing or raw-cent leakage.

- [ ] **Step 5: Run the backend tests again**

Run:
```bash
cd backend
yarn test test/ask/ask.query.service.spec.ts --runInBand
yarn test test/transaction/transaction.service.spec.ts --runInBand
yarn typecheck
```

Expected: PASS, with Ask summary/comparison outputs now using major units and preserving currency.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ask/ask.types.ts \
  backend/src/ask/ask-query.service.ts \
  backend/src/transaction/transaction.service.ts \
  backend/test/ask/ask.query.service.spec.ts \
  backend/test/transaction/transaction.service.spec.ts \
  frontend/src/lib/ask-types.ts \
  frontend/src/components/ask/AskEvidencePanel.tsx
git commit -m "feat: normalize ask values to major units"
```

### Task 3: Render Assistant Answers With Markdown

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/ask/AskMarkdown.tsx`
- Create: `frontend/src/components/ask/AskMarkdown.test.tsx`
- Modify: `frontend/src/components/ask/AskMessageCard.tsx`
- Modify: `frontend/src/components/ask/ask.module.css`
- Test: `frontend/src/components/ask/AskMarkdown.test.tsx`
- Test: `frontend/src/lib/ask-chat.test.ts`

- [ ] **Step 1: Add a failing frontend test for assistant markdown rendering**

Create a focused component test:

```tsx
it('renders bold text, lists, and links from assistant markdown', () => {
  render(<AskMarkdown markdown={'**Bold**\n\n- one\n- two\n\n[Docs](https://example.com)'} />);

  expect(screen.getByText('Bold').tagName.toLowerCase()).toBe('strong');
  expect(screen.getByRole('list')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
    'href',
    'https://example.com',
  );
});
```

- [ ] **Step 2: Run the frontend test to verify it fails**

Run:
```bash
cd frontend
yarn test src/components/ask/AskMarkdown.test.tsx
```

Expected: FAIL because Ask still renders assistant content as plain text and no markdown component exists.

- [ ] **Step 3: Add the markdown renderer using `react-markdown` and `remark-gfm`**

Install and wire the minimal renderer:

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function AskMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]}>
      {markdown}
    </ReactMarkdown>
  )
}
```

Use it only for assistant answers in `AskMessageCard`.

Constraints:
- no raw HTML rendering
- preserve plain-text rendering for user messages
- keep styling minimal and consistent with existing cards

- [ ] **Step 4: Add markdown-specific styles**

Add scoped Ask markdown styles for:
- paragraph spacing
- lists
- links
- code blocks
- tables if emitted

Do not introduce docs-page styling. The output should still feel like chat content.

- [ ] **Step 5: Verify the markdown path**

Run:
```bash
cd frontend
yarn test src/components/ask/AskMarkdown.test.tsx
yarn test src/lib/ask-chat.test.ts
yarn typecheck
```

Expected: PASS, with assistant markdown rendering for emphasis, lists, links, and GFM tables.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json \
  frontend/src/components/ask/AskMarkdown.tsx \
  frontend/src/components/ask/AskMarkdown.test.tsx \
  frontend/src/components/ask/AskMessageCard.tsx \
  frontend/src/components/ask/ask.module.css \
  frontend/src/lib/ask-chat.test.ts
git commit -m "feat: render ask answers with markdown"
```

### Task 4: End-To-End Verification

**Files:**
- Modify: `backend/README.md` (only if needed)
- Modify: `frontend/README.md` (only if needed)

- [ ] **Step 1: Run focused backend verification**

Run:
```bash
cd backend
yarn test test/ask/ask.service.spec.ts --runInBand
yarn test test/ask/ask.query.service.spec.ts --runInBand
yarn typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend verification**

Run:
```bash
cd frontend
yarn test src/lib/ask-chat.test.ts
yarn test src/components/ask/AskMarkdown.test.tsx
yarn typecheck
```

Expected: PASS.

- [ ] **Step 3: Manually verify the real Ask flow**

Manual checks:
- ask a spending question that returns major-unit totals
- ask a reply likely to produce markdown formatting
- verify the first response does not produce a blank assistant shell
- verify long transcripts do not overflow beneath the frozen header

Suggested prompts:
- `what was our biggest expenditure last month`
- `summarize my top spending categories last month as a markdown list`
- `compare this month to last month`

- [ ] **Step 4: Update docs only if implementation changed local setup expectations**

If markdown dependencies or local frontend API override usage need documentation, update the relevant README files. Otherwise skip this step.

- [ ] **Step 5: Commit final polish and doc updates**

```bash
git add backend/README.md frontend/README.md
git commit -m "docs: update ask polish notes"
```
