import { BalanceProvenanceSchema } from '../types/BalanceQuery';
import { RateWithSourceSchema } from '../types/ExchangeRate';
import { z } from 'zod';
import {
  ExactDecimal as Decimal,
  DECIMAL_PATTERN,
} from '../common/exact-money';
import { CalendarDateSchema } from '../common/query-bounds';
import { MoneySign } from '../types/MoneyWithSign';

const DateStringSchema = CalendarDateSchema;
const McpAmountSchema = z
  .string()
  .max(156)
  .regex(DECIMAL_PATTERN, 'Use nonnegative decimal major-unit text');

export const McpMoneySchema = z
  .object({
    amount: McpAmountSchema,
    currency: z.string(),
    sign: z.nativeEnum(MoneySign),
  })
  .passthrough();

export const McpPageInfoSchema = z
  .object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .passthrough();

export const McpQuerySchema = z.record(z.string(), z.unknown());
export const McpLooseObjectSchema = z.object({}).passthrough();

const MoneyLikeRecordSchema = z
  .object({
    amount: McpAmountSchema.optional(),
    currency: z.string().optional(),
    sign: z.nativeEnum(MoneySign).optional(),
  })
  .passthrough();

export const GetUserContextOutputSchema = z
  .object({
    userId: z.string(),
    email: z.string(),
    currency: z.string(),
    timezone: z.string(),
    today: DateStringSchema,
  })
  .passthrough();

export const AccountsSnapshotOutputSchema = z
  .object({
    matchedCount: z.number().optional(),
    truncated: z.boolean().optional(),
    reportingCurrency: z.string().optional(),
    fxReferenceDate: DateStringSchema.optional(),
    dateBasis: z.literal('current_account_record_with_UTC_date_FX').optional(),
    accounts: z.array(
      z
        .object({
          reportingBalance: McpMoneySchema.nullable().optional(),
          reportingCoverage: z.enum(['available', 'missing_fx']).optional(),
          exchangeRate: RateWithSourceSchema.nullable().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const BalanceEndpointOutputSchema = z.object({
  date: DateStringSchema,
  nativeBalance: McpMoneySchema,
  reportingBalance: McpMoneySchema,
  netWorthContribution: McpMoneySchema,
  provenance: BalanceProvenanceSchema.nullable(),
  exchangeRate: RateWithSourceSchema.nullable(),
  latestAccountSyncAt: z.string().nullable(),
});
export const BalanceAttributionOutputSchema = z.object({
  basis: z.literal('recorded_balance_change'),
  reportingCurrency: z.string(),
  startDate: DateStringSchema,
  endDate: DateStringSchema,
  coverage: z.enum(['no_accounts', 'missing_snapshots', 'complete']),
  openingNetWorth: McpMoneySchema,
  closingNetWorth: McpMoneySchema,
  change: McpMoneySchema,
  accounts: z.array(
    z.object({
      rank: z.number().int().positive(),
      accountId: z.string().uuid(),
      accountName: z.string().nullable(),
      type: z.string(),
      isLiability: z.boolean(),
      opening: BalanceEndpointOutputSchema,
      closing: BalanceEndpointOutputSchema,
      nativeBalanceChange: McpMoneySchema.nullable(),
      contribution: McpMoneySchema,
    }),
  ),
  reconciliation: z.object({
    contributionTotal: McpMoneySchema,
    residual: McpMoneySchema,
    exact: z.boolean(),
  }),
  limitations: z.array(z.string()),
});

export const BalanceHistoryOutputSchema = z
  .object({
    netWorth: MoneyLikeRecordSchema.optional(),
    chartData: z.array(z.unknown()).optional(),
    assets: z.array(z.unknown()).optional(),
    liabilities: z.array(z.unknown()).optional(),
    endpoints: BalanceAttributionOutputSchema.optional(),
  })
  .passthrough();

export const SearchTransactionsOutputSchema = z
  .object({
    matchedCount: z.number().optional(),
    truncated: z.boolean().optional(),
    transactions: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const PaginatedListOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    pageInfo: McpPageInfoSchema,
    query: McpQuerySchema.optional(),
  })
  .passthrough();

export const BalanceSnapshotsOutputSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string().uuid(),
          accountId: z.string().uuid(),
          snapshotDate: DateStringSchema,
          snapshotType: z.string(),
          currentBalance: McpMoneySchema,
          availableBalance: McpMoneySchema,
          reportingCurrentBalance: McpMoneySchema.nullable(),
          reportingAvailableBalance: McpMoneySchema.nullable(),
          currentBalanceFx: RateWithSourceSchema.nullable(),
          availableBalanceFx: RateWithSourceSchema.nullable(),
          snapshotUpdatedAt: z.string().nullable(),
        })
        .passthrough(),
    ),
    pageInfo: McpPageInfoSchema,
    query: McpQuerySchema,
  })
  .passthrough();

