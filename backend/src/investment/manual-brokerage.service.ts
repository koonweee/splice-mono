import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import Decimal from 'decimal.js';
import { AccountSubtype, AccountType } from 'plaid';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Not,
  Repository,
} from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BalanceColumns } from '../common/balance.columns';
import { CurrencyExchangeService } from '../currency-exchange/currency-exchange.service';
import { isCryptoCurrency } from '../currency-exchange/utils/currency-pair.utils';
import { MarketPriceService } from '../market-price/market-price.service';
import type {
  CreateManualBrokerageAccountDto,
  ManualBrokeragePortfolioResponse,
  ManualBrokeragePositionInput,
  ReplaceManualBrokerageHoldingsDto,
} from '../types/Investment';
import { ManualBrokeragePositionInputSchema } from '../types/Investment';
import type { MarketPriceQuote } from '../types/MarketPrice';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import { UserService } from '../user/user.service';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from './investment-security.entity';
import { InvestmentService } from './investment.service';

dayjs.extend(utc);
dayjs.extend(timezone);

type ValuedPosition = {
  input: ManualBrokeragePositionInput;
  quote: MarketPriceQuote;
  nativeValue: string;
  exchangeRate: string;
  accountValue: string;
};

type Valuation = {
  positions: ValuedPosition[];
  totalMinorUnits: number;
};

@Injectable()
export class ManualBrokerageService {
  private readonly logger = new Logger(ManualBrokerageService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(InvestmentHoldingSnapshotEntity)
    private readonly holdingRepository: Repository<InvestmentHoldingSnapshotEntity>,
    private readonly marketPriceService: MarketPriceService,
    private readonly currencyExchangeService: CurrencyExchangeService,
    private readonly userService: UserService,
    private readonly investmentService: InvestmentService,
  ) {}

  async createManualBrokerageAccount(
    dto: CreateManualBrokerageAccountDto,
    userId: string,
  ): Promise<ManualBrokeragePortfolioResponse> {
    if (dto.positions.length === 0) {
      throw new BadRequestException(
        'A manual brokerage must be created with at least one position',
      );
    }
    const positions = this.normalizePositions(dto.positions);
    const accountCurrency = this.validateCurrency(dto.accountCurrency);
    const snapshotDate = await this.getSnapshotDate(userId);
    const resolved = await this.marketPriceService.resolveQuotes(
      userId,
      positions.map(({ symbol }) => symbol),
    );
    this.rejectMissingQuotes(resolved.missingSymbols);
    const valuation = await this.valuePositions(
      positions,
      resolved.quotes,
      accountCurrency,
      snapshotDate,
      userId,
    );

    const account = await this.dataSource.transaction(async (manager) => {
      const accountRepository = manager.getRepository(AccountEntity);
      const entity = new AccountEntity();
      entity.userId = userId;
      entity.name = dto.name;
      entity.customName = dto.customName ?? null;
      entity.notes = dto.notes ?? null;
      entity.mask = null;
      entity.type = String(AccountType.Investment);
      entity.subType = String(AccountSubtype.Brokerage);
      entity.valuationMode = 'holdings';
      entity.externalAccountId = null;
      entity.rawApiAccount = null;
      entity.archivedAt = null;
      entity.bankLinkId = null;
      entity.bankLink = null;
      this.applyAccountBalance(
        entity,
        accountCurrency,
        valuation.totalMinorUnits,
      );
      const saved = await accountRepository.save(entity);
      await this.persistValuation(
        manager,
        saved,
        snapshotDate,
        valuation,
        BalanceSnapshotType.USER_UPDATE,
      );
      return saved.toObject();
    });

    return {
      account,
      snapshot: await this.investmentService.findLatestHoldingsForAccount(
        userId,
        account.id,
      ),
      staleSymbols: resolved.staleSymbols,
    };
  }

