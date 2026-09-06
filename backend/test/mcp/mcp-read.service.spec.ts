import { CategoryEntity } from '../../src/category/category.entity';
import { McpReadService } from '../../src/mcp/mcp-read.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { convertMinorUnits } from '../../src/common/exact-money';

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

  const snapshotManager = {};
  const transactionQueries = {
    withReadSnapshot: jest.fn(async (reader) => reader(snapshotManager)),
    readMcpCandidates: jest.fn(() => queryBuilder.getMany()),
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

  const holdingsQueries = { read: jest.fn() };

  const investmentTransactionRepository = {
    createQueryBuilder: jest.fn(),
  };

  const currencyConversionService = {
    convertAmount: jest.fn(),
    getResolvedRates: jest.fn().mockResolvedValue(new Map()),
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
    currencyConversionService.convertAmount.mockImplementation(
      convertMinorUnits,
    );
    queryBuilder.getMany.mockResolvedValue([
      buildTransaction({
        categoryPrimary: 'GENERAL_MERCHANDISE',
        categoryDetailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
      }),
    ]);
    queryBuilder.getRawMany.mockResolvedValue([]);
    categoryRepository.find.mockResolvedValue([]);
    currencyConversionService.getRateMap.mockResolvedValue(new Map());
    currencyConversionService.getResolvedRates.mockImplementation(
      async (requests) =>
        new Map(
          requests.map((request) => [
            `${request.baseCurrency}:${request.targetCurrency}:${request.requestedDate}`,
            {
              ...request,
              rateDate: request.requestedDate,
              rate: '1',
              ratio: { numerator: '1', denominator: '1' },
              source: 'IDENTITY',
            },
          ]),
        ),
    );
    service = new McpReadService(
      transactionRepository as never,
      balanceSnapshotRepository as never,
      categoryRepository as never,
      holdingsQueries as never,
      investmentTransactionRepository as never,
      currencyConversionService as never,
      accountService as never,
      recurringManualTransactionService as never,
      analysisRuleService as never,
      transactionCategorizationService as never,
      categorizationRuleRecommendationService as never,
      transactionQueries as never,
    );
  });

  it('lists and filters transactions by user category only', async () => {
    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryPrimary: 'GENERAL_MERCHANDISE',
      pageSize: 1,
    });

    expect(transactionQueries.readMcpCandidates).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ categoryPrimary: 'GENERAL_MERCHANDISE' }),
      undefined,
      expect.any(Number),
      snapshotManager,
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

    expect(transactionQueries.readMcpCandidates).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ categoryPrimary: 'UNCATEGORIZED' }),
      undefined,
      expect.any(Number),
      snapshotManager,
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

    expect(transactionQueries.readMcpCandidates).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        categoryId: '22222222-2222-4222-8222-222222222222',
      }),
      undefined,
      expect.any(Number),
      snapshotManager,
    );
    expect(transactionQueries.readMcpCandidates).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ amountSign: MoneySign.NEGATIVE }),
      undefined,
      expect.any(Number),
      snapshotManager,
    );

    jest.clearAllMocks();
    queryBuilder.getMany.mockResolvedValue([]);

    await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      categoryPrimary: 'FOOD_AND_DRINK',
      categoryDetailed: 'FOOD_AND_DRINK_RESTAURANT',
      pageSize: 1,
    });

    expect(transactionQueries.readMcpCandidates).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ categoryPrimary: 'FOOD_AND_DRINK' }),
      undefined,
      expect.any(Number),
      snapshotManager,
    );
    expect(transactionQueries.readMcpCandidates).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        categoryDetailed: 'FOOD_AND_DRINK_RESTAURANT',
      }),
      undefined,
      expect.any(Number),
      snapshotManager,
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

  it('converts one hundred foreign rows in a batch and marks an exactly full final page complete', async () => {
    const rows = Array.from({ length: 100 }, (_, index) => {
      const row = buildTransaction({
        categoryPrimary: null,
        categoryDetailed: null,
      });
      row.id = `row-${index}`;
      row.amount.currency = ['EUR', 'JPY', 'GBP'][index % 3];
      const date = new Date('2026-01-01T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      row.providerDate = date.toISOString().slice(0, 10);
      return row;
    });
    queryBuilder.getMany.mockResolvedValue(rows);
    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
      pageSize: 100,
    });
    expect(result.data).toHaveLength(100);
    expect(result.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    expect(currencyConversionService.getResolvedRates).toHaveBeenCalledTimes(1);
    expect(result.conversion.rates).toHaveLength(100);
    expect(
      result.conversion.rates.every(
        (rate) => rate.requestedDate === rate.rateDate,
      ),
    ).toBe(true);
  });

  it('returns an advancing scan-budget continuation for a rare converted amount filter without claiming completion', async () => {
    const rows = Array.from({ length: 5001 }, (_, index) => {
      const row = buildTransaction({
        categoryPrimary: null,
        categoryDetailed: null,
      });
      row.id = `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      return row;
    });
    queryBuilder.getMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
    const options = {
      reportingCurrency: 'USD',
      pageSize: 100,
      amountFilter: { currency: 'USD', min: '99999' },
    };
    const first = await service.listTransactions('user-1', options);
    expect(first.data).toHaveLength(0);
    expect(first.pageInfo).toMatchObject({
      hasMore: true,
      continuationReason: 'scan_budget',
      nextCursor: expect.any(String),
    });
    const next = await service.listTransactions('user-1', {
      ...options,
      cursor: first.pageInfo.nextCursor!,
    });
    expect(next.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    expect(transactionQueries.readMcpCandidates).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining(options),
      expect.objectContaining({ id: rows[4999].id }),
      5001,
      snapshotManager,
    );
  });

  it('converts zero foreign money without requesting a missing exchange rate', async () => {
    const row = buildTransaction({
      categoryPrimary: null,
      categoryDetailed: null,
    });
    row.amount.amount = '0';
    row.amount.currency = 'EUR';
    queryBuilder.getMany.mockResolvedValue([row]);
    currencyConversionService.getResolvedRates.mockRejectedValue(
      new Error('No rates'),
    );
    const result = await service.listTransactions('user-1', {
      reportingCurrency: 'USD',
    });
    expect(result.data[0].convertedAmount.amount).toBe('0');
    expect(currencyConversionService.getResolvedRates).not.toHaveBeenCalled();
    expect(result.conversion.rates).toEqual([]);
  });

  it('rejects cursor reuse after ownership, filter or reporting currency changes', async () => {
    const rows = [0, 1].map((index) => {
      const row = buildTransaction({
        categoryPrimary: null,
        categoryDetailed: null,
      });
      row.id = `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      return row;
    });
    queryBuilder.getMany.mockResolvedValue(rows);
    const options = { reportingCurrency: 'USD', pageSize: 1 };
    const first = await service.listTransactions('user-1', options);
    const cursor = first.pageInfo.nextCursor!;
    for (const changed of [
      { reportingCurrency: 'EUR' },
      { accountIds: ['account-1'] },
      { amountFilter: { currency: 'USD', min: '1' } },
      { includePending: true },
      { merchantQuery: 'coffee' },
    ]) {
      await expect(
        service.listTransactions('user-1', { ...options, ...changed, cursor }),
      ).rejects.toThrow('cursor');
    }
    await expect(
      service.listTransactions('another-user', { ...options, cursor }),
    ).rejects.toThrow('cursor');
    const body = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    body.activityDate = '2026-02-30';
    await expect(
      service.listTransactions('user-1', {
        ...options,
        cursor: Buffer.from(JSON.stringify(body)).toString('base64url'),
      }),
    ).rejects.toThrow('cursor');
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
    const holdings = [
      buildInvestmentHolding({
        id: 'holding-1',
        accountId: 'investment-account',
        snapshotDate: '2026-05-20',
        institutionValue: '123.45',
      }),
    ];
    const account = {
      id: 'investment-account',
      name: 'Brokerage',
      customName: null,
      type: 'investment',
      subType: 'brokerage',
    };
    holdingsQueries.read.mockResolvedValue([
      {
        account: { ...account, toObject: () => account },
        snapshot: { snapshotDate: '2026-05-20', holdings },
      },
    ]);
    const result = await service.listInvestmentHoldings('user-1', {});
    expect(holdingsQueries.read).toHaveBeenCalledWith(
      'user-1',
      {
        accountIds: undefined,
        snapshotDate: undefined,
      },
      undefined,
    );
    expect(result.snapshots).toEqual([
      {
        accountId: 'investment-account',
        snapshotDate: '2026-05-20',
        holdingCount: 1,
      },
    ]);
    expect(result.data[0]).toMatchObject({
      id: 'holding-1',
      accountId: 'investment-account',
      accountName: 'Brokerage',
      institutionValue: {
        amount: '123.45',
        currency: 'USD',
        sign: MoneySign.POSITIVE,
      },
    });
  });

  it('rejects unowned investment account IDs before reading holdings', async () => {
    const ownedAccountId = '11111111-1111-4111-8111-111111111111';
    const foreignAccountId = '99999999-9999-4999-8999-999999999999';
    holdingsQueries.read.mockRejectedValueOnce(
      new Error(`Unknown accountIds: ${foreignAccountId}`),
    );
    await expect(
      service.listInvestmentHoldings('user-1', {
        accountIds: [ownedAccountId, foreignAccountId],
        latestOnly: true,
      }),
    ).rejects.toThrow(`Unknown accountIds: ${foreignAccountId}`);

    expect(holdingsQueries.read).toHaveBeenCalledTimes(1);
    expect(currencyConversionService.getResolvedRates).not.toHaveBeenCalled();
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
        amount: '42',
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
        money: { amount: '1200', currency: 'USD' },
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
          money: { amount: '4200', currency: 'USD' },
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
