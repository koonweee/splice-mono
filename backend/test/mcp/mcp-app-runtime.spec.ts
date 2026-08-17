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
      updateModelContext: jest.fn(),
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
    'cashflow-start': { value: '2026-04-01' },
    'cashflow-end': { value: '2026-04-30' },
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

describe('Splice MCP App runtime integration', () => {
  it('starts with a neutral loading state and no business data', () => {
    const harness = runRuntime('cashflow_explorer');

    expect(harness.connect).toHaveBeenCalledTimes(1);
    expect(harness.options).toMatchObject({
      appInfo: { name: 'Splice Cashflow Explorer', version: '2.0.0' },
      capabilities: { availableDisplayModes: ['inline', 'fullscreen'] },
    });
    expect(harness.options.safeAreaElement).toBe(harness.safeAreaRoot);
    expect(harness.options.safeAreaElement).not.toBe(harness.appRoot);
    expect(harness.html()).toContain('Loading live Splice data');
    expect(harness.html()).not.toMatch(/\$|fixture|2026-03|6250|3120|3130/i);
  });

  it('shows a truthful error when the host connection fails', async () => {
    const harness = runRuntime('cashflow_explorer', {
      connectFailure: true,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.html()).not.toContain('host unavailable');
  });

  it('renders only a host-delivered cashflow result and uses the typed helper client', async () => {
    const harness = runRuntime('cashflow_explorer');
    harness.sendToolInput({
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });
    harness.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        currency: 'USD',
        totals: {
          totalInflow: { amount: 1200, currency: 'USD' },
          totalOutflow: { amount: 450, currency: 'USD' },
          netFlow: { amount: 750, currency: 'USD' },
        },
        inflows: [],
        outflows: [
          {
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: { amount: 450, currency: 'USD' },
            transactionCount: 2,
          },
        ],
      },
    });

    expect(harness.html()).toContain('2026-04-01');
    expect(harness.html()).toContain('$1,200.00');

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
      }),
    });
  });

  it('renders all four views from host-delivered structured results', () => {
    const cases = [
      {
        id: 'cashflow_explorer',
        expected: 'Cashflow Explorer',
        data: {
          currency: 'USD',
          totals: {},
          inflows: [],
          outflows: [],
        },
      },
      {
        id: 'projection_scenario_modeler',
        expected: 'Projection Scenario Modeler',
        data: { accounts: [], recurringSchedules: [] },
      },
      {
        id: 'portfolio_viewer',
        expected: 'Portfolio Viewer',
        data: { holdings: { data: [] }, activity: { data: [] } },
      },
      {
        id: 'category_rule_workbench',
        expected: 'Category Rule Workbench',
        data: {
          categories: [],
          analysisRules: [],
          categorizationRules: [],
          recommendations: [],
        },
      },
    ];

    for (const testCase of cases) {
      const harness = runRuntime(testCase.id);
      harness.sendToolResult({
        app: { id: testCase.id },
        data: testCase.data,
      });
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

  it('never restores helper, audit, or detail data across primary lifecycle boundaries', async () => {
    const cashflow = runRuntime('cashflow_explorer');
    cashflow.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        currency: 'USD',
        totals: {},
        inflows: [],
        outflows: [
          {
            primaryCategory: 'PRIVATE_CATEGORY',
            totalAmount: { amount: 10, currency: 'USD' },
          },
        ],
      },
    });
    cashflow.callServerTool
      .mockResolvedValueOnce({
        structuredContent: {
          data: [
            {
              merchantName: 'Private Drilldown Merchant',
              amount: { amount: 10, currency: 'USD' },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        structuredContent: {
          rows: [{ merchantName: 'Private Audit Row', effect: 'private' }],
        },
      });

    cashflow.dispatchClick(
      actionTarget('select-category', { category: 'PRIVATE_CATEGORY' }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    cashflow.dispatchClick(actionTarget('load-audit'));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cashflow.html()).toContain('Private Drilldown Merchant');
    expect(cashflow.html()).toContain('Private Audit Row');

    cashflow.sendToolInput({ startDate: '2026-05-01' });
    expect(cashflow.html()).not.toMatch(
      /Private Drilldown Merchant|Private Audit Row/,
    );
    cashflow.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        currency: 'USD',
        totals: {},
        inflows: [],
        outflows: [],
      },
    });
    expect(cashflow.html()).not.toMatch(
      /Private Drilldown Merchant|Private Audit Row/,
    );

    const rules = runRuntime('category_rule_workbench');
    rules.sendToolResult({
      app: { id: 'category_rule_workbench' },
      data: {
        categories: [{ label: 'Private Category Detail' }],
        analysisRules: [],
        categorizationRules: [],
        recommendations: [],
      },
    });
    rules.dispatchClick({
      dataset: { detail: JSON.stringify({ secret: 'Private Detail Value' }) },
      closest() {
        return this;
      },
    });
    expect(rules.html()).toContain('Private Detail Value');

    rules.sendToolResult({
      app: { id: 'category_rule_workbench' },
      data: {
        categories: [{ label: 'Different Category' }],
        analysisRules: [],
        categorizationRules: [],
        recommendations: [],
      },
    });
    expect(rules.html()).toContain('Different Category');
    expect(rules.html()).not.toMatch(
      /Private Category Detail|Private Detail Value/,
    );

    rules.dispatchClick({
      dataset: { detail: JSON.stringify({ secret: 'Second Private Detail' }) },
      closest() {
        return this;
      },
    });
    expect(rules.html()).toContain('Second Private Detail');
    rules.sendRuntimeError();
    expect(rules.html()).not.toContain('Second Private Detail');
    rules.sendToolResult({
      app: { id: 'category_rule_workbench' },
      data: {
        categories: [{ label: 'Final Category' }],
        analysisRules: [],
        categorizationRules: [],
        recommendations: [],
      },
    });
    expect(rules.html()).toContain('Final Category');
    expect(rules.html()).not.toMatch(
      /Private Category Detail|Private Detail Value|Second Private Detail/,
    );
  });

  it('ignores an in-flight helper result from an earlier primary result', async () => {
    const harness = runRuntime('cashflow_explorer');
    harness.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        currency: 'USD',
        totals: {},
        inflows: [],
        outflows: [{ primaryCategory: 'OLD_CATEGORY', totalAmount: 1 }],
      },
    });

    let resolveHelper: ((value: unknown) => void) | undefined;
    harness.callServerTool.mockReturnValue(
      new Promise((resolve) => {
        resolveHelper = resolve;
      }),
    );
    harness.dispatchClick(
      actionTarget('select-category', { category: 'OLD_CATEGORY' }),
    );

    harness.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        currency: 'USD',
        totals: {},
        inflows: [],
        outflows: [{ primaryCategory: 'NEW_CATEGORY', totalAmount: 2 }],
      },
    });
    resolveHelper?.({
      structuredContent: {
        data: [{ merchantName: 'Private Late Helper Result' }],
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.html()).toContain('New Category');
    expect(harness.html()).not.toMatch(
      /Old Category|Private Late Helper Result/,
    );
  });

  it('starts cashflow reload as a boundary and ignores older helper results', async () => {
    const harness = runRuntime('cashflow_explorer');
    harness.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        currency: 'USD',
        totals: {},
        inflows: [],
        outflows: [{ primaryCategory: 'OLD_CATEGORY', totalAmount: 1 }],
      },
    });

    let resolveDrilldown: ((value: unknown) => void) | undefined;
    let resolveAudit: ((value: unknown) => void) | undefined;
    harness.callServerTool.mockImplementation(({ name }: { name: string }) => {
      if (name === 'list_cashflow_category_transactions') {
        return new Promise((resolve) => {
          resolveDrilldown = resolve;
        });
      }
      if (name === 'get_cashflow_analysis_audit') {
        return new Promise((resolve) => {
          resolveAudit = resolve;
        });
      }
      return Promise.resolve({
        structuredContent: {
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          currency: 'USD',
          totals: {},
          inflows: [],
          outflows: [
            { primaryCategory: 'NEW_RELOAD_CATEGORY', totalAmount: 2 },
          ],
        },
      });
    });
    harness.dispatchClick(
      actionTarget('select-category', { category: 'OLD_CATEGORY' }),
    );
    harness.dispatchClick(actionTarget('load-audit'));
    harness.dispatchClick(actionTarget('reload-cashflow'));

    expect(harness.html()).toContain('Loading live Splice data');
    await new Promise<void>((resolve) => setImmediate(resolve));
    resolveDrilldown?.({
      structuredContent: {
        data: [{ merchantName: 'Private Late Drilldown' }],
      },
    });
    resolveAudit?.({
      structuredContent: {
        rows: [{ merchantName: 'Private Late Audit' }],
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.html()).toContain('New Reload Category');
    expect(harness.html()).not.toMatch(
      /Old Category|Private Late Drilldown|Private Late Audit/,
    );
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

  it('clears live data when a read-only helper tool fails', async () => {
    const harness = runRuntime('cashflow_explorer');
    harness.sendToolResult({
      app: { id: 'cashflow_explorer' },
      data: {
        currency: 'USD',
        totals: {},
        inflows: [],
        outflows: [
          {
            primaryCategory: 'TEST_CATEGORY',
            totalAmount: { amount: 42, currency: 'USD' },
          },
        ],
      },
    });
    expect(harness.html()).toContain('Test Category');
    harness.callServerTool.mockRejectedValue(new Error('private helper error'));

    harness.dispatchClick(
      actionTarget('select-category', { category: 'TEST_CATEGORY' }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(harness.html()).toContain('Unable to load live Splice data');
    expect(harness.html()).not.toContain('private helper error');
    expect(harness.html()).not.toContain('Test Category');
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

  it('sends valid projection summaries through the typed runtime API', async () => {
    const harness = runRuntime('projection_scenario_modeler');
    harness.sendToolResult({
      app: { id: 'projection_scenario_modeler' },
      data: {
        accounts: [
          {
            id: 'account-test',
            displayName: 'Test Account',
            balance: { amount: 1000, currency: 'USD' },
          },
        ],
        recurringSchedules: [],
      },
    });
    harness.updateModelContext.mockResolvedValue(undefined);
    harness.dispatchInput({
      dataset: { scenarioField: 'horizonDate' },
      value: '2027-04-30',
    });
    harness.dispatchClick(actionTarget('send-scenario'));
    await Promise.resolve();

    expect(harness.updateModelContext).toHaveBeenCalledWith({
      content: [expect.objectContaining({ type: 'text' })],
      structuredContent: expect.objectContaining({
        scenario: expect.any(Object),
        summary: expect.any(Object),
      }),
    });
  });

  it('rebases projection account choices before sending model context', async () => {
    const harness = runRuntime('projection_scenario_modeler');
    harness.sendToolResult({
      app: { id: 'projection_scenario_modeler' },
      data: {
        accounts: [
          {
            id: 'old-account',
            displayName: 'Old Account',
            balance: { amount: 1000, currency: 'USD' },
          },
        ],
        recurringSchedules: [],
      },
    });
    harness.dispatchClick({
      checked: false,
      dataset: { action: 'toggle-account', account: 'old-account' },
      closest() {
        return this;
      },
    });

    harness.sendToolResult({
      app: { id: 'projection_scenario_modeler' },
      data: {
        accounts: [
          {
            id: 'new-account',
            displayName: 'New Account',
            balance: { amount: 2000, currency: 'USD' },
          },
        ],
        recurringSchedules: [],
      },
    });
    harness.updateModelContext.mockResolvedValue(undefined);
    harness.dispatchInput({
      dataset: { scenarioField: 'horizonDate' },
      value: '2027-04-30',
    });
    harness.dispatchClick(actionTarget('send-scenario'));
    await Promise.resolve();

    expect(harness.updateModelContext).toHaveBeenCalledWith(
      expect.objectContaining({
        structuredContent: expect.objectContaining({
          scenario: expect.objectContaining({
            selectedAccounts: { 'new-account': true },
          }),
        }),
      }),
    );
    expect(JSON.stringify(harness.updateModelContext.mock.calls)).not.toContain(
      'old-account',
    );
  });
});
