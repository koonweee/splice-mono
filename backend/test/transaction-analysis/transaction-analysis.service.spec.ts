import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { CashflowAnalysisSurfaceService } from '../../src/transaction-analysis/cashflow-analysis-surface.service';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import { MoneySign, getDecimalPlaces } from '../../src/types/MoneyWithSign';

const mockUserId = 'user-uuid-123';

/**
 * Real conversion logic (mirrors CurrencyConversionService.convertAmount)
 * so mock behaves identically to production code.
 */
function realConvertAmount(
  amount: number,
  sourceCurrency: string,
  targetCurrency: string,
  rate: number,
): number {
  const sourceDecimals = getDecimalPlaces(sourceCurrency);
  const targetDecimals = getDecimalPlaces(targetCurrency);
  const majorUnits = amount / Math.pow(10, sourceDecimals);
  return Math.round(majorUnits * rate * Math.pow(10, targetDecimals));
}

function buildTransaction(params: {
  id: string;
  amount: number;
  sign: MoneySign;
  accountId?: string;
  currency?: string;
  date: string;
  pending?: boolean;
  primary?: string | null;
  detailed?: string | null;
  accountName?: string | null;
  accountCustomName?: string | null;
}): TransactionEntity {
  const entity = TransactionEntity.fromDto(
    {
      amount: {
        money: {
          amount: params.amount,
          currency: params.currency ?? 'USD',
        },
        sign: params.sign,
      },
      accountId: params.accountId ?? 'account-1',
      pending: params.pending ?? false,
      date: params.date,
    },
    mockUserId,
  );

  entity.id = params.id;
  entity.account = {
    id: entity.accountId,
    name: params.accountName ?? 'Checking',
    customName: params.accountCustomName ?? null,
    toObject() {
      return {
        id: entity.accountId,
        userId: mockUserId,
        name: params.accountName ?? 'Checking',
        customName: params.accountCustomName ?? null,
        mask: null,
        availableBalance: {
          money: {
            amount: 0,
            currency: params.currency ?? 'USD',
          },
          sign: MoneySign.POSITIVE,
        },
        currentBalance: {
          money: {
            amount: 0,
            currency: params.currency ?? 'USD',
          },
          sign: MoneySign.POSITIVE,
        },
        type: 'depository',
        subType: null,
        externalAccountId: null,
        bankLinkId: null,
        bankLink: null,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      };
    },
  } as AccountEntity;
  entity.category = params.primary
    ? ({
        id: `cat-${params.primary}`,
        primary: params.primary,
        detailed: params.detailed ?? `${params.primary}_DETAIL`,
        description: `${params.primary} category`,
        toObject() {
          return {
            id: `cat-${params.primary}`,
            primary: params.primary as string,
            detailed: params.detailed ?? `${params.primary}_DETAIL`,
            description: `${params.primary} category`,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
          };
        },
      } as CategoryEntity)
    : null;

  return entity;
}

function buildAccount(params: {
  id: string;
  accountName?: string;
  accountCustomName?: string | null;
  type?: string;
}): AccountEntity {
  const entity = AccountEntity.fromDto(
    {
      name: params.accountName ?? 'Checking',
      customName: params.accountCustomName ?? null,
      mask: null,
      type: (params.type ?? 'depository') as string,
      subType: null,
      externalAccountId: null,
      bankLinkId: null,
      availableBalance: {
        money: {
          amount: 0,
          currency: 'USD',
        },
        sign: MoneySign.POSITIVE,
      },
      currentBalance: {
        money: {
          amount: 0,
          currency: 'USD',
        },
        sign: MoneySign.POSITIVE,
      },
    },
    mockUserId,
  );

  entity.id = params.id;

  return entity;
}

function buildBalanceSnapshot(params: {
  accountId: string;
  snapshotDate: string;
  amount: number;
  sign?: MoneySign;
  currency?: string;
}): BalanceSnapshotEntity {
  const currency = params.currency ?? 'USD';
  const sign = params.sign ?? MoneySign.POSITIVE;

  const snapshot = BalanceSnapshotEntity.fromDto(
    {
      accountId: params.accountId,
      snapshotDate: params.snapshotDate,
      snapshotType: BalanceSnapshotType.SYNC,
      currentBalance: {
        money: {
          amount: params.amount,
          currency,
        },
        sign,
      },
      availableBalance: {
        money: {
          amount: params.amount,
          currency,
        },
        sign,
      },
    },
    mockUserId,
  );

  snapshot.id = `${params.accountId}-${params.snapshotDate}`;

  return snapshot;
}

