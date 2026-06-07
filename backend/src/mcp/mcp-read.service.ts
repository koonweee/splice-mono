import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository, SelectQueryBuilder } from 'typeorm';
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
import { InvestmentHoldingSnapshotEntity } from '../investment/investment-holding-snapshot.entity';
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
  getDecimalPlaces,
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { toMcpMoney, type McpMoney } from './mcp-money';

const TRANSACTION_DEFAULT_PAGE_SIZE = 50;
const TRANSACTION_MAX_PAGE_SIZE = 100;
const SNAPSHOT_DEFAULT_PAGE_SIZE = 100;
const SNAPSHOT_MAX_PAGE_SIZE = 250;
const CANDIDATE_BATCH_SIZE = 250;
const INVESTMENT_ACTIVITY_DEFAULT_PAGE_SIZE = 50;
const INVESTMENT_ACTIVITY_MAX_PAGE_SIZE = 100;
const ACTIVITY_DATE_SORT_ALIAS = 'activity_date_sort';

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
}

export interface McpConversionRate {
  from: string;
  to: string;
  rate: number;
  rateDate: string;
}

export interface McpConversionMetadata {
  reportingCurrency: string;
  rates: McpConversionRate[];
}

export interface McpAmountFilter {
  min?: number;
  max?: number;
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
  payload: CursorPayload | TransactionCursorPayload,
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
): TransactionCursorPayload | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<TransactionCursorPayload & CursorPayload>;
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
  rate: number,
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

function signedMajorAmount(money: McpMoney): number {
  return money.sign === MoneySign.NEGATIVE ? -money.amount : money.amount;
}

