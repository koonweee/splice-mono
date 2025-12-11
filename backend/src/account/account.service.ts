import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceSnapshotService } from '../balance-snapshot/balance-snapshot.service';
import { BalanceConversionHelper } from '../common/balance-conversion.helper';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import { CurrencyConversionService } from '../exchange-rate/currency-conversion.service';
import {
  Account,
  AccountWithConvertedBalance,
  CreateAccountDto,
  UpdateAccountDto,
} from '../types/Account';
import { UserService } from '../user/user.service';
import { AccountEntity } from './account.entity';

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

  private readonly balanceConversionHelper: BalanceConversionHelper;

  constructor(
    @InjectRepository(AccountEntity)
    repository: Repository<AccountEntity>,
    @Inject(forwardRef(() => BalanceSnapshotService))
    private readonly balanceSnapshotService: BalanceSnapshotService,
    private readonly userService: UserService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {
    super(repository);
    this.balanceConversionHelper = new BalanceConversionHelper(
      userService,
      currencyConversionService,
    );
  }

  protected applyUpdate(entity: AccountEntity, dto: UpdateAccountDto): void {
    if (dto.name !== undefined) entity.name = dto.name;
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

  /**
   * Find all accounts for a user with balances converted to user's preferred currency
   *
   * @param userId - The ID of the user
   * @returns Array of accounts with converted balances
   */
  async findAllWithConversion(
    userId: string,
  ): Promise<AccountWithConvertedBalance[]> {
    // Fetch accounts and last sync times in parallel
    const [accounts, lastSyncMap] = await Promise.all([
      this.findAll(userId),
      this.balanceSnapshotService.getLastSyncTimes(userId),
    ]);

    // Add lastSyncedAt to each account
    const accountsWithSync = accounts.map((account) => ({
      ...account,
      lastSyncedAt: lastSyncMap.get(account.id) ?? null,
    }));

    return this.balanceConversionHelper.addConvertedBalances(
      accountsWithSync,
      userId,
    );
  }

  /**
   * Find a single account by ID with balances converted to user's preferred currency
   *
   * @param id - The account ID
   * @param userId - The ID of the user
   * @returns Account with converted balances, or null if not found
   */
  async findOneWithConversion(
    id: string,
    userId: string,
  ): Promise<AccountWithConvertedBalance | null> {
    const account = await this.findOne(id, userId);

    if (!account) {
      return null;
    }

    const lastSyncMap = await this.balanceSnapshotService.getLastSyncTimes(
      userId,
      id,
    );

    const accountWithSync = {
      ...account,
      lastSyncedAt: lastSyncMap.get(id) ?? null,
    };

    const [accountWithConversion] =
      await this.balanceConversionHelper.addConvertedBalances(
        [accountWithSync],
        userId,
      );
    return accountWithConversion;
  }
}
