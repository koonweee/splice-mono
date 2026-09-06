import { ConflictException } from '@nestjs/common';
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
const otherCategoryId = '44444444-4444-4444-8444-444444444444';

function buildCategory(id = categoryId): CategoryEntity {
  return {
    id,
    userId,
    primary: 'Transport',
    detailed: 'Rideshare',
    color: '#228be6',
    archivedAt: null,
  } as CategoryEntity;
}

function buildTransaction(params: {
  id: string;
  categoryAssignmentSource?: 'manual' | 'rule' | null;
  categoryId?: string | null;
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
  transaction.amount = BalanceColumns.fromMoneyWithSign({
    money: { amount: '1250', currency: 'USD' },
    sign: MoneySign.NEGATIVE,
  });
  transaction.categoryAssignmentSource =
    params.categoryAssignmentSource ?? null;
  transaction.categoryId = params.categoryId ?? null;
  transaction.category = null;
  return transaction;
}

describe('TransactionCategorizationService draft preview', () => {
  let service: TransactionCategorizationService;
  let ruleRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let accountRepository: { find: jest.Mock };
  let categoryRepository: { findOne: jest.Mock; find: jest.Mock };
  let transactionRepository: {
    manager: { getRepository: jest.Mock };
  };
  let transactionRepoForManager: { find: jest.Mock; save: jest.Mock };
  let categoryRepoForManager: { findOne: jest.Mock };
  let ruleRepoForManager: { find: jest.Mock };

  beforeEach(() => {
    ruleRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto: Partial<CategorizationRuleEntity>) => ({
        createdAt: new Date('2026-02-14T00:00:00.000Z'),
        updatedAt: new Date('2026-02-14T00:00:00.000Z'),
        archivedAt: null,
        ...dto,
      })),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 0 }),
      })),
    };
    accountRepository = {
      find: jest.fn().mockResolvedValue([{ id: accountId } as AccountEntity]),
    };
    categoryRepository = {
      findOne: jest.fn().mockResolvedValue(buildCategory()),
      find: jest.fn().mockResolvedValue([buildCategory()]),
    };
    transactionRepoForManager = {
      find: jest.fn().mockResolvedValue([
        buildTransaction({
          id: '55555555-5555-4555-8555-555555555551',
        }),
        buildTransaction({
          id: '55555555-5555-4555-8555-555555555552',
          categoryAssignmentSource: 'manual',
          categoryId,
        }),
        buildTransaction({
          id: '55555555-5555-4555-8555-555555555553',
          categoryAssignmentSource: 'manual',
          categoryId: otherCategoryId,
        }),
      ]),
      save: jest.fn(),
    };
    categoryRepoForManager = {
      findOne: jest.fn().mockResolvedValue(buildCategory()),
    };
    ruleRepoForManager = { find: jest.fn().mockResolvedValue([]) };
    transactionRepository = {
      manager: {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === TransactionEntity) {
            return transactionRepoForManager;
          }
          if (entity === CategoryEntity) {
            return categoryRepoForManager;
          }
          return ruleRepoForManager;
        }),
      },
    };

    service = new TransactionCategorizationService(
      ruleRepository as never,
      accountRepository as never,
      categoryRepository as never,
      transactionRepository as never,
      new RuleBasedCategorizationEngine(),
    );
  });

  it('computes draft preview metrics without saving a rule', async () => {
    const result = await service.previewDraftRuleApplication(userId, {
      targetCategoryId: categoryId,
      conditions: [
        { field: 'merchantName', operator: 'contains', value: 'uber' },
      ],
    });

    expect(result).toMatchObject({
      matched: 3,
      updated: 1,
      skippedManual: 2,
      manualAgreement: 1,
      manualConflicts: 1,
      existingRuleOverlap: 0,
    });
    expect(result.transactions).toHaveLength(1);
    expect(transactionRepoForManager.save).not.toHaveBeenCalled();
  });

  it('excludes ignored manual categories from label agreement metrics', async () => {
    const result = await service.previewDraftRuleApplication(
      userId,
      {
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'uber' },
        ],
      },
      { ignoredManualCategoryIds: [otherCategoryId] },
    );

    expect(result).toMatchObject({
      matched: 3,
      updated: 1,
      skippedManual: 2,
      manualAgreement: 1,
      manualConflicts: 0,
    });
  });

  it('rejects account conditions outside the user scope', async () => {
    accountRepository.find.mockResolvedValueOnce([]);

    await expect(
      service.previewDraftRuleApplication(userId, {
        targetCategoryId: categoryId,
        conditions: [
          { field: 'accountId', operator: 'equals', value: accountId },
        ],
      }),
    ).rejects.toThrow('One or more accountId conditions');
  });

  it('rejects duplicate active rules', async () => {
    ruleRepository.find.mockResolvedValueOnce([
      {
        id: '66666666-6666-4666-8666-666666666666',
        userId,
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'uber' },
        ],
        archivedAt: null,
        name: 'Existing',
      } as CategorizationRuleEntity,
    ]);

    await expect(
      service.previewDraftRuleApplication(userId, {
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: ' UBER ' },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
