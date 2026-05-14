import { NotFoundException } from '@nestjs/common';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionService } from '../../src/transaction/transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { CreateTransactionDto } from '../../src/types/Transaction';

const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000010';

function buildCategory(
  overrides: Partial<CategoryEntity> = {},
): CategoryEntity {
  const category = new CategoryEntity();
  category.id = overrides.id ?? '00000000-0000-4000-8000-000000000100';
  category.userId = overrides.userId ?? userId;
  category.setLabels(
    overrides.primary ?? 'FOOD_AND_DRINK',
    overrides.detailed ?? 'FOOD_AND_DRINK_RESTAURANT',
  );
  category.description = overrides.description ?? '';
  category.color = overrides.color ?? '#228be6';
  category.archivedAt = overrides.archivedAt ?? null;
  category.createdAt =
    overrides.createdAt ?? new Date('2026-02-14T00:00:00.000Z');
  category.updatedAt =
    overrides.updatedAt ?? new Date('2026-02-14T00:00:00.000Z');
  return category;
}

function buildCreateDto(
  overrides: Partial<CreateTransactionDto> = {},
): CreateTransactionDto {
  return {
    amount: {
      money: { amount: 1200, currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    },
    accountId,
    merchantName: 'Store',
    pending: false,
    providerDate: '2026-02-14',
    ...overrides,
  };
}

function buildTransaction(
  overrides: Partial<TransactionEntity> = {},
): TransactionEntity {
  const entity = TransactionEntity.fromDto(buildCreateDto(), userId);
  entity.id = overrides.id ?? '00000000-0000-4000-8000-000000000200';
  entity.createdAt =
    overrides.createdAt ?? new Date('2026-02-14T00:00:00.000Z');
  entity.updatedAt =
    overrides.updatedAt ?? new Date('2026-02-14T00:00:00.000Z');
  Object.assign(entity, overrides);
  return entity;
}

describe('TransactionService', () => {
  const category = buildCategory();
  const repository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    delete: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const categoryRepository = {
    find: jest.fn(),
  };
  const categoryService = {
    findActiveAssignableCategory: jest.fn(),
  };

  let service: TransactionService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    service = new TransactionService(
      repository as never,
      categoryRepository as never,
      categoryService as unknown as CategoryService,
    );
    repository.save.mockImplementation(async (entity: TransactionEntity) => {
      entity.id = entity.id ?? '00000000-0000-4000-8000-000000000201';
      entity.createdAt =
        entity.createdAt ?? new Date('2026-02-14T00:00:00.000Z');
      entity.updatedAt =
        entity.updatedAt ?? new Date('2026-02-14T00:00:00.000Z');
      return entity;
    });
  });

  it('creates uncategorized transactions while preserving provider category hints', async () => {
    const result = await service.create(
      buildCreateDto({
        personalFinanceCategory: {
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
        },
        personalFinanceCategoryConfidenceLevel: 'HIGH',
        personalFinanceCategoryIconUrl: 'https://example.com/icon.png',
      }),
      userId,
    );

    expect(categoryService.findActiveAssignableCategory).not.toHaveBeenCalled();
    expect(result.categoryId).toBeNull();
    expect(result.category).toBeNull();
    expect(result.providerCategoryHint).toMatchObject({
      provider: 'plaid',
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_RESTAURANT',
      displayLabel: 'Food And Drink > Restaurant',
      confidenceLevel: 'HIGH',
      iconUrl: 'https://example.com/icon.png',
    });
  });

  it('assigns, clears, and timestamps user categories', async () => {
    const transaction = buildTransaction();
    repository.findOne.mockResolvedValueOnce(transaction);
    repository.save.mockResolvedValueOnce(transaction);
    repository.findOne.mockResolvedValueOnce(transaction);
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    const assigned = await service.updateCategory(
      transaction.id,
      { categoryId: category.id },
      userId,
    );

    expect(assigned?.categoryId).toBe(category.id);
    expect(transaction.categoryUpdatedAt).toBeInstanceOf(Date);

    repository.findOne.mockResolvedValueOnce(transaction);
    repository.save.mockResolvedValueOnce(transaction);
    repository.findOne.mockResolvedValueOnce(transaction);

    const cleared = await service.updateCategory(
      transaction.id,
      { categoryId: null },
      userId,
    );

    expect(cleared?.categoryId).toBeNull();
    expect(transaction.categoryUpdatedAt).toBeNull();
  });

  it('returns null for missing transaction or unassignable category', async () => {
    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateCategory('missing-id', { categoryId: category.id }, userId),
    ).resolves.toBeNull();

    repository.findOne.mockResolvedValueOnce(buildTransaction());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(null);
    await expect(
      service.updateCategory('txn-id', { categoryId: category.id }, userId),
    ).resolves.toBeNull();
  });

  it('throws when general update tries to assign an invalid category', async () => {
    repository.findOne.mockResolvedValueOnce(buildTransaction());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(null);

    await expect(
      service.update('txn-id', { categoryId: category.id }, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bulk updates and undo tokens store actual user category IDs', async () => {
    const transaction = buildTransaction({
      categoryId: null,
      category: null,
      categoryUpdatedAt: null,
    });
    const txnRepo = {
      find: jest.fn().mockResolvedValue([transaction]),
      save: jest.fn().mockResolvedValue([transaction]),
    };
    repository.manager.transaction.mockImplementation(
      async (
        callback: (manager: { getRepository: () => typeof txnRepo }) => unknown,
      ) => callback({ getRepository: () => txnRepo }),
    );
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    const result = await service.bulkUpdateCategories(userId, {
      transactionIds: [transaction.id],
      categoryId: category.id,
    });

    expect(result).toMatchObject({
      count: 1,
      transactionIds: [transaction.id],
    });
    expect(transaction.categoryId).toBe(category.id);
    expect(transaction.categoryUpdatedAt).toBeInstanceOf(Date);
    expect(result?.undo).toEqual(expect.any(String));
  });

  it('sync inserts provider hints without resolving provider categories into app categories', async () => {
    const saved: TransactionEntity[] = [];
    const txnRepo = {
      save: jest.fn(
        async (entities: TransactionEntity | TransactionEntity[]) => {
          if (Array.isArray(entities)) {
            saved.push(...entities);
          } else {
            saved.push(entities);
          }
          return entities;
        },
      ),
      findOne: jest.fn(),
      delete: jest.fn(),
    };
    repository.manager.transaction.mockImplementation(
      async (
        callback: (manager: { getRepository: () => typeof txnRepo }) => unknown,
      ) => callback({ getRepository: () => txnRepo }),
    );

    await service.processSyncResults(
      userId,
      new Map([['external-account-id', accountId]]),
      {
        added: [
          buildCreateDto({
            accountId: 'external-account-id',
            externalTransactionId: 'external-txn-id',
            personalFinanceCategory: {
              primary: 'GENERAL_MERCHANDISE',
              detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
            },
          }),
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor',
        hasMore: false,
      },
    );

    expect(saved[0].categoryId).toBeNull();
    expect(saved[0].providerCategoryProvider).toBe('plaid');
    expect(saved[0].providerCategoryPrimary).toBe('GENERAL_MERCHANDISE');
  });

  it('sync updates matched pending transactions to posted while preserving user metadata', async () => {
    const categoryUpdatedAt = new Date('2026-02-14T12:00:00.000Z');
    const pendingTransaction = buildTransaction({
      id: '00000000-0000-4000-8000-000000000300',
      accountId,
      externalTransactionId: 'pending-external-id',
      pending: true,
      categoryId: category.id,
      category,
      categoryUpdatedAt,
      reportingDateOverride: '2026-02-13',
      providerCategoryProvider: 'plaid',
      providerCategoryPrimary: 'GENERAL_MERCHANDISE',
      providerCategoryDetailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
    });
    const saved: TransactionEntity[] = [];
    const txnRepo = {
      save: jest.fn(
        async (entities: TransactionEntity | TransactionEntity[]) => {
          if (Array.isArray(entities)) {
            saved.push(...entities);
          } else {
            saved.push(entities);
          }
          return entities;
        },
      ),
      findOne: jest.fn().mockResolvedValue(pendingTransaction),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    repository.manager.transaction.mockImplementation(
      async (
        callback: (manager: { getRepository: () => typeof txnRepo }) => unknown,
      ) => callback({ getRepository: () => txnRepo }),
    );

    await service.processSyncResults(
      userId,
      new Map([['external-account-id', accountId]]),
      {
        added: [
          buildCreateDto({
            accountId: 'external-account-id',
            externalTransactionId: 'posted-external-id',
            pending: false,
            pendingTransactionId: 'pending-external-id',
            merchantName: 'Posted Store',
            providerDate: '2026-02-15',
            personalFinanceCategory: undefined,
          }),
        ],
        modified: [],
        removed: ['pending-external-id'],
        nextCursor: 'cursor',
        hasMore: false,
      },
    );

    expect(txnRepo.findOne).toHaveBeenCalledWith({
      where: {
        externalTransactionId: 'pending-external-id',
        accountId,
        userId,
        pending: true,
      },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(pendingTransaction);
    expect(pendingTransaction.id).toBe('00000000-0000-4000-8000-000000000300');
    expect(pendingTransaction.externalTransactionId).toBe('posted-external-id');
    expect(pendingTransaction.pending).toBe(false);
    expect(pendingTransaction.pendingTransactionId).toBe('pending-external-id');
    expect(pendingTransaction.merchantName).toBe('Posted Store');
    expect(pendingTransaction.providerDate).toBe('2026-02-15');
    expect(pendingTransaction.categoryId).toBe(category.id);
    expect(pendingTransaction.category).toBe(category);
    expect(pendingTransaction.categoryUpdatedAt).toBe(categoryUpdatedAt);
    expect(pendingTransaction.reportingDateOverride).toBe('2026-02-13');
    expect(pendingTransaction.providerCategoryProvider).toBeNull();
    expect(pendingTransaction.providerCategoryPrimary).toBeNull();
    expect(pendingTransaction.providerCategoryDetailed).toBeNull();
    expect(txnRepo.delete).toHaveBeenCalledTimes(1);
  });
});
