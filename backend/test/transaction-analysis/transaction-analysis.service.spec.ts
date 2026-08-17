import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { AnalysisRuleEntity } from '../../src/analysis-rule/analysis-rule.entity';
import { AnalysisRuleService } from '../../src/analysis-rule/analysis-rule.service';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import { MoneySign, getDecimalPlaces } from '../../src/types/MoneyWithSign';
import type { AnalysisCategoryScope } from '../../src/types/AnalysisRule';
import { UserService } from '../../src/user/user.service';

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
  providerDate: string;
  reportingDateOverride?: string | null;
  pending?: boolean;
  primary?: string | null;
  detailed?: string | null;
  userPrimary?: string | null;
  userDetailed?: string | null;
  categoryColor?: string;
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
      providerDate: params.providerDate,
      reportingDateOverride: params.reportingDateOverride ?? null,
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
  const categoryPrimary = params.userPrimary ?? params.primary;
  const categoryDetailed =
    params.userDetailed ?? params.detailed ?? `${categoryPrimary}_DETAIL`;
  entity.category = categoryPrimary
    ? ({
        id: `cat-${categoryPrimary}`,
        primary: categoryPrimary,
        detailed: categoryDetailed,
        description: `${categoryPrimary} category`,
        color: params.categoryColor ?? '#228be6',
        toObject() {
          return {
            id: `cat-${categoryPrimary}`,
            primary: categoryPrimary,
            detailed: categoryDetailed,
            description: `${categoryPrimary} category`,
            color: params.categoryColor ?? '#228be6',
            archivedAt: null,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
          };
        },
      } as CategoryEntity)
    : null;
  entity.categoryId = entity.category?.id ?? null;
  entity.categoryUpdatedAt = params.userPrimary
    ? new Date('2024-01-02T00:00:00Z')
    : null;

  return entity;
}

function mockActivityDateRangeQuery(
  repository: { find: jest.Mock },
  rows: TransactionEntity[],
): void {
  repository.find.mockImplementation(
    (query: {
      where: { providerDate: { startDate: string; endDate: string } };
    }) =>
      Promise.resolve(
        rows.filter((transaction) => {
          const activityDate =
            transaction.reportingDateOverride ??
            transaction.authorizedDate ??
            transaction.providerDate;

          return (
            activityDate >= query.where.providerDate.startDate &&
            activityDate <= query.where.providerDate.endDate
          );
        }),
      ),
  );
}

function mockNeutralizationLookaroundDays(
  userService: { findOne: jest.Mock },
  neutralizationLookaroundDays: number,
): void {
  userService.findOne.mockResolvedValue({
    id: mockUserId,
    settings: {
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      theme: 'splice-dark',
      neutralizationLookaroundDays,
      analysisSankeyEnabled: false,
    },
  });
}

function buildAnalysisRule(params: {
  id: string;
  type: 'exclude' | 'neutralize';
  excludeScope?: AnalysisCategoryScope | null;
  inflowScope?: AnalysisCategoryScope | null;
  outflowScope?: AnalysisCategoryScope | null;
  createdAt?: Date;
}): AnalysisRuleEntity {
  return {
    id: params.id,
    userId: mockUserId,
    name: params.id,
    type: params.type,
    excludeScope: params.excludeScope ?? null,
    inflowScope: params.inflowScope ?? null,
    outflowScope: params.outflowScope ?? null,
    archivedAt: null,
    createdAt: params.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: params.createdAt ?? new Date('2024-01-01T00:00:00Z'),
  } as AnalysisRuleEntity;
}

const broadNeutralizationRule = buildAnalysisRule({
  id: 'broad-neutralization',
  type: 'neutralize',
  inflowScope: { mode: 'all' },
  outflowScope: { mode: 'all' },
});

