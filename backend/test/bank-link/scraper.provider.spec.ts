import { Test, TestingModule } from '@nestjs/testing';
import type { Browser, Page } from 'playwright';
import { ScraperProvider } from '../../src/bank-link/providers/scraper/scraper.provider';
import type { ScraperStrategy } from '../../src/bank-link/providers/scraper/strategies/scraper-strategy.interface';

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

describe('ScraperProvider', () => {
  let provider: ScraperProvider;
  const { chromium } = require('playwright');

  const mockStrategy: ScraperStrategy = {
    name: 'dbs',
    startUrl: 'https://example.com/dbs',
    institution: { id: 'dbs', name: 'DBS Bank' },
    scrape: jest.fn(),
  };

  const mockPage = {
    goto: jest.fn(),
    waitForLoadState: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<Page>;

  const mockBrowser = {
    newPage: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<Browser>;

  beforeEach(async () => {
    jest.clearAllMocks();

    chromium.launch.mockResolvedValue(mockBrowser);
    mockBrowser.newPage.mockResolvedValue(mockPage);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScraperProvider,
        {
          provide: 'SCRAPER_STRATEGIES',
          useValue: [mockStrategy],
        },
      ],
    }).compile();

    module.useLogger(false);

    provider = module.get<ScraperProvider>(ScraperProvider);
  });

  describe('getAccounts', () => {
    it('should fetch accounts using the scraper strategy', async () => {
      (mockStrategy.scrape as jest.Mock).mockResolvedValue({
        accounts: [
          {
            accountId: 'scraper:dbs:DBS Savings',
            name: 'DBS Savings',
            mask: null,
            type: 'depository',
            subType: null,
            availableBalance: {
              money: { currency: 'SGD', amount: 12345 },
              sign: 'positive',
            },
            currentBalance: {
              money: { currency: 'SGD', amount: 12345 },
              sign: 'positive',
            },
          },
        ],
      });

      const result = await provider.getAccounts({
        bankId: 'dbs',
        username: 'user',
        password: 'pass',
      });

      expect(chromium.launch).toHaveBeenCalled();
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com/dbs');
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].accountId).toBe('scraper:dbs:DBS Savings');
      expect(result.accounts[0].name).toBe('DBS Savings');
      expect(result.institution).toEqual({ id: 'dbs', name: 'DBS Bank' });
    });

    it('should throw for invalid authentication payload', async () => {
      await expect(
        provider.getAccounts({
          username: 'user',
          password: 'pass',
        }),
      ).rejects.toThrow('Invalid scraper authentication');
    });

    it('should throw when no strategy is registered', async () => {
      await expect(
        provider.getAccounts({
          bankId: 'unknown',
          username: 'user',
          password: 'pass',
        }),
      ).rejects.toThrow('No scraper strategy found for bankId: unknown');
    });
  });

  describe('initiateLinking', () => {
    it('should return immediate accounts using default credentials', async () => {
      (mockStrategy.scrape as jest.Mock).mockResolvedValue({
        accounts: [
          {
            accountId: 'scraper:dbs:DBS Savings',
            name: 'DBS Savings',
            mask: null,
            type: 'depository',
            subType: null,
            availableBalance: {
              money: { currency: 'SGD', amount: 12345 },
              sign: 'positive',
            },
            currentBalance: {
              money: { currency: 'SGD', amount: 12345 },
              sign: 'positive',
            },
          },
        ],
        institution: { id: 'dbs', name: 'DBS Bank' },
      });

      const result = await provider.initiateLinking({
        userId: 'user-123',
      });

      expect(result.immediateAccounts).toHaveLength(1);
      expect(result.immediateAccounts![0].authentication).toEqual({
        bankId: 'dbs',
        username: 'user',
        password: 'pass',
      });
      expect(result.immediateAccounts![0].accounts).toHaveLength(1);
      expect(result.immediateAccounts![0].institution).toEqual({
        id: 'dbs',
        name: 'DBS Bank',
      });
    });
  });

  describe('verifyWebhook', () => {
    it('should always return false', async () => {
      const result = await provider.verifyWebhook('', {});
      expect(result).toBe(false);
    });
  });
});
