import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Between, In, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { calculateEffectiveBalance as calculateSharedEffectiveBalance } from '../common/effective-balance';
import { CurrencyExchangeService } from '../currency-exchange/currency-exchange.service';
import type { Account } from '../types/Account';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
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
import {
  buildBalanceWithConversion,
  createSnapshotCursor,
} from './balance-projection';

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

    const latestSyncedAtByAccount = await this.getLatestSyncedAtByAccount(
      validAccountIds,
      userId,
    );

    const snapshots = await this.loadRangeSnapshots(
      validAccountIds,
      userId,
      startDate,
      endDate,
    );

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
      const selectableSnapshots = snapshots.filter(
        (snapshot) =>
          snapshot.snapshotDate >= startDate ||
          !snapshotsByAccount.get(snapshot.accountId)?.has(startDate),
      );
      ratesByDate = await this.fetchExchangeRates(
        selectableSnapshots,
        targetCurrency,
        startDate,
        endDate,
      );
    }

    // Step 4: Iterate over date range and build results
    const results: BalanceQueryPerDateResult[] = [];
    const selectSnapshot = createSnapshotCursor(snapshots);
    let currentDate = dayjs(startDate);
    const end = dayjs(endDate);

    while (currentDate.diff(end, 'day') <= 0) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const balances: Record<string, AccountBalanceResult> = {};

      validAccountIds.forEach((accountId) => {
        const account = accountMap.get(accountId);
        if (!account) return;

        // Find snapshot for this date or most recent before
        const snapshot = selectSnapshot(accountId, dateStr);

        // Build balance result
        const result = this.buildAccountBalanceResult(
          account,
          snapshot,
          dateStr,
          latestSyncedAtByAccount.get(accountId),
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
   * @param accountIds - List of account IDs to query
   * @param startDate - Start date (YYYY-MM-DD, inclusive)
   * @param endDate - End date (YYYY-MM-DD, inclusive)
   * @param userId - User ID for ownership verification
   * @returns Array of balance results per date
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

    return this.getSnapshotBalancesForDateRange(
      accountIds,
      startDate,
      endDate,
      userId,
    );
  }

  /**
   * Get balances for all accounts over a date range.
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

    // Fetch all accounts for the user
    const accounts = await this.accountRepository.find({
      where: { userId },
    });

    if (accounts.length === 0) {
      return [];
    }

    const accountIds = accounts.map((a) => a.id);
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
    snapshots: BalanceSnapshotEntity[],
    targetCurrency: string,
    startDate: string,
    endDate: string,
  ): Promise<Map<string, Map<string, RateWithSource>>> {
    // Determine which currency pairs we need
    const currencyPairs: CurrencyPair[] = [];
    const seenPairs = new Set<string>();

    const addCurrencyPair = (baseCurrency: string) => {
      if (baseCurrency === targetCurrency) {
        return;
      }

      const pairKey = `${baseCurrency}:${targetCurrency}`;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        currencyPairs.push({
          baseCurrency,
          targetCurrency,
        });
      }
    };

    snapshots.forEach((snapshot) => {
      if (Number(snapshot.availableBalance.amount) !== 0) {
        addCurrencyPair(snapshot.availableBalance.currency);
      }
      if (Number(snapshot.currentBalance.amount) !== 0) {
        addCurrencyPair(snapshot.currentBalance.currency);
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

  /** Shared owned, bounded snapshot reads for history and compact projections. */
  private async loadRangeSnapshots(
    accountIds: string[],
    userId: string,
    startDate: string,
    endDate: string,
  ): Promise<BalanceSnapshotEntity[]> {
    const [inRange, prior] = await Promise.all([
      this.snapshotRepository.find({
        where: {
          accountId: In(accountIds),
          userId,
          snapshotDate: Between(startDate, endDate),
        },
        order: { snapshotDate: 'ASC' },
      }),
      this.snapshotRepository
        .createQueryBuilder('snapshot')
        .distinctOn(['snapshot.accountId'])
        .where('snapshot.accountId IN (:...accountIds)', { accountIds })
        .andWhere('snapshot.userId = :userId', { userId })
        .andWhere('snapshot.snapshotDate < :startDate', { startDate })
        .orderBy('snapshot.accountId')
        .addOrderBy('snapshot.snapshotDate', 'DESC')
        .getMany(),
    ]);
    return [...prior, ...inRange];
  }

  private loadBoundarySnapshots(
    accountIds: string[],
    userId: string,
    date: string,
  ) {
    return this.snapshotRepository
      .createQueryBuilder('snapshot')
      .distinctOn(['snapshot.accountId'])
      .where('snapshot.accountId IN (:...accountIds)', { accountIds })
      .andWhere('snapshot.userId = :userId', { userId })
      .andWhere('snapshot.snapshotDate <= :date', { date })
      .orderBy('snapshot.accountId')
      .addOrderBy('snapshot.snapshotDate', 'DESC')
      .getMany();
  }

  /**
   * Load metadata once and stream one date at a time. No daily account matrix
   * is retained. Boundary reads select at most two snapshots per account;
   * series reads retain complete daily FX validation, even on omitted dates.
   */
  async loadDashboardProjection(
    userId: string,
    startDate: string,
    endDate: string,
    boundaryOnly: boolean,
  ) {
    const [user, entities] = await Promise.all([
      this.userService.findOne(userId),
      this.accountRepository.find({
        where: { userId },
        relations: ['bankLink'],
      }),
    ]);
    if (!user) throw new UnauthorizedException();
    const reportingCurrency = user.settings.currency;
    const accounts = entities.map((entity) => entity.toObject());
    const accountIds = accounts.map((account) => account.id);
    if (accountIds.length === 0) {
      return {
        reportingCurrency,
        balances: [] as Iterable<BalanceQueryPerDateResult>,
      };
    }
    const [snapshots, latestSync] = await Promise.all([
      boundaryOnly
        ? Promise.all([
            this.loadBoundarySnapshots(accountIds, userId, startDate),
            this.loadBoundarySnapshots(accountIds, userId, endDate),
          ]).then((groups) => groups.flat())
        : this.loadRangeSnapshots(accountIds, userId, startDate, endDate),
      boundaryOnly
        ? this.getLatestSyncedAtByAccount(accountIds, userId)
        : Promise.resolve(new Map<string, Date>()),
    ]);
    // A prior snapshot superseded on the first day must not require unused FX.
    const firstDayAccounts = new Set(
      snapshots
        .filter((snapshot) => snapshot.snapshotDate === startDate)
        .map((snapshot) => snapshot.accountId),
    );
    const selectableSnapshots = snapshots.filter(
      (snapshot) =>
        snapshot.snapshotDate >= startDate ||
        !firstDayAccounts.has(snapshot.accountId),
    );
    let rates: Map<string, Map<string, RateWithSource>>;
    if (boundaryOnly) {
      const select = createSnapshotCursor(snapshots);
      const selectedAt = (date: string) =>
        accounts
          .map((account) => select(account.id, date))
          .filter((snapshot): snapshot is BalanceSnapshotEntity => !!snapshot);
      const first = selectedAt(startDate);
      const last = selectedAt(endDate);
      const boundaryRates = await Promise.all([
        this.fetchExchangeRates(first, reportingCurrency, startDate, startDate),
        this.fetchExchangeRates(last, reportingCurrency, endDate, endDate),
      ]);
      rates = new Map(boundaryRates.flatMap((map) => [...map]));
    } else {
      rates = await this.fetchExchangeRates(
        selectableSnapshots,
        reportingCurrency,
        startDate,
        endDate,
      );
    }
    const select = createSnapshotCursor(snapshots);
    const build = (account: Account, date: string) =>
      this.buildAccountBalanceResult(
        account,
        select(account.id, date),
        date,
        latestSync.get(account.id),
        reportingCurrency,
        rates.get(date),
      );
    function* iterate(): Generator<BalanceQueryPerDateResult> {
      let date = startDate;
      while (date <= endDate) {
        const balances: Record<string, AccountBalanceResult> = {};
        for (const account of accounts) {
          balances[account.id] = build(account, date);
        }
        yield { date, balances };
        if (date === endDate) break;
        date = boundaryOnly
          ? endDate
          : dayjs(date).add(1, 'day').format('YYYY-MM-DD');
      }
    }
    return { reportingCurrency, balances: iterate() };
  }

  private async getLatestSyncedAtByAccount(
    accountIds: string[],
    userId: string,
  ): Promise<Map<string, Date>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const snapshots = await this.snapshotRepository
      .createQueryBuilder('snapshot')
      .distinctOn(['snapshot.accountId'])
      .where('snapshot.accountId IN (:...accountIds)', { accountIds })
      .andWhere('snapshot.userId = :userId', { userId })
      .andWhere('snapshot.snapshotType != :forwardFillSnapshotType', {
        forwardFillSnapshotType: BalanceSnapshotType.FORWARD_FILL,
      })
      .orderBy('snapshot.accountId')
      .addOrderBy('snapshot.updatedAt', 'DESC')
      .getMany();

    const latestSyncedAtByAccount = new Map<string, Date>();
    snapshots.forEach((snapshot) => {
      if (!latestSyncedAtByAccount.has(snapshot.accountId)) {
        latestSyncedAtByAccount.set(snapshot.accountId, snapshot.updatedAt);
      }
    });

    return latestSyncedAtByAccount;
  }

  /**
   * Build the AccountBalanceResult for a single account on a single date.
   */
  private buildAccountBalanceResult(
    account: Account,
    snapshot: BalanceSnapshotEntity | undefined,
    targetDate: string,
    latestSyncedAt: Date | undefined,
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
    const effectiveBalance = this.calculateEffectiveBalance(currentBalance);

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
        targetDate,
      ),
      currentBalance: this.buildBalanceWithConversion(
        currentBalance,
        targetCurrency,
        dateRates,
        targetDate,
      ),
      effectiveBalance: this.buildBalanceWithConversion(
        effectiveBalance,
        targetCurrency,
        dateRates,
        targetDate,
      ),
      syncedAt,
      latestSyncedAt,
    };
  }

  /**
   * Calculate effective balance based on account type.
   * - Investment/brokerage accounts: currentBalance
   * - All other types: currentBalance
   */
  private calculateEffectiveBalance(
    currentBalance: SerializedMoneyWithSign,
  ): SerializedMoneyWithSign {
    return calculateSharedEffectiveBalance(currentBalance);
  }

  /**
   * Build a BalanceWithConvertedBalance, applying currency conversion if needed.
   */
  private buildBalanceWithConversion(
    balance: SerializedMoneyWithSign,
    targetCurrency: string | undefined,
    dateRates: Map<string, RateWithSource> | undefined,
    targetDate: string,
  ): BalanceWithConvertedBalance {
    return buildBalanceWithConversion(
      balance,
      targetCurrency,
      dateRates,
      targetDate,
    );
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
