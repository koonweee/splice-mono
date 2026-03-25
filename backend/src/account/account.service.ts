import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  ManualAccountCreatedEvent,
  ManualAccountEvents,
} from '../events/account.events';
import {
  Account,
  CreateAccountDto,
  UpdateAccountDto,
  UpdateManualBalanceDto,
} from '../types/Account';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { AccountEntity } from './account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { ManualBalanceUpdateService } from './manual-balance-update.service';

@Injectable()
export class AccountService extends OwnedCrudService<
  AccountEntity,
  Account,
  CreateAccountDto,
  UpdateAccountDto
> {
  protected readonly logger = new Logger(AccountService.name);
  protected readonly entityName = 'Account';
  protected readonly EntityClass = AccountEntity;
  protected readonly relations = ['bankLink'];

  constructor(
    @InjectRepository(AccountEntity)
    repository: Repository<AccountEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly manualBalanceUpdateService: ManualBalanceUpdateService,
  ) {
    super(repository);
  }

  /**
   * Override create to emit event for manual accounts
   */
  async create(dto: CreateAccountDto, userId: string): Promise<Account> {
    const account = await super.create(dto, userId);

    if (!account.bankLinkId) {
      this.eventEmitter.emit(
        ManualAccountEvents.CREATED,
        new ManualAccountCreatedEvent(account),
      );
    }
    return account;
  }

  /**
   * Manually update the balance of an account
   */
  async updateManualBalance(
    accountId: string,
    userId: string,
    dto: UpdateManualBalanceDto,
  ): Promise<Account> {
    return this.manualBalanceUpdateService.updateManualBalance(
      accountId,
      userId,
      dto,
    );
  }

  protected applyUpdate(entity: AccountEntity, dto: UpdateAccountDto): void {
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.customName !== undefined) entity.customName = dto.customName;
    if (dto.availableBalance !== undefined) {
      entity.availableBalance = BalanceColumns.fromMoneyWithSign(
        dto.availableBalance,
      );
    }
    if (dto.currentBalance !== undefined) {
      entity.currentBalance = BalanceColumns.fromMoneyWithSign(
        dto.currentBalance,
      );
    }
    if (dto.type !== undefined) entity.type = dto.type;
    if (dto.subType !== undefined) entity.subType = dto.subType;
    if (dto.externalAccountId !== undefined)
      entity.externalAccountId = dto.externalAccountId;
    if (dto.bankLinkId !== undefined) {
      entity.bankLinkId = dto.bankLinkId;
    }
  }

  async findOne(id: string, userId: string): Promise<Account | null> {
    const account = await super.findOne(id, userId);
    if (!account) return null;

    const lastSyncTimes = await this.getLastSyncTimes([id], userId);
    const latestSnapshotDates = await this.getLatestSnapshotDates([id], userId);
    const syncedAt = lastSyncTimes.get(id);
    return {
      ...account,
      ...(syncedAt ? { syncedAt } : {}),
      ...(latestSnapshotDates.get(id)
        ? { latestSnapshotDate: latestSnapshotDates.get(id) }
        : {}),
    };
  }

  async findAll(userId: string): Promise<Account[]> {
    const accounts = await super.findAll(userId);
    const lastSyncTimes = await this.getLastSyncTimes(
      accounts.map((account) => account.id),
      userId,
    );
    const latestSnapshotDates = await this.getLatestSnapshotDates(
      accounts.map((account) => account.id),
      userId,
    );

    return accounts.map((account) => {
      const syncedAt = lastSyncTimes.get(account.id);
      return {
        ...account,
        ...(syncedAt ? { syncedAt } : {}),
        ...(latestSnapshotDates.get(account.id)
          ? { latestSnapshotDate: latestSnapshotDates.get(account.id) }
          : {}),
      };
    });
  }

  private async getLastSyncTimes(
    accountIds: string[],
    userId: string,
  ): Promise<Map<string, Date>> {
    if (accountIds.length === 0) return new Map();

    const snapshots = await this.balanceSnapshotRepository.find({
      where: {
        userId,
        accountId: In(accountIds),
        snapshotType: Not(BalanceSnapshotType.FORWARD_FILL),
      },
      order: { updatedAt: 'DESC' },
    });

    const lastSyncTimes = new Map<string, Date>();
    snapshots.forEach((snapshot) => {
      if (!lastSyncTimes.has(snapshot.accountId)) {
        lastSyncTimes.set(snapshot.accountId, snapshot.updatedAt);
      }
    });

    return lastSyncTimes;
  }

  private async getLatestSnapshotDates(
    accountIds: string[],
    userId: string,
  ): Promise<Map<string, string>> {
    if (accountIds.length === 0) return new Map();

    const snapshots = await this.balanceSnapshotRepository.find({
      where: {
        userId,
        accountId: In(accountIds),
        snapshotType: Not(BalanceSnapshotType.FORWARD_FILL),
      },
      order: { snapshotDate: 'DESC', updatedAt: 'DESC' },
    });

    const latestSnapshotDates = new Map<string, string>();
    snapshots.forEach((snapshot) => {
      if (!latestSnapshotDates.has(snapshot.accountId)) {
        latestSnapshotDates.set(snapshot.accountId, snapshot.snapshotDate);
      }
    });

    return latestSnapshotDates;
  }
}
