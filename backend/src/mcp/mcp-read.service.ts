import { createHash } from 'node:crypto';
import { TransactionQueryService } from '../transaction/transaction-query.service';
import {
  ExactDecimal,
  type ExactRateRatio,
  exactDecimal,
} from '../common/exact-money';
import { HoldingsQueryService } from '../investment/holdings-query.service';
import type { InvestmentHoldingSnapshot } from '../types/Investment';
import { fxRequestKey } from '../currency-exchange/currency-exchange.service';
import { CalendarDateSchema, assertDateRange } from '../common/query-bounds';
import type { RateSource } from '../types/ExchangeRate';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  IsNull,
  Repository,
  SelectQueryBuilder,
  type EntityManager,
} from 'typeorm';
import {
  formatAccountLabel,
  getAccountGrouping,
  getAccountGroupingLabel,
  type AccountGrouping,
} from '../account/account-labels';
import { AccountService } from '../account/account.service';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { InvestmentTransactionEntity } from '../investment/investment-transaction.entity';
import { RecurringManualTransactionService } from '../recurring-manual-transaction/recurring-manual-transaction.service';
import {
  getTransactionActivityDate,
  TRANSACTION_ACTIVITY_DATE_EXPRESSION,
} from '../transaction/transaction-date';
import { TransactionEntity } from '../transaction/transaction.entity';
import { AnalysisRuleService } from '../analysis-rule/analysis-rule.service';
import { TransactionCategorizationService } from '../transaction-categorization/categorization-rule.service';
import { CategorizationRuleRecommendationService } from '../transaction-categorization/recommendations/categorization-rule-recommendation.service';
import type { Account } from '../types/Account';
import type { AnalysisRuleView } from '../types/AnalysisRule';
import type { CategorizationRuleView } from '../types/CategorizationRule';
import type { CategorizationRuleRecommendationListResponse } from '../types/CategorizationRuleSuggestion';
import type { RecurringManualTransactionSchedule } from '../types/RecurringManualTransaction';
import {
  MoneyWithSign,
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { toMcpMoney, type McpMoney } from './mcp-money';

const TRANSACTION_DEFAULT_PAGE_SIZE = 50;
const TRANSACTION_MAX_PAGE_SIZE = 100;
const SNAPSHOT_DEFAULT_PAGE_SIZE = 100;
const SNAPSHOT_MAX_PAGE_SIZE = 250;
const INVESTMENT_ACTIVITY_DEFAULT_PAGE_SIZE = 50;
const INVESTMENT_ACTIVITY_MAX_PAGE_SIZE = 100;

interface CursorPayload {
  date: string;
  id: string;
}

interface TransactionCursorPayload {
  activityDate: string;
  id: string;
}

interface InvestmentActivityCursorPayload {
  activityDate: string;
  id: string;
}

export interface McpPageInfo {
  nextCursor: string | null;
  hasMore: boolean;
  continuationReason?: 'scan_budget';
}

export interface McpConversionRate {
  from: string;
  to: string;
  rate: string;
  rateDate: string;
  requestedDate: string;
  source: RateSource;
  ratio: ExactRateRatio;
}

export interface McpConversionMetadata {
  reportingCurrency: string;
  rates: McpConversionRate[];
}

export interface McpAmountFilter {
  min?: string;
  max?: string;
  currency: string;
}

export interface McpListTransactionsOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryPrimary?: string;
  categoryId?: string;
  categoryDetailed?: string;
  merchantQuery?: string;
  amountSign?: MoneySign;
  includePending?: boolean;
  cursor?: string;
  pageSize?: number;
  reportingCurrency: string;
  amountFilter?: McpAmountFilter;
}

export interface McpTransaction {
  id: string;
  accountId: string;
  accountName: string;
  merchantName: string | null;
  pending: boolean;
  activityDate: string;
  reportingDateOverride: string | null;
  providerDate: string;
  providerDatetime: string | null;
  authorizedDate: string | null;
  categoryId: string | null;
  categoryPrimary: string | null;
  categoryPrimaryLabel: string;
  categoryDetailed: string | null;
  categoryDetailedLabel: string | null;
  categoryColor: string | null;
  providerCategoryHint: {
    provider: 'plaid';
    primary: string | null;
    detailed: string | null;
    displayLabel: string | null;
    confidenceLevel: string | null;
    iconUrl: string | null;
  } | null;
  amount: McpMoney;
  convertedAmount: McpMoney;
}

export interface McpListTransactionsResult {
  data: McpTransaction[];
  pageInfo: McpPageInfo;
  conversion: McpConversionMetadata;
  query: {
    startDate?: string;
    endDate?: string;
    accountIds?: string[];
    categoryPrimary?: string;
    categoryId?: string;
    categoryDetailed?: string;
    amountSign?: MoneySign;
    includePending: boolean;
    reportingCurrency: string;
    amountFilter?: McpAmountFilter;
  };
}

export interface McpListBalanceSnapshotsOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  cursor?: string;
  pageSize?: number;
}

export interface McpBalanceSnapshot {
  id: string;
  accountId: string;
  accountName: string;
  accountType: string;
  accountTypeLabel: string;
  accountSubType: string | null;
  accountSubTypeLabel: string | null;
  grouping: AccountGrouping;
  groupingLabel: string;
  institutionName: string | null;
  snapshotDate: string;
  snapshotType: string;
  currentBalance: McpMoney;
  availableBalance: McpMoney;
}

export interface McpListBalanceSnapshotsResult {
  data: McpBalanceSnapshot[];
  pageInfo: McpPageInfo;
  query: {
    startDate?: string;
    endDate?: string;
  };
}

export interface McpListCategoriesOptions {
  startDate?: string;
  endDate?: string;
  includeArchived?: boolean;
}

export interface McpCategory {
  categoryIds: string[];
  primary: string;
  primaryLabel: string;
  description: string | null;
  color: string | null;
  archivedAt: Date | null;
  detailedCategories: Array<{
    id: string;
    detailed: string;
    detailedLabel: string;
    description: string;
    color: string;
    archivedAt: Date | null;
  }>;
  transactionCount?: number;
}

export interface McpListCategoriesResult {
  data: McpCategory[];
  query: {
    startDate?: string;
    endDate?: string;
    includeArchived: boolean;
  };
}

export interface McpListInvestmentHoldingsOptions {
  accountIds?: string[];
  snapshotDate?: string;
  latestOnly?: boolean;
}

export interface McpInvestmentHolding {
  id: string;
  accountId: string;
  accountName: string | null;
  snapshotDate: string;
  provider: string;
  securityId: string;
  securityName: string | null;
  tickerSymbol: string | null;
  type: string | null;
  subtype: string | null;
  quantity: string | null;
  costBasis: string | null;
  institutionPrice: string | null;
  institutionValue: McpMoney | null;
  currency: string | null;
  vestedQuantity: string | null;
  vestedValue: McpMoney | null;
}

export interface McpListInvestmentHoldingsResult {
  data: McpInvestmentHolding[];
  snapshots: Array<{
    accountId: string;
    snapshotDate: string | null;
    holdingCount: number;
  }>;
  query: {
    accountIds?: string[];
    snapshotDate?: string;
    latestOnly: boolean;
  };
}

export interface McpListInvestmentActivityOptions {
  accountIds?: string[];
  startDate?: string;
  endDate?: string;
  type?: string;
  subtype?: string;
  cursor?: string;
  pageSize?: number;
}

export interface McpInvestmentActivity {
  id: string;
  activityId: string;
  accountId: string;
  accountName: string | null;
  provider: string;
  externalActivityId: string | null;
  activityDate: string;
  providerDate: string;
  providerDatetime: string | null;
  amount: McpMoney;
  securityId: string | null;
  externalSecurityId: string | null;
  securityName: string | null;
  tickerSymbol: string | null;
  name: string;
  quantity: string;
  price: string;
  fees: string | null;
  investmentType: string;
  investmentSubtype: string;
  cancelExternalActivityId: string | null;
}

export interface McpListInvestmentActivityResult {
  data: McpInvestmentActivity[];
  pageInfo: McpPageInfo;
  query: {
    accountIds?: string[];
    startDate?: string;
    endDate?: string;
    type?: string;
    subtype?: string;
  };
}

export interface McpListRecurringManualTransactionSchedulesOptions {
  includePaused?: boolean;
}

export interface McpListRecurringManualTransactionSchedulesResult {
  data: RecurringManualTransactionSchedule[];
  query: {
    includePaused: boolean;
  };
}

export interface McpListRulesOptions {
  archived?: boolean;
}

export interface McpListAnalysisRulesResult {
  data: AnalysisRuleView[];
  query: {
    archived: boolean;
  };
}

export interface McpListCategorizationRulesResult {
  data: CategorizationRuleView[];
  query: {
    archived: boolean;
  };
}

export type McpListCategorizationRuleRecommendationsResult =
  CategorizationRuleRecommendationListResponse;

function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase();
}

function formatCategoryLabel(rawLabel: string | null): string {
  return (rawLabel ?? 'UNCATEGORIZED')
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function encodeCursor(
  payload: (CursorPayload | TransactionCursorPayload) & {
    version?: number;
    scope?: string;
  },
): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): CursorPayload | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<CursorPayload>;
    if (typeof parsed.date === 'string' && typeof parsed.id === 'string') {
      return { date: parsed.date, id: parsed.id };
    }
  } catch {
    // Throw below with a stable client-facing message.
  }

  throw new BadRequestException('Invalid cursor.');
}