function buildSnapshotQueryBuilder(rows: BalanceSnapshotEntity[]) {
  let snapshotDateFilter: string | null = null;

  const snapshotRows = (asOfDate: string | null): BalanceSnapshotEntity[] => {
    if (!asOfDate) {
      return [...rows];
    }

    return [...rows].filter((row) => row.snapshotDate <= asOfDate);
  };

  const queryBuilder = {
    where: jest.fn(
      (_clause: string, params: { snapshotDate?: string; asOfDate?: string } = {}) => {
        if (params.snapshotDate) {
          snapshotDateFilter = params.snapshotDate;
        }
        if (params.asOfDate) {
          snapshotDateFilter = params.asOfDate;
        }
        return queryBuilder;
      },
    ),
    andWhere: jest.fn(
      (_clause: string, params: { snapshotDate?: string; asOfDate?: string; date?: string } = {}) => {
        if (params.snapshotDate) {
          snapshotDateFilter = params.snapshotDate;
        }
        if (params.asOfDate) {
          snapshotDateFilter = params.asOfDate;
        }
        if (params.date) {
          snapshotDateFilter = params.date;
        }
        return queryBuilder;
      },
    ),
    orWhere: jest.fn(
      (_clause: string, params: { snapshotDate?: string; asOfDate?: string; date?: string } = {}) => {
        if (params.snapshotDate) {
          snapshotDateFilter = params.snapshotDate;
        }
        if (params.asOfDate) {
          snapshotDateFilter = params.asOfDate;
        }
        if (params.date) {
          snapshotDateFilter = params.date;
        }
        return queryBuilder;
      },
    ),
    orderBy: jest.fn(() => queryBuilder),
    addOrderBy: jest.fn(() => queryBuilder),
    select: jest.fn(() => queryBuilder),
    addSelect: jest.fn(() => queryBuilder),
    leftJoinAndSelect: jest.fn(() => queryBuilder),
    innerJoinAndSelect: jest.fn(() => queryBuilder),
    groupBy: jest.fn(() => queryBuilder),
    addGroupBy: jest.fn(() => queryBuilder),
    having: jest.fn(() => queryBuilder),
    getMany: jest.fn(() => Promise.resolve(snapshotRows(snapshotDateFilter))),
    getRawMany: jest.fn(() => Promise.resolve(snapshotRows(snapshotDateFilter))),
    getOne: jest.fn(() => {
      const filtered = snapshotRows(snapshotDateFilter);
      return Promise.resolve(filtered[filtered.length - 1]);
    }),
    setParameters: jest.fn(() => queryBuilder),
    andWhereExists: jest.fn(() => queryBuilder),
    leftJoin: jest.fn(() => queryBuilder),
    innerJoin: jest.fn(() => queryBuilder),
    distinctOn: jest.fn(() => queryBuilder),
    addOrderByDirection: jest.fn(() => queryBuilder),
    limit: jest.fn(() => queryBuilder),
    take: jest.fn(() => queryBuilder),
  };

  return queryBuilder;
}

