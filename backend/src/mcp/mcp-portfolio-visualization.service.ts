import { Injectable } from '@nestjs/common';
import { McpPublicError } from '@koonweee/mcp-kit';
import type Decimal from 'decimal.js';
import {
  ExactDecimal,
  DECIMAL_PATTERN,
  type ExactRateRatio,
} from '../common/exact-money';
import { fxRequestKey } from '../currency-exchange/currency-exchange.service';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { getDecimalPlaces, MoneySign } from '../types/MoneyWithSign';
import type { McpMoney } from './mcp-money';
import { type McpInvestmentHolding, McpReadService } from './mcp-read.service';
import type { PortfolioVisualizationData } from './mcp-schemas';

const REPORTING_CURRENCY = 'USD' as const;
const USD_DECIMAL_PLACES = 2;
const MAX_MINOR_UNITS = new ExactDecimal('9'.repeat(78));

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
    const decimal = new ExactDecimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

function moneyDecimal(money: McpMoney | null, currency: string): Decimal {
  if (
    !money ||
    money.sign !== MoneySign.POSITIVE ||
    typeof money.amount !== 'string' ||
    !DECIMAL_PATTERN.test(money.amount) ||
    normalizeCurrency(money.currency) !== currency
  ) {
    throw unavailable();
  }
  const amount = new ExactDecimal(money.amount);
  const nativeMinorUnits = amount.mul(
    new ExactDecimal(10).pow(getDecimalPlaces(currency)),
  );
  if (
    !amount.isFinite() ||
    amount.isNegative() ||
    !nativeMinorUnits.isInteger() ||
    nativeMinorUnits.greaterThan(MAX_MINOR_UNITS)
  ) {
    throw unavailable();
  }
  return amount;
}

function hasOnlyZeroValues(holding: McpInvestmentHolding): boolean {
  const zero = /^0(?:\.0+)?$/;
  return (
    typeof holding.institutionValue?.amount === 'string' &&
    zero.test(holding.institutionValue.amount) &&
    (holding.institutionPrice === null || zero.test(holding.institutionPrice))
  );
}

function roundUsd(value: Decimal): Decimal {
  const rounded = value.toDecimalPlaces(
    USD_DECIMAL_PLACES,
    ExactDecimal.ROUND_HALF_UP,
  );
  const cents = rounded.mul(100);
  if (
    !rounded.isFinite() ||
    rounded.isNegative() ||
    !cents.isInteger() ||
    cents.greaterThan(MAX_MINOR_UNITS)
  ) {
    throw unavailable();
  }
  return rounded;
}

function usdMoney(value: Decimal): PortfolioUsdMoney {
  const rounded = roundUsd(value);
  const amount = rounded.toFixed();
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
    const { holdings, requests, resolved } =
      await this.mcpReadService.withReadSnapshot(async (manager) => {
        const holdingsResult = await this.mcpReadService.listInvestmentHoldings(
          userId,
          {
            ...(selectedAccountIds ? { accountIds: selectedAccountIds } : {}),
            latestOnly: true,
          },
          manager,
        );
        const requests = holdingsResult.data
          .filter(
            (holding) =>
              normalizeCurrency(holding.currency) !== REPORTING_CURRENCY &&
              !hasOnlyZeroValues(holding),
          )
          .map((holding) => ({
            baseCurrency: normalizeCurrency(holding.currency),
            targetCurrency: REPORTING_CURRENCY,
            requestedDate: holding.snapshotDate,
          }));
        try {
          const resolved =
            await this.currencyConversionService.getResolvedRates(
              requests,
              manager,
            );
          return { holdings: holdingsResult.data, requests, resolved };
        } catch {
          throw unavailable();
        }
      });
    // All valuation, grouping and formatting runs after the input snapshot commits.
    const rateByCurrencyDate = new Map<string, ExactRateRatio>();
    try {
      for (const request of requests) {
        const rate = resolved.get(fxRequestKey(request));
        if (!rate) throw unavailable();
        const numerator = new ExactDecimal(rate.ratio.numerator);
        const denominator = new ExactDecimal(rate.ratio.denominator);
        if (
          !numerator.isFinite() ||
          !numerator.isPositive() ||
          !denominator.isFinite() ||
          !denominator.isPositive()
        )
          throw unavailable();
        rateByCurrencyDate.set(
          `${request.requestedDate}:${request.baseCurrency}`,
          rate.ratio,
        );
      }
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
            currency === REPORTING_CURRENCY || hasOnlyZeroValues(holding)
              ? { numerator: '1', denominator: '1' }
              : rateByCurrencyDate.get(`${holding.snapshotDate}:${currency}`);
          if (!rate) throw unavailable();
          const valueUsdDecimal = roundUsd(
            moneyDecimal(holding.institutionValue, currency)
              .mul(rate.numerator)
              .div(rate.denominator),
          );
          const nativePrice = decimalOrNull(holding.institutionPrice);
          const priceUsdDecimal = nativePrice?.isNegative()
            ? null
            : nativePrice
              ? roundUsd(nativePrice.mul(rate.numerator).div(rate.denominator))
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
          ? ExactDecimal.sum(...quantityParts).toString()
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
          valueUsdDecimal: ExactDecimal.sum(
            ...contributions.map((item) => item.valueUsdDecimal),
          ),
          contributions: contributions.sort(contributionSort),
        } satisfies PendingPosition;
      },
    );
    pendingPositions.sort(positionSort);
    const total = pendingPositions.length
      ? roundUsd(
          ExactDecimal.sum(
            ...pendingPositions.map((position) => position.valueUsdDecimal),
          ),
        )
      : new ExactDecimal(0);
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
