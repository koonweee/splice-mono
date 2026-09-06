import { AccountEntity } from '../../src/account/account.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { BalanceColumns } from '../../src/common/balance.columns';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { CategorizationRuleEntity } from '../../src/transaction-categorization/categorization-rule.entity';
import { TransactionCategorizationService } from '../../src/transaction-categorization/categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';
import { MoneySign } from '../../src/types/MoneyWithSign';

const userId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const ruleId = '44444444-4444-4444-8444-444444444444';

function buildCategory(): CategoryEntity {
  return {
    id: categoryId,
    userId,
    primary: 'Transport',
    detailed: 'Rideshare',
    color: '#228be6',
    archivedAt: null,
  } as CategoryEntity;
}

function buildRule(): CategorizationRuleEntity {
  return {
    id: ruleId,
    userId,
    name: 'Uber rides',
    priority: 10,
    targetCategoryId: categoryId,
    conditions: [
      { field: 'merchantName', operator: 'contains', value: 'uber' },
    ],
    archivedAt: null,
    createdAt: new Date('2026-02-14T00:00:00.000Z'),
    updatedAt: new Date('2026-02-14T00:00:00.000Z'),
  } as CategorizationRuleEntity;
}

function buildTransaction(params: {
  id: string;
  source?: 'provider' | 'manual';
  categoryAssignmentSource?: 'manual' | 'rule' | null;
  categoryAssignmentRuleId?: string | null;
  categoryId?: string | null;
  categoryUpdatedAt?: Date | null;
}): TransactionEntity {
  const transaction = TransactionEntity.fromDto(
    {
      accountId,
      amount: {
        money: { amount: '1250', currency: 'USD' },
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
  transaction.id = params.id;
  transaction.createdAt = new Date('2026-02-14T00:00:00.000Z');
  transaction.updatedAt = new Date('2026-02-14T00:00:00.000Z');
  transaction.source = params.source ?? 'provider';
  transaction.amount = BalanceColumns.fromMoneyWithSign({
    money: { amount: '1250', currency: 'USD' },
    sign: MoneySign.NEGATIVE,
  });
  transaction.categoryAssignmentSource =
    params.categoryAssignmentSource ?? null;
  transaction.categoryAssignmentRuleId =
    params.categoryAssignmentRuleId ?? null;
  transaction.categoryId = params.categoryId ?? null;
  transaction.categoryUpdatedAt = params.categoryUpdatedAt ?? null;
  transaction.category = null;
  return transaction;
}

describe('TransactionCategorizationService saved rule application', () => {
  let service: TransactionCategorizationService;
  let transactionRepoForManager: { find: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    const ruleRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const accountRepository = {
      find: jest.fn().mockResolvedValue([{ id: accountId } as AccountEntity]),
    };
    const categoryRepository = {
      findOne: jest.fn().mockResolvedValue(buildCategory()),
      find: jest.fn().mockResolvedValue([buildCategory()]),
    };
    const ruleRepoForManager = {
      findOne: jest.fn().mockResolvedValue(buildRule()),
      find: jest.fn().mockResolvedValue([buildRule()]),
    };
    const categoryRepoForManager = {
      findOne: jest.fn().mockResolvedValue(buildCategory()),
    };
    transactionRepoForManager = {
      find: jest.fn(),
      save: jest.fn(),
    };
    const manager = {
      transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
        callback(manager),
      ),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === TransactionEntity) {
          return transactionRepoForManager;
        }
        if (entity === CategoryEntity) {
          return categoryRepoForManager;
        }
        return ruleRepoForManager;
      }),
    };
    const transactionRepository = {
      manager,
    };

    service = new TransactionCategorizationService(
      ruleRepository as never,
      accountRepository as never,
      categoryRepository as never,
      transactionRepository as never,
      new RuleBasedCategorizationEngine(),
    );
  });

  it('previews only transactions that would change for an already applied rule', async () => {
    transactionRepoForManager.find.mockResolvedValue([
      buildTransaction({
        id: '55555555-5555-4555-8555-555555555551',
        categoryAssignmentSource: 'rule',
        categoryAssignmentRuleId: ruleId,
        categoryId,
        categoryUpdatedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
      buildTransaction({
        id: '55555555-5555-4555-8555-555555555552',
      }),
      buildTransaction({
        id: '55555555-5555-4555-8555-555555555553',
        categoryAssignmentSource: 'manual',
        categoryId,
        categoryUpdatedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);

    const result = await service.previewRuleApplication(ruleId, userId);

    expect(result).toMatchObject({
      matched: 3,
      updated: 1,
      skippedManual: 1,
    });
    expect(result?.transactions).toHaveLength(1);
    expect(result?.transactions[0]).toMatchObject({
      id: '55555555-5555-4555-8555-555555555552',
    });
    expect(transactionRepoForManager.save).not.toHaveBeenCalled();
  });

  it('does not rewrite already assigned transactions when applying a saved rule', async () => {
    const originalCategoryUpdatedAt = new Date('2026-02-01T00:00:00.000Z');
    const alreadyAssigned = buildTransaction({
      id: '55555555-5555-4555-8555-555555555551',
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: ruleId,
      categoryId,
      categoryUpdatedAt: originalCategoryUpdatedAt,
    });
    const unassigned = buildTransaction({
      id: '55555555-5555-4555-8555-555555555552',
    });
    transactionRepoForManager.find.mockResolvedValue([
      alreadyAssigned,
      unassigned,
    ]);

    const result = await service.applyRuleToExisting(ruleId, userId);

    expect(result).toMatchObject({
      matched: 2,
      updated: 1,
      skippedManual: 0,
    });
    expect(transactionRepoForManager.save).toHaveBeenCalledWith([unassigned]);
    expect(alreadyAssigned.categoryUpdatedAt).toBe(originalCategoryUpdatedAt);
    expect(unassigned).toMatchObject({
      categoryId,
      category: buildCategory(),
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: ruleId,
    });
    expect(unassigned.categoryUpdatedAt).toBeInstanceOf(Date);
  });

  it('is a no-op on repeated apply when every match already has the rule assignment', async () => {
    const originalCategoryUpdatedAt = new Date('2026-02-01T00:00:00.000Z');
    const alreadyAssigned = buildTransaction({
      id: '55555555-5555-4555-8555-555555555551',
      categoryAssignmentSource: 'rule',
      categoryAssignmentRuleId: ruleId,
      categoryId,
      categoryUpdatedAt: originalCategoryUpdatedAt,
    });
    transactionRepoForManager.find.mockResolvedValue([alreadyAssigned]);

    const result = await service.applyRuleToExisting(ruleId, userId);

    expect(result).toMatchObject({
      matched: 1,
      updated: 0,
      skippedManual: 0,
    });
    expect(transactionRepoForManager.save).not.toHaveBeenCalled();
    expect(alreadyAssigned.categoryUpdatedAt).toBe(originalCategoryUpdatedAt);
  });
});
