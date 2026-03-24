# Analysis Drilldown Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the analysis category drilldown show only unmatched transactions and use the same `endDate` FX basis as the analysis summary.

**Architecture:** Keep analysis-specific semantics inside the `transaction-analysis` module. Extract a shared unmatched-transaction pipeline from `TransactionAnalysisService`, expose a dedicated `GET /transaction-analysis/transactions` drilldown route that filters that unmatched set by category and direction, then switch the frontend modal to consume the generated analysis drilldown hook instead of the raw `/transaction` hook.

**Tech Stack:** NestJS, TypeORM, Zod, Jest, React, Vitest, Orval, TypeScript

---

### File Structure

**Backend files to modify**
- `backend/src/types/TransactionAnalysis.ts`
- `backend/src/transaction-analysis/transaction-analysis.controller.ts`
- `backend/src/transaction-analysis/transaction-analysis.service.ts`
- `backend/test/transaction-analysis/transaction-analysis.service.spec.ts`

**Frontend files to modify**
- `frontend/src/components/CategoryTransactionsModal.tsx`
- `frontend/src/components/CategoryTransactionsModal.test.tsx`

**Generated files expected to change**
- `frontend/src/api/clients/spliceAPI.ts`
- `frontend/src/api/models/index.ts`
- `frontend/src/api/models/transactionAnalysisControllerGetTransactionsParams.ts`
- `frontend/src/api/models/transactionAnalysisTransactionsQuery.ts`

**Why these files**
- `backend/src/types/TransactionAnalysis.ts`: define the new drilldown query and response schemas so the endpoint is documented in OpenAPI and available to Orval.
- `backend/src/transaction-analysis/transaction-analysis.controller.ts`: add the new read-only drilldown route and keep request validation next to the existing summary endpoint.
- `backend/src/transaction-analysis/transaction-analysis.service.ts`: extract the shared unmatched-transaction pipeline, reuse it for summary aggregation, and add a drilldown method that filters unmatched rows and applies `endDate` conversion.
- `backend/test/transaction-analysis/transaction-analysis.service.spec.ts`: lock down the Bilt regression, unmatched-only drilldown behavior, and FX-date alignment before implementation.
- `frontend/src/components/CategoryTransactionsModal.tsx`: stop querying raw transactions and switch the modal to the analysis drilldown hook while preserving existing UI states.
- `frontend/src/components/CategoryTransactionsModal.test.tsx`: prove the modal calls the new hook with `startDate`, `endDate`, `categoryPrimary`, and `flowDirection`.
- `frontend/src/api/clients/spliceAPI.ts` and generated models: pick up the new backend route and typed query params from the current OpenAPI spec.

### Task 1: Add Failing Backend Coverage For Shared Drilldown Semantics

**Files:**
- Modify: `backend/test/transaction-analysis/transaction-analysis.service.spec.ts`
- Test: `backend/test/transaction-analysis/transaction-analysis.service.spec.ts`

- [ ] **Step 1: Add a helper assertion target for unmatched drilldown rows**

```ts
describe('getCategoryTransactions', () => {
  it('returns only unmatched positive transactions for an inflow category', async () => {
    mockTransactionRepository.find.mockResolvedValue([
      buildTransaction({
        id: 'bilt-negative',
        amount: 243360,
        sign: MoneySign.NEGATIVE,
        date: '2026-02-28',
        primary: 'LOAN_PAYMENTS',
      }),
      buildTransaction({
        id: 'bilt-positive',
        amount: 243360,
        sign: MoneySign.POSITIVE,
        date: '2026-02-28',
        primary: 'INCOME',
      }),
      buildTransaction({
        id: 'interest',
        amount: 4083,
        sign: MoneySign.POSITIVE,
        date: '2026-02-28',
        primary: 'INCOME',
      }),
    ]);

    const result = await service.getCategoryTransactions(
      '2026-02-01',
      '2026-02-28',
      'INCOME',
      'inflow',
      mockUserId,
    );

    expect(result.map((txn) => txn.id)).toEqual(['interest']);
  });
});
```