function mcpMoneyFromDecimalString(
  value: string | null,
  currency: string | null,
): McpMoney | null {
  if (!value || !currency) {
    return null;
  }

  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const normalizedCurrency = normalizeCurrency(currency);
  const decimals = getDecimalPlaces(normalizedCurrency);

  return {
    amount: Number(Math.abs(amount).toFixed(decimals)),
    currency: normalizedCurrency,
    sign: amount < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
  };
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
    @InjectRepository(InvestmentHoldingSnapshotEntity)
    private readonly investmentHoldingRepository: Repository<InvestmentHoldingSnapshotEntity>,
    @InjectRepository(InvestmentTransactionEntity)
    private readonly investmentTransactionRepository: Repository<InvestmentTransactionEntity>,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly accountService: AccountService,
    private readonly recurringManualTransactionService: RecurringManualTransactionService,
    private readonly analysisRuleService: AnalysisRuleService,
    private readonly transactionCategorizationService: TransactionCategorizationService,
    private readonly categorizationRuleRecommendationService: CategorizationRuleRecommendationService,
  ) {}

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
    const query = this.buildTransactionQuery(userId, options);
    const conversionRates = new Map<string, McpConversionRate>();
    const data: McpTransaction[] = [];
    let cursor = decodeTransactionCursor(options.cursor);
    let hasMore = false;
    let nextCursor: string | null = null;

    while (data.length < pageSize) {
      const batch = await this.applyTransactionCursor(query.clone(), cursor)
        .take(CANDIDATE_BATCH_SIZE)
        .getMany();

      if (batch.length === 0) {
        hasMore = false;
        nextCursor = null;
        break;
      }

      for (const transaction of batch) {
        const mapped = await this.toMcpTransaction(
          transaction,
          reportingCurrency,
          conversionRates,
        );

        if (amountFilter && !this.matchesAmountFilter(mapped, amountFilter)) {
          continue;
        }

        data.push(mapped);
        if (data.length === pageSize) {
          nextCursor = encodeCursor({
            activityDate: this.getActivityDate(transaction),
            id: transaction.id,
          });
          hasMore = true;
          break;
        }
      }

      if (data.length === pageSize) {
        break;
      }

      const lastCandidate = batch[batch.length - 1];
      cursor = {
        activityDate: this.getActivityDate(lastCandidate),
        id: lastCandidate.id,
      };
      hasMore = batch.length === CANDIDATE_BATCH_SIZE;

      if (!hasMore) {
        nextCursor = null;
        break;
      }
    }

    return {
      data,
      pageInfo: {
        nextCursor,
        hasMore,
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

    const accounts = await this.accountService.findAll(userId);
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const targetAccountIds = options.accountIds?.length
      ? options.accountIds
      : accounts
          .filter((account) => this.isInvestmentAccount(account))
          .map((account) => account.id);

    this.assertOwnedAccountIds(targetAccountIds, accountById);

    const holdings = options.snapshotDate
      ? await this.findHoldingsForSnapshotDate(
          userId,
          targetAccountIds,
          options.snapshotDate,
        )
      : await this.findLatestHoldings(userId, targetAccountIds);

    return {
      data: holdings.map((holding) =>
        this.toMcpInvestmentHolding(holding, accountById),
      ),
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

  private async findLatestHoldings(
    userId: string,
    accountIds: string[],
  ): Promise<InvestmentHoldingSnapshotEntity[]> {
    const holdings: InvestmentHoldingSnapshotEntity[] = [];

    for (const accountId of accountIds) {
      const latest = await this.investmentHoldingRepository.findOne({
        where: { userId, accountId },
        order: { snapshotDate: 'DESC', updatedAt: 'DESC' },
      });

      if (!latest) {
        continue;
      }

      holdings.push(
        ...(await this.findHoldingsForSnapshotDate(
          userId,
          [accountId],
          latest.snapshotDate,
        )),
      );
    }

    return holdings.sort((left, right) =>
      `${right.snapshotDate}:${right.accountId}:${right.id}`.localeCompare(
        `${left.snapshotDate}:${left.accountId}:${left.id}`,
      ),
    );
  }

  private findHoldingsForSnapshotDate(
    userId: string,
    accountIds: string[],
    snapshotDate: string,
  ): Promise<InvestmentHoldingSnapshotEntity[]> {
    if (accountIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.investmentHoldingRepository
      .createQueryBuilder('holding')
      .leftJoinAndSelect('holding.account', 'account')
      .leftJoinAndSelect('holding.security', 'security')
      .where('holding.userId = :userId', { userId })
      .andWhere('holding.accountId IN (:...accountIds)', { accountIds })
      .andWhere('holding.snapshotDate = :snapshotDate', { snapshotDate })
      .orderBy('holding.snapshotDate', 'DESC')
      .addOrderBy('holding.accountId', 'ASC')
      .addOrderBy('holding.institutionValue', 'DESC')
      .addOrderBy('holding.id', 'ASC')
      .getMany();
  }

  private toMcpInvestmentHolding(
    holding: InvestmentHoldingSnapshotEntity,
    accountById: Map<string, Account>,
  ): McpInvestmentHolding {
    const currency =
      holding.isoCurrencyCode ?? holding.unofficialCurrencyCode ?? null;
    const fallbackAccount = accountById.get(holding.accountId);

    return {
      id: holding.id,
      accountId: holding.accountId,
      accountName:
        holding.account?.customName ??
        fallbackAccount?.customName ??
        holding.account?.name ??
        fallbackAccount?.name ??
        null,
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

  private buildTransactionQuery(
    userId: string,
    options: McpListTransactionsOptions,
  ): SelectQueryBuilder<TransactionEntity> {
    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.activity', 'activity')
      .leftJoinAndSelect('activity.account', 'account')
      .leftJoinAndSelect('account.bankLink', 'bankLink')
      .leftJoinAndSelect('transaction.category', 'category')
      .addSelect(TRANSACTION_ACTIVITY_DATE_EXPRESSION, ACTIVITY_DATE_SORT_ALIAS)
      .where('activity.userId = :userId', { userId })
      .orderBy(ACTIVITY_DATE_SORT_ALIAS, 'DESC')
      .addOrderBy('transaction.id', 'DESC');

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
    if (options.accountIds?.length) {
      query.andWhere('activity.accountId IN (:...accountIds)', {
        accountIds: options.accountIds,
      });
    }
    if (!options.includePending) {
      query.andWhere('transaction.pending = false');
    }
    if (options.amountSign) {
      query.andWhere('activity.amountSign = :amountSign', {
        amountSign: options.amountSign,
      });
    }
    if (options.categoryId) {
      if (options.categoryId === 'UNCATEGORIZED') {
        query.andWhere('transaction.categoryId IS NULL');
      } else {
        query.andWhere('transaction.categoryId = :categoryId', {
          categoryId: options.categoryId,
        });
      }
    }
    if (options.categoryPrimary) {
      if (options.categoryPrimary === 'UNCATEGORIZED') {
        query.andWhere('transaction.categoryId IS NULL');
      } else {
        query.andWhere('category.primary = :categoryPrimary', {
          categoryPrimary: options.categoryPrimary,
        });
      }
    }
    if (options.categoryDetailed) {
      query.andWhere('category.detailed = :categoryDetailed', {
        categoryDetailed: options.categoryDetailed,
      });
    }
    const merchantQuery = options.merchantQuery?.trim();
    if (merchantQuery) {
      query.andWhere('transaction.merchantName ILIKE :merchantQuery', {
        merchantQuery: `%${merchantQuery}%`,
      });
    }

    return query;
  }

  private applyTransactionCursor(
    query: SelectQueryBuilder<TransactionEntity>,
    cursor: TransactionCursorPayload | undefined,
  ): SelectQueryBuilder<TransactionEntity> {
    if (!cursor) {
      return query;
    }

    return query.andWhere(
      new Brackets((qb) => {
        qb.where(
          `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} < :cursorActivityDate`,
          {
            cursorActivityDate: cursor.activityDate,
          },
        ).orWhere(
          `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} = :cursorActivityDate AND transaction.id < :cursorId`,
          {
            cursorActivityDate: cursor.activityDate,
            cursorId: cursor.id,
          },
        );
      }),
    );
  }

  private async toMcpTransaction(
    transaction: TransactionEntity,
    reportingCurrency: string,
    conversionRates: Map<string, McpConversionRate>,
  ): Promise<McpTransaction> {
    const nativeAmount = transaction.amount.toMoneyWithSign();
    const category = transaction.category;
    const providerCategoryHint = transaction.toObject().providerCategoryHint;
    const rate = await this.getRate(
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

  private async getRate(
    fromCurrency: string,
    toCurrency: string,
    rateDate: string,
    conversionRates: Map<string, McpConversionRate>,
  ): Promise<number> {
    const from = normalizeCurrency(fromCurrency);
    const to = normalizeCurrency(toCurrency);
    const key = `${rateDate}:${from}:${to}`;
    const cached = conversionRates.get(key);
    if (cached) {
      return cached.rate;
    }

    if (from === to) {
      const sameCurrencyRate = { from, to, rate: 1, rateDate };
      conversionRates.set(key, sameCurrencyRate);
      return 1;
    }

    const rateMap = await this.currencyConversionService.getRateMap(
      [from],
      to,
      rateDate,
    );
    const rate = rateMap.get(from);
    if (rate === undefined) {
      throw new BadRequestException(
        `Missing conversion rate from ${from} to ${to} for ${rateDate}.`,
      );
    }

    conversionRates.set(key, { from, to, rate, rateDate });
    return rate;
  }

  private getActivityDate(transaction: TransactionEntity): string {
    return getTransactionActivityDate(transaction);
  }

  private matchesAmountFilter(
    transaction: McpTransaction,
    amountFilter: McpAmountFilter,
  ): boolean {
    const amount = Math.abs(signedMajorAmount(transaction.convertedAmount));
    const min = amountFilter.min ?? Number.NEGATIVE_INFINITY;
    const max = amountFilter.max ?? Number.POSITIVE_INFINITY;

    return (
      transaction.convertedAmount.currency === amountFilter.currency &&
      amount >= min &&
      amount <= max
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
