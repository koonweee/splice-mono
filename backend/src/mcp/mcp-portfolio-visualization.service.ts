import { Injectable } from '@nestjs/common';
import { McpPublicError } from '@koonweee/mcp-kit';
import Decimal from 'decimal.js';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import type { McpMoney } from './mcp-money';
import type { McpInvestmentHolding, McpReadService } from './mcp-read.service';
import type { PortfolioVisualizationData } from './mcp-schemas';

const REPORTING_CURRENCY = 'USD' as const;
const USD_DECIMAL_PLACES = 2;
const MAX_SAFE_MINOR_UNITS = new Decimal(Number.MAX_SAFE_INTEGER);

type PortfolioContribution =
  PortfolioVisualizationData['positions'][number]['contributions'][number];
type PortfolioUsdMoney = PortfolioVisualizationData['totalValueUsd'];

type PendingContribution = Omit<
  PortfolioContribution,
  'valueUsd' | 'priceUsd'
> & {
  readonly valueUsdDecimal: Decimal;
  readonly priceUsdDecimal: Decimal | null;
};

type PendingPosition = Omit<
  PortfolioVisualizationData['positions'][number],
  'valueUsd' | 'allocationBps' | 'contributions'
> & {
  readonly valueUsdDecimal: Decimal;
  readonly contributions: PendingContribution[];
};

function unavailable(): McpPublicError {
  return new McpPublicError(
    'portfolio_valuation_unavailable',
    'Portfolio values are temporarily unavailable.',
  );
}

function normalizeCurrency(currency: string | null): string {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized) throw unavailable();
  return normalized;
}

