import { MoneySign } from '../../types/MoneyWithSign';

export const MCP_APP_FIXTURES = {
  cashflow_explorer: {
    app: {
      id: 'cashflow_explorer',
      title: 'Cashflow Explorer',
      resourceUri: 'ui://splice/cashflow-explorer.html',
    },
    fallback:
      'Fixture data for local rendering. Live MCP hosts pass tool results into this app.',
    data: {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      currency: 'USD',
      totals: {
        totalInflow: {
          amount: 6250,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
        totalOutflow: {
          amount: 3120,
          currency: 'USD',
          sign: MoneySign.NEGATIVE,
        },
        netFlow: {
          amount: 3130,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
        uncategorizedInflow: {
          amount: 0,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
        uncategorizedOutflow: {
          amount: 180,
          currency: 'USD',
          sign: MoneySign.NEGATIVE,
        },
      },
      inflows: [
        {
          primaryCategory: 'INCOME',
          totalAmount: {
            amount: 6250,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          },
          transactionCount: 2,
          color: '#2f9e44',
        },
      ],
      outflows: [
        {
          primaryCategory: 'HOUSING',
          totalAmount: {
            amount: 1800,
            currency: 'USD',
            sign: MoneySign.NEGATIVE,
          },
          transactionCount: 1,
          color: '#2563eb',
        },
        {
          primaryCategory: 'FOOD_AND_DRINK',
          totalAmount: {
            amount: 720,
            currency: 'USD',
            sign: MoneySign.NEGATIVE,
          },
          transactionCount: 8,
          color: '#f59f00',
        },
        {
          primaryCategory: 'TRANSPORTATION',
          totalAmount: {
            amount: 420,
            currency: 'USD',
            sign: MoneySign.NEGATIVE,
          },
          transactionCount: 5,
          color: '#0f766e',
        },
      ],
      fixtureDrilldowns: {
        outflow: {
          FOOD_AND_DRINK: [
            {
              id: 'fixture-transaction-1',
              activityDate: '2026-03-08',
              merchantName: 'Neighborhood Market',
              name: 'Neighborhood Market',
              categoryPrimary: 'FOOD_AND_DRINK',
              amount: {
                amount: 84.32,
                currency: 'USD',
                sign: MoneySign.NEGATIVE,
              },
            },
            {
              id: 'fixture-transaction-2',
              activityDate: '2026-03-17',
              merchantName: 'Coffee Bar',
              name: 'Coffee Bar',
              categoryPrimary: 'FOOD_AND_DRINK',
              amount: {
                amount: 12.45,
                currency: 'USD',
                sign: MoneySign.NEGATIVE,
              },
            },
          ],
        },
        inflow: {
          INCOME: [
            {
              id: 'fixture-income-1',
              activityDate: '2026-03-15',
              merchantName: 'Payroll',
              name: 'Payroll',
              categoryPrimary: 'INCOME',
              amount: {
                amount: 3125,
                currency: 'USD',
                sign: MoneySign.POSITIVE,
              },
            },
          ],
        },
      },
      fixtureAudit: {
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        neutralizationLookaroundDays: 3,
        rows: [
          {
            id: 'fixture-audit-1',
            activityDate: '2026-03-19',
            merchantName: 'Refund Match',
            effect: 'neutralized',
            reason: 'Matched refund inside the configured lookaround window.',
            amount: {
              amount: 48,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
      },
    },
  },
  projection_scenario_modeler: {
    app: {
      id: 'projection_scenario_modeler',
      title: 'Projection Scenario Modeler',
      resourceUri: 'ui://splice/projection-scenario-modeler.html',
    },
    fallback:
      'Fixture data for local rendering. Live MCP hosts pass tool results into this app.',
    data: {
      accounts: {
        accounts: [
          {
            id: 'fixture-account-1',
            displayName: 'Checking',
            groupingLabel: 'Cash',
            balance: {
              amount: 8200,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
          {
            id: 'fixture-account-2',
            displayName: 'Brokerage',
            groupingLabel: 'Investments',
            balance: {
              amount: 24500,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
      },
      recurringSchedules: {
        data: [
          {
            id: 'fixture-schedule-1',
            description: 'Monthly rent',
            frequency: 'monthly',
            status: 'active',
            amount: {
              amount: 1800,
              currency: 'USD',
              sign: MoneySign.NEGATIVE,
            },
          },
          {
            id: 'fixture-schedule-2',
            description: 'Payroll',
            frequency: 'monthly',
            status: 'active',
            amount: {
              amount: 6250,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
          },
        ],
        query: { includePaused: false },
      },
    },
  },
  portfolio_viewer: {
    app: {
      id: 'portfolio_viewer',
      title: 'Portfolio Viewer',
      resourceUri: 'ui://splice/portfolio-viewer.html',
    },
    fallback:
      'Fixture data for local rendering. Live MCP hosts pass tool results into this app.',
    data: {
      holdings: {
        data: [
          {
            id: 'fixture-holding-1',
            accountId: 'fixture-account-2',
            accountName: 'Brokerage',
            quantity: '42.5',
            institutionPrice: '194.12',
            institutionValue: '8250.10',
            isoCurrencyCode: 'USD',
            security: {
              name: 'Total Market ETF',
              tickerSymbol: 'VTI',
              type: 'etf',
              isoCurrencyCode: 'USD',
            },
          },
          {
            id: 'fixture-holding-2',
            accountId: 'fixture-account-2',
            accountName: 'Brokerage',
            quantity: '18',
            institutionPrice: '501.22',
            institutionValue: '9021.96',
            isoCurrencyCode: 'USD',
            security: {
              name: 'Large Cap Growth Fund',
              tickerSymbol: 'LCG',
              type: 'mutual fund',
              isoCurrencyCode: 'USD',
            },
          },
        ],
        query: { latestOnly: true },
      },
      activity: {
        data: [
          {
            id: 'fixture-activity-1',
            accountId: 'fixture-account-2',
            activityDate: '2026-03-20',
            name: 'Dividend reinvestment',
            investmentType: 'dividend',
            investmentSubtype: 'reinvest',
            quantity: '0.42',
            price: '194.12',
            fees: '0',
            amount: {
              amount: 81.53,
              currency: 'USD',
              sign: MoneySign.POSITIVE,
            },
            security: {
              name: 'Total Market ETF',
              tickerSymbol: 'VTI',
            },
          },
        ],
        pageInfo: { nextCursor: null, hasMore: false },
        query: {},
      },
    },
  },
  category_rule_workbench: {
    app: {
      id: 'category_rule_workbench',
      title: 'Category Rule Workbench',
      resourceUri: 'ui://splice/category-rule-workbench.html',
    },
    fallback:
      'Fixture data for local rendering. Live MCP hosts pass tool results into this app.',
    data: {
      categories: {
        data: [
          {
            id: 'fixture-category-1',
            primary: 'FOOD_AND_DRINK',
            detailed: 'GROCERIES',
            label: 'Food and Drink / Groceries',
            color: '#f59f00',
            archived: false,
          },
          {
            id: 'fixture-category-2',
            primary: 'INCOME',
            detailed: 'PAYROLL',
            label: 'Income / Payroll',
            color: '#2f9e44',
            archived: false,
          },
        ],
        query: { includeArchived: false },
      },
      analysisRules: {
        data: [
          {
            id: 'fixture-analysis-rule-1',
            name: 'Ignore internal transfers',
            type: 'exclude',
            status: 'active',
            scopeSummary: 'Transfer categories',
          },
        ],
        query: { archived: false },
      },
      categorizationRules: {
        data: [
          {
            id: 'fixture-categorization-rule-1',
            name: 'Coffee shops',
            status: 'active',
            priority: 10,
            targetCategory: 'Food and Drink / Coffee',
            conditions: [
              { field: 'merchantName', operator: 'contains', value: 'coffee' },
            ],
          },
        ],
        query: { archived: false },
      },
      recommendations: {
        generation: null,
        suggestions: [
          {
            id: 'fixture-recommendation-1',
            name: 'Grocery stores',
            reason:
              'Several manually categorized grocery transactions match merchant text.',
            proposedCategory: 'Food and Drink / Groceries',
            confidence: 0.86,
          },
        ],
      },
      fixtureAudit: {
        rows: [
          {
            id: 'fixture-rule-effect-1',
            activityDate: '2026-03-14',
            merchantName: 'Transfer',
            effect: 'excluded',
            ruleName: 'Ignore internal transfers',
            reason: 'Matched transfer exclusion rule.',
          },
        ],
      },
    },
  },
} as const;
