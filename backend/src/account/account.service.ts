import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { In, Not, Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import {
  ManualAccountBalanceUpdatedEvent,
  ManualAccountCreatedEvent,
  ManualAccountEvents,
} from '../events/account.events';
import { Account, CreateAccountDto, UpdateAccountDto } from '../types/Account';
import { MoneySign, SerializedMoneyWithSign } from '../types/MoneyWithSign';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { AccountEntity } from './account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';

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
    newBalance: SerializedMoneyWithSign,
  ): Promise<Account> {
    const accountEntity = await this.repository.findOne({
      where: { id: accountId, userId },
    });

    if (!accountEntity) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }
    if (accountEntity.bankLinkId) {
      throw new BadRequestException(
        `Account with id ${accountId} is linked and cannot be manually updated`,
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
          money: { amount: 0, currency: newBalance.money.currency },
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
    const syncedAt = lastSyncTimes.get(id);
    return {
      ...account,
      ...(syncedAt ? { syncedAt } : {}),
    };
  }

  async findAll(userId: string): Promise<Account[]> {
    const accounts = await super.findAll(userId);
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