describe('TransactionAnalysisService', () => {
  let service: TransactionAnalysisService;
  let mockTransactionRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockCurrencyConversionService: {
    getPreferredCurrency: jest.Mock;
    getRateMap: jest.Mock;
    convertAmount: jest.Mock;
  };
  let mockAnalysisRuleService: {
    findActiveForAnalysis: jest.Mock;
    scopeMatchesTransactionCategory: jest.Mock;
    compareNeutralizationRules: jest.Mock;
  };
  let mockUserService: {
    findOne: jest.Mock;
  };

  const buildTransactionQueryBuilder = () => {
    const params: Record<string, unknown> = {};
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn((_query: string, nextParams?: Record<string, unknown>) => {
        Object.assign(params, nextParams);
        return queryBuilder;
      }),
      andWhere: jest.fn(
        (_query: string, nextParams?: Record<string, unknown>) => {
          Object.assign(params, nextParams);
          return queryBuilder;
        },
      ),
      getMany: jest.fn(() =>
        mockTransactionRepository.find({
          where: {
            userId: params.userId,
            providerDate: {
              startDate: params.startDate,
              endDate: params.endDate,
            },
          },
          relations: ['account', 'category'],
        }),
      ),
    };

    return queryBuilder;
  };

  beforeEach(async () => {
    mockTransactionRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => buildTransactionQueryBuilder()),
    };
    mockCurrencyConversionService = {
      getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
      getRateMap: jest.fn().mockResolvedValue(new Map([['EUR', 1.1]])),
      convertAmount: jest.fn().mockImplementation(realConvertAmount),
    };
    const scopeSpecificity = (scope: AnalysisCategoryScope | null) => {
      if (!scope || scope.mode === 'all') {
        return 1_000_000;
      }

      return scope.categoryIds.length + (scope.includeUncategorized ? 1 : 0);
    };
    mockAnalysisRuleService = {
      findActiveForAnalysis: jest
        .fn()
        .mockResolvedValue([broadNeutralizationRule]),
      scopeMatchesTransactionCategory: jest.fn(
        (scope: AnalysisCategoryScope, categoryId: string | null) => {
          if (scope.mode === 'all') {
            return true;
          }
          if (categoryId === null) {
            return scope.includeUncategorized;
          }

          return scope.categoryIds.includes(categoryId);
        },
      ),
      compareNeutralizationRules: jest.fn(
        (left: AnalysisRuleEntity, right: AnalysisRuleEntity) => {
          const scoreComparison =
            scopeSpecificity(left.inflowScope) +
            scopeSpecificity(left.outflowScope) -
            (scopeSpecificity(right.inflowScope) +
              scopeSpecificity(right.outflowScope));
          if (scoreComparison !== 0) {
            return scoreComparison;
          }

          return left.id.localeCompare(right.id);
        },
      ),
    };
    mockUserService = {
      findOne: jest.fn().mockResolvedValue({
        id: mockUserId,
        settings: {
          currency: 'USD',
          timezone: 'UTC',
          hideZeroBalanceAccounts: false,
          theme: 'splice-dark',
          neutralizationLookaroundDays: 60,
          analysisSankeyEnabled: false,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionAnalysisService,
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepository,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
        {
          provide: AnalysisRuleService,
          useValue: mockAnalysisRuleService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
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
    it('logs only safe analysis lifecycle messages', async () => {
      mockTransactionRepository.find.mockResolvedValue([]);
      const logger = (
        service as unknown as {
          logger: { log: (message: string) => void };
        }
      ).logger;
      const logSpy = jest.spyOn(logger, 'log');

      await service.getAnalysis('2026-08-01', '2026-08-17', mockUserId);

      expect(logSpy.mock.calls).toEqual([
        ['Getting transaction analysis'],
        ['Transaction analysis rows loaded'],
      ]);
    });

    it('includes pending transactions in analysis', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'pending-purchase',
          amount: 4200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          pending: true,
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 4200,
        inflows: [],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 4200,
            transactionCount: 1,
          }),
        ],
      });

      expect(mockTransactionRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            providerDate: expect.anything(),
          }),
          relations: ['account', 'category'],
        }),
      );
    });

    it('uses reportingDateOverride for analysis window membership', async () => {
      const rows = [
        buildTransaction({
          id: 'salary',
          amount: 560520,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-04-29',
          reportingDateOverride: '2026-05-01',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'purchase',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-04-30',
          primary: 'FOOD_AND_DRINK',
        }),
      ];
      mockTransactionRepository.find.mockImplementation(
        (query: {
          where: {
            providerDate: { startDate: string; endDate: string };
          };
        }) =>
          Promise.resolve(
            rows.filter((transaction) => {
              const activityDate =
                transaction.reportingDateOverride ??
                transaction.authorizedDate ??
                transaction.providerDate;

              return (
                activityDate >= query.where.providerDate.startDate &&
                activityDate <= query.where.providerDate.endDate
              );
            }),
          ),
      );

      const april = await service.getAnalysis(
        '2026-04-01',
        '2026-04-30',
        mockUserId,
      );
      const may = await service.getAnalysis(
        '2026-05-01',
        '2026-05-31',
        mockUserId,
      );

      expect(april.inflows).toEqual([]);
      expect(april.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'FOOD_AND_DRINK',
          totalAmount: 1200,
        }),
      ]);
      expect(may.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 560520,
        }),
      ]);
      expect(may.outflows).toEqual([]);
    });

    it('cancels exact equal and opposite transactions in the same currency', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'expense',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'mirror-income',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-28',
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

    it('neutralizes pending transactions like settled transactions', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'settled-purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'pending-refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-16',
          pending: true,
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

    it('does not neutralize equal and opposite transactions when no active neutralization rule exists', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([]);
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'expense',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'mirror-income',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 10000,
        totalOutflow: 10000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 10000,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'LOAN_PAYMENTS',
            totalAmount: 10000,
          }),
        ],
      });
    });

    it('applies exclusion rules before aggregation and neutralization', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([
        buildAnalysisRule({
          id: 'exclude-ignore',
          type: 'exclude',
          excludeScope: {
            mode: 'selected',
            categoryIds: ['cat-IGNORE'],
            includeUncategorized: false,
          },
        }),
      ]);
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'ignored',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'IGNORE',
        }),
        buildTransaction({
          id: 'kept',
          amount: 20000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 20000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 20000,
          }),
        ],
      });
    });

    it('runs specific neutralization pools before broader pools', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([
        broadNeutralizationRule,
        buildAnalysisRule({
          id: 'specific-rent-reimbursement',
          type: 'neutralize',
          inflowScope: {
            mode: 'selected',
            categoryIds: ['cat-REIMBURSEMENT'],
            includeUncategorized: false,
          },
          outflowScope: {
            mode: 'selected',
            categoryIds: ['cat-RENT'],
            includeUncategorized: false,
          },
          createdAt: new Date('2024-01-02T00:00:00Z'),
        }),
      ]);
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'rent',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-01',
          primary: 'RENT',
        }),
        buildTransaction({
          id: 'groceries',
          amount: 10000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'rent-reimbursement',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
          primary: 'REIMBURSEMENT',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 10000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 10000,
          }),
        ],
      });
    });

    it('aggregates transactions under the user category override when present', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'overridden',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
          userPrimary: 'GENERAL_MERCHANDISE',
        }),
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_MERCHANDISE',
          totalAmount: 1200,
          transactionCount: 1,
          color: '#228be6',
        }),
      ]);
      expect(
        result.outflows.some(
          (aggregate) => aggregate.primaryCategory === 'FOOD_AND_DRINK',
        ),
      ).toBe(false);
    });

    it('uses the largest contributing category row color for primary aggregates', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'small-travel',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'Travel',
          detailed: 'Taxi',
          categoryColor: '#111111',
        }),
        buildTransaction({
          id: 'large-travel',
          amount: 4800,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-16',
          primary: 'Travel',
          detailed: 'Flights',
          categoryColor: '#eeeeee',
        }),
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'Travel',
          totalAmount: 6000,
          transactionCount: 2,
          color: '#eeeeee',
        }),
      ]);
    });

    it('resolves aggregate colors separately for inflows and outflows', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'large-travel-outflow',
          amount: 9000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'Travel',
          detailed: 'Flights',
          categoryColor: '#cc2222',
        }),
        buildTransaction({
          id: 'small-travel-inflow',
          amount: 1200,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-16',
          primary: 'Travel',
          detailed: 'Reimbursement',
          categoryColor: '#22cc22',
        }),
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'Travel',
          totalAmount: 1200,
          transactionCount: 1,
          color: '#22cc22',
        }),
      ]);
      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'Travel',
          totalAmount: 9000,
          transactionCount: 1,
          color: '#cc2222',
        }),
      ]);
    });

    it('matches each negative to the nearest positive after deterministic negative ordering', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-near',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-far',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-01',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-14',
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
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-early-b',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'GENERAL_SERVICES',
        }),
        buildTransaction({
          id: 'neg-early-a',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos-early',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
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
        providerDate: '2024-01-10',
        primary: 'GENERAL_SERVICES',
      });
      const eurIncome = buildTransaction({
        id: 'eur-income',
        amount: 10000,
        sign: MoneySign.POSITIVE,
        currency: 'EUR',
        providerDate: '2024-01-10',
        primary: 'INCOME',
      });

      mockTransactionRepository.find.mockResolvedValue([usdExpense, eurIncome]);

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

    it('does not aggregate a foreign amount without its conversion rate', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'eur-income',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          currency: 'EUR',
          providerDate: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);
      mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).rejects.toThrow('Required exchange rate is unavailable for EUR to USD');
    });

    it('does not require an exchange rate for a foreign zero amount', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'eur-zero',
          amount: 0,
          sign: MoneySign.POSITIVE,
          currency: 'EUR',
          providerDate: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);
      mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        netFlow: 0,
      });
      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        [],
        'USD',
        '2024-01-31',
      );
    });

    it('does not cancel transactions that fall in different analysis windows', async () => {
      const februaryExpense = buildTransaction({
        id: 'feb-expense',
        amount: 9000,
        sign: MoneySign.NEGATIVE,
        providerDate: '2024-02-29',
        primary: 'GENERAL_SERVICES',
      });
      const marchIncome = buildTransaction({
        id: 'march-income',
        amount: 9000,
        sign: MoneySign.POSITIVE,
        providerDate: '2024-03-01',
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
          }),
          relations: ['account', 'category'],
        }),
      );
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
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
          providerDate: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
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

    it('uses lookaround candidates while reporting only selected-range rows', async () => {
      const rows = [
        buildTransaction({
          id: 'purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-02-03',
          primary: 'INCOME',
        }),
      ];
      mockActivityDateRangeQuery(mockTransactionRepository, rows);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('does not use out-of-range candidates when lookaround is zero', async () => {
      mockNeutralizationLookaroundDays(mockUserService, 0);
      const rows = [
        buildTransaction({
          id: 'purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-02-03',
          primary: 'INCOME',
        }),
      ];
      mockActivityDateRangeQuery(mockTransactionRepository, rows);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 5000,
        inflows: [],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 5000,
          }),
        ],
      });
    });

    it('does not neutralize an outflow with an earlier inflow', async () => {
      const rows = [
        buildTransaction({
          id: 'refund-first',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2023-12-28',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'purchase-later',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-05',
          primary: 'FOOD_AND_DRINK',
        }),
      ];
      mockActivityDateRangeQuery(mockTransactionRepository, rows);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 5000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 5000,
          }),
        ],
      });
    });

    it('matches each side once and chooses the closest earlier outflow', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'older-purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-01',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'closer-purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-09',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-10',
          primary: 'INCOME',
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
        'older-purchase',
      ]);
    });

    it('keeps unmatched transactions in formerly excluded categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'unmatched-transfer-in',
          amount: 25000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-06',
          primary: 'TRANSFER_IN',
          detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-transfer-out',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-07',
          primary: 'TRANSFER_OUT',
          detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-loan-payment',
          amount: 45000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-08',
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

    it('still aggregates unmatched transactions into their categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'paycheck',
          amount: 300000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-05',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'rent',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-07',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'groceries',
          amount: 50000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-08',
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
  });

  describe('getAnalysisAudit', () => {
    it('returns in-range exclusion rows and neutralized pairs affecting the selected range', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([
        buildAnalysisRule({
          id: 'exclude-ignore',
          type: 'exclude',
          excludeScope: {
            mode: 'selected',
            categoryIds: ['cat-IGNORE'],
            includeUncategorized: false,
          },
        }),
        broadNeutralizationRule,
      ]);
      const rows = [
        buildTransaction({
          id: 'out-of-range-ignored',
          amount: 1000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-03',
          primary: 'IGNORE',
        }),
        buildTransaction({
          id: 'ignored',
          amount: 1000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-12',
          primary: 'IGNORE',
        }),
        buildTransaction({
          id: 'outside-outflow',
          amount: 2500,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-04',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'outside-inflow',
          amount: 2500,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-05',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-02-03',
          primary: 'INCOME',
        }),
      ];
      mockActivityDateRangeQuery(mockTransactionRepository, rows);

      const result = await service.getAnalysisAudit(
        '2024-01-10',
        '2024-01-20',
        mockUserId,
      );

      expect(result).toMatchObject({
        startDate: '2024-01-10',
        endDate: '2024-01-20',
        neutralizationLookaroundDays: 60,
      });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({
        id: 'excluded:exclude-ignore:ignored',
        type: 'excluded',
        groupKey: 'exclude:exclude-ignore',
        groupLabel: 'Excluded by "exclude-ignore"',
        transaction: {
          id: 'ignored',
          activityDate: '2024-01-12',
          accountName: 'Checking',
          categoryPrimary: 'IGNORE',
          amount: {
            amount: 1000,
            currency: 'USD',
            sign: 'negative',
          },
        },
      });
      expect(result.rows[1]).toMatchObject({
        id: 'neutralized:broad-neutralization:purchase:refund',
        type: 'neutralized',
        groupKey: 'neutralize:broad-neutralization',
        groupLabel: 'Neutralized by "broad-neutralization"',
        outflow: {
          id: 'purchase',
          activityDate: '2024-01-15',
        },
        inflow: {
          id: 'refund',
          activityDate: '2024-02-03',
        },
      });
    });

    it('keeps excluded candidates out of neutralization', async () => {
      mockAnalysisRuleService.findActiveForAnalysis.mockResolvedValueOnce([
        buildAnalysisRule({
          id: 'exclude-income',
          type: 'exclude',
          excludeScope: {
            mode: 'selected',
            categoryIds: ['cat-INCOME'],
            includeUncategorized: false,
          },
        }),
        broadNeutralizationRule,
      ]);
      const rows = [
        buildTransaction({
          id: 'purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'excluded-refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-01-16',
          primary: 'INCOME',
        }),
      ];
      mockTransactionRepository.find.mockResolvedValue(rows);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.totalOutflow).toBe(5000);
      expect(result.totalInflow).toBe(0);
    });
  });

  describe('getCategoryTransactions', () => {
    it('includes pending transactions in category drilldowns', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'pending-purchase',
          amount: 4200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          pending: true,
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

      expect(result).toMatchObject([
        {
          id: 'pending-purchase',
          pending: true,
        },
      ]);
    });

    it('uses lookaround neutralization before category drilldown filtering', async () => {
      const rows = [
        buildTransaction({
          id: 'purchase',
          amount: 5000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-28',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'refund',
          amount: 5000,
          sign: MoneySign.POSITIVE,
          providerDate: '2024-02-03',
          primary: 'INCOME',
        }),
      ];
      mockActivityDateRangeQuery(mockTransactionRepository, rows);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'FOOD_AND_DRINK',
        'outflow',
        mockUserId,
      );

      expect(result).toEqual([]);
    });

    it('returns only unmatched positive transactions for an inflow category', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'bilt-negative',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'interest',
          amount: 4083,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
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

    it('filters drilldown rows by effective category override', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'overridden',
          amount: 1200,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
          userPrimary: 'GENERAL_MERCHANDISE',
        }),
      ]);

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'GENERAL_MERCHANDISE',
        'outflow',
        mockUserId,
      );

      expect(result.map((transaction) => transaction.id)).toEqual([
        'overridden',
      ]);
      expect(result[0].category?.primary).toBe('GENERAL_MERCHANDISE');
    });

    it('removes matched Bilt mirror rows from the LOAN_PAYMENTS outflow drilldown', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'bilt-negative',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
          detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          providerDate: '2026-02-28',
          primary: 'INCOME',
          detailed: 'INCOME_OTHER_INCOME',
        }),
        buildTransaction({
          id: 'real-loan-payment',
          amount: 1887,
          sign: MoneySign.NEGATIVE,
          providerDate: '2026-02-19',
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
          providerDate: '2024-01-10',
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

    it('does not return an unconverted foreign drilldown row', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'eur-income',
          amount: 10000,
          sign: MoneySign.POSITIVE,
          currency: 'EUR',
          providerDate: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);
      mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());

      await expect(
        service.getCategoryTransactions(
          '2024-01-01',
          '2024-01-31',
          'INCOME',
          'inflow',
          mockUserId,
        ),
      ).rejects.toThrow('Required exchange rate is unavailable for EUR to USD');
    });

    it('returns a foreign zero drilldown row without requiring a rate', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'eur-zero',
          amount: 0,
          sign: MoneySign.POSITIVE,
          currency: 'EUR',
          providerDate: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);
      mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());

      const result = await service.getCategoryTransactions(
        '2024-01-01',
        '2024-01-31',
        'INCOME',
        'inflow',
        mockUserId,
      );

      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        [],
        'USD',
        '2024-01-31',
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.convertedAmount).toEqual({
        money: { amount: 0, currency: 'USD' },
        sign: MoneySign.POSITIVE,
      });
    });

    it('returns drilldown rows sorted by date descending then id descending', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'older-id',
          amount: 1000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'newer-id',
          amount: 2000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-12',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'same-day-b',
          amount: 3000,
          sign: MoneySign.NEGATIVE,
          providerDate: '2024-01-10',
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
          providerDate: '2024-01-10',
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
