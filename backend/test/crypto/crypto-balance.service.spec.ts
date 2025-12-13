import { Test, TestingModule } from '@nestjs/testing';
import { CryptoBalanceService } from '../../src/crypto/crypto-balance.service';
import { CRYPTO_BALANCE_CONFIG } from '../../src/crypto/crypto.module';
import type { CryptoBalanceConfig } from '../../src/crypto/crypto-balance.config';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('CryptoBalanceService', () => {
  let service: CryptoBalanceService;

  const testConfig: CryptoBalanceConfig = {
    ethereumRpcUrls: [
      'https://rpc1.example.com',
      'https://rpc2.example.com',
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoBalanceService,
        {
          provide: CRYPTO_BALANCE_CONFIG,
          useValue: testConfig,
        },
      ],
    }).compile();

    service = module.get<CryptoBalanceService>(CryptoBalanceService);
  });

  describe('validateAddress', () => {
    describe('ethereum', () => {
      it('should validate a correct Ethereum address', () => {
        expect(
          service.validateAddress(
            'ethereum',
            '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
          ),
        ).toBe(true);
      });

      it('should reject an address without 0x prefix', () => {
        expect(
          service.validateAddress(
            'ethereum',
            '742d35Cc6634C0532925a3b844Bc454e4438f44e',
          ),
        ).toBe(false);
      });

      it('should reject an address with wrong length', () => {
        expect(service.validateAddress('ethereum', '0x742d35Cc6634C0532')).toBe(
          false,
        );
      });

      it('should reject an address with invalid characters', () => {
        expect(
          service.validateAddress(
            'ethereum',
            '0xZZZd35Cc6634C0532925a3b844Bc454e4438f44e',
          ),
        ).toBe(false);
      });
    });

    describe('bitcoin', () => {
      it('should validate a legacy P2PKH address (starts with 1)', () => {
        expect(
          service.validateAddress(
            'bitcoin',
            '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
          ),
        ).toBe(true);
      });

      it('should validate a legacy P2SH address (starts with 3)', () => {
        expect(
          service.validateAddress(
            'bitcoin',
            '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
          ),
        ).toBe(true);
      });

      it('should validate a native SegWit address (starts with bc1)', () => {
        expect(
          service.validateAddress(
            'bitcoin',
            'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          ),
        ).toBe(true);
      });

      it('should reject an invalid bitcoin address', () => {
        expect(service.validateAddress('bitcoin', 'invalid-address')).toBe(
          false,
        );
      });
    });
  });

  describe('getBalance', () => {
    describe('ethereum', () => {
      const validEthAddress = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

      it('should fetch ETH balance and convert wei to ETH', async () => {
        // 1.5 ETH in wei = 1500000000000000000
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: '0x14d1120d7b160000', // 1.5 ETH in hex
          }),
        });

        const balance = await service.getBalance('ethereum', validEthAddress);

        expect(balance).toBe('1.5');
        expect(mockFetch).toHaveBeenCalledWith(
          'https://rpc1.example.com',
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      it('should return 0 for zero balance', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: '0x0',
          }),
        });

        const balance = await service.getBalance('ethereum', validEthAddress);

        expect(balance).toBe('0');
      });

      it('should retry with next RPC URL on failure', async () => {
        // First RPC fails
        mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
        // Second RPC succeeds
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            result: '0xde0b6b3a7640000', // 1 ETH
          }),
        });

        const balance = await service.getBalance('ethereum', validEthAddress);

        expect(balance).toBe('1');
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should throw error when all RPC URLs fail', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
        mockFetch.mockRejectedValueOnce(new Error('Timeout'));

        await expect(
          service.getBalance('ethereum', validEthAddress),
        ).rejects.toThrow();
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('should handle RPC error response', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32602, message: 'Invalid params' },
          }),
        });
        mockFetch.mockRejectedValueOnce(new Error('Fallback failed'));

        await expect(
          service.getBalance('ethereum', validEthAddress),
        ).rejects.toThrow();
      });
    });

    describe('bitcoin', () => {
      const validBtcAddress = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

      it('should fetch BTC balance from mempool.space', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chain_stats: {
              funded_txo_sum: 150000000, // 1.5 BTC in satoshis
              spent_txo_sum: 0,
            },
            mempool_stats: {
              funded_txo_sum: 0,
              spent_txo_sum: 0,
            },
          }),
        });

        const balance = await service.getBalance('bitcoin', validBtcAddress);

        expect(balance).toBe('1.5');
        expect(mockFetch).toHaveBeenCalledWith(
          `https://mempool.space/api/address/${validBtcAddress}`,
        );
      });

      it('should include mempool balance', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            chain_stats: {
              funded_txo_sum: 100000000, // 1 BTC confirmed
              spent_txo_sum: 0,
            },
            mempool_stats: {
              funded_txo_sum: 50000000, // 0.5 BTC unconfirmed
              spent_txo_sum: 0,
            },
          }),
        });

        const balance = await service.getBalance('bitcoin', validBtcAddress);

        expect(balance).toBe('1.5');
      });

      it('should throw error on API failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => 'Invalid address',
        });

        await expect(
          service.getBalance('bitcoin', validBtcAddress),
        ).rejects.toThrow('HTTP 400: Invalid address');
      });
    });
  });
});