function decodeTransactionCursor(
  cursor: string | undefined,
  scope: string,
): TransactionCursorPayload | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    if (cursor.length > 2048) throw new Error();
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<TransactionCursorPayload> & {
      version?: number;
      scope?: string;
    };
    if (
      parsed.version !== 1 ||
      parsed.scope !== scope ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        parsed.id,
      )
    )
      throw new Error();
    return {
      activityDate: CalendarDateSchema.parse(parsed.activityDate),
      id: parsed.id,
    };
  } catch {
    // Throw below with a stable client-facing message.
  }

  throw new BadRequestException('Invalid cursor.');
}

function decodeInvestmentActivityCursor(
  cursor: string | undefined,
): InvestmentActivityCursorPayload | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<InvestmentActivityCursorPayload & CursorPayload>;
    if (
      typeof parsed.activityDate === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return { activityDate: parsed.activityDate, id: parsed.id };
    }
    if (typeof parsed.date === 'string' && typeof parsed.id === 'string') {
      return { activityDate: parsed.date, id: parsed.id };
    }
  } catch {
    // Throw below with a stable client-facing message.
  }

  throw new BadRequestException('Invalid cursor.');
}

function clampPageSize(
  pageSize: number | undefined,
  defaultPageSize: number,
  maxPageSize: number,
): number {
  return Math.min(Math.max(pageSize ?? defaultPageSize, 1), maxPageSize);
}

function convertMoney(
  money: SerializedMoneyWithSign,
  targetCurrency: string,
  rate: ExactRateRatio,
  currencyConversionService: CurrencyConversionService,
): SerializedMoneyWithSign {
  if (money.money.currency === targetCurrency) {
    return {
      money: { amount: money.money.amount, currency: targetCurrency },
      sign: money.sign,
    };
  }

  return {
    money: {
      amount: currencyConversionService.convertAmount(
        money.money.amount,
        money.money.currency,
        targetCurrency,
        rate,
      ),
      currency: targetCurrency,
    },
    sign: money.sign,
  };
}

function mcpMoneyFromDecimalString(
  value: string | null,
  currency: string | null,
): McpMoney | null {
  if (value === null || currency === null) return null;
  const amount = exactDecimal(value);
  return toMcpMoney(
    MoneyWithSign.fromMajorUnit(
      normalizeCurrency(currency),
      amount.abs().toFixed(),
      amount.isNegative() ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
    ).toSerialized(),
  );
}

