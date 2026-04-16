import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { AccountSubtype, AccountType } from 'plaid';
import { Between, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BalanceSnapshotService } from '../balance-snapshot/balance-snapshot.service';
import { BalanceColumns } from '../common/balance.columns';
import { CurrencyExchangeService } from '../currency-exchange/currency-exchange.service';
import {
  MoneySign,
  type SerializedMoneyWithSign,
  getDecimalPlaces,
} from '../types/MoneyWithSign';
import type {
  ManualInvestmentSnapshot,
  ReplaceManualInvestmentSnapshotDto,
} from '../types/ManualInvestment';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { UserService } from '../user/user.service';
import { ManualInvestmentHoldingEntity } from './manual-investment-holding.entity';
import { ManualInvestmentSnapshotEntity } from './manual-investment-snapshot.entity';
import { SecurityPriceDailyEntity } from './security-price-daily.entity';
import { SecurityInstrumentEntity } from './security-instrument.entity';
import { StooqSecurityPriceProvider } from './providers/stooq-security-price.provider';

dayjs.extend(utc);
dayjs.extend(timezone);

const HOLDINGS_MODE = 'holdings';
const SUPPORTED_INVESTMENT_SUBTYPES = new Set<string | null>([
  AccountSubtype.Brokerage,
  AccountSubtype._401k,
  AccountSubtype.Hsa,
  AccountSubtype.Ira,
  AccountSubtype.Roth,
  AccountSubtype['529'],
  AccountSubtype['529a'],
  AccountSubtype['non-taxable brokerage account'],
  null,
]);

