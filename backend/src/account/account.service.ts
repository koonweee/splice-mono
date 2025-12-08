import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import { CurrencyConversionService } from '../exchange-rate/currency-conversion.service';
import {
  Account,
  AccountWithConvertedBalance,
  CreateAccountDto,
  UpdateAccountDto,
} from '../types/Account';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
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

  constructor(
    @InjectRepository(AccountEntity)
    repository: Repository<AccountEntity>,
    private readonly userService: UserService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {
    super(repository);
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
    const accounts = await this.findAll(userId);

    if (accounts.length === 0) {
      return [];
    }

    // Get user's preferred currency
    const user = await this.userService.findOne(userId);
    const targetCurrency = user?.settings.currency ?? 'USD';

    // Prepare separate arrays for each balance type
    const currentBalanceInputs = accounts.map((account) => ({
      amount: account.currentBalance.money.amount,
      currency: account.currentBalance.money.currency,
    }));

    const availableBalanceInputs = accounts.map((account) => ({
      amount: account.availableBalance.money.amount,
      currency: account.availableBalance.money.currency,
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

    // Map results back to accounts
    return accounts.map((account, index): AccountWithConvertedBalance => {
      return {
        ...account,
        convertedCurrentBalance: this.buildConvertedBalance(
          currentBalanceResults[index],
          account.currentBalance.sign,
          targetCurrency,
        ),
        convertedAvailableBalance: this.buildConvertedBalance(
          availableBalanceResults[index],
          account.availableBalance.sign,
          targetCurrency,
        ),
      };
    });
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

    // Get user's preferred currency
    const user = await this.userService.findOne(userId);
    const targetCurrency = user?.settings.currency ?? 'USD';

    // Convert both balance types in parallel
    const [[currentBalanceResult], [availableBalanceResult]] =
      await Promise.all([
        this.currencyConversionService.convertMany(
          [
            {
              amount: account.currentBalance.money.amount,
              currency: account.currentBalance.money.currency,
            },
          ],
          targetCurrency,
        ),
        this.currencyConversionService.convertMany(
          [
            {
              amount: account.availableBalance.money.amount,
              currency: account.availableBalance.money.currency,
            },
          ],
          targetCurrency,
        ),
      ]);

    return {
      ...account,
      convertedCurrentBalance: this.buildConvertedBalance(
        currentBalanceResult,
        account.currentBalance.sign,
        targetCurrency,
      ),
      convertedAvailableBalance: this.buildConvertedBalance(
        availableBalanceResult,
        account.availableBalance.sign,
        targetCurrency,
      ),
    };
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
