import { Test, TestingModule } from '@nestjs/testing';

type AskServiceType = typeof import('../../src/ask/ask.service').AskService;
type AskQueryServiceType =
  typeof import('../../src/ask/ask-query.service').AskQueryService;

var mockOpenai: jest.Mock;
var mockStreamText: jest.Mock;
var mockConvertToModelMessages: jest.Mock;
var mockPipeUIMessageStreamToResponse: jest.Mock;
var mockStepCountIs: jest.Mock;

describe('AskService', () => {
  let service: InstanceType<AskServiceType>;
  let AskService: AskServiceType;
  let AskQueryService: AskQueryServiceType;
  let mockAskQueryService: {
    getAccountsSnapshot: jest.Mock;
    getBalanceHistory: jest.Mock;
    searchTransactions: jest.Mock;
    getCashflowAnalysis: jest.Mock;
  };

  beforeEach(async () => {
    jest.resetModules();

    mockOpenai = jest.fn((model: string) => ({ model }));
    mockConvertToModelMessages = jest.fn(async (messages) => messages);
    mockPipeUIMessageStreamToResponse = jest.fn();
    mockStepCountIs = jest.fn((count: number) => ({
      type: 'mock-stop-when',
      count,
    }));
    mockStreamText = jest.fn(() => ({
      toUIMessageStream: jest.fn(() => 'mock-stream'),
    }));

    jest.doMock('@ai-sdk/openai', () => ({
      openai: mockOpenai,
    }));
    jest.doMock('ai', () => ({
      convertToModelMessages: mockConvertToModelMessages,
      pipeUIMessageStreamToResponse: mockPipeUIMessageStreamToResponse,
      stepCountIs: mockStepCountIs,
      streamText: mockStreamText,
      tool: ({ execute }: { execute: unknown }) => ({ execute }),
    }));

    ({ AskQueryService } = jest.requireActual(
      '../../src/ask/ask-query.service',
    ) as {
      AskQueryService: AskQueryServiceType;
    });
    ({ AskService } = jest.requireActual('../../src/ask/ask.service') as {
      AskService: AskServiceType;
    });

    mockAskQueryService = {
      getAccountsSnapshot: jest.fn(),
      getBalanceHistory: jest.fn(),
      searchTransactions: jest.fn(),
      getCashflowAnalysis: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AskService,
        {
          provide: AskQueryService,
          useValue: mockAskQueryService,
        },
      ],
    }).compile();

    service = module.get(AskService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.unmock('ai');
    jest.unmock('@ai-sdk/openai');
    delete process.env.OPENAI_MODEL;
    jest.useRealTimers();
  });

  it('builds lean Ask answers with scope and followups only', async () => {
    const result = service.buildFinalAnswer({
      answerText: 'Your outflows are up 14% month to date.',
      queryScope: {
        startDate: '2026-03-01',
        endDate: '2026-03-22',
        includePending: false,
        truncated: false,
        accountIds: ['account-1'],
      },
      followups: ['Show the top categories'],
    });

    expect(result).toMatchObject({
      answerText: 'Your outflows are up 14% month to date.',
      confidence: 'high',
      queryScope: {
        startDate: '2026-03-01',
      },
      followups: ['Show the top categories'],
    });
    expect(result).not.toHaveProperty('evidence');
  });

  it('caps followups to the Ask limits', () => {
    const result = service.buildFinalAnswer({
      answerText: 'Large result set',
      queryScope: {
        includePending: false,
        truncated: false,
        accountIds: [],
      },
      followups: ['A', 'B', 'C', 'D'],
    });

    expect(result.followups).toHaveLength(3);
    expect(result.queryScope.truncated).toBe(true);
    expect(result).not.toHaveProperty('evidence');
  });

  it('defaults Ask chat to gpt-5.4 with medium reasoning when OPENAI_MODEL is unset', async () => {
    await service.streamChat(
      'user-1',
      {
        messages: [],
      },
      {} as never,
    );

    expect(mockOpenai).toHaveBeenCalledWith('gpt-5.4');
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openai: {
            reasoningEffort: 'medium',
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

  it('attaches only lean Ask metadata after multi-tool completion', async () => {
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
      steps: [{ toolResults: [{ output: { matchedCount: 2, truncated: true } }] }],
    });

    const metadata = capturedMessageMetadata?.({ part: { type: 'finish' } });

    expect(metadata).toMatchObject({
      ask: {
        queryScope: {
          truncated: true,
        },
        answerText: 'Cash flow is flat, but balances moved up last week.',
      },
    });
    expect(metadata).not.toHaveProperty('ask.evidence');
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
