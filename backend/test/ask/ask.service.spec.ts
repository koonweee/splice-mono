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
    getBalanceHistory: jest.fn(),
    searchTransactions: jest.fn(),
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

  it('builds structured Ask answers with scope, evidence, and balance history', async () => {
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
        balanceHistory: {
          matchedCount: 4,
          truncated: false,
          currentTotal: {
            money: { currency: 'USD', amount: 95_000 },
            sign: MoneySign.POSITIVE,
          },
          previousTotal: {
            money: { currency: 'USD', amount: 90_000 },
            sign: MoneySign.POSITIVE,
          },
          deltaPercent: 5.56,
          pointCount: 2,
          semanticMetadata: {
            pendingIncluded: true,
            reconciliationApplied: true,
            comparisonIncluded: true,
          },
        },
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
        balanceHistory: expect.objectContaining({
          matchedCount: 4,
          currentTotal: expect.objectContaining({
            money: expect.objectContaining({
              currency: 'USD',
              amount: 95_000,
            }),
          }),
        }),
      },
      followups: ['Show the top categories'],
    });
  });

  it('caps oversized evidence arrays to the Ask limits', () => {
    const result = service.buildFinalAnswer({
      answerText: 'Large result set',
      queryScope: {
        includePending: false,
        truncated: false,
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
        balanceHistory: {
          matchedCount: 2,
          truncated: false,
          currentTotal: {
            money: { currency: 'USD', amount: 100_000 },
            sign: MoneySign.POSITIVE,
          },
          pointCount: 1,
          semanticMetadata: {
            pendingIncluded: false,
            reconciliationApplied: true,
            comparisonIncluded: false,
          },
        },
        aggregates: new Array(12).fill(null).map((_, index) => ({
          label: `Driver ${index}`,
          amount: index,
          currency: 'USD',
          kind: 'category' as const,
        })),
        matchedCount: 30,
        truncated: false,
      },
      followups: ['A', 'B', 'C', 'D'],
    });

    expect(result.evidence.accounts).toHaveLength(10);
    expect(result.evidence.transactions).toHaveLength(20);
    expect(result.evidence.aggregates).toHaveLength(10);
    expect(result.evidence.truncated).toBe(true);
    expect(result.queryScope.truncated).toBe(true);
    expect(result.evidence.balanceHistory).toMatchObject({
      matchedCount: 2,
      pointCount: 1,
    });
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

  it('includes date grounding and tool routing guidance in the system prompt', async () => {
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
          'Use get_accounts_snapshot only for balance, cash position, or account inventory questions.',
        ),
      }),
    );
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
          'Use search_transactions for merchant lookups, examples, or specific transaction searches.',
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
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          'Prefer user-friendly labels unless the user explicitly asks for raw identifiers.',
        ),
      }),
    );
  });

  it('uses the new concept-oriented tool registry', async () => {
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
      'get_balance_history',
      'search_transactions',
      'get_cashflow_analysis',
    ]);
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
                matchedCount: 2,
                truncated: false,
                accounts: [
                  {
                    id: 'account-1',
                    displayName: 'House Checking',
                    institutionName: 'Bank',
                    grouping: 'cash',
                    balance: {
                      money: { currency: 'USD', amount: 90_000 },
                      sign: 'positive',
                    },
                  },
                  {
                    id: 'account-1',
                    displayName: 'House Checking',
                    institutionName: 'Bank',
                    grouping: 'cash',
                    balance: {
                      money: { currency: 'USD', amount: 90_000 },
                      sign: 'positive',
                    },
                  },
                  {
                    id: 'account-2',
                    displayName: 'Amex Gold',
                    institutionName: 'Bank',
                    grouping: 'credit',
                    balance: {
                      money: { currency: 'USD', amount: 15_000 },
                      sign: 'negative',
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
                netWorth: {
                  money: { currency: 'USD', amount: 95_000 },
                  sign: 'positive',
                },
                changePercent: 5.56,
                chartData: [
                  {
                    date: '2026-03-01',
                    label: 'Mar 1',
                    value: 90_000,
                  },
                  {
                    date: '2026-03-08',
                    label: 'Mar 8',
                    value: 95_000,
                  },
                ],
                assets: [
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
                    effectiveBalance: {
                      money: { currency: 'USD', amount: 95_000 },
                      sign: 'positive',
                    },
                    institutionName: 'Bank',
                  },
                ],
                liabilities: [],
                truncated: false,
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
                  {
                    id: 'transaction-2',
                    accountId: 'account-2',
                    accountName: 'Amex Gold',
                    merchantName: 'Uber',
                    pending: false,
                    date: '2026-03-04',
                    categoryPrimary: 'TRANSPORTATION',
                    amount: {
                      money: { currency: 'USD', amount: 4599 },
                      sign: 'negative',
                    },
                  },
                ],
                matchedCount: 2,
                truncated: true,
              },
            },
          ],
        },
        {
          toolResults: [
            {
              output: {
                topCategories: [
                  {
                    label: 'Travel',
                    rawLabel: 'TRAVEL',
                    amount: 60,
                    currency: 'USD',
                    kind: 'category',
                  },
                  {
                    label: 'Travel',
                    rawLabel: 'TRAVEL',
                    amount: 60,
                    currency: 'USD',
                    kind: 'category',
                  },
                  {
                    label: 'Food & Drink',
                    rawLabel: 'FOOD_AND_DRINK',
                    amount: 45,
                    currency: 'USD',
                    kind: 'category',
                  },
                ],
                semanticMetadata: {
                  pendingIncluded: false,
                  reconciliationApplied: true,
                  comparisonIncluded: false,
                },
                matchedCount: 1,
                truncated: false,
              },
            },
          ],
        },
      ],
    });

    const metadata = capturedMessageMetadata?.({ part: { type: 'finish' } });

    expect(metadata).toMatchObject({
      ask: {
        queryScope: {
          truncated: true,
        },
        evidence: {
          matchedCount: 7,
          truncated: true,
          accounts: [{ id: 'account-1' }, { id: 'account-2' }],
          transactions: [
            {
              id: 'transaction-1',
              merchantName: 'Netflix',
            },
            {
              id: 'transaction-2',
              merchantName: 'Uber',
            },
          ],
          aggregates: [
            {
              label: 'Travel',
            },
            {
              label: 'Food & Drink',
            },
          ],
          balanceHistory: {
            matchedCount: 2,
            truncated: false,
            currentTotal: {
              money: {
                currency: 'USD',
                amount: 95_000,
              },
            },
            pointCount: 2,
            semanticMetadata: {
              pendingIncluded: false,
              reconciliationApplied: true,
              comparisonIncluded: false,
            },
          },
        },
      },
    });
  });

  it('accumulates query scope across contributing tool calls', async () => {
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

    mockAskQueryService.getBalanceHistory.mockResolvedValueOnce({
      netWorth: {
        money: { currency: 'USD', amount: 95_000 },
        sign: 'positive',
      },
      chartData: [
        {
          date: '2026-03-01',
          label: 'Mar 1',
          value: 90_000,
        },
        {
          date: '2026-03-08',
          label: 'Mar 8',
          value: 95_000,
        },
      ],
      assets: [],
      liabilities: [],
      truncated: false,
    });
    mockAskQueryService.searchTransactions.mockResolvedValueOnce({
      matchedCount: 1,
      truncated: false,
      transactions: [
        {
          id: 'transaction-1',
          accountId: 'account-2',
          accountName: 'Travel Card',
          merchantName: 'Airline',
          pending: true,
          date: '2026-03-10',
          categoryPrimary: 'TRAVEL',
          amount: {
            money: { currency: 'USD', amount: 5000 },
            sign: 'negative',
          },
        },
      ],
    });

    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    const streamTextInput = mockStreamText.mock.calls[0][0] as {
      tools: Record<
        string,
        { execute: (input?: Record<string, unknown>) => Promise<unknown> }
      >;
    };

    const balanceHistoryOutput = await streamTextInput.tools.get_balance_history.execute(
      {
        startDate: '2026-03-01',
        endDate: '2026-03-08',
        accountIds: ['account-1'],
      },
    );
    const transactionOutput = await streamTextInput.tools.search_transactions.execute(
      {
        startDate: '2026-03-03',
        endDate: '2026-03-10',
        accountIds: ['account-2'],
        includePending: true,
        merchantQuery: 'airline',
      },
    );

    capturedOnFinish?.({
      text: 'Balances rose while a pending travel charge also posted.',
      steps: [
        {
          toolResults: [{ output: balanceHistoryOutput }],
        },
        {
          toolResults: [{ output: transactionOutput }],
        },
      ],
    });

    const metadata = capturedMessageMetadata?.({ part: { type: 'finish' } });

    expect(metadata).toMatchObject({
      ask: {
        queryScope: {
          startDate: '2026-03-01',
          endDate: '2026-03-10',
          accountIds: ['account-1', 'account-2'],
          includePending: true,
          truncated: false,
        },
      },
    });
  });

  it('reports all-accounts scope when unfiltered and filtered tools are combined', async () => {
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

    mockAskQueryService.getCashflowAnalysis.mockResolvedValueOnce({
      totalInflow: 1000,
      totalOutflow: 500,
      netFlow: 500,
      topCategories: [],
      semanticMetadata: {
        pendingIncluded: false,
        reconciliationApplied: true,
        comparisonIncluded: false,
      },
      matchedCount: 2,
      truncated: false,
    });
    mockAskQueryService.searchTransactions.mockResolvedValueOnce({
      matchedCount: 1,
      truncated: false,
      transactions: [
        {
          id: 'transaction-1',
          accountId: 'account-2',
          accountName: 'Travel Card',
          merchantName: 'Airline',
          pending: false,
          date: '2026-03-10',
          categoryPrimary: 'TRAVEL',
          amount: {
            money: { currency: 'USD', amount: 5000 },
            sign: 'negative',
          },
        },
      ],
    });

    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    const streamTextInput = mockStreamText.mock.calls[0][0] as {
      tools: Record<
        string,
        { execute: (input?: Record<string, unknown>) => Promise<unknown> }
      >;
    };

    const cashflowOutput = await streamTextInput.tools.get_cashflow_analysis.execute(
      {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      },
    );
    const transactionOutput = await streamTextInput.tools.search_transactions.execute(
      {
        startDate: '2026-03-05',
        endDate: '2026-03-10',
        accountIds: ['account-2'],
      },
    );

    capturedOnFinish?.({
      text: 'Cash flow across all accounts stayed positive, with a travel charge on one card.',
      steps: [
        {
          toolResults: [{ output: cashflowOutput }],
        },
        {
          toolResults: [{ output: transactionOutput }],
        },
      ],
    });

    const metadata = capturedMessageMetadata?.({ part: { type: 'finish' } });

    expect(metadata).toMatchObject({
      ask: {
        queryScope: {
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          accountIds: [],
          includePending: false,
          truncated: false,
        },
      },
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
