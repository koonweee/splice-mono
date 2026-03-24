import { Test, TestingModule } from '@nestjs/testing'
import { BalanceHistorySurfaceService } from '../../src/balance-query/balance-history-surface.service'
import { BalanceQueryService } from '../../src/balance-query/balance-query.service'
import { MoneySign } from '../../src/types/MoneyWithSign'

const mockUserId = 'user-1'

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
})

const createAccountResult = (
  id: string,
  type: string,
  snapshotDate: string,
  effectiveBalance: ReturnType<typeof createBalance>,
  syncedAt?: string,
) => ({
  account: {
    id,
    userId: mockUserId,
    name: id === 'asset-1' ? 'House Checking' : 'Visa',
    customName: id === 'asset-1' ? 'House Checking' : null,
    type,
    subType: id === 'asset-1' ? 'checking' : 'credit card',
    bankLink: {
      institutionName: id === 'asset-1' ? 'Splice Bank' : 'Splice Card',
    },
  },
  availableBalance: effectiveBalance,
  currentBalance: effectiveBalance,
  effectiveBalance,
  syncedAt: syncedAt ? new Date(syncedAt) : undefined,
})

describe('BalanceHistorySurfaceService', () => {
  let service: BalanceHistorySurfaceService
  const mockBalanceQueryService = {
    getAllBalancesForDateRange: jest.fn(),
    getBalancesForDateRange: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceHistorySurfaceService,
        {
          provide: BalanceQueryService,
          useValue: mockBalanceQueryService,
        },
      ],
    }).compile()

    service = module.get(BalanceHistorySurfaceService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('ports Home-style net worth math, sorting, and change calculation server-side', async () => {
    mockBalanceQueryService.getAllBalancesForDateRange.mockResolvedValue([
      {
        date: '2026-03-01',
        balances: {
          'asset-1': createAccountResult(
            'asset-1',
            'depository',
            '2026-03-01',
            createBalance(10000, 'USD', 12000, 'EUR'),
            '2026-03-01T12:00:00Z',
          ),
          'liability-1': createAccountResult(
            'liability-1',
            'credit',
            '2026-03-01',
            createBalance(2000, 'USD', 2400, 'EUR'),
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
            '2026-03-02',
            createBalance(15000, 'USD', 18000, 'EUR'),
            '2026-03-02T12:00:00Z',
          ),
          'liability-1': createAccountResult(
            'liability-1',
            'credit',
            '2026-03-02',
            createBalance(3000, 'USD', 3600, 'EUR'),
            '2026-03-02T12:00:00Z',
          ),
        },
      },
    ])

    const result = await service.getBalanceHistorySummary(mockUserId, {
      startDate: '2026-03-01',
      endDate: '2026-03-02',
    })

    expect(mockBalanceQueryService.getAllBalancesForDateRange).toHaveBeenCalledWith(
      '2026-03-01',
      '2026-03-02',
      mockUserId,
    )
    expect(result.netWorth).toEqual({
      money: { amount: 14400, currency: 'EUR' },
      sign: MoneySign.POSITIVE,
    })
    expect(result.changePercent).toBe(50)
    expect(result.chartData).toEqual([
      expect.objectContaining({ date: '2026-03-01', value: 96 }),
      expect.objectContaining({ date: '2026-03-02', value: 144 }),
    ])
    expect(result.assets).toHaveLength(1)
    expect(result.assets[0]).toMatchObject({
      id: 'asset-1',
      displayName: 'House Checking',
      type: 'depository',
      groupingLabel: 'Cash',
      changePercent: 50,
      syncedAt: '2026-03-02T12:00:00.000Z',
    })
    expect(result.assets[0].convertedEffectiveBalance).toEqual({
      money: { amount: 18000, currency: 'EUR' },
      sign: MoneySign.POSITIVE,
    })
    expect(result.liabilities).toHaveLength(1)
    expect(result.liabilities[0]).toMatchObject({
      id: 'liability-1',
      displayName: 'Visa',
      type: 'credit',
      groupingLabel: 'Credit',
      changePercent: 50,
    })
  })
})