  async replaceManualBrokerageHoldings(
    accountId: string,
    dto: ReplaceManualBrokerageHoldingsDto,
    userId: string,
  ): Promise<ManualBrokeragePortfolioResponse> {
    const account = await this.requireManualBrokerage(accountId, userId);
    const positions = this.normalizePositions(dto.positions);
    const accountCurrency = account.currentBalance.currency;
    const snapshotDate = await this.getSnapshotDate(userId);
    const resolved = await this.marketPriceService.resolveQuotes(
      userId,
      positions.map(({ symbol }) => symbol),
    );
    this.rejectMissingQuotes(resolved.missingSymbols);
    const valuation = await this.valuePositions(
      positions,
      resolved.quotes,
      accountCurrency,
      snapshotDate,
      userId,
    );
    const saved = await this.writeExistingAccountValuation(
      accountId,
      userId,
      snapshotDate,
      valuation,
      BalanceSnapshotType.USER_UPDATE,
    );
    return {
      account: saved,
      snapshot: await this.investmentService.findLatestHoldingsForAccount(
        userId,
        accountId,
      ),
      staleSymbols: resolved.staleSymbols,
    };
  }

  async refreshManualBrokeragePrices(
    accountId: string,
    userId: string,
  ): Promise<ManualBrokeragePortfolioResponse> {
    const account = await this.requireManualBrokerage(accountId, userId);
    const latest = await this.investmentService.findLatestHoldingsForAccount(
      userId,
      accountId,
    );
    const positions = latest.holdings.map((holding) => ({
      symbol: holding.security.externalSecurityId,
      quantity: holding.quantity ?? '0',
    }));
    const snapshotDate = await this.getSnapshotDate(userId);
    const resolved = await this.marketPriceService.resolveQuotes(
      userId,
      positions.map(({ symbol }) => symbol),
    );
    this.rejectMissingQuotes(resolved.missingSymbols);
    const valuation = await this.valuePositions(
      positions,
      resolved.quotes,
      account.currentBalance.currency,
      snapshotDate,
      userId,
    );
    const saved = await this.writeExistingAccountValuation(
      accountId,
      userId,
      snapshotDate,
      valuation,
      BalanceSnapshotType.MARKET_REFRESH,
      this.positionsSignature(positions),
    );
    return {
      account: saved,
      snapshot: await this.investmentService.findLatestHoldingsForAccount(
        userId,
        accountId,
      ),
      staleSymbols: resolved.staleSymbols,
    };
  }

