import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CryptoExchangeRateService } from '../../src/crypto/crypto-exchange-rate.service';
import { ExchangeRateBackfillHelper } from '../../src/exchange-rate/exchange-rate-backfill.helper';
import { ExchangeRateEntity } from '../../src/exchange-rate/exchange-rate.entity';
import { SnapshotExchangeRateService } from '../../src/exchange-rate/snapshot-exchange-rate.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserEntity } from '../../src/user/user.entity';
import { mockCryptoExchangeRateService } from '../mocks/crypto/crypto-exchange-rate.service.mock';

describe('SnapshotExchangeRateService', () => {
  let service: SnapshotExchangeRateService;
  let exchangeRateRepository: any;
  let userRepository: any;
  let backfillHelper: any;
  let cryptoService: typeof mockCryptoExchangeRateService;

  const mockUserId = 'user-uuid-123';
  const mockSnapshotDate = '2024-01-15';

  const createMockSnapshot = (currency: string) => ({
    id: 'snapshot-id-123',
    userId: mockUserId,
    accountId: 'account-id-123',
    snapshotDate: mockSnapshotDate,
    currentBalance: {
      money: { currency, amount: 100000 },
      sign: MoneySign.POSITIVE,
    },
    availableBalance: {
      money: { currency, amount: 95000 },
      sign: MoneySign.POSITIVE,
    },
    snapshotType: BalanceSnapshotType.SYNC,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    exchangeRateRepository = {
      findOne: jest.fn(),
    };

    userRepository = {
      findOne: jest.fn(),
    };

    backfillHelper = {
      fetchExchangeRates: jest.fn(),
      upsertRate: jest.fn(),
    };

    cryptoService = {
      getRate: jest.fn().mockResolvedValue(2500),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnapshotExchangeRateService,
        {
          provide: getRepositoryToken(ExchangeRateEntity),
          useValue: exchangeRateRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: userRepository,
        },
        {
          provide: ExchangeRateBackfillHelper,
          useValue: backfillHelper,
        },
        {
          provide: CryptoExchangeRateService,
          useValue: cryptoService,
        },
      ],
    }).compile();

    service = module.get<SnapshotExchangeRateService>(
      SnapshotExchangeRateService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureRateForSnapshot', () => {
    it('should skip when user not found', async () => {
      const snapshot = createMockSnapshot('EUR');
      userRepository.findOne.mockResolvedValue(null);

      await service.ensureRateForSnapshot(snapshot);

      expect(backfillHelper.fetchExchangeRates).not.toHaveBeenCalled();
      expect(cryptoService.getRate).not.toHaveBeenCalled();
    });

    it('should skip when snapshot currency matches user currency', async () => {
      const snapshot = createMockSnapshot('USD');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      await service.ensureRateForSnapshot(snapshot);

      expect(exchangeRateRepository.findOne).not.toHaveBeenCalled();
      expect(backfillHelper.fetchExchangeRates).not.toHaveBeenCalled();
    });

    it('should skip when rate already exists', async () => {
      const snapshot = createMockSnapshot('EUR');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });
      exchangeRateRepository.findOne.mockResolvedValue({
        id: 'existing-rate-id',
      });

      await service.ensureRateForSnapshot(snapshot);

      expect(backfillHelper.fetchExchangeRates).not.toHaveBeenCalled();
    });

    it('should fetch and store fiat rate when currencies differ', async () => {
      const snapshot = createMockSnapshot('EUR');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });
      exchangeRateRepository.findOne.mockResolvedValue(null);
      backfillHelper.fetchExchangeRates.mockResolvedValue(
        new Map([['USD', 1.08]]),
      );

      await service.ensureRateForSnapshot(snapshot);

      expect(backfillHelper.fetchExchangeRates).toHaveBeenCalledWith('EUR', [
        'USD',
      ]);
      expect(backfillHelper.upsertRate).toHaveBeenCalledWith({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: mockSnapshotDate,
      });
    });

    it('should fetch and store crypto rate for ETH', async () => {
      const snapshot = createMockSnapshot('ETH');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });
      exchangeRateRepository.findOne.mockResolvedValue(null);
      cryptoService.getRate.mockResolvedValue(2500);

      await service.ensureRateForSnapshot(snapshot);

      expect(cryptoService.getRate).toHaveBeenCalledWith('ETH', 'USD');
      expect(backfillHelper.upsertRate).toHaveBeenCalledWith({
        baseCurrency: 'ETH',
        targetCurrency: 'USD',
        rate: 2500,
        rateDate: mockSnapshotDate,
      });
    });

    it('should fetch and store crypto rate for BTC', async () => {
      const snapshot = createMockSnapshot('BTC');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });
      exchangeRateRepository.findOne.mockResolvedValue(null);
      cryptoService.getRate.mockResolvedValue(45000);

      await service.ensureRateForSnapshot(snapshot);

      expect(cryptoService.getRate).toHaveBeenCalledWith('BTC', 'USD');
      expect(backfillHelper.upsertRate).toHaveBeenCalledWith({
        baseCurrency: 'BTC',
        targetCurrency: 'USD',
        rate: 45000,
        rateDate: mockSnapshotDate,
      });
    });

    it('should handle errors gracefully (fire-and-forget)', async () => {
      const snapshot = createMockSnapshot('EUR');
      userRepository.findOne.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(
        service.ensureRateForSnapshot(snapshot),
      ).resolves.not.toThrow();
    });

    it('should not store rate when Frankfurter API returns no rate', async () => {
      const snapshot = createMockSnapshot('XYZ');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });
      exchangeRateRepository.findOne.mockResolvedValue(null);
      backfillHelper.fetchExchangeRates.mockResolvedValue(new Map());

      await service.ensureRateForSnapshot(snapshot);

      expect(backfillHelper.upsertRate).not.toHaveBeenCalled();
    });

    it('should not store rate when CoinGecko returns zero', async () => {
      const snapshot = createMockSnapshot('ETH');
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });
      exchangeRateRepository.findOne.mockResolvedValue(null);
      cryptoService.getRate.mockResolvedValue(0);

      await service.ensureRateForSnapshot(snapshot);

      expect(backfillHelper.upsertRate).not.toHaveBeenCalled();
    });
  });
});
