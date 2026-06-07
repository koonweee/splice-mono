import vm from 'node:vm';
import { getMcpAppRuntimeScript } from '../../src/mcp/apps/app-runtime';

type Listener = (event: { data: unknown }) => void;

interface RuntimeHarness {
  html: () => string;
  messages: Array<Record<string, unknown>>;
  status: { textContent: string; dataset: Record<string, string> };
  dispatchHostMessage: (data: Record<string, unknown>) => void;
  dispatchInput: (target: RuntimeTarget) => void;
  dispatchChange: (target: RuntimeTarget) => void;
  dispatchClick: (target: RuntimeTarget) => void;
}

interface RuntimeTarget {
  id?: string;
  value?: string;
  checked?: boolean;
  dataset?: Record<string, string>;
  closest?: (selector: string) => RuntimeTarget | null;
}

function runRuntime(appId: string, fixture: unknown): RuntimeHarness {
  const appRoot = {
    innerHTML: '',
    getAttribute: (name: string) => (name === 'data-app-id' ? appId : null),
  };
  const status = {
    textContent: '',
    dataset: {} as Record<string, string>,
  };
  const elements: Record<string, unknown> = {
    'splice-mcp-app-root': appRoot,
    'splice-mcp-app-fixture': { textContent: JSON.stringify(fixture) },
    'app-status': status,
    'cashflow-start': { value: '2026-03-01' },
    'cashflow-end': { value: '2026-03-31' },
    'portfolio-snapshot-date': { value: '2026-03-31' },
  };
  const documentListeners: Record<
    string,
    (event: { target: RuntimeTarget }) => void
  > = {};
  let messageListener: Listener | undefined;
  const messages: Array<Record<string, unknown>> = [];
  const parentWindow = {
    postMessage: (message: Record<string, unknown>) => {
      messages.push(message);
    },
  };
  const windowObject = {
    parent: parentWindow,
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'message') messageListener = listener;
    },
    setTimeout: () => 0,
  };

  const sandbox = {
    console,
    Intl,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    window: windowObject,
    document: {
      documentElement: {
        dataset: {} as Record<string, string>,
        scrollHeight: 600,
        scrollWidth: 800,
        style: { setProperty: jest.fn() },
      },
      body: {
        scrollHeight: 600,
        scrollWidth: 800,
      },
      getElementById: (id: string) => elements[id] ?? null,
      addEventListener: (
        type: string,
        listener: (event: { target: RuntimeTarget }) => void,
      ) => {
        documentListeners[type] = listener;
      },
    },
  };
  vm.runInNewContext(getMcpAppRuntimeScript(), sandbox);

  return {
    html: () => appRoot.innerHTML,
    messages,
    status,
    dispatchHostMessage: (data) => {
      if (!messageListener) throw new Error('message listener was not set');
      messageListener({ data });
    },
    dispatchInput: (target) => {
      documentListeners.input?.({ target });
    },
    dispatchChange: (target) => {
      documentListeners.change?.({ target });
    },
    dispatchClick: (target) => {
      documentListeners.click?.({ target });
    },
  };
}

function actionTarget(action: string, dataset: Record<string, string> = {}) {
  const target: RuntimeTarget = {
    dataset: { action, ...dataset },
  };
  target.closest = () => target;
  return target;
}

function resolveRequest(
  harness: RuntimeHarness,
  method: string,
  result: Record<string, unknown>,
) {
  const message = harness.messages.find((entry) => entry.method === method);
  if (!message) throw new Error(`Expected ${method} request`);
  harness.dispatchHostMessage({
    jsonrpc: '2.0',
    id: message.id,
    result,
  });
}

describe('MCP app runtime bridge', () => {
  it('hydrates cashflow input/result notifications and calls read-only server tools', async () => {
    const harness = runRuntime('cashflow_explorer', {
      data: {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        currency: 'USD',
        totals: { totalInflow: 0, totalOutflow: 0, netFlow: 0 },
        inflows: [],
        outflows: [],
      },
    });

    expect(harness.messages[0]).toMatchObject({ method: 'ui/initialize' });
    resolveRequest(harness, 'ui/initialize', {
      hostContext: { theme: 'dark' },
    });
    await Promise.resolve();
    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        method: 'ui/notifications/initialized',
      }),
    );

    harness.dispatchHostMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-input',
      params: { arguments: { startDate: '2026-04-01', endDate: '2026-04-30' } },
    });
    harness.dispatchHostMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: {
        structuredContent: {
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
        },
      },
    });

    expect(harness.html()).toContain('2026-04-01');
    harness.dispatchClick(
      actionTarget('select-category', {
        category: 'FOOD_AND_DRINK',
      }),
    );

    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        method: 'tools/call',
        params: expect.objectContaining({
          name: 'list_cashflow_category_transactions',
          arguments: expect.objectContaining({
            categoryPrimary: 'FOOD_AND_DRINK',
            flowDirection: 'outflow',
          }),
        }),
      }),
    );
  });

  it('blocks invalid scenario summaries and sends valid model context updates', async () => {
    const harness = runRuntime('projection_scenario_modeler', {
      data: {
        accounts: [
          {
            id: 'account-1',
            displayName: 'Checking',
            balance: { amount: 1000, currency: 'USD' },
          },
        ],
        recurringSchedules: [],
      },
    });
    resolveRequest(harness, 'ui/initialize', { hostContext: {} });
    await Promise.resolve();

    harness.dispatchInput({
      dataset: { scenarioField: 'expectedReturn' },
      value: 'not-a-number',
    });
    harness.dispatchClick(actionTarget('send-scenario'));

    expect(harness.status).toMatchObject({
      textContent: 'Fix scenario validation errors before sending summary.',
      dataset: { kind: 'error' },
    });
    expect(harness.messages).not.toContainEqual(
      expect.objectContaining({ method: 'ui/update-model-context' }),
    );

    harness.dispatchInput({
      dataset: { scenarioField: 'expectedReturn' },
      value: '5',
    });
    harness.dispatchClick(actionTarget('send-scenario'));

    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        method: 'ui/update-model-context',
        params: expect.objectContaining({
          content: [
            expect.objectContaining({
              type: 'text',
            }),
          ],
          structuredContent: expect.objectContaining({
            scenario: expect.any(Object),
            summary: expect.any(Object),
          }),
        }),
      }),
    );
  });

  it('uses snapshotDate, not latestOnly=false, for date-specific holdings reloads', async () => {
    const harness = runRuntime('portfolio_viewer', {
      data: {
        holdings: { data: [], query: { latestOnly: true } },
        activity: { data: [], pageInfo: { nextCursor: null, hasMore: false } },
      },
    });
    resolveRequest(harness, 'ui/initialize', { hostContext: {} });
    await Promise.resolve();

    harness.dispatchChange({ id: 'portfolio-date-mode', value: 'date' });
    harness.dispatchInput({
      id: 'portfolio-snapshot-date',
      value: '2026-03-31',
    });
    harness.dispatchClick(actionTarget('reload-portfolio'));

    expect(harness.messages).toContainEqual(
      expect.objectContaining({
        method: 'tools/call',
        params: expect.objectContaining({
          name: 'list_investment_holdings',
          arguments: expect.objectContaining({
            snapshotDate: '2026-03-31',
          }),
        }),
      }),
    );
    expect(harness.messages).not.toContainEqual(
      expect.objectContaining({
        method: 'tools/call',
        params: expect.objectContaining({
          name: 'list_investment_holdings',
          arguments: expect.objectContaining({
            latestOnly: false,
          }),
        }),
      }),
    );
  });
});
