import { YahooFinanceMarketPriceProvider } from '../../src/market-price/yahoo-finance-market-price.provider';

describe('YahooFinanceMarketPriceProvider', () => {
  let provider: YahooFinanceMarketPriceProvider;
  const client = { search: jest.fn(), quote: jest.fn(), chart: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new YahooFinanceMarketPriceProvider();
    (provider as any).client = client;
  });

  it('uses exchange-local daily dates, inclusive bounds, and separate adjusted close evidence', async () => {
    client.chart.mockResolvedValue({
      meta: {
        symbol: 'SYN',
        currency: 'USD',
        exchangeName: 'NZ',
        exchangeTimezoneName: 'Pacific/Auckland',
      },
      events: { splits: [{ date: new Date(), numerator: 2, denominator: 1 }] },
      quotes: [
        { date: new Date('2026-08-31T21:00:00Z'), close: 10, adjclose: 9 },
        { date: new Date('2026-09-05T21:00:00Z'), close: 11, adjclose: 10 },
        { date: new Date('2026-09-02T21:00:00Z'), close: null },
      ],
    });
    const result = await provider.getHistoricalPrices(
      'SYN',
      '2026-09-01',
      '2026-09-05',
    );
    expect(result.prices).toEqual([
      {
        date: '2026-09-01',
        priceDatetime: '2026-08-31T21:00:00.000Z',
        close: '10',
        adjustedClose: '9',
      },
    ]);
    expect(result.corporateActionsPresent).toBe(true);
    expect(client.chart.mock.calls[0][1]).toMatchObject({
      period1: new Date('2026-08-31T00:00:00Z'),
      period2: new Date('2026-09-07T00:00:00Z'),
    });
    client.chart.mockResolvedValueOnce({
      meta: { symbol: 'OTHER', currency: 'USD' },
      quotes: [],
    });
    await expect(
      provider.getHistoricalPrices('SYN', '2026-09-01', '2026-09-05'),
    ).rejects.toThrow('different symbol');
    await expect(
      provider.getHistoricalPrices('SYN', '2020-01-01', '2026-09-05'),
    ).rejects.toThrow('366 days');
  });

  it('normalizes US equity, ETF, and Singapore equity quotes', async () => {
    client.quote.mockResolvedValue([
      {
        symbol: 'AAPL',
        quoteType: 'EQUITY',
        regularMarketPrice: 200.5,
        regularMarketTime: new Date('2026-08-14T20:00:00Z'),
        currency: 'USD',
        exchange: 'NMS',
        fullExchangeName: 'NasdaqGS',
        longName: 'Apple Inc.',
      },
      {
        symbol: 'VOO',
        quoteType: 'ETF',
        regularMarketPrice: 600,
        regularMarketTime: new Date('2026-08-14T20:00:00Z'),
        currency: 'USD',
        exchange: 'NYQ',
        fullExchangeName: 'NYSEArca',
        shortName: 'Vanguard S&P 500 ETF',
      },
      {
        symbol: 'C6L.SI',
        quoteType: 'EQUITY',
        regularMarketPrice: 7.05,
        regularMarketTime: new Date('2026-08-14T09:00:00Z'),
        currency: 'SGD',
        exchange: 'SES',
        fullExchangeName: 'SES',
        longName: 'Singapore Airlines Limited',
      },
    ]);

    const result = await provider.getQuotes(['AAPL', 'VOO', 'C6L.SI']);

    expect(result.get('AAPL')?.marketIdentifierCode).toBe('XNAS');
    expect(result.get('VOO')?.quoteType).toBe('ETF');
    expect(result.get('C6L.SI')).toMatchObject({
      currency: 'SGD',
      marketIdentifierCode: 'XSES',
      price: '7.05',
    });
  });

  it('drops unsupported types and malformed or missing prices', async () => {
    client.quote.mockResolvedValue([
      {
        symbol: 'BTC-USD',
        quoteType: 'CRYPTOCURRENCY',
        regularMarketPrice: 1,
        regularMarketTime: new Date(),
        currency: 'USD',
        exchange: 'CCC',
      },
      {
        symbol: 'BROKEN',
        quoteType: 'EQUITY',
        currency: 'USD',
        exchange: 'NMS',
      },
    ]);

    await expect(provider.getQuotes(['BTC-USD', 'BROKEN'])).resolves.toEqual(
      new Map(),
    );
  });

  it('rejects non-ISO Yahoo quote units such as GBp instead of treating them as GBP', async () => {
    client.quote.mockResolvedValue([
      {
        symbol: 'LLOY.L',
        quoteType: 'EQUITY',
        regularMarketPrice: 80,
        regularMarketTime: new Date('2026-08-14T16:30:00Z'),
        currency: 'GBp',
        exchange: 'LSE',
        fullExchangeName: 'LSE',
        longName: 'Lloyds Banking Group plc',
      },
    ]);

    await expect(provider.getQuotes(['LLOY.L'])).resolves.toEqual(new Map());
  });

  it.each([
    new Error('401 Unauthorized'),
    new Error('429 Too Many Requests'),
    new DOMException('Timed out', 'TimeoutError'),
  ])('propagates upstream failures for cache fallback (%s)', async (error) => {
    client.quote.mockRejectedValue(error);
    await expect(provider.getQuotes(['AAPL'])).rejects.toBe(error);
  });
});
