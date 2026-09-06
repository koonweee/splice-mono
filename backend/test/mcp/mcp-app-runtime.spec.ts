import { sumDecimals } from '../../src/mcp/apps/exact-money';
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
  sendMessage: jest.Mock;
  getHostCapabilities: jest.Mock;
  connect: jest.Mock;
  dispatchInput: (target: RuntimeTarget) => void;
  dispatchChange: (target: RuntimeTarget) => void;
  dispatchClick: (target: RuntimeTarget) => void;
  sendToolInput: (arguments_: Record<string, unknown>) => void;
  sendToolResult: (structuredContent: Record<string, unknown>) => void;
  sendRuntimeError: () => void;
  sendCancelled: () => void;
  teardown: () => void;
}

const runtimes: Array<{
  options: RuntimeOptions;
  callServerTool: jest.Mock;
  updateModelContext: jest.Mock;
  sendMessage: jest.Mock;
  getHostCapabilities: jest.Mock;
  connect: jest.Mock;
}> = [];
let rejectNextConnect = false;

const PORTFOLIO_CLEAR_MODEL_CONTEXT = {
  content: [
    {
      type: 'text',
      text: 'No portfolio holding is currently selected.',
    },
  ],
  structuredContent: { visualization: 'portfolio', selection: null },
};

