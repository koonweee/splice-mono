import { MarketPriceService } from '../../src/market-price/market-price.service';
import type { MarketPriceProvider } from '../../src/market-price/market-price-provider.interface';
import type { MarketPriceQuote } from '../../src/types/MarketPrice';

const userId = '11111111-1111-1111-1111-111111111111';
const appleQuote: MarketPriceQuote = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  quoteType: 'EQUITY',
  exchangeCode: 'NMS',
  exchangeName: 'NasdaqGS',
  currency: 'USD',
  marketIdentifierCode: 'XNAS',
  price: '200.5',
  priceAsOf: '2026-08-14',
  priceDatetime: '2026-08-14T20:00:00.000Z',
};

describe('MarketPriceService', () => {
  const provider: jest.Mocked<MarketPriceProvider> = {
    search: jest.fn(),
    getQuotes: jest.fn(),
  };
  const securityRepository = { find: jest.fn() };
  const service = new MarketPriceService(provider, securityRepository as never);

  beforeEach(() => jest.clearAllMocks());

  it('deduplicates and canonicalizes symbols before one provider batch', async () => {
    provider.getQuotes.mockResolvedValue(new Map([['AAPL', appleQuote]]));

    const result = await service.resolveQuotes(userId, [' aapl ', 'AAPL']);

    expect(provider.getQuotes).toHaveBeenCalledWith(['AAPL']);
    expect(securityRepository.find).not.toHaveBeenCalled();
    expect(result.quotes.get('AAPL')).toEqual(appleQuote);
    expect(result.staleSymbols).toEqual([]);
  });

  it('uses a valid last-good cached quote and marks it stale on failure', async () => {
    provider.getQuotes.mockRejectedValue(new Error('429 Too Many Requests'));
    securityRepository.find.mockResolvedValue([
      {
        externalSecurityId: 'C6L.SI',
        name: 'Singapore Airlines Limited',
        type: 'EQUITY',
        closePrice: '7.05',
        closePriceAsOf: '2026-08-14',
        updateDatetime: '2026-08-14T09:00:00.000Z',
        isoCurrencyCode: 'SGD',
        institutionId: 'SES',
        institutionSecurityId: 'SES',
        marketIdentifierCode: 'XSES',
      },
    ]);

    const result = await service.resolveQuotes(userId, ['C6L.SI']);

    expect(result.staleSymbols).toEqual(['C6L.SI']);
    expect(result.missingSymbols).toEqual([]);
    expect(result.quotes.get('C6L.SI')?.currency).toBe('SGD');
  });

  it('reports never-priced symbols as missing without inventing zero prices', async () => {
    provider.getQuotes.mockResolvedValue(new Map());
    securityRepository.find.mockResolvedValue([]);

    const result = await service.resolveQuotes(userId, ['UNKNOWN']);

    expect(result.missingSymbols).toEqual(['UNKNOWN']);
    expect(result.quotes.size).toBe(0);
  });

  it.each(['0', '-1', 'not-a-decimal'])(
    'rejects invalid fresh price %s and falls back to valid cache',
    async (price) => {
      provider.getQuotes.mockResolvedValue(
        new Map([['AAPL', { ...appleQuote, price }]]) as any,
      );
      securityRepository.find.mockResolvedValue([
        {
          externalSecurityId: 'AAPL',
          name: 'Apple Inc.',
          type: 'EQUITY',
          closePrice: '199.25',
          closePriceAsOf: '2026-08-13',
          updateDatetime: '2026-08-13T20:00:00.000Z',
          isoCurrencyCode: 'USD',
          institutionId: 'NMS',
          institutionSecurityId: 'NasdaqGS',
          marketIdentifierCode: 'XNAS',
        },
      ]);

      const result = await service.resolveQuotes(userId, ['AAPL']);

      expect(result.staleSymbols).toEqual(['AAPL']);
      expect(result.quotes.get('AAPL')?.price).toBe('199.25');
      expect(result.missingSymbols).toEqual([]);
    },
  );

  it('leaves a symbol missing when both fresh and cached data are malformed', async () => {
    provider.getQuotes.mockResolvedValue(
      new Map([
        ['AAPL', { ...appleQuote, exchangeCode: '', price: 'NaN' }],
      ]) as any,
    );
    securityRepository.find.mockResolvedValue([
      {
        externalSecurityId: 'AAPL',
        name: 'Apple Inc.',
        type: 'EQUITY',
        closePrice: '-12',
        closePriceAsOf: 'not-a-date',
        updateDatetime: 'not-a-datetime',
        isoCurrencyCode: 'USD',
        institutionId: '',
        institutionSecurityId: '',
        marketIdentifierCode: 'XNAS',
      },
    ]);

    const result = await service.resolveQuotes(userId, ['AAPL']);

    expect(result.quotes.size).toBe(0);
    expect(result.staleSymbols).toEqual([]);
    expect(result.missingSymbols).toEqual(['AAPL']);
  });

  it.each(['0', '-2.5', 'not-a-decimal'])(
    'does not use invalid cached price %s',
    async (closePrice) => {
      provider.getQuotes.mockResolvedValue(new Map());
      securityRepository.find.mockResolvedValue([
        {
          externalSecurityId: 'AAPL',
          name: 'Apple Inc.',
          type: 'EQUITY',
          closePrice,
          closePriceAsOf: '2026-08-13',
          updateDatetime: '2026-08-13T20:00:00.000Z',
          isoCurrencyCode: 'USD',
          institutionId: 'NMS',
          institutionSecurityId: 'NasdaqGS',
          marketIdentifierCode: 'XNAS',
        },
      ]);

      const result = await service.resolveQuotes(userId, ['AAPL']);

      expect(result.quotes.size).toBe(0);
      expect(result.staleSymbols).toEqual([]);
      expect(result.missingSymbols).toEqual(['AAPL']);
    },
  );
});
