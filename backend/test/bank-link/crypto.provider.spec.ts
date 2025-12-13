import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TatumService } from '../../src/common/tatum.service';
import { CryptoProvider } from '../../src/bank-link/providers/crypto/crypto.provider';
import { CryptoAccountType } from '../../src/types/AccountType';
import { mockTatumService } from '../mocks/common/tatum.service.mock';

describe('CryptoProvider', () => {
  let provider: CryptoProvider;
  let tatumService: typeof mockTatumService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoProvider,
        {
          provide: TatumService,
          useValue: mockTatumService,
        },
      ],
    }).compile();

    provider = module.get<CryptoProvider>(CryptoProvider);
    tatumService = module.get(TatumService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('providerName', () => {
    it('should be crypto', () => {
      expect(provider.providerName).toBe('crypto');
    });
  });

  describe('initiateLinking', () => {
    const validEthAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    const validBtcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

    it('should link an Ethereum wallet successfully', async () => {
      tatumService.validateAddress.mockReturnValue(true);
      tatumService.getEthereumBalance.mockResolvedValue('2.5');

      const result = await provider.initiateLinking({
        userId: 'user-123',
        providerUserDetails: {
          walletAddress: validEthAddress,
          network: 'ethereum',
        },
      });

      expect(tatumService.validateAddress).toHaveBeenCalledWith(
        'ethereum',
        validEthAddress,
      );
      expect(tatumService.getEthereumBalance).toHaveBeenCalledWith(
        validEthAddress,
      );
      expect(result.immediateAccounts).toHaveLength(1);
      expect(result.immediateAccounts![0].accounts[0]).toMatchObject({
        accountId: `ethereum:${validEthAddress}`,
        name: 'Ethereum Wallet',
        mask: validEthAddress.slice(-4),
        type: CryptoAccountType.CRYPTO_WALLET,
      });
      expect(result.immediateAccounts![0].institution).toEqual({
        id: 'ethereum',
        name: 'Ethereum Wallet',
      });
    });

    it('should link a Bitcoin wallet successfully', async () => {
      tatumService.validateAddress.mockReturnValue(true);
      tatumService.getBitcoinBalance.mockResolvedValue('0.5');

      const result = await provider.initiateLinking({
        userId: 'user-123',
        providerUserDetails: {
          walletAddress: validBtcAddress,
          network: 'bitcoin',
        },
      });

      expect(tatumService.validateAddress).toHaveBeenCalledWith(
        'bitcoin',
        validBtcAddress,
      );
      expect(tatumService.getBitcoinBalance).toHaveBeenCalledWith(
        validBtcAddress,
      );
      expect(result.immediateAccounts).toHaveLength(1);
      expect(result.immediateAccounts![0].accounts[0]).toMatchObject({
        accountId: `bitcoin:${validBtcAddress}`,
        name: 'Bitcoin Wallet',
        type: CryptoAccountType.CRYPTO_WALLET,
      });
    });

    it('should throw BadRequestException for missing walletAddress', async () => {
      await expect(
        provider.initiateLinking({
          userId: 'user-123',
          providerUserDetails: {
            network: 'ethereum',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing network', async () => {
      await expect(
        provider.initiateLinking({
          userId: 'user-123',
          providerUserDetails: {
            walletAddress: validEthAddress,
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid address format', async () => {
      tatumService.validateAddress.mockReturnValue(false);

      await expect(
        provider.initiateLinking({
          userId: 'user-123',
          providerUserDetails: {
            walletAddress: 'invalid-address',
            network: 'ethereum',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAccounts', () => {
    const validEthAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

    it('should fetch accounts for a linked wallet', async () => {
      tatumService.getEthereumBalance.mockResolvedValue('3.0');

      const result = await provider.getAccounts({
        address: validEthAddress,
        network: 'ethereum',
      });

      expect(tatumService.getEthereumBalance).toHaveBeenCalledWith(
        validEthAddress,
      );
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].accountId).toBe(`ethereum:${validEthAddress}`);
      expect(result.institution).toEqual({
        id: 'ethereum',
        name: 'Ethereum Wallet',
      });
    });

    it('should throw Error for invalid authentication', async () => {
      await expect(
        provider.getAccounts({
          address: validEthAddress,
          // missing network
        }),
      ).rejects.toThrow('Invalid crypto authentication');
    });
  });

  describe('verifyWebhook', () => {
    it('should always return false (no webhook support)', async () => {
      const result = await provider.verifyWebhook('', {}, {});
      expect(result).toBe(false);
    });
  });
});