jest.mock('@koonweee/mcp-kit/apps', () => ({
  createMcpAppRuntime: (options: RuntimeOptions) => {
    const runtime = {
      options,
      callServerTool: jest.fn(),
      updateModelContext: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn().mockResolvedValue({}),
      getHostCapabilities: jest.fn(() => ({ message: { text: {} } })),
      connect: rejectNextConnect
        ? jest.fn().mockRejectedValue(new Error('host unavailable'))
        : jest.fn().mockResolvedValue(undefined),
    };
    runtimes.push(runtime);
    return {
      app: {
        callServerTool: runtime.callServerTool,
        updateModelContext: runtime.updateModelContext,
        sendMessage: runtime.sendMessage,
        getHostCapabilities: runtime.getHostCapabilities,
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
    sendMessage: runtime.sendMessage,
    getHostCapabilities: runtime.getHostCapabilities,
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
    sendCancelled: () => {
      runtime.options.onStateChange?.({
        status: 'error',
        error: { kind: 'cancelled', message: 'cancelled by host' },
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

function mcpMoney(
  amount: number | string,
  sign: 'positive' | 'negative' = 'positive',
) {
  return { amount: String(amount), currency: 'USD', sign };
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

function portfolioPosition(
  index: number,
  options: {
    amount?: number;
    allocationBps?: number;
    name?: string;
    accountName?: string | null;
    quantity?: string | null;
    price?: number | null;
  } = {},
) {
  const amount = options.amount ?? 1000 - index * 100;
  const securityId = `security-${index}`;
  return {
    securityId,
    securityName: options.name ?? `Holding ${index}`,
    tickerSymbol: `H${index}`,
    type: 'equity',
    subtype: null,
    quantity:
      options.quantity === undefined ? String(index + 1) : options.quantity,
    valueUsd: mcpMoney(amount),
    allocationBps: options.allocationBps ?? 1000,
    contributions: [
      {
        accountId: `account-${index}`,
        accountName:
          options.accountName === undefined
            ? `Investment account ${index}`
            : options.accountName,
        snapshotDate: '2026-08-16',
        quantity:
          options.quantity === undefined ? String(index + 1) : options.quantity,
        valueUsd: mcpMoney(amount),
        priceUsd:
          options.price === null
            ? null
            : mcpMoney(options.price === undefined ? amount : options.price),
      },
    ],
  };
}

function portfolioResult(
  positions = Array.from({ length: 7 }, (_, index) =>
    portfolioPosition(index, {
      allocationBps: index < 5 ? 1800 - index * 100 : 1000,
    }),
  ),
) {
  return {
    app: { id: 'portfolio' },
    data: {
      reportingCurrency: 'USD',
      totalValueUsd: mcpMoney(
        sumDecimals(positions.map((item) => item.valueUsd.amount)),
      ),
      snapshotRange: {
        earliest: '2026-08-15',
        latest: '2026-08-16',
      },
      positions,
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
        id: 'portfolio',
        expected: 'Portfolio',
        structuredContent: portfolioResult([]),
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
    const harness = runRuntime('portfolio');
    harness.sendToolResult(
      portfolioResult([
        portfolioPosition(1, { name: 'Private Test Holding', amount: 777 }),
      ]),
    );
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

  it('uses compact currency symbols with one reporting-currency note', () => {
    const harness = runRuntime('cash_flow');
    const result = cashFlowResult();
    const analysis = result.data.current.analysis;
    analysis.currency = 'SGD';
    Object.values(analysis.totals).forEach((money) => {
      money.currency = 'SGD';
    });
    analysis.outflows.forEach((category) => {
      category.totalAmount.currency = 'SGD';
    });

    harness.sendToolResult(result);

    expect(harness.html()).toContain('$1,200.00');
    expect(harness.html()).toContain('$750.00');
    expect(harness.html()).toContain('All values in SGD.');
    expect(harness.html()).not.toContain('SGD ');
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

  it('renders a concise top-five Portfolio with exact Other and no dashboard controls', () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());

    expect(harness.html()).toContain('Total portfolio value');
    expect(harness.html()).toContain('Largest holdings');
    expect(harness.html()).toContain('Holding 0');
    expect(harness.html()).toContain('Holding 4');
    expect(harness.html()).not.toContain('Holding 5');
    expect(harness.html()).toContain('2 more holdings');
    expect(harness.html()).toContain('$900.00');
    expect(harness.html()).toContain('20%');
    expect(harness.html()).toContain('All values in USD.');
    expect(harness.html()).toContain(
      'Latest holdings span 2026-08-15 to 2026-08-16',
    );
    expect(harness.html()).not.toMatch(
      /Reload|Search|Activity|Holdings mode|type="date"|<table|<select/,
    );
  });

  it('expands Other and opens inline evidence with minimum model context', async () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());

    harness.dispatchClick(actionTarget('toggle-portfolio-other'));
    expect(harness.html()).toContain('Holding 5');
    expect(harness.html()).toContain('Holding 6');

    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-5' }),
    );
    await Promise.resolve();

    expect(harness.html()).toContain('Selected holding');
    expect(harness.html()).toContain('Investment account 5');
    expect(harness.html()).toContain('Combined quantity');
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            type: 'text',
            text: expect.stringMatching(
              /Holding 5 \(H5\).*\$500\.00.*10%.*this holding/,
            ),
          }),
        ],
        structuredContent: {
          visualization: 'portfolio',
          reportingCurrency: 'USD',
          selection: expect.objectContaining({
            securityId: 'security-5',
            displayName: 'Holding 5',
            tickerSymbol: 'H5',
            allocationBps: 1000,
            accountNames: ['Investment account 5'],
            snapshotRange: {
              earliest: '2026-08-15',
              latest: '2026-08-16',
            },
          }),
        },
      }),
    );
    expect(JSON.stringify(harness.updateModelContext.mock.calls)).not.toMatch(
      /accountId|positions|contributions|quantity|priceUsd/,
    );

    harness.dispatchClick(actionTarget('toggle-portfolio-other'));
    expect(harness.html()).not.toMatch(/Holding 5|Selected holding/);
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );
  });

  it('sends an explicit selected-holding follow-up through ui/message', async () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );

    expect(harness.html()).toContain('Ask about this holding');
    expect(harness.sendMessage).not.toHaveBeenCalled();
    harness.dispatchClick(actionTarget('ask-about-position'));
    expect(harness.sendMessage).toHaveBeenCalledWith({
      role: 'user',
      content: [
        {
          type: 'text',
          text: "Tell me more about Holding 0 (H0) in my Splice portfolio. Use Splice to explain this holding's current portfolio value, allocation, and account breakdown.",
        },
      ],
    });
    await flushPromises();

    expect(harness.html()).toContain('Question sent to the conversation');
    expect(JSON.stringify(harness.sendMessage.mock.calls)).not.toMatch(
      /security-0|account-0|\$|allocationBps|valueUsd/,
    );
  });

  it('keeps a ui/message rejection local and exposes no host error', async () => {
    const harness = runRuntime('portfolio');
    harness.sendMessage.mockResolvedValueOnce({
      isError: true,
      reason: 'private host rejection',
    });
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.dispatchClick(actionTarget('ask-about-position'));
    await flushPromises();

    expect(harness.html()).toContain('Could not send this question. Try again');
    expect(harness.html()).not.toContain('private host rejection');
  });

  it('keeps a rejected ui/message promise local', async () => {
    const harness = runRuntime('portfolio');
    harness.sendMessage.mockRejectedValueOnce(
      new Error('private transport failure'),
    );
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.dispatchClick(actionTarget('ask-about-position'));
    await flushPromises();

    expect(harness.html()).toContain('Could not send this question. Try again');
    expect(harness.html()).not.toContain('private transport failure');
  });

  it('ignores a late ui/message result after the selected holding changes', async () => {
    const harness = runRuntime('portfolio');
    let resolveMessage: ((result: Record<string, unknown>) => void) | undefined;
    harness.sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMessage = resolve;
        }),
    );
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.dispatchClick(actionTarget('ask-about-position'));

    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-1' }),
    );
    resolveMessage?.({});
    await flushPromises();

    expect(harness.html()).toContain('Holding 1');
    expect(harness.html()).toContain('Ask about this holding');
    expect(harness.html()).not.toContain('Question sent to the conversation');
  });

  it('omits the follow-up action when the host lacks ui/message support', () => {
    const harness = runRuntime('portfolio');
    harness.getHostCapabilities.mockReturnValue({});
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );

    expect(harness.html()).not.toContain('Ask about this holding');
    harness.dispatchClick(actionTarget('ask-about-position'));
    expect(harness.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps multi-account position evidence concise until requested', () => {
    const harness = runRuntime('portfolio');
    const base = portfolioPosition(0, { amount: 5000, allocationBps: 10_000 });
    const contributions = Array.from({ length: 5 }, (_, index) => ({
      ...base.contributions[0],
      accountId: `contribution-${index}`,
      accountName: `Contribution account ${index}`,
      valueUsd: mcpMoney(1000),
    }));
    harness.sendToolResult(portfolioResult([{ ...base, contributions }]));
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );

    expect(harness.html()).toContain('Contribution account 2');
    expect(harness.html()).not.toContain('Contribution account 3');
    expect(harness.html()).toContain('Show 2 more accounts');

    harness.dispatchClick(actionTarget('toggle-portfolio-contributions'));
    expect(harness.html()).toContain('Contribution account 4');
    expect(harness.html()).toContain('Show fewer accounts');
  });

  it('clears Portfolio context on close, replacement, errors, cancellation, and teardown', () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.dispatchClick(actionTarget('close-position'));

    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );
    expect(harness.html()).not.toContain('Selected holding');

    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-1' }),
    );
    harness.sendToolResult(
      portfolioResult([portfolioPosition(9, { name: 'Replacement Holding' })]),
    );
    expect(harness.html()).toContain('Replacement Holding');
    expect(harness.html()).not.toMatch(/Holding 1|Selected holding/);
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );

    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-9' }),
    );
    harness.sendRuntimeError();
    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );

    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.sendCancelled();
    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );

    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.teardown();
    expect(harness.html()).not.toContain('Holding 0');
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );
  });

  it('clears Portfolio data and selection context at a loading boundary', () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );

    harness.sendToolInput({ accountIds: ['replacement-account'] });

    expect(harness.html()).toContain('Loading live Splice data');
    expect(harness.html()).not.toMatch(/Holding 0|Selected holding/);
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );
  });

  it('retries a rejected Portfolio lifecycle clear at the next boundary', async () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    await flushPromises();

    harness.updateModelContext.mockRejectedValueOnce(
      new Error('lifecycle clear rejected'),
    );
    harness.sendToolInput({ accountIds: ['replacement-account'] });
    await flushPromises();
    expect(harness.updateModelContext).toHaveBeenCalledTimes(2);

    harness.sendRuntimeError();
    await flushPromises();
    expect(harness.updateModelContext).toHaveBeenCalledTimes(3);
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );

    harness.sendCancelled();
    expect(harness.updateModelContext).toHaveBeenCalledTimes(3);
  });

  it('keeps valid Portfolio data visible when model context rejects', async () => {
    const harness = runRuntime('portfolio');
    harness.updateModelContext.mockRejectedValue(
      new Error('private host context failure'),
    );
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    await flushPromises();

    expect(harness.html()).toContain('Holding 0');
    expect(harness.html()).toContain(
      'selection could not be shared with the conversation',
    );
    expect(harness.html()).not.toContain('private host context failure');
  });

  it('clears the prior successful Portfolio identity when a replacement publish rejects', async () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    await flushPromises();

    harness.updateModelContext.mockRejectedValueOnce(
      new Error('replacement context rejected'),
    );
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-1' }),
    );
    await flushPromises();

    expect(harness.updateModelContext).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        structuredContent: expect.objectContaining({
          selection: expect.objectContaining({ securityId: 'security-1' }),
        }),
      }),
    );
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      PORTFOLIO_CLEAR_MODEL_CONTEXT,
    );
    expect(harness.html()).toContain('Holding 1');
    expect(harness.html()).toContain(
      'selection could not be shared with the conversation',
    );
  });

  it('ignores a late replacement clear after a newer Portfolio selection publishes', async () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    await flushPromises();

    let resolveClear: (() => void) | undefined;
    harness.updateModelContext
      .mockRejectedValueOnce(new Error('replacement context rejected'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveClear = () => resolve({});
          }),
      );
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-1' }),
    );
    await flushPromises();

    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-2' }),
    );
    await flushPromises();
    resolveClear?.();
    await flushPromises();

    expect(harness.updateModelContext).toHaveBeenCalledTimes(5);
    expect(harness.updateModelContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        structuredContent: expect.objectContaining({
          selection: expect.objectContaining({ securityId: 'security-2' }),
        }),
      }),
    );
    expect(harness.html()).toContain('Holding 2');
    expect(harness.html()).not.toContain(
      'selection could not be shared with the conversation',
    );
  });

  it('ignores late Portfolio context rejection after a primary replacement', async () => {
    const harness = runRuntime('portfolio');
    let rejectContext: ((error: Error) => void) | undefined;
    harness.updateModelContext.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectContext = reject;
        }),
    );
    harness.sendToolResult(portfolioResult());
    harness.dispatchClick(
      actionTarget('select-position', { securityId: 'security-0' }),
    );
    harness.sendToolResult(
      portfolioResult([portfolioPosition(8, { name: 'Current Holding' })]),
    );
    rejectContext?.(new Error('late private failure'));
    await flushPromises();

    expect(harness.html()).toContain('Current Holding');
    expect(harness.html()).not.toMatch(
      /Holding 0|could not be shared|late private failure/,
    );
  });

  it('renders a purposeful Portfolio empty state and rejects malformed data', () => {
    const harness = runRuntime('portfolio');
    harness.sendToolResult(portfolioResult([]));
    expect(harness.html()).toContain('No investment holdings');
    expect(harness.html()).toContain('$0.00');

    harness.sendToolResult({ app: { id: 'portfolio' }, data: {} });
    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.html()).not.toContain('$0.00');
  });
});
