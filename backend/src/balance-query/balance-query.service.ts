import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { AccountType } from 'plaid';
import { Between, In, IsNull, Not, Repository } from 'typeorm';
import type { ExtendedAccountType } from '../types/AccountType';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { CurrencyExchangeService } from '../currency-exchange/currency-exchange.service';
import type { Account } from '../types/Account';
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
  BalanceWithConvertedBalance,
  RateWithSource,
} from '../types/BalanceQuery';
import type { CurrencyPair } from '../types/ExchangeRate';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { UserService } from '../user/user.service';

@Injectable()
export class BalanceQueryService {
  private readonly logger = new Logger(BalanceQueryService.name);

  constructor(
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private snapshotRepository: Repository<BalanceSnapshotEntity>,
    private currencyExchangeService: CurrencyExchangeService,
    private userService: UserService,
  ) {}

  /**
   * Get balance snapshots for accounts over a date range.
   * Balances are converted to the user's preferred currency if different from account currency.
   *
   * @param accountIds - List of account IDs to query
   * @param startDate - Start date (YYYY-MM-DD, inclusive)
   * @param endDate - End date (YYYY-MM-DD, inclusive)
   * @param userId - User ID for ownership verification and currency preference
   * @returns Array of balance results per date
   */
  async getSnapshotBalancesForDateRange(
    accountIds: string[],
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<BalanceQueryPerDateResult[]> {
    this.logger.log(
      { accountCount: accountIds.length, startDate, endDate },
      'Getting snapshot balances for accounts',
    );

    // Fetch user's preferred currency for conversion
    const user = await this.userService.findOne(userId);
    const targetCurrency = user?.settings?.currency;

    // Step 1: Fetch accounts (ensures user ownership and gets account details)
    const accounts = await this.accountRepository.find({
      where: {
        id: In(accountIds),
        userId,
      },
      relations: ['bankLink'],
    });

    // Create a map for quick lookup
    const accountMap = new Map<string, Account>();
    accounts.forEach((a) => accountMap.set(a.id, a.toObject()));

    // Validate all requested accounts were found
    const foundIds = new Set(accounts.map((a) => a.id));
    const missingIds = accountIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      this.logger.warn(
        { missingIds },
        'Accounts not found or not owned by user',
      );
    }

    // Only process accounts that were found
    const validAccountIds = accountIds.filter((id) => foundIds.has(id));
    if (validAccountIds.length === 0) {
      return [];
    }

    // Step 2: Fetch snapshots within the date range
    const snapshotsInRange = await this.snapshotRepository.find({
      where: {
        accountId: In(validAccountIds),
        userId,
        snapshotDate: Between(startDate, endDate),
      },
      order: { snapshotDate: 'ASC' },
    });

    // Step 2b: For each account, fetch the most recent snapshot before startDate
    // (needed for fill-forward when no snapshot exists on startDate)
    const priorSnapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .distinctOn(['snapshot.accountId'])
      .where('snapshot.accountId IN (:...accountIds)', {
        accountIds: validAccountIds,
      })
      .andWhere('snapshot.userId = :userId', { userId })
      .andWhere('snapshot.snapshotDate < :startDate', { startDate })
      .orderBy('snapshot.accountId')
      .addOrderBy('snapshot.snapshotDate', 'DESC')
      .getMany();

    const snapshots = [...priorSnapshots, ...snapshotsInRange];

    // Group snapshots by accountId, then by date
    const snapshotsByAccount = new Map<
      string,
      Map<string, BalanceSnapshotEntity>
    >();
    snapshots.forEach((snapshot) => {
      if (!snapshotsByAccount.has(snapshot.accountId)) {
        snapshotsByAccount.set(snapshot.accountId, new Map());
      }
      snapshotsByAccount
        .get(snapshot.accountId)!
        .set(snapshot.snapshotDate, snapshot);
    });

    // Step 3: Fetch exchange rates if targetCurrency provided
    let ratesByDate: Map<string, Map<string, RateWithSource>> | null = null;

    if (targetCurrency) {
      ratesByDate = await this.fetchExchangeRates(
        accounts,
        targetCurrency,
        startDate,
        endDate,
      );
    }

    // Step 4: Iterate over date range and build results
    const results: BalanceQueryPerDateResult[] = [];
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);

    while (currentDate.diff(end, 'day') <= 0) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const balances: Record<string, AccountBalanceResult> = {};

