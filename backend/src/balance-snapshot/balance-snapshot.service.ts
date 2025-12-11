import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountService } from '../account/account.service';
import { BalanceConversionHelper } from '../common/balance-conversion.helper';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import { CurrencyConversionService } from '../exchange-rate/currency-conversion.service';
import {
  BalanceSnapshot,
  BalanceSnapshotWithConvertedBalance,
  CreateBalanceSnapshotDto,
  UpdateBalanceSnapshotDto,
} from '../types/BalanceSnapshot';
import { UserService } from '../user/user.service';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';

@Injectable()
export class BalanceSnapshotService extends OwnedCrudService<
  BalanceSnapshotEntity,
  BalanceSnapshot,
  CreateBalanceSnapshotDto,
  UpdateBalanceSnapshotDto
> {
  protected readonly logger = new Logger(BalanceSnapshotService.name);
  protected readonly entityName = 'BalanceSnapshot';
  protected readonly EntityClass = BalanceSnapshotEntity;

  private readonly balanceConversionHelper: BalanceConversionHelper;

  constructor(
    @InjectRepository(BalanceSnapshotEntity)
    repository: Repository<BalanceSnapshotEntity>,
    private readonly userService: UserService,
    private readonly currencyConversionService: CurrencyConversionService,
    @Inject(forwardRef(() => AccountService))
    private readonly accountService: AccountService,
  ) {
    super(repository);
    this.balanceConversionHelper = new BalanceConversionHelper(
      userService,
      currencyConversionService,
    );
  }

  protected applyUpdate(
    entity: BalanceSnapshotEntity,
    dto: UpdateBalanceSnapshotDto,
  ): void {
    if (dto.accountId !== undefined) entity.accountId = dto.accountId;
    if (dto.snapshotDate !== undefined) entity.snapshotDate = dto.snapshotDate;
    if (dto.currentBalance !== undefined) {
      entity.currentBalance = BalanceColumns.fromMoneyWithSign(
        dto.currentBalance,
      );
    }
    if (dto.availableBalance !== undefined) {
      entity.availableBalance = BalanceColumns.fromMoneyWithSign(
        dto.availableBalance,
      );
    }
    if (dto.snapshotType !== undefined) entity.snapshotType = dto.snapshotType;
  }

  /**
   * Find all balance snapshots for a specific account
   *
   * @param accountId - The account ID to filter by
   * @param userId - The ID of the user who owns the snapshots
   * @returns Array of balance snapshots for the account, ordered by date descending
   */
  async findByAccountId(
    accountId: string,
    userId: string,
  ): Promise<BalanceSnapshot[]> {
    this.logger.log(
      `Finding balance snapshots for account: ${accountId}, userId=${userId}`,
    );

    const entities = await this.repository.find({
      where: { accountId, userId },
      order: { createdAt: 'DESC' },
    });

    this.logger.log(
      `Found ${entities.length} balance snapshots for account ${accountId}`,
    );
    return entities.map((entity) => entity.toObject());
  }

  /**
   * Upsert a balance snapshot - creates if not exists, updates if exists
   * Uses the unique constraint on (accountId, snapshotDate) for lookup
   *
   * @param dto - Balance snapshot data
   * @param userId - ID of the user who owns this snapshot
   * @returns The created or updated balance snapshot
   */
  async upsert(
    dto: CreateBalanceSnapshotDto,
    userId: string,
  ): Promise<BalanceSnapshot> {
    const snapshotDate =
      dto.snapshotDate ?? new Date().toISOString().split('T')[0];

    this.logger.log(
      `Upserting balance snapshot: accountId=${dto.accountId}, date=${snapshotDate}, userId=${userId}`,
    );

    // Find existing snapshot for this account and date (scoped by userId)
    const existingEntity = await this.repository.findOne({
      where: {
        accountId: dto.accountId,
        snapshotDate: snapshotDate,
        userId,
      },
    });

    if (existingEntity) {
      // Update existing snapshot
      this.logger.log(
        `Found existing snapshot, updating: id=${existingEntity.id}`,
      );

      existingEntity.currentBalance = BalanceColumns.fromMoneyWithSign(
        dto.currentBalance,
      );
      existingEntity.availableBalance = BalanceColumns.fromMoneyWithSign(
        dto.availableBalance,
      );
      existingEntity.snapshotType = dto.snapshotType;

      const savedEntity = await this.repository.save(existingEntity);
      this.logger.log(`Balance snapshot updated: id=${savedEntity.id}`);
      return savedEntity.toObject();
    }

    // Create new snapshot
    this.logger.log('No existing snapshot found, creating new one');
    const entity = BalanceSnapshotEntity.fromDto(
      {
        ...dto,
        snapshotDate,
      },
      userId,
    );
    const savedEntity = await this.repository.save(entity);
    this.logger.log(`Balance snapshot created: id=${savedEntity.id}`);
    return savedEntity.toObject();
  }

  /**
   * Add currencyDate and accountType to snapshots for historical currency conversion
   * and effective balance calculation.
   * Maps snapshotDate to currencyDate so the helper uses the correct historical rate.
   */
  private addSnapshotMetadata(
    snapshots: BalanceSnapshot[],
    accountTypeMap: Map<string, string>,
  ): (BalanceSnapshot & { currencyDate: string; accountType?: string })[] {
    return snapshots.map((snapshot) => ({
      ...snapshot,
      currencyDate: snapshot.snapshotDate,
      accountType: accountTypeMap.get(snapshot.accountId),
    }));
  }

  /**
   * Build a map of accountId to accountType for effective balance calculation
   */
  private async getAccountTypeMap(
    userId: string,
  ): Promise<Map<string, string>> {
    const accounts = await this.accountService.findAll(userId);
    const accountTypeMap = new Map<string, string>();
    for (const account of accounts) {
      accountTypeMap.set(account.id, account.type);
    }
    return accountTypeMap;
  }

  /**
   * Find all balance snapshots for a user with balances converted to user's preferred currency
   *
   * @param userId - The ID of the user
   * @returns Array of balance snapshots with converted balances
   */
  async findAllWithConversion(
    userId: string,
  ): Promise<BalanceSnapshotWithConvertedBalance[]> {
    const [snapshots, accountTypeMap] = await Promise.all([
      this.findAll(userId),
      this.getAccountTypeMap(userId),
    ]);
    const snapshotsWithMetadata = this.addSnapshotMetadata(
      snapshots,
      accountTypeMap,
    );
    return this.balanceConversionHelper.addConvertedBalances(
      snapshotsWithMetadata,
      userId,
    );
  }

  /**
   * Find all balance snapshots for an account with balances converted to user's preferred currency
   *
   * @param accountId - The account ID to filter by
   * @param userId - The ID of the user who owns the snapshots
   * @returns Array of balance snapshots with converted balances
   */
  async findByAccountIdWithConversion(
    accountId: string,
    userId: string,
  ): Promise<BalanceSnapshotWithConvertedBalance[]> {
    const [snapshots, accountTypeMap] = await Promise.all([
      this.findByAccountId(accountId, userId),
      this.getAccountTypeMap(userId),
    ]);
    const snapshotsWithMetadata = this.addSnapshotMetadata(
      snapshots,
      accountTypeMap,
    );
    return this.balanceConversionHelper.addConvertedBalances(
      snapshotsWithMetadata,
      userId,
    );
  }

  /**
   * Find snapshots for an exact date for all accounts, with converted balances
   *
   * @param userId - The user ID
   * @param snapshotDate - The exact date string (YYYY-MM-DD) to find snapshots for
   * @returns Map of accountId to snapshot with converted balances
   */
  async findSnapshotsForDateWithConversion(
    userId: string,
    snapshotDate: string,
  ): Promise<Map<string, BalanceSnapshotWithConvertedBalance>> {
    const [entities, accountTypeMap] = await Promise.all([
      this.repository.find({
        where: {
          userId,
          snapshotDate,
        },
      }),
      this.getAccountTypeMap(userId),
    ]);

    if (entities.length === 0) {
      return new Map();
    }

    // Convert snapshots to domain objects with metadata for conversion
    const snapshots = entities.map((e) => e.toObject());
    const snapshotsWithMetadata = this.addSnapshotMetadata(
      snapshots,
      accountTypeMap,
    );

    // Add converted balances using the helper
    const snapshotsWithConversion =
      await this.balanceConversionHelper.addConvertedBalances(
        snapshotsWithMetadata,
        userId,
      );

    // Build result map keyed by accountId
    const result = new Map<string, BalanceSnapshotWithConvertedBalance>();
    for (const snapshot of snapshotsWithConversion) {
      result.set(snapshot.accountId, snapshot);
    }

    return result;
  }

  /**
   * Find a snapshot for a specific account and date.
   * Used by the scheduled forward-fill job to check if a snapshot exists.
   *
   * @param accountId - The account ID
   * @param userId - The user ID
   * @param snapshotDate - The date string (YYYY-MM-DD)
   * @returns The snapshot if found, null otherwise
   */
  async findByAccountIdAndDate(
    accountId: string,
    userId: string,
    snapshotDate: string,
  ): Promise<BalanceSnapshot | null> {
    const entity = await this.repository.findOne({
      where: {
        accountId,
        userId,
        snapshotDate,
      },
    });

    return entity ? entity.toObject() : null;
  }

  /**
   * Find the most recent snapshot before a given date for an account.
   * Used by the scheduled forward-fill job to copy from the previous snapshot.
   *
   * @param accountId - The account ID
   * @param userId - The user ID
   * @param beforeDate - The date string (YYYY-MM-DD) to search before
   * @returns The most recent snapshot before the date, or null if none exists
   */
  async findMostRecentBeforeDate(
    accountId: string,
    userId: string,
    beforeDate: string,
  ): Promise<BalanceSnapshot | null> {
    const entity = await this.repository
      .createQueryBuilder('snapshot')
      .where('snapshot.accountId = :accountId', { accountId })
      .andWhere('snapshot.userId = :userId', { userId })
      .andWhere('snapshot.snapshotDate < :beforeDate', { beforeDate })
      .orderBy('snapshot.snapshotDate', 'DESC')
      .getOne();

    return entity ? entity.toObject() : null;
  }

  /**
   * Get the last sync time for accounts based on the most recent SYNC snapshot
   *
   * @param userId - The user ID
   * @param accountId - Optional account ID to filter by
   * @returns Map of accountId to lastSyncedAt date
   */
  async getLastSyncTimes(
    userId: string,
    accountId?: string,
  ): Promise<Map<string, Date>> {
    const query = this.repository
      .createQueryBuilder('snapshot')
      .select('snapshot.accountId', 'accountId')
      .addSelect('MAX(snapshot.createdAt)', 'lastSyncedAt')
      .where('snapshot.userId = :userId', { userId })
      .andWhere('snapshot.snapshotType = :type', { type: 'SYNC' });

    if (accountId) {
      query.andWhere('snapshot.accountId = :accountId', { accountId });
    }

    const results = await query.groupBy('snapshot.accountId').getRawMany<{
      accountId: string;
      lastSyncedAt: string;
    }>();

    return new Map(results.map((r) => [r.accountId, new Date(r.lastSyncedAt)]));
  }
}
