import { Test, TestingModule } from '@nestjs/testing';
import { AccountsSurfaceService } from '../../src/account/accounts-surface.service';
import { AskQueryService } from '../../src/ask/ask-query.service';
import type {
  AskBalanceHistoryOptions,
  AskCashflowAnalysisOptions,
} from '../../src/ask/ask.types';
import { BalanceHistorySurfaceService } from '../../src/balance-query/balance-history-surface.service';
import { CashflowAnalysisSurfaceService } from '../../src/transaction-analysis/cashflow-analysis-surface.service';
import { TransactionsSurfaceService } from '../../src/transaction/transactions-surface.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

describe('AskQueryService', () => {
  let service: AskQueryService;

  const mockAccountsSurfaceService = {
    getAccountsSnapshot: jest.fn(),
  };

  const mockBalanceHistorySurfaceService = {
    getBalanceHistorySummary: jest.fn(),
  };

  const mockTransactionsSurfaceService = {
    findForAsk: jest.fn(),
  };

  const mockCashflowAnalysisSurfaceService = {
    getCashflowAnalysis: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AskQueryService,
        {
          provide: AccountsSurfaceService,
          useValue: mockAccountsSurfaceService,
        },
        {
          provide: BalanceHistorySurfaceService,
          useValue: mockBalanceHistorySurfaceService,
        },
        {
          provide: TransactionsSurfaceService,
          useValue: mockTransactionsSurfaceService,
        },
        {
          provide: CashflowAnalysisSurfaceService,
          useValue: mockCashflowAnalysisSurfaceService,
        },
      ],
    }).compile();

    service = module.get<AskQueryService>(AskQueryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates getAccountsSnapshot to the accounts surface', async () => {
    const expected = {
      matchedCount: 1,
      truncated: false,
      accounts: [
        {
          id: 'account-1',
          name: 'Checking',
          displayName: 'House Checking',
          type: 'depository',
          typeLabel: 'Depository',
          subType: null,
          subTypeLabel: null,
          grouping: 'cash',
          groupingLabel: 'Cash',
          institutionName: 'Bank',
          balance: {
            money: { currency: 'USD', amount: 100_000 },
            sign: MoneySign.POSITIVE,
          },
        },
      ],
    };
    mockAccountsSurfaceService.getAccountsSnapshot.mockResolvedValue(expected);

    await expect(service.getAccountsSnapshot('user-1')).resolves.toEqual(
      expected,
    );
    expect(mockAccountsSurfaceService.getAccountsSnapshot).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('delegates searchTransactions to the transactions surface', async () => {
    const expected = {
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
          categoryPrimaryLabel: 'Entertainment',
          amount: {
            money: { currency: 'USD', amount: 1599 },
            sign: MoneySign.NEGATIVE,
          },
        },
      ],
    };
    mockTransactionsSurfaceService.findForAsk.mockResolvedValue(expected);

    await expect(
      service.searchTransactions('user-1', {
        merchantQuery: 'netflix',
        limit: 20,
      }),
    ).resolves.toEqual(expected);
    expect(mockTransactionsSurfaceService.findForAsk).toHaveBeenCalledWith(
      'user-1',
      {
        merchantQuery: 'netflix',
        limit: 20,
      },
    );
  });

  it('delegates getBalanceHistory through the balance-history surface', async () => {
    const options: AskBalanceHistoryOptions = {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
      accountIds: ['account-1'],
    };
    const expected = {
      netWorth: {
        money: { currency: 'USD', amount: 125_000 },
        sign: MoneySign.POSITIVE,
      },
      changePercent: 13.64,
      chartData: [
        {
          date: '2026-03-01',
          label: 'Mar 1',
          value: 110_000,
        },
      ],
      assets: [
        {
          id: 'account-1',
          name: 'Checking',
          displayName: 'House Checking',
          customName: 'House Checking',
          type: 'depository',
          typeLabel: 'Depository',
          subType: null,
          subTypeLabel: null,
          grouping: 'cash',
          groupingLabel: 'Cash',
          effectiveBalance: {
            money: { currency: 'USD', amount: 125_000 },
            sign: MoneySign.POSITIVE,
          },
          institutionName: 'Bank',
        },
      ],
      liabilities: [],
    };
    mockBalanceHistorySurfaceService.getBalanceHistorySummary.mockResolvedValue(
      expected,
    );

    await expect(service.getBalanceHistory('user-1', options)).resolves.toEqual(
      expected,
    );
    expect(
      mockBalanceHistorySurfaceService.getBalanceHistorySummary,
    ).toHaveBeenCalledWith('user-1', options);
  });

  it('delegates getCashflowAnalysis through the cashflow surface', async () => {
    const options: AskCashflowAnalysisOptions = {
      startDate: '2026-03-01',
      endDate: '2026-03-22',
    };
    const expected = {
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
        pendingIncluded: false,
        reconciliationApplied: true,
        comparisonIncluded: false,
      },
      matchedCount: 12,
      truncated: false,
    };
    mockCashflowAnalysisSurfaceService.getCashflowAnalysis.mockResolvedValue(
      expected,
    );

    await expect(
      service.getCashflowAnalysis('user-1', options),
    ).resolves.toEqual(expected);
    expect(
      mockCashflowAnalysisSurfaceService.getCashflowAnalysis,
    ).toHaveBeenCalledWith('user-1', options);
  });
});
