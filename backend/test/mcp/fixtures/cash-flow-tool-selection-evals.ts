export interface CashFlowToolSelectionEvalCase {
  readonly id: string;
  readonly prompt: string;
  readonly requiredToolsInOrder: readonly string[];
  readonly forbiddenTools: readonly string[];
  readonly expectedDirection?: 'outflow' | 'inflow';
}

export const CASH_FLOW_TOOL_SELECTION_EVALS: readonly CashFlowToolSelectionEvalCase[] =
  [
    {
      id: 'broad-expenses-last-month',
      prompt: 'What were my expenses like last month?',
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'outflow',
    },
    {
      id: 'conversational-spending-last-month',
      prompt: 'How was my spending last month?',
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'outflow',
    },
    {
      id: 'money-destination-july',
      prompt: 'Where did my money go in July?',
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'outflow',
    },
    {
      id: 'show-expenses-july',
      prompt: 'Show me my expenses for July.',
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'outflow',
    },
    {
      id: 'cash-flow-this-month',
      prompt: "How's my cash flow this month?",
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'outflow',
    },
    {
      id: 'income-last-month',
      prompt: 'What was my income like last month?',
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'inflow',
    },
    {
      id: 'comparison-july-june',
      prompt: 'How does July spending compare with June?',
      requiredToolsInOrder: ['get_user_context', 'visualize_cash_flow'],
      forbiddenTools: [],
      expectedDirection: 'outflow',
    },
    {
      id: 'conceptual-cash-flow',
      prompt: 'What does cash flow mean?',
      requiredToolsInOrder: [],
      forbiddenTools: ['visualize_cash_flow'],
    },
    {
      id: 'explicit-prose-only',
      prompt:
        'How much did I spend last month? Answer in prose, no visualization.',
      requiredToolsInOrder: ['get_user_context', 'get_cashflow_analysis'],
      forbiddenTools: ['visualize_cash_flow'],
    },
    {
      id: 'largest-transactions',
      prompt: 'List my five largest transactions in July.',
      requiredToolsInOrder: ['get_user_context', 'list_transactions'],
      forbiddenTools: ['visualize_cash_flow'],
    },
    {
      id: 'capability-discovery',
      prompt: 'What visualizations can Splice render?',
      requiredToolsInOrder: [],
      forbiddenTools: ['visualize_cash_flow'],
    },
  ];
