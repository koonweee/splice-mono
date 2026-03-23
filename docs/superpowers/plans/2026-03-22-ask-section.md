# Ask Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/ask` experience that streams tool-backed finance answers grounded in the signed-in user's accounts and transactions, with explicit scope and clickable evidence.

**Architecture:** Extend the existing Nest app with an `AskModule` that uses a bounded AI SDK toolset backed by shared account/transaction/analysis business logic. Add a dedicated frontend `/ask` route that uses AI SDK `useChat` against the custom backend endpoint and renders structured evidence alongside each answer.

**Tech Stack:** NestJS, TypeORM, Zod, AI SDK (`ai` + `@ai-sdk/openai`), React 19, TanStack Router, Mantine, Vitest, Jest

---

### File Structure

**Backend files to create**
- `backend/src/ask/ask.module.ts`
- `backend/src/ask/ask.controller.ts`
- `backend/src/ask/ask.service.ts`
- `backend/src/ask/ask-query.service.ts`
- `backend/src/ask/ask.types.ts`
- `backend/test/ask/ask.controller.spec.ts`
- `backend/test/ask/ask.query.service.spec.ts`
- `backend/test/ask/ask.service.spec.ts`
- `backend/test/mocks/ask/ask-query-service.mock.ts`

**Backend files to modify**
- `backend/package.json`
- `backend/src/app.module.ts`
- `backend/src/account/account.service.ts`
- `backend/src/account/account.module.ts`
- `backend/src/transaction-analysis/transaction-analysis.module.ts`
- `backend/src/transaction-analysis/transaction-analysis.service.ts`
- `backend/src/transaction/transaction.module.ts`
- `backend/src/transaction/transaction.service.ts`

**Frontend files to create**
- `frontend/src/routes/_authed/ask.tsx`
- `frontend/src/components/ask/AskComposer.tsx`
- `frontend/src/components/ask/AskConversation.tsx`
- `frontend/src/components/ask/AskEvidencePanel.tsx`
- `frontend/src/components/ask/AskMessageCard.tsx`
- `frontend/src/components/ask/ask.module.css`
- `frontend/src/lib/ask-chat.ts`
- `frontend/src/lib/ask-types.ts`
- `frontend/src/lib/ask-chat.test.ts`

**Frontend files to modify**
- `frontend/package.json`
- `frontend/src/routes/_authed.tsx`

**Docs / config files to modify**
- `docs/superpowers/specs/2026-03-22-ask-section-design.md` (only if implementation uncovers a spec gap)
- `backend/README.md`
- `frontend/README.md`

### Task 1: Shared Backend Read Models And Contracts

**Files:**
- Create: `backend/test/ask/ask.query.service.spec.ts`
- Create: `backend/src/ask/ask.types.ts`
- Modify: `backend/src/account/account.service.ts`
- Modify: `backend/src/transaction/transaction.service.ts`
- Modify: `backend/src/transaction-analysis/transaction-analysis.service.ts`
- Modify: `backend/src/transaction/transaction.module.ts`
- Modify: `backend/src/transaction-analysis/transaction-analysis.module.ts`
- Test: `backend/test/ask/ask.query.service.spec.ts`
- Test: `backend/test/transaction/transaction.service.spec.ts`
- Test: `backend/test/transaction-analysis/transaction-analysis.service.spec.ts`

- [ ] **Step 1: Write the failing tests for Ask read models**

```ts
describe('AskQueryService', () => {
  it('returns an account snapshot grouped for Ask evidence', async () => {
    const result = await service.getAccountsSnapshot('user-1');

    expect(result.accounts[0]).toMatchObject({
      id: expect.any(String),
      displayName: expect.any(String),
      grouping: expect.stringMatching(/cash|credit|investment|liability/),
    });
  });

  it('returns capped transaction evidence with matchedCount and truncated', async () => {
    const result = await service.searchTransactions('user-1', {
      merchantQuery: 'netflix',
      limit: 20,
    });

    expect(result).toMatchObject({
      matchedCount: expect.any(Number),
      truncated: expect.any(Boolean),
      transactions: expect.any(Array),
    });
  });

  it('summarizes transactions with category, merchant, and account drivers', async () => {
    const result = await service.summarizeTransactions('user-1', {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
      includePending: false,
    });

    expect(result).toMatchObject({
      totalOutflow: expect.any(Number),
      topCategories: expect.any(Array),
      topMerchants: expect.any(Array),
      topAccounts: expect.any(Array),
    });
  });

  it('compares two periods using deterministic aggregate deltas', async () => {
    const result = await service.comparePeriods('user-1', {
      currentStartDate: '2026-03-01',
      currentEndDate: '2026-03-22',
      previousStartDate: '2026-02-01',
      previousEndDate: '2026-02-22',
    });

    expect(result).toMatchObject({
      currentTotalOutflow: expect.any(Number),
      previousTotalOutflow: expect.any(Number),
      absoluteDelta: expect.any(Number),
      percentDelta: expect.any(Number),
      categoryDrivers: expect.any(Array),
      merchantDrivers: expect.any(Array),
      accountDrivers: expect.any(Array),
    });
  });

  it('surfaces recurring charges from deterministic transaction patterns', async () => {
    const result = await service.summarizeTransactions('user-1', {
      recurringOnly: true,
      startDate: '2025-12-01',
      endDate: '2026-03-22',
    });

    expect(result.recurringTransactions[0]).toMatchObject({
      merchantName: expect.any(String),
      cadence: expect.stringMatching(/monthly|weekly|unknown/),
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd backend
yarn test test/ask/ask.query.service.spec.ts --runInBand
```

