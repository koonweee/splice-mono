import { CategoryEntity } from '../../src/category/category.entity';
import { McpReadService } from '../../src/mcp/mcp-read.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';

describe('McpReadService', () => {
  const queryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getRawMany: jest.fn(),
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

  const investmentHoldingRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const investmentTransactionRepository = {
    createQueryBuilder: jest.fn(),
  };

  const currencyConversionService = {
    convertAmount: jest.fn(),
    getRateForDate: jest.fn(),
    getRateMap: jest.fn(),
  };

  const accountService = {
    findAll: jest.fn(),
  };

  const recurringManualTransactionService = {
    findAll: jest.fn(),
  };

  const analysisRuleService = {
    findAll: jest.fn(),
  };

  const transactionCategorizationService = {
    findAll: jest.fn(),
  };

  const categorizationRuleRecommendationService = {
    list: jest.fn(),
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
    queryBuilder.getRawMany.mockResolvedValue([]);
    categoryRepository.find.mockResolvedValue([]);
    currencyConversionService.getRateMap.mockResolvedValue(new Map());
    service = new McpReadService(
      transactionRepository as never,
      balanceSnapshotRepository as never,
      categoryRepository as never,
      investmentHoldingRepository as never,
      investmentTransactionRepository as never,
      currencyConversionService as never,
      accountService as never,
      recurringManualTransactionService as never,
      analysisRuleService as never,
      transactionCategorizationService as never,
      categorizationRuleRecommendationService as never,
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

  it('filters transactions by exact category ID, detailed category, and amount sign', async () => {
    queryBuilder.getMany.mockResolvedValue([]);

    await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryId: '22222222-2222-4222-8222-222222222222',
      amountSign: MoneySign.NEGATIVE,
      pageSize: 1,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'transaction.categoryId = :categoryId',
      { categoryId: '22222222-2222-4222-8222-222222222222' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'activity.amountSign = :amountSign',
      { amountSign: MoneySign.NEGATIVE },
    );

    jest.clearAllMocks();
    queryBuilder.getMany.mockResolvedValue([]);

    await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryPrimary: 'FOOD_AND_DRINK',
      categoryDetailed: 'FOOD_AND_DRINK_RESTAURANT',
      pageSize: 1,
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'category.primary = :categoryPrimary',
      { categoryPrimary: 'FOOD_AND_DRINK' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'category.detailed = :categoryDetailed',
      { categoryDetailed: 'FOOD_AND_DRINK_RESTAURANT' },
    );
  });

  it('rejects incompatible transaction category filters', async () => {
    await expect(
      service.listTransactions('user-1', {
        reportingCurrency: 'USD',
        categoryId: '22222222-2222-4222-8222-222222222222',
        categoryPrimary: 'FOOD_AND_DRINK',
      }),
    ).rejects.toThrow('categoryId cannot be combined');
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

  it('lists categories with IDs, colors, and archived metadata', async () => {
    categoryRepository.find.mockResolvedValue([
      buildCategory(
        '22222222-2222-4222-8222-222222222222',
        'FOOD_AND_DRINK',
        'FOOD_AND_DRINK_RESTAURANT',
      ),
    ]);
    queryBuilder.getRawMany.mockResolvedValue([
      { primary: 'FOOD_AND_DRINK', count: '3' },
    ]);

    const result = await service.listCategories('user-1', {
      includeArchived: true,
    });

    expect(categoryRepository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      order: { primary: 'ASC', detailed: 'ASC' },
    });
    expect(result.data[1]).toMatchObject({
      categoryIds: ['22222222-2222-4222-8222-222222222222'],
      primary: 'FOOD_AND_DRINK',
      color: '#228be6',
      detailedCategories: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
          color: '#228be6',
        },
      ],
      transactionCount: 3,
    });
    expect(result.query.includeArchived).toBe(true);
  });

  it('lists latest investment holdings for owned investment accounts', async () => {
    const holdingQueryBuilder = createQueryBuilderMock();
    const latestHolding = buildInvestmentHolding({
      id: 'holding-latest',
      accountId: 'investment-account',
      snapshotDate: '2026-05-20',
      institutionValue: '123.45',
    });
    const holdings = [
      buildInvestmentHolding({
        id: 'holding-1',
        accountId: 'investment-account',
        snapshotDate: '2026-05-20',
        institutionValue: '123.45',
      }),
    ];
    accountService.findAll.mockResolvedValue([
      {
        id: 'investment-account',
        name: 'Brokerage',
        customName: null,
        type: 'investment',
        subType: 'brokerage',
      },
    ]);
    investmentHoldingRepository.findOne.mockResolvedValue(latestHolding);
    investmentHoldingRepository.createQueryBuilder.mockReturnValue(
      holdingQueryBuilder,
    );
    holdingQueryBuilder.getMany.mockResolvedValue(holdings);

    const result = await service.listInvestmentHoldings('user-1', {});

    expect(investmentHoldingRepository.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1', accountId: 'investment-account' },
      order: { snapshotDate: 'DESC', updatedAt: 'DESC' },
    });
    expect(result.data[0]).toMatchObject({
      id: 'holding-1',
      accountId: 'investment-account',
      accountName: 'Brokerage',
      institutionValue: {
        amount: 123.45,
        currency: 'USD',
        sign: MoneySign.POSITIVE,
      },
    });
  });

  it('rejects unowned investment account IDs before reading holdings', async () => {
    const ownedAccountId = '11111111-1111-4111-8111-111111111111';
    const foreignAccountId = '99999999-9999-4999-8999-999999999999';
    accountService.findAll.mockResolvedValue([
      {
        id: ownedAccountId,
        name: 'Owned brokerage',
        customName: null,
        type: 'investment',
        subType: 'brokerage',
      },
    ]);

    await expect(
      service.listInvestmentHoldings('user-1', {
        accountIds: [ownedAccountId, foreignAccountId],
        latestOnly: true,
      }),
    ).rejects.toThrow(`Unknown accountIds: ${foreignAccountId}`);

    expect(investmentHoldingRepository.findOne).not.toHaveBeenCalled();
    expect(
      investmentHoldingRepository.createQueryBuilder,
    ).not.toHaveBeenCalled();
  });

  it('rejects ambiguous investment holdings query options', async () => {
    await expect(
      service.listInvestmentHoldings('user-1', {
        snapshotDate: '2026-05-20',
        latestOnly: true,
      }),
    ).rejects.toThrow('snapshotDate and latestOnly cannot be combined');
    await expect(
      service.listInvestmentHoldings('user-1', {
        snapshotDate: '2026-05-20',
        latestOnly: false,
      }),
    ).rejects.toThrow('snapshotDate and latestOnly cannot be combined');
    await expect(
      service.listInvestmentHoldings('user-1', {
        latestOnly: false,
      }),
    ).rejects.toThrow('latestOnly=false is not supported');
  });

  it('lists investment activity with cursor pagination', async () => {
    const activityQueryBuilder = createQueryBuilderMock();
    const rows = [
      buildInvestmentTransaction('investment-txn-1', '2026-05-20'),
      buildInvestmentTransaction('investment-txn-2', '2026-05-19'),
    ];
    investmentTransactionRepository.createQueryBuilder.mockReturnValue(
      activityQueryBuilder,
    );
    activityQueryBuilder.getMany.mockResolvedValue(rows);

    const result = await service.listInvestmentActivity('user-1', {
      accountIds: ['investment-account'],
      startDate: '2026-05-01',
      endDate: '2026-05-31',
      pageSize: 1,
    });

    expect(activityQueryBuilder.andWhere).toHaveBeenCalledWith(
      'activity.accountId IN (:...accountIds)',
      { accountIds: ['investment-account'] },
    );
    expect(result.data[0]).toMatchObject({
      id: 'investment-txn-1',
      accountId: 'investment-account',
      amount: {
        amount: 42,
        currency: 'USD',
        sign: MoneySign.NEGATIVE,
      },
    });
    expect(result.pageInfo.hasMore).toBe(true);
    expect(result.pageInfo.nextCursor).toEqual(expect.any(String));
  });

  it('delegates recurring schedules and rule reads to read-only services', async () => {
    recurringManualTransactionService.findAll.mockResolvedValue([
      { id: 'schedule-1', pausedAt: null },
      { id: 'schedule-2', pausedAt: new Date('2026-05-01T00:00:00Z') },
    ]);
    analysisRuleService.findAll.mockResolvedValue([{ id: 'analysis-rule-1' }]);
    transactionCategorizationService.findAll.mockResolvedValue([
      { id: 'categorization-rule-1' },
    ]);
    categorizationRuleRecommendationService.list.mockResolvedValue({
      generation: null,
      suggestions: [],
    });

    await expect(
      service.listRecurringManualTransactionSchedules('user-1', {
        includePaused: false,
      }),
    ).resolves.toMatchObject({
      data: [{ id: 'schedule-1' }],
      query: { includePaused: false },
    });
    await service.listAnalysisRules('user-1', { archived: true });
    await service.listCategorizationRules('user-1', { archived: false });
    await service.listCategorizationRuleRecommendations('user-1');

    expect(analysisRuleService.findAll).toHaveBeenCalledWith('user-1', {
      archivedMode: true,
    });
    expect(transactionCategorizationService.findAll).toHaveBeenCalledWith(
      'user-1',
      { archivedMode: false },
    );
    expect(categorizationRuleRecommendationService.list).toHaveBeenCalledWith(
      'user-1',
    );
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
    color: '#228be6',
    createdAt: new Date('2026-02-14T00:00:00Z'),
    updatedAt: new Date('2026-02-14T00:00:00Z'),
    archivedAt: null,
    toObject() {
      return {
        id,
        primary,
        detailed,
        description: `${primary} category`,
        color: '#228be6',
        archivedAt: null,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
      };
    },
  } as CategoryEntity;
}

function createQueryBuilderMock() {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
}

function buildInvestmentHolding(params: {
  id: string;
  accountId: string;
  snapshotDate: string;
  institutionValue: string | null;
}): any {
  return {
    id: params.id,
    accountId: params.accountId,
    securityId: 'security-1',
    provider: 'plaid',
    snapshotDate: params.snapshotDate,
    quantity: '2',
    costBasis: '100.00',
    institutionPrice: '61.725',
    institutionValue: params.institutionValue,
    isoCurrencyCode: 'USD',
    unofficialCurrencyCode: null,
    vestedQuantity: null,
    vestedValue: null,
    security: {
      name: 'Example Fund',
      tickerSymbol: 'EXF',
      type: 'mutual fund',
      subtype: null,
    },
  };
}

function buildInvestmentTransaction(id: string, activityDate: string): any {
  return {
    id,
    activityId: `${id}-activity`,
    securityId: 'security-1',
    externalSecurityId: 'external-security-1',
    name: 'Buy Example Fund',
    quantity: '1',
    price: '42',
    fees: null,
    investmentType: 'buy',
    investmentSubtype: 'buy',
    cancelExternalActivityId: null,
    activity: {
      accountId: 'investment-account',
      provider: 'plaid',
      externalActivityId: `external-${id}`,
      activityDate,
      providerDate: activityDate,
      providerDatetime: null,
      amount: {
        toMoneyWithSign: () => ({
          money: { amount: 4200, currency: 'USD' },
          sign: MoneySign.NEGATIVE,
        }),
      },
      account: {
        name: 'Brokerage',
        customName: null,
      },
    },
    security: {
      name: 'Example Fund',
      tickerSymbol: 'EXF',
    },
  };
}
