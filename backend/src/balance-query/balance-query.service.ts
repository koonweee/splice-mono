import { assertDateRange } from '../common/query-bounds';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { Between, In, Repository, type EntityManager } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { calculateEffectiveBalance as calculateSharedEffectiveBalance } from '../common/effective-balance';
import { CurrencyExchangeService } from '../currency-exchange/currency-exchange.service';
import type { Account } from '../types/Account';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
  RateWithSource,
} from '../types/BalanceQuery';
import type { CurrencyPair } from '../types/ExchangeRate';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { UserService } from '../user/user.service';
import {
  createBalanceConverter,
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
    const projection = await this.loadBalanceProjection(
      userId,
      startDate,
      endDate,
      { accountIds, includeLatestSync: true },
    );
    return [...projection.balances];
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
    const projection = await this.loadBalanceProjection(
      userId,
      startDate,
      endDate,
      { includeLatestSync: true },
    );
    return [...projection.balances];
  }

  /**
   * Fetch exchange rates for the date range, building a lookup map.
   */
  private async fetchExchangeRates(
    snapshots: BalanceSnapshotEntity[],
    targetCurrency: string,
    startDate: string,
    endDate: string,
    manager: EntityManager,
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
      if (snapshot.availableBalance.amount !== '0') {
        addCurrencyPair(snapshot.availableBalance.currency);
      }
      if (snapshot.currentBalance.amount !== '0') {
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
          manager,
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
    manager: EntityManager,
  ): Promise<BalanceSnapshotEntity[]> {
    const [inRange, prior] = await Promise.all([
      manager.withRepository(this.snapshotRepository).find({
        where: {
          accountId: In(accountIds),
          userId,
          snapshotDate: Between(startDate, endDate),
        },
        order: { snapshotDate: 'ASC' },
      }),
      manager
        .withRepository(this.snapshotRepository)
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
    manager: EntityManager,
  ) {
    return manager
      .withRepository(this.snapshotRepository)
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
  loadDashboardProjection(
    userId: string,
    startDate: string,
    endDate: string,
    boundaryOnly: boolean,
  ) {
    return this.loadBalanceProjection(userId, startDate, endDate, {
      boundaryOnly,
      includeLatestSync: boundaryOnly,
    });
  }

  async loadBalanceProjection(
    userId: string,
    startDate: string,
    endDate: string,
    options: {
      accountIds?: string[];
      boundaryOnly?: boolean;
      includeLatestSync?: boolean;
    } = {},
  ) {
    assertDateRange(startDate, endDate, { maxDays: 10_000 });
    const boundaryOnly = options.boundaryOnly ?? false;
    const { reportingCurrency, accounts, snapshots, latestSync, rates } =
      await this.accountRepository.manager.transaction(
        'REPEATABLE READ',
        async (manager) => {
          const [user, entities] = await Promise.all([
            this.userService.findSettings(userId, manager),
            manager.withRepository(this.accountRepository).find({
              where: {
                userId,
                ...(options.accountIds
                  ? { id: In([...new Set(options.accountIds)]) }
                  : {}),
              },
              select: {
                id: true,
                userId: true,
                name: true,
                customName: true,
                notes: true,
                mask: true,
                type: true,
                subType: true,
                valuationMode: true,
                externalAccountId: true,
                bankLinkId: true,
                availableBalance: { amount: true, currency: true, sign: true },
                currentBalance: { amount: true, currency: true, sign: true },
                archivedAt: true,
                createdAt: true,
                updatedAt: true,
                bankLink: {
                  id: true,
                  userId: true,
                  providerName: true,
                  accountIds: true,
                  institutionId: true,
                  institutionName: true,
                  status: true,
                  statusDate: true,
                  statusBody: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
              relations: ['bankLink'],
            }),
          ]);
          if (!user) throw new UnauthorizedException();
          const reportingCurrency = user.settings.currency ?? 'USD';
          assertDateRange(startDate, endDate, {
            maxDays: 10_000,
            maxAccountDays: 1_000_000,
            accountCount: entities.length,
          });
          const accounts = entities.map((entity) => entity.toObject());
          const accountIds = accounts.map((account) => account.id);
          if (accountIds.length === 0) {
            return {
              reportingCurrency,
              accounts,
              snapshots: [] as BalanceSnapshotEntity[],
              latestSync: new Map<string, Date>(),
              rates: new Map<string, Map<string, RateWithSource>>(),
            };
          }
          const [snapshots, latestSync] = await Promise.all([
            boundaryOnly
              ? Promise.all([
                  this.loadBoundarySnapshots(
                    accountIds,
                    userId,
                    startDate,
                    manager,
                  ),
                  this.loadBoundarySnapshots(
                    accountIds,
                    userId,
                    endDate,
                    manager,
                  ),
                ]).then((groups) => groups.flat())
              : this.loadRangeSnapshots(
                  accountIds,
                  userId,
                  startDate,
                  endDate,
                  manager,
                ),
            options.includeLatestSync
              ? this.getLatestSyncedAtByAccount(accountIds, userId, manager)
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
                .filter(
                  (snapshot): snapshot is BalanceSnapshotEntity => !!snapshot,
                );
            const first = selectedAt(startDate);
            const last = selectedAt(endDate);
            const boundaryRates = await Promise.all([
              this.fetchExchangeRates(
                first,
                reportingCurrency,
                startDate,
                startDate,
                manager,
              ),
              this.fetchExchangeRates(
                last,
                reportingCurrency,
                endDate,
                endDate,
                manager,
              ),
            ]);
            rates = new Map(boundaryRates.flatMap((map) => [...map]));
          } else {
            rates = await this.fetchExchangeRates(
              selectableSnapshots,
              reportingCurrency,
              startDate,
              endDate,
              manager,
            );
          }
          return { reportingCurrency, accounts, snapshots, latestSync, rates };
        },
      );
    // Release the database snapshot before expanding daily balances or serializing results.
    if (accounts.length === 0)
      return {
        reportingCurrency,
        balances: [] as Iterable<BalanceQueryPerDateResult>,
      };
    const select = createSnapshotCursor(snapshots);
    const convert = createBalanceConverter(reportingCurrency);
    // Keep only the active snapshot's native balances per account, not a daily matrix.
    const nativeBalances = new Map<
      string,
      {
        snapshot: BalanceSnapshotEntity | undefined;
        available: SerializedMoneyWithSign;
        current: SerializedMoneyWithSign;
      }
    >();
    const build = (account: Account, date: string) => {
      const snapshot = select(account.id, date);
      let native = nativeBalances.get(account.id);
      if (!native || native.snapshot !== snapshot) {
        native = {
          snapshot,
          available: snapshot
            ? snapshot.availableBalance.toMoneyWithSign()
            : this.createZeroBalance(account.availableBalance.money.currency),
          current: snapshot
            ? snapshot.currentBalance.toMoneyWithSign()
            : this.createZeroBalance(account.currentBalance.money.currency),
        };
        nativeBalances.set(account.id, native);
      }
      return this.buildAccountBalanceResult(
        account,
        snapshot,
        date,
        latestSync.get(account.id),
        native.available,
        native.current,
        convert,
        rates.get(date),
      );
    };
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
    manager: EntityManager,
  ): Promise<Map<string, Date>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const snapshots = await manager
      .withRepository(this.snapshotRepository)
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
    availableBalance: SerializedMoneyWithSign,
    currentBalance: SerializedMoneyWithSign,
    convert: ReturnType<typeof createBalanceConverter>,
    dateRates: Map<string, RateWithSource> | undefined,
  ): AccountBalanceResult {
    // Calculate effective balance based on account type
    const effectiveBalance = this.calculateEffectiveBalance(currentBalance);

    // Determine syncedAt (undefined if forward-filled or no snapshot)
    const isForwardFilled = snapshot && snapshot.snapshotDate !== targetDate;
    const syncedAt =
      snapshot && !isForwardFilled ? snapshot.updatedAt : undefined;

    // Build result with optional conversion
    return {
      account,
      availableBalance: convert(availableBalance, dateRates, targetDate),
      currentBalance: convert(currentBalance, dateRates, targetDate),
      effectiveBalance: convert(effectiveBalance, dateRates, targetDate),
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
   * Create a zero balance with the given currency.
   */
  private createZeroBalance(currency: string): SerializedMoneyWithSign {
    return {
      money: { amount: '0', currency },
      sign: MoneySign.POSITIVE,
    };
  }
}