Expected: FAIL because `AskQueryService` and Ask-specific return contracts do not exist yet.

- [ ] **Step 3: Add the Ask contracts and reusable query helpers**

```ts
export const AskConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const AskQueryScopeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  comparisonStartDate: z.string().optional(),
  comparisonEndDate: z.string().optional(),
  accountIds: z.array(z.string()).default([]),
  includePending: z.boolean().default(false),
  truncated: z.boolean().default(false),
});

export const AskEvidenceTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  accountName: z.string(),
  merchantName: z.string().nullable(),
  date: z.string(),
  categoryPrimary: z.string().nullable(),
});

export const AskEvidenceAccountSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  institutionName: z.string().nullable(),
  grouping: z.enum(['cash', 'credit', 'investment', 'liability']),
  balance: z.any(),
});

export const AskEvidenceAggregateSchema = z.object({
  label: z.string(),
  amount: z.number(),
  currency: z.string(),
  kind: z.enum(['category', 'merchant', 'account', 'summary']),
});

export const AskAnswerSchema = z.object({
  answerText: z.string(),
  confidence: AskConfidenceSchema,
  queryScope: AskQueryScopeSchema,
  evidence: z.object({
    accounts: z.array(AskEvidenceAccountSchema).max(10),
    transactions: z.array(AskEvidenceTransactionSchema).max(20),
    aggregates: z.array(AskEvidenceAggregateSchema).max(10),
    matchedCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  followups: z.array(z.string()).max(3),
});
```

```ts
async findForAsk(
  userId: string,
  options: AskTransactionSearchOptions,
): Promise<AskTransactionSearchResult> {
  // Reuse the transaction service as the single source of truth,
  // but expose a capped, non-paginated query shape for Ask tools.
}
```

```ts
async summarizeForAsk(
  userId: string,
  options: AskTransactionSummaryOptions,
): Promise<AskTransactionSummaryResult> {
  // Return deterministic totals, top categories, top merchants, top accounts,
  // and recurring-charge candidates using capped evidence arrays.
}
```

```ts
async comparePeriods(
  userId: string,
  options: AskComparePeriodsOptions,
): Promise<AskComparePeriodsResult> {
  // Reuse the transaction-analysis aggregation pattern,
  // and expose current/previous totals plus capped category, merchant,
  // and account driver arrays.
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd backend
yarn test test/ask/ask.query.service.spec.ts --runInBand
yarn test test/transaction/transaction.service.spec.ts --runInBand
yarn test test/transaction-analysis/transaction-analysis.service.spec.ts --runInBand
```

Expected: PASS for the new Ask query tests and no regressions in the shared transaction/analysis service tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ask/ask.types.ts \
  backend/src/account/account.service.ts \
  backend/src/transaction/transaction.service.ts \
  backend/src/transaction-analysis/transaction-analysis.service.ts \
  backend/src/transaction/transaction.module.ts \
  backend/src/transaction-analysis/transaction-analysis.module.ts \
  backend/test/ask/ask.query.service.spec.ts
