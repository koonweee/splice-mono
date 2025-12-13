import { Test, TestingModule } from '@nestjs/testing';
import { CryptoExchangeRateService } from '../../src/crypto/crypto-exchange-rate.service';
import { CoinGeckoExchangeRateProvider } from '../../src/crypto/providers/coingecko-exchange-rate.provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CryptoExchangeRateService', () => {
  let service: CryptoExchangeRateService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CryptoExchangeRateService, CoinGeckoExchangeRateProvider],
    }).compile();

    service = module.get<CryptoExchangeRateService>(CryptoExchangeRateService);
  });

  describe('getRate', () => {
    it('should fetch ETH to USD rate from CoinGecko', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ethereum: { usd: 2500.5 },
        }),
      });

      const rate = await service.getRate('ETH', 'USD');

      expect(rate).toBe(2500.5);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
      );
    });

    it('should fetch BTC to USD rate from CoinGecko', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bitcoin: { usd: 45000 },
        }),
      });

      const rate = await service.getRate('BTC', 'USD');

      expect(rate).toBe(45000);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      );
    });

    it('should handle lowercase currency input', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ethereum: { usd: 2500 },
        }),
      });

      const rate = await service.getRate('eth', 'usd');

      expect(rate).toBe(2500);
    });

    it('should throw error for unsupported cryptocurrency', async () => {
      await expect(service.getRate('DOGE', 'USD')).rejects.toThrow(
        'Unsupported cryptocurrency: DOGE',
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(service.getRate('ETH', 'USD')).rejects.toThrow(
        'HTTP 429: Rate limit exceeded',
      );
    });

    it('should throw error when rate is missing from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ethereum: {}, // missing usd rate
        }),
      });

      await expect(service.getRate('ETH', 'USD')).rejects.toThrow(
        'No rate found for ETH/USD',
      );
    });

    it('should default to USD if no fiat currency specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ethereum: { usd: 2500 },
        }),
      });

      const rate = await service.getRate('ETH');

      expect(rate).toBe(2500);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('vs_currencies=usd'),
      );
    });
  });
});
