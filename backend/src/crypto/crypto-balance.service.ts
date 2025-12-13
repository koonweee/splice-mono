import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CryptoNetwork } from '../bank-link/providers/crypto/crypto.types';
import { NETWORK_DECIMALS } from '../bank-link/providers/crypto/crypto.types';
import type { CryptoBalanceConfig } from './crypto-balance.config';
import { CRYPTO_BALANCE_CONFIG } from './crypto.module';

/** Bitcoin mempool.space API base URL (hardcoded) */
const BITCOIN_API_URL = 'https://mempool.space/api';

/** Response shape from Ethereum JSON-RPC eth_getBalance */
interface EthRpcResponse {
  jsonrpc: string;
  id: number;
  result?: string;
  error?: { code: number; message: string };
}

/** Response shape from mempool.space address endpoint */
interface MempoolAddressResponse {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
  mempool_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
  };
}

@Injectable()
export class CryptoBalanceService {
  private readonly logger = new Logger(CryptoBalanceService.name);

  constructor(
    @Inject(CRYPTO_BALANCE_CONFIG)
    private readonly config: CryptoBalanceConfig,
  ) {}

  /**
   * Get balance for an address on a given network
   * Tries multiple RPC URLs sequentially on failure for Ethereum
   * @param network - The cryptocurrency network (ethereum or bitcoin)
   * @param address - The wallet address
   * @returns Balance as a string in native units (ETH, not wei; BTC, not satoshis)
   * @throws Error if all URLs fail or the request fails
   */
  async getBalance(network: CryptoNetwork, address: string): Promise<string> {
    if (network === 'ethereum') {
      return this.getEthereumBalance(address);
    } else {
      return this.getBitcoinBalance(address);
    }
  }

  /**
   * Validate a cryptocurrency address format using regex
   * @param network - The cryptocurrency network
   * @param address - The wallet address to validate
   * @returns true if the address format is valid
   */
  validateAddress(network: CryptoNetwork, address: string): boolean {
    if (network === 'ethereum') {
      // Ethereum: 0x followed by 40 hex characters
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    } else if (network === 'bitcoin') {
      // Bitcoin: Legacy (1 or 3) or SegWit (bc1)
      return (
        /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) ||
        /^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/.test(address)
      );
    }
    return false;
  }

  /**
   * Fetch Ethereum balance via JSON-RPC
   * Tries each configured RPC URL sequentially until one succeeds
   */
  private async getEthereumBalance(address: string): Promise<string> {
    const urls = this.config.ethereumRpcUrls;
    let lastError: Error | null = null;

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as EthRpcResponse;

        if (data.error) {
          throw new Error(data.error.message);
        }

        // Convert wei to ETH using BigInt for precision
        const balanceWei = BigInt(data.result ?? '0');
        return this.weiToEth(balanceWei);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          { url, error: lastError.message, address: address.slice(0, 10) },
          'Ethereum RPC request failed, trying next',
        );
      }
    }

    this.logger.error(
      { address: address.slice(0, 10), error: lastError?.message },
      'All Ethereum RPC URLs failed',
    );
    throw lastError ?? new Error('All Ethereum RPC URLs failed');
  }

  /**
   * Fetch Bitcoin balance via mempool.space API
   */
  private async getBitcoinBalance(address: string): Promise<string> {
    const url = `${BITCOIN_API_URL}/address/${address}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as MempoolAddressResponse;

      // Calculate balance in satoshis (confirmed + unconfirmed)
      const chainBalance =
        data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
      const mempoolBalance =
        data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;
      const totalSatoshis = chainBalance + mempoolBalance;

      // Convert satoshis to BTC
      return this.satoshisToBtc(totalSatoshis);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        { address: address.slice(0, 10), error: errorMessage },
        'Bitcoin API request failed',
      );
      throw error;
    }
  }

  /**
   * Convert wei (BigInt) to ETH string with full precision
   */
  private weiToEth(wei: bigint): string {
    const decimals = NETWORK_DECIMALS.ethereum;
    const divisor = BigInt(10 ** decimals);
    const wholePart = wei / divisor;
    const fractionalPart = wei % divisor;

    if (fractionalPart === 0n) {
      return wholePart.toString();
    }

    // Pad fractional part to full precision, then trim trailing zeros
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmed = fractionalStr.replace(/0+$/, '');
    return `${wholePart}.${trimmed}`;
  }

  /**
   * Convert satoshis to BTC string
   */
  private satoshisToBtc(satoshis: number): string {
    const decimals = NETWORK_DECIMALS.bitcoin;
    const btc = satoshis / Math.pow(10, decimals);
    // Remove trailing zeros after decimal point
    return btc.toFixed(decimals).replace(/\.?0+$/, '');
  }
}
