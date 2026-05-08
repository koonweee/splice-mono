import { McpReadService } from '../../src/mcp/mcp-read.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { CategoryEntity } from '../../src/category/category.entity';

describe('McpReadService', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const transactionRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };

  const balanceSnapshotRepository = {
    createQueryBuilder: jest.fn(),
  };

  const categoryRepository = {
    find: jest.fn(),
  };

  const currencyConversionService = {
    convertAmount: jest.fn(),
    getRateForDate: jest.fn(),
  };

  let service: McpReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.getMany.mockResolvedValue([
      buildTransactionWithOverride({
        providerPrimary: 'FOOD_AND_DRINK',
        userPrimary: 'GENERAL_MERCHANDISE',
      }),
    ]);
    service = new McpReadService(
      transactionRepository as never,
      balanceSnapshotRepository as never,
      categoryRepository as never,
      currencyConversionService as never,
    );
  });

  it('lists and filters transactions by effective category override', async () => {
    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryPrimary: 'GENERAL_MERCHANDISE',
      pageSize: 1,
    });

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'transaction.userCategory',
      'userCategory',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'COALESCE(userCategory.primary, category.primary) = :categoryPrimary',
      { categoryPrimary: 'GENERAL_MERCHANDISE' },
    );
    expect(result.data[0]).toMatchObject({
      id: 'txn-1',
      categoryPrimary: 'GENERAL_MERCHANDISE',
      categoryPrimaryLabel: 'General Merchandise',
      categoryDetailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
      categoryDetailedLabel: 'General Merchandise Other General Merchandise',
    });
  });

  it('returns activityDate from reportingDateOverride when present', async () => {
    queryBuilder.getMany.mockResolvedValue([
      buildTransactionWithOverride({
        providerPrimary: 'INCOME',
        userPrimary: 'INCOME',
        reportingDateOverride: '2026-03-01',
      }),
    ]);

    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      pageSize: 1,
    });

    expect(result.data[0]).toMatchObject({
      activityDate: '2026-03-01',
      reportingDateOverride: '2026-03-01',
      providerDate: '2026-02-14',
    });
  });

  it('accepts legacy transaction cursors encoded with date', async () => {
    queryBuilder.getMany.mockResolvedValue([]);
    const cursor = Buffer.from(
      JSON.stringify({ date: '2026-02-14', id: 'txn-1' }),
      'utf8',
    ).toString('base64url');

    await expect(
      service.listTransactions('user-1', {
        reportingCurrency: 'USD',
        cursor,
      }),
    ).resolves.toMatchObject({
      data: [],
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(expect.anything());
  });
});

function buildTransactionWithOverride(params: {
  providerPrimary: string;
  userPrimary: string;
  reportingDateOverride?: string | null;
}): TransactionEntity {
  const transaction = TransactionEntity.fromDto(
    {
      amount: {
        money: { amount: 1200, currency: 'USD' },
        sign: MoneySign.NEGATIVE,
      },
      accountId: 'account-1',
      merchantName: 'Store',
      pending: false,
      providerDate: '2026-02-14',
    },
    'user-1',
  );
  transaction.id = 'txn-1';
  transaction.account = {
    name: 'Checking',
    customName: null,
  } as TransactionEntity['account'];
  transaction.category = buildCategory(
    'provider-category-id',
    params.providerPrimary,
    `${params.providerPrimary}_DETAIL`,
  );
  transaction.userCategory = buildCategory(
    'user-category-id',
    params.userPrimary,
    `${params.userPrimary}_OTHER_GENERAL_MERCHANDISE`,
  );
  transaction.categoryId = transaction.category.id;
  transaction.userCategoryId = transaction.userCategory.id;
  transaction.userCategoryUpdatedAt = new Date('2026-02-14T00:00:00Z');
  transaction.reportingDateOverride = params.reportingDateOverride ?? null;

  return transaction;
}

function buildCategory(
  id: string,
  primary: string,
  detailed: string,
): CategoryEntity {
  return {
    id,
    primary,
    detailed,
    description: `${primary} category`,
    createdAt: new Date('2026-02-14T00:00:00Z'),
    updatedAt: new Date('2026-02-14T00:00:00Z'),
    toObject() {
      return {
        id,
        primary,
        detailed,
        description: `${primary} category`,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    },
  } as CategoryEntity;
}