git commit -m "feat: add ask query contracts and shared read models"
```

### Task 2: Backend Ask Module And Streaming Endpoint

**Files:**
- Create: `backend/src/ask/ask.module.ts`
- Create: `backend/src/ask/ask.controller.ts`
- Create: `backend/src/ask/ask.service.ts`
- Create: `backend/src/ask/ask-query.service.ts`
- Create: `backend/test/ask/ask.controller.spec.ts`
- Create: `backend/test/ask/ask.service.spec.ts`
- Create: `backend/test/mocks/ask/ask-query-service.mock.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/package.json`
- Test: `backend/test/ask/ask.controller.spec.ts`
- Test: `backend/test/ask/ask.service.spec.ts`

- [ ] **Step 1: Write the failing tests for the streaming Ask endpoint**

```ts
describe('AskController', () => {
  it('streams a read-only assistant response for authenticated users', async () => {
    const response = await controller.createMessage(
      { messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'What changed in my spending this month?' }] }] },
      mockUser,
    );

    expect(response).toBeDefined();
    expect(service.streamChat).toHaveBeenCalledWith(mockUser.userId, expect.any(Object));
  });
});

describe('AskService', () => {
  it('returns assistant metadata with answer text, scope, and evidence', async () => {
    const result = await service.buildFinalAnswer(mockToolContext);

    expect(result).toMatchObject({
      answerText: expect.any(String),
      confidence: expect.stringMatching(/high|medium|low/),
      queryScope: expect.any(Object),
      evidence: {
        accounts: expect.any(Array),
        transactions: expect.any(Array),
        aggregates: expect.any(Array),
        matchedCount: expect.any(Number),
        truncated: expect.any(Boolean),
      },
      followups: expect.any(Array),
    });
  });

  it('caps evidence arrays to the spec limits', async () => {
    const result = await service.buildFinalAnswer(mockToolContextWithManyMatches);

    expect(result.evidence.accounts.length).toBeLessThanOrEqual(10);
    expect(result.evidence.transactions.length).toBeLessThanOrEqual(20);
    expect(result.evidence.aggregates.length).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd backend
yarn test test/ask/ask.controller.spec.ts --runInBand
yarn test test/ask/ask.service.spec.ts --runInBand
```

Expected: FAIL because the Ask module, AI SDK dependencies, and streaming endpoint do not exist.

- [ ] **Step 3: Implement the Ask module with bounded tools**

```ts
@Controller('ask')
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post('messages')
  async createMessage(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(AskChatRequestSchema)) body: AskChatRequest,
  ): Promise<Response> {
    return this.askService.streamChat(user.userId, body);
  }
}
```

```ts
const result = streamText({
  model: openai(process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'),
  system: ASK_SYSTEM_PROMPT,
  messages,
  tools: {
    get_accounts_snapshot: tool({ ... }),
    search_transactions: tool({ ... }),
    summarize_transactions: tool({ ... }),
    compare_periods: tool({ ... }),
  },
});

return result.toUIMessageStreamResponse({
  originalMessages: body.messages,
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return { ask: finalStructuredAnswer };
    }
    return undefined;
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd backend
yarn test test/ask/ask.controller.spec.ts --runInBand
yarn test test/ask/ask.service.spec.ts --runInBand
```

Expected: PASS, including assertions that the tool-backed response is read-only and emits structured metadata.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json \
  backend/src/app.module.ts \
  backend/src/ask \
  backend/test/ask \
  backend/test/mocks/ask
git commit -m "feat: add ask streaming backend"
```

### Task 3: Frontend Ask Chat Client And Route

**Files:**
- Create: `frontend/src/routes/_authed/ask.tsx`
- Create: `frontend/src/components/ask/AskComposer.tsx`
- Create: `frontend/src/components/ask/AskConversation.tsx`
- Create: `frontend/src/components/ask/AskEvidencePanel.tsx`
- Create: `frontend/src/components/ask/AskMessageCard.tsx`
- Create: `frontend/src/components/ask/ask.module.css`
- Create: `frontend/src/lib/ask-chat.ts`
- Create: `frontend/src/lib/ask-types.ts`
- Create: `frontend/src/lib/ask-chat.test.ts`
- Modify: `frontend/src/routes/_authed.tsx`
- Modify: `frontend/package.json`
- Test: `frontend/src/lib/ask-chat.test.ts`

- [ ] **Step 1: Write the failing frontend tests for Ask metadata parsing and UI state**

```ts
describe('ask chat metadata helpers', () => {
  it('extracts Ask metadata from the assistant message', () => {
    const message = {
      role: 'assistant',
      metadata: {
        ask: {
          answerText: 'Your outflows are up 14%',
          queryScope: { startDate: '2026-03-01', endDate: '2026-03-22' },
          evidence: { accounts: [], transactions: [], aggregates: [] },
        },
      },
    };

    expect(getAskMetadata(message)?.queryScope.startDate).toBe('2026-03-01');
  });

  it('tracks which assistant message drives the evidence panel', () => {
    const selectedId = selectEvidenceMessageId([
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant', metadata: { ask: { evidence: {} } } },
    ]);

    expect(selectedId).toBe('a1');
  });

  it('marks Ask messages with retryable error state when streaming fails', () => {
    expect(getAskUiState({ error: new Error('network') })).toMatchObject({
      status: 'error',
      canRetry: true,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd frontend
yarn test src/lib/ask-chat.test.ts
```

Expected: FAIL because the Ask chat helpers, types, and AI SDK client wiring do not exist.

- [ ] **Step 3: Implement the Ask route, chat transport, and evidence UI**

```ts
export const Route = createFileRoute('/_authed/ask')({
  component: AskPage,
});

function AskPage() {
  const { messages, input, handleInputChange, handleSubmit, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${resolveApiBaseUrl()}/ask/messages`,
      credentials: 'include',
    }),
  });

  return (
    <AskConversation
      messages={messages}
      status={status}
      selectedMessageId={selectedMessageId}
      onSelectMessage={setSelectedMessageId}
      inlineEvidenceOnMobile
      onRetry={retryLastMessage}
      composer={
        <AskComposer
          input={input}
          onInputChange={handleInputChange}
          onSubmit={handleSubmit}
        />
      }
    />
  );
}
```

```ts
const navItems = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/accounts', label: 'Accounts', icon: CreditCard },
  { to: '/transactions', label: 'Transactions', icon: TrendingUp },
  { to: '/analysis', label: 'Analysis', icon: PieChart },
  { to: '/ask', label: 'Ask', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd frontend
yarn test src/lib/ask-chat.test.ts
yarn typecheck
```

Expected: PASS, including route and metadata typing for the Ask page.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json \
  frontend/src/routes/_authed.tsx \
  frontend/src/routes/_authed/ask.tsx \
  frontend/src/components/ask \
  frontend/src/lib/ask-chat.ts \
  frontend/src/lib/ask-types.ts \
  frontend/src/lib/ask-chat.test.ts
git commit -m "feat: add ask chat route and evidence UI"
```

### Task 4: Click-Through Evidence Links, Documentation, And End-to-End Verification

**Files:**
- Modify: `frontend/src/components/ask/AskEvidencePanel.tsx`
- Modify: `frontend/src/lib/ask-chat.ts`
- Modify: `frontend/src/routes/_authed/transactions.tsx`
- Modify: `frontend/src/routes/_authed/accounts.tsx`
- Modify: `backend/README.md`
- Modify: `frontend/README.md`
- Test: `frontend/src/lib/ask-chat.test.ts`
- Test: `backend/test/ask/ask.controller.spec.ts`

- [ ] **Step 1: Write the failing tests for deep-link generation and docs-backed configuration**

```ts
it('builds transaction links into the existing Transactions page filters', () => {
  expect(buildTransactionEvidenceLink({
    accountId: 'account-1',
    queryScope: {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
    },
  })).toContain('/transactions');
});

it('builds account links into the existing Accounts page when possible', () => {
  expect(buildAccountEvidenceLink({
    accountId: 'account-1',
  })).toBe('/accounts?accountId=account-1');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd frontend
yarn test src/lib/ask-chat.test.ts
```

Expected: FAIL because evidence deep-link helpers and docs/config updates are not implemented yet.

- [ ] **Step 3: Implement deep-links and document runtime configuration**

```ts
function buildTransactionEvidenceLink(input: {
  accountId: string;
  queryScope: { startDate?: string; endDate?: string };
}) {
  return `/transactions?accountId=${input.accountId}&startDate=${input.queryScope.startDate}&endDate=${input.queryScope.endDate}`;
}
```

```md
### Ask configuration

- `OPENAI_API_KEY` - server-side API key for Ask
- `OPENAI_MODEL` - optional model override for Ask
```

```ts
function buildAccountEvidenceLink(evidence: AskEvidenceAccount) {
  return `/accounts?accountId=${evidence.id}`;
}
```

- [ ] **Step 4: Run the full verification suite**

Run:
```bash
cd backend
yarn test test/ask/ask.query.service.spec.ts --runInBand
yarn test test/ask/ask.service.spec.ts --runInBand
yarn test test/ask/ask.controller.spec.ts --runInBand
yarn typecheck

cd ../frontend
yarn test src/lib/ask-chat.test.ts
yarn typecheck
```

Expected: PASS across the Ask backend and frontend test set with no typecheck failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ask/AskEvidencePanel.tsx \
  frontend/src/routes/_authed/transactions.tsx \
  frontend/src/routes/_authed/accounts.tsx \
  backend/README.md \
  frontend/README.md
git commit -m "docs: finalize ask links and configuration"
```
