import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import { CurrencyConversionService } from '../exchange-rate/currency-conversion.service';
import {
  BalanceSnapshot,
  BalanceSnapshotWithConvertedBalance,
  CreateBalanceSnapshotDto,
  UpdateBalanceSnapshotDto,
} from '../types/BalanceSnapshot';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
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

  constructor(
    @InjectRepository(BalanceSnapshotEntity)
    repository: Repository<BalanceSnapshotEntity>,
    private readonly userService: UserService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {
    super(repository);
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

    if (snapshots.length === 0) {
      return [];
    }

    // Get user's preferred currency
    const user = await this.userService.findOne(userId);
    const targetCurrency = user?.settings.currency ?? 'USD';

    // Prepare separate arrays for each balance type
    const currentBalanceInputs = snapshots.map((snapshot) => ({
      amount: snapshot.currentBalance.money.amount,
      currency: snapshot.currentBalance.money.currency,
    }));

    const availableBalanceInputs = snapshots.map((snapshot) => ({
      amount: snapshot.availableBalance.money.amount,
      currency: snapshot.availableBalance.money.currency,
    }));

    // Convert both balance types in parallel
    const [currentBalanceResults, availableBalanceResults] = await Promise.all([
      this.currencyConversionService.convertMany(
        currentBalanceInputs,
        targetCurrency,
      ),
      this.currencyConversionService.convertMany(
        availableBalanceInputs,
        targetCurrency,
      ),
    ]);

    // Map results back to snapshots
    return snapshots.map(
      (snapshot, index): BalanceSnapshotWithConvertedBalance => {
        return {
          ...snapshot,
          convertedCurrentBalance: this.buildConvertedBalance(
            currentBalanceResults[index],
            snapshot.currentBalance.sign,
            targetCurrency,
          ),
          convertedAvailableBalance: this.buildConvertedBalance(
            availableBalanceResults[index],
            snapshot.availableBalance.sign,
            targetCurrency,
          ),
        };
      },
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
    const snapshots = await this.findByAccountId(accountId, userId);

    if (snapshots.length === 0) {
      return [];
    }

    // Get user's preferred currency
    const user = await this.userService.findOne(userId);
    const targetCurrency = user?.settings.currency ?? 'USD';

    // Prepare separate arrays for each balance type
    const currentBalanceInputs = snapshots.map((snapshot) => ({
      amount: snapshot.currentBalance.money.amount,
      currency: snapshot.currentBalance.money.currency,
    }));

    const availableBalanceInputs = snapshots.map((snapshot) => ({
      amount: snapshot.availableBalance.money.amount,
      currency: snapshot.availableBalance.money.currency,
    }));

    // Convert both balance types in parallel
    const [currentBalanceResults, availableBalanceResults] = await Promise.all([
      this.currencyConversionService.convertMany(
        currentBalanceInputs,
        targetCurrency,
      ),
      this.currencyConversionService.convertMany(
        availableBalanceInputs,
        targetCurrency,
      ),
    ]);

    // Map results back to snapshots
    return snapshots.map(
      (snapshot, index): BalanceSnapshotWithConvertedBalance => {
        return {
          ...snapshot,
          convertedCurrentBalance: this.buildConvertedBalance(
            currentBalanceResults[index],
            snapshot.currentBalance.sign,
            targetCurrency,
          ),
          convertedAvailableBalance: this.buildConvertedBalance(
            availableBalanceResults[index],
            snapshot.availableBalance.sign,
            targetCurrency,
          ),
        };
      },
    );
  }

  /**
   * Helper to build a converted balance object from conversion result
   */
  private buildConvertedBalance(
    conversionResult: {
      amount: number;
      rate: number | null;
      usedFallback: boolean;
    },
    originalSign: MoneySign,
    targetCurrency: string,
  ): SerializedMoneyWithSign | null {
    // Return null if no rate was available (fallback was used)
    if (conversionResult.usedFallback) {
      return null;
    }

    return {
      money: {
        amount: Math.round(conversionResult.amount),
        currency: targetCurrency,
      },
      sign: originalSign,
    };
  }
}