@Injectable()
export class ManualInvestmentService {
  private readonly logger = new Logger(ManualInvestmentService.name);

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(ManualInvestmentSnapshotEntity)
    private readonly snapshotRepository: Repository<ManualInvestmentSnapshotEntity>,
    @InjectRepository(ManualInvestmentHoldingEntity)
    private readonly holdingRepository: Repository<ManualInvestmentHoldingEntity>,
    @InjectRepository(SecurityInstrumentEntity)
    private readonly instrumentRepository: Repository<SecurityInstrumentEntity>,
    @InjectRepository(SecurityPriceDailyEntity)
    private readonly priceRepository: Repository<SecurityPriceDailyEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private readonly balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
    private readonly balanceSnapshotService: BalanceSnapshotService,
    private readonly currencyExchangeService: CurrencyExchangeService,
    private readonly userService: UserService,
    private readonly priceProvider: StooqSecurityPriceProvider,
  ) {}

  async listSnapshots(
    accountId: string,
    userId: string,
  ): Promise<ManualInvestmentSnapshot[]> {
    await this.getValidatedHoldingsAccount(accountId, userId);

    const snapshots = await this.snapshotRepository.find({
      where: { accountId, userId },
      relations: ['holdings'],
      order: { snapshotDate: 'DESC' },
    });

    return snapshots.map((snapshot) => snapshot.toObject());
  }

  async getSnapshot(
    accountId: string,
    userId: string,
    snapshotDate: string,
  ): Promise<ManualInvestmentSnapshot> {
    await this.getValidatedHoldingsAccount(accountId, userId);

    const snapshot = await this.snapshotRepository.findOne({
      where: { accountId, userId, snapshotDate },
      relations: ['holdings'],
    });

    if (!snapshot) {
      throw new NotFoundException(
        `Manual investment snapshot ${snapshotDate} not found`,
      );
    }

    return snapshot.toObject();
  }

  async replaceSnapshot(
    accountId: string,
    userId: string,
    snapshotDate: string,
    dto: ReplaceManualInvestmentSnapshotDto,
  ): Promise<ManualInvestmentSnapshot> {
    const account = await this.getValidatedHoldingsAccount(accountId, userId);
    await this.validateSnapshotDate(snapshotDate, userId);
    this.validateHoldings(dto);

    let snapshot = await this.snapshotRepository.findOne({
      where: { accountId, userId, snapshotDate },
      relations: ['holdings'],
    });

    if (!snapshot) {
      snapshot = ManualInvestmentSnapshotEntity.fromDto(
        {
          accountId,
          snapshotDate,
          cashBalance: dto.cashBalance,
          holdings: dto.holdings,
        },
        userId,
      );
      snapshot = await this.snapshotRepository.save(snapshot);
    } else {
      snapshot.cashBalance = BalanceColumns.fromMoneyWithSign(dto.cashBalance);
      snapshot = await this.snapshotRepository.save(snapshot);
      await this.holdingRepository.delete({ snapshotId: snapshot.id });
    }

    const holdings = await Promise.all(
      dto.holdings.map(async (holding) => {
        const instrument = await this.resolveInstrument(
          holding.symbol,
          holding.displayName ?? null,
        );
        const entity = new ManualInvestmentHoldingEntity();
        entity.snapshotId = snapshot.id;
        entity.instrumentId = instrument.id;
        entity.symbol = instrument.symbol;
        entity.displayName = holding.displayName ?? instrument.displayName;
        entity.quantity = holding.quantity;
        return entity;
      }),
    );

    if (holdings.length > 0) {
      await this.holdingRepository.save(holdings);
    }

    account.lastUserSnapshotAt = new Date();
    await this.accountRepository.save(account);

    await this.rebuildDerivedBalancesForAccount(account, snapshotDate);

    return this.getSnapshot(accountId, userId, snapshotDate);
  }

  async deleteSnapshot(
    accountId: string,
    userId: string,
    snapshotDate: string,
  ): Promise<void> {
    const account = await this.getValidatedHoldingsAccount(accountId, userId);

    const snapshot = await this.snapshotRepository.findOne({
      where: { accountId, userId, snapshotDate },
    });

    if (!snapshot) {
      throw new NotFoundException(
        `Manual investment snapshot ${snapshotDate} not found`,
      );
    }

    await this.snapshotRepository.remove(snapshot);

    account.lastUserSnapshotAt = new Date();
    await this.accountRepository.save(account);

    await this.rebuildDerivedBalancesForAccount(account, snapshotDate);
  }

  @Cron('0 30 23 * * *', {
    name: 'refreshManualInvestmentBalances',
    timeZone: 'UTC',
  })
  async refreshDailyDerivedBalances(): Promise<void> {
    const accounts = await this.accountRepository.find({
      where: { manualValuationMode: HOLDINGS_MODE, bankLinkId: IsNull() },
    });

    for (const account of accounts) {
      const timezoneName = await this.userService.getTimezone(account.userId);
      const today = dayjs().tz(timezoneName).format('YYYY-MM-DD');

      try {
        await this.rebuildDerivedBalancesForAccount(account, today, today);
      } catch (error) {
        this.logger.error(
          {
            accountId: account.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to refresh manual investment balance',
        );
      }
    }
  }

  private async rebuildDerivedBalancesForAccount(
    account: AccountEntity,
    startDate: string,
    explicitEndDate?: string,
  ): Promise<void> {
    const endDate =
      explicitEndDate ?? (await this.getUserToday(account.userId));
    const snapshots = await this.snapshotRepository.find({
      where: {
        accountId: account.id,
        userId: account.userId,
        snapshotDate: LessThanOrEqual(endDate),
      },
      relations: ['holdings'],
      order: { snapshotDate: 'ASC' },
    });

    await this.balanceSnapshotRepository.delete({
      accountId: account.id,
      userId: account.userId,
      snapshotDate: Between(startDate, endDate),
      snapshotType: BalanceSnapshotType.HOLDINGS_DERIVED,
    });

    if (snapshots.length === 0) {
      account.currentBalance = BalanceColumns.fromMoneyWithSign(
        this.createZeroBalance(account.currentBalance.currency),
      );
      account.availableBalance = BalanceColumns.fromMoneyWithSign(
        this.createZeroBalance(account.currentBalance.currency),
      );
      account.lastValuationAt = null;
      await this.accountRepository.save(account);
      return;
    }

    const instruments = await this.loadInstruments(snapshots);
    await this.ensurePriceHistory(instruments, startDate, endDate);
    const pricesByInstrument = await this.loadPriceHistory(
      Array.from(instruments.keys()),
      startDate,
      endDate,
    );

    let currentDate = dayjs(startDate);
    const finalDate = dayjs(endDate);
    let latestDerivedBalance: SerializedMoneyWithSign | null = null;

    while (currentDate.diff(finalDate, 'day') <= 0) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const activeSnapshot = this.findActiveSnapshot(snapshots, dateStr);

      if (activeSnapshot) {
        const balance = await this.valueSnapshotForDate(
          activeSnapshot,
          account.currentBalance.currency,
          pricesByInstrument,
          dateStr,
        );

        await this.balanceSnapshotService.upsert(
          {
            accountId: account.id,
            currentBalance: balance,
            availableBalance: this.createZeroBalance(
              account.currentBalance.currency,
            ),
            snapshotType: BalanceSnapshotType.HOLDINGS_DERIVED,
            snapshotDate: dateStr,
          },
          account.userId,
        );
        latestDerivedBalance = balance;
      }

      currentDate = currentDate.add(1, 'day');
    }

    account.currentBalance = BalanceColumns.fromMoneyWithSign(
      latestDerivedBalance ??
        this.createZeroBalance(account.currentBalance.currency),
    );
    account.availableBalance = BalanceColumns.fromMoneyWithSign(
      this.createZeroBalance(account.currentBalance.currency),
    );
    account.lastValuationAt = new Date();
    await this.accountRepository.save(account);
  }

  private async loadInstruments(
    snapshots: ManualInvestmentSnapshotEntity[],
  ): Promise<Map<string, SecurityInstrumentEntity>> {
    const instrumentIds = [
      ...new Set(
        snapshots.flatMap((snapshot) =>
          snapshot.holdings.map((holding) => holding.instrumentId),
        ),
      ),
    ];

    if (instrumentIds.length === 0) {
      return new Map();
    }

    const instruments =
      await this.instrumentRepository.findByIds(instrumentIds);
    return new Map(
      instruments.map((instrument) => [instrument.id, instrument]),
    );
  }

  private async ensurePriceHistory(
    instruments: Map<string, SecurityInstrumentEntity>,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    for (const instrument of instruments.values()) {
      const history = await this.priceProvider.getHistoricalPrices(
        instrument.providerSymbol,
        startDate,
        endDate,
      );

      for (const point of history) {
        const existing = await this.priceRepository.findOne({
          where: { instrumentId: instrument.id, priceDate: point.date },
        });

        if (existing) {
          existing.closePrice = point.closePrice;
          existing.priceCurrency = point.priceCurrency;
          await this.priceRepository.save(existing);
          continue;
        }

        const entity = new SecurityPriceDailyEntity();
        entity.instrumentId = instrument.id;
        entity.priceDate = point.date;
        entity.closePrice = point.closePrice;
        entity.priceCurrency = point.priceCurrency;
        await this.priceRepository.save(entity);
      }
    }
  }

  private async loadPriceHistory(
    instrumentIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<Map<string, SecurityPriceDailyEntity[]>> {
    if (instrumentIds.length === 0) {
      return new Map();
    }

    const lookbackStart = dayjs(startDate)
      .subtract(10, 'day')
      .format('YYYY-MM-DD');
    const prices = await this.priceRepository
      .createQueryBuilder('price')
      .where('price.instrumentId IN (:...instrumentIds)', { instrumentIds })
      .andWhere('price.priceDate >= :startDate', { startDate: lookbackStart })
      .andWhere('price.priceDate <= :endDate', { endDate })
      .orderBy('price.priceDate', 'ASC')
      .getMany();

    const pricesByInstrument = new Map<string, SecurityPriceDailyEntity[]>();
    prices.forEach((price) => {
      const existing = pricesByInstrument.get(price.instrumentId) ?? [];
      existing.push(price);
      pricesByInstrument.set(price.instrumentId, existing);
    });

    return pricesByInstrument;
  }

  private async valueSnapshotForDate(
    snapshot: ManualInvestmentSnapshotEntity,
    accountCurrency: string,
    pricesByInstrument: Map<string, SecurityPriceDailyEntity[]>,
    valuationDate: string,
  ): Promise<SerializedMoneyWithSign> {
    let total = this.toSignedMajor(snapshot.cashBalance.toMoneyWithSign());

    for (const holding of snapshot.holdings) {
      const priceRows = pricesByInstrument.get(holding.instrumentId) ?? [];
      const price = this.findPriceOnOrBefore(priceRows, valuationDate);
      if (!price) {
        throw new BadRequestException(
          `Missing price for ${holding.symbol} on or before ${valuationDate}`,
        );
      }

      let convertedPrice = price.closePrice;
      if (price.priceCurrency !== accountCurrency) {
        const fxRate = await this.currencyExchangeService.getRate(
          price.priceCurrency,
          accountCurrency,
          valuationDate,
        );
        convertedPrice = convertedPrice * fxRate;
      }

      total += holding.quantity * convertedPrice;
    }

    return this.toSerializedMoney(total, accountCurrency);
  }

  private findPriceOnOrBefore(
    prices: SecurityPriceDailyEntity[],
    targetDate: string,
  ): SecurityPriceDailyEntity | undefined {
    let match: SecurityPriceDailyEntity | undefined;
    prices.forEach((price) => {
      if (price.priceDate <= targetDate) {
        match = price;
      }
    });
    return match;
  }

  private findActiveSnapshot(
    snapshots: ManualInvestmentSnapshotEntity[],
    date: string,
  ): ManualInvestmentSnapshotEntity | undefined {
    let activeSnapshot: ManualInvestmentSnapshotEntity | undefined;
    snapshots.forEach((snapshot) => {
      if (snapshot.snapshotDate <= date) {
        activeSnapshot = snapshot;
      }
    });
    return activeSnapshot;
  }

  private async getValidatedHoldingsAccount(
    accountId: string,
    userId: string,
  ): Promise<AccountEntity> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, userId },
    });

    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }

    if (account.bankLinkId) {
      throw new BadRequestException(
        'Manual investment snapshots require a manual account',
      );
    }

    if (account.manualValuationMode !== HOLDINGS_MODE) {
      throw new BadRequestException(
        'Account is not configured for holdings mode',
      );
    }

    if (
      ![String(AccountType.Investment), String(AccountType.Brokerage)].includes(
        account.type,
      ) ||
      !SUPPORTED_INVESTMENT_SUBTYPES.has(account.subType)
    ) {
      throw new BadRequestException(
        'Holdings mode is only supported for manual investment accounts',
      );
    }

    return account;
  }

  private async validateSnapshotDate(
    snapshotDate: string,
    userId: string,
  ): Promise<void> {
    const timezoneName = await this.userService.getTimezone(userId);
    const today = dayjs().tz(timezoneName).format('YYYY-MM-DD');
    if (snapshotDate > today) {
      throw new BadRequestException(
        'Future-dated holdings snapshots are not supported',
      );
    }
  }

  private validateHoldings(dto: ReplaceManualInvestmentSnapshotDto): void {
    const symbols = dto.holdings.map((holding) =>
      holding.symbol.trim().toUpperCase(),
    );
    const duplicates = symbols.filter(
      (symbol, index) => symbols.indexOf(symbol) !== index,
    );
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Duplicate holdings are not allowed: ${[...new Set(duplicates)].join(', ')}`,
      );
    }
  }

  private async resolveInstrument(
    symbol: string,
    displayName: string | null,
  ): Promise<SecurityInstrumentEntity> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const providerSymbol = `${normalizedSymbol.toLowerCase()}.us`;

    const existing = await this.instrumentRepository.findOne({
      where: {
        providerName: this.priceProvider.providerName,
        providerSymbol,
      },
    });

    if (existing) {
      if (!existing.displayName && displayName) {
        existing.displayName = displayName;
        return this.instrumentRepository.save(existing);
      }
      return existing;
    }

    const instrument = new SecurityInstrumentEntity();
    instrument.symbol = normalizedSymbol;
    instrument.providerName = this.priceProvider.providerName;
    instrument.providerSymbol = providerSymbol;
    instrument.exchange = 'US';
    instrument.priceCurrency = 'USD';
    instrument.displayName = displayName;
    return this.instrumentRepository.save(instrument);
  }

  private toSignedMajor(balance: SerializedMoneyWithSign): number {
    const signMultiplier = balance.sign === MoneySign.NEGATIVE ? -1 : 1;
    return (
      (signMultiplier * balance.money.amount) /
      Math.pow(10, getDecimalPlaces(balance.money.currency))
    );
  }

  private toSerializedMoney(
    totalMajor: number,
    currency: string,
  ): SerializedMoneyWithSign {
    const multiplier = Math.pow(10, getDecimalPlaces(currency));
    const amount = Math.round(Math.abs(totalMajor) * multiplier);
    return {
      money: { amount, currency },
      sign: totalMajor < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
    };
  }

  private createZeroBalance(currency: string): SerializedMoneyWithSign {
    return {
      money: { amount: 0, currency },
      sign: MoneySign.POSITIVE,
    };
  }

  private async getUserToday(userId: string): Promise<string> {
    const timezoneName = await this.userService.getTimezone(userId);
    return dayjs().tz(timezoneName).format('YYYY-MM-DD');
  }
}
