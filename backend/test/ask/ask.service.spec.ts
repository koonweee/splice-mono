import { Test, TestingModule } from '@nestjs/testing';
import { AskQueryService } from '../../src/ask/ask-query.service';
import { AskService } from '../../src/ask/ask.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

var mockOpenai: jest.Mock;
var mockStreamText: jest.Mock;
var mockConvertToModelMessages: jest.Mock;
var mockPipeUIMessageStreamToResponse: jest.Mock;
var mockStepCountIs: jest.Mock;

jest.mock(
  '@ai-sdk/openai',
  () => ({
    openai: (mockOpenai = jest.fn((model: string) => ({ model }))),
  }),
  { virtual: true },
);

jest.mock(
  'ai',
  () => ({
    convertToModelMessages: (mockConvertToModelMessages = jest.fn(
      async (messages) => messages,
    )),
    pipeUIMessageStreamToResponse: (mockPipeUIMessageStreamToResponse =
      jest.fn()),
    stepCountIs: (mockStepCountIs = jest.fn((count: number) => ({
      type: 'mock-stop-when',
      count,
    }))),
    streamText: (mockStreamText = jest.fn(() => ({
      toUIMessageStream: jest.fn(() => 'mock-stream'),
    }))),
    tool: ({ execute }: { execute: unknown }) => ({ execute }),
  }),
  { virtual: true },
);

describe('AskService', () => {
  let service: AskService;

  const mockAskQueryService = {
    getAccountsSnapshot: jest.fn(),
    searchTransactions: jest.fn(),
    summarizeTransactions: jest.fn(),
    comparePeriods: jest.fn(),
    getBalanceHistory: jest.fn(),
    getCashflowAnalysis: jest.fn(),
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
    delete process.env.OPENAI_MODEL;
    jest.useRealTimers();
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

  it('defaults Ask chat to gpt-5.4-mini when OPENAI_MODEL is unset', async () => {
    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    expect(mockOpenai).toHaveBeenCalledWith('gpt-5.4-mini');
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
          },
        },
      }),
    );
  });

  it('includes date grounding and spending tool routing guidance in the system prompt', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-22T12:00:00Z'));

    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Today is 2026-03-22.'),
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Use summarize_transactions for spending, expenditure, outflow, or total spend questions.',
        ),
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Use get_accounts_snapshot only for balance, cash position, or account inventory questions.',
        ),
      }),
    );
  });

  it('includes net worth and why-did-this-change guidance with the new tool registry', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-22T12:00:00Z'));

    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    const streamTextInput = mockStreamText.mock.calls[0][0] as {
      tools: Record<string, unknown>;
    };

    expect(Object.keys(streamTextInput.tools)).toEqual([
      'get_accounts_snapshot',
      'search_transactions',
      'get_balance_history',
      'get_cashflow_analysis',
    ]);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Use get_balance_history for balance, net worth, or balance trend questions.',
        ),
      }),
    );
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Use get_cashflow_analysis for why did this change, spending pattern, reconciliation, or change driver questions.',
        ),
      }),
    );
  });

  it('merges evidence from multiple tool calls and preserves balance-history summary metadata', async () => {
    let capturedOnFinish:
      | ((input: { text: string; steps: Array<{ toolResults: Array<{ output: unknown }> }> }) => void)
      | undefined;
    let capturedMessageMetadata:
      | ((input: { part: { type: string } }) => unknown)
      | undefined;

    mockStreamText.mockImplementationOnce((options) => {
      capturedOnFinish = options.onFinish;
      return {
        toUIMessageStream: jest.fn(({ messageMetadata }) => {
          capturedMessageMetadata = messageMetadata;
          return 'mock-stream';
        }),
      };
    });

    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    capturedOnFinish?.({
      text: 'Cash flow is flat, but balances moved up last week.',
      steps: [
        {
          toolResults: [
            {
              output: {
                matchedCount: 1,
                truncated: false,
                currentTotal: {
                  money: { currency: 'USD', amount: 95_000 },
                  sign: 'positive',
                },
                previousTotal: {
                  money: { currency: 'USD', amount: 90_000 },
                  sign: 'positive',
                },
                deltaPercent: 5.56,
                pointCount: 2,
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
                      money: { currency: 'USD', amount: 90_000 },
                      sign: 'positive',
                    },
                  },
                  {
                    date: '2026-03-08',
                    accountId: 'account-1',
                    accountName: 'House Checking',
                    balance: {
                      money: { currency: 'USD', amount: 95_000 },
                      sign: 'positive',
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          toolResults: [
            {
              output: {
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
                      sign: 'negative',
                    },
                  },
                ],
                matchedCount: 1,
                truncated: true,
              },
            },
          ],
        },
      ],
    });

    const metadata = capturedMessageMetadata?.({ part: { type: 'finish' } });

    expect(metadata).toEqual({
      ask: expect.objectContaining({
        evidence: expect.objectContaining({
          matchedCount: 1,
          truncated: true,
          balanceHistory: expect.objectContaining({
            matchedCount: 1,
            truncated: false,
            currentTotal: expect.objectContaining({
              money: expect.objectContaining({
                currency: 'USD',
                amount: 95_000,
              }),
            }),
            pointCount: 2,
            semanticMetadata: expect.objectContaining({
              pendingIncluded: true,
              reconciliationApplied: true,
            }),
          }),
          transactions: [
            expect.objectContaining({
              id: 'transaction-1',
              merchantName: 'Netflix',
            }),
          ],
        }),
      }),
    });
  });

  it('requires an initial tool call and allows multi-step tool completion', async () => {
    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    expect(mockStepCountIs).toHaveBeenCalledWith(5);
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: {
          type: 'mock-stop-when',
          count: 5,
        },
        prepareStep: expect.any(Function),
      }),
    );

    const streamTextInput = mockStreamText.mock.calls[0][0] as {
      prepareStep: (input: { stepNumber: number }) => Promise<unknown>;
    };

    expect(streamTextInput.prepareStep({ stepNumber: 0 })).toMatchObject({
      toolChoice: 'required',
    });
    expect(streamTextInput.prepareStep({ stepNumber: 1 })).toEqual({});
  });
});