export const CategoriesOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: McpQuerySchema,
  })
  .passthrough();

const HoldingOutputSchema = z
  .object({
    id: z.string().uuid(),
    accountId: z.string().uuid(),
    accountName: z.string().nullable(),
    snapshotDate: DateStringSchema,
    provider: z.string(),
    securityId: z.string().uuid(),
    securityName: z.string().nullable(),
    tickerSymbol: z.string().nullable(),
    type: z.string().nullable(),
    subtype: z.string().nullable(),
    quantity: z.string().nullable(),
    costBasis: z.string().nullable(),
    institutionPrice: z.string().nullable(),
    institutionValue: McpMoneySchema.nullable(),
    currency: z.string().nullable(),
    vestedQuantity: z.string().nullable(),
    vestedValue: McpMoneySchema.nullable(),
    institutionPriceAsOf: DateStringSchema.nullable(),
    institutionPriceDatetime: z.string().nullable(),
    securityIdentifiers: z.object({
      isin: z.string().nullable(),
      cusip: z.string().nullable(),
      sedol: z.string().nullable(),
      externalSecurityId: z.string().nullable(),
      provider: z.string().nullable(),
    }),
    marketIdentifierCode: z.string().nullable(),
    securityCurrency: z.string().nullable(),
    securityClosePrice: z.string().nullable(),
    securityClosePriceAsOf: DateStringSchema.nullable(),
    securityUpdatedAt: z.string().nullable(),
  })
  .passthrough();

