type RuntimeState =
  | { status: 'loading' }
  | { status: 'ready'; result: Record<string, unknown> }
  | { status: 'error'; error: { kind: string; message: string } };

interface RuntimeOptions {
  appInfo: { name: string; version: string };
  capabilities?: Record<string, unknown>;
  safeAreaElement?: unknown;
  onStateChange?: (state: RuntimeState) => void;
  onToolInput?: (input: { arguments?: Record<string, unknown> }) => void;
  onTeardown?: () => void;
}

interface RuntimeTarget {
  id?: string;
  value?: string;
  checked?: boolean;
  dataset?: Record<string, string>;
  closest?: (selector: string) => RuntimeTarget | null;
}

interface RuntimeHarness {
  html: () => string;
  appRoot: { innerHTML: string; style: Record<string, unknown> };
  safeAreaRoot: { style: Record<string, unknown> };
  status: { textContent: string; dataset: Record<string, string> };
  options: RuntimeOptions;
  callServerTool: jest.Mock;
  updateModelContext: jest.Mock;
  connect: jest.Mock;
  dispatchInput: (target: RuntimeTarget) => void;
  dispatchChange: (target: RuntimeTarget) => void;
  dispatchClick: (target: RuntimeTarget) => void;
  sendToolInput: (arguments_: Record<string, unknown>) => void;
  sendToolResult: (structuredContent: Record<string, unknown>) => void;
  sendRuntimeError: () => void;
  teardown: () => void;
}

const runtimes: Array<{
  options: RuntimeOptions;
  callServerTool: jest.Mock;
  updateModelContext: jest.Mock;
  connect: jest.Mock;
}> = [];
let rejectNextConnect = false;

jest.mock('@koonweee/mcp-kit/apps', () => ({
  createMcpAppRuntime: (options: RuntimeOptions) => {
    const runtime = {
      options,
      callServerTool: jest.fn(),
      updateModelContext: jest.fn().mockResolvedValue({}),
      connect: rejectNextConnect
        ? jest.fn().mockRejectedValue(new Error('host unavailable'))
        : jest.fn().mockResolvedValue(undefined),
    };
    runtimes.push(runtime);
    return {
      app: {
        callServerTool: runtime.callServerTool,
        updateModelContext: runtime.updateModelContext,
      },
      connect: runtime.connect,
      close: jest.fn().mockResolvedValue(undefined),
      getState: jest.fn(() => ({ status: 'loading' })),
      subscribe: jest.fn(),
    };
  },
}));

function runRuntime(
  appId: string,
  options: { connectFailure?: boolean } = {},
): RuntimeHarness {
  jest.resetModules();
  runtimes.length = 0;
  rejectNextConnect = options.connectFailure ?? false;

  const appRoot = {
    innerHTML: '',
    getAttribute: (name: string) => (name === 'data-app-id' ? appId : null),
    style: {},
  };
  const safeAreaRoot = { style: {} };
  const status = {
    textContent: '',
    dataset: {} as Record<string, string>,
  };
  const elements: Record<string, unknown> = {
    'splice-mcp-app-root': appRoot,
    'splice-mcp-app-safe-area': safeAreaRoot,
    'app-status': status,
    'portfolio-snapshot-date': { value: '2026-04-30' },
  };
  const documentListeners: Record<
    string,
    (event: { target: RuntimeTarget }) => void
  > = {};
  const parentWindow = {};
  const windowObject = { parent: parentWindow };
  const documentObject = {
    documentElement: { style: {} },
    getElementById: (id: string) => elements[id] ?? null,
    addEventListener: (
      type: string,
      listener: (event: { target: RuntimeTarget }) => void,
    ) => {
      documentListeners[type] = listener;
    },
  };

  Object.assign(globalThis, { window: windowObject, document: documentObject });

  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../src/mcp/apps/app-runtime');
  });

  const runtime = runtimes[0];
  if (!runtime) throw new Error('Expected Splice MCP App runtime');

  return {
    html: () => appRoot.innerHTML,
    appRoot,
    safeAreaRoot,
    status,
    options: runtime.options,
    callServerTool: runtime.callServerTool,
    updateModelContext: runtime.updateModelContext,
    connect: runtime.connect,
    dispatchInput: (target) => documentListeners.input?.({ target }),
    dispatchChange: (target) => documentListeners.change?.({ target }),
    dispatchClick: (target) => documentListeners.click?.({ target }),
    sendToolInput: (arguments_) => {
      runtime.options.onStateChange?.({ status: 'loading' });
      runtime.options.onToolInput?.({ arguments: arguments_ });
    },
    sendToolResult: (structuredContent) => {
      runtime.options.onStateChange?.({
        status: 'ready',
        result: {
          content: [{ type: 'text', text: 'test result' }],
          structuredContent,
        },
      });
    },
    sendRuntimeError: () => {
      runtime.options.onStateChange?.({
        status: 'error',
        error: { kind: 'transport', message: 'sensitive transport failure' },
      });
    },
    teardown: () => runtime.options.onTeardown?.(),
  };
}

