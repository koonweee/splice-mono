import { CategoryEntity } from '../../src/category/category.entity';
import { McpReadService } from '../../src/mcp/mcp-read.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';

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
      buildTransaction({
        categoryPrimary: 'GENERAL_MERCHANDISE',
        categoryDetailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
      }),
    ]);
    service = new McpReadService(
      transactionRepository as never,
      balanceSnapshotRepository as never,
      categoryRepository as never,
      currencyConversionService as never,
    );
  });

  it('lists and filters transactions by user category only', async () => {
    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryPrimary: 'GENERAL_MERCHANDISE',
      pageSize: 1,
    });

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'transaction.category',
      'category',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'category.primary = :categoryPrimary',
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

  it('filters uncategorized transactions by null categoryId', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryPrimary: 'UNCATEGORIZED',
      pageSize: 1,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'transaction.categoryId IS NULL',
    );
  });

  it('exposes provider category hint as guidance', async () => {
    queryBuilder.getMany.mockResolvedValue([
      buildTransaction({
        categoryPrimary: null,
        categoryDetailed: null,
        providerPrimary: 'FOOD_AND_DRINK',
        providerDetailed: 'FOOD_AND_DRINK_RESTAURANT',
      }),
    ]);

    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      pageSize: 1,
    });

    expect(result.data[0].categoryPrimary).toBeNull();
    expect(result.data[0].providerCategoryHint).toMatchObject({
      provider: 'plaid',
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_RESTAURANT',
      displayLabel: 'Food And Drink > Restaurant',
    });
  });
});

function buildTransaction(params: {
  categoryPrimary: string | null;
  categoryDetailed: string | null;
  providerPrimary?: string | null;
  providerDetailed?: string | null;
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
      personalFinanceCategory:
        params.providerPrimary || params.providerDetailed
          ? {
              primary: params.providerPrimary ?? null,
              detailed: params.providerDetailed ?? null,
            }
          : undefined,
    },
    'user-1',
  );
  transaction.id = 'txn-1';
  transaction.account = {
    name: 'Checking',
    customName: null,
  } as TransactionEntity['account'];
  transaction.category =
    params.categoryPrimary && params.categoryDetailed
      ? buildCategory(
          'category-id',
          params.categoryPrimary,
          params.categoryDetailed,
        )
      : null;
  transaction.categoryId = transaction.category?.id ?? null;
  transaction.reportingDateOverride = null;

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
    archivedAt: null,
    toObject() {
      return {
        id,
        primary,
        detailed,
        description: `${primary} category`,
        archivedAt: null,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    },
  } as CategoryEntity;
}
