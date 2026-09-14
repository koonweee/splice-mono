import { z } from 'zod';
import { HistoricalSecurityEvidenceSchema } from './mcp-schemas';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { assertDateRange } from '../common/query-bounds';
import { ExactDecimal } from '../common/exact-money';
import {
  CurrencyExchangeService,
  fxRequestKey,
} from '../currency-exchange/currency-exchange.service';
import { InvestmentSecurityEntity } from '../investment/investment-security.entity';
import { InvestmentHoldingSnapshotEntity } from '../investment/investment-holding-snapshot.entity';
import {
  MARKET_PRICE_PROVIDER,
  type MarketPriceProvider,
} from '../market-price/market-price-provider.interface';

export type HistoricalEvidenceOptions = {
  securityIds: string[];
  startDate: string;
  endDate: string;
  reportingCurrency: string;
};
type PriceEvidence = {
  price: string;
  adjustedClose: string | null;
  currency: string;
  priceDate: string;
  priceDatetime: string | null;
  source: 'yahoo_chart' | 'stored_institution_price';
  observationSnapshotId: string | null;
  observationSnapshotDate: string | null;
};

@Injectable()
export class McpHistoricalEvidenceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fx: CurrencyExchangeService,
    @Optional()
    @Inject(MARKET_PRICE_PROVIDER)
    private readonly provider?: MarketPriceProvider,
  ) {}

  async read(userId: string, options: HistoricalEvidenceOptions) {
    assertDateRange(options.startDate, options.endDate, { maxDays: 366 });
    if (options.securityIds.length < 1 || options.securityIds.length > 20)
      throw new BadRequestException('Request between 1 and 20 securities');
    const ids = [...new Set(options.securityIds)];
    const { securities, holdings } = await this.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const securities = await manager
          .getRepository(InvestmentSecurityEntity)
          .find({
            where: { userId, id: In(ids) },
            order: { id: 'ASC' },
          });
        if (securities.length !== ids.length)
          throw new NotFoundException('One or more securities were not found');
        const holdings = await manager
          .getRepository(InvestmentHoldingSnapshotEntity)
          .createQueryBuilder('holding')
          .innerJoin('holding.account', 'owner', 'owner."userId" = :userId', {
            userId,
          })
          .where('holding."userId" = :userId', { userId })
          .andWhere('holding."securityId" IN (:...ids)', { ids })
          .andWhere(
            'holding."snapshotDate" BETWEEN :startDate AND :endDate',
            options,
          )
          .andWhere(
            'holding."institutionPriceAsOf" BETWEEN :startDate AND :endDate',
            options,
          )
          .orderBy('holding.snapshotDate', 'ASC')
          .addOrderBy('holding.id', 'ASC')
          .take(2001)
          .getMany();
        return { securities, holdings };
      },
    );
    const storedTruncated = holdings.length > 2000;
    const data: z.infer<typeof HistoricalSecurityEvidenceSchema>[] = [];
    // Bounded sequential requests avoid unbounded provider concurrency and preserve per-security errors.
    for (const security of securities) {
      let prices: PriceEvidence[] = [];
      let providerStatus:
        | 'ok'
        | 'empty'
        | 'error'
        | 'unavailable'
        | 'unmapped' = 'unmapped';
      let exchange = security.marketIdentifierCode;
      let exchangeTimezone: string | null = null;
      let corporateActionsPresent: boolean | null = null;
      const mapping =
        security.provider === 'yahoo'
          ? ('stored_yahoo_identity' as const)
          : ('unmapped' as const);
      if (mapping === 'stored_yahoo_identity') {
        if (!this.provider?.getHistoricalPrices) providerStatus = 'unavailable';
        else {
          try {
            const history = await this.provider.getHistoricalPrices(
              security.externalSecurityId,
              options.startDate,
              options.endDate,
            );
            prices = history.prices
              .filter(
                (price) =>
                  price.date >= options.startDate &&
                  price.date <= options.endDate,
              )
              .map((price) => ({
                price: price.close,
                adjustedClose: price.adjustedClose,
                currency: history.currency,
                priceDate: price.date,
                priceDatetime: price.priceDatetime,
                source: 'yahoo_chart' as const,
                observationSnapshotId: null,
                observationSnapshotDate: null,
              }));
            providerStatus = prices.length ? 'ok' : 'empty';
            exchange = history.exchange;
            exchangeTimezone = history.exchangeTimezone;
            corporateActionsPresent = history.corporateActionsPresent;
          } catch {
            providerStatus = 'error';
          }
        }
      }
      const storedPrices: PriceEvidence[] = holdings
        .slice(0, 2000)
        .filter(
          (holding) =>
            holding.securityId === security.id &&
            holding.institutionPrice !== null &&
            new ExactDecimal(holding.institutionPrice).gt(0) &&
            !!holding.institutionPriceAsOf &&
            !!(holding.isoCurrencyCode ?? holding.unofficialCurrencyCode),
        )
        .map((holding) => ({
          price: holding.institutionPrice!,
          adjustedClose: null,
          currency: (holding.isoCurrencyCode ??
            holding.unofficialCurrencyCode)!,
          priceDate: holding.institutionPriceAsOf!,
          priceDatetime: holding.institutionPriceDatetime,
          source: 'stored_institution_price',
          observationSnapshotId: holding.id,
          observationSnapshotDate: holding.snapshotDate,
        }));
      // Never silently mix provider close prices with institution price basis at opposite endpoints.
      const selectedPrices = providerStatus === 'ok' ? prices : storedPrices;
      const endpoint = (date: string) => {
        const candidates = selectedPrices
          .filter((price) => price.priceDate <= date)
          .sort((a, b) => b.priceDate.localeCompare(a.priceDate));
        const selected = candidates[0] ?? null;
        const ambiguous =
          selected &&
          candidates.some(
            (price) =>
              price.priceDate === selected.priceDate &&
              (price.currency !== selected.currency ||
                !new ExactDecimal(price.price).eq(selected.price)),
          );
        return {
          requestedDate: date,
          status: ambiguous
            ? ('ambiguous' as const)
            : selected
              ? ('available' as const)
              : ('missing' as const),
          price: ambiguous ? null : selected,
          carriedForward: !!selected && selected.priceDate !== date,
        };
      };
      data.push({
        securityId: security.id,
        identifiers: {
          provider: security.provider,
          externalSecurityId: security.externalSecurityId,
          isin: security.isin,
          cusip: security.cusip,
          sedol: security.sedol,
          tickerSymbol: security.tickerSymbol,
        },
        mapping,
        proxy: null,
        providerStatus,
        exchange,
        exchangeTimezone,
        corporateActionsPresent,
        priceBasis:
          providerStatus === 'ok'
            ? ('provider_close_adjustment_unverified' as const)
            : ('institution_price_adjustment_unknown' as const),
        prices: selectedPrices,
        storedPrices,
        endpoints: {
          opening: endpoint(options.startDate),
          closing: endpoint(options.endDate),
        },
      });
    }
    const requests = data.flatMap((item) => [
      ...item.prices.map((price) => ({
        baseCurrency: price.currency,
        targetCurrency: options.reportingCurrency,
        requestedDate: price.priceDate,
      })),
      ...[options.startDate, options.endDate].flatMap((requestedDate) =>
        [...new Set(item.prices.map((price) => price.currency))].map(
          (baseCurrency) => ({
            baseCurrency,
            targetCurrency: options.reportingCurrency,
            requestedDate,
          }),
        ),
      ),
    ]);
    const uniqueRequests = new Map(
      requests.map((request) => [fxRequestKey(request), request]),
    );
    // Request each quote currency/date and both valuation-date FX bases, without a currency/date Cartesian grid.
    const rates = await this.fx.resolveRequests(
      [...uniqueRequests.values()],
      undefined,
      { allowMissing: true },
    );
    return {
      basis: 'historical_valuation_evidence' as const,
      query: options,
      data,
      storedPricesTruncated: storedTruncated,
      fx: [...uniqueRequests.entries()].map(([key, request]) => ({
        ...request,
        status: rates.has(key) ? ('available' as const) : ('missing' as const),
        evidence: rates.get(key) ?? null,
      })),
      limitations: [
        'Evidence is not observed chart P&L. A constant-holdings estimate requires explicit unchanged-quantity, currency, date and price-basis assumptions.',
        'Price dates use the exchange calendar for Yahoo and stored institution price-as-of dates otherwise. Endpoints select on or before within the requested range; missing opening prices require a wider bounded range.',
        'Yahoo numeric provider quotes are serialized as decimal text; provider precision is not an exact trade-price guarantee. Close adjustments are unverified; adjustedClose is separate and must not be mixed with close.',
        'Corporate actions, dividends, splits, trading, transfers, fees, and cash are not reconciled. Constant quantities across splits can be invalid. Institution price adjustment basis is unknown.',
        'FX source is database identity/exact/fill evidence, not retained upstream vendor metadata. Backward-filled FX uses a later rate and is explicitly labeled; it does not describe a future balance snapshot.',
        'Unmapped securities have no automatic ticker/exchange proxy. Provider failure is separate from empty quotes; stored evidence does not imply complete historical coverage.',
      ],
    };
  }
}