  async refreshAllManualBrokerages(): Promise<{
    refreshed: number;
    skipped: number;
  }> {
    const accounts = await this.accountRepository.find({
      where: {
        valuationMode: 'holdings',
        type: String(AccountType.Investment),
        subType: String(AccountSubtype.Brokerage),
        archivedAt: IsNull(),
        bankLinkId: IsNull(),
      },
    });
    const positionResults = await Promise.allSettled(
      accounts.map(async (account) => {
        const latest =
          await this.investmentService.findLatestHoldingsForAccount(
            account.userId,
            account.id,
          );
        return {
          account,
          positions: latest.holdings.map((holding) => ({
            symbol: holding.security.externalSecurityId,
            quantity: holding.quantity ?? '0',
          })),
        };
      }),
    );
    const accountPositions: Array<{
      account: AccountEntity;
      positions: ManualBrokeragePositionInput[];
    }> = [];
    let skipped = 0;
    positionResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        accountPositions.push(result.value);
        return;
      }
      skipped++;
      const account = accounts[index];
      this.logger.warn(
        {
          accountId: account.id,
          userId: account.userId,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
        'Skipped manual brokerage whose holdings could not be loaded',
      );
    });
    const requests = new Map<string, string[]>();
    for (const { account, positions } of accountPositions) {
      requests.set(account.userId, [
        ...(requests.get(account.userId) ?? []),
        ...positions.map(({ symbol }) => symbol),
      ]);
    }
    const resolvedByUser =
      await this.marketPriceService.resolveQuotesForUsers(requests);
    let refreshed = 0;
    for (const { account, positions } of accountPositions) {
      try {
        const resolved = resolvedByUser.get(account.userId);
        if (!resolved)
          throw new BadRequestException('Quotes were not resolved');
        const missing = positions
          .map(({ symbol }) => symbol)
          .filter((symbol) => resolved.missingSymbols.includes(symbol));
        this.rejectMissingQuotes(missing);
        const snapshotDate = await this.getSnapshotDate(account.userId);
        const valuation = await this.valuePositions(
          positions,
          resolved.quotes,
          account.currentBalance.currency,
          snapshotDate,
          account.userId,
        );
        await this.writeExistingAccountValuation(
          account.id,
          account.userId,
          snapshotDate,
          valuation,
          BalanceSnapshotType.MARKET_REFRESH,
          this.positionsSignature(positions),
        );
        refreshed++;
      } catch (error) {
        skipped++;
        this.logger.warn(
          {
            accountId: account.id,
            userId: account.userId,
            error: error instanceof Error ? error.message : String(error),
          },
          'Skipped manual brokerage during scheduled refresh',
        );
      }
    }
    return { refreshed, skipped };
  }

  private normalizePositions(
    positions: ManualBrokeragePositionInput[],
  ): ManualBrokeragePositionInput[] {
    const normalized = positions.map((position) => {
      const parsed = ManualBrokeragePositionInputSchema.safeParse(position);
      if (!parsed.success) {
        throw new BadRequestException(parsed.error.issues[0]?.message);
      }
      return {
        symbol: parsed.data.symbol.trim().toUpperCase(),
        quantity: new Decimal(parsed.data.quantity).toString(),
      };
    });
    const unique = new Set(normalized.map(({ symbol }) => symbol));
    if (unique.size !== normalized.length) {
      throw new BadRequestException(
        'Each security symbol may appear only once',
      );
    }
    return normalized;
  }

  private validateCurrency(currency: string): string {
    const normalized = currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized) || isCryptoCurrency(normalized)) {
      throw new BadRequestException('Account currency must be a fiat ISO code');
    }
    return normalized;
  }

  private rejectMissingQuotes(symbols: string[]): void {
    if (symbols.length > 0) {
      throw new BadRequestException(
        `No usable stock or ETF quote is available for: ${symbols.join(', ')}`,
      );
    }
  }

  private async valuePositions(
    positions: ManualBrokeragePositionInput[],
    quotes: Map<string, MarketPriceQuote>,
    accountCurrency: string,
    snapshotDate: string,
    userId: string,
  ): Promise<Valuation> {
    const currencies = new Set<string>();
    for (const { symbol } of positions) {
      const currency = quotes.get(symbol)?.currency;
      if (currency) currencies.add(currency);
    }
    const rates = new Map<string, string>();
    for (const currency of currencies) {
      const rate =
        currency === accountCurrency
          ? 1
          : await this.currencyExchangeService.getRate(
              currency,
              accountCurrency,
              snapshotDate,
            );
      rates.set(currency, String(rate));
    }
    const preferredCurrency =
      await this.userService.getPreferredCurrency(userId);
    if (accountCurrency !== preferredCurrency) {
      await this.currencyExchangeService.getRate(
        accountCurrency,
        preferredCurrency,
        snapshotDate,
      );
    }

    const decimals = getDecimalPlaces(accountCurrency);
    const valued = positions.map((input) => {
      const quote = quotes.get(input.symbol);
      if (!quote)
        throw new BadRequestException(`Missing quote for ${input.symbol}`);
      const nativeValue = new Decimal(input.quantity)
        .mul(quote.price)
        .toDecimalPlaces(12, Decimal.ROUND_HALF_UP);
      const exchangeRate = rates.get(quote.currency);
      if (!exchangeRate) {
        throw new BadRequestException(`Missing FX rate for ${quote.currency}`);
      }
      const accountValue = nativeValue
        .mul(exchangeRate)
        .toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
      return {
        input,
        quote,
        nativeValue: nativeValue.toFixed(),
        exchangeRate,
        accountValue: accountValue.toFixed(decimals),
      };
    });
    const total = valued.reduce(
      (sum, position) => sum.add(position.accountValue),
      new Decimal(0),
    );
    const minorUnits = total.mul(new Decimal(10).pow(decimals));
    const minorUnitNumber = minorUnits.toNumber();
    if (!minorUnits.isInteger() || !Number.isSafeInteger(minorUnitNumber)) {
      throw new BadRequestException('Portfolio value exceeds supported range');
    }
    return { positions: valued, totalMinorUnits: minorUnitNumber };
  }

  private async writeExistingAccountValuation(
    accountId: string,
    userId: string,
    snapshotDate: string,
    valuation: Valuation,
    snapshotType: BalanceSnapshotType,
    expectedPositionsSignature?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.getRepository(AccountEntity).findOne({
        where: { id: accountId, userId, archivedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      this.assertManualBrokerage(account, accountId);
      if (expectedPositionsSignature !== undefined) {
        const currentPositions = await this.loadLatestPositions(
          manager,
          accountId,
          userId,
        );
        if (
          this.positionsSignature(currentPositions) !==
          expectedPositionsSignature
        ) {
          throw new ConflictException(
            'Holdings changed while prices were being refreshed; retry the refresh',
          );
        }
      }
      this.applyAccountBalance(
        account,
        account.currentBalance.currency,
        valuation.totalMinorUnits,
      );
      const saved = await manager.getRepository(AccountEntity).save(account);
      await this.persistValuation(
        manager,
        saved,
        snapshotDate,
        valuation,
        snapshotType,
      );
      return saved.toObject();
    });
  }

  private async persistValuation(
    manager: EntityManager,
    account: AccountEntity,
    snapshotDate: string,
    valuation: Valuation,
    snapshotType: BalanceSnapshotType,
  ): Promise<void> {
    const securityRepository = manager.getRepository(InvestmentSecurityEntity);
    const holdingRepository = manager.getRepository(
      InvestmentHoldingSnapshotEntity,
    );
    const symbols = valuation.positions.map(({ input }) => input.symbol);
    const existingSecurities =
      symbols.length === 0
        ? []
        : await securityRepository.find({
            where: {
              userId: account.userId,
              provider: 'yahoo',
              externalSecurityId: In(symbols),
            },
          });
    const bySymbol = new Map(
      existingSecurities.map((security) => [
        security.externalSecurityId,
        security,
      ]),
    );
    const holdings: InvestmentHoldingSnapshotEntity[] = [];
    for (const position of valuation.positions) {
      const { quote } = position;
      const security =
        bySymbol.get(position.input.symbol) ?? new InvestmentSecurityEntity();
      security.userId = account.userId;
      security.provider = 'yahoo';
      security.externalSecurityId = quote.symbol;
      security.institutionId = quote.exchangeCode;
      security.institutionSecurityId = quote.exchangeName;
      security.name = quote.name;
      security.tickerSymbol = quote.symbol;
      security.isin = null;
      security.cusip = null;
      security.sedol = null;
      security.type = quote.quoteType;
      security.subtype = null;
      security.isCashEquivalent = false;
      security.closePrice = quote.price;
      security.closePriceAsOf = quote.priceAsOf;
      security.updateDatetime = quote.priceDatetime;
      security.isoCurrencyCode = quote.currency;
      security.unofficialCurrencyCode = null;
      security.marketIdentifierCode = quote.marketIdentifierCode;
      security.sector = null;
      security.industry = null;
      const savedSecurity = await securityRepository.save(security);

      const holding = new InvestmentHoldingSnapshotEntity();
      holding.userId = account.userId;
      holding.accountId = account.id;
      holding.securityId = savedSecurity.id;
      holding.security = savedSecurity;
      holding.provider = 'manual';
      holding.snapshotDate = snapshotDate;
      holding.quantity = position.input.quantity;
      holding.costBasis = null;
      holding.institutionPrice = quote.price;
      holding.institutionPriceAsOf = quote.priceAsOf;
      holding.institutionPriceDatetime = quote.priceDatetime;
      holding.institutionValue = position.nativeValue;
      holding.isoCurrencyCode = quote.currency;
      holding.unofficialCurrencyCode = null;
      holding.accountCurrency = account.currentBalance.currency;
      holding.exchangeRateToAccountCurrency = position.exchangeRate;
      holding.accountValue = position.accountValue;
      holding.vestedQuantity = null;
      holding.vestedValue = null;
      holdings.push(holding);
    }

    await holdingRepository.delete({
      userId: account.userId,
      accountId: account.id,
      snapshotDate,
      provider: 'manual',
    });
    if (holdings.length > 0) await holdingRepository.save(holdings);

    const snapshotRepository = manager.getRepository(BalanceSnapshotEntity);
    let snapshot = await snapshotRepository.findOne({
      where: { userId: account.userId, accountId: account.id, snapshotDate },
    });
    if (!snapshot) {
      snapshot = BalanceSnapshotEntity.fromDto(
        {
          accountId: account.id,
          snapshotDate,
          snapshotType,
          currentBalance: account.currentBalance.toMoneyWithSign(),
          availableBalance: account.availableBalance.toMoneyWithSign(),
        },
        account.userId,
      );
    } else {
      snapshot.snapshotType = snapshotType;
      snapshot.currentBalance = account.currentBalance;
      snapshot.availableBalance = account.availableBalance;
    }
    await snapshotRepository.save(snapshot);
  }

  private applyAccountBalance(
    account: AccountEntity,
    currency: string,
    amount: number,
  ): void {
    account.currentBalance = BalanceColumns.fromMoneyWithSign({
      money: { amount, currency },
      sign: MoneySign.POSITIVE,
    });
    account.availableBalance = BalanceColumns.fromMoneyWithSign({
      money: { amount: 0, currency },
      sign: MoneySign.POSITIVE,
    });
  }

  private positionsSignature(
    positions: ManualBrokeragePositionInput[],
  ): string {
    return positions
      .map(
        ({ symbol, quantity }) =>
          `${symbol.toUpperCase()}:${new Decimal(quantity).toString()}`,
      )
      .sort()
      .join('|');
  }

  private async loadLatestPositions(
    manager: EntityManager,
    accountId: string,
    userId: string,
  ): Promise<ManualBrokeragePositionInput[]> {
    const latestBalance = await manager
      .getRepository(BalanceSnapshotEntity)
      .findOne({
        where: {
          accountId,
          userId,
          snapshotType: Not(BalanceSnapshotType.FORWARD_FILL),
        },
        order: { snapshotDate: 'DESC', updatedAt: 'DESC' },
      });
    if (!latestBalance) return [];
    const holdings = await manager
      .getRepository(InvestmentHoldingSnapshotEntity)
      .find({
        where: {
          accountId,
          userId,
          snapshotDate: latestBalance.snapshotDate,
          provider: 'manual',
        },
      });
    return holdings.map((holding) => ({
      symbol: holding.security.externalSecurityId,
      quantity: holding.quantity ?? '0',
    }));
  }

  private async requireManualBrokerage(
    accountId: string,
    userId: string,
  ): Promise<AccountEntity> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, userId, archivedAt: IsNull() },
    });
    this.assertManualBrokerage(account, accountId);
    return account;
  }

  private assertManualBrokerage(
    account: AccountEntity | null,
    accountId: string,
  ): asserts account is AccountEntity {
    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }
    if (
      account.bankLinkId ||
      account.archivedAt ||
      account.valuationMode !== 'holdings' ||
      account.type !== String(AccountType.Investment) ||
      account.subType !== String(AccountSubtype.Brokerage)
    ) {
      throw new BadRequestException(
        `Account with id ${accountId} is not an active manual brokerage`,
      );
    }
  }

  private async getSnapshotDate(userId: string): Promise<string> {
    const userTimezone = await this.userService.getTimezone(userId);
    return dayjs().tz(userTimezone).format('YYYY-MM-DD');
  }
}
