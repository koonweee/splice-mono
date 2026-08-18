export interface PortfolioMoney {
  readonly amount: number;
  readonly currency: 'USD';
  readonly sign: 'positive';
}

export interface PortfolioAccountContribution {
  readonly accountId: string;
  readonly accountName: string | null;
  readonly snapshotDate: string;
  readonly quantity: string | null;
  readonly valueUsd: PortfolioMoney;
  readonly priceUsd: PortfolioMoney | null;
}

export interface PortfolioPosition {
  readonly securityId: string;
  readonly securityName: string | null;
  readonly tickerSymbol: string | null;
  readonly type: string | null;
  readonly subtype: string | null;
  readonly quantity: string | null;
  readonly valueUsd: PortfolioMoney;
  readonly allocationBps: number;
  readonly contributions: readonly PortfolioAccountContribution[];
}

export interface PortfolioSnapshotRange {
  readonly earliest: string;
  readonly latest: string;
}

export interface PortfolioPresentation {
  readonly reportingCurrency: 'USD';
  readonly totalValueUsd: PortfolioMoney;
  readonly snapshotRange: PortfolioSnapshotRange | null;
  readonly selectedAccountIds?: readonly string[];
  readonly positions: readonly PortfolioPosition[];
  readonly topPositions: readonly PortfolioPosition[];
  readonly remainingPositions: readonly PortfolioPosition[];
  readonly otherValueUsd: PortfolioMoney;
  readonly otherAllocationBps: number;
  readonly isEmpty: boolean;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseUsdMoney(value: unknown): PortfolioMoney | null {
  if (!isRecord(value)) return null;
  const amount = finiteNumber(value.amount);
  if (
    amount === null ||
    amount < 0 ||
    value.currency !== 'USD' ||
    value.sign !== 'positive'
  ) {
    return null;
  }
  return { amount, currency: 'USD', sign: 'positive' };
}

function parseContribution(
  value: unknown,
): PortfolioAccountContribution | null {
  if (!isRecord(value)) return null;
  const valueUsd = parseUsdMoney(value.valueUsd);
  const priceUsd =
    value.priceUsd == null ? null : parseUsdMoney(value.priceUsd);
  if (
    typeof value.accountId !== 'string' ||
    typeof value.snapshotDate !== 'string' ||
    !valueUsd ||
    (value.priceUsd != null && !priceUsd)
  ) {
    return null;
  }
  return {
    accountId: value.accountId,
    accountName: nullableString(value.accountName),
    snapshotDate: value.snapshotDate,
    quantity: nullableString(value.quantity),
    valueUsd,
    priceUsd,
  };
}

function parsePosition(value: unknown): PortfolioPosition | null {
  if (!isRecord(value) || !Array.isArray(value.contributions)) return null;
  const valueUsd = parseUsdMoney(value.valueUsd);
  const allocationBps = finiteNumber(value.allocationBps);
  const contributions = value.contributions.map(parseContribution);
  if (
    typeof value.securityId !== 'string' ||
    !valueUsd ||
    allocationBps === null ||
    !Number.isInteger(allocationBps) ||
    allocationBps < 0 ||
    allocationBps > 10_000 ||
    contributions.some((contribution) => contribution === null)
  ) {
    return null;
  }
  return {
    securityId: value.securityId,
    securityName: nullableString(value.securityName),
    tickerSymbol: nullableString(value.tickerSymbol),
    type: nullableString(value.type),
    subtype: nullableString(value.subtype),
    quantity: nullableString(value.quantity),
    valueUsd,
    allocationBps,
    contributions: contributions as PortfolioAccountContribution[],
  };
}

export function portfolioPositionLabel(position: PortfolioPosition): string {
  return position.securityName ?? position.tickerSymbol ?? 'Unnamed holding';
}

export function stablePortfolioPositionSort(
  left: PortfolioPosition,
  right: PortfolioPosition,
): number {
  const valueDifference = right.valueUsd.amount - left.valueUsd.amount;
  if (valueDifference !== 0) return valueDifference;
  const labelDifference = portfolioPositionLabel(left).localeCompare(
    portfolioPositionLabel(right),
  );
  if (labelDifference !== 0) return labelDifference;
  return left.securityId.localeCompare(right.securityId);
}

function sumUsdMoney(positions: readonly PortfolioPosition[]): PortfolioMoney {
  // The server has already rounded every value to USD cents. Summing integer
  // cents avoids introducing a new floating-point rounding decision in the UI.
  const cents = positions.reduce(
    (sum, position) => sum + Math.round(position.valueUsd.amount * 100),
    0,
  );
  return { amount: cents / 100, currency: 'USD', sign: 'positive' };
}

function parseSnapshotRange(value: unknown): PortfolioSnapshotRange | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.earliest !== 'string' ||
    typeof value.latest !== 'string'
  ) {
    return null;
  }
  return { earliest: value.earliest, latest: value.latest };
}