function actionTarget(action: string, dataset: Record<string, string> = {}) {
  const target: RuntimeTarget = { dataset: { action, ...dataset } };
  target.closest = () => target;
  return target;
}

function mcpMoney(amount: number, sign: 'positive' | 'negative' = 'positive') {
  return { amount, currency: 'USD', sign };
}

function cashFlowPeriod(
  categories: Array<{
    primaryCategory: string;
    amount: number;
    transactionCount?: number;
    color?: string;
  }> = [],
) {
  return {
    analysis: {
      startDate: '2026-04-01',
      endDate: '2026-04-30',
      currency: 'USD',
      totals: {
        totalInflow: mcpMoney(1200),
        totalOutflow: mcpMoney(450, 'negative'),
        netFlow: mcpMoney(750),
        uncategorizedInflow: mcpMoney(0),
        uncategorizedOutflow: mcpMoney(25, 'negative'),
      },
      inflows: [],
      outflows: categories.map((category) => ({
        primaryCategory: category.primaryCategory,
        totalAmount: mcpMoney(category.amount, 'negative'),
        transactionCount: category.transactionCount ?? 1,
        color: category.color ?? '#2563eb',
      })),
    },
    adjustments: {
      affected: true,
      excludedTransactionCount: 2,
      neutralizedPairCount: 1,
    },
  };
}

function cashFlowResult(
  categories: Array<{
    primaryCategory: string;
    amount: number;
    transactionCount?: number;
    color?: string;
  }> = [
    {
      primaryCategory: 'FOOD_AND_DRINK',
      amount: 450,
      transactionCount: 2,
    },
  ],
  options: {
    direction?: 'outflow' | 'inflow';
    focusCategoryPrimary?: string;
  } = {},
) {
  return {
    app: { id: 'cash_flow' },
    data: {
      presentation: {
        direction: options.direction ?? 'outflow',
        ...(options.focusCategoryPrimary
          ? { focusCategoryPrimary: options.focusCategoryPrimary }
          : {}),
      },
      current: cashFlowPeriod(categories),
    },
  };
}