@Injectable()
export class McpReadService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    private readonly holdingsQueryService: HoldingsQueryService,
    @InjectRepository(InvestmentTransactionEntity)
    private readonly investmentTransactionRepository: Repository<InvestmentTransactionEntity>,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly accountService: AccountService,
    private readonly recurringManualTransactionService: RecurringManualTransactionService,
    private readonly analysisRuleService: AnalysisRuleService,
    private readonly transactionCategorizationService: TransactionCategorizationService,
    private readonly categorizationRuleRecommendationService: CategorizationRuleRecommendationService,
    private readonly transactionQueries: TransactionQueryService = new TransactionQueryService(
      transactionRepository,
    ),
  ) {}

  withReadSnapshot<T>(
    reader: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.transactionQueries.withReadSnapshot(reader);
  }

  async listTransactions(
    userId: string,
    options: McpListTransactionsOptions,
  ): Promise<McpListTransactionsResult> {
    const reportingCurrency = normalizeCurrency(options.reportingCurrency);
    const amountFilter = options.amountFilter
      ? {
          ...options.amountFilter,
          currency: normalizeCurrency(options.amountFilter.currency),
        }
      : undefined;

    if (amountFilter && amountFilter.currency !== reportingCurrency) {
      throw new BadRequestException(
        'amountFilter.currency must match reportingCurrency.',
      );
    }
    this.assertCompatibleTransactionFilters(options);

    const pageSize = clampPageSize(
      options.pageSize,
      TRANSACTION_DEFAULT_PAGE_SIZE,
      TRANSACTION_MAX_PAGE_SIZE,
    );
    if (options.startDate || options.endDate)
      assertDateRange(
        options.startDate ?? '0001-01-01',
        options.endDate ?? '9999-12-31',
      );
    if (amountFilter?.min !== undefined) exactDecimal(amountFilter.min);
    if (amountFilter?.max !== undefined) exactDecimal(amountFilter.max);
    if (
      amountFilter?.min !== undefined &&
      amountFilter.max !== undefined &&
      new ExactDecimal(amountFilter.min).gt(amountFilter.max)
    )
      throw new BadRequestException('amountFilter.min must be <= max');
    const cursorScope = createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          startDate: options.startDate,
          endDate: options.endDate,
          accountIds: options.accountIds
            ? [...new Set(options.accountIds)].sort()
            : undefined,
          categoryId: options.categoryId,
          categoryPrimary: options.categoryPrimary,
          categoryDetailed: options.categoryDetailed,
          amountSign: options.amountSign,
          merchantQuery: options.merchantQuery?.trim() || undefined,
          includePending: options.includePending ?? false,
          reportingCurrency,
          amountFilter,
        }),
      )
      .digest('hex');
    const scanLimit = amountFilter ? 5000 : pageSize + 1;
    const cursor = decodeTransactionCursor(options.cursor, cursorScope);
    const { candidates, availableRates } = await this.withReadSnapshot(
      async (manager) => {
        const candidates = await this.transactionQueries.readMcpCandidates(
          userId,
          { ...options, includePending: options.includePending ?? false },
          cursor,
          scanLimit + 1,
          manager,
        );
        // Optional coverage keeps unused lookahead rows from requiring FX, while
        // every quote used below belongs to the same snapshot as these rows.
        const availableRates = await this.loadRates(
          candidates.slice(0, scanLimit),
          reportingCurrency,
          manager,
        );
        return { candidates, availableRates };
      },
    );
    const conversionRates = new Map<string, McpConversionRate>();
    const data: McpTransaction[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;
    let scanBudgetReached = false;
    let lastReturned: TransactionEntity | undefined;
    let lastScanned: TransactionEntity | undefined;
    for (
      let index = 0;
      index < Math.min(candidates.length, scanLimit);
      index++
    ) {
      if (index % 100 === 0) {
        for (const row of candidates.slice(
          index,
          Math.min(index + 100, scanLimit),
        )) {
          const key = fxRequestKey({
            baseCurrency: row.amount.currency,
            targetCurrency: reportingCurrency,
            requestedDate: this.getActivityDate(row),
          });
          const rate = availableRates.get(key);
          if (row.amount.amount !== '0' && rate) conversionRates.set(key, rate);
        }
      }
      const transaction = candidates[index];
      lastScanned = transaction;
      if (!amountFilter && data.length === pageSize) {
        hasMore = true;
        nextCursor = encodeCursor({
          version: 1,
          scope: cursorScope,
          activityDate: this.getActivityDate(lastReturned!),
          id: lastReturned!.id,
        });
        break;
      }
      const mapped = this.toMcpTransaction(
        transaction,
        reportingCurrency,
        conversionRates,
      );
      if (amountFilter && !this.matchesAmountFilter(mapped, amountFilter))
        continue;
      if (data.length === pageSize) {
        hasMore = true;
        nextCursor = encodeCursor({
          version: 1,
          scope: cursorScope,
          activityDate: this.getActivityDate(lastReturned!),
          id: lastReturned!.id,
        });
        break;
      }
      data.push(mapped);
      lastReturned = transaction;
    }
    if (!hasMore && candidates.length > scanLimit && lastScanned) {
      hasMore = true;
      scanBudgetReached = !!amountFilter;
      nextCursor = encodeCursor({
        version: 1,
        scope: cursorScope,
        activityDate: this.getActivityDate(lastScanned),
        id: lastScanned.id,
      });
    }

    return {
      data,
      pageInfo: {
        nextCursor,
        hasMore,
        ...(scanBudgetReached
          ? { continuationReason: 'scan_budget' as const }
          : {}),
      },
      conversion: {
        reportingCurrency,
        rates: Array.from(conversionRates.values()).sort((left, right) =>
          `${left.rateDate}:${left.from}`.localeCompare(
            `${right.rateDate}:${right.from}`,
          ),
        ),
      },
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
        accountIds: options.accountIds,
        categoryPrimary: options.categoryPrimary,
        categoryId: options.categoryId,
        categoryDetailed: options.categoryDetailed,
        amountSign: options.amountSign,
        includePending: options.includePending ?? false,
        reportingCurrency,
        amountFilter,
      },
    };
  }

  async listBalanceSnapshots(
    userId: string,
    options: McpListBalanceSnapshotsOptions,
  ): Promise<McpListBalanceSnapshotsResult> {
    const pageSize = clampPageSize(
      options.pageSize,
      SNAPSHOT_DEFAULT_PAGE_SIZE,
      SNAPSHOT_MAX_PAGE_SIZE,
    );
    const cursor = decodeCursor(options.cursor);

    const query = this.balanceSnapshotRepository
      .createQueryBuilder('snapshot')
      .leftJoinAndSelect('snapshot.account', 'account')
      .leftJoinAndSelect('account.bankLink', 'bankLink')
      .where('snapshot.userId = :userId', { userId })
      .orderBy('snapshot.snapshotDate', 'DESC')
      .addOrderBy('snapshot.id', 'DESC')
      .take(pageSize + 1);

    if (options.startDate) {
      query.andWhere('snapshot.snapshotDate >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options.endDate) {
      query.andWhere('snapshot.snapshotDate <= :endDate', {
        endDate: options.endDate,
      });
    }
    if (options.accountIds?.length) {
      query.andWhere('snapshot.accountId IN (:...accountIds)', {
        accountIds: options.accountIds,
      });
    }
    if (cursor) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('snapshot.snapshotDate < :cursorDate', {
            cursorDate: cursor.date,
          }).orWhere(
            'snapshot.snapshotDate = :cursorDate AND snapshot.id < :cursorId',
            {
              cursorDate: cursor.date,
              cursorId: cursor.id,
            },
          );
        }),
      );
    }

    const rows = await query.getMany();
    const pageRows = rows.slice(0, pageSize);
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((snapshot) => this.toMcpBalanceSnapshot(snapshot)),
      pageInfo: {
        nextCursor:
          rows.length > pageSize && last
            ? encodeCursor({ date: last.snapshotDate, id: last.id })
            : null,
        hasMore: rows.length > pageSize,
      },
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
      },
    };
  }

  async listCategories(
    userId: string,
    options: McpListCategoriesOptions,
  ): Promise<McpListCategoriesResult> {
    const categories = await this.categoryRepository.find({
      where: options.includeArchived
        ? { userId }
        : { userId, archivedAt: IsNull() },
      order: { primary: 'ASC', detailed: 'ASC' },
    });
    const counts = await this.getCategoryCounts(userId, options);
    const categoriesByPrimary = new Map<string, CategoryEntity[]>();

    categories.forEach((category) => {
      const existing = categoriesByPrimary.get(category.primary) ?? [];
      existing.push(category);
      categoriesByPrimary.set(category.primary, existing);
    });

    return {
      data: [
        {
          categoryIds: [],
          primary: 'UNCATEGORIZED',
          primaryLabel: formatCategoryLabel('UNCATEGORIZED'),
          description: 'Transactions with no assigned category.',
          color: null,
          archivedAt: null,
          detailedCategories: [],
          transactionCount: counts.get('UNCATEGORIZED') ?? 0,
        },
        ...Array.from(categoriesByPrimary.entries()).map(
          ([primary, detailedCategories]) => ({
            categoryIds: detailedCategories.map((category) => category.id),
            primary,
            primaryLabel: formatCategoryLabel(primary),
            description: detailedCategories[0]?.description ?? null,
            color: detailedCategories[0]?.color ?? null,
            archivedAt: detailedCategories.every(
              (category) => category.archivedAt !== null,
            )
              ? (detailedCategories[0]?.archivedAt ?? null)
              : null,
            detailedCategories: detailedCategories.map((category) => ({
              id: category.id,
              detailed: category.detailed,
              detailedLabel: formatCategoryLabel(category.detailed),
              description: category.description,
              color: category.color,
              archivedAt: category.archivedAt,
            })),
            transactionCount: counts.get(primary) ?? 0,
          }),
        ),
      ],
      query: {
        startDate: options.startDate,
        endDate: options.endDate,
        includeArchived: options.includeArchived ?? false,
      },
    };
  }

  async listInvestmentHoldings(
    userId: string,
    options: McpListInvestmentHoldingsOptions,
    manager?: EntityManager,
  ): Promise<McpListInvestmentHoldingsResult> {
    if (options.snapshotDate && options.latestOnly !== undefined) {
      throw new BadRequestException(
        'snapshotDate and latestOnly cannot be combined.',
      );
    }
    if (options.latestOnly === false) {
      throw new BadRequestException(
        'latestOnly=false is not supported. Omit latestOnly for latest holdings or use snapshotDate for date-specific holdings.',
      );
    }

    const results = await this.holdingsQueryService.read(
      userId,
      {
        accountIds: options.accountIds,
        snapshotDate: options.snapshotDate,
      },
      manager,
    );
    const accountById = new Map(
      results.map((result) => [result.account.id, result.account.toObject()]),
    );
    return {
      data: results.flatMap((result) =>
        result.snapshot.holdings.map((holding) =>
          this.toMcpInvestmentHolding(holding, accountById),
        ),
      ),
      snapshots: results.map((result) => ({
        accountId: result.account.id,
        snapshotDate: result.snapshot.snapshotDate,
        holdingCount: result.snapshot.holdings.length,
      })),
      query: {
        accountIds: options.accountIds,
        snapshotDate: options.snapshotDate,
        latestOnly: !options.snapshotDate,
      },
    };
  }

  async listInvestmentActivity(
    userId: string,
    options: McpListInvestmentActivityOptions,
  ): Promise<McpListInvestmentActivityResult> {
    if (
      options.startDate &&
      options.endDate &&
      options.startDate > options.endDate
    ) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    const pageSize = clampPageSize(
      options.pageSize,
      INVESTMENT_ACTIVITY_DEFAULT_PAGE_SIZE,
      INVESTMENT_ACTIVITY_MAX_PAGE_SIZE,
    );
    const cursor = decodeInvestmentActivityCursor(options.cursor);
    const query = this.buildInvestmentActivityQuery(
      userId,
      options,
      cursor,
    ).take(pageSize + 1);
    const rows = await query.getMany();
    const pageRows = rows.slice(0, pageSize);
    const last = pageRows[pageRows.length - 1];

    return {
      data: pageRows.map((transaction) =>
        this.toMcpInvestmentActivity(transaction),
      ),
      pageInfo: {
        nextCursor:
          rows.length > pageSize && last
            ? encodeCursor({
                activityDate: last.activity.activityDate,
                id: last.id,
              })
            : null,
        hasMore: rows.length > pageSize,
      },
      query: {
        accountIds: options.accountIds,
        startDate: options.startDate,
        endDate: options.endDate,
        type: options.type,
        subtype: options.subtype,
      },
    };
  }

  async listRecurringManualTransactionSchedules(
    userId: string,
    options: McpListRecurringManualTransactionSchedulesOptions,
  ): Promise<McpListRecurringManualTransactionSchedulesResult> {
    const includePaused = options.includePaused ?? true;
    const schedules =
      await this.recurringManualTransactionService.findAll(userId);

    return {
      data: includePaused
        ? schedules
        : schedules.filter((schedule) => schedule.pausedAt === null),
      query: { includePaused },
    };
  }

  async listAnalysisRules(
    userId: string,
    options: McpListRulesOptions,
  ): Promise<McpListAnalysisRulesResult> {
    const archived = options.archived ?? false;

    return {
      data: await this.analysisRuleService.findAll(userId, {
        archivedMode: archived,
      }),
      query: { archived },
    };
  }

  async listCategorizationRules(
    userId: string,
    options: McpListRulesOptions,
  ): Promise<McpListCategorizationRulesResult> {
    const archived = options.archived ?? false;

    return {
      data: await this.transactionCategorizationService.findAll(userId, {
        archivedMode: archived,
      }),
      query: { archived },
    };
  }

  async listCategorizationRuleRecommendations(
    userId: string,
  ): Promise<McpListCategorizationRuleRecommendationsResult> {
    return this.categorizationRuleRecommendationService.list(userId);
  }

  private assertCompatibleTransactionFilters(
    options: McpListTransactionsOptions,
  ): void {
    if (
      options.categoryId &&
      (options.categoryPrimary || options.categoryDetailed)
    ) {
      throw new BadRequestException(
        'categoryId cannot be combined with categoryPrimary or categoryDetailed.',
      );
    }

    if (
      options.categoryPrimary === 'UNCATEGORIZED' &&
      options.categoryDetailed
    ) {
      throw new BadRequestException(
        'categoryDetailed cannot be combined with categoryPrimary UNCATEGORIZED.',
      );
    }
  }

  private isInvestmentAccount(account: Account): boolean {
    return (
      String(account.type) === 'investment' ||
      String(account.type) === 'brokerage' ||
      String(account.subType) === 'brokerage'
    );
  }

  private assertOwnedAccountIds(
    accountIds: string[],
    accountById: Map<string, Account>,
  ): void {
    const unknownAccountIds = accountIds.filter(
      (accountId) => !accountById.has(accountId),
    );

    if (unknownAccountIds.length > 0) {
      throw new BadRequestException(
        `Unknown accountIds: ${unknownAccountIds.join(', ')}`,
      );
    }
  }

  private toMcpInvestmentHolding(
    holding: InvestmentHoldingSnapshot,
    accountById: Map<string, Account>,
  ): McpInvestmentHolding {
    const currency =
      holding.isoCurrencyCode ?? holding.unofficialCurrencyCode ?? null;
    const fallbackAccount = accountById.get(holding.accountId);

    return {
      id: holding.id,
      accountId: holding.accountId,
      accountName: fallbackAccount?.customName ?? fallbackAccount?.name ?? null,
      snapshotDate: holding.snapshotDate,
      provider: holding.provider,
      securityId: holding.securityId,
      securityName: holding.security?.name ?? null,
      tickerSymbol: holding.security?.tickerSymbol ?? null,
      type: holding.security?.type ?? null,
      subtype: holding.security?.subtype ?? null,
      quantity: holding.quantity,
      costBasis: holding.costBasis,
      institutionPrice: holding.institutionPrice,
      institutionValue: mcpMoneyFromDecimalString(
        holding.institutionValue,
        currency,
      ),
      currency,
      vestedQuantity: holding.vestedQuantity,
      vestedValue: mcpMoneyFromDecimalString(holding.vestedValue, currency),
    };
  }

  private buildInvestmentActivityQuery(
    userId: string,
    options: McpListInvestmentActivityOptions,
    cursor: InvestmentActivityCursorPayload | undefined,
  ): SelectQueryBuilder<InvestmentTransactionEntity> {
    const query = this.investmentTransactionRepository
      .createQueryBuilder('investmentTransaction')
      .leftJoinAndSelect('investmentTransaction.activity', 'activity')
      .leftJoinAndSelect('activity.account', 'account')
      .leftJoinAndSelect('investmentTransaction.security', 'security')
      .where('investmentTransaction.userId = :userId', { userId })
      .andWhere('activity.activityKind = :activityKind', {
        activityKind: 'investment_transaction',
      })
      .orderBy('activity.activityDate', 'DESC')
      .addOrderBy('investmentTransaction.id', 'DESC');

    if (options.accountIds?.length) {
      query.andWhere('activity.accountId IN (:...accountIds)', {
        accountIds: options.accountIds,
      });
    }
    if (options.startDate) {
      query.andWhere('activity.activityDate >= :startDate', {
        startDate: options.startDate,
      });
    }
    if (options.endDate) {
      query.andWhere('activity.activityDate <= :endDate', {
        endDate: options.endDate,
      });
    }
    if (options.type) {
      query.andWhere('investmentTransaction.investmentType = :investmentType', {
        investmentType: options.type,
      });
    }
    if (options.subtype) {
      query.andWhere(
        'investmentTransaction.investmentSubtype = :investmentSubtype',
        { investmentSubtype: options.subtype },
      );
    }
    if (cursor) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('activity.activityDate < :cursorActivityDate', {
            cursorActivityDate: cursor.activityDate,
          }).orWhere(
            'activity.activityDate = :cursorActivityDate AND investmentTransaction.id < :cursorId',
            {
              cursorActivityDate: cursor.activityDate,
              cursorId: cursor.id,
            },
          );
        }),
      );
    }

    return query;
  }

  private toMcpInvestmentActivity(
    transaction: InvestmentTransactionEntity,
  ): McpInvestmentActivity {
    const activity = transaction.activity;
    const account = activity.account;

    return {
      id: transaction.id,
      activityId: transaction.activityId,
      accountId: activity.accountId,
      accountName: account?.customName ?? account?.name ?? null,
      provider: activity.provider,
      externalActivityId: activity.externalActivityId,
      activityDate: activity.activityDate,
      providerDate: activity.providerDate,
      providerDatetime: activity.providerDatetime,
      amount: toMcpMoney(activity.amount.toMoneyWithSign()),
      securityId: transaction.securityId,
      externalSecurityId: transaction.externalSecurityId,
      securityName: transaction.security?.name ?? null,
      tickerSymbol: transaction.security?.tickerSymbol ?? null,
      name: transaction.name,
      quantity: transaction.quantity,
      price: transaction.price,
      fees: transaction.fees,
      investmentType: transaction.investmentType,
      investmentSubtype: transaction.investmentSubtype,
      cancelExternalActivityId: transaction.cancelExternalActivityId,
    };
  }

  private toMcpTransaction(
    transaction: TransactionEntity,
    reportingCurrency: string,
    conversionRates: Map<string, McpConversionRate>,
  ): McpTransaction {
    const nativeAmount = transaction.amount.toMoneyWithSign();
    const category = transaction.category;
    const providerCategoryHint = transaction.toObject().providerCategoryHint;
    const rate =
      nativeAmount.money.amount === '0' ||
      nativeAmount.money.currency === reportingCurrency
        ? { numerator: '1', denominator: '1' }
        : this.getRate(
            nativeAmount.money.currency,
            reportingCurrency,
            this.getActivityDate(transaction),
            conversionRates,
          );
    const convertedAmount = convertMoney(
      nativeAmount,
      reportingCurrency,
      rate,
      this.currencyConversionService,
    );

    return {
      id: transaction.id,
      accountId: transaction.accountId,
      accountName:
        transaction.account?.customName ??
        transaction.account?.name ??
        'Account',
      merchantName: transaction.merchantName,
      pending: transaction.pending,
      activityDate: this.getActivityDate(transaction),
      reportingDateOverride: transaction.reportingDateOverride,
      providerDate: transaction.providerDate,
      providerDatetime: transaction.providerDatetime,
      authorizedDate: transaction.authorizedDate,
      categoryId: category?.id ?? null,
      categoryPrimary: category?.primary ?? null,
      categoryPrimaryLabel: formatCategoryLabel(category?.primary ?? null),
      categoryDetailed: category?.detailed ?? null,
      categoryDetailedLabel: category?.detailed
        ? formatCategoryLabel(category.detailed)
        : null,
      categoryColor: category?.color ?? null,
      providerCategoryHint,
      amount: toMcpMoney(nativeAmount),
      convertedAmount: toMcpMoney(convertedAmount),
    };
  }

  private async loadRates(
    transactions: TransactionEntity[],
    to: string,
    manager: EntityManager,
  ): Promise<Map<string, McpConversionRate>> {
    const conversionRates = new Map<string, McpConversionRate>();
    const requests = transactions
      .filter((transaction) => transaction.amount.amount !== '0')
      .map((transaction) => ({
        baseCurrency: transaction.amount.currency,
        targetCurrency: to,
        requestedDate: this.getActivityDate(transaction),
      }));
    if (!requests.length) return conversionRates;
    const resolved = await this.currencyConversionService.getResolvedRates(
      requests,
      manager,
      { allowMissing: true },
    );
    for (const [key, rate] of resolved)
      conversionRates.set(key, {
        from: rate.baseCurrency,
        to: rate.targetCurrency,
        rate: rate.rate,
        ratio: rate.ratio,
        requestedDate: rate.requestedDate,
        rateDate: rate.rateDate,
        source: rate.source,
      });
    return conversionRates;
  }

  private getRate(
    fromCurrency: string,
    toCurrency: string,
    requestedDate: string,
    conversionRates: Map<string, McpConversionRate>,
  ): ExactRateRatio {
    const key = fxRequestKey({
      baseCurrency: fromCurrency,
      targetCurrency: toCurrency,
      requestedDate,
    });
    const cached = conversionRates.get(key);
    if (!cached)
      throw new BadRequestException(
        'Required transaction conversion was not resolved',
      );
    return cached.ratio;
  }

  private getActivityDate(transaction: TransactionEntity): string {
    return getTransactionActivityDate(transaction);
  }

  private matchesAmountFilter(
    transaction: McpTransaction,
    amountFilter: McpAmountFilter,
  ): boolean {
    const amount = new ExactDecimal(transaction.convertedAmount.amount);
    return (
      transaction.convertedAmount.currency === amountFilter.currency &&
      (amountFilter.min === undefined || amount.gte(amountFilter.min)) &&
      (amountFilter.max === undefined || amount.lte(amountFilter.max))
    );
  }

  private toMcpBalanceSnapshot(
    snapshot: BalanceSnapshotEntity,
  ): McpBalanceSnapshot {
    const account = snapshot.account;
    const accountType = String(account.type);
    const accountSubType = account.subType ?? null;
    const grouping = getAccountGrouping(accountType);

    return {
      id: snapshot.id,
      accountId: snapshot.accountId,
      accountName: account.customName ?? account.name ?? 'Account',
      accountType,
      accountTypeLabel: formatAccountLabel(accountType),
      accountSubType,
      accountSubTypeLabel: accountSubType
        ? formatAccountLabel(accountSubType)
        : null,
      grouping,
      groupingLabel: getAccountGroupingLabel(grouping),
      institutionName: account.bankLink?.institutionName ?? null,
      snapshotDate: snapshot.snapshotDate,
      snapshotType: snapshot.snapshotType,
      currentBalance: toMcpMoney(snapshot.currentBalance.toMoneyWithSign()),
      availableBalance: toMcpMoney(snapshot.availableBalance.toMoneyWithSign()),
    };
  }

  private async getCategoryCounts(
    userId: string,
    options: McpListCategoriesOptions,
  ): Promise<Map<string, number>> {
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.activity', 'activity')
      .leftJoin('transaction.category', 'category')
      .select('COALESCE(category.primary, :uncategorized)', 'primary')
      .addSelect('COUNT(transaction.id)', 'count')
      .where('activity.userId = :userId', { userId })
      .setParameter('uncategorized', 'UNCATEGORIZED')
      .groupBy('COALESCE(category.primary, :uncategorized)');

    if (options.startDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} >= :startDate`, {
        startDate: options.startDate,
      });
    }
    if (options.endDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} <= :endDate`, {
        endDate: options.endDate,
      });
    }

    const rows = await query.getRawMany<{ primary: string; count: string }>();
    return new Map(
      rows.map((row) => [row.primary, Number.parseInt(row.count, 10)]),
    );
  }
}
