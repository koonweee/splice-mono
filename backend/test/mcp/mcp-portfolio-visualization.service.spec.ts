import { decimalRateRatio } from '../../src/common/exact-money';
import { McpPublicError } from '@koonweee/mcp-kit';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { McpPortfolioVisualizationService } from '../../src/mcp/mcp-portfolio-visualization.service';
import {
  type McpInvestmentHolding,
  McpReadService,
} from '../../src/mcp/mcp-read.service';
import { PortfolioVisualizationDataSchema } from '../../src/mcp/mcp-schemas';
import { MoneySign } from '../../src/types/MoneyWithSign';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_A = '10000000-0000-4000-8000-000000000001';
const ACCOUNT_B = '10000000-0000-4000-8000-000000000002';
const SECURITY_A = '20000000-0000-4000-8000-000000000001';
const SECURITY_B = '20000000-0000-4000-8000-000000000002';

function holding(
  overrides: Partial<McpInvestmentHolding> = {},
): McpInvestmentHolding {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    accountId: ACCOUNT_A,
    accountName: 'Brokerage A',
    snapshotDate: '2026-08-15',
    provider: 'test',
    securityId: SECURITY_A,
    securityName: 'Alpha Fund',
    tickerSymbol: 'ALPHA',
    type: 'equity',
    subtype: 'etf',
    quantity: '2.5',
    costBasis: null,
    institutionPrice: '40',
    institutionValue: {
      amount: '100',
      currency: 'USD',
      sign: MoneySign.POSITIVE,
    },
    currency: 'USD',
    vestedQuantity: null,
    vestedValue: null,
    ...overrides,
  };
}

