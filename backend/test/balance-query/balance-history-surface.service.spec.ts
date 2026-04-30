import { Test, TestingModule } from '@nestjs/testing';
import { BalanceHistorySurfaceService } from '../../src/balance-query/balance-history-surface.service';
import { BalanceQueryService } from '../../src/balance-query/balance-query.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

const mockUserId = 'user-1';

const createBalance = (
  amount: number,
  currency = 'USD',
  convertedAmount?: number,
  convertedCurrency?: string,
) => ({
  balance: {
    money: { amount, currency },
    sign: MoneySign.POSITIVE,
  },
  ...(convertedAmount !== undefined && convertedCurrency
    ? {
        convertedBalance: {
          money: { amount: convertedAmount, currency: convertedCurrency },
          sign: MoneySign.POSITIVE,
        },
      }
    : {}),
});

const createAccountResult = (
  id: string,
  type: string,
  effectiveBalance: ReturnType<typeof createBalance>,
  syncedAt?: string,
) => ({
  account: {
    id,
    userId: mockUserId,
    name:
      id === 'asset-1'
        ? 'House Checking'
        : id === 'asset-2'
          ? 'Retirement'
          : id === 'liability-1'
            ? 'Visa'
            : 'Mortgage',
    customName: id === 'asset-1' ? 'House Checking' : null,
    type,
    subType:
      id === 'asset-1'
        ? 'checking'
        : id === 'asset-2'
          ? '401k'
          : id === 'liability-1'
            ? 'credit card'
            : 'home equity',
    bankLink: {
      institutionName:
        id === 'asset-1'
          ? 'Splice Bank'
          : id === 'asset-2'
            ? 'Splice Retirement'
            : id === 'liability-1'
              ? 'Splice Card'
              : 'Splice Mortgage',
    },
  },
  availableBalance: effectiveBalance,
  currentBalance: effectiveBalance,
  effectiveBalance,
  syncedAt: syncedAt ? new Date(syncedAt) : undefined,
});

describe('BalanceHistorySurfaceService', () => {
  let service: BalanceHistorySurfaceService;
  const mockBalanceQueryService = {
    getAllBalancesForDateRange: jest.fn(),
    getBalancesForDateRange: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceHistorySurfaceService,
        {
          provide: BalanceQueryService,
          useValue: mockBalanceQueryService,
        },
      ],
    }).compile();

    service = module.get(BalanceHistorySurfaceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ports Home-style net worth math, sorting, and change calculation server-side', async () => {
    mockBalanceQueryService.getAllBalancesForDateRange.mockResolvedValue([
      {
        date: '2026-03-01',
        balances: {
          'asset-1': createAccountResult(
            'asset-1',
            'depository',
            createBalance(5000, 'USD', 25000, 'EUR'),
            '2026-03-01T12:00:00Z',
          ),
          'asset-2': createAccountResult(
            'asset-2',
            'investment',
            createBalance(10000, 'USD', 5000, 'EUR'),
            '2026-03-01T12:00:00Z',
          ),
          'liability-1': createAccountResult(
            'liability-1',
            'credit',
            createBalance(1000, 'USD', 1200, 'EUR'),
            '2026-03-01T12:00:00Z',
          ),
          'liability-2': createAccountResult(
            'liability-2',
            'loan',
            createBalance(1500, 'USD', 1800, 'EUR'),
            '2026-03-01T12:00:00Z',
          ),
        },
      },
      {
        date: '2026-03-02',
        balances: {
          'asset-1': createAccountResult(
            'asset-1',
            'depository',
            createBalance(10000, 'USD', 50000, 'EUR'),
            '2026-03-02T12:00:00Z',
          ),
          'asset-2': createAccountResult(
            'asset-2',
            'investment',
            createBalance(20000, 'USD', 10000, 'EUR'),
            '2026-03-02T12:00:00Z',
          ),
          'liability-1': createAccountResult(
            'liability-1',
            'credit',
            createBalance(2000, 'USD', 2400, 'EUR'),
            '2026-03-02T12:00:00Z',
          ),
          'liability-2': createAccountResult(
            'liability-2',
            'loan',
            createBalance(3000, 'USD', 3600, 'EUR'),
            '2026-03-02T12:00:00Z',
          ),
        },
      },
    ]);

    const result = await service.getBalanceHistorySummary(mockUserId, {
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    });

    expect(
      mockBalanceQueryService.getAllBalancesForDateRange,
    ).toHaveBeenCalledWith('2026-03-01', '2026-03-02', mockUserId);
    expect(result.netWorth).toEqual({
      money: { amount: 54000, currency: 'EUR' },
      sign: MoneySign.POSITIVE,
    });
    expect(result.changePercent).toBe(100);
    expect(result.chartData).toEqual([
      expect.objectContaining({ date: '2026-03-01', value: 270 }),
      expect.objectContaining({ date: '2026-03-02', value: 540 }),
    ]);
    expect(result.assets).toHaveLength(2);
    expect(result.assets.map((account) => account.id)).toEqual([
      'asset-2',
      'asset-1',
    ]);
    expect(result.assets[0]).toMatchObject({
      id: 'asset-2',
      displayName: 'Retirement',
      type: 'investment',
      groupingLabel: 'Investment',
      changePercent: 100,
    });
    expect(result.assets[1]).toMatchObject({
      id: 'asset-1',
      displayName: 'House Checking',
      type: 'depository',
      groupingLabel: 'Cash',
      changePercent: 100,
      syncedAt: '2026-03-02T12:00:00.000Z',
    });
    expect(result.assets[0].convertedEffectiveBalance).toEqual({
      money: { amount: 10000, currency: 'EUR' },
      sign: MoneySign.POSITIVE,
    });
    expect(result.liabilities).toHaveLength(2);
    expect(result.liabilities.map((account) => account.id)).toEqual([
      'liability-2',
      'liability-1',
    ]);
    expect(result.liabilities[0]).toMatchObject({
      id: 'liability-2',
      displayName: 'Mortgage',
      type: 'loan',
      grouping: 'liability',
      groupingLabel: 'Liability',
      changePercent: 100,
    });
    expect(result.liabilities[1]).toMatchObject({
      id: 'liability-1',
      displayName: 'Visa',
      type: 'credit',
      grouping: 'credit',
      groupingLabel: 'Credit',
      changePercent: 100,
    });
  });
});
