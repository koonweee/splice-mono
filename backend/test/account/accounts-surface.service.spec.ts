import { Test, TestingModule } from '@nestjs/testing'
import { AccountService } from '../../src/account/account.service'
import { AccountsSurfaceService } from '../../src/account/accounts-surface.service'
import { MoneySign } from '../../src/types/MoneyWithSign'

const mockUserId = 'user-1'

const createMockAccount = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'account-1',
  userId: mockUserId,
  name: 'Primary Checking',
  customName: 'House Checking',
  mask: '1234',
  availableBalance: {
    money: { amount: 10000, currency: 'USD' },
    sign: MoneySign.POSITIVE,
  },
  currentBalance: {
    money: { amount: 12345, currency: 'USD' },
    sign: MoneySign.POSITIVE,
  },
  type: 'depository',
  subType: 'checking',
  externalAccountId: null,
  bankLinkId: null,
  bankLink: {
    institutionName: 'Splice Bank',
  },
  createdAt: new Date('2026-03-01T00:00:00Z'),
  updatedAt: new Date('2026-03-01T00:00:00Z'),
  ...overrides,
})

describe('AccountsSurfaceService', () => {
  let service: AccountsSurfaceService
  const mockAccountService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsSurfaceService,
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
      ],
    }).compile()

    service = module.get(AccountsSurfaceService)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('surfaces raw and display account labels with grouped summaries', async () => {
    mockAccountService.findAll.mockResolvedValue([
      createMockAccount(),
      createMockAccount({
        id: 'account-2',
        name: 'Rewards Card',
        customName: null,
        type: 'credit',
        subType: 'credit card',
        bankLink: null,
        currentBalance: {
          money: { amount: 54321, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      }),
      createMockAccount({
        id: 'account-3',
        name: 'Brokerage',
        customName: null,
        type: 'brokerage',
        subType: null,
        bankLink: null,
        currentBalance: {
          money: { amount: 76543, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      }),
      createMockAccount({
        id: 'account-4',
        name: 'Mortgage',
        customName: null,
        type: 'loan',
        subType: 'home equity',
        bankLink: null,
        currentBalance: {
          money: { amount: 250000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      }),
    ])

    const result = await service.getAccountsSnapshot(mockUserId)

    expect(mockAccountService.findAll).toHaveBeenCalledWith(mockUserId)
    expect(result.matchedCount).toBe(4)
    expect(result.truncated).toBe(false)
    expect(result.accounts[0]).toMatchObject({
      id: 'account-1',
      name: 'Primary Checking',
      displayName: 'House Checking',
      type: 'depository',
      typeLabel: 'Depository',
      subType: 'checking',
      subTypeLabel: 'Checking',
      grouping: 'cash',
      groupingLabel: 'Cash',
      institutionName: 'Splice Bank',
    })
    expect(result.accounts[1]).toMatchObject({
      id: 'account-2',
      displayName: 'Rewards Card',
      grouping: 'credit',
      groupingLabel: 'Credit',
    })
    expect(result.accounts[2]).toMatchObject({
      id: 'account-3',
      displayName: 'Brokerage',
      grouping: 'investment',
      groupingLabel: 'Investment',
    })
    expect(result.accounts[3]).toMatchObject({
      id: 'account-4',
      displayName: 'Mortgage',
      grouping: 'liability',
      groupingLabel: 'Liability',
    })
  })
})
