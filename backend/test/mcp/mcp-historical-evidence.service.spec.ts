import { McpHistoricalEvidenceService } from '../../src/mcp/mcp-historical-evidence.service';
import { InvestmentSecurityEntity } from '../../src/investment/investment-security.entity';
import { HistoricalValuationEvidenceOutputSchema } from '../../src/mcp/mcp-schemas';
import { decimalRateRatio } from '../../src/common/exact-money';
import { fxRequestKey } from '../../src/currency-exchange/currency-exchange.service';

const securityId = '10000000-0000-4000-8000-000000000001';
const options = {
  securityIds: [securityId],
  startDate: '2026-09-01',
  endDate: '2026-09-05',
  reportingCurrency: 'USD',
};
const security = {
  id: securityId,
  userId: 'owner',
  provider: 'yahoo',
  externalSecurityId: 'SYN',
  tickerSymbol: 'SYN',
  isin: null,
  cusip: null,
  sedol: null,
  marketIdentifierCode: 'XNAS',
};
const history = {
  symbol: 'SYN',
  currency: 'EUR',
  exchange: 'NMS',
  exchangeTimezone: 'America/New_York',
  corporateActionsPresent: false,
  prices: [
    {
      date: '2026-09-01',
      priceDatetime: '2026-09-01T13:30:00Z',
      close: '10',
      adjustedClose: '9',
    },
    {
      date: '2026-09-04',
      priceDatetime: '2026-09-04T13:30:00Z',
      close: '12',
      adjustedClose: '11',
    },
  ],
};

describe('MCP bounded historical price/FX evidence', () => {
  const query = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const securities = { find: jest.fn().mockResolvedValue([security]) };
  const manager = {
    getRepository: jest.fn((entity) =>
      entity === InvestmentSecurityEntity
        ? securities
        : { createQueryBuilder: () => query },
    ),
  };
  const database = { transaction: jest.fn((_level, read) => read(manager)) };
  const provider = {
    search: jest.fn(),
    getQuotes: jest.fn(),
    getHistoricalPrices: jest.fn(),
  };
  const fx = { resolveRequests: jest.fn() };
  let service: McpHistoricalEvidenceService;
  beforeEach(() => {
    jest.clearAllMocks();
    securities.find.mockResolvedValue([security]);
    query.getMany.mockResolvedValue([]);
    provider.getHistoricalPrices.mockResolvedValue(history);
    fx.resolveRequests.mockImplementation(
      async (requests) =>
        new Map(
          requests.map((request) => [
            fxRequestKey(request),
            {
              ...request,
              rate: '1.1',
              ratio: decimalRateRatio('1.1'),
              rateDate: '2026-08-31',
              source: 'FORWARD_FILLED',
            },
          ]),
        ),
    );
    service = new McpHistoricalEvidenceService(
      database as never,
      fx as never,
      provider,
    );
  });
  it('returns exact-date and past-only price endpoints with separate actual FX dates and price bases', async () => {
    const result = HistoricalValuationEvidenceOutputSchema.parse(
      await service.read('owner', options),
    );
    expect(securities.find.mock.calls[0][0].where.userId).toBe('owner');
    expect(result.data[0].mapping).toBe('stored_yahoo_identity');
    expect(result.data[0].endpoints.opening).toMatchObject({
      status: 'available',
      carriedForward: false,
      price: { price: '10', adjustedClose: '9' },
    });
    expect(result.data[0].endpoints.closing).toMatchObject({
      status: 'available',
      carriedForward: true,
      price: { priceDate: '2026-09-04' },
    });
    expect(
      result.fx.find((rate) => rate.requestedDate === options.endDate)
        ?.evidence,
    ).toMatchObject({ rateDate: '2026-08-31', source: 'FORWARD_FILLED' });
    expect(result.basis).toBe('historical_valuation_evidence');
    expect(result.data[0].priceBasis).toBe(
      'provider_close_adjustment_unverified',
    );
    expect(result).not.toHaveProperty('marketPnl');
  });
  it('distinguishes empty, provider error, missing opening quote, and missing FX', async () => {
    provider.getHistoricalPrices.mockResolvedValueOnce({
      ...history,
      prices: [],
    });
    expect((await service.read('owner', options)).data[0]).toMatchObject({
      providerStatus: 'empty',
      endpoints: { opening: { status: 'missing' } },
    });
    provider.getHistoricalPrices.mockRejectedValueOnce(
      new Error('provider failure'),
    );
    expect((await service.read('owner', options)).data[0].providerStatus).toBe(
      'error',
    );
    provider.getHistoricalPrices.mockResolvedValueOnce({
      ...history,
      prices: history.prices.slice(1),
    });
    fx.resolveRequests.mockResolvedValueOnce(new Map());
    const missing = await service.read('owner', options);
    expect(missing.data[0].endpoints.opening).toMatchObject({
      status: 'missing',
      price: null,
    });
    expect(missing.data[0].endpoints.closing.status).toBe('available');
    expect(
      missing.fx.every(
        (rate) => rate.status === 'missing' && rate.evidence === null,
      ),
    ).toBe(true);
    expect(fx.resolveRequests).toHaveBeenLastCalledWith(
      expect.any(Array),
      undefined,
      { allowMissing: true },
    );
  });
  it('never guesses a ticker mapping and exposes conflicting stored institution evidence', async () => {
    securities.find.mockResolvedValueOnce([{ ...security, provider: 'plaid' }]);
    const holding = {
      id: '20000000-0000-4000-8000-000000000001',
      securityId,
      snapshotDate: '2026-09-01',
      institutionPriceAsOf: '2026-09-01',
      institutionPrice: '10',
      institutionPriceDatetime: null,
      isoCurrencyCode: 'EUR',
      unofficialCurrencyCode: null,
    };
    query.getMany.mockResolvedValueOnce([
      holding,
      { ...holding, institutionPrice: '11' },
    ] as never);
    const result = await service.read('owner', options);
    expect(provider.getHistoricalPrices).not.toHaveBeenCalled();
    expect(result.data[0]).toMatchObject({
      mapping: 'unmapped',
      proxy: null,
      providerStatus: 'unmapped',
      endpoints: { opening: { status: 'ambiguous', price: null } },
    });
    expect(result.data[0].storedPrices).toHaveLength(2);
  });
  it('reports unavailable capability, preserves stored evidence after provider failure, and rejects cross-owner/bounds', async () => {
    const unavailable = new McpHistoricalEvidenceService(
      database as never,
      fx as never,
    );
    expect(
      (await unavailable.read('owner', options)).data[0].providerStatus,
    ).toBe('unavailable');
    securities.find.mockResolvedValueOnce([]);
    await expect(service.read('other', options)).rejects.toThrow(
      'securities were not found',
    );
    await expect(
      service.read('owner', { ...options, endDate: '2027-09-05' }),
    ).rejects.toThrow('366 days');
    await expect(
      service.read('owner', { ...options, securityIds: [] }),
    ).rejects.toThrow('1 and 20');
    expect(provider.getHistoricalPrices).not.toHaveBeenCalled();
  });
});
