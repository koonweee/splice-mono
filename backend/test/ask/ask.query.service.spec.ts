import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from '../../src/account/account.service';
import { AskQueryService } from '../../src/ask/ask-query.service';
import type {
  AskBalanceHistoryOptions,
  AskBalanceHistoryResult,
  AskCashflowAnalysisOptions,
  AskCashflowAnalysisResult,
} from '../../src/ask/ask.types';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionService } from '../../src/transaction/transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

describe('AskQueryService', () => {
  let service: AskQueryService;

  const mockAccountService = {
    findAll: jest.fn(),
  };

  const mockTransactionService = {
    findForAsk: jest.fn(),
    summarizeForAsk: jest.fn(),
    compareForAsk: jest.fn(),
  };

  const mockCurrencyConversionService = {
    getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AskQueryService,
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
      ],
    }).compile();

    service = module.get<AskQueryService>(AskQueryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns an account snapshot grouped for Ask evidence', async () => {
    mockAccountService.findAll.mockResolvedValue([
      {
        id: 'account-1',
        userId: 'user-1',
        name: 'Checking',
        customName: 'House Checking',
        mask: '1234',
        availableBalance: {
          money: { currency: 'USD', amount: 100_000 },
          sign: MoneySign.POSITIVE,
        },
        currentBalance: {
          money: { currency: 'USD', amount: 100_000 },
          sign: MoneySign.POSITIVE,
        },
        type: 'depository',
        subType: null,
        externalAccountId: null,
        bankLinkId: null,
        bankLink: null,
        createdAt: new Date('2026-03-01T00:00:00Z'),
        updatedAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]);

    const result = await service.getAccountsSnapshot('user-1');

    expect(result).toMatchObject({
      matchedCount: 1,
      truncated: false,
      accounts: [
        {
          id: 'account-1',
          displayName: 'House Checking',
          grouping: 'cash',
        },
      ],
    });
  });

  it('returns capped transaction evidence with matchedCount and truncated', async () => {
    mockTransactionService.findForAsk.mockResolvedValue({
      matchedCount: 24,
      truncated: true,
      transactions: [
        {
          id: 'transaction-1',
          accountId: 'account-1',
          accountName: 'House Checking',
          merchantName: 'Netflix',
          pending: false,
          date: '2026-03-03',
          categoryPrimary: 'ENTERTAINMENT',
          amount: {
            money: { currency: 'USD', amount: 1599 },
            sign: MoneySign.NEGATIVE,
          },
        },
      ],
    });

    const result = await service.searchTransactions('user-1', {
      merchantQuery: 'netflix',
      limit: 20,
    });

    expect(result).toMatchObject({
      matchedCount: 24,
      truncated: true,
      transactions: [
        {
          id: 'transaction-1',
          merchantName: 'Netflix',
        },
      ],
    });
  });

  it('summarizes transactions with category, merchant, and account drivers', async () => {
    mockTransactionService.summarizeForAsk.mockResolvedValue({
      totalInflow: 0,
      totalOutflow: 250,
      net: -250,
      transactionCount: 6,
      topCategories: [
        {
          label: 'FOOD_AND_DRINK',
          amount: 100,
          currency: 'USD',
          kind: 'category',
        },
      ],
      topMerchants: [
        {
          label: "Trader Joe's",
          amount: 85,
          currency: 'USD',
          kind: 'merchant',
        },
      ],
      topAccounts: [
        {
          label: 'House Checking',
          amount: 250,
          currency: 'USD',
          kind: 'account',
        },
      ],
      recurringTransactions: [
        {
          merchantName: 'Netflix',
          cadence: 'monthly',
          amount: 15.99,
        },
      ],
      matchedCount: 6,
      truncated: false,
    });

    const result = await service.summarizeTransactions('user-1', {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
      includePending: false,
    });

    expect(result).toMatchObject({
      totalOutflow: 250,
      topCategories: [
        expect.objectContaining({
          amount: 100,
          currency: 'USD',
        }),
      ],
      topMerchants: [
        expect.objectContaining({
          amount: 85,
          currency: 'USD',
        }),
      ],
      topAccounts: [
        expect.objectContaining({
          amount: 250,
          currency: 'USD',
        }),
      ],
      recurringTransactions: [
        expect.objectContaining({
          merchantName: 'Netflix',
          amount: 15.99,
          currency: 'USD',
        }),
      ],
    });
  });

  it('compares two periods using deterministic aggregate deltas', async () => {
    mockTransactionService.compareForAsk.mockResolvedValue({
      currentTotalOutflow: 400,
      previousTotalOutflow: 320,
      absoluteDelta: 80,
      percentDelta: 25,
      categoryDrivers: [
        {
          label: 'TRAVEL',
          amount: 60,
          currency: 'USD',
          kind: 'category',
        },
      ],
      merchantDrivers: [
        {
          label: 'United',
          amount: 60,
          currency: 'USD',
          kind: 'merchant',
        },
      ],
      accountDrivers: [
        {
          label: 'Amex Gold',
          amount: 80,
          currency: 'USD',
          kind: 'account',
        },
      ],
      matchedCount: 12,
      truncated: false,
    });

    const result = await service.comparePeriods('user-1', {
      currentStartDate: '2026-03-01',
      currentEndDate: '2026-03-22',
      previousStartDate: '2026-02-01',
      previousEndDate: '2026-02-22',
    });

    expect(result).toMatchObject({
      currentTotalOutflow: 400,
      previousTotalOutflow: 320,
      absoluteDelta: 80,
      percentDelta: 25,
      categoryDrivers: [
        expect.objectContaining({
          label: 'TRAVEL',
          amount: 60,
          currency: 'USD',
        }),
      ],
      merchantDrivers: [
        expect.objectContaining({
          label: 'United',
          amount: 60,
          currency: 'USD',
        }),
      ],
      accountDrivers: [
        expect.objectContaining({
          label: 'Amex Gold',
          amount: 80,
          currency: 'USD',
        }),
      ],
    });
  });

  it('delegates getBalanceHistory through the future balance-history surface', async () => {
    const futureBalanceHistorySurfaceService = {
      getBalanceHistorySummary: jest.fn(),
    };
    Object.assign(service as Record<string, unknown>, {
      balanceHistorySurfaceService: futureBalanceHistorySurfaceService,
    });

    const candidate = service as AskQueryService &
      Partial<{
        getBalanceHistory: (
          userId: string,
          options: AskBalanceHistoryOptions,
        ) => Promise<AskBalanceHistoryResult>;
      }>;

    expect(candidate.getBalanceHistory).toEqual(expect.any(Function));
    if (!candidate.getBalanceHistory) {
      return;
    }

    const options: AskBalanceHistoryOptions = {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
      accountIds: ['account-1'],
      interval: 'week',
      comparisonStartDate: '2026-02-01',
      comparisonEndDate: '2026-02-22',
    };
    const expectedResult: AskBalanceHistoryResult = {
      matchedCount: 18,
      truncated: false,
      currentTotal: {
        money: { currency: 'USD', amount: 125_000 },
        sign: MoneySign.POSITIVE,
      },
      previousTotal: {
        money: { currency: 'USD', amount: 110_000 },
        sign: MoneySign.POSITIVE,
      },
      deltaPercent: 13.64,
      pointCount: 30,
      semanticMetadata: {
        pendingIncluded: true,
        reconciliationApplied: true,
        comparisonIncluded: true,
      },
      series: [
        {
          date: '2026-03-01',
          accountId: 'account-1',
          accountName: 'House Checking',
          balance: {
            money: { currency: 'USD', amount: 125_000 },
            sign: MoneySign.POSITIVE,
          },
        },
      ],
    };
    futureBalanceHistorySurfaceService.getBalanceHistorySummary.mockResolvedValue(
      expectedResult,
    );
    const result = await candidate.getBalanceHistory('user-1', options);

    expect(
      futureBalanceHistorySurfaceService.getBalanceHistorySummary,
    ).toHaveBeenCalledWith('user-1', options);
    expect(result).toEqual(expectedResult);
  });

  it('delegates getCashflowAnalysis through the future cashflow surface', async () => {
    const futureCashflowAnalysisSurfaceService = {
      getCashflowAnalysis: jest.fn(),
    };
    Object.assign(service as Record<string, unknown>, {
      cashflowAnalysisSurfaceService: futureCashflowAnalysisSurfaceService,
    });

    const candidate = service as AskQueryService &
      Partial<{
        getCashflowAnalysis: (
          userId: string,
          options: AskCashflowAnalysisOptions,
        ) => Promise<AskCashflowAnalysisResult>;
      }>;

    expect(candidate.getCashflowAnalysis).toEqual(expect.any(Function));
    if (!candidate.getCashflowAnalysis) {
      return;
    }

    const options: AskCashflowAnalysisOptions = {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
      accountIds: ['account-1'],
      comparisonStartDate: '2026-02-01',
      comparisonEndDate: '2026-02-22',
      includePending: true,
    };
    const expectedResult: AskCashflowAnalysisResult = {
      totalInflow: 400,
      totalOutflow: 250,
      netFlow: 150,
      topCategories: [
        {
          label: 'TRAVEL',
          rawLabel: 'TRAVEL',
          amount: 60,
          currency: 'USD',
          kind: 'category',
        },
      ],
      semanticMetadata: {
        pendingIncluded: true,
        reconciliationApplied: true,
        comparisonIncluded: true,
      },
      matchedCount: 12,
      truncated: false,
    };
    futureCashflowAnalysisSurfaceService.getCashflowAnalysis.mockResolvedValue(
      expectedResult,
    );
    const result = await candidate.getCashflowAnalysis('user-1', options);

    expect(
      futureCashflowAnalysisSurfaceService.getCashflowAnalysis,
    ).toHaveBeenCalledWith('user-1', options);
    expect(result).toEqual(expectedResult);
  });
});