async function flushPromises() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('Splice MCP App runtime integration', () => {
  it('starts with a neutral loading state and no business data', () => {
    const harness = runRuntime('cash_flow');

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.options).toMatchObject({
      appInfo: { name: 'Splice Cash Flow', version: '3.0.0' },
      capabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    });
    expect(harness.options.safeAreaElement).toBe(harness.safeAreaRoot);
    expect(harness.options.safeAreaElement).not.toBe(harness.appRoot);
    expect(harness.html()).toContain('Loading live Splice data');
    expect(harness.html()).not.toMatch(/\$|fixture|2026-03|6250|3120|3130/i);
  });

  it('shows a truthful error when the host connection fails', async () => {
    const harness = runRuntime('cash_flow', {
      connectFailure: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.html()).not.toContain('host unavailable');
  });

  it('renders only current Cash Flow data and calls the helper with immutable result identity', async () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolInput({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    harness.sendToolResult(cashFlowResult());

    expect(harness.html()).toContain('Apr 1, 2026');
    expect(harness.html()).toContain('$1,200.00');
    expect(harness.html()).toContain('Top spending categories');
    expect(harness.html()).not.toMatch(
      /type="date"|Reload|Search|Audit effects|This month/,
    );

    harness.callServerTool.mockResolvedValue({
      structuredContent: { data: [] },
    });
    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );
    await Promise.resolve();

    expect(harness.callServerTool).toHaveBeenCalledWith({
      name: 'list_cashflow_category_transactions',
      arguments: expect.objectContaining({
        categoryPrimary: 'FOOD_AND_DRINK',
        flowDirection: 'outflow',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      }),
    });
    expect(harness.updateModelContext).toHaveBeenCalledWith({
      structuredContent: {
        visualization: 'cash_flow',
        selection: expect.objectContaining({
          categoryPrimary: 'FOOD_AND_DRINK',
          categoryLabel: 'Food And Drink',
          startDate: '2026-04-01',
          endDate: '2026-04-30',
          direction: 'outflow',
          transactionCount: 2,
        }),
      },
    });
    expect(JSON.stringify(harness.updateModelContext.mock.calls)).not.toMatch(
      /accountId|merchantName|transactionRows/,
    );
  });

  it('renders both supported views from host-delivered structured results', () => {
    const cases = [
      {
        id: 'cash_flow',
        expected: 'Cash Flow',
        structuredContent: cashFlowResult([]),
      },
      {
        id: 'portfolio_viewer',
        expected: 'Portfolio Viewer',
        structuredContent: {
          app: { id: 'portfolio_viewer' },
          data: { holdings: { data: [] }, activity: { data: [] } },
        },
      },
    ];

    for (const testCase of cases) {
      const harness = runRuntime(testCase.id);
      harness.sendToolResult(testCase.structuredContent);
      expect(harness.html()).toContain(testCase.expected);
      expect(harness.status).toMatchObject({
        textContent: 'Connected to live Splice data.',
        dataset: { kind: 'success' },
      });
    }
  });

  it('clears stale data on malformed results, runtime errors, and teardown', () => {
    const harness = runRuntime('portfolio_viewer');
    harness.sendToolResult({
      app: { id: 'portfolio_viewer' },
      data: {
        holdings: {
          data: [
            {
              security: { name: 'Private Test Holding' },
              institutionValue: 777,
              isoCurrencyCode: 'USD',
            },
          ],
        },
        activity: { data: [] },
      },
    });
    expect(harness.html()).toContain('Private Test Holding');

    harness.sendToolResult({});
    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.html()).not.toContain('Private Test Holding');

    harness.sendRuntimeError();
    expect(harness.html()).not.toContain('sensitive transport failure');

    harness.teardown();
    expect(harness.html()).toContain('Unable to load live Splice data');
  });

  it('shows three largest transactions, expands by three, and clears model context on close', async () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockResolvedValue({
      structuredContent: {
        data: Array.from({ length: 7 }, (_, index) => ({
          activityDate: `2026-04-${String(index + 1).padStart(2, '0')}`,
          merchantName: `Merchant ${index + 1}`,
          convertedAmount: mcpMoney(index + 1, 'negative'),
          accountId: `private-account-${index + 1}`,
        })),
      },
    });

    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );
    await flushPromises();

    expect(harness.html()).toContain('Merchant 7');
    expect(harness.html()).toContain('Merchant 5');
    expect(harness.html()).not.toContain('Merchant 4');
    expect(harness.html()).toContain('Show 3 more');

    harness.dispatchClick(actionTarget('show-more-transactions'));
    expect(harness.html()).toContain('Merchant 4');
    expect(harness.html()).toContain('Merchant 2');
    expect(harness.html()).not.toContain('Merchant 1');

    harness.dispatchClick(actionTarget('close-category'));
    expect(harness.html()).not.toContain('Merchant 7');
    expect(harness.html()).toContain('Top spending categories');
    expect(harness.updateModelContext).toHaveBeenLastCalledWith({
      structuredContent: {
        visualization: 'cash_flow',
        selection: null,
      },
    });
  });

  it('keeps primary data visible when helper or model-context updates fail', async () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockRejectedValue(
      new Error('private helper failure'),
    );
    harness.updateModelContext.mockRejectedValue(
      new Error('private context failure'),
    );

    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );
    await flushPromises();

    expect(harness.html()).toContain('Food And Drink');
    expect(harness.html()).toContain('Transaction details are unavailable');
    expect(harness.html()).toContain(
      'This selection could not be shared with the conversation',
    );
    expect(harness.html()).toContain('$750.00');
    expect(harness.html()).not.toMatch(
      /Unable to load live Splice data|private helper|private context/,
    );
  });

  it('treats a resolved MCP helper error result as locally unavailable', async () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: 'private protocol error' }],
    });

    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );
    await flushPromises();

    expect(harness.html()).toContain('Food And Drink');
    expect(harness.html()).toContain('Transaction details are unavailable');
    expect(harness.html()).toContain('$750.00');
    expect(harness.html()).not.toMatch(
      /No transactions were returned|Unable to load live Splice data|private protocol error/,
    );
  });

  it('clears published selection context when a replacement result arrives', () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockReturnValue(new Promise(() => undefined));
    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );

    harness.sendToolResult(
      cashFlowResult([{ primaryCategory: 'REPLACEMENT', amount: 25 }]),
    );

    expect(harness.updateModelContext).toHaveBeenLastCalledWith({
      structuredContent: {
        visualization: 'cash_flow',
        selection: null,
      },
    });
    expect(harness.html()).toContain('Replacement');
    expect(harness.html()).not.toContain('Selected category');
  });

  it('clears published selection context when primary data errors', () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockReturnValue(new Promise(() => undefined));
    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );

    harness.sendRuntimeError();

    expect(harness.updateModelContext).toHaveBeenLastCalledWith({
      structuredContent: {
        visualization: 'cash_flow',
        selection: null,
      },
    });
    expect(harness.html()).toContain('Unable to load live Splice data');
  });

  it('clears published selection context during teardown', () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockReturnValue(new Promise(() => undefined));
    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );

    harness.teardown();

    expect(harness.updateModelContext).toHaveBeenLastCalledWith({
      structuredContent: {
        visualization: 'cash_flow',
        selection: null,
      },
    });
  });

  it('ignores a deferred old context failure after clearing for a new result', async () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(cashFlowResult());
    harness.callServerTool.mockReturnValue(new Promise(() => undefined));
    let rejectOldContext: ((reason?: unknown) => void) | undefined;
    harness.updateModelContext
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectOldContext = reject;
          }),
      )
      .mockResolvedValue({});
    harness.dispatchClick(
      actionTarget('select-category', { category: 'FOOD_AND_DRINK' }),
    );
    harness.sendToolResult(
      cashFlowResult([{ primaryCategory: 'CURRENT_RESULT', amount: 25 }]),
    );

    rejectOldContext?.(new Error('late private context failure'));
    await flushPromises();

    expect(harness.updateModelContext).toHaveBeenLastCalledWith({
      structuredContent: {
        visualization: 'cash_flow',
        selection: null,
      },
    });
    expect(harness.html()).toContain('Current Result');
    expect(harness.html()).not.toMatch(
      /Selected category|could not be shared|late private context failure/,
    );
  });

  it('ignores an in-flight helper result from an earlier primary result', async () => {
    const harness = runRuntime('cash_flow');
    harness.sendToolResult(
      cashFlowResult([{ primaryCategory: 'OLD_CATEGORY', amount: 10 }]),
    );

    let resolveHelper: ((value: unknown) => void) | undefined;
    harness.callServerTool.mockReturnValue(
      new Promise((resolve) => {
        resolveHelper = resolve;
      }),
    );
    harness.dispatchClick(
      actionTarget('select-category', { category: 'OLD_CATEGORY' }),
    );

    harness.sendToolInput({ startDate: '2026-05-01' });
    expect(harness.html()).toContain('Loading live Splice data');
    harness.sendToolResult(
      cashFlowResult([{ primaryCategory: 'NEW_CATEGORY', amount: 20 }]),
    );
    resolveHelper?.({
      structuredContent: {
        data: [{ merchantName: 'Private Late Helper Result' }],
      },
    });
    await flushPromises();

    expect(harness.html()).toContain('New Category');
    expect(harness.html()).not.toMatch(
      /Old Category|Private Late Helper Result/,
    );
  });

  it('opens a valid model-supplied category focus and ignores a missing focus', async () => {
    const focused = runRuntime('cash_flow');
    focused.callServerTool.mockResolvedValue({
      structuredContent: { data: [] },
    });
    focused.sendToolResult(
      cashFlowResult(undefined, {
        focusCategoryPrimary: 'FOOD_AND_DRINK',
      }),
    );
    await flushPromises();
    expect(focused.callServerTool).toHaveBeenCalledTimes(1);
    expect(focused.updateModelContext).not.toHaveBeenCalled();
    expect(focused.html()).toContain('Selected category');

    const missing = runRuntime('cash_flow');
    missing.sendToolResult(
      cashFlowResult(undefined, {
        focusCategoryPrimary: 'MISSING_CATEGORY',
      }),
    );
    expect(missing.callServerTool).not.toHaveBeenCalled();
    expect(missing.html()).not.toContain('Selected category');
  });

  it('keeps the overview visible while a focused helper loads and places detail after the selected row', async () => {
    const harness = runRuntime('cash_flow');
    let resolveHelper: ((value: unknown) => void) | undefined;
    harness.callServerTool.mockReturnValue(
      new Promise((resolve) => {
        resolveHelper = resolve;
      }),
    );
    harness.sendToolResult(
      cashFlowResult(
        [
          { primaryCategory: 'RENT', amount: 1080 },
          { primaryCategory: 'GROCERIES', amount: 540 },
          { primaryCategory: 'FOOD_AND_DRINK', amount: 430 },
        ],
        { focusCategoryPrimary: 'GROCERIES' },
      ),
    );

    const loadingHtml = harness.html();
    const groceriesRow = loadingHtml.indexOf('data-category="GROCERIES"');
    const inlineDetail = loadingHtml.indexOf('id="cash-flow-detail"');
    const nextCategory = loadingHtml.indexOf('Food And Drink');
    expect(loadingHtml).toContain('$750.00');
    expect(loadingHtml).toContain('Top spending categories');
    expect(loadingHtml).toContain('Loading transaction evidence');
    expect(groceriesRow).toBeGreaterThan(-1);
    expect(inlineDetail).toBeGreaterThan(groceriesRow);
    expect(inlineDetail).toBeLessThan(nextCategory);
    expect(harness.updateModelContext).not.toHaveBeenCalled();

    resolveHelper?.({
      structuredContent: {
        data: [
          {
            merchantName: 'Focused Test Merchant',
            activityDate: '2026-04-10',
            convertedAmount: mcpMoney(50, 'negative'),
          },
        ],
      },
    });
    await flushPromises();
    expect(harness.html()).toContain('Focused Test Merchant');
    expect(harness.html()).toContain('Top spending categories');
    expect(harness.updateModelContext).not.toHaveBeenCalled();
  });

  it('expands Other when a model-supplied focus is in the long tail', () => {
    const harness = runRuntime('cash_flow');
    harness.callServerTool.mockReturnValue(new Promise(() => undefined));
    harness.sendToolResult(
      cashFlowResult(
        Array.from({ length: 6 }, (_, index) => ({
          primaryCategory: `CATEGORY_${index + 1}`,
          amount: 100 - index * 10,
        })),
        { focusCategoryPrimary: 'CATEGORY_6' },
      ),
    );

    expect(harness.html()).toContain('id="cash-flow-other-rows"');
    expect(harness.html()).toContain('data-category="CATEGORY_6"');
    expect(harness.html()).toContain('id="cash-flow-detail"');
  });

  it('renders a purposeful empty state without controls or stale values', () => {
    const harness = runRuntime('cash_flow');
    const result = cashFlowResult([]);
    result.data.current.analysis.totals = {
      totalInflow: mcpMoney(0),
      totalOutflow: mcpMoney(0, 'negative'),
      netFlow: mcpMoney(0),
      uncategorizedInflow: mcpMoney(0),
      uncategorizedOutflow: mcpMoney(0, 'negative'),
    };
    harness.sendToolResult(result);

    expect(harness.html()).toContain('No spending activity');
    expect(harness.html()).not.toMatch(/Reload|Search|Audit|type="date"/);
  });

  it('renders comparison and adjustment evidence while keeping the long tail disclosed', () => {
    const harness = runRuntime('cash_flow');
    const categories = Array.from({ length: 7 }, (_, index) => ({
      primaryCategory: `TEST_CATEGORY_${index + 1}`,
      amount: 70 - index * 5,
      transactionCount: index + 1,
    }));
    const result = cashFlowResult(categories);
    const comparison = cashFlowPeriod(
      categories.map((category) => ({
        ...category,
        amount: category.amount - 10,
      })),
    );
    comparison.analysis.startDate = '2026-03-01';
    comparison.analysis.endDate = '2026-03-31';
    comparison.adjustments = {
      affected: true,
      excludedTransactionCount: 4,
      neutralizedPairCount: 2,
    };
    harness.sendToolResult({
      ...result,
      data: { ...result.data, comparison },
    });

    expect(harness.html()).toContain('Mar 1, 2026');
    expect(harness.html()).toContain(
      'Exact ranges; values are not normalized for period length',
    );
    expect(harness.html()).toContain('Other');
    expect(harness.html()).not.toContain('Test Category 6');
    expect(harness.html()).toContain('Current period:');
    expect(harness.html()).toContain('Comparison period:');
    expect(harness.html()).not.toMatch(
      /Uncategorized[\s\S]{0,240}0 transactions/,
    );

    harness.dispatchClick(actionTarget('toggle-other'));
    expect(harness.html()).toContain('Test Category 6');
    expect(harness.html()).toContain('Test Category 7');
  });

  it('starts portfolio reload as a boundary and ignores older pagination', async () => {
    const harness = runRuntime('portfolio_viewer');
    harness.sendToolResult({
      app: { id: 'portfolio_viewer' },
      data: {
        holdings: {
          data: [
            {
              accountId: 'old-account',
              security: { name: 'Old Holding' },
              institutionValue: 10,
            },
          ],
        },
        activity: {
          data: [],
          pageInfo: { nextCursor: 'old-cursor', hasMore: true },
        },
      },
    });

    let resolveOldPage: ((value: unknown) => void) | undefined;
    harness.callServerTool.mockImplementation(
      ({ name, arguments: args }: { name: string; arguments?: object }) => {
        if (name === 'list_investment_activity' && args && 'cursor' in args) {
          return new Promise((resolve) => {
            resolveOldPage = resolve;
          });
        }
        if (name === 'list_investment_holdings') {
          return Promise.resolve({
            structuredContent: {
              data: [
                {
                  accountId: 'new-account',
                  security: { name: 'New Holding' },
                  institutionValue: 20,
                },
              ],
            },
          });
        }
        return Promise.resolve({
          structuredContent: { data: [], pageInfo: { hasMore: false } },
        });
      },
    );
    harness.dispatchClick(actionTarget('next-activity'));
    harness.dispatchClick(actionTarget('reload-portfolio'));

    expect(harness.html()).toContain('Loading live Splice data');
    await new Promise<void>((resolve) => setImmediate(resolve));
    resolveOldPage?.({
      structuredContent: {
        data: [{ security: { name: 'Private Late Activity' } }],
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.html()).toContain('New Holding');
    expect(harness.html()).not.toMatch(/Old Holding|Private Late Activity/);
  });

  it('uses snapshotDate, not latestOnly=false, for date-specific holdings reloads', async () => {
    const harness = runRuntime('portfolio_viewer');
    harness.sendToolResult({
      app: { id: 'portfolio_viewer' },
      data: {
        holdings: { data: [], query: { latestOnly: true } },
        activity: { data: [], pageInfo: { nextCursor: null, hasMore: false } },
      },
    });
    harness.callServerTool.mockResolvedValue({
      structuredContent: { data: [] },
    });

    harness.dispatchChange({ id: 'portfolio-date-mode', value: 'date' });
    harness.dispatchInput({
      id: 'portfolio-snapshot-date',
      value: '2026-04-30',
    });
    harness.dispatchClick(actionTarget('reload-portfolio'));
    await Promise.resolve();

    expect(harness.callServerTool).toHaveBeenCalledWith({
      name: 'list_investment_holdings',
      arguments: { snapshotDate: '2026-04-30' },
    });
    expect(harness.callServerTool).not.toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'list_investment_holdings',
        arguments: expect.objectContaining({ latestOnly: false }),
      }),
    );
  });

  it('drops a portfolio account selection that is absent from new holdings', async () => {
    const harness = runRuntime('portfolio_viewer');
    harness.sendToolResult({
      app: { id: 'portfolio_viewer' },
      data: {
        holdings: {
          data: [{ accountId: 'old-account', institutionValue: 10 }],
        },
        activity: { data: [] },
      },
    });
    harness.dispatchChange({ id: 'portfolio-account', value: 'old-account' });

    harness.sendToolResult({
      app: { id: 'portfolio_viewer' },
      data: {
        holdings: {
          data: [{ accountId: 'new-account', institutionValue: 20 }],
        },
        activity: { data: [] },
      },
    });
    harness.callServerTool.mockResolvedValue({
      structuredContent: { data: [] },
    });
    harness.dispatchClick(actionTarget('reload-portfolio'));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.callServerTool).toHaveBeenCalledWith({
      name: 'list_investment_holdings',
      arguments: { latestOnly: true },
    });
    expect(harness.callServerTool).not.toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({ accountIds: ['old-account'] }),
      }),
    );
  });
});