- [ ] **Step 2: Add a failing Bilt regression for outflow drilldown**

```ts
it('removes matched Bilt mirror rows from the LOAN_PAYMENTS outflow drilldown', async () => {
  mockTransactionRepository.find.mockResolvedValue([
    buildTransaction({
      id: 'bilt-negative',
      amount: 243360,
      sign: MoneySign.NEGATIVE,
      date: '2026-02-28',
      primary: 'LOAN_PAYMENTS',
      detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    }),
    buildTransaction({
      id: 'bilt-positive',
      amount: 243360,
      sign: MoneySign.POSITIVE,
      date: '2026-02-28',
      primary: 'INCOME',
      detailed: 'INCOME_OTHER_INCOME',
    }),
    buildTransaction({
      id: 'real-loan-payment',
      amount: 1887,
      sign: MoneySign.NEGATIVE,
      date: '2026-02-19',
      primary: 'LOAN_PAYMENTS',
      detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    }),
  ]);

  const result = await service.getCategoryTransactions(
    '2026-02-01',
    '2026-02-28',
    'LOAN_PAYMENTS',
    'outflow',
    mockUserId,
  );

  expect(result.map((txn) => txn.id)).toEqual(['real-loan-payment']);
});
```

- [ ] **Step 3: Add a failing FX-basis test anchored to `endDate`**

```ts
it('converts drilldown rows with rates anchored to endDate', async () => {
  mockTransactionRepository.find.mockResolvedValue([
    buildTransaction({
      id: 'eur-income',
      amount: 10000,
      sign: MoneySign.POSITIVE,
      currency: 'EUR',
      date: '2024-01-10',
      primary: 'INCOME',
    }),
  ]);
  mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('USD');
  mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map([['EUR', 1.1]]));

  const result = await service.getCategoryTransactions(
    '2024-01-01',
    '2024-01-31',
    'INCOME',
    'inflow',
    mockUserId,
  );

  expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
    ['EUR'],
    'USD',
    '2024-01-31',
  );
  expect(result[0]?.convertedAmount?.money.amount).toBe(11000);
});
```

- [ ] **Step 4: Run the service spec to verify the new tests fail**

Run: `cd backend && yarn test test/transaction-analysis/transaction-analysis.service.spec.ts --runInBand`

Expected: FAIL with missing `getCategoryTransactions` behavior and/or incorrect drilldown conversion behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/test/transaction-analysis/transaction-analysis.service.spec.ts
git commit -m "test: cover analysis drilldown alignment"
```

### Task 2: Implement Shared Unmatched Transaction Logic And New Backend Route

**Files:**
- Modify: `backend/src/types/TransactionAnalysis.ts`
- Modify: `backend/src/transaction-analysis/transaction-analysis.controller.ts`
- Modify: `backend/src/transaction-analysis/transaction-analysis.service.ts`
- Test: `backend/test/transaction-analysis/transaction-analysis.service.spec.ts`

- [ ] **Step 1: Add the new query and response schemas**

```ts
export const TransactionAnalysisTransactionsQuerySchema = registerSchema(
  'TransactionAnalysisTransactionsQuery',
  z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    categoryPrimary: z.string(),
    flowDirection: z.enum(['inflow', 'outflow']),
  }),
);

