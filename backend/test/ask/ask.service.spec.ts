import { Test, TestingModule } from '@nestjs/testing';
import { AskQueryService } from '../../src/ask/ask-query.service';
import { AskService } from '../../src/ask/ask.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

describe('AskService', () => {
  let service: AskService;

  const mockAskQueryService = {
    getAccountsSnapshot: jest.fn(),
    searchTransactions: jest.fn(),
    summarizeTransactions: jest.fn(),
    comparePeriods: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AskService,
        {
          provide: AskQueryService,
          useValue: mockAskQueryService,
        },
      ],
    }).compile();

    service = module.get<AskService>(AskService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('builds structured Ask answers with scope and evidence', async () => {
    const result = service.buildFinalAnswer({
      answerText: 'Your outflows are up 14% month to date.',
      queryScope: {
        startDate: '2026-03-01',
        endDate: '2026-03-22',
        includePending: false,
        truncated: false,
        accountIds: ['account-1'],
      },
      evidence: {
        accounts: [],
        transactions: [],
        aggregates: [],
        matchedCount: 12,
        truncated: false,
      },
      followups: ['Show the top categories'],
    });

    expect(result).toMatchObject({
      answerText: 'Your outflows are up 14% month to date.',
      confidence: 'high',
      queryScope: {
        startDate: '2026-03-01',
      },
      evidence: {
        matchedCount: 12,
        truncated: false,
      },
      followups: ['Show the top categories'],
    });
  });

  it('caps oversized evidence arrays to the Ask limits', () => {
    const result = service.buildFinalAnswer({
      answerText: 'Large result set',
      queryScope: {
        includePending: false,
        truncated: true,
        accountIds: [],
      },
      evidence: {
        accounts: new Array(15).fill(null).map((_, index) => ({
          id: `account-${index}`,
          displayName: `Account ${index}`,
          institutionName: null,
          grouping: 'cash' as const,
          balance: {
            money: { currency: 'USD', amount: 100 },
            sign: MoneySign.POSITIVE,
          },
        })),
        transactions: new Array(25).fill(null).map((_, index) => ({
          id: `transaction-${index}`,
          accountId: 'account-1',
          accountName: 'Checking',
          merchantName: `Merchant ${index}`,
          pending: false,
          date: '2026-03-01',
          categoryPrimary: null,
          amount: {
            money: { currency: 'USD', amount: 100 },
            sign: MoneySign.NEGATIVE,
          },
        })),
        aggregates: new Array(12).fill(null).map((_, index) => ({
          label: `Driver ${index}`,
          amount: index,
          currency: 'USD',
          kind: 'category' as const,
        })),
        matchedCount: 30,
        truncated: true,
      },
      followups: ['A', 'B', 'C', 'D'],
    });

    expect(result.evidence.accounts).toHaveLength(10);
    expect(result.evidence.transactions).toHaveLength(20);
    expect(result.evidence.aggregates).toHaveLength(10);
    expect(result.followups).toHaveLength(3);
  });
});