export const InvestmentHoldingsOutputSchema = z
  .object({
    data: z.array(HoldingOutputSchema),
    snapshots: z
      .array(
        z.object({
          accountId: z.string().uuid(),
          snapshotDate: DateStringSchema.nullable(),
          holdingCount: z.number().int().nonnegative(),
          snapshotId: z.string().uuid().nullable(),
          completedAt: z.string().nullable(),
          carriedForward: z.boolean(),
          coverage: z.enum(['missing', 'empty', 'recorded']),
        }),
      )
      .optional(),
    query: z
      .object({
        latestOnly: z.boolean(),
        dateMode: z.enum(['latest', 'exact', 'on_or_before']).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const HoldingsDatesOutputSchema = z.object({
  data: z.array(
    z.object({
      accountId: z.string().uuid(),
      snapshotId: z.string().uuid(),
      snapshotDate: DateStringSchema,
      provider: z.string(),
      revision: z.number().int(),
      completedAt: z.string(),
    }),
  ),
  truncated: z.boolean(),
  limit: z.number().int(),
  query: McpQuerySchema,
});

const HistoricalPriceEvidenceSchema = z.object({
  price: McpAmountSchema,
  adjustedClose: McpAmountSchema.nullable(),
  currency: z.string(),
  priceDate: DateStringSchema,
  priceDatetime: z.string().nullable(),
  source: z.enum(['yahoo_chart', 'stored_institution_price']),
  observationSnapshotId: z.string().uuid().nullable(),
  observationSnapshotDate: DateStringSchema.nullable(),
});
const HistoricalPriceEndpointSchema = z.object({
  requestedDate: DateStringSchema,
  status: z.enum(['available', 'missing', 'ambiguous']),
  price: HistoricalPriceEvidenceSchema.nullable(),
  carriedForward: z.boolean(),
});
export const HistoricalSecurityEvidenceSchema = z.object({
  securityId: z.string().uuid(),
  identifiers: z.object({
    provider: z.enum(['yahoo', 'plaid']),
    externalSecurityId: z.string(),
    isin: z.string().nullable(),
    cusip: z.string().nullable(),
    sedol: z.string().nullable(),
    tickerSymbol: z.string().nullable(),
  }),
  mapping: z.enum(['stored_yahoo_identity', 'unmapped']),
  proxy: z.null(),
  providerStatus: z.enum(['ok', 'empty', 'error', 'unavailable', 'unmapped']),
  exchange: z.string().nullable(),
  exchangeTimezone: z.string().nullable(),
  corporateActionsPresent: z.boolean().nullable(),
  priceBasis: z.enum([
    'provider_close_adjustment_unverified',
    'institution_price_adjustment_unknown',
  ]),
  prices: z.array(HistoricalPriceEvidenceSchema),
  storedPrices: z.array(HistoricalPriceEvidenceSchema),
  endpoints: z.object({
    opening: HistoricalPriceEndpointSchema,
    closing: HistoricalPriceEndpointSchema,
  }),
});
export const HistoricalValuationEvidenceOutputSchema = z.object({
  basis: z.literal('historical_valuation_evidence'),
  query: McpQuerySchema,
  data: z.array(HistoricalSecurityEvidenceSchema),
  storedPricesTruncated: z.boolean(),
  fx: z.array(
    z.object({
      baseCurrency: z.string(),
      targetCurrency: z.string(),
      requestedDate: DateStringSchema,
      status: z.enum(['available', 'missing']),
      evidence: RateWithSourceSchema.nullable(),
    }),
  ),
  limitations: z.array(z.string()),
});

const PortfolioUsdMoneySchema = z
  .object({
    amount: McpAmountSchema.refine((amount) => {
      const decimal = new Decimal(amount);
      return (
        decimal.decimalPlaces() <= 2 && decimal.mul(100).lte('9'.repeat(78))
      );
    }, 'Use a USD decimal amount in whole cents within 78 minor-unit digits'),
    currency: z.literal('USD'),
    sign: z.literal(MoneySign.POSITIVE),
  })
  .strict();

const PortfolioAccountContributionSchema = z
  .object({
    accountId: z.string().uuid(),
    accountName: z.string().nullable(),
    snapshotDate: DateStringSchema,
    quantity: z.string().nullable(),
    valueUsd: PortfolioUsdMoneySchema,
    priceUsd: PortfolioUsdMoneySchema.nullable(),
  })
  .strict();

const PortfolioPositionSchema = z
  .object({
    securityId: z.string().uuid(),
    securityName: z.string().nullable(),
    tickerSymbol: z.string().nullable(),
    type: z.string().nullable(),
    subtype: z.string().nullable(),
    quantity: z.string().nullable(),
    valueUsd: PortfolioUsdMoneySchema,
    allocationBps: z.number().int().min(0).max(10_000),
    contributions: z.array(PortfolioAccountContributionSchema),
  })
  .strict();

export const PortfolioVisualizationDataSchema = z
  .object({
    reportingCurrency: z.literal('USD'),
    totalValueUsd: PortfolioUsdMoneySchema,
    snapshotRange: z
      .object({
        earliest: DateStringSchema,
        latest: DateStringSchema,
      })
      .strict()
      .nullable(),
    selectedAccountIds: z.array(z.string().uuid()).optional(),
    positions: z.array(PortfolioPositionSchema),
  })
  .strict();
export type PortfolioVisualizationData = z.infer<
  typeof PortfolioVisualizationDataSchema
>;

export const PortfolioVisualizationOutputSchema = z
  .object({
    app: z
      .object({
        id: z.literal('portfolio'),
        title: z.literal('Portfolio'),
        description: z.string(),
        resourceName: z.string(),
        resourceUri: z.literal('ui://splice/portfolio/v3.html'),
        initialToolName: z.literal('visualize_portfolio'),
      })
      .strict(),
    data: PortfolioVisualizationDataSchema,
    fallback: z.string(),
  })
  .strict();
export type PortfolioVisualizationOutput = z.infer<
  typeof PortfolioVisualizationOutputSchema
>;

export const RecurringSchedulesOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: z
      .object({
        includePaused: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

export const RuleListOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: z
      .object({
        archived: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

export const CategorizationRecommendationsOutputSchema = z
  .object({
    generation: z.unknown().nullable().optional(),
    suggestions: z.array(z.unknown()).optional(),
  })
  .passthrough();

const CategorizationPreviewCountsSchema = z
  .object({
    matched: z.number().int(),
    updated: z.number().int(),
    skippedManual: z.number().int(),
    manualAgreement: z.number().int().optional(),
    manualConflicts: z.number().int().optional(),
    existingRuleOverlap: z.number().int().optional(),
  })
  .passthrough();

export const ManualCategorizedExamplesOutputSchema = z
  .object({
    transactions: z.array(z.unknown()),
  })
  .passthrough();

export const RuleCandidatePatternsOutputSchema = z
  .object({
    filters: z
      .object({
        fields: z.array(z.string()),
        minAgreement: z.number(),
        maxConflictRate: z.number(),
        limit: z.number(),
      })
      .passthrough(),
    candidates: z.array(z.unknown()),
  })
  .passthrough();

export const CategorizationRuleDraftPreviewOutputSchema =
  CategorizationPreviewCountsSchema.extend({
    transactions: z.array(z.unknown()),
    normalizedDraft: z
      .object({
        targetCategoryId: z.string().uuid(),
        priority: z.number().int().optional(),
        conditions: z.array(z.unknown()),
      })
      .passthrough(),
    previewToken: z.string(),
  }).passthrough();

export const CreateCategorizationRuleOutputSchema = z
  .object({
    rule: z.unknown(),
  })
  .passthrough();

export const CategorizationRuleChangePreviewOutputSchema = z
  .object({
    action: z.enum(['edit', 'archive', 'restore']),
    currentRule: z.unknown(),
    proposedRule: z.unknown(),
    impact: z.object({
      matchedBefore: z.number().int(),
      matchedAfter: z.number().int(),
      newlyMatched: z.number().int(),
      noLongerMatched: z.number().int(),
      winningBefore: z.number().int(),
      winningAfter: z.number().int(),
      winnerChanged: z.number().int(),
      skippedManual: z.number().int(),
      historicalAssignments: z.number().int(),
      historicalAssignmentsUntouched: z.literal(true),
    }),
    transactions: z.array(z.unknown()),
    normalizedChanges: z.record(z.string(), z.unknown()).optional(),
    previewToken: z.string(),
  })
  .passthrough();

export const CategorizationRuleApplicationPreviewOutputSchema =
  CategorizationPreviewCountsSchema.extend({
    transactions: z.array(z.unknown()),
    previewToken: z.string(),
  }).passthrough();

export const ApplyCategorizationRuleOutputSchema =
  CategorizationPreviewCountsSchema;

export const CashflowAnalysisOutputSchema = z
  .object({
    startDate: DateStringSchema,
    endDate: DateStringSchema,
    currency: z.string(),
    totals: z
      .object({
        totalInflow: McpMoneySchema,
        totalOutflow: McpMoneySchema,
        netFlow: McpMoneySchema,
        uncategorizedInflow: McpMoneySchema,
        uncategorizedOutflow: McpMoneySchema,
      })
      .passthrough(),
    inflows: z.array(z.unknown()),
    outflows: z.array(z.unknown()),
  })
  .passthrough();

const CashFlowCategoryAggregateSchema = z
  .object({
    primaryCategory: z.string(),
    totalAmount: McpMoneySchema,
    currency: z.string(),
    transactionCount: z.number().int().nonnegative(),
    color: z.string(),
  })
  .strict();

const CashFlowPresentationAnalysisSchema = CashflowAnalysisOutputSchema.extend({
  inflows: z.array(CashFlowCategoryAggregateSchema),
  outflows: z.array(CashFlowCategoryAggregateSchema),
}).strict();

export const CashFlowAdjustmentSummarySchema = z
  .object({
    affected: z.boolean(),
    excludedTransactionCount: z.number().int().nonnegative(),
    neutralizedPairCount: z.number().int().nonnegative(),
  })
  .strict();
export type CashFlowAdjustmentSummary = z.infer<
  typeof CashFlowAdjustmentSummarySchema
>;

export const CashFlowPeriodSchema = z
  .object({
    analysis: CashFlowPresentationAnalysisSchema,
    adjustments: CashFlowAdjustmentSummarySchema,
  })
  .strict();
export type CashFlowPeriod = z.infer<typeof CashFlowPeriodSchema>;

export const CashFlowVisualizationDataSchema = z
  .object({
    presentation: z
      .object({
        direction: z.enum(['outflow', 'inflow']),
        focusCategoryPrimary: z.string().optional(),
      })
      .strict(),
    current: CashFlowPeriodSchema,
    comparison: CashFlowPeriodSchema.optional(),
  })
  .strict();
export type CashFlowVisualizationData = z.infer<
  typeof CashFlowVisualizationDataSchema
>;

export const CashFlowVisualizationOutputSchema = z
  .object({
    app: z
      .object({
        id: z.literal('cash_flow'),
        title: z.literal('Cash Flow'),
        description: z.string(),
        resourceName: z.string(),
        resourceUri: z.literal('ui://splice/cash-flow/v3.html'),
        initialToolName: z.literal('visualize_cash_flow'),
      })
      .strict(),
    data: CashFlowVisualizationDataSchema,
    fallback: z.string(),
  })
  .strict();
export type CashFlowVisualizationOutput = z.infer<
  typeof CashFlowVisualizationOutputSchema
>;

export const CashflowCategoryTransactionsOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: McpQuerySchema,
  })
  .passthrough();

export const CashflowAuditOutputSchema = z
  .object({
    rows: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const AppToolOutputSchema = z
  .object({
    app: z
      .object({
        id: z.string(),
        title: z.string(),
        resourceUri: z.string(),
      })
      .passthrough(),
    data: z.unknown().optional(),
    fallback: z.string(),
  })
  .passthrough();

export const ProjectionAssumptionsOutputSchema = z
  .object({
    source: z.enum(['elicited', 'fallback']),
    assumptions: z.unknown().optional(),
    inputRequired: z.unknown().optional(),
  })
  .passthrough();
