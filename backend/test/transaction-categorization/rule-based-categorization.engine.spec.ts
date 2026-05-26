import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { BalanceColumns } from '../../src/common/balance.columns';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { CategorizationRuleEntity } from '../../src/transaction-categorization/categorization-rule.entity';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';

const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000010';
const categoryId = '00000000-0000-4000-8000-000000000100';

function buildTransaction(
  overrides: Partial<TransactionEntity> = {},
): TransactionEntity {
  const transaction = TransactionEntity.fromDto(
    {
      accountId,
      amount: {
        money: { amount: 1250, currency: 'USD' },
        sign: MoneySign.NEGATIVE,
      },
      merchantName: 'Uber Trip',
      providerTransactionName: 'UBER *TRIP',
      originalDescription: 'UBER TECHNOLOGIES',
      pending: false,
      providerDate: '2026-02-14',
      personalFinanceCategory: {
        primary: 'TRANSPORTATION',
        detailed: 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
      },
    },
    userId,
  );
  transaction.id = overrides.id ?? '00000000-0000-4000-8000-000000000200';
  transaction.createdAt = new Date('2026-02-14T00:00:00.000Z');
  transaction.updatedAt = new Date('2026-02-14T00:00:00.000Z');
  Object.assign(transaction, overrides);
  return transaction;
}

function buildRule(
  overrides: Partial<CategorizationRuleEntity> = {},
): CategorizationRuleEntity {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000300',
    userId,
    name: overrides.name ?? 'Rideshare',
    priority: overrides.priority ?? 10,
    targetCategoryId: overrides.targetCategoryId ?? categoryId,
    conditions: overrides.conditions ?? [
      { field: 'merchantName', operator: 'contains', value: 'uber' },
    ],
    archivedAt: overrides.archivedAt ?? null,
    createdAt: overrides.createdAt ?? new Date('2026-02-14T00:00:00.000Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-14T00:00:00.000Z'),
  } as CategorizationRuleEntity;
}

describe('RuleBasedCategorizationEngine', () => {
  const engine = new RuleBasedCategorizationEngine();

  it.each([
    { field: 'merchantName', operator: 'equals', value: 'uber trip' },
    { field: 'merchantName', operator: 'contains', value: 'BER TRI' },
    { field: 'merchantName', operator: 'startsWith', value: ' uber' },
    { field: 'merchantName', operator: 'endsWith', value: 'TRIP ' },
    {
      field: 'providerCategoryDetailed',
      operator: 'equals',
      value: 'transportation_taxis_and_ride_shares',
    },
  ] as const)('matches text condition %j', (conditions) => {
    const match = engine.findFirstMatch(
      [buildRule({ conditions: [conditions] })],
      buildTransaction(),
    );

    expect(match?.targetCategoryId).toBe(categoryId);
  });

  it('supports account, amount sign, amount ranges, and AND semantics', () => {
    const match = engine.findFirstMatch(
      [
        buildRule({
          conditions: [
            { field: 'accountId', operator: 'equals', value: accountId },
            { field: 'amountSign', operator: 'equals', value: 'negative' },
            {
              field: 'amount',
              operator: 'between',
              value: { min: 10, max: 50 },
            },
          ],
        }),
      ],
      buildTransaction(),
    );

    expect(match?.targetCategoryId).toBe(categoryId);
  });

  it('ignores currency while matching amount in major units', () => {
    const match = engine.findFirstMatch(
      [
        buildRule({
          conditions: [
            { field: 'amount', operator: 'greaterThan', value: 12 },
            { field: 'amount', operator: 'lessThan', value: 13 },
          ],
        }),
      ],
      buildTransaction({
        amount: BalanceColumns.fromMoneyWithSign({
          money: { amount: 1250, currency: 'EUR' },
          sign: MoneySign.NEGATIVE,
        }),
      }),
    );

    expect(match?.targetCategoryId).toBe(categoryId);
  });

  it('uses priority before created date and ID', () => {
    const highPriorityCategoryId = '00000000-0000-4000-8000-000000000101';
    const lowPriorityCategoryId = '00000000-0000-4000-8000-000000000102';

    const match = engine.findFirstMatch(
      [
        buildRule({
          id: '00000000-0000-4000-8000-000000000401',
          priority: 20,
          targetCategoryId: lowPriorityCategoryId,
        }),
        buildRule({
          id: '00000000-0000-4000-8000-000000000402',
          priority: 5,
          targetCategoryId: highPriorityCategoryId,
        }),
      ],
      buildTransaction(),
    );

    expect(match?.targetCategoryId).toBe(highPriorityCategoryId);
  });

  it('canonicalizes condition order and text whitespace for duplicate checks', () => {
    expect(
      engine.canonicalConditionsKey([
        { field: 'amountSign', operator: 'equals', value: 'negative' },
        {
          field: 'merchantName',
          operator: 'contains',
          value: '  Uber   Trip ',
        },
      ]),
    ).toBe(
      engine.canonicalConditionsKey([
        { field: 'merchantName', operator: 'contains', value: 'uber trip' },
        { field: 'amountSign', operator: 'equals', value: 'negative' },
      ]),
    );
  });
});