export function createPortfolioPresentation(
  value: unknown,
): PortfolioPresentation | null {
  if (
    !isRecord(value) ||
    value.reportingCurrency !== 'USD' ||
    !Array.isArray(value.positions)
  ) {
    return null;
  }
  const totalValueUsd = parseUsdMoney(value.totalValueUsd);
  const positions = value.positions.map(parsePosition);
  const snapshotRange = parseSnapshotRange(value.snapshotRange);
  if (
    !totalValueUsd ||
    positions.some((position) => position === null) ||
    (value.snapshotRange !== null && !snapshotRange)
  ) {
    return null;
  }
  const selectedAccountIds = Array.isArray(value.selectedAccountIds)
    ? value.selectedAccountIds.filter(
        (accountId): accountId is string => typeof accountId === 'string',
      )
    : undefined;
  const ranked = (positions as PortfolioPosition[])
    .slice()
    .sort(stablePortfolioPositionSort);
  const topPositions = ranked.slice(0, 5);
  const remainingPositions = ranked.slice(5);
  return {
    reportingCurrency: 'USD',
    totalValueUsd,
    snapshotRange,
    selectedAccountIds,
    positions: ranked,
    topPositions,
    remainingPositions,
    otherValueUsd: sumUsdMoney(remainingPositions),
    otherAllocationBps: remainingPositions.reduce(
      (sum, position) => sum + position.allocationBps,
      0,
    ),
    isEmpty: ranked.length === 0,
  };
}

export function portfolioPositionById(
  presentation: PortfolioPresentation,
  securityId: string | null,
): PortfolioPosition | null {
  if (!securityId) return null;
  return (
    presentation.positions.find(
      (position) => position.securityId === securityId,
    ) ?? null
  );
}

export function formatPortfolioPercentage(allocationBps: number): string {
  const percentage = allocationBps / 100;
  return (
    new Intl.NumberFormat('en-US', {
      maximumFractionDigits: percentage < 10 ? 1 : 0,
    }).format(percentage) + '%'
  );
}

export function formatPortfolioMoney(value: PortfolioMoney): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
  }).format(value.amount);
}

export function portfolioSnapshotLabel(
  range: PortfolioSnapshotRange | null,
): string {
  if (!range) return '';
  if (range.earliest === range.latest) return `Holdings as of ${range.latest}`;
  return `Latest holdings span ${range.earliest} to ${range.latest}`;
}

export function portfolioAccountLabel(
  contribution: PortfolioAccountContribution,
): string {
  return contribution.accountName ?? 'Investment account';
}

export function portfolioSelectionContext(
  presentation: PortfolioPresentation,
  position: PortfolioPosition | null,
): Record<string, unknown> {
  if (!position) {
    return { visualization: 'portfolio', selection: null };
  }
  return {
    visualization: 'portfolio',
    reportingCurrency: 'USD',
    selection: {
      securityId: position.securityId,
      displayName: portfolioPositionLabel(position),
      tickerSymbol: position.tickerSymbol,
      valueUsd: position.valueUsd,
      allocationBps: position.allocationBps,
      accountNames: position.contributions.map(portfolioAccountLabel),
      snapshotRange: presentation.snapshotRange,
    },
  };
}

export function portfolioSelectionModelContext(
  presentation: PortfolioPresentation | null,
  position: PortfolioPosition | null,
) {
  if (!position || !presentation) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No portfolio holding is currently selected.',
        },
      ],
      structuredContent: {
        visualization: 'portfolio',
        selection: null,
      },
    };
  }

  const ticker = position.tickerSymbol ? ` (${position.tickerSymbol})` : '';
  return {
    content: [
      {
        type: 'text' as const,
        text: `The user selected ${portfolioPositionLabel(position)}${ticker} in the Splice Portfolio visualization. Its position value is ${formatPortfolioMoney(position.valueUsd)} and its portfolio share is ${formatPortfolioPercentage(position.allocationBps)}. Resolve follow-up references such as "this holding" to this security.`,
      },
    ],
    structuredContent: portfolioSelectionContext(presentation, position),
  };
}