describe('TransactionAnalysisService', () => {
  let service: TransactionAnalysisService;
  let mockTransactionRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockAccountRepository: {
    find: jest.Mock;
  };
  let mockBalanceSnapshotRepository: {
    createQueryBuilder: jest.Mock;
  };
  let mockCurrencyConversionService: {
    getPreferredCurrency: jest.Mock;
    getRateMap: jest.Mock;
    convertAmount: jest.Mock;
  };

  beforeEach(async () => {
    mockTransactionRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => {
        throw new Error(
          'TransactionAnalysisService must load raw posted transactions instead of using the SQL aggregate path',
        );
      }),
    };
    mockAccountRepository = {
      find: jest.fn(),
    };
    mockBalanceSnapshotRepository = {
      createQueryBuilder: jest.fn(() => buildSnapshotQueryBuilder([])),
    };
    mockCurrencyConversionService = {
      getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
      getRateMap: jest.fn().mockResolvedValue(new Map([['EUR', 1.1]])),
      convertAmount: jest.fn().mockImplementation(realConvertAmount),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionAnalysisService,
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockBalanceSnapshotRepository,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
      ],
    }).compile();

    service = module.get<TransactionAnalysisService>(
      TransactionAnalysisService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAnalysis', () => {
    it('excludes pending transactions from analysis entirely', async () => {
      mockTransactionRepository.find.mockResolvedValue([]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });

      expect(mockTransactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
            date: expect.anything(),
          }),
          relations: ['account', 'category'],
        }),
      );
    });

    it('cancels exact equal and opposite posted transactions in the same currency', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'expense',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'mirror-income',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          date: '2024-01-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('matches each negative to the nearest positive after deterministic negative ordering', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-near',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-far',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-01',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-14',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 6000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 6000,
            transactionCount: 1,
          }),
        ],
      });
    });

    it('sorts negative candidates by date then id before matching', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-late',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-early-b',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-10',
          primary: 'GENERAL_SERVICES',
        }),
        buildTransaction({
          id: 'neg-early-a',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-10',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos-early',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 12000,
        outflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'GENERAL_SERVICES',
            totalAmount: 6000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 6000,
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('does not cancel across different currencies', async () => {
      const usdExpense = buildTransaction({
        id: 'usd-expense',
        amount: 10000,
        sign: MoneySign.NEGATIVE,
        currency: 'USD',
        date: '2024-01-10',
        primary: 'GENERAL_SERVICES',
      });
      const eurIncome = buildTransaction({
        id: 'eur-income',
        amount: 10000,
        sign: MoneySign.POSITIVE,
        currency: 'EUR',
        date: '2024-01-10',
        primary: 'INCOME',
      });

      mockTransactionRepository.find.mockResolvedValue([
        usdExpense,
        eurIncome,
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.totalInflow).toBe(11000);
      expect(result.totalOutflow).toBe(10000);
      expect(result.netFlow).toBe(1000);
      expect(result.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 11000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_SERVICES',
          totalAmount: 10000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);

      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        ['EUR'],
        'USD',
        '2024-01-31',
      );
    });

    it('does not cancel transactions that fall in different analysis windows', async () => {
      const februaryExpense = buildTransaction({
        id: 'feb-expense',
        amount: 9000,
        sign: MoneySign.NEGATIVE,
        date: '2024-02-29',
        primary: 'GENERAL_SERVICES',
      });
      const marchIncome = buildTransaction({
        id: 'march-income',
        amount: 9000,
        sign: MoneySign.POSITIVE,
        date: '2024-03-01',
        primary: 'INCOME',
      });

      mockTransactionRepository.find
        .mockResolvedValueOnce([februaryExpense])
        .mockResolvedValueOnce([marchIncome]);

      const februaryResult = await service.getAnalysis(
        '2024-02-01',
        '2024-02-29',
        mockUserId,
      );
      const marchResult = await service.getAnalysis(
        '2024-03-01',
        '2024-03-31',
        mockUserId,
      );

      expect(februaryResult.totalOutflow).toBe(9000);
      expect(februaryResult.totalInflow).toBe(0);
      expect(februaryResult.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_SERVICES',
          totalAmount: 9000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(februaryResult.inflows).toEqual([]);

      expect(marchResult.totalInflow).toBe(9000);
      expect(marchResult.totalOutflow).toBe(0);
      expect(marchResult.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 9000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(marchResult.outflows).toEqual([]);

      expect(mockTransactionRepository.find).toHaveBeenCalledTimes(2);
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
          }),
          relations: ['account', 'category'],
        }),
      );
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
          }),
          relations: ['account', 'category'],
        }),
      );
    });

    it('neutralizes a production-shaped mirrored pair even when categories disagree', async () => {
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
      ]);

      await expect(
        service.getAnalysis('2026-02-01', '2026-02-28', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('keeps unmatched posted transactions in formerly excluded categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'unmatched-transfer-in',
          amount: 25000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-06',
          primary: 'TRANSFER_IN',
          detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-transfer-out',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-07',
          primary: 'TRANSFER_OUT',
          detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-loan-payment',
          amount: 45000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-08',
          primary: 'LOAN_PAYMENTS',
          detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 25000,
        totalOutflow: 195000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'TRANSFER_IN',
            totalAmount: 25000,
            transactionCount: 1,
          }),
        ],
        outflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'TRANSFER_OUT',
            totalAmount: 150000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'LOAN_PAYMENTS',
            totalAmount: 45000,
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('still aggregates unmatched posted transactions into their categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'paycheck',
          amount: 300000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-05',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'rent',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-07',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'groceries',
          amount: 50000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-08',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 300000,
        totalOutflow: 200000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 300000,
            transactionCount: 1,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'RENT_AND_UTILITIES',
            totalAmount: 150000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 50000,
            transactionCount: 1,
          }),
        ],
      });
    });

    it('adds an inflow BALANCE_ADJUSTMENT when no posted transactions exist and snapshots indicate growth', async () => {
      const checking = buildAccount({
        id: 'acct-inflow',
        accountName: 'Checking',
        accountCustomName: 'Primary Checking',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2024-01-01',
        amount: 10000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-inflow',
        snapshotDate: '2024-01-31',
        amount: 17500,
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([checking]);
      mockBalanceSnapshotRepository.createQueryBuilder.mockReturnValue(
        buildSnapshotQueryBuilder([startSnapshot, endSnapshot]),
      );

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 7500,
        totalOutflow: 0,
        netFlow: 7500,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-inflow',
            accountName: 'Primary Checking',
            flowDirection: 'inflow',
            currency: 'USD',
            deltaAmount: 7500,
          }),
        ],
        inflows: [
          expect.objectContaining({
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 7500,
            currency: 'USD',
            transactionCount: 1,
          }),
        ],
        uncategorizedInflow: 0,
        uncategorizedOutflow: 0,
      });
    });

    it('adds an outflow BALANCE_ADJUSTMENT when no posted transactions exist and snapshots indicate decline', async () => {
      const savings = buildAccount({
        id: 'acct-outflow',
        accountName: 'Savings',
        accountCustomName: 'High Yield Savings',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2024-01-01',
        amount: 12000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-outflow',
        snapshotDate: '2024-01-31',
        amount: 3000,
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([savings]);
      mockBalanceSnapshotRepository.createQueryBuilder.mockReturnValue(
        buildSnapshotQueryBuilder([startSnapshot, endSnapshot]),
      );

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 9000,
        netFlow: -9000,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-outflow',
            accountName: 'High Yield Savings',
            flowDirection: 'outflow',
            currency: 'USD',
            deltaAmount: 9000,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 9000,
            currency: 'USD',
            transactionCount: 1,
          }),
        ],
        uncategorizedInflow: 0,
        uncategorizedOutflow: 0,
      });
    });

    it('does not create synthetic adjustments for accounts with in-range posted transactions', async () => {
      const accountWithPosted = buildAccount({
        id: 'acct-posted-excluded',
        accountName: 'Checking',
        accountCustomName: 'Checking with activity',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-posted-excluded',
        snapshotDate: '2024-01-01',
        amount: 3000,
      });
      const endSnapshot = buildBalanceSnapshot({
        accountId: 'acct-posted-excluded',
        snapshotDate: '2024-01-31',
        amount: 4500,
      });

      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'posted-adjustment-offset',
          amount: 1000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-15',
          accountId: 'acct-posted-excluded',
          primary: 'INCOME',
        }),
      ]);
      mockAccountRepository.find.mockResolvedValue([accountWithPosted]);
      mockBalanceSnapshotRepository.createQueryBuilder.mockReturnValue(
        buildSnapshotQueryBuilder([startSnapshot, endSnapshot]),
      );

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 1000,
        totalOutflow: 0,
        balanceAdjustments: [],
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 1000,
            currency: 'USD',
            transactionCount: 1,
          }),
        ],
      });
    });

    it('skips accounts that do not have both boundary snapshots for synthetic adjustment generation', async () => {
      const checking = buildAccount({
        id: 'acct-missing-boundary',
        accountName: 'Checking',
      });
      const startSnapshot = buildBalanceSnapshot({
        accountId: 'acct-missing-boundary',
        snapshotDate: '2024-01-01',
        amount: 2000,
      });

      mockTransactionRepository.find.mockResolvedValue([]);
      mockAccountRepository.find.mockResolvedValue([checking]);
      mockBalanceSnapshotRepository.createQueryBuilder
        .mockReturnValueOnce(buildSnapshotQueryBuilder([startSnapshot]))
        .mockReturnValueOnce(buildSnapshotQueryBuilder([]));

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
        balanceAdjustments: [],
        inflows: [],
        outflows: [],
      });
    });

    it('keeps synthetic adjustments out of uncategorized totals', async () => {
      const accountWithPosted = buildAccount({
        id: 'acct-with-posted',
        accountName: 'Everyday',
      });
      const adjustmentAccount = buildAccount({
        id: 'acct-adjust-only',
        accountName: 'Investment',
        accountCustomName: 'Growth Bucket',
      });
      const adjustmentStart = buildBalanceSnapshot({
        accountId: 'acct-adjust-only',
        snapshotDate: '2024-01-01',
        amount: 1000,
      });
      const adjustmentEnd = buildBalanceSnapshot({
        accountId: 'acct-adjust-only',
        snapshotDate: '2024-01-31',
        amount: 2500,
      });

      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'uncategorized-receipt',
          amount: 700,
          sign: MoneySign.POSITIVE,
          date: '2024-01-10',
          accountId: 'acct-with-posted',
        }),
      ]);
      mockAccountRepository.find.mockResolvedValue([
        accountWithPosted,
        adjustmentAccount,
      ]);
      mockBalanceSnapshotRepository.createQueryBuilder.mockReturnValue(
        buildSnapshotQueryBuilder([adjustmentStart, adjustmentEnd]),
      );

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 2200,
        totalOutflow: 0,
        uncategorizedInflow: 700,
        uncategorizedOutflow: 0,
        balanceAdjustments: [
          expect.objectContaining({
            accountId: 'acct-adjust-only',
            accountName: 'Growth Bucket',
            flowDirection: 'inflow',
            currency: 'USD',
            deltaAmount: 1500,
          }),
        ],
        inflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'UNCATEGORIZED',
            totalAmount: 700,
            currency: 'USD',
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 1500,
            currency: 'USD',
            transactionCount: 1,
          }),
        ]),
      });
    });
  });

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

      expect(result.map((transaction) => transaction.id)).toEqual(['interest']);
    });

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

      expect(result.map((transaction) => transaction.id)).toEqual([
        'real-loan-payment',
      ]);
    });

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

      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.1]]),
      );

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

    it('returns drilldown rows sorted by date descending then id descending', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'older-id',
          amount: 1000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'newer-id',
          amount: 2000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-12',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'same-day-b',
          amount: 3000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'FOOD_AND_DRINK',
        'outflow',
        mockUserId,
      );

      expect(result.map((transaction) => transaction.id)).toEqual([
        'newer-id',
        'same-day-b',
        'older-id',
      ]);
    });

    it('preserves accountName from the loaded account relation in drilldown rows', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'paycheck',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-10',
          primary: 'INCOME',
          accountName: 'Payroll Checking',
          accountCustomName: 'Main Checking',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'INCOME',
        'inflow',
        mockUserId,
      );

      expect(mockTransactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['account', 'category'],
        }),
      );
      expect(result[0]?.accountName).toBe('Main Checking');
    });
  });
});

