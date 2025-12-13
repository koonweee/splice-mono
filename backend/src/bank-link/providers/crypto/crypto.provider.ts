import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TatumService } from '../../../common/tatum.service';
import { CryptoAccountType } from '../../../types/AccountType';
import type {
  APIAccount,
  GetAccountsResponse,
  Institution,
  LinkInitiationResponse,
} from '../../../types/BankLink';
import { MoneySign, MoneyWithSign } from '../../../types/MoneyWithSign';
import type { IBankLinkProvider } from '../bank-link-provider.interface';
import {
  CryptoAuthenticationSchema,
  CryptoLinkInputSchema,
  type CryptoNetwork,
  NETWORK_CURRENCIES,
} from './crypto.types';

/**
 * Provider for linking cryptocurrency wallets
 * Supports Ethereum and Bitcoin networks via Tatum API
 *
 * Unlike Plaid, this provider uses synchronous linking:
 * - No OAuth flow required
 * - User provides wallet address directly
 * - Balance is fetched immediately
 * - No webhook support (polling only)
 */
@Injectable()
export class CryptoProvider implements IBankLinkProvider {
  readonly providerName = 'crypto';
  private readonly logger = new Logger(CryptoProvider.name);

  constructor(private readonly tatumService: TatumService) {}

  /**
   * Initiate crypto wallet linking
   * Unlike Plaid, this immediately validates the address and returns accounts
   */
  async initiateLinking(input: {
    userId: string;
    redirectUri?: string;
    providerUserDetails?: Record<string, unknown>;
  }): Promise<LinkInitiationResponse> {
    this.logger.log({ userId: input.userId }, 'Initiating crypto wallet link');

    // Validate providerUserDetails with Zod schema (type-safe parsing)
    const parseResult = CryptoLinkInputSchema.safeParse(
      input.providerUserDetails,
    );
    if (!parseResult.success) {
      this.logger.warn(
        { error: parseResult.error.message },
        'Invalid crypto link input',
      );
      throw new BadRequestException(
        `Invalid crypto link input: ${parseResult.error.message}`,
      );
    }
    const { walletAddress, network } = parseResult.data;

    this.logger.log(
      { network, addressHint: walletAddress.slice(0, 10) },
      'Validating wallet address',
    );

    // Validate address format
    const isValid = this.tatumService.validateAddress(network, walletAddress);
    if (!isValid) {
      this.logger.warn(
        { network, addressHint: walletAddress.slice(0, 10) },
        'Invalid address format',
      );
      throw new BadRequestException(`Invalid ${network} address format`);
    }

    // Fetch balance immediately
    const balance = await this.fetchBalance(network, walletAddress);

    this.logger.log({ network, balance }, 'Fetched initial wallet balance');

    // Create account representation
    const account = this.createAPIAccount(walletAddress, network, balance);

    // Return accounts immediately (no webhook flow)
    return {
      immediateAccounts: [
        {
          authentication: { address: walletAddress, network },
          accounts: [account],
          institution: this.getInstitution(network),
        },
      ],
    };
  }

  /**
   * Fetch accounts (balance) for a linked crypto wallet
   */
  async getAccounts(
    authentication: Record<string, unknown>,
  ): Promise<GetAccountsResponse> {
    // Validate authentication with Zod schema (type-safe parsing)
    const parseResult = CryptoAuthenticationSchema.safeParse(authentication);
    if (!parseResult.success) {
      throw new Error(
        `Invalid crypto authentication: ${parseResult.error.message}`,
      );
    }
    const { address, network } = parseResult.data;

    this.logger.log(
      { network, addressHint: address.slice(0, 10) },
      'Fetching crypto wallet balance',
    );

    const balance = await this.fetchBalance(network, address);

    this.logger.log({ network, balance }, 'Fetched wallet balance');

    return {
      accounts: [this.createAPIAccount(address, network, balance)],
      institution: this.getInstitution(network),
    };
  }

  /**
   * Crypto provider doesn't use webhooks - polling only
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyWebhook(): Promise<boolean> {
    return false;
  }

  /**
   * Fetch balance from Tatum API based on network
   */
  private async fetchBalance(
    network: CryptoNetwork,
    address: string,
  ): Promise<string> {
    if (network === 'ethereum') {
      return this.tatumService.getEthereumBalance(address);
    } else {
      return this.tatumService.getBitcoinBalance(address);
    }
  }

  /**
   * Create an APIAccount from wallet data
   */
  private createAPIAccount(
    address: string,
    network: CryptoNetwork,
    balanceString: string,
  ): APIAccount {
    const currency = NETWORK_CURRENCIES[network];
    const balanceFloat = parseFloat(balanceString) || 0;
    const sign = balanceFloat >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;

    // MoneyWithSign.fromFloat now handles crypto currencies natively
    const balance = MoneyWithSign.fromFloat(currency, balanceFloat, sign);

    // Format display name
    const networkName = network.charAt(0).toUpperCase() + network.slice(1);
    const addressMask = address.slice(-4);

    return {
      accountId: `${network}:${address}`,
      name: `${networkName} Wallet`,
      mask: addressMask,
      type: CryptoAccountType.CRYPTO_WALLET,
      subType: null,
      availableBalance: balance.toSerialized(),
      currentBalance: balance.toSerialized(),
    };
  }

  /**
   * Get institution info for display
   */
  private getInstitution(network: CryptoNetwork): Institution {
    const networkName = network.charAt(0).toUpperCase() + network.slice(1);
    return {
      id: network,
      name: `${networkName} Wallet`,
    };
  }
}
