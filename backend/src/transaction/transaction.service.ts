import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { AccountActivityEntity } from '../account-activity/account-activity.entity';
import { CategoryEntity } from '../category/category.entity';
import type { TransactionSyncResponse } from '../types/BankLink';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import { TransactionCategorizationService } from '../transaction-categorization/categorization-rule.service';
import {
  BulkTransactionCategoryUpdateDto,
  BulkTransactionCategoryUpdateResponse,
  BulkTransactionCategoryUpdateUndoDto,
  CreateManualTransactionDto,
  CreateTransactionDto,
  Transaction,
  UpdateManualTransactionDto,
  UpdateTransactionCategoryDto,
  UpdateTransactionReportingDateDto,
  UpdateTransactionDto,
} from '../types/Transaction';
import { TransactionEntity } from './transaction.entity';
import { CategoryService } from '../category/category.service';
import type {
  TransactionSurfaceSearchOptions,
  TransactionSurfaceSearchResult,
} from './transaction-surface.types';
import {
  TRANSACTION_ACTIVITY_DATE_EXPRESSION,
  TRANSACTION_ACTIVITY_DATETIME_EXPRESSION,
} from './transaction-date';
import {
  ProviderTransactionsSyncedEvent,
  TransactionEvents,
} from '../events/transaction.events';

type TransactionFilterOptions = {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  categoryPrimary?: string;
  amountSign?: string;
};

const ACTIVITY_DATE_SORT_ALIAS = 'activity_date_sort';
const ACTIVITY_DATETIME_SORT_ALIAS = 'activity_datetime_sort';
const BULK_CATEGORY_UNDO_TTL_MS = 5 * 60 * 1000;

type BulkCategoryUndoSnapshot = {
  id: string;
  categoryId: string | null;
  categoryUpdatedAt: string | null;
  categoryAssignmentSource: 'manual' | 'rule' | null;
  categoryAssignmentRuleId: string | null;
};

type BulkCategoryUndoPayload = {
  userId: string;
  exp: number;
  transactions: BulkCategoryUndoSnapshot[];
};

export type TransactionSyncTransactionHooks = {
  beforeChanges?: (manager: EntityManager) => Promise<void>;
  beforeCommit?: (manager: EntityManager) => Promise<void>;
  authoritativePendingAbsenceRemovals?: Array<{
    internalAccountId: string;
    externalTransactionId: string;
    expectedProviderDate: string;
    expectedLocalUpdatedAt: string;
    evidence: Record<string, unknown>;
  }>;
};

export type TransactionSyncProcessingResult = {
  normalRemovedCount: number;
  authoritativeAbsenceArchivedCount: number;
  authoritativeAbsenceDeletedCount: number;
};

type LockedAuthoritativeAbsenceRow = {
  activityId: string;
  accountId: string;
  externalTransactionId: string;
  providerDate: string;
  localUpdatedAt: Date | string;
  accountType: string;
  accountSubtype: string | null;
};

export type StalePendingProviderTransaction = {
  internalAccountId: string;
  pendingExternalTransactionId: string;
  providerDate: string;
  localUpdatedAt: string;
};

@Injectable()
export class TransactionService extends OwnedCrudService<
  TransactionEntity,
  Transaction,
  CreateTransactionDto,
  UpdateTransactionDto
