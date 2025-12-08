import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
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
   * Find all balance snapshots for a user with balances converted to user's preferred currency
   *
   * @param userId - The ID of the user
   * @returns Array of balance snapshots with converted balances
   */
  async findAllWithConversion(
    userId: string,
  ): Promise<BalanceSnapshotWithConvertedBalance[]> {
    const snapshots = await this.findAll(userId);
    return this.balanceConversionHelper.addConvertedBalances(snapshots, userId);
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
    const snapshots = await this.findByAccountId(accountId, userId);
    return this.balanceConversionHelper.addConvertedBalances(snapshots, userId);
  }

  /**
   * Find snapshots closest to a target date for all accounts, with converted balances
   *
   * @param userId - The user ID
   * @param targetDate - The target date to find snapshots near
   * @param windowDays - Number of days before/after target to search (default 3)
   * @returns Map of accountId to snapshot with converted balances
   */
  async findSnapshotsNearDateWithConversion(
    userId: string,
    targetDate: Date,
    windowDays: number = 3,
  ): Promise<Map<string, BalanceSnapshotWithConvertedBalance>> {
    // Look for snapshots within a window around the target date
    const windowStart = new Date(targetDate);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowEnd = new Date(targetDate);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    const entities = await this.repository.find({
      where: {
        userId,
        snapshotDate: Between(
          windowStart.toISOString().split('T')[0],
          windowEnd.toISOString().split('T')[0],
        ),
      },
      order: { snapshotDate: 'DESC' },
    });

    if (entities.length === 0) {
      return new Map();
    }

    // Group by accountId, keeping the closest to target date
    const closestByAccount = new Map<string, BalanceSnapshotEntity>();
    const targetTime = targetDate.getTime();

    for (const entity of entities) {
      const existing = closestByAccount.get(entity.accountId);
      if (!existing) {
        closestByAccount.set(entity.accountId, entity);
      } else {
        // Keep the one closest to target date
        const existingDiff = Math.abs(
          new Date(existing.snapshotDate).getTime() - targetTime,
        );
        const currentDiff = Math.abs(
          new Date(entity.snapshotDate).getTime() - targetTime,
        );
        if (currentDiff < existingDiff) {
          closestByAccount.set(entity.accountId, entity);
        }
      }
    }

    // Convert snapshots to domain objects
    const snapshots = Array.from(closestByAccount.values()).map((e) =>
      e.toObject(),
    );

    // Add converted balances using the helper
    const snapshotsWithConversion =
      await this.balanceConversionHelper.addConvertedBalances(
        snapshots,
        userId,
      );

    // Build result map keyed by accountId
    const result = new Map<string, BalanceSnapshotWithConvertedBalance>();
    for (const snapshot of snapshotsWithConversion) {
      result.set(snapshot.accountId, snapshot);
    }

    return result;
  }
}