      validAccountIds.forEach((accountId) => {
        const account = accountMap.get(accountId);
        if (!account) return;

        // Find snapshot for this date or most recent before
        const accountSnapshots = snapshotsByAccount.get(accountId);
        const snapshot = this.findSnapshotForDate(accountSnapshots, dateStr);

        // Build balance result
        const result = this.buildAccountBalanceResult(
          account,
          snapshot,
          dateStr,
          targetCurrency,
          ratesByDate?.get(dateStr),
        );

        balances[accountId] = result;
      });

      results.push({ date: dateStr, balances });
      currentDate = currentDate.add(1, 'day');
    }

    return results;
  }

  /**
   * Get balances for specific accounts over a date range.
   * Routes to appropriate balance source based on account type (linked vs manual).
   *
   * @param accountIds - List of account IDs to query
   * @param startDate - Start date (YYYY-MM-DD, inclusive)
   * @param endDate - End date (YYYY-MM-DD, inclusive)
   * @param userId - User ID for ownership verification
   * @returns Array of balance results per date
   * @throws BadRequestException if any manual accounts are included
   */
  async getBalancesForDateRange(
    accountIds: string[],
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<BalanceQueryPerDateResult[]> {
    this.logger.log(
      { accountCount: accountIds.length, startDate, endDate },
      'Getting balances for accounts',
    );

    // Fetch accounts to check their types
    const accounts = await this.accountRepository.find({
      where: {
        id: In(accountIds),
        userId,
      },
    });

    // Check for manual accounts (no bankLinkId)
    const manualAccounts = accounts.filter((a) => a.bankLinkId === null);
    if (manualAccounts.length > 0) {
      const manualIds = manualAccounts.map((a) => a.id).join(', ');
      throw new BadRequestException(
        `Manual accounts are not yet supported for balance queries: ${manualIds}`,
      );
    }

    // All accounts are linked - route to snapshot-based balances
    return this.getSnapshotBalancesForDateRange(
      accountIds,
      startDate,
      endDate,
      userId,
    );
  }

  /**
   * Get balances for all linked accounts over a date range.
   *
   * @param startDate - Start date (YYYY-MM-DD, inclusive)
   * @param endDate - End date (YYYY-MM-DD, inclusive)
   * @param userId - User ID for ownership verification
   * @returns Array of balance results per date
   */
  async getAllBalancesForDateRange(
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<BalanceQueryPerDateResult[]> {
    this.logger.log(
      { startDate, endDate, userId },
      'Getting all balances for user',
    );

    // Fetch all linked accounts for the user
    const linkedAccounts = await this.accountRepository.find({
      where: {
        userId,
        bankLinkId: Not(IsNull()),
      },
    });

    if (linkedAccounts.length === 0) {
      return [];
    }

    const accountIds = linkedAccounts.map((a) => a.id);
    return this.getSnapshotBalancesForDateRange(
      accountIds,
      startDate,
      endDate,
      userId,
    );
  }

  /**
   * Fetch exchange rates for the date range, building a lookup map.
   */
  private async fetchExchangeRates(
    accounts: AccountEntity[],
    targetCurrency: string,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, Map<string, RateWithSource>>> {
    // Determine which currency pairs we need
    const currencyPairs: CurrencyPair[] = [];
    const seenPairs = new Set<string>();

    accounts.forEach((account) => {
      const accountCurrency = account.currentBalance.currency;
      if (accountCurrency !== targetCurrency) {
        const pairKey = `${accountCurrency}:${targetCurrency}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          currencyPairs.push({
            baseCurrency: accountCurrency,
            targetCurrency,
          });
        }
      }
    });

    if (currencyPairs.length === 0) {
      return new Map();
    }

    try {
      const rateResponses =
        await this.currencyExchangeService.getRatesForDateRange(
          currencyPairs,
          startDate,
          endDate,
        );

      // Build lookup: date -> (baseCurrency:targetCurrency -> rate)
      const ratesByDate = new Map<string, Map<string, RateWithSource>>();
      rateResponses.forEach((response) => {
        const dateRates = new Map<string, RateWithSource>();
        response.rates.forEach((rate) => {
          dateRates.set(`${rate.baseCurrency}:${rate.targetCurrency}`, rate);
        });
        ratesByDate.set(response.date, dateRates);
      });

      return ratesByDate;
    } catch (error) {
      this.logger.error(
        { error: String(error) },
        'Failed to fetch exchange rates',
      );
      return new Map();
    }
  }

  /**
   * Find the snapshot for a given date, or the most recent before that date.
   */
  private findSnapshotForDate(
    snapshots: Map<string, BalanceSnapshotEntity> | undefined,
    targetDate: string,
  ): BalanceSnapshotEntity | undefined {
    if (!snapshots) return undefined;

    // Check for exact match
    const exactMatch = snapshots.get(targetDate);
    if (exactMatch) return exactMatch;

    // Find most recent before targetDate
    let mostRecent: BalanceSnapshotEntity | undefined;
    snapshots.forEach((snapshot, date) => {
      if (date <= targetDate) {
        if (!mostRecent || date > mostRecent.snapshotDate) {
          mostRecent = snapshot;
        }
      }
    });
    return mostRecent;
  }

  /**
   * Build the AccountBalanceResult for a single account on a single date.
   */
  private buildAccountBalanceResult(
    account: Account,
    snapshot: BalanceSnapshotEntity | undefined,
    targetDate: string,
    targetCurrency: string | undefined,
    dateRates: Map<string, RateWithSource> | undefined,
  ): AccountBalanceResult {
    // Get balances (zero if no snapshot)
    const availableBalance = snapshot
      ? snapshot.availableBalance.toMoneyWithSign()
      : this.createZeroBalance(account.availableBalance.money.currency);

    const currentBalance = snapshot
      ? snapshot.currentBalance.toMoneyWithSign()
      : this.createZeroBalance(account.currentBalance.money.currency);

    // Calculate effective balance based on account type
    const effectiveBalance = this.calculateEffectiveBalance(
      account.type,
      availableBalance,
      currentBalance,
    );

    // Determine syncedAt (undefined if forward-filled or no snapshot)
    const isForwardFilled = snapshot && snapshot.snapshotDate !== targetDate;
    const syncedAt =
      snapshot && !isForwardFilled ? snapshot.updatedAt : undefined;

    // Build result with optional conversion
    return {
      account,
      availableBalance: this.buildBalanceWithConversion(
        availableBalance,
        targetCurrency,
        dateRates,
      ),
      currentBalance: this.buildBalanceWithConversion(
        currentBalance,
        targetCurrency,
        dateRates,
      ),
      effectiveBalance: this.buildBalanceWithConversion(
        effectiveBalance,
        targetCurrency,
        dateRates,
      ),
      syncedAt,
    };
  }

  /**
   * Calculate effective balance based on account type.
   * - Investment/brokerage accounts: availableBalance + currentBalance
   * - All other types: currentBalance
   */
  private calculateEffectiveBalance(
    accountType: ExtendedAccountType,
    availableBalance: SerializedMoneyWithSign,
    currentBalance: SerializedMoneyWithSign,
  ): SerializedMoneyWithSign {
    // For Investment/Brokerage accounts, combine available + current balance
    // For all other types (including crypto), use available balance
    if (
      accountType === AccountType.Investment ||
      accountType === AccountType.Brokerage
    ) {
      const availableAmount = this.getSignedAmount(availableBalance);
      const currentAmount = this.getSignedAmount(currentBalance);
      const totalAmount = availableAmount + currentAmount;

      return {
        money: {
          amount: Math.abs(totalAmount),
          currency: availableBalance.money.currency,
        },
        sign: totalAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
      };
    }

    // For all other types: just current balance
    return currentBalance;
  }

  /**
   * Get the signed amount (positive or negative) from a SerializedMoneyWithSign.
   */
  private getSignedAmount(balance: SerializedMoneyWithSign): number {
    return balance.sign === MoneySign.POSITIVE
      ? balance.money.amount
      : -balance.money.amount;
  }

  /**
   * Build a BalanceWithConvertedBalance, applying currency conversion if needed.
   */
  private buildBalanceWithConversion(
    balance: SerializedMoneyWithSign,
    targetCurrency: string | undefined,
    dateRates: Map<string, RateWithSource> | undefined,
  ): BalanceWithConvertedBalance {
    const result: BalanceWithConvertedBalance = { balance };

    if (
      targetCurrency &&
      balance.money.currency !== targetCurrency &&
      dateRates
    ) {
      const rateKey = `${balance.money.currency}:${targetCurrency}`;
      const rateInfo = dateRates.get(rateKey);

      if (rateInfo) {
        const convertedAmount = Math.round(
          balance.money.amount * rateInfo.rate,
        );
        result.convertedBalance = {
          money: {
            amount: convertedAmount,
            currency: targetCurrency,
          },
          sign: balance.sign,
        };
        result.exchangeRate = rateInfo;
      }
    }

    return result;
  }

  /**
   * Create a zero balance with the given currency.
   */
  private createZeroBalance(currency: string): SerializedMoneyWithSign {
    return {
      money: { amount: 0, currency },
      sign: MoneySign.POSITIVE,
    };
  }
}