> {
  protected readonly logger = new Logger(TransactionService.name);
  protected readonly entityName = 'Transaction';
  protected readonly EntityClass = TransactionEntity;
  protected readonly relations = ['activity', 'activity.account', 'category'];

  constructor(
    @InjectRepository(TransactionEntity)
    repository: Repository<TransactionEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    private readonly categoryService: CategoryService,
    private readonly transactionCategorizationService: TransactionCategorizationService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super(repository);
  }

  protected applyUpdate(
    entity: TransactionEntity,
    dto: UpdateTransactionDto,
  ): void {
    if (dto.amount !== undefined) {
      entity.amount = BalanceColumns.fromMoneyWithSign(dto.amount);
    }
    if (dto.accountId !== undefined) entity.accountId = dto.accountId;
    if (dto.merchantName !== undefined) entity.merchantName = dto.merchantName;
    if (dto.providerTransactionName !== undefined) {
      entity.providerTransactionName = dto.providerTransactionName;
    }
    if (dto.originalDescription !== undefined) {
      entity.originalDescription = dto.originalDescription;
    }
    if (dto.pending !== undefined) entity.pending = dto.pending;
    if (dto.pendingTransactionId !== undefined) {
      entity.pendingTransactionId = dto.pendingTransactionId;
    }
    if (dto.accountOwner !== undefined) entity.accountOwner = dto.accountOwner;
    if (dto.externalTransactionId !== undefined) {
      entity.externalTransactionId = dto.externalTransactionId;
    }
    if (dto.logoUrl !== undefined) entity.logoUrl = dto.logoUrl;
    if (dto.website !== undefined) entity.website = dto.website;
    if (dto.merchantEntityId !== undefined) {
      entity.merchantEntityId = dto.merchantEntityId;
    }
    if (dto.paymentChannel !== undefined) {
      entity.paymentChannel = dto.paymentChannel;
    }
    if (dto.transactionCode !== undefined) {
      entity.transactionCode = dto.transactionCode;
    }
    if (dto.personalFinanceCategoryIconUrl !== undefined) {
      entity.personalFinanceCategoryIconUrl =
        dto.personalFinanceCategoryIconUrl;
    }
    if (dto.personalFinanceCategoryConfidenceLevel !== undefined) {
      entity.personalFinanceCategoryConfidenceLevel =
        dto.personalFinanceCategoryConfidenceLevel;
    }
    if (dto.personalFinanceCategory !== undefined) {
      entity.applyProviderCategoryHint(dto);
    }
    if (dto.counterparties !== undefined) {
      entity.counterparties = dto.counterparties;
    }
    if (dto.location !== undefined) entity.location = dto.location;
    if (dto.paymentMeta !== undefined) entity.paymentMeta = dto.paymentMeta;
    if (dto.providerDate !== undefined) {
      entity.providerDate = dto.providerDate;
    }
    if (dto.providerDatetime !== undefined) {
      entity.providerDatetime = dto.providerDatetime;
    }
    if (dto.authorizedDate !== undefined) {
      entity.authorizedDate = dto.authorizedDate;
    }
    if (dto.authorizedDatetime !== undefined) {
      entity.authorizedDatetime = dto.authorizedDatetime;
    }
    if (dto.reportingDateOverride !== undefined) {
      entity.reportingDateOverride = dto.reportingDateOverride;
    }
    this.syncActivityDate(entity);
  }

  private syncActivityDate(entity: TransactionEntity): void {
    entity.activity.activityDate =
      entity.reportingDateOverride ??
      entity.authorizedDate ??
      entity.providerDate;
  }

  async create(
    dto: CreateTransactionDto,
    userId: string,
  ): Promise<Transaction> {
    this.logger.log({ userId }, `Creating ${this.entityName}`);

    const entity = this.EntityClass.fromDto(
      { ...dto, categoryId: null },
      userId,
    );
    const category = await this.resolveAssignableCategorySelection(
      dto.categoryId,
      userId,
    );
    this.applyCategorySelection(entity, category);

    const savedEntity = await this.repository.save(entity);
    this.logger.log(
      { id: savedEntity.id },
      `${this.entityName} created successfully`,
    );
    return savedEntity.toObject();
  }

  async update(
    id: string,
    dto: UpdateTransactionDto,
    userId: string,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, `Updating ${this.entityName}`);

    const entity = await this.repository.findOne({
      where: { id, source: 'provider', activity: { userId } },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        `${this.entityName} not found for update`,
      );
      return null;
    }

    const category = await this.resolveAssignableCategorySelection(
      dto.categoryId,
      userId,
    );

    const updateDto =
      dto.categoryId === undefined ? dto : { ...dto, categoryId: undefined };
    this.applyUpdate(entity, updateDto);
    if (dto.categoryId !== undefined) {
      this.applyCategorySelection(entity, category);
    }

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id }, `${this.entityName} updated successfully`);
    return savedEntity.toObject();
  }

  async updateReportingDate(
    id: string,
    dto: UpdateTransactionReportingDateDto,
    userId: string,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, 'Updating transaction reporting date');

    const entity = await this.repository.findOne({
      where: { id, source: 'provider', activity: { userId } },
      relations: this.relations,
    });
    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Provider transaction not found for reporting date update',
      );
      return null;
    }

    entity.reportingDateOverride = dto.reportingDateOverride;
    this.syncActivityDate(entity);
    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id }, 'Transaction reporting date updated');
    return savedEntity.toObject();
  }

  private async resolveAssignableCategorySelection(
    categoryId: string | null | undefined,
    userId: string,
  ): Promise<CategoryEntity | null | undefined> {
    if (categoryId === undefined) {
      return undefined;
    }

    if (categoryId === null) {
      return null;
    }

    const category = await this.categoryService.findActiveAssignableCategory(
      categoryId,
      userId,
    );

    if (!category) {
      throw new NotFoundException(`Category with id ${categoryId} not found`);
    }

    return category;
  }

  private applyCategorySelection(
    entity: TransactionEntity,
    category: CategoryEntity | null | undefined,
  ): void {
    if (category === undefined) {
      return;
    }

    if (category === null) {
      entity.categoryId = null;
      entity.category = null;
      entity.categoryUpdatedAt = null;
      entity.categoryAssignmentSource = 'manual';
      entity.categoryAssignmentRuleId = null;
      return;
    }

    entity.categoryId = category.id;
    entity.category = category;
    entity.categoryUpdatedAt = new Date();
    entity.categoryAssignmentSource = 'manual';
    entity.categoryAssignmentRuleId = null;
  }

  private async findActiveUserAccount(
    accountId: string,
    userId: string,
  ): Promise<AccountEntity | null> {
    return this.accountRepository.findOne({
      where: { id: accountId, userId, archivedAt: IsNull() },
    });
  }

  private buildManualAmount(
    dto: CreateManualTransactionDto,
    account: AccountEntity,
  ): BalanceColumns {
    if (dto.amount.money.amount <= 0) {
      throw new BadRequestException(
        'Manual transaction amount must be positive',
      );
    }

    const accountCurrency = account.currentBalance.currency;
    if (dto.amount.money.currency !== accountCurrency) {
      throw new BadRequestException(
        'Manual transaction currency must match the selected account currency',
      );
    }

    return BalanceColumns.fromMoneyWithSign({
      money: {
        amount: dto.amount.money.amount,
        currency: accountCurrency,
      },
      sign: dto.amount.sign,
    });
  }

  private applyManualTransactionFields(
    entity: TransactionEntity,
    dto: CreateManualTransactionDto,
    account: AccountEntity,
    category: CategoryEntity,
  ): void {
    entity.source = 'manual';
    entity.activity.provider = 'manual';
    entity.activity.activityKind = 'banking_transaction';
    entity.activity.externalActivityId = null;
    entity.accountId = account.id;
    entity.account = account;
    entity.amount = this.buildManualAmount(dto, account);
    entity.merchantName = dto.merchantName;
    entity.providerTransactionName = null;
    entity.originalDescription = null;
    entity.pending = false;
    entity.pendingTransactionId = null;
    entity.accountOwner = null;
    entity.externalTransactionId = null;
    entity.logoUrl = null;
    entity.website = null;
    entity.merchantEntityId = null;
    entity.paymentChannel = null;
    entity.transactionCode = null;
    entity.personalFinanceCategoryIconUrl = null;
    entity.personalFinanceCategoryConfidenceLevel = null;
    entity.providerCategoryProvider = null;
    entity.providerCategoryPrimary = null;
    entity.providerCategoryDetailed = null;
    entity.counterparties = null;
    entity.location = null;
    entity.paymentMeta = null;
    entity.providerDate = dto.providerDate;
    entity.providerDatetime = null;
    entity.authorizedDate = null;
    entity.authorizedDatetime = null;
    entity.reportingDateOverride = null;
    this.syncActivityDate(entity);
    this.applyCategorySelection(entity, category);
  }

  async createManualEntityWithManager(
    userId: string,
    dto: CreateManualTransactionDto,
    account: AccountEntity,
    category: CategoryEntity,
    manager: EntityManager,
  ): Promise<TransactionEntity> {
    const entity = new TransactionEntity();
    entity.userId = userId;
    this.applyManualTransactionFields(entity, dto, account, category);
    return manager.getRepository(TransactionEntity).save(entity);
  }

  async createManual(
    userId: string,
    dto: CreateManualTransactionDto,
  ): Promise<Transaction | null> {
    this.logger.log(
      { userId, accountId: dto.accountId },
      'Creating manual transaction',
    );

    const [account, category] = await Promise.all([
      this.findActiveUserAccount(dto.accountId, userId),
      this.categoryService.findActiveAssignableCategory(dto.categoryId, userId),
    ]);

    if (!account || !category) {
      this.logger.warn(
        { userId, accountId: dto.accountId, categoryId: dto.categoryId },
        'Manual transaction account or category not found',
      );
      return null;
    }

    const entity = new TransactionEntity();
    entity.userId = userId;
    this.applyManualTransactionFields(entity, dto, account, category);

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id: savedEntity.id }, 'Manual transaction created');
    return savedEntity.toObject();
  }

  async updateManual(
    id: string,
    userId: string,
    dto: UpdateManualTransactionDto,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, 'Updating manual transaction');

    const entity = await this.repository.findOne({
      where: { id, source: 'manual', activity: { userId } },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Manual transaction not found for update',
      );
      return null;
    }

    const [account, category] = await Promise.all([
      this.findActiveUserAccount(dto.accountId, userId),
      this.categoryService.findActiveAssignableCategory(dto.categoryId, userId),
    ]);

    if (!account || !category) {
      this.logger.warn(
        { id, userId, accountId: dto.accountId, categoryId: dto.categoryId },
        'Manual transaction account or category not found for update',
      );
      return null;
    }

    this.applyManualTransactionFields(entity, dto, account, category);

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id }, 'Manual transaction updated');
    return savedEntity.toObject();
  }

  async removeManual(id: string, userId: string): Promise<boolean> {
    this.logger.log({ id, userId }, 'Removing manual transaction');

    const entity = await this.repository.findOne({
      where: { id, source: 'manual', activity: { userId } },
      relations: this.relations,
    });
    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Manual transaction not found for removal',
      );
      return false;
    }

    await this.removeActivityCascade(entity);
    return true;
  }

  async remove(id: string, userId: string): Promise<boolean> {
    this.logger.log({ id, userId }, 'Removing provider transaction');

    const entity = await this.repository.findOne({
      where: { id, source: 'provider', activity: { userId } },
      relations: this.relations,
    });
    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Provider transaction not found for removal',
      );
      return false;
    }

    await this.removeActivityCascade(entity);
    this.logger.log({ id }, 'Provider transaction removed');
    return true;
  }

  async findOne(id: string, userId: string): Promise<Transaction | null> {
    const entity = await this.repository.findOne({
      where: {
        id,
        activity: { userId },
      },
      relations: this.relations,
    });
    return entity?.toObject() ?? null;
  }

  async findStalePendingProviderTransactions(
    userId: string,
    accountIds: string[],
    staleOnOrBefore: string,
    limit: number,
  ): Promise<StalePendingProviderTransaction[]> {
    if (accountIds.length === 0 || limit <= 0) {
      return [];
    }

    const entities = await this.repository.find({
      where: {
        source: 'provider',
        pending: true,
        activity: {
          userId,
          accountId: In(accountIds),
          provider: 'plaid',
          providerDate: LessThanOrEqual(staleOnOrBefore),
          externalActivityId: Not(IsNull()),
          account: {
            archivedAt: IsNull(),
            type: In(['depository', 'credit', 'loan']),
          },
        },
      },
      relations: this.relations,
      order: { activity: { providerDate: 'ASC', id: 'ASC' } },
      take: limit,
    });

    return entities.flatMap((entity) => {
      const account = entity.account;
      const transactionsCovered =
        account.type === 'depository' ||
        account.type === 'credit' ||
        (account.type === 'loan' &&
          (account.subType === 'student' || account.subType === 'mortgage'));
      return entity.externalTransactionId && transactionsCovered
        ? [
            {
              internalAccountId: entity.accountId,
              pendingExternalTransactionId: entity.externalTransactionId,
              providerDate: entity.providerDate,
              localUpdatedAt: new Date(
                Math.max(
                  entity.updatedAt.getTime(),
                  entity.activity.updatedAt.getTime(),
                ),
              ).toISOString(),
            },
          ]
        : [];
    });
  }

  private buildProviderSyncUpdateDto(
    dto: CreateTransactionDto,
    accountId: string,
  ): UpdateTransactionDto {
    return {
      ...dto,
      categoryId: undefined,
      personalFinanceCategory: dto.personalFinanceCategory ?? {
        primary: null,
        detailed: null,
      },
      accountId,
    };
  }

  private async applyAutomaticCategoryIfEligible(
    userId: string,
    entity: TransactionEntity,
  ): Promise<boolean> {
    if (entity.categoryAssignmentSource === 'manual') {
      return false;
    }

    return this.transactionCategorizationService.applyRuleAssignmentIfEligible(
      userId,
      entity,
    );
  }

  private preserveUserMetadataFromPendingDuplicate(
    posted: TransactionEntity,
    pending: TransactionEntity,
  ): void {
    if (!posted.reportingDateOverride && pending.reportingDateOverride) {
      posted.reportingDateOverride = pending.reportingDateOverride;
    }

    const pendingCategoryIsNewer =
      pending.categoryUpdatedAt !== null &&
      (posted.categoryUpdatedAt === null ||
        pending.categoryUpdatedAt > posted.categoryUpdatedAt);
    const postedHasNoUserCategory =
      posted.categoryAssignmentSource === null &&
      pending.categoryAssignmentSource !== null;
    if (pendingCategoryIsNewer || postedHasNoUserCategory) {
      posted.categoryId = pending.categoryId;
      posted.category = pending.category;
      posted.categoryUpdatedAt = pending.categoryUpdatedAt;
      posted.categoryAssignmentSource = pending.categoryAssignmentSource;
      posted.categoryAssignmentRuleId = pending.categoryAssignmentRuleId;
    }
  }

  private static readonly SORTABLE_COLUMNS = new Set([
    'activityDate',
    'merchantName',
    'pending',
    'amount',
  ]);

  private getUndoSigningSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    return secret;
  }

  private encodeUndoPayload(payload: BulkCategoryUndoPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.getUndoSigningSecret())
      .update(body)
      .digest('base64url');

    return `${body}.${signature}`;
  }

  private decodeUndoPayload(token: string): BulkCategoryUndoPayload | null {
    const [body, signature, extra] = token.split('.');
    if (!body || !signature || extra !== undefined) {
      return null;
    }

    const expectedSignature = createHmac('sha256', this.getUndoSigningSecret())
      .update(body)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      return JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as BulkCategoryUndoPayload;
    } catch {
      return null;
    }
  }

  private buildBulkCategoryUndoToken(
    userId: string,
    entities: TransactionEntity[],
  ): string {
    return this.encodeUndoPayload({
      userId,
      exp: Date.now() + BULK_CATEGORY_UNDO_TTL_MS,
      transactions: entities.map((entity) => ({
        id: entity.id,
        categoryId: entity.categoryId,
        categoryUpdatedAt: entity.categoryUpdatedAt?.toISOString() ?? null,
        categoryAssignmentSource: entity.categoryAssignmentSource,
        categoryAssignmentRuleId: entity.categoryAssignmentRuleId,
      })),
    });
  }

  private applyBulkCategorySelection(
    entity: TransactionEntity,
    category: CategoryEntity | null,
  ): void {
    if (category === null) {
      entity.categoryId = null;
      entity.category = null;
      entity.categoryUpdatedAt = null;
      entity.categoryAssignmentSource = 'manual';
      entity.categoryAssignmentRuleId = null;
    } else {
      entity.categoryId = category.id;
      entity.category = category;
      entity.categoryUpdatedAt = new Date();
      entity.categoryAssignmentSource = 'manual';
      entity.categoryAssignmentRuleId = null;
    }
  }

  private applyTransactionOrder(
    query: SelectQueryBuilder<TransactionEntity>,
    sortColumn: string,
    order: 'ASC' | 'DESC',
  ): SelectQueryBuilder<TransactionEntity> {
    query
      .addSelect(TRANSACTION_ACTIVITY_DATE_EXPRESSION, ACTIVITY_DATE_SORT_ALIAS)
      .addSelect(
        TRANSACTION_ACTIVITY_DATETIME_EXPRESSION,
        ACTIVITY_DATETIME_SORT_ALIAS,
      );

    let sortExpression = `transaction.${sortColumn}`;
    if (sortColumn === 'amount') {
      sortExpression = 'activity.amountAmount';
    } else if (sortColumn === 'activityDate') {
      sortExpression = ACTIVITY_DATE_SORT_ALIAS;
    }
    const chronologicalTieOrder =
      sortColumn === 'activityDate' ? order : 'DESC';

    query.orderBy(sortExpression, order);
    if (sortColumn !== 'activityDate') {
      query.addOrderBy(ACTIVITY_DATE_SORT_ALIAS, 'DESC');
    }
    query
      .addOrderBy(
        ACTIVITY_DATETIME_SORT_ALIAS,
        chronologicalTieOrder,
        'NULLS LAST',
      )
      .addOrderBy('transaction.id', chronologicalTieOrder);

    return query;
  }

  private applyActivityDateFilters(
    query: SelectQueryBuilder<TransactionEntity>,
    startDate?: string,
    endDate?: string,
  ): void {
    if (startDate && endDate) {
      query.andWhere(
        `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} BETWEEN :startDate AND :endDate`,
        { startDate, endDate },
      );
    } else if (startDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} >= :startDate`, {
        startDate,
      });
    } else if (endDate) {
      query.andWhere(`${TRANSACTION_ACTIVITY_DATE_EXPRESSION} <= :endDate`, {
        endDate,
      });
    }
  }

  private applyQueryFilters(
    query: SelectQueryBuilder<TransactionEntity>,
    options: TransactionFilterOptions,
  ): void {
    const {
      accountId,
      startDate,
      endDate,
      categoryId,
      categoryPrimary,
      amountSign,
    } = options;

    if (accountId) {
      query.andWhere('activity.accountId = :accountId', { accountId });
    }
    this.applyActivityDateFilters(query, startDate, endDate);
    if (amountSign === 'positive' || amountSign === 'negative') {
      query.andWhere('activity.amountSign = :amountSign', { amountSign });
    }
    if (categoryId) {
      if (categoryId === 'UNCATEGORIZED') {
        query.andWhere('transaction.categoryId IS NULL');
      } else {
        query.andWhere('transaction.categoryId = :categoryId', {
          categoryId,
        });
      }
    } else if (categoryPrimary) {
      if (categoryPrimary === 'UNCATEGORIZED') {
        query.andWhere('transaction.categoryId IS NULL');
      } else {
        query.andWhere('category.primary = :categoryPrimary', {
          categoryPrimary,
        });
      }
    }
  }

  private buildFilteredTransactionQuery(
    userId: string,
    options: TransactionFilterOptions,
  ): SelectQueryBuilder<TransactionEntity> {
    const query = this.repository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.activity', 'activity')
      .leftJoinAndSelect('activity.account', 'account')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('activity.userId = :userId', { userId });

    this.applyQueryFilters(query, options);

    return query;
  }

  /**
   * Find all transactions with pagination, sorting, and optional filters
   */
  async findAllPaginated(
    userId: string,
    options: {
      pageIndex: number;
      pageSize: number;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
      accountId?: string;
      startDate?: string;
      endDate?: string;
      categoryId?: string;
      categoryPrimary?: string;
      amountSign?: string;
    },
  ): Promise<{ data: Transaction[]; total: number }> {
    const {
      pageIndex,
      pageSize,
      sortBy,
      sortOrder = 'DESC',
      accountId,
      startDate,
      endDate,
      categoryId,
      categoryPrimary,
      amountSign,
    } = options;

    const sortColumn =
      sortBy && TransactionService.SORTABLE_COLUMNS.has(sortBy)
        ? sortBy
        : 'activityDate';
    const order: 'ASC' | 'DESC' = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    this.logger.log(
      {
        userId,
        pageIndex,
        pageSize,
        sortColumn,
        order,
        accountId,
        startDate,
        endDate,
        categoryId,
        categoryPrimary,
        amountSign,
      },
      'Finding paginated transactions',
    );

    const query = this.buildFilteredTransactionQuery(userId, {
      accountId,
      startDate,
      endDate,
      categoryId,
      categoryPrimary,
      amountSign,
    });

    const [entities, total] = await this.applyTransactionOrder(
      query,
      sortColumn,
      order,
    )
      .skip(pageIndex * pageSize)
      .take(pageSize)
      .getManyAndCount();

    this.logger.log(
      { userId, count: entities.length, total },
      'Found paginated transactions',
    );

    return {
      data: entities.map((entity) => entity.toObject()),
      total,
    };
  }

  /**
   * Find all transactions for a specific account
   */
  async findByAccountId(
    accountId: string,
    userId: string,
  ): Promise<Transaction[]> {
    const entities = await this.repository.find({
      where: { activity: { accountId, userId } },
      relations: this.relations,
    });
    return entities.map((entity) => entity.toObject());
  }

  async updateCategory(
    id: string,
    dto: UpdateTransactionCategoryDto,
    userId: string,
  ): Promise<Transaction | null> {
    this.logger.log({ id, userId }, 'Updating transaction category');

    const entity = await this.repository.findOne({
      where: { id, activity: { userId } },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        'Transaction not found for category update',
      );
      return null;
    }

    if (entity.source === 'manual') {
      this.logger.warn(
        { id, userId },
        'Manual transaction cannot use provider category override update',
      );
      return null;
    }

    if (dto.categoryId === null) {
      entity.categoryId = null;
      entity.category = null;
      entity.categoryUpdatedAt = null;
      entity.categoryAssignmentSource = 'manual';
      entity.categoryAssignmentRuleId = null;
    } else {
      const category = await this.categoryService.findActiveAssignableCategory(
        dto.categoryId,
        userId,
      );

      if (!category) {
        this.logger.warn(
          { id, userId, categoryId: dto.categoryId },
          'Category not found for transaction category update',
        );
        return null;
      }

      entity.categoryId = category.id;
      entity.category = category;
      entity.categoryUpdatedAt = new Date();
      entity.categoryAssignmentSource = 'manual';
      entity.categoryAssignmentRuleId = null;
    }

    const savedEntity = await this.repository.save(entity);
    const hydratedEntity = await this.repository.findOne({
      where: { id: savedEntity.id, activity: { userId } },
      relations: this.relations,
    });

    return (hydratedEntity ?? savedEntity).toObject();
  }

  async bulkUpdateCategories(
    userId: string,
    dto: BulkTransactionCategoryUpdateDto,
  ): Promise<BulkTransactionCategoryUpdateResponse | null> {
    const transactionIds = [...new Set(dto.transactionIds)];
    this.logger.log(
      { userId, count: transactionIds.length, categoryId: dto.categoryId },
      'Bulk updating transaction category overrides',
    );

    if (transactionIds.length === 0) {
      return null;
    }

    const category =
      dto.categoryId === null
        ? null
        : await this.categoryService.findActiveAssignableCategory(
            dto.categoryId,
            userId,
          );

    if (dto.categoryId !== null && !category) {
      this.logger.warn(
        { userId, categoryId: dto.categoryId },
        'Category not found for bulk transaction override',
      );
      return null;
    }

    return this.repository.manager.transaction(async (manager) => {
      const txnRepo = manager.getRepository(TransactionEntity);
      const entities = await txnRepo.find({
        where: { id: In(transactionIds), activity: { userId } },
        relations: this.relations,
      });

      if (entities.length !== transactionIds.length) {
        this.logger.warn(
          {
            userId,
            requestedCount: transactionIds.length,
            foundCount: entities.length,
          },
          'Transaction not found for bulk category update',
        );
        return null;
      }

      const providerEntities = entities.filter(
        (entity) => entity.source !== 'manual',
      );
      const undo = this.buildBulkCategoryUndoToken(userId, providerEntities);
      providerEntities.forEach((entity) => {
        this.applyBulkCategorySelection(entity, category);
      });

      if (providerEntities.length > 0) {
        await txnRepo.save(providerEntities);
      }

      return {
        count: providerEntities.length,
        transactionIds: providerEntities.map((entity) => entity.id),
        undo,
      };
    });
  }

  async undoBulkUpdateCategories(
    userId: string,
    dto: BulkTransactionCategoryUpdateUndoDto,
  ): Promise<BulkTransactionCategoryUpdateResponse | null> {
    const payload = this.decodeUndoPayload(dto.undo);
    if (!payload || payload.userId !== userId || payload.exp < Date.now()) {
      this.logger.warn({ userId }, 'Invalid bulk category update undo token');
      return null;
    }

    const transactionIds = [
      ...new Set(payload.transactions.map((transaction) => transaction.id)),
    ];
    if (transactionIds.length !== payload.transactions.length) {
      this.logger.warn(
        { userId },
        'Duplicate transaction in bulk category update undo token',
      );
      return null;
    }

    return this.repository.manager.transaction(async (manager) => {
      const txnRepo = manager.getRepository(TransactionEntity);
      const entities = await txnRepo.find({
        where: { id: In(transactionIds), activity: { userId } },
        relations: this.relations,
      });

      if (entities.length !== transactionIds.length) {
        this.logger.warn(
          {
            userId,
            requestedCount: transactionIds.length,
            foundCount: entities.length,
          },
          'Transaction not found for bulk category update undo',
        );
        return null;
      }

      const entityById = new Map(
        entities.map((entity) => [entity.id, entity] as const),
      );
      const categoryIds = [
        ...new Set(
          payload.transactions
            .map((transaction) => transaction.categoryId)
            .filter((categoryId): categoryId is string => categoryId !== null),
        ),
      ];
      const categories =
        categoryIds.length > 0
          ? await this.categoryRepository.find({
              where: { id: In(categoryIds), userId, archivedAt: IsNull() },
            })
          : [];
      const categoryById = new Map(
        categories
          .filter((category): category is CategoryEntity => category !== null)
          .map((category) => [category.id, category] as const),
      );

      if (categoryById.size !== categoryIds.length) {
        this.logger.warn(
          { userId },
          'Category not found for bulk category update undo',
        );
        return null;
      }

      payload.transactions.forEach((snapshot) => {
        const entity = entityById.get(snapshot.id);
        if (!entity) {
          return;
        }

        entity.categoryId = snapshot.categoryId;
        entity.category = snapshot.categoryId
          ? (categoryById.get(snapshot.categoryId) ?? null)
          : null;
        entity.categoryUpdatedAt = snapshot.categoryUpdatedAt
          ? new Date(snapshot.categoryUpdatedAt)
          : null;
        entity.categoryAssignmentSource = snapshot.categoryAssignmentSource;
        entity.categoryAssignmentRuleId = snapshot.categoryAssignmentRuleId;
      });

      await txnRepo.save(entities);

      return {
        count: entities.length,
        transactionIds,
        undo: '',
      };
    });
  }

  private async findMatchingTransactions(
    userId: string,
    options: {
      startDate?: string;
      endDate?: string;
      accountIds?: string[];
      includePending?: boolean;
      categoryPrimary?: string;
      merchantQuery?: string;
      sign?: 'positive' | 'negative';
      minAmount?: number;
      maxAmount?: number;
    },
  ): Promise<Transaction[]> {
    const query = this.buildFilteredTransactionQuery(userId, {
      categoryPrimary: options.categoryPrimary,
    });

    if (options.accountIds?.length === 1) {
      query.andWhere('activity.accountId = :accountId', {
        accountId: options.accountIds[0],
      });
    } else if (options.accountIds && options.accountIds.length > 1) {
      query.andWhere('activity.accountId IN (:...accountIds)', {
        accountIds: options.accountIds,
      });
    }

    this.applyActivityDateFilters(query, options.startDate, options.endDate);

    if (!options.includePending) {
      query.andWhere('transaction.pending = false');
    }

    if (options.sign === 'positive' || options.sign === 'negative') {
      query.andWhere('activity.amountSign = :amountSign', {
        amountSign: options.sign,
      });
    }

    this.applyTransactionOrder(query, 'activityDate', 'DESC');

    const entities = await query.getMany();

    return entities
      .map((entity) => entity.toObject())
      .filter((transaction) => {
        const merchantQuery = options.merchantQuery?.trim().toLowerCase();
        if (
          merchantQuery &&
          !transaction.merchantName?.toLowerCase().includes(merchantQuery)
        ) {
          return false;
        }

        const amount = transaction.amount.money.amount;
        if (options.minAmount !== undefined && amount < options.minAmount) {
          return false;
        }
        if (options.maxAmount !== undefined && amount > options.maxAmount) {
          return false;
        }

        return true;
      });
  }

  async searchForSurface(
    userId: string,
    options: TransactionSurfaceSearchOptions,
  ): Promise<TransactionSurfaceSearchResult> {
    const matches = await this.findMatchingTransactions(userId, options);
    const limit = options.limit ?? 20;

    return {
      matchedCount: matches.length,
      truncated: matches.length > limit,
      transactions: matches.slice(0, limit).map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        accountName: transaction.accountName ?? 'Account',
        merchantName: transaction.merchantName,
        pending: transaction.pending,
        activityDate: transaction.activityDate,
        reportingDateOverride: transaction.reportingDateOverride,
        providerDate: transaction.providerDate,
        categoryPrimary: transaction.category?.primary ?? null,
        amount: transaction.amount,
      })),
    };
  }

  /**
   * Process transaction sync results (added/modified/removed) atomically
   * Maps external account IDs to internal account IDs before persisting
   *
   * @param userId - Owner of the transactions
   * @param accountIdMap - Map of external account ID to internal account ID
   * @param syncResults - Results from provider's syncTransactions call
   */
  async processSyncResults(
    userId: string,
    accountIdMap: Map<string, string>,
    syncResults: TransactionSyncResponse,
    hooks: TransactionSyncTransactionHooks = {},
  ): Promise<TransactionSyncProcessingResult> {
    const { added, modified, removed } = syncResults;
    const uncategorizedInsertedTransactions: TransactionEntity[] = [];
    let automaticallyCategorizedCount = 0;
    const processingResult: TransactionSyncProcessingResult = {
      normalRemovedCount: 0,
      authoritativeAbsenceArchivedCount: 0,
      authoritativeAbsenceDeletedCount: 0,
    };

    const unknownExternalAccountIds = [
      ...new Set(
        [...added, ...modified]
          .map((transaction) => transaction.accountId)
          .filter((accountId) => !accountIdMap.has(accountId)),
      ),
    ];
    if (unknownExternalAccountIds.length > 0) {
      throw new Error(
        `Transaction sync references unknown or archived provider accounts: ${unknownExternalAccountIds.join(', ')}`,
      );
    }
    const getInternalAccountId = (externalAccountId: string): string => {
      const internalAccountId = accountIdMap.get(externalAccountId);
      if (!internalAccountId) {
        throw new Error(
          `Transaction sync references unknown or archived provider account: ${externalAccountId}`,
        );
      }
      return internalAccountId;
    };

    this.logger.log(
      {
        userId,
        addedCount: added.length,
        modifiedCount: modified.length,
        removedCount: removed.length,
      },
      'Processing transaction sync results',
    );

    await this.repository.manager.transaction(async (manager) => {
      await hooks.beforeChanges?.(manager);
      const txnRepo = manager.getRepository(TransactionEntity);

      // Process added transactions
      if (added.length > 0) {
        const newEntities: TransactionEntity[] = [];

        for (const dto of added) {
          const internalAccountId = getInternalAccountId(dto.accountId);

          const existingPosted = dto.externalTransactionId
            ? await txnRepo.findOne({
                where: {
                  activity: {
                    externalActivityId: dto.externalTransactionId,
                    accountId: internalAccountId,
                    userId,
                  },
                },
                relations: this.relations,
              })
            : null;

          let matchedPending: TransactionEntity | null = null;
          if (dto.pendingTransactionId) {
            matchedPending = await txnRepo.findOne({
              where: {
                activity: {
                  externalActivityId: dto.pendingTransactionId,
                  accountId: internalAccountId,
                  userId,
                },
                pending: true,
              },
              relations: this.relations,
            });
          }

          if (
            existingPosted &&
            matchedPending &&
            existingPosted.id !== matchedPending.id
          ) {
            this.preserveUserMetadataFromPendingDuplicate(
              existingPosted,
              matchedPending,
            );
            existingPosted.source = 'provider';
            this.applyUpdate(
              existingPosted,
              this.buildProviderSyncUpdateDto(dto, internalAccountId),
            );
            if (
              await this.applyAutomaticCategoryIfEligible(
                userId,
                existingPosted,
              )
            ) {
              automaticallyCategorizedCount += 1;
            }
            await txnRepo.save(existingPosted);
            await manager
              .getRepository(AccountActivityEntity)
              .delete({ id: matchedPending.activityId });
            this.logger.log(
              {
                pendingExternalTransactionId: dto.pendingTransactionId,
                postedExternalTransactionId: dto.externalTransactionId,
              },
              'Consolidated duplicate pending and posted transactions from explicit provider replacement',
            );
            continue;
          }

          if (existingPosted) {
            existingPosted.source = 'provider';
            this.applyUpdate(
              existingPosted,
              this.buildProviderSyncUpdateDto(dto, internalAccountId),
            );
            if (
              await this.applyAutomaticCategoryIfEligible(
                userId,
                existingPosted,
              )
            ) {
              automaticallyCategorizedCount += 1;
            }
            await txnRepo.save(existingPosted);
            continue;
          }

          if (matchedPending) {
            matchedPending.source = 'provider';
            this.applyUpdate(
              matchedPending,
              this.buildProviderSyncUpdateDto(dto, internalAccountId),
            );
            if (
              await this.applyAutomaticCategoryIfEligible(
                userId,
                matchedPending,
              )
            ) {
              automaticallyCategorizedCount += 1;
            }
            await txnRepo.save(matchedPending);
            this.logger.log(
              {
                pendingExternalTransactionId: dto.pendingTransactionId,
                postedExternalTransactionId: dto.externalTransactionId,
              },
              'Updated pending transaction from posted sync addition',
            );
            continue;
          }

          const entity = TransactionEntity.fromDto(
            { ...dto, accountId: internalAccountId, categoryId: null },
            userId,
          );
          const wasAutomaticallyCategorized =
            await this.applyAutomaticCategoryIfEligible(userId, entity);
          if (wasAutomaticallyCategorized) {
            automaticallyCategorizedCount += 1;
          }
          newEntities.push(entity);
        }

        if (newEntities.length > 0) {
          const savedEntities = await txnRepo.save(newEntities);
          uncategorizedInsertedTransactions.push(
            ...savedEntities.filter(
              (transaction) => transaction.categoryId === null,
            ),
          );
          this.logger.log(
            { count: newEntities.length },
            'Inserted new transactions',
          );
        }
      }

      // Process modified transactions
      if (modified.length > 0) {
        for (const dto of modified) {
          const internalAccountId = getInternalAccountId(dto.accountId);

          const existing = await txnRepo.findOne({
            where: {
              activity: {
                externalActivityId: dto.externalTransactionId ?? undefined,
                accountId: internalAccountId,
                userId,
              },
            },
            relations: this.relations,
          });

          if (!existing) {
            this.logger.warn(
              { externalTransactionId: dto.externalTransactionId },
              'Modified transaction not found locally, inserting as new',
            );
            const entity = TransactionEntity.fromDto(
              { ...dto, accountId: internalAccountId, categoryId: null },
              userId,
            );
            const wasAutomaticallyCategorized =
              await this.applyAutomaticCategoryIfEligible(userId, entity);
            if (wasAutomaticallyCategorized) {
              automaticallyCategorizedCount += 1;
            }
            const savedEntity = await txnRepo.save(entity);
            if (savedEntity.categoryId === null) {
              uncategorizedInsertedTransactions.push(savedEntity);
            }
            continue;
          }

          existing.source = 'provider';
          this.applyUpdate(
            existing,
            this.buildProviderSyncUpdateDto(dto, internalAccountId),
          );
          if (await this.applyAutomaticCategoryIfEligible(userId, existing)) {
            automaticallyCategorizedCount += 1;
          }
          await txnRepo.save(existing);
        }
      }

      // Process removed transactions
      if (removed.length > 0) {
        // Get all internal account IDs for the removal query
        const internalAccountIds = [...accountIdMap.values()];
        const absenceRemovalByCompositeIdentity = new Map(
          (hooks.authoritativePendingAbsenceRemovals ?? []).map((removal) => [
            `${removal.internalAccountId}\0${removal.externalTransactionId}`,
            removal,
          ]),
        );
        const authoritativeAbsenceRemovals = [
          ...absenceRemovalByCompositeIdentity.values(),
        ].filter((removal) => removed.includes(removal.externalTransactionId));
        const authoritativeAbsenceIds = new Set(
          authoritativeAbsenceRemovals.map(
            (removal) => removal.externalTransactionId,
          ),
        );
        const normalRemovalIds = removed.filter(
          (externalId) => !authoritativeAbsenceIds.has(externalId),
        );

        const normalEntitiesToRemove =
          normalRemovalIds.length > 0
            ? await txnRepo.find({
                where: {
                  activity: {
                    externalActivityId: In(normalRemovalIds),
                    accountId: In(internalAccountIds),
                    userId,
                  },
                  source: 'provider',
                },
                relations: this.relations,
              })
            : [];
        const authoritativeAbsenceActivityIds: string[] = [];
        for (const removal of authoritativeAbsenceRemovals) {
          const lockedRows: LockedAuthoritativeAbsenceRow[] =
            await manager.query(
              `
              SELECT
                banking."activityId" AS "activityId",
                activity."accountId" AS "accountId",
                activity."externalActivityId" AS "externalTransactionId",
                activity."providerDate"::text AS "providerDate",
                GREATEST(banking."updatedAt", activity."updatedAt") AS "localUpdatedAt",
                account.type AS "accountType",
                account."subType" AS "accountSubtype"
              FROM banking_transaction_entity banking
              JOIN account_activity_entity activity
                ON activity.id = banking."activityId"
              JOIN account_entity account
                ON account.id = activity."accountId"
              WHERE activity."accountId" = $1
                AND activity."externalActivityId" = $2
                AND activity."userId" = $3
                AND activity.provider = 'plaid'
                AND activity."activityKind" = 'banking_transaction'
                AND banking.pending = true
                AND banking.source = 'provider'
                AND account."archivedAt" IS NULL
                AND activity."providerDate" < current_date - 14
              FOR UPDATE OF banking, activity
            `,
              [
                removal.internalAccountId,
                removal.externalTransactionId,
                userId,
              ],
            );
          const locked = lockedRows[0];
          const accountCovered =
            locked?.accountType === 'depository' ||
            locked?.accountType === 'credit' ||
            (locked?.accountType === 'loan' &&
              (locked.accountSubtype === 'student' ||
                locked.accountSubtype === 'mortgage'));
          const expectedTimestamp = Date.parse(removal.expectedLocalUpdatedAt);
          const lockedTimestamp = locked
            ? new Date(locked.localUpdatedAt).getTime()
            : Number.NaN;
          if (
            !locked ||
            !accountCovered ||
            locked.providerDate !== removal.expectedProviderDate ||
            !Number.isFinite(expectedTimestamp) ||
            lockedTimestamp !== expectedTimestamp
          ) {
            continue;
          }

          const archiveRows: Array<{ id: string }> = await manager.query(
            `
                INSERT INTO "transaction_reconciliation_archive_entity"
                  ("userId", "accountId", "externalTransactionId", "snapshot", "evidence", "expiresAt")
                SELECT
                  activity."userId",
                  activity."accountId",
                  activity."externalActivityId",
                  jsonb_build_object(
                    'schemaVersion', 1,
                    'activity', to_jsonb(activity),
                    'bankingTransaction', to_jsonb(banking)
                  ),
                  $2::jsonb,
                  now() + interval '90 days'
                FROM banking_transaction_entity banking
                JOIN account_activity_entity activity
                  ON activity.id = banking."activityId"
                JOIN account_entity account
                  ON account.id = activity."accountId"
                WHERE banking."activityId" = $1
                  AND activity."accountId" = $3
                  AND activity."externalActivityId" = $4
                  AND activity."userId" = $5
                  AND activity.provider = 'plaid'
                  AND activity."activityKind" = 'banking_transaction'
                  AND activity."providerDate" = $6::date
                  AND banking.pending = true
                  AND banking.source = 'provider'
                  AND account."archivedAt" IS NULL
                  AND activity."providerDate" < current_date - 14
                  AND (
                    account.type IN ('depository', 'credit')
                    OR (account.type = 'loan' AND account."subType" IN ('student', 'mortgage'))
                  )
                  AND NOT EXISTS (
                    SELECT 1
                    FROM banking_transaction_entity posted_banking
                    JOIN account_activity_entity posted_activity
                      ON posted_activity.id = posted_banking."activityId"
                    WHERE posted_activity."accountId" = activity."accountId"
                      AND posted_activity."userId" = activity."userId"
                      AND posted_banking.source = 'provider'
                      AND posted_banking.pending = false
                      AND posted_banking."pendingTransactionId" = activity."externalActivityId"
                  )
                ON CONFLICT ("userId", "accountId", "externalTransactionId")
                DO UPDATE SET
                  "snapshot" = EXCLUDED."snapshot",
                  "evidence" = EXCLUDED."evidence",
                  "expiresAt" = EXCLUDED."expiresAt",
                  "restoredAt" = NULL,
                  "updatedAt" = now()
                RETURNING id
              `,
            [
              locked.activityId,
              JSON.stringify({ schemaVersion: 1, ...removal.evidence }),
              removal.internalAccountId,
              removal.externalTransactionId,
              userId,
              removal.expectedProviderDate,
            ],
          );
          if (archiveRows.length === 1) {
            authoritativeAbsenceActivityIds.push(locked.activityId);
          }
        }

        const activityRepo = manager.getRepository(AccountActivityEntity);
        const normalActivityIds = normalEntitiesToRemove.map(
          (entity) => entity.activityId,
        );
        const normalDeleteResult =
          normalActivityIds.length > 0
            ? await activityRepo.delete({ id: In(normalActivityIds) })
            : { affected: 0 };
        const authoritativeDeleteResult =
          authoritativeAbsenceActivityIds.length > 0
            ? await activityRepo.delete({
                id: In(authoritativeAbsenceActivityIds),
              })
            : { affected: 0 };
        processingResult.normalRemovedCount = normalDeleteResult.affected ?? 0;
        processingResult.authoritativeAbsenceArchivedCount =
          authoritativeAbsenceActivityIds.length;
        processingResult.authoritativeAbsenceDeletedCount =
          authoritativeDeleteResult.affected ?? 0;

        this.logger.log(
          {
            requestedCount: removed.length,
            deletedCount:
              processingResult.normalRemovedCount +
              processingResult.authoritativeAbsenceDeletedCount,
            authoritativeAbsenceArchivedCount:
              processingResult.authoritativeAbsenceArchivedCount,
            authoritativeAbsenceDeletedCount:
              processingResult.authoritativeAbsenceDeletedCount,
          },
          'Removed transactions',
        );
      }

      await hooks.beforeCommit?.(manager);
    });

    if (uncategorizedInsertedTransactions.length > 0) {
      const transactionIds = uncategorizedInsertedTransactions.map(
        (transaction) => transaction.id,
      );
      const accountIds = [
        ...new Set(
          uncategorizedInsertedTransactions.map(
            (transaction) => transaction.accountId,
          ),
        ),
      ];

      this.eventEmitter.emit(
        TransactionEvents.PROVIDER_TRANSACTIONS_SYNCED,
        new ProviderTransactionsSyncedEvent(
          userId,
          transactionIds,
          accountIds,
          uncategorizedInsertedTransactions.length,
          new Date().toISOString(),
        ),
      );
    }

    this.logger.log(
      { userId, automaticallyCategorizedCount },
      'Transaction sync results processed successfully',
    );
    return processingResult;
  }

  private async removeActivityCascade(
    entity: TransactionEntity,
  ): Promise<void> {
    await this.repository.manager.transaction(async (manager) => {
      await manager
        .getRepository(AccountActivityEntity)
        .delete({ id: entity.activityId });
    });
  }
}
