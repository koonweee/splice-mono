import { Test, TestingModule } from '@nestjs/testing';
import { AccountService } from '../../src/account/account.service';
import { AskQueryService } from '../../src/ask/ask-query.service';
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
      totalOutflow: 25_000,
      net: -25_000,
      transactionCount: 6,
      topCategories: [{ label: 'FOOD_AND_DRINK', amount: 10_000 }],
      topMerchants: [{ label: 'Trader Joe\'s', amount: 8_500 }],
      topAccounts: [{ label: 'House Checking', amount: 25_000 }],
      recurringTransactions: [
        {
          merchantName: 'Netflix',
          cadence: 'monthly',
          amount: 1_599,
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
      totalOutflow: 25_000,
      topCategories: expect.any(Array),
      topMerchants: expect.any(Array),
      topAccounts: expect.any(Array),
      recurringTransactions: expect.any(Array),
    });
  });

  it('compares two periods using deterministic aggregate deltas', async () => {
    mockTransactionService.compareForAsk.mockResolvedValue({
      currentTotalOutflow: 40_000,
      previousTotalOutflow: 32_000,
      absoluteDelta: 8_000,
      percentDelta: 25,
      categoryDrivers: [{ label: 'TRAVEL', amount: 6_000 }],
      merchantDrivers: [{ label: 'United', amount: 6_000 }],
      accountDrivers: [{ label: 'Amex Gold', amount: 8_000 }],
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
      currentTotalOutflow: 40_000,
      previousTotalOutflow: 32_000,
      absoluteDelta: 8_000,
      percentDelta: 25,
      categoryDrivers: expect.any(Array),
      merchantDrivers: expect.any(Array),
      accountDrivers: expect.any(Array),
    });
  });
});
