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
import {
  ExactDecimal as Decimal,
  canonicalMinorUnits,
  divideHalfUp,
  type ExactRateRatio,
} from '../common/exact-money';
import { AccountSubtype, AccountType } from 'plaid';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BalanceColumns } from '../common/balance.columns';
import {
  CurrencyExchangeService,
  fxRequestKey,
  type FxRequest,
} from '../currency-exchange/currency-exchange.service';
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
import { HoldingsQueryService } from './holdings-query.service';
import { investmentWriteValues } from './investment-write-values';

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
  totalMinorUnits: string;
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
    private readonly holdingsQueryService: HoldingsQueryService,
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
    const rates = new Map<string, ExactRateRatio>();
    const requests: FxRequest[] = [];
    for (const currency of currencies) {
      if (currency === accountCurrency) {
        rates.set(currency, { numerator: '1', denominator: '1' });
      } else {
        // Retain provider fetching, then read the stored quote's exact fraction.
        await this.currencyExchangeService.getRate(
          currency,
          accountCurrency,
          snapshotDate,
        );
        requests.push({
          baseCurrency: currency,
          targetCurrency: accountCurrency,
          requestedDate: snapshotDate,
        });
      }
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
    if (requests.length) {
      const resolved =
        await this.currencyExchangeService.resolveRequests(requests);
      for (const request of requests) {
        const quote = resolved.get(fxRequestKey(request));
        if (!quote)
          throw new BadRequestException(
            `Missing FX rate for ${request.baseCurrency}`,
          );
        rates.set(request.baseCurrency, quote.ratio);
      }
    }

    const decimals = getDecimalPlaces(accountCurrency);
    const valued = positions.map((input) => {
      const quote = quotes.get(input.symbol);
      if (!quote)
        throw new BadRequestException(`Missing quote for ${input.symbol}`);
      const nativeValue = new Decimal(input.quantity)
        .mul(quote.price)
        .toDecimalPlaces(12, Decimal.ROUND_HALF_UP);
      const ratio = rates.get(quote.currency);
      if (!ratio) {
        throw new BadRequestException(`Missing FX rate for ${quote.currency}`);
      }
      // Native position value has 12 stored decimals. Apply the exact fraction and
      // round target minor units once, including inverse-rate half-cent ties.
      const accountMinorUnits = divideHalfUp(
        BigInt(nativeValue.mul('1000000000000').toFixed(0)) *
          BigInt(ratio.numerator) *
          10n ** BigInt(decimals),
        1000000000000n * BigInt(ratio.denominator),
      );
      const accountValue = new Decimal(accountMinorUnits.toString()).div(
        new Decimal(10).pow(decimals),
      );
      // This informational column has a smaller scale than the valuation fraction.
      const exchangeRate = new Decimal(ratio.numerator)
        .div(ratio.denominator)
        .toDecimalPlaces(12, Decimal.ROUND_HALF_UP)
        .toFixed();
      const storedDecimals = {
        quantity: input.quantity,
        price: quote.price,
        nativeValue: nativeValue.toFixed(),
        exchangeRate,
        accountValue: accountValue.toFixed(decimals),
      };
      for (const [field, value] of Object.entries(storedDecimals)) {
        const decimal = new Decimal(value);
        if (
          !decimal.isFinite() ||
          decimal.abs().gte('1000000000000000000') ||
          decimal.decimalPlaces() > 12
        ) {
          throw new BadRequestException(
            `${input.symbol} ${field} exceeds position storage precision (18 integer and 12 fractional digits); reduce the quantity or price`,
          );
        }
      }
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
    try {
      if (!minorUnits.isInteger())
        throw new RangeError('Fractional minor unit');
      return {
        positions: valued,
        totalMinorUnits: canonicalMinorUnits(minorUnits.toFixed(0)),
      };
    } catch {
      throw new BadRequestException(
        'Portfolio value exceeds the supported 78-digit minor-unit range',
      );
    }
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
    const securities = valuation.positions.map(({ quote }) =>
      Object.assign(new InvestmentSecurityEntity(), {
        userId: account.userId,
        provider: 'yahoo',
        externalSecurityId: quote.symbol,
        institutionId: quote.exchangeCode,
        institutionSecurityId: quote.exchangeName,
        name: quote.name,
        tickerSymbol: quote.symbol,
        isin: null,
        cusip: null,
        sedol: null,
        type: quote.quoteType,
        subtype: null,
        isCashEquivalent: false,
        closePrice: quote.price,
        closePriceAsOf: quote.priceAsOf,
        updateDatetime: quote.priceDatetime,
        isoCurrencyCode: quote.currency,
        unofficialCurrencyCode: null,
        marketIdentifierCode: quote.marketIdentifierCode,
        sector: null,
        industry: null,
      }),
    );
    for (let offset = 0; offset < securities.length; offset += 300) {
      await securityRepository.upsert(
        investmentWriteValues(
          securityRepository,
          securities.slice(offset, offset + 300),
        ),
        {
          conflictPaths: ['userId', 'provider', 'externalSecurityId'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    }
    const savedSecurities = securities.length
      ? await securityRepository.find({
          where: {
            userId: account.userId,
            provider: 'yahoo',
            externalSecurityId: In(
              securities.map((security) => security.externalSecurityId),
            ),
          },
        })
      : [];
    const bySymbol = new Map(
      savedSecurities.map((security) => [
        security.externalSecurityId,
        security,
      ]),
    );
    const headers: Array<{ id: string }> = await manager.query(
      `
      INSERT INTO holdings_snapshot_header_entity ("userId","accountId",provider,"snapshotDate","completedAt","accountCurrency","accountValueAmount","accountValueSign")
      VALUES ($1,$2,'manual',$3,now(),$4,$5,$6)
      ON CONFLICT ("accountId",provider,"snapshotDate") DO UPDATE SET revision=holdings_snapshot_header_entity.revision+1,
        "completedAt"=now(),"accountCurrency"=EXCLUDED."accountCurrency","accountValueAmount"=EXCLUDED."accountValueAmount","accountValueSign"=EXCLUDED."accountValueSign","updatedAt"=now()
      RETURNING id`,
      [
        account.userId,
        account.id,
        snapshotDate,
        account.currentBalance.currency,
        account.currentBalance.amount,
        account.currentBalance.sign,
      ],
    );
    const holdings = valuation.positions.map((position) => {
      const { quote } = position;
      const security = bySymbol.get(quote.symbol);
      if (!security) throw new Error('Persisted security was not found');
      return Object.assign(new InvestmentHoldingSnapshotEntity(), {
        userId: account.userId,
        headerId: headers[0].id,
        accountId: account.id,
        securityId: security.id,
        provider: 'manual',
        snapshotDate,
        quantity: position.input.quantity,
        costBasis: null,
        institutionPrice: quote.price,
        institutionPriceAsOf: quote.priceAsOf,
        institutionPriceDatetime: quote.priceDatetime,
        institutionValue: position.nativeValue,
        isoCurrencyCode: quote.currency,
        unofficialCurrencyCode: null,
        accountCurrency: account.currentBalance.currency,
        exchangeRateToAccountCurrency: position.exchangeRate,
        accountValue: position.accountValue,
        vestedQuantity: null,
        vestedValue: null,
      });
    });
    await holdingRepository.delete({
      userId: account.userId,
      accountId: account.id,
      snapshotDate,
      provider: 'manual',
    });
    for (let offset = 0; offset < holdings.length; offset += 300)
      await holdingRepository.insert(
        investmentWriteValues(
          holdingRepository,
          holdings.slice(offset, offset + 300),
        ),
      );

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
    amount: string,
  ): void {
    account.currentBalance = BalanceColumns.fromMoneyWithSign({
      money: { amount, currency },
      sign: MoneySign.POSITIVE,
    });
    account.availableBalance = BalanceColumns.fromMoneyWithSign({
      money: { amount: '0', currency },
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
    const [result] = await this.holdingsQueryService.read(
      userId,
      { accountIds: [accountId] },
      manager,
    );
    return result.snapshot.holdings.map((holding) => ({
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
