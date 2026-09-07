import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { AccountType } from 'plaid';
import { In, IsNull, Not, Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  ManualAccountBalanceUpdatedEvent,
  ManualAccountCreatedEvent,
  ManualAccountEvents,
} from '../events/account.events';
import {
  Account,
  CreateManualAccountDto,
  UpdateAccountMetadataDto,
} from '../types/Account';
import { MoneySign, SerializedMoneyWithSign } from '../types/MoneyWithSign';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { AccountEntity } from './account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../bank-link/bank-link.entity';
import { BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL } from '../bank-link/bank-link-lifecycle-lock';
import { UserService } from '../user/user.service';

dayjs.extend(utc);
dayjs.extend(timezone);

interface FindAllAccountsOptions {
  includeArchived?: boolean;
}

@Injectable()
export class AccountService extends OwnedCrudService<
  AccountEntity,
  Account,
  CreateManualAccountDto,
  UpdateAccountMetadataDto
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
    @InjectRepository(BankLinkEntity)
    private readonly bankLinkRepository: Repository<BankLinkEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly userService: UserService,
  ) {
    super(repository);
  }

  /**
   * Override create to emit event for manual accounts
   */
  async create(dto: CreateManualAccountDto, userId: string): Promise<Account> {
    // Copy only the public manual-account fields before entity mapping so a
    // structurally wider internal object cannot smuggle provider-owned data.
    const manualDto: CreateManualAccountDto = {
      name: dto.name,
      customName: dto.customName,
      notes: dto.notes,
      type: dto.type,
      subType: dto.subType,
      availableBalance: dto.availableBalance,
      currentBalance: dto.currentBalance,
    };
    const account = await super.create(manualDto, userId);

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
    newBalance: SerializedMoneyWithSign,
  ): Promise<Account> {
    const accountEntity = await this.repository.findOne({
      where: { id: accountId, userId, archivedAt: IsNull() },
    });

    if (!accountEntity) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }
    if (accountEntity.bankLinkId) {
      throw new BadRequestException(
        `Account with id ${accountId} is linked and cannot be manually updated`,
      );
    }
    if (accountEntity.valuationMode === 'holdings') {
      throw new BadRequestException(
        `Account with id ${accountId} is valued from holdings and cannot be manually balanced`,
      );
    }

    accountEntity.currentBalance = BalanceColumns.fromMoneyWithSign(newBalance);

    // Manual investment accounts only track a single balance value.
    // Keep available at zero and treat current as the display/effective balance.
    const isInvestmentType =
      accountEntity.type === String(AccountType.Investment) ||
      accountEntity.type === String(AccountType.Brokerage);
    const availableBalance: SerializedMoneyWithSign = isInvestmentType
      ? {
          money: { amount: '0', currency: newBalance.money.currency },
          sign: MoneySign.POSITIVE,
        }
      : newBalance;
    accountEntity.availableBalance =
      BalanceColumns.fromMoneyWithSign(availableBalance);

    const savedEntity = await this.repository.save(accountEntity);
    const account = savedEntity.toObject();

    this.eventEmitter.emit(
      ManualAccountEvents.BALANCE_UPDATED,
      new ManualAccountBalanceUpdatedEvent(account),
    );

    return account;
  }

  async update(
    id: string,
    dto: UpdateAccountMetadataDto,
    userId: string,
  ): Promise<Account | null> {
    this.logger.log({ id, userId }, `Updating ${this.entityName}`);

    const entity = await this.repository.findOne({
      where: { id, userId, archivedAt: IsNull() },
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        `${this.entityName} not found for update`,
      );
      return null;
    }

    this.applyUpdate(entity, dto);

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id }, `${this.entityName} updated successfully`);
    return savedEntity.toObject();
  }

  protected applyUpdate(
    entity: AccountEntity,
    dto: UpdateAccountMetadataDto,
  ): void {
    if (dto.name !== undefined) {
      if (entity.bankLinkId) {
        throw new BadRequestException(
          'Linked account provider names cannot be updated directly',
        );
      }
      entity.name = dto.name;
    }
    if (dto.customName !== undefined) entity.customName = dto.customName;
    if (dto.notes !== undefined) entity.notes = dto.notes;
  }

  async findOne(id: string, userId: string): Promise<Account | null> {
    const account = await super.findOne(id, userId);
    if (!account) return null;

    const lastSyncTimes = await this.getLastSyncTimes([id], userId);
    const syncedAt = lastSyncTimes.get(id);
    return {
      ...account,
      ...(syncedAt ? { syncedAt } : {}),
    };
  }

  async findAll(
    userId: string,
    options: FindAllAccountsOptions = {},
  ): Promise<Account[]> {
    this.logger.log({ userId }, 'Finding all Accounts');

    const entities = await this.repository.find({
      where: { userId },
      relations: this.relations,
    });
    const accounts = entities
      .map((entity) => entity.toObject())
      .filter((account) => options.includeArchived || !account.archivedAt);
    const lastSyncTimes = await this.getLastSyncTimes(
      accounts.map((account) => account.id),
      userId,
    );

    return accounts.map((account) => {
      const syncedAt = lastSyncTimes.get(account.id);
      return {
        ...account,
        ...(syncedAt ? { syncedAt } : {}),
      };
    });
  }

  async archive(id: string, userId: string): Promise<Account | null> {
    // Read identity first so all lifecycle paths acquire link -> account locks.
    const identity = await this.repository.findOne({ where: { id, userId } });
    if (!identity) return null;
    return this.repository.manager.transaction(async (manager) => {
      if (identity.bankLinkId) {
        await manager.query(BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL, [
          identity.bankLinkId,
        ]);
      }
      const accounts = manager.getRepository(AccountEntity);
      const links = manager.getRepository(BankLinkEntity);
      const account = await accounts.findOne({
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!account) return null;
      if (account.bankLinkId !== identity.bankLinkId) {
        throw new BadRequestException(
          'Account connection changed; retry archiving',
        );
      }
      if (!account.archivedAt) {
        account.archivedAt = new Date();
        account.currentBalance = this.createZeroBalance(
          account.currentBalance.currency,
        );
        account.availableBalance = this.createZeroBalance(
          account.availableBalance.currency,
        );
        await accounts.save(account);
        await this.upsertArchiveSnapshot(
          account,
          userId,
          manager.getRepository(BalanceSnapshotEntity),
        );
      }
      if (account.bankLinkId) {
        const link = await links.findOne({
          where: { id: account.bankLinkId, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (link) {
          // Derive membership from rows, never the potentially stale accountIds list.
          const remaining = await accounts.find({
            where: { bankLinkId: link.id, archivedAt: IsNull() },
          });
          link.accountIds = remaining.flatMap((a) =>
            a.externalAccountId ? [a.externalAccountId] : [],
          );
          if (remaining.length === 0 && link.providerName === 'plaid') {
            link.archivedAt ??= new Date();
            if (!link.disconnectedAt) {
              link.disconnectRequestedAt ??= new Date();
              link.disconnectNextAttemptAt ??= link.disconnectRequestedAt;
            }
          }
          await links.save(link);
          account.bankLink = link;
        }
      }
      return account.toObject();
    });
  }

  private createZeroBalance(currency: string): BalanceColumns {
    return BalanceColumns.fromMoneyWithSign({
      money: { amount: '0', currency },
      sign: MoneySign.POSITIVE,
    });
  }

  private async upsertArchiveSnapshot(
    accountEntity: AccountEntity,
    userId: string,
    snapshots = this.balanceSnapshotRepository,
  ): Promise<void> {
    const timezone = await this.userService.getTimezone(userId);
    const snapshotDate = dayjs().tz(timezone).format('YYYY-MM-DD');
    const existingSnapshot = await snapshots.findOne({
      where: {
        accountId: accountEntity.id,
        snapshotDate,
        userId,
      },
    });

    if (existingSnapshot) {
      existingSnapshot.currentBalance = accountEntity.currentBalance;
      existingSnapshot.availableBalance = accountEntity.availableBalance;
      existingSnapshot.snapshotType = BalanceSnapshotType.USER_UPDATE;
      await snapshots.save(existingSnapshot);
      return;
    }

    const snapshot = BalanceSnapshotEntity.fromDto(
      {
        accountId: accountEntity.id,
        currentBalance: accountEntity.currentBalance.toMoneyWithSign(),
        availableBalance: accountEntity.availableBalance.toMoneyWithSign(),
        snapshotDate,
        snapshotType: BalanceSnapshotType.USER_UPDATE,
      },
      userId,
    );
    await snapshots.save(snapshot);
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
}