describe('McpPortfolioVisualizationService', () => {
  const snapshotManager = {};
  const mcpReadService = {
    listInvestmentHoldings: jest.fn(),
    withReadSnapshot: jest.fn(async (reader) => reader(snapshotManager)),
  };
  const currencyConversionService = { getResolvedRates: jest.fn() };
  let service: McpPortfolioVisualizationService;

  it('emits the concrete Nest provider types for production dependency injection', () => {
    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        McpPortfolioVisualizationService,
      ),
    ).toEqual([McpReadService, CurrencyConversionService]);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currencyConversionService.getResolvedRates.mockResolvedValue(new Map());
    service = new McpPortfolioVisualizationService(
      mcpReadService as never,
      currencyConversionService as never,
    );
  });

  it('normalizes historical major-unit values to USD and aggregates a security across accounts', async () => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [
        holding(),
        holding({
          id: '30000000-0000-4000-8000-000000000002',
          accountId: ACCOUNT_B,
          accountName: 'Brokerage B',
          snapshotDate: '2026-08-16',
          quantity: '1.25',
          institutionPrice: '61.1066666667',
          institutionValue: {
            amount: '50.01',
            currency: 'sgd',
            sign: MoneySign.POSITIVE,
          },
          currency: ' sgd ',
        }),
        holding({
          id: '30000000-0000-4000-8000-000000000003',
          securityId: SECURITY_B,
          securityName: 'Beta Fund',
          tickerSymbol: 'BETA',
          quantity: null,
          institutionPrice: null,
          institutionValue: {
            amount: '25',
            currency: 'EUR',
            sign: MoneySign.POSITIVE,
          },
          currency: 'EUR',
        }),
      ],
      query: { latestOnly: true },
    });
    currencyConversionService.getResolvedRates.mockImplementation(
      async (requests) =>
        new Map(
          requests.map((request) => [
            `${request.baseCurrency}:${request.targetCurrency}:${request.requestedDate}`,
            {
              ratio: decimalRateRatio(
                request.baseCurrency === 'SGD' &&
                  request.requestedDate === '2026-08-16'
                  ? '0.75'
                  : '1.2',
              ),
            },
          ]),
        ),
    );

    const result = await service.visualize(USER_ID, [ACCOUNT_A, ACCOUNT_A]);

    expect(mcpReadService.listInvestmentHoldings).toHaveBeenCalledWith(
      USER_ID,
      { accountIds: [ACCOUNT_A], latestOnly: true },
      snapshotManager,
    );
    expect(mcpReadService.listInvestmentHoldings).toHaveBeenCalledTimes(1);
    expect(currencyConversionService.getResolvedRates).toHaveBeenCalledTimes(1);
    expect(currencyConversionService.getResolvedRates).toHaveBeenCalledWith(
      expect.arrayContaining([
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          requestedDate: '2026-08-15',
        },
        {
          baseCurrency: 'SGD',
          targetCurrency: 'USD',
          requestedDate: '2026-08-16',
        },
      ]),
      snapshotManager,
    );
    expect(result).toMatchObject({
      reportingCurrency: 'USD',
      totalValueUsd: { amount: '167.51', currency: 'USD', sign: 'positive' },
      snapshotRange: { earliest: '2026-08-15', latest: '2026-08-16' },
      selectedAccountIds: [ACCOUNT_A],
      positions: [
        {
          securityId: SECURITY_A,
          quantity: '3.75',
          valueUsd: { amount: '137.51' },
          contributions: [
            { accountId: ACCOUNT_A, valueUsd: { amount: '100' } },
            {
              accountId: ACCOUNT_B,
              valueUsd: { amount: '37.51' },
              priceUsd: { amount: '45.83' },
            },
          ],
        },
        {
          securityId: SECURITY_B,
          quantity: null,
          valueUsd: { amount: '30' },
          contributions: [{ priceUsd: null }],
        },
      ],
    });
    expect(
      result.positions.reduce((sum, item) => sum + item.allocationBps, 0),
    ).toBe(10_000);
    expect(PortfolioVisualizationDataSchema.parse(result)).toEqual(result);
    expect(
      PortfolioVisualizationDataSchema.safeParse({
        ...result,
        totalValueUsd: { ...result.totalValueUsd, amount: '167.511' },
      }).success,
    ).toBe(false);
  });

  it('returns a strict purposeful empty portfolio without loading FX', async () => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [],
      query: { latestOnly: true },
    });

    await expect(service.visualize(USER_ID)).resolves.toEqual({
      reportingCurrency: 'USD',
      totalValueUsd: { amount: '0', currency: 'USD', sign: 'positive' },
      snapshotRange: null,
      positions: [],
    });
    expect(currencyConversionService.getResolvedRates).toHaveBeenCalledWith(
      [],
      snapshotManager,
    );
  });

  it('defensively treats an empty account list as an unscoped latest request', async () => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [],
      query: { latestOnly: true },
    });

    const result = await service.visualize(USER_ID, []);

    expect(mcpReadService.listInvestmentHoldings).toHaveBeenCalledWith(
      USER_ID,
      {
        latestOnly: true,
      },
      snapshotManager,
    );
    expect(result).not.toHaveProperty('selectedAccountIds');
  });

  it('reports zero-only foreign values without requiring an exchange rate', async () => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [
        holding({
          currency: 'EUR',
          institutionPrice: null,
          institutionValue: {
            amount: '0',
            currency: 'EUR',
            sign: MoneySign.POSITIVE,
          },
        }),
      ],
      query: { latestOnly: true },
    });
    const result = await service.visualize(USER_ID);
    expect(result.totalValueUsd.amount).toBe('0');
    expect(result.positions[0].contributions[0].priceUsd).toBeNull();
    expect(currencyConversionService.getResolvedRates).toHaveBeenCalledWith(
      [],
      snapshotManager,
    );
  });

  it('keeps zero-value positions with zero allocation and a stable security tie-break', async () => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [
        holding({
          securityId: SECURITY_B,
          institutionValue: {
            amount: '0',
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          },
        }),
        holding({
          securityId: SECURITY_A,
          institutionValue: {
            amount: '0',
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          },
        }),
      ],
      query: { latestOnly: true },
    });

    const result = await service.visualize(USER_ID);

    expect(result.totalValueUsd.amount).toBe('0');
    expect(
      result.positions.map((position) => ({
        securityId: position.securityId,
        allocationBps: position.allocationBps,
      })),
    ).toEqual([
      { securityId: SECURITY_A, allocationBps: 0 },
      { securityId: SECURITY_B, allocationBps: 0 },
    ]);
  });

  it.each([
    ['missing value', { institutionValue: null }],
    ['missing currency', { currency: null }],
    [
      'negative exposure',
      {
        institutionValue: {
          amount: '10',
          currency: 'USD',
          sign: MoneySign.NEGATIVE,
        },
      },
    ],
    [
      'unsafe range',
      {
        institutionValue: {
          amount: Number.MAX_SAFE_INTEGER,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
      },
    ],
  ])('fails atomically for %s', async (_label, overrides) => {
    mcpReadService.listInvestmentHoldings.mockResolvedValue({
      data: [holding(overrides as Partial<McpInvestmentHolding>)],
      query: { latestOnly: true },
    });

    await expect(service.visualize(USER_ID)).rejects.toEqual(
      expect.objectContaining({
        constructor: McpPublicError,
        message: 'Portfolio values are temporarily unavailable.',
      }),
    );
  });

  it.each([
    ['missing', new Map()],
    [
      'invalid',
      new Map([
        [
          'EUR:USD:2026-08-15',
          { ratio: { numerator: 'invalid', denominator: '1' } },
        ],
      ]),
    ],
  ])(
    'fails the entire portfolio when a historical rate is %s',
    async (_label, rates) => {
      mcpReadService.listInvestmentHoldings.mockResolvedValue({
        data: [
          holding({
            institutionValue: {
              amount: '100',
              currency: 'EUR',
              sign: MoneySign.POSITIVE,
            },
            currency: 'EUR',
          }),
        ],
        query: { latestOnly: true },
      });
      currencyConversionService.getResolvedRates.mockResolvedValue(rates);

      await expect(service.visualize(USER_ID)).rejects.toThrow(
        'Portfolio values are temporarily unavailable.',
      );
    },
  );

  it('propagates the ownership denial before any FX lookup', async () => {
    const ownershipError = new Error('Unauthorized account selection.');
    mcpReadService.listInvestmentHoldings.mockRejectedValue(ownershipError);

    await expect(service.visualize(USER_ID, [ACCOUNT_B])).rejects.toBe(
      ownershipError,
    );
    expect(currencyConversionService.getResolvedRates).not.toHaveBeenCalled();
  });
});