function decimalOrNull(value: string | null): Decimal | null {
  if (value === null) return null;
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function moneyDecimal(money: McpMoney | null, currency: string): Decimal {
  if (
    !money ||
    money.sign !== MoneySign.POSITIVE ||
    !Number.isFinite(money.amount) ||
    normalizeCurrency(money.currency) !== currency
  ) {
    throw unavailable();
  }
  const amount = new Decimal(money.amount);
  const nativeMinorUnits = amount.mul(
    new Decimal(10).pow(getDecimalPlaces(currency)),
  );
  if (
    !amount.isFinite() ||
    amount.isNegative() ||
    !nativeMinorUnits.isInteger() ||
    nativeMinorUnits.greaterThan(MAX_SAFE_MINOR_UNITS)
  ) {
    throw unavailable();
  }
  return amount;
}

function roundUsd(value: Decimal): Decimal {
  const rounded = value.toDecimalPlaces(
    USD_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );
  const cents = rounded.mul(100);
  if (
    !rounded.isFinite() ||
    rounded.isNegative() ||
    !cents.isInteger() ||
    cents.greaterThan(MAX_SAFE_MINOR_UNITS)
  ) {
    throw unavailable();
  }
  return rounded;
}

function usdMoney(value: Decimal): PortfolioUsdMoney {
  const rounded = roundUsd(value);
  const amount = rounded.toNumber();
  if (!Number.isFinite(amount)) throw unavailable();
  return {
    amount,
    currency: REPORTING_CURRENCY,
    sign: MoneySign.POSITIVE,
  };
}

function deterministicNullable(
  values: readonly (string | null)[],
): string | null {
  return (
    [
      ...new Set(values.filter((value): value is string => value !== null)),
    ].sort((left, right) => left.localeCompare(right))[0] ?? null
  );
}

function contributionSort(
  left: PendingContribution,
  right: PendingContribution,
): number {
  return (
    (left.accountName ?? '').localeCompare(right.accountName ?? '') ||
    left.accountId.localeCompare(right.accountId) ||
    left.snapshotDate.localeCompare(right.snapshotDate)
  );
}

function positionSort(left: PendingPosition, right: PendingPosition): number {
  return (
    right.valueUsdDecimal.comparedTo(left.valueUsdDecimal) ||
    left.securityId.localeCompare(right.securityId)
  );
}

function allocationBasisPoints(
  positions: readonly PendingPosition[],
  total: Decimal,
): Map<string, number> {
  if (total.isZero()) {
    return new Map(positions.map((position) => [position.securityId, 0]));
  }

  const allocations = positions.map((position) => {
    const exact = position.valueUsdDecimal.mul(10_000).div(total);
    const floor = exact.floor();
    return {
      securityId: position.securityId,
      basisPoints: floor.toNumber(),
      remainder: exact.minus(floor),
    };
  });
  const remaining =
    10_000 - allocations.reduce((sum, item) => sum + item.basisPoints, 0);
  allocations.sort(
    (left, right) =>
      right.remainder.comparedTo(left.remainder) ||
      left.securityId.localeCompare(right.securityId),
  );
  for (let index = 0; index < remaining; index += 1) {
    allocations[index].basisPoints += 1;
  }
  return new Map(
    allocations.map((item) => [item.securityId, item.basisPoints]),
  );
}

@Injectable()
export class McpPortfolioVisualizationService {
  constructor(
    private readonly mcpReadService: McpReadService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  async visualize(
    userId: string,
    accountIds?: readonly string[],
  ): Promise<PortfolioVisualizationData> {
    const selectedAccountIds = accountIds?.length
      ? [...new Set(accountIds)]
      : undefined;
    const holdingsResult = await this.mcpReadService.listInvestmentHoldings(
      userId,
      {
        ...(selectedAccountIds ? { accountIds: selectedAccountIds } : {}),
        latestOnly: true,
      },
    );
    const holdings = holdingsResult.data;

    const currenciesByDate = new Map<string, Set<string>>();
    for (const holding of holdings) {
      const currency = normalizeCurrency(holding.currency);
      moneyDecimal(holding.institutionValue, currency);
      if (currency !== REPORTING_CURRENCY) {
        const currencies =
          currenciesByDate.get(holding.snapshotDate) ?? new Set();
        currencies.add(currency);
        currenciesByDate.set(holding.snapshotDate, currencies);
      }
    }

    const rateByCurrencyDate = new Map<string, Decimal>();
    try {
      await Promise.all(
        [...currenciesByDate.entries()].map(
          async ([snapshotDate, currencies]) => {
            const rateMap = await this.currencyConversionService.getRateMap(
              [...currencies].sort(),
              REPORTING_CURRENCY,
              snapshotDate,
            );
            for (const currency of currencies) {
              const rateValue = rateMap.get(currency);
              if (
                rateValue === undefined ||
                !Number.isFinite(rateValue) ||
                rateValue <= 0
              ) {
                throw unavailable();
              }
              rateByCurrencyDate.set(
                `${snapshotDate}:${currency}`,
                new Decimal(rateValue),
              );
            }
          },
        ),
      );
    } catch {
      throw unavailable();
    }

    const grouped = new Map<string, McpInvestmentHolding[]>();
    for (const holding of holdings) {
      const existing = grouped.get(holding.securityId) ?? [];
      existing.push(holding);
      grouped.set(holding.securityId, existing);
    }

    const pendingPositions: PendingPosition[] = [...grouped.entries()].map(
      ([securityId, securityHoldings]) => {
        const contributions = securityHoldings.map((holding) => {
          const currency = normalizeCurrency(holding.currency);
          const rate =
            currency === REPORTING_CURRENCY
              ? new Decimal(1)
              : rateByCurrencyDate.get(`${holding.snapshotDate}:${currency}`);
          if (!rate) throw unavailable();
          const valueUsdDecimal = roundUsd(
            moneyDecimal(holding.institutionValue, currency).mul(rate),
          );
          const nativePrice = decimalOrNull(holding.institutionPrice);
          const priceUsdDecimal = nativePrice?.isNegative()
            ? null
            : nativePrice
              ? roundUsd(nativePrice.mul(rate))
              : null;
          const quantity = decimalOrNull(holding.quantity);

          return {
            accountId: holding.accountId,
            accountName: holding.accountName,
            snapshotDate: holding.snapshotDate,
            quantity: quantity?.toString() ?? null,
            valueUsdDecimal,
            priceUsdDecimal,
          } satisfies PendingContribution;
        });
        const quantityParts = contributions.map((item) =>
          decimalOrNull(item.quantity),
        );
        const quantity = quantityParts.every(
          (item): item is Decimal => item !== null,
        )
          ? Decimal.sum(...quantityParts).toString()
          : null;

        return {
          securityId,
          securityName: deterministicNullable(
            securityHoldings.map((holding) => holding.securityName),
          ),
          tickerSymbol: deterministicNullable(
            securityHoldings.map((holding) => holding.tickerSymbol),
          ),
          type: deterministicNullable(
            securityHoldings.map((holding) => holding.type),
          ),
          subtype: deterministicNullable(
            securityHoldings.map((holding) => holding.subtype),
          ),
          quantity,
          valueUsdDecimal: Decimal.sum(
            ...contributions.map((item) => item.valueUsdDecimal),
          ),
          contributions: contributions.sort(contributionSort),
        } satisfies PendingPosition;
      },
    );
    pendingPositions.sort(positionSort);
    const total = pendingPositions.length
      ? roundUsd(
          Decimal.sum(
            ...pendingPositions.map((position) => position.valueUsdDecimal),
          ),
        )
      : new Decimal(0);
    const allocations = allocationBasisPoints(pendingPositions, total);
    const dates = holdings.map((holding) => holding.snapshotDate).sort();

    return {
      reportingCurrency: REPORTING_CURRENCY,
      totalValueUsd: usdMoney(total),
      snapshotRange: dates.length
        ? { earliest: dates[0], latest: dates[dates.length - 1] }
        : null,
      ...(selectedAccountIds ? { selectedAccountIds } : {}),
      positions: pendingPositions.map((position) => ({
        securityId: position.securityId,
        securityName: position.securityName,
        tickerSymbol: position.tickerSymbol,
        type: position.type,
        subtype: position.subtype,
        quantity: position.quantity,
        valueUsd: usdMoney(position.valueUsdDecimal),
        allocationBps: allocations.get(position.securityId) ?? 0,
        contributions: position.contributions.map((contribution) => ({
          accountId: contribution.accountId,
          accountName: contribution.accountName,
          snapshotDate: contribution.snapshotDate,
          quantity: contribution.quantity,
          valueUsd: usdMoney(contribution.valueUsdDecimal),
          priceUsd: contribution.priceUsdDecimal
            ? usdMoney(contribution.priceUsdDecimal)
            : null,
        })),
      })),
    };
  }
}
