import { Injectable, Logger } from '@nestjs/common';

/**
 * Response from Tatum ETH balance endpoint
 */
interface EthBalanceResponse {
  balance: string; // Balance in ETH (not wei)
}

/**
 * Response from Tatum BTC balance endpoint
 */
interface BtcBalanceResponse {
  incoming: string; // Total incoming BTC
  outgoing: string; // Total outgoing BTC
}

/**
 * Response from Tatum exchange rate endpoint
 */
interface ExchangeRateResponse {
  id: string;
  value: string;
  basePair: string;
  timestamp: number;
  source: string;
}

/**
 * Service for interacting with the Tatum blockchain API
 * Provides unified access to multiple blockchains (ETH, BTC) and exchange rates
 *
 * @see https://apidoc.tatum.io/
 */
@Injectable()
export class TatumService {
  private readonly logger = new Logger(TatumService.name);
  private readonly baseUrl = 'https://api.tatum.io/v3';
  private readonly apiKey = process.env.TATUM_API_KEY;

  /**
   * Get ETH balance for an address
   * @param address - Ethereum address (0x...)
   * @returns Balance in ETH as string
   */
  async getEthereumBalance(address: string): Promise<string> {
    const url = `${this.baseUrl}/ethereum/account/balance/${address}`;
    const response = await this.fetchFromTatum<EthBalanceResponse>(
      url,
      'getEthereumBalance',
    );
    return response?.balance ?? '0';
  }

  /**
   * Get BTC balance for an address
   * @param address - Bitcoin address
   * @returns Balance in BTC as string
   */
  async getBitcoinBalance(address: string): Promise<string> {
    const url = `${this.baseUrl}/bitcoin/address/balance/${address}`;
    const response = await this.fetchFromTatum<BtcBalanceResponse>(
      url,
      'getBitcoinBalance',
    );
    if (!response) {
      return '0';
    }
    // Calculate balance as incoming - outgoing
    const incoming = parseFloat(response.incoming);
    const outgoing = parseFloat(response.outgoing);
    return (incoming - outgoing).toString();
  }

  /**
   * Get exchange rate for a cryptocurrency to USD
   * @param currency - Currency code (e.g., 'ETH', 'BTC')
   * @returns Exchange rate to USD
   */
  async getExchangeRate(currency: string): Promise<number> {
    const url = `${this.baseUrl}/tatum/rate/${currency}?basePair=USD`;
    const response = await this.fetchFromTatum<ExchangeRateResponse>(
      url,
      'getExchangeRate',
    );
    return response ? parseFloat(response.value) : 0;
  }

  /**
   * Validate a cryptocurrency address format
   * Uses regex validation for common formats
   * @param network - Network name ('ethereum' or 'bitcoin')
   * @param address - Address to validate
   * @returns true if address format is valid
   */
  validateAddress(network: string, address: string): boolean {
    if (network === 'ethereum') {
      // Ethereum: 0x prefix + 40 hex characters
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    } else if (network === 'bitcoin') {
      // Bitcoin: Base58 (legacy P2PKH/P2SH) or Bech32 (native segwit)
      // Legacy P2PKH: starts with 1, 25-34 chars
      // Legacy P2SH: starts with 3, 25-34 chars
      // Native SegWit: starts with bc1, 42-62 chars
      return (
        /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) ||
        /^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/.test(address)
      );
    }
    return false;
  }

  /**
   * Fetch data from Tatum API with error handling
   */
  private async fetchFromTatum<T>(
    url: string,
    operation: string,
  ): Promise<T | null> {
    if (!this.apiKey) {
      this.logger.error({}, 'TATUM_API_KEY environment variable is not set');
      throw new Error('TATUM_API_KEY is not configured');
    }

    try {
      const response = await fetch(url, {
        headers: {
          'x-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          { operation, status: response.status, error: errorText },
          'Tatum API request failed',
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error(
        {
          operation,
          error: error instanceof Error ? error.message : String(error),
        },
        'Error fetching from Tatum API',
      );
      return null;
    }
  }
}