export const TransactionAnalysisTransactionsResponseSchema = registerSchema(
  'TransactionAnalysisTransactionsResponse',
  z.array(TransactionSchema),
);
```

- [ ] **Step 2: Extract a shared unmatched-transaction helper in the service**

```ts
private async getUnmatchedTransactions(
  startDate: string,
  endDate: string,
  userId: string,
): Promise<TransactionEntity[]> {
  const transactions = await this.transactionRepository.find({
    where: {
      userId,
      pending: false,
      date: Between(startDate, endDate),
    },
    relations: ['category'],
  });

  return this.neutralizeTransactions(transactions);
}
```

- [ ] **Step 3: Rewire summary aggregation to use the shared helper with no semantic change**

```ts
const unmatchedTransactions = await this.getUnmatchedTransactions(
  startDate,
  endDate,
  userId,
);
```

- [ ] **Step 4: Add `getCategoryTransactions` with post-neutralization filtering and `endDate` conversion**

```ts
async getCategoryTransactions(
  startDate: string,
  endDate: string,
  categoryPrimary: string,
  flowDirection: 'inflow' | 'outflow',
  userId: string,
): Promise<Transaction[]> {
  const preferredCurrency =
    await this.currencyConversionService.getPreferredCurrency(userId);
  const unmatchedTransactions = await this.getUnmatchedTransactions(
    startDate,
    endDate,
    userId,
  );

  const filteredTransactions = unmatchedTransactions.filter((transaction) => {
    const primary = transaction.category?.primary ?? 'UNCATEGORIZED';
    const matchesCategory = primary === categoryPrimary;
    const matchesDirection =
      flowDirection === 'inflow'
        ? transaction.amount.sign === MoneySign.POSITIVE
        : transaction.amount.sign === MoneySign.NEGATIVE;

    return matchesCategory && matchesDirection;
  });

  return this.attachConvertedAmounts(
    filteredTransactions,
    preferredCurrency,
    endDate,
  );
}
```

- [ ] **Step 5: Add `GET /transaction-analysis/transactions` to the controller**

```ts
@Get('transactions')
async getCategoryTransactions(
  @CurrentUser() user: JwtUser,
  @Query(new ZodValidationPipe(TransactionAnalysisTransactionsQuerySchema))
  query: TransactionAnalysisTransactionsQuery,
): Promise<unknown> {
  if (query.startDate > query.endDate) {
    throw new BadRequestException('startDate must be before or equal to endDate');
  }

  return this.transactionAnalysisService.getCategoryTransactions(
    query.startDate,
    query.endDate,
    query.categoryPrimary,
    query.flowDirection,
    user.userId,
  );
}
```

- [ ] **Step 6: Run the targeted backend test and typecheck**

Run: `cd backend && yarn test test/transaction-analysis/transaction-analysis.service.spec.ts --runInBand`

Expected: PASS

Run: `cd backend && yarn typecheck`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/types/TransactionAnalysis.ts backend/src/transaction-analysis/transaction-analysis.controller.ts backend/src/transaction-analysis/transaction-analysis.service.ts backend/test/transaction-analysis/transaction-analysis.service.spec.ts
git commit -m "feat: add reconciled analysis drilldown endpoint"
```

### Task 3: Regenerate The Frontend API Client For The New Analysis Route

**Files:**
- Modify: `frontend/src/api/clients/spliceAPI.ts`
- Modify: `frontend/src/api/models/index.ts`
- Modify: `frontend/src/api/models/transactionAnalysisControllerGetTransactionsParams.ts`
- Modify: `frontend/src/api/models/transactionAnalysisTransactionsQuery.ts`

- [ ] **Step 1: Ensure the backend OpenAPI server is available on localhost**

Run in another shell if needed: `cd backend && yarn start:dev`

Expected: local backend serves `http://localhost:3000/api-json`

- [ ] **Step 2: Regenerate the Orval client**

Run: `cd frontend && yarn orval`

Expected: generated hook(s) and model(s) for `transactionAnalysisControllerGetTransactions` appear under `src/api`

- [ ] **Step 3: Inspect the generated API surface before using it**

Run: `cd frontend && rg -n "GetTransactions|transaction-analysis/transactions|flowDirection" src/api -S`

