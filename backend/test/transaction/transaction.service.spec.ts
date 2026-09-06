import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountEntity } from '../../src/account/account.entity';
import { AccountActivityEntity } from '../../src/account-activity/account-activity.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';
import { BalanceColumns } from '../../src/common/balance.columns';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionService } from '../../src/transaction/transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type {
  CreateManualTransactionDto,
  CreateTransactionDto,
} from '../../src/types/Transaction';

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
      money: { amount: '1200', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    },
    accountId,
    merchantName: 'Store',
    pending: false,
    providerDate: '2026-02-14',
    ...overrides,
  };
}

function buildManualDto(
  overrides: Partial<CreateManualTransactionDto> = {},
): CreateManualTransactionDto {
  return {
    accountId,
    amount: {
      money: { amount: '3400', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    },
    merchantName: 'Manual Store',
    providerDate: '2026-03-01',
    categoryId: '00000000-0000-4000-8000-000000000100',
    ...overrides,
  };
}

function buildAccount(overrides: Partial<AccountEntity> = {}): AccountEntity {
  const account = new AccountEntity();
  account.id = overrides.id ?? accountId;
  account.userId = overrides.userId ?? userId;
  account.name = overrides.name ?? 'Checking';
  account.customName = overrides.customName ?? null;
  account.notes = overrides.notes ?? null;
  account.mask = overrides.mask ?? null;
  account.availableBalance =
    overrides.availableBalance ??
    BalanceColumns.fromMoneyWithSign({
      money: { amount: '100000', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    });
  account.currentBalance =
    overrides.currentBalance ??
    BalanceColumns.fromMoneyWithSign({
      money: { amount: '100000', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    });
  account.type = overrides.type ?? 'depository';
  account.subType = overrides.subType ?? 'checking';
  account.externalAccountId = overrides.externalAccountId ?? null;
  account.rawApiAccount = overrides.rawApiAccount ?? null;
  account.archivedAt = overrides.archivedAt ?? null;
  account.bankLinkId = overrides.bankLinkId ?? null;
  account.bankLink = overrides.bankLink ?? null;
  account.createdAt =
    overrides.createdAt ?? new Date('2026-02-14T00:00:00.000Z');
  account.updatedAt =
    overrides.updatedAt ?? new Date('2026-02-14T00:00:00.000Z');
  return account;
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
    remove: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const accountActivityRepository = {
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const categoryRepository = {
    find: jest.fn(),
  };
  const accountRepository = {
    findOne: jest.fn(),
  };
  const categoryService = {
    findActiveAssignableCategory: jest.fn(),
  };
  const transactionCategorizationService = {
    applyRuleAssignmentIfEligible: jest.fn().mockResolvedValue(false),
  };
  const eventEmitter = {
    emit: jest.fn(),
  };

  let service: TransactionService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    service = new TransactionService(
      repository as never,
      categoryRepository as never,
      accountRepository as never,
      categoryService as unknown as CategoryService,
      transactionCategorizationService as never,
      eventEmitter as unknown as EventEmitter2,
    );
    repository.manager.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: (entity: unknown) =>
          entity === AccountActivityEntity
            ? accountActivityRepository
            : repository,
      }),
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

  it('finds a bounded batch of stale provider pending transactions', async () => {
    const stalePending = buildTransaction({
      pending: true,
      source: 'provider',
      externalTransactionId: 'stale-pending-id',
      providerDate: '2026-08-01',
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    stalePending.activity.updatedAt = new Date('2026-08-03T00:00:00.000Z');
    stalePending.activity.account = buildAccount();
    repository.find.mockResolvedValueOnce([stalePending]);

    await expect(
      service.findStalePendingProviderTransactions(
        userId,
        [accountId],
        '2026-08-08',
        100,
      ),
    ).resolves.toEqual([
      {
        internalAccountId: accountId,
        pendingExternalTransactionId: 'stale-pending-id',
        providerDate: '2026-08-01',
        localUpdatedAt: '2026-08-03T00:00:00.000Z',
      },
    ]);

    expect(repository.find).toHaveBeenCalledWith({
      where: {
        source: 'provider',
        pending: true,
        activity: {
          userId,
          accountId: expect.any(Object),
          provider: 'plaid',
          providerDate: expect.any(Object),
          externalActivityId: expect.any(Object),
          account: {
            archivedAt: expect.any(Object),
            type: expect.any(Object),
          },
        },
      },
      relations: ['activity', 'activity.account', 'category'],
      order: { activity: { providerDate: 'ASC', id: 'ASC' } },
      take: 100,
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
    expect(result.categoryAssignmentSource).toBeNull();
    expect(result.categoryAssignmentRuleId).toBeNull();
    expect(result.source).toBe('provider');
    expect(result.providerCategoryHint).toMatchObject({
      provider: 'plaid',
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_RESTAURANT',
      displayLabel: 'Food And Drink > Restaurant',
      confidenceLevel: 'HIGH',
      iconUrl: 'https://example.com/icon.png',
    });
  });

  it('creates manual transactions with account-derived currency and null provider metadata', async () => {
    const account = buildAccount();
    accountRepository.findOne.mockResolvedValueOnce(account);
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    const result = await service.createManual(userId, buildManualDto());

    const saved = repository.save.mock.calls[0][0] as TransactionEntity;
    expect(accountRepository.findOne).toHaveBeenCalledWith({
      where: { id: accountId, userId, archivedAt: expect.any(Object) },
    });
    expect(result?.source).toBe('manual');
    expect(result?.amount.money.currency).toBe('USD');
    expect(result?.amount.money.amount).toBe('3400');
    expect(result?.categoryAssignmentSource).toBe('manual');
    expect(result?.categoryAssignmentRuleId).toBeNull();
    expect(result?.categoryId).toBe(category.id);
    expect(saved.source).toBe('manual');
    expect(saved.pending).toBe(false);
    expect(saved.externalTransactionId).toBeNull();
    expect(saved.providerTransactionName).toBeNull();
    expect(saved.originalDescription).toBeNull();
    expect(saved.reportingDateOverride).toBeNull();
    expect(saved.authorizedDate).toBeNull();
    expect(saved.authorizedDatetime).toBeNull();
    expect(saved.providerDatetime).toBeNull();
  });

  it('rejects manual create for inactive accounts, non-positive amounts, mismatched currencies, and unassignable categories', async () => {
    accountRepository.findOne.mockResolvedValueOnce(null);
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    await expect(
      service.createManual(userId, buildManualDto()),
    ).resolves.toBeNull();
    expect(repository.save).not.toHaveBeenCalled();

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(null);

    await expect(
      service.createManual(userId, buildManualDto()),
    ).resolves.toBeNull();
    expect(repository.save).not.toHaveBeenCalled();

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    await expect(
      service.createManual(
        userId,
        buildManualDto({
          amount: {
            money: { amount: '0', currency: 'USD' },
            sign: MoneySign.NEGATIVE,
          },
        }),
      ),
    ).rejects.toThrow('Manual transaction amount must be positive');

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    await expect(
      service.createManual(
        userId,
        buildManualDto({
          amount: {
            money: { amount: '-1200', currency: 'USD' },
            sign: MoneySign.NEGATIVE,
          },
        }),
      ),
    ).rejects.toThrow('nonnegative');

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );

    await expect(
      service.createManual(
        userId,
        buildManualDto({
          amount: {
            money: { amount: '1200', currency: 'EUR' },
            sign: MoneySign.NEGATIVE,
          },
        }),
      ),
    ).rejects.toThrow(
      'Manual transaction currency must match the selected account currency',
    );
  });

  it('updates manual transactions and returns null for provider transactions', async () => {
    const manualTransaction = buildTransaction({ source: 'manual' });
    const newAccount = buildAccount({
      id: '00000000-0000-4000-8000-000000000011',
      currentBalance: BalanceColumns.fromMoneyWithSign({
        money: { amount: '200000', currency: 'EUR' },
        sign: MoneySign.POSITIVE,
      }),
    });
    const updateDto = buildManualDto({
      accountId: newAccount.id,
      amount: {
        money: { amount: '9900', currency: 'EUR' },
        sign: MoneySign.POSITIVE,
      },
      merchantName: 'Updated Manual Store',
      providerDate: '2026-04-02',
    });
    repository.findOne.mockResolvedValueOnce(manualTransaction);
    accountRepository.findOne.mockResolvedValueOnce(newAccount);
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      category,
    );
    repository.save.mockResolvedValueOnce(manualTransaction);

    const updated = await service.updateManual(
      manualTransaction.id,
      userId,
      updateDto,
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: manualTransaction.id,
        source: 'manual',
        activity: { userId },
      },
      relations: ['activity', 'activity.account', 'category'],
    });
    expect(updated?.source).toBe('manual');
    expect(manualTransaction.accountId).toBe(newAccount.id);
    expect(manualTransaction.amount.toMoneyWithSign()).toEqual({
      money: { amount: '9900', currency: 'EUR' },
      sign: MoneySign.POSITIVE,
    });
    expect(manualTransaction.merchantName).toBe('Updated Manual Store');
    expect(manualTransaction.providerDate).toBe('2026-04-02');
    expect(manualTransaction.categoryId).toBe(category.id);
    expect(manualTransaction.reportingDateOverride).toBeNull();
    expect(manualTransaction.externalTransactionId).toBeNull();

    repository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.updateManual('provider-id', userId, buildManualDto()),
    ).resolves.toBeNull();
  });

  it('deletes only manual transactions', async () => {
    const manualTransaction = buildTransaction({ source: 'manual' });
    repository.findOne.mockResolvedValueOnce(manualTransaction);

    await expect(
      service.removeManual('00000000-0000-4000-8000-000000000200', userId),
    ).resolves.toBe(true);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-4000-8000-000000000200',
        source: 'manual',
        activity: { userId },
      },
      relations: ['activity', 'activity.account', 'category'],
    });
    expect(accountActivityRepository.delete).toHaveBeenCalledWith({
      id: manualTransaction.activityId,
    });

    repository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.removeManual('00000000-0000-4000-8000-000000000201', userId),
    ).resolves.toBe(false);
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
    expect(transaction.categoryAssignmentSource).toBe('manual');
    expect(transaction.categoryAssignmentRuleId).toBeNull();

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
    expect(transaction.categoryAssignmentSource).toBe('manual');
    expect(transaction.categoryAssignmentRuleId).toBeNull();
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

  it('does not apply provider category overrides to manual transactions', async () => {
    const manualTransaction = buildTransaction({
      source: 'manual',
      categoryId: category.id,
      category,
    });
    repository.findOne.mockResolvedValueOnce(manualTransaction);

    await expect(
      service.updateCategory(
        manualTransaction.id,
        { categoryId: null },
        userId,
      ),
    ).resolves.toBeNull();

    expect(manualTransaction.categoryId).toBe(category.id);
    expect(categoryService.findActiveAssignableCategory).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('throws when general update tries to assign an invalid category', async () => {
    repository.findOne.mockResolvedValueOnce(buildTransaction());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(null);

    await expect(
      service.update('txn-id', { categoryId: category.id }, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not update manual transactions through the generic provider update path', async () => {
    repository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.update(
        '00000000-0000-4000-8000-000000000200',
        { categoryId: category.id },
        userId,
      ),
    ).resolves.toBeNull();

    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: '00000000-0000-4000-8000-000000000200',
          source: 'provider',
          activity: { userId },
        },
      }),
    );
    expect(categoryService.findActiveAssignableCategory).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('updates only the reporting date of an owned provider transaction', async () => {
    const transaction = buildTransaction({
      providerDate: '2026-08-10',
      authorizedDate: '2026-08-09',
    });
    repository.findOne.mockResolvedValueOnce(transaction);
    repository.save.mockImplementationOnce(async (entity) => entity);

    const result = await service.updateReportingDate(
      transaction.id,
      { reportingDateOverride: '2026-08-15' },
      userId,
    );

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: transaction.id, source: 'provider', activity: { userId } },
      relations: ['activity', 'activity.account', 'category'],
    });
    expect(result?.reportingDateOverride).toBe('2026-08-15');
    expect(transaction.activity.activityDate).toBe('2026-08-15');
    expect(repository.save).toHaveBeenCalledTimes(1);

    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.updateReportingDate(
        transaction.id,
        { reportingDateOverride: null },
        'different-user-id',
      ),
    ).resolves.toBeNull();
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('does not remove manual transactions through the generic provider remove path', async () => {
    repository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.remove('00000000-0000-4000-8000-000000000200', userId),
    ).resolves.toBe(false);

    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-4000-8000-000000000200',
        source: 'provider',
        activity: { userId },
      },
      relations: ['activity', 'activity.account', 'category'],
    });
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
    expect(transaction.categoryAssignmentSource).toBe('manual');
    expect(transaction.categoryAssignmentRuleId).toBeNull();
    expect(result?.undo).toEqual(expect.any(String));
  });

  it('bulk category updates ignore manual transactions', async () => {
    const providerTransaction = buildTransaction({
      id: '00000000-0000-4000-8000-000000000201',
      categoryId: category.id,
      category,
      categoryUpdatedAt: new Date('2026-03-01T00:00:00.000Z'),
      source: 'provider',
    });
    const manualTransaction = buildTransaction({
      id: '00000000-0000-4000-8000-000000000202',
      categoryId: category.id,
      category,
      categoryUpdatedAt: new Date('2026-03-01T00:00:00.000Z'),
      source: 'manual',
    });
    const txnRepo = {
      find: jest
        .fn()
        .mockResolvedValue([providerTransaction, manualTransaction]),
      save: jest.fn().mockResolvedValue([providerTransaction]),
    };
    repository.manager.transaction.mockImplementation(
      async (
        callback: (manager: { getRepository: () => typeof txnRepo }) => unknown,
      ) => callback({ getRepository: () => txnRepo }),
    );

    const result = await service.bulkUpdateCategories(userId, {
      transactionIds: [providerTransaction.id, manualTransaction.id],
      categoryId: null,
    });

    expect(result).toMatchObject({
      count: 1,
      transactionIds: [providerTransaction.id],
    });
    expect(providerTransaction.categoryId).toBeNull();
    expect(manualTransaction.categoryId).toBe(category.id);
    expect(txnRepo.save).toHaveBeenCalledWith([providerTransaction]);
  });

  it('does not undo onto a category archived after the bulk update', async () => {
    const transaction = buildTransaction({
      categoryId: category.id,
      category,
      categoryUpdatedAt: new Date('2026-03-01T00:00:00.000Z'),
      source: 'provider',
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

    const update = await service.bulkUpdateCategories(userId, {
      transactionIds: [transaction.id],
      categoryId: null,
    });
    expect(update?.undo).toEqual(expect.any(String));
    expect(transaction.categoryId).toBeNull();

    categoryRepository.find.mockResolvedValueOnce([]);
    const saveCountBeforeUndo = txnRepo.save.mock.calls.length;

    await expect(
      service.undoBulkUpdateCategories(userId, { undo: update!.undo }),
    ).resolves.toBeNull();

    expect(categoryRepository.find).toHaveBeenCalledWith({
      where: {
        id: expect.any(Object),
        userId,
        archivedAt: expect.objectContaining({ _type: 'isNull' }),
      },
    });
    expect(txnRepo.save).toHaveBeenCalledTimes(saveCountBeforeUndo);
    expect(transaction.categoryId).toBeNull();
  });

  // Sync persistence, replacements, archival and side effects are exercised against real PostgreSQL in transaction-sync.postgres.spec.ts.

  it('rejects unknown provider account IDs before opening a transaction', async () => {
    await expect(
      service.processSyncResults(userId, new Map(), {
        added: [
          buildCreateDto({
            accountId: 'unknown-provider-account',
            externalTransactionId: 'unknown-provider-transaction',
          }),
        ],
        modified: [],
        removed: [],
        nextCursor: 'must-not-persist',
        hasMore: false,
      }),
    ).rejects.toThrow(
      'unknown or archived provider accounts: unknown-provider-account',
    );

    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });
});
