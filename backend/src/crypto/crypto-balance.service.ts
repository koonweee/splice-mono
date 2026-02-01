import { Inject, Injectable, Logger } from '@nestjs/common';
import { Alchemy, Network } from 'alchemy-sdk';
import type { CryptoNetwork } from '../bank-link/providers/crypto/crypto.types';
import { NETWORK_DECIMALS } from '../bank-link/providers/crypto/crypto.types';
import {
  CRYPTO_BALANCE_CONFIG,
  type CryptoBalanceConfig,
} from './crypto-balance.config';

/** Bitcoin mempool.space API base URL (hardcoded) */
const BITCOIN_API_URL = 'https://mempool.space/api';

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
  private readonly alchemy: Alchemy;

  constructor(
    @Inject(CRYPTO_BALANCE_CONFIG)
    private readonly config: CryptoBalanceConfig,
  ) {
    this.alchemy = new Alchemy({
      apiKey: config.alchemyApiKey,
      network: Network.ETH_MAINNET,
    });
  }

  /**
   * Get balance for an address on a given network
   * @param network - The cryptocurrency network (ethereum or bitcoin)
   * @param address - The wallet address
   * @returns Balance as a string in native units (ETH, not wei; BTC, not satoshis)
   * @throws Error if the request fails
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
   * Fetch Ethereum balance via Alchemy SDK
   */
  private async getEthereumBalance(address: string): Promise<string> {
    try {
      const balanceWei = await this.alchemy.core.getBalance(address);
      return this.weiToEth(balanceWei.toBigInt());
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        { address: address.slice(0, 10), error: errorMessage },
        'Alchemy ETH balance request failed',
      );
      throw error;
    }
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