Expected: generated client includes the new route and typed params for `categoryPrimary` and `flowDirection`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/clients/spliceAPI.ts frontend/src/api/models/index.ts frontend/src/api/models/transactionAnalysisControllerGetTransactionsParams.ts frontend/src/api/models/transactionAnalysisTransactionsQuery.ts
git commit -m "chore: regenerate analysis drilldown client"
```

### Task 4: Switch The Modal To The Analysis Drilldown Hook And Add Frontend Coverage

**Files:**
- Modify: `frontend/src/components/CategoryTransactionsModal.tsx`
- Create: `frontend/src/components/CategoryTransactionsModal.test.tsx`
- Test: `frontend/src/components/CategoryTransactionsModal.test.tsx`

- [ ] **Step 1: Add a focused modal test that mocks the new generated hook**

```ts
vi.mock('../api/clients/spliceAPI', async () => {
  const actual = await vi.importActual<typeof SpliceAPI>('../api/clients/spliceAPI');

  return {
    ...actual,
    useTransactionAnalysisControllerGetTransactions:
      mockFns.useTransactionAnalysisControllerGetTransactionsMock,
  };
});
```

```ts
it('requests unmatched outflow drilldown rows from transaction-analysis', () => {
  render(
    <MantineProvider>
      <CategoryTransactionsModal
        opened
        onClose={vi.fn()}
        categoryPrimary="LOAN_PAYMENTS"
        startDate="2026-02-01"
        endDate="2026-02-28"
        flowDirection="outflow"
      />
    </MantineProvider>,
  );

  expect(mockFns.useTransactionAnalysisControllerGetTransactionsMock)
    .toHaveBeenCalledWith(
      {
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        categoryPrimary: 'LOAN_PAYMENTS',
        flowDirection: 'outflow',
      },
      expect.objectContaining({
        query: { enabled: true },
      }),
    );
});
```

- [ ] **Step 2: Update the modal to use the generated analysis drilldown hook**

```ts
const { data, isPending } = useTransactionAnalysisControllerGetTransactions(
  {
    startDate,
    endDate,
    categoryPrimary: categoryPrimary ?? undefined,
    flowDirection,
  },
  { query: { enabled: opened && !!categoryPrimary } },
);

const transactions = data ?? [];
```

- [ ] **Step 3: Preserve the existing empty/loading/table states**

```tsx
{isPending ? (
  <Group justify="center" py="xl">
    <Loader />
  </Group>
) : transactions.length === 0 ? (
  <Text c="dimmed" ta="center" py="xl">
    No transactions found.
  </Text>
) : (
  <TransactionsTable
    data={transactions}
    totalRows={transactions.length}
    isLoading={false}
    isError={false}
  />
)}
```

- [ ] **Step 4: Run the focused frontend test, then the frontend typecheck**

Run: `cd frontend && yarn test src/components/CategoryTransactionsModal.test.tsx`

Expected: PASS

Run: `cd frontend && yarn typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CategoryTransactionsModal.tsx frontend/src/components/CategoryTransactionsModal.test.tsx
git commit -m "feat: align analysis modal with reconciled drilldown"
```

### Task 5: Final Verification And Manual Consistency Check

**Files:**
- Inspect: `backend/src/transaction-analysis/transaction-analysis.service.ts`
- Inspect: `frontend/src/components/CategoryTransactionsModal.tsx`

- [ ] **Step 1: Re-run the backend and frontend focused tests together**

Run: `cd backend && yarn test test/transaction-analysis/transaction-analysis.service.spec.ts --runInBand`

Expected: PASS

Run: `cd frontend && yarn test src/components/CategoryTransactionsModal.test.tsx`

Expected: PASS

- [ ] **Step 2: Re-run static verification**

Run: `cd backend && yarn typecheck`

Expected: PASS

Run: `cd frontend && yarn typecheck`

Expected: PASS

- [ ] **Step 3: Do a local manual spot-check on the analysis page**

1. Start backend and frontend locally.
2. Open `/analysis?startDate=2026-02-01&endDate=2026-02-28`.
3. Open `INCOME` and `LOAN_PAYMENTS` drilldowns.
4. Confirm the matched February 28 Bilt mirror rows do not appear.
5. Confirm row converted amounts are stable relative to the selected `endDate`, not the current day.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-03-23-analysis-drilldown-alignment-design.md docs/superpowers/plans/2026-03-23-analysis-drilldown-alignment.md
git commit -m "docs: capture analysis drilldown alignment plan"
```