describe('CashflowAnalysisSurfaceService', () => {
  it('wraps supported ask-style options in model-friendly major-unit totals and semantic metadata', async () => {
    const mockTransactionAnalysisService = {
      getAnalysis: jest.fn().mockResolvedValue({
        currency: 'USD',
        totalInflow: 15000,
        totalOutflow: 4000,
        netFlow: 11000,
        inflows: [
          {
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 12500,
            currency: 'USD',
            transactionCount: 2,
          },
          {
            primaryCategory: 'INCOME',
            totalAmount: 2500,
            currency: 'USD',
            transactionCount: 1,
          },
        ],
        outflows: [
          {
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 4000,
            currency: 'USD',
            transactionCount: 1,
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashflowAnalysisSurfaceService,
        {
          provide: TransactionAnalysisService,
          useValue: mockTransactionAnalysisService,
        },
      ],
    }).compile();

    const service = module.get<CashflowAnalysisSurfaceService>(
      CashflowAnalysisSurfaceService,
    );

    await expect(
      service.getCashflowAnalysis(mockUserId, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      }),
    ).resolves.toMatchObject({
      matchedCount: 4,
      truncated: false,
      totalInflow: 150,
      totalOutflow: 40,
      netFlow: 110,
      semanticMetadata: {
        pendingIncluded: false,
        reconciliationApplied: true,
        comparisonIncluded: false,
      },
      topCategories: [
        {
          rawLabel: 'FOOD_AND_DRINK',
          label: 'Food And Drink',
          amount: 165,
          currency: 'USD',
          kind: 'category',
        },
        {
          rawLabel: 'INCOME',
          label: 'Income',
          amount: 25,
          currency: 'USD',
          kind: 'category',
        },
      ],
    });

    expect(mockTransactionAnalysisService.getAnalysis).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      mockUserId,
    );
  });
});
