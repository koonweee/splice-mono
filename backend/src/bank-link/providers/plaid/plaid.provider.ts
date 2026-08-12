import { Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import {
  Configuration,
  CountryCode,
  DefaultUpdateWebhook,
  HoldingsDefaultUpdateWebhook,
  InvestmentTransaction as PlaidInvestmentTransaction,
  ItemErrorWebhook,
  ItemLoginRepairedWebhook,
  ItemPublicTokenExchangeRequest,
  JWKPublicKey,
  LinkSessionFinishedWebhook,
  LinkTokenCreateRequest,
  PendingDisconnectWebhook,
  PendingExpirationWebhook,
  PlaidApi,
  PlaidEnvironments,
  Products,
  Security,
  SyncUpdatesAvailableWebhook,
  Transaction as PlaidTransaction,
  UserCreateRequest,
} from 'plaid';
import {
  APIAccount,
  type GetAccountsResponse,
  type Institution,
  LinkCompletionResponse,
  LinkInitiationResponse,
  type TransactionSyncResponse,
} from '../../../types/BankLink';
import type {
  ProviderInvestmentHoldingsResponse,
  ProviderInvestmentSecurity,
  ProviderInvestmentTransaction,
  ProviderInvestmentTransactionsResponse,
} from '../../../types/Investment';
import { MoneySign, MoneyWithSign } from '../../../types/MoneyWithSign';
import type { CreateTransactionDto } from '../../../types/Transaction';
import {
  PlaidUserDetails,
  PlaidUserDetailsSchema,
} from '../../../types/ProviderUserDetails';
import { IBankLinkProvider } from '../bank-link-provider.interface';

/**
 * Authentication data for Plaid API calls
 */
interface PlaidAuthentication {
  accessToken: string;
  itemId?: string;
}

/**
 * Type guard for PlaidAuthentication
 */
function isPlaidAuthentication(auth: unknown): auth is PlaidAuthentication {
  return (
    typeof auth === 'object' &&
    auth !== null &&
    'accessToken' in auth &&
    typeof (auth as Record<string, unknown>).accessToken === 'string'
  );
}

/**
 * Type guard for LINK SESSION_FINISHED webhook
 */
function isLinkSessionFinishedWebhook(
  payload: unknown,
): payload is LinkSessionFinishedWebhook {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p.webhook_type === 'LINK' && p.webhook_code === 'SESSION_FINISHED';
}

/**
 * Type guard for TRANSACTIONS DEFAULT_UPDATE webhook
 */
function isTransactionsDefaultUpdateWebhook(
  payload: unknown,
): payload is DefaultUpdateWebhook {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.webhook_type === 'TRANSACTIONS' &&
    p.webhook_code === 'DEFAULT_UPDATE' &&
    typeof p.item_id === 'string'
  );
}

/**
 * Type guard for TRANSACTIONS SYNC_UPDATES_AVAILABLE webhook
 */
function isSyncUpdatesAvailableWebhook(
  payload: unknown,
): payload is SyncUpdatesAvailableWebhook {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.webhook_type === 'TRANSACTIONS' &&
    p.webhook_code === 'SYNC_UPDATES_AVAILABLE' &&
    typeof p.item_id === 'string'
  );
}

/**
 * Type guard for TRANSACTIONS webhook codes that should trigger a sync
 * Covers: INITIAL_UPDATE, HISTORICAL_UPDATE, TRANSACTIONS_REMOVED
 */
function isTransactionsSyncTriggerWebhook(
  payload: unknown,
): payload is { webhook_type: string; webhook_code: string; item_id: string } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  const syncTriggerCodes = [
    'INITIAL_UPDATE',
    'HISTORICAL_UPDATE',
    'TRANSACTIONS_REMOVED',
  ];
  return (
    p.webhook_type === 'TRANSACTIONS' &&
    typeof p.webhook_code === 'string' &&
    syncTriggerCodes.includes(p.webhook_code) &&
    typeof p.item_id === 'string'
  );
}

/**
 * Type guard for HOLDINGS DEFAULT_UPDATE webhook
 */
function isHoldingsDefaultUpdateWebhook(
  payload: unknown,
): payload is HoldingsDefaultUpdateWebhook {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.webhook_type === 'HOLDINGS' &&
    p.webhook_code === 'DEFAULT_UPDATE' &&
    typeof p.item_id === 'string'
  );
}

function isInvestmentsTransactionsWebhook(
  payload: unknown,
): payload is { webhook_type: string; webhook_code: string; item_id: string } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.webhook_type === 'INVESTMENTS_TRANSACTIONS' &&
    typeof p.webhook_code === 'string' &&
    typeof p.item_id === 'string'
  );
}

/**
 * Type guard for ITEM webhooks (ERROR, LOGIN_REPAIRED, PENDING_DISCONNECT, PENDING_EXPIRATION)
 */
function isItemWebhook(
  payload: unknown,
): payload is { webhook_type: 'ITEM'; webhook_code: string; item_id: string } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p.webhook_type === 'ITEM' &&
    typeof p.webhook_code === 'string' &&
    typeof p.item_id === 'string'
  );
}

/**
 * Plaid provider for linking bank accounts
 */
@Injectable()
export class PlaidProvider implements IBankLinkProvider {
  private static readonly SINGLE_ACCOUNT_CONVERSION_CUSTOMIZATION_NAME =
    'single_account';
  private readonly logger = new Logger(PlaidProvider.name);
  readonly providerName = 'plaid';

  private client: PlaidApi;
  /**
   * Cached JWK for webhook verification
   * - kid: Key ID from JWT header
   * - key: The JWK public key
   * - expiredAt: Unix timestamp when key expires (null = not expired)
   * - cachedAt: When we cached this key (for TTL check)
   */
  private cachedJwk: {
    kid: string;
    key: JWKPublicKey;
    expiredAt: number | null;
    cachedAt: number;
  } | null = null;

  /** Cache TTL in milliseconds (24 hours) - forces periodic refresh even if key hasn't expired */
  private static readonly JWK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  constructor() {
    this.logger.log({}, 'Initializing PlaidProvider');
    this.logger.log({}, 'Plaid credentials configured');
    const configuration = new Configuration({
      basePath: PlaidEnvironments.production,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    this.client = new PlaidApi(configuration);
  }

  /**
   * Parse and validate provider user details using Zod schema
   * Returns undefined if details are missing or invalid
   *
   * @param providerUserDetails - Raw provider details from storage
   * @returns Validated PlaidUserDetails or undefined
   */
  private parseProviderUserDetails(
    providerUserDetails?: Record<string, unknown>,
  ): PlaidUserDetails | undefined {
    if (!providerUserDetails) {
      return undefined;
    }

    const result = PlaidUserDetailsSchema.safeParse(providerUserDetails);
    if (!result.success) {
      this.logger.warn(
        { error: result.error.message },
        'Invalid Plaid user details, ignoring',
      );
      return undefined;
    }

    return result.data;
  }

  /**
   * Create a Plaid user and get their user token
   * Required for multi-item link functionality
   *
   * Plaid will error if the same client_user_id is used to create a new user token.
   *
   * @param clientUserId - Unique identifier for the user in your system
   * @returns The user token from Plaid
   */
  private async createUserToken(clientUserId: string): Promise<string> {
    const request: UserCreateRequest = {
      client_user_id: clientUserId,
    };

    try {
      const response = await this.client.userCreate(request);
      const userToken = response.data.user_token;
      if (!userToken) {
        throw new Error('Plaid user creation did not return a user_token');
      }
      this.logger.log({ clientUserId }, 'Created Plaid user');
      return userToken;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error creating Plaid user',
      );
      throw error;
    }
  }

  /**
   * Initiate Plaid Link flow
   * Returns URL to redirect user to for hosted Plaid Link flow
   */
  async initiateLinking(input: {
    userId: string;
    redirectUri?: string;
    providerUserDetails?: Record<string, unknown>;
    accessToken?: string;
    singleAccountSelect?: boolean;
  }): Promise<LinkInitiationResponse> {
    const {
      userId,
      redirectUri,
      providerUserDetails,
      accessToken,
      singleAccountSelect,
    } = input;
    this.logger.log({ userId, redirectUri }, 'Plaid link initiated');

    let updatedProviderUserDetails: PlaidUserDetails | undefined;
    let linkModeParams:
      | Pick<LinkTokenCreateRequest, 'access_token'>
      | (Omit<
          Pick<
            LinkTokenCreateRequest,
            | 'user_token'
            | 'products'
            | 'optional_products'
            | 'enable_multi_item_link'
            | 'link_customization_name'
          >,
          'link_customization_name'
        > & { link_customization_name?: string });

    if (accessToken) {
      linkModeParams = { access_token: accessToken };
    } else {
      const existingDetails =
        this.parseProviderUserDetails(providerUserDetails);
      let userToken: string;
      if (existingDetails?.userToken) {
        userToken = existingDetails.userToken;
        this.logger.log({ userId }, 'Reusing existing Plaid user token');
      } else {
        userToken = await this.createUserToken(userId);
        updatedProviderUserDetails = { userToken };
        this.logger.log({ userId }, 'Created new Plaid user token');
      }
      linkModeParams = {
        user_token: userToken,
        products: [Products.Transactions],
        optional_products: [Products.Investments],
        enable_multi_item_link: !singleAccountSelect,
        ...(singleAccountSelect
          ? {
              link_customization_name:
                PlaidProvider.SINGLE_ACCOUNT_CONVERSION_CUSTOMIZATION_NAME,
            }
          : {}),
      };
    }

    // Construct link token request
    // In update mode (access_token provided), user_token must be omitted —
    // Plaid does not allow both in the same request.
    const request: LinkTokenCreateRequest = {
      client_name: 'Splice',
      language: 'en',
      country_codes: [CountryCode.Us],
      user: {
        client_user_id: userId,
      },
      redirect_uri: redirectUri,
      hosted_link: {
        completion_redirect_uri: redirectUri,
      },
      webhook: `${process.env.API_DOMAIN}/bank-link/webhook/plaid`,
      ...linkModeParams,
    };

    try {
      const response = await this.client.linkTokenCreate(request);
      const result: LinkInitiationResponse = {
        webhookId: response.data.link_token,
        expiresAt: new Date(response.data.expiration),
        linkUrl: response.data.hosted_link_url,
        updatedProviderUserDetails,
      };
      this.logger.log(
        {
          expiresAt: result.expiresAt,
          hasUserToken: !!result.updatedProviderUserDetails,
        },
        'Plaid link token created',
      );
      return result;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown; status?: number };
        message?: string;
      };
      this.logger.error(
        {
          errorMessage: axiosError.message ?? String(error),
          plaidError: axiosError.response?.data,
          statusCode: axiosError.response?.status,
          requestParams: {
            hasAccessToken: !!accessToken,
            hasUserToken: !!request.user_token,
            hasHostedLink: !!request.hosted_link,
          },
        },
        'Error creating link token',
      );
      throw error;
    }
  }

  /**
   * Exchange public token for access token
   */
  private async exchangeToken(publicToken: string): Promise<{
    accessToken: string;
    /** Plaid's external ID is the item ID, corresponds to an institution */
    externalAccountId: string;
  }> {
    const request: ItemPublicTokenExchangeRequest = {
      public_token: publicToken,
    };

    try {
      const response = await this.client.itemPublicTokenExchange(request);
      return {
        accessToken: response.data.access_token,
        externalAccountId: response.data.item_id,
      };
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error exchanging public token',
      );
      throw error;
    }
  }

  parseLinkCompletionWebhook(
    rawPayload: Record<string, any>,
  ): { linkToken: string } | undefined {
    // Use type guard to validate webhook structure
    if (!isLinkSessionFinishedWebhook(rawPayload)) {
      return undefined;
    }

    const { link_token: linkToken, status } = rawPayload;

    // Validate required fields for SESSION_FINISHED
    if (!linkToken || !status) {
      this.logger.warn(
        {},
        'SESSION_FINISHED webhook missing link_token or status',
      );
      return undefined;
    }

    if (status.toLowerCase() !== 'success') {
      this.logger.warn(
        { status },
        'SESSION_FINISHED webhook status is not success',
      );
      return undefined;
    }

    return { linkToken };
  }

  /**
   * Process link completion webhook from Plaid
   * Exchanges public tokens for access tokens and retrieves account info
   */
  async processLinkCompletion(
    rawPayload: Record<string, any>,
  ): Promise<LinkCompletionResponse[]> {
    // Validate webhook structure - should be called after parseLinkCompletionWebhook
    if (!isLinkSessionFinishedWebhook(rawPayload)) {
      throw new Error('Invalid webhook payload for processLinkCompletion');
    }

    this.logger.log(
      { publicTokenCount: rawPayload.public_tokens?.length ?? 0 },
      'Processing Plaid webhook payload',
    );

    const { public_tokens = [] } = rawPayload;

    const plaidItems = await Promise.all(
      public_tokens.map(async (public_token) => {
        return this.exchangeToken(public_token);
      }),
    );

    // Log all plaid items
    this.logger.log(
      { itemCount: plaidItems.length },
      'Exchanged public tokens for access tokens',
    );

    // Get accounts and institution info from Plaid
    const accountsResponses = await Promise.all(
      plaidItems.map(async (item) => {
        return this.getAccounts({ accessToken: item.accessToken });
      }),
    );

    return plaidItems.map((item, index) => ({
      authentication: {
        accessToken: item.accessToken,
        itemId: item.externalAccountId, // Plaid item_id for webhook matching
      },
      accounts: accountsResponses[index].accounts,
      institution: accountsResponses[index].institution,
    }));
  }

  /**
   * Get accounts from Plaid using /accounts/get
   *
   * @param authentication - Authentication data containing { accessToken: string }
   * @returns Accounts and institution info from Plaid
   */
  async getAccounts(
    authentication: Record<string, any>,
  ): Promise<GetAccountsResponse> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }
    const { accessToken } = authentication;

    const startTime = Date.now();
    this.logger.log(
      { accessTokenHint: accessToken.slice(-4) },
      'Fetching accounts from Plaid',
    );
    try {
      const response = await this.client.accountsGet({
        access_token: accessToken,
      });
      this.logger.log(
        {
          accountCount: response.data.accounts.length,
          durationMs: Date.now() - startTime,
        },
        'Received accounts from Plaid',
      );

      // Extract institution info from the response
      const institution: Institution = {
        id: response.data.item.institution_id ?? null,
        name: response.data.item.institution_name ?? null,
      };

      // Convert Plaid accounts to API accounts
      const accounts: APIAccount[] = response.data.accounts.map((account) => {
        const {
          account_id,
          official_name,
          name,
          mask,
          type,
          subtype,
          balances: {
            available,
            current,
            iso_currency_code,
            unofficial_currency_code,
          },
        } = account;

        // Pre-process account name
        const accountName = official_name ?? name;

        // Pre-process shared currency code (default to USD if not available)
        const currency = iso_currency_code ?? unofficial_currency_code ?? 'USD';

        // Pre-process available balance (Plaid returns float amounts like 199.99)
        const availableAmount = available ?? 0;
        const availableSign =
          availableAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;
        const availableBalance = MoneyWithSign.fromFloat(
          currency,
          availableAmount,
          availableSign,
        );

        // Pre-process current balance (Plaid returns float amounts like 199.99)
        const currentAmount = current ?? 0;
        const currentSign =
          currentAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;
        const currentBalance = MoneyWithSign.fromFloat(
          currency,
          currentAmount,
          currentSign,
        );

        return {
          accountId: account_id,
          name: accountName,
          mask,
          type,
          subType: subtype,
          // Serialize to plain objects for DTO compatibility
          availableBalance: availableBalance.toSerialized(),
          currentBalance: currentBalance.toSerialized(),
        };
      });

      return { accounts, institution };
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error fetching account details from Plaid',
      );
      throw error;
    }
  }

  async syncInvestmentHoldings(
    authentication: Record<string, any>,
  ): Promise<ProviderInvestmentHoldingsResponse> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }
    const { accessToken } = authentication;

    const startTime = Date.now();
    this.logger.log({}, 'Fetching investment holdings from Plaid');
    try {
      const response = await this.client.investmentsHoldingsGet({
        access_token: accessToken,
      });
      const { accounts, holdings, securities } = response.data;
      this.logger.log(
        {
          accountCount: accounts.length,
          holdingCount: holdings.length,
          securityCount: securities.length,
          durationMs: Date.now() - startTime,
        },
        'Received investment holdings from Plaid',
      );

      return {
        externalAccountIds: accounts.map((account) => account.account_id),
        securities: securities.map((security) =>
          this.mapPlaidSecurity(security),
        ),
        holdings: holdings.map((holding) => ({
          externalAccountId: holding.account_id,
          externalSecurityId: holding.security_id,
          quantity: this.toDecimalString(holding.quantity),
          costBasis: this.toDecimalString(holding.cost_basis),
          institutionPrice: this.toDecimalString(holding.institution_price),
          institutionPriceAsOf: holding.institution_price_as_of ?? null,
          institutionPriceDatetime: holding.institution_price_datetime ?? null,
          institutionValue: this.toDecimalString(holding.institution_value),
          isoCurrencyCode: holding.iso_currency_code,
          unofficialCurrencyCode: holding.unofficial_currency_code,
          vestedQuantity: this.toDecimalString(holding.vested_quantity),
          vestedValue: this.toDecimalString(holding.vested_value),
        })),
      };
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error fetching investment holdings from Plaid',
      );
      throw error;
    }
  }

  async syncInvestmentTransactions(
    authentication: Record<string, any>,
    startDate: string,
    endDate: string,
  ): Promise<ProviderInvestmentTransactionsResponse> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }
    const { accessToken } = authentication;

    const count = 500;
    let offset = 0;
    let total = 0;
    const securities = new Map<string, ProviderInvestmentSecurity>();
    const externalAccountIds = new Set<string>();
    const transactions: ProviderInvestmentTransaction[] = [];

    const startTime = Date.now();
    this.logger.log(
      { startDate, endDate },
      'Fetching investment transactions from Plaid',
    );

    try {
      do {
        const response = await this.client.investmentsTransactionsGet({
          access_token: accessToken,
          start_date: startDate,
          end_date: endDate,
          options: {
            count,
            offset,
          },
        });

        const {
          accounts,
          securities: pageSecurities,
          investment_transactions,
          total_investment_transactions,
        } = response.data;

        accounts.forEach((account) =>
          externalAccountIds.add(account.account_id),
        );
        pageSecurities.forEach((security) => {
          const mapped = this.mapPlaidSecurity(security);
          securities.set(mapped.externalSecurityId, mapped);
        });
        transactions.push(
          ...investment_transactions.map((transaction) =>
            this.mapPlaidInvestmentTransactionToProvider(transaction),
          ),
        );

        total = total_investment_transactions;
        offset += investment_transactions.length;

        this.logger.log(
          {
            pageCount: investment_transactions.length,
            offset,
            total,
          },
          'Fetched investment transaction page',
        );
        if (investment_transactions.length === 0) {
          break;
        }
      } while (offset < total);

      this.logger.log(
        {
          transactionCount: transactions.length,
          securityCount: securities.size,
          accountCount: externalAccountIds.size,
          durationMs: Date.now() - startTime,
        },
        'Received investment transactions from Plaid',
      );

      return {
        externalAccountIds: Array.from(externalAccountIds),
        securities: Array.from(securities.values()),
        transactions,
        startDate,
        endDate,
      };
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error fetching investment transactions from Plaid',
      );
      throw error;
    }
  }

  /**
   * Verify that a webhook is genuine and from Plaid
   *
   * Implements verification as per:
   * https://plaid.com/docs/api/webhooks/webhook-verification/
   *
   * @param rawBody - Raw webhook body as string (preserves original formatting for hash verification)
   * @param headers - HTTP headers from the webhook request
   * @returns true if webhook is verified, false otherwise
   */
  async verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    try {
      // Step 1: Extract the JWT from the Plaid-Verification header
      // Headers are case-insensitive in HTTP 1.x, lowercase in HTTP 2
      const signedJwt =
        headers['plaid-verification'] || headers['Plaid-Verification'];

      if (!signedJwt) {
        this.logger.warn(
          {},
          'Webhook verification failed: Missing Plaid-Verification header',
        );
        return false;
      }

      // Step 2: Decode the JWT header to get the key ID (kid)
      const jwtHeader = decodeProtectedHeader(signedJwt);

      // Ensure the algorithm is ES256
      if (jwtHeader.alg !== 'ES256') {
        this.logger.warn(
          { algorithm: jwtHeader.alg, expected: 'ES256' },
          'Webhook verification failed: Invalid algorithm',
        );
        return false;
      }

      const keyId = jwtHeader.kid;
      if (!keyId) {
        this.logger.warn(
          {},
          'Webhook verification failed: Missing kid in JWT header',
        );
        return false;
      }

      // Step 3: Get the JWK from Plaid (use cache if valid)
      let jwk: JWKPublicKey;
      const now = Date.now();
      const isCacheValid =
        this.cachedJwk &&
        this.cachedJwk.kid === keyId &&
        // Check key hasn't expired (expiredAt is Unix seconds, convert to ms)
        (this.cachedJwk.expiredAt === null ||
          this.cachedJwk.expiredAt * 1000 > now) &&
        // Check cache TTL hasn't exceeded (force periodic refresh)
        now - this.cachedJwk.cachedAt < PlaidProvider.JWK_CACHE_TTL_MS;

      if (isCacheValid && this.cachedJwk) {
        jwk = this.cachedJwk.key;
      } else {
        try {
          const response = await this.client.webhookVerificationKeyGet({
            key_id: keyId,
          });
          jwk = response.data.key;
          // Cache the key with expiration info
          this.cachedJwk = {
            kid: keyId,
            key: jwk,
            expiredAt: response.data.key.expired_at ?? null,
            cachedAt: now,
          };
          this.logger.log({ keyId }, 'Fetched and cached new JWK');
        } catch (error) {
          this.logger.error(
            { error: error instanceof Error ? error.message : String(error) },
            'Webhook verification failed: Could not fetch verification key',
          );
          return false;
        }
      }

      // Step 4: Verify the JWT signature and check max age (5 minutes)
      const publicKey = await importJWK(jwk, 'ES256');

      try {
        await jwtVerify(signedJwt, publicKey, {
          maxTokenAge: '5 min',
        });
      } catch (error) {
        this.logger.warn(
          { error: error instanceof Error ? error.message : String(error) },
          'Webhook verification failed: JWT verification error',
        );
        return false;
      }

      // Step 5: Verify the body hash
      const jwtPayload = decodeJwt(signedJwt);
      const claimedBodyHash = jwtPayload.request_body_sha256 as
        | string
        | undefined;

      if (!claimedBodyHash) {
        this.logger.warn(
          {},
          'Webhook verification failed: Missing request_body_sha256 in JWT payload',
        );
        return false;
      }

      // Compute SHA-256 of the raw body
      const computedBodyHash = createHash('sha256')
        .update(rawBody)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      const claimedBuffer = Buffer.from(claimedBodyHash, 'utf8');
      const computedBuffer = Buffer.from(computedBodyHash, 'utf8');

      if (claimedBuffer.length !== computedBuffer.length) {
        this.logger.warn(
          {},
          'Webhook verification failed: Body hash length mismatch',
        );
        return false;
      }

      if (!timingSafeEqual(claimedBuffer, computedBuffer)) {
        this.logger.warn({}, 'Webhook verification failed: Body hash mismatch');
        return false;
      }

      this.logger.log({}, 'Webhook verification successful');
      return true;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Webhook verification error',
      );
      return false;
    }
  }

  /**
   * Parse DEFAULT_UPDATE webhooks for transactions and investments
   * These webhooks signal that Plaid has updated data and we should sync
   *
   * @param rawPayload - Raw webhook payload
   * @returns Item ID and webhook type if this is a DEFAULT_UPDATE webhook, undefined otherwise
   */
  parseUpdateWebhook(
    rawPayload: Record<string, any>,
  ): { itemId: string; type: string } | undefined {
    // Check for TRANSACTIONS SYNC_UPDATES_AVAILABLE (preferred for /transactions/sync)
    if (isSyncUpdatesAvailableWebhook(rawPayload)) {
      return { itemId: rawPayload.item_id, type: 'TRANSACTIONS' };
    }

    // Check for TRANSACTIONS DEFAULT_UPDATE
    if (isTransactionsDefaultUpdateWebhook(rawPayload)) {
      return { itemId: rawPayload.item_id, type: 'TRANSACTIONS' };
    }

    // Check for other transaction webhook codes that should trigger sync
    // (INITIAL_UPDATE, HISTORICAL_UPDATE, TRANSACTIONS_REMOVED)
    if (isTransactionsSyncTriggerWebhook(rawPayload)) {
      return { itemId: rawPayload.item_id, type: 'TRANSACTIONS' };
    }

    // Check for HOLDINGS DEFAULT_UPDATE
    if (isHoldingsDefaultUpdateWebhook(rawPayload)) {
      return { itemId: rawPayload.item_id, type: 'HOLDINGS' };
    }

    if (isInvestmentsTransactionsWebhook(rawPayload)) {
      return {
        itemId: rawPayload.item_id,
        type: 'INVESTMENTS_TRANSACTIONS',
      };
    }

    return undefined;
  }

  /**
   * Parse ITEM webhooks that signal status changes for bank links
   * Handles ERROR, LOGIN_REPAIRED, PENDING_DISCONNECT, and PENDING_EXPIRATION
   *
   * @param rawPayload - Raw webhook payload
   * @returns Status webhook info if this is an ITEM status webhook, undefined otherwise
   */
  parseStatusWebhook(rawPayload: Record<string, any>):
    | {
        itemId: string;
        webhookCode: string;
        status: 'OK' | 'ERROR' | 'PENDING_REAUTH';
        statusBody: Record<string, any> | null;
        shouldSync: boolean;
      }
    | undefined {
    // Validate ITEM webhook structure
    if (!isItemWebhook(rawPayload)) {
      return undefined;
    }

    const { webhook_code: webhookCode } = rawPayload;

    switch (webhookCode) {
      case 'ERROR': {
        const payload = rawPayload as ItemErrorWebhook;
        const error = payload.error;
        return {
          itemId: payload.item_id,
          webhookCode: 'ERROR',
          status: 'ERROR',
          statusBody: error
            ? {
                error_type: error.error_type,
                error_code: error.error_code,
                error_code_reason: error.error_code_reason,
                error_message: error.error_message,
                display_message: error.display_message,
                suggested_action: error.suggested_action,
                documentation_url: error.documentation_url,
                receivedAt: new Date().toISOString(),
              }
            : null,
          shouldSync: false,
        };
      }

      case 'LOGIN_REPAIRED': {
        const payload = rawPayload as ItemLoginRepairedWebhook;
        return {
          itemId: payload.item_id,
          webhookCode: 'LOGIN_REPAIRED',
          status: 'OK',
          statusBody: null, // Clear error info on repair
          shouldSync: true, // Auto-sync after login repair
        };
      }

      case 'PENDING_DISCONNECT': {
        const payload = rawPayload as PendingDisconnectWebhook;
        return {
          itemId: payload.item_id,
          webhookCode: 'PENDING_DISCONNECT',
          status: 'PENDING_REAUTH',
          statusBody: {
            reason: payload.reason,
            environment: payload.environment,
            receivedAt: new Date().toISOString(),
          },
          shouldSync: false,
        };
      }

      case 'PENDING_EXPIRATION': {
        const payload = rawPayload as PendingExpirationWebhook;
        return {
          itemId: payload.item_id,
          webhookCode: 'PENDING_EXPIRATION',
          status: 'PENDING_REAUTH',
          statusBody: {
            consent_expiration_time: payload.consent_expiration_time,
            environment: payload.environment,
            receivedAt: new Date().toISOString(),
          },
          shouldSync: false,
        };
      }

      default:
        return undefined;
    }
  }

  /**
   * Get item details from Plaid using the access token
   * Used for backfilling item_id for existing bank links
   *
   * @param authentication - Authentication data containing { accessToken: string }
   * @returns The item_id from Plaid
   */
  async getItemId(authentication: Record<string, any>): Promise<string> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }
    const { accessToken } = authentication;

    try {
      const response = await this.client.itemGet({
        access_token: accessToken,
      });
      return response.data.item.item_id;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error fetching item from Plaid',
      );
      throw error;
    }
  }

  async getConnectionDiagnostics(
    authentication: Record<string, any>,
  ): Promise<Record<string, unknown>> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }

    const response = await this.client.itemGet({
      access_token: authentication.accessToken,
    });
    const { item } = response.data;

    return {
      update_type: item.update_type,
      consent_expiration_time: item.consent_expiration_time ?? null,
      error_type: item.error?.error_type ?? null,
      error_code: item.error?.error_code ?? null,
      error_code_reason: item.error?.error_code_reason ?? null,
      error_message: item.error?.error_message ?? null,
      display_message: item.error?.display_message ?? null,
      suggested_action: item.error?.suggested_action ?? null,
      documentation_url: item.error?.documentation_url ?? null,
    };
  }

  /**
   * Update the webhook URL for a Plaid item
   * Uses Plaid's /item/webhook/update endpoint
   *
   * @param authentication - Authentication data containing { accessToken: string }
   */
  async updateWebhookUrl(authentication: Record<string, any>): Promise<void> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }
    const { accessToken } = authentication;

    const webhookUrl = `${process.env.API_DOMAIN}/bank-link/webhook/plaid`;

    try {
      await this.client.itemWebhookUpdate({
        access_token: accessToken,
        webhook: webhookUrl,
      });
      this.logger.log(
        { accessTokenHint: accessToken.slice(-4) },
        'Updated webhook URL for item',
      );
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Error updating webhook URL',
      );
      throw error;
    }
  }

  /**
   * Sync transactions using Plaid's /transactions/sync cursor-based API
   * Fetches all available pages in a single call, accumulating results
   *
   * @param authentication - Authentication data containing { accessToken: string }
   * @param cursor - Cursor from previous sync (undefined for initial sync)
   * @returns Accumulated sync results with next cursor
   */
  async syncTransactions(
    authentication: Record<string, any>,
    cursor?: string,
  ): Promise<TransactionSyncResponse> {
    if (!isPlaidAuthentication(authentication)) {
      throw new Error('Missing or invalid accessToken in authentication data');
    }
    const { accessToken } = authentication;

    const allAdded: CreateTransactionDto[] = [];
    const allModified: CreateTransactionDto[] = [];
    const allRemoved: string[] = [];
    let currentCursor = cursor ?? '';
    let hasMore = true;

    this.logger.log(
      { accessTokenHint: accessToken.slice(-4), hasCursor: !!cursor },
      'Starting transaction sync',
    );

    while (hasMore) {
      const response = await this.client.transactionsSync({
        access_token: accessToken,
        cursor: currentCursor,
        count: 500,
        options: {
          include_original_description: true,
          include_personal_finance_category: true,
        },
      });

      const { added, modified, removed, next_cursor, has_more } = response.data;

      allAdded.push(...added.map((t) => this.mapPlaidTransactionToDto(t)));
      allModified.push(
        ...modified.map((t) => this.mapPlaidTransactionToDto(t)),
      );
      allRemoved.push(...removed.map((r) => r.transaction_id));

      currentCursor = next_cursor;
      hasMore = has_more;

      this.logger.log(
        {
          addedCount: added.length,
          modifiedCount: modified.length,
          removedCount: removed.length,
          hasMore,
        },
        'Fetched transaction sync page',
      );
    }

    this.logger.log(
      {
        totalAdded: allAdded.length,
        totalModified: allModified.length,
        totalRemoved: allRemoved.length,
      },
      'Transaction sync complete',
    );

    return {
      added: allAdded,
      modified: allModified,
      removed: allRemoved,
      nextCursor: currentCursor,
      hasMore: false,
    };
  }

  /**
   * Map a Plaid Transaction to a CreateTransactionDto
   * Note: accountId is set to the Plaid external account ID here;
   * the service layer will map it to the internal account ID
   */
  private mapPlaidTransactionToDto(
    plaidTransaction: PlaidTransaction,
  ): CreateTransactionDto {
    const {
      transaction_id,
      account_id,
      amount,
      iso_currency_code,
      unofficial_currency_code,
      name,
      merchant_name,
      original_description,
      pending,
      pending_transaction_id,
      account_owner,
      date,
      datetime,
      authorized_date,
      authorized_datetime,
      logo_url,
      website,
      merchant_entity_id,
      payment_channel,
      transaction_code,
      personal_finance_category_icon_url,
      counterparties,
      location,
      payment_meta,
      personal_finance_category,
    } = plaidTransaction;

    const currency = iso_currency_code ?? unofficial_currency_code ?? 'USD';

    // Plaid: positive = money out, negative = money in
    // We store: negative = expense/money out, positive = income/money in
    // So we invert the sign from Plaid's convention
    const invertedAmount = -amount;
    const sign = invertedAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;
    const serializedAmount = MoneyWithSign.fromFloat(
      currency,
      invertedAmount,
      sign,
    ).toSerialized();

    return {
      amount: serializedAmount,
      accountId: account_id, // External account ID; mapped to internal ID by service
      merchantName: merchant_name ?? null,
      providerTransactionName: name ?? null,
      originalDescription: original_description ?? null,
      pending,
      pendingTransactionId: pending_transaction_id ?? null,
      accountOwner: account_owner ?? null,
      externalTransactionId: transaction_id,
      logoUrl: logo_url ?? null,
      website: website ?? null,
      merchantEntityId: merchant_entity_id ?? null,
      paymentChannel: payment_channel ?? null,
      transactionCode: transaction_code ?? null,
      personalFinanceCategoryIconUrl:
        personal_finance_category_icon_url ?? null,
      personalFinanceCategoryConfidenceLevel:
        personal_finance_category?.confidence_level ?? null,
      counterparties:
        counterparties?.map((counterparty) => ({ ...counterparty })) ?? null,
      location: location ? { ...location } : null,
      paymentMeta: payment_meta ? { ...payment_meta } : null,
      providerPayload: plaidTransaction as unknown as Record<string, unknown>,
      providerDate: date,
      providerDatetime: datetime ?? null,
      authorizedDate: authorized_date ?? null,
      authorizedDatetime: authorized_datetime ?? null,
      ...(personal_finance_category && {
        personalFinanceCategory: {
          primary: personal_finance_category.primary,
          detailed: personal_finance_category.detailed,
        },
      }),
    };
  }

  private mapPlaidSecurity(security: Security): ProviderInvestmentSecurity {
    return {
      externalSecurityId: security.security_id,
      institutionId: security.institution_id,
      institutionSecurityId: security.institution_security_id,
      name: security.name,
      tickerSymbol: security.ticker_symbol,
      isin: security.isin,
      cusip: security.cusip,
      sedol: security.sedol,
      type: security.type,
      subtype: security.subtype ?? null,
      isCashEquivalent: security.is_cash_equivalent,
      closePrice: this.toDecimalString(security.close_price),
      closePriceAsOf: security.close_price_as_of,
      updateDatetime: security.update_datetime ?? null,
      isoCurrencyCode: security.iso_currency_code,
      unofficialCurrencyCode: security.unofficial_currency_code,
      marketIdentifierCode: security.market_identifier_code,
      sector: security.sector,
      industry: security.industry,
    };
  }

  private mapPlaidInvestmentTransactionToProvider(
    transaction: PlaidInvestmentTransaction,
  ): ProviderInvestmentTransaction {
    const currency =
      transaction.iso_currency_code ??
      transaction.unofficial_currency_code ??
      'USD';
    const invertedAmount = -transaction.amount;
    const sign = invertedAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;

    return {
      externalActivityId: transaction.investment_transaction_id,
      externalAccountId: transaction.account_id,
      externalSecurityId: transaction.security_id,
      providerDate: transaction.date,
      providerDatetime: null,
      name: transaction.name,
      quantity: transaction.quantity.toString(),
      amount: MoneyWithSign.fromFloat(
        currency,
        invertedAmount,
        sign,
      ).toSerialized(),
      price: transaction.price.toString(),
      fees: this.toDecimalString(transaction.fees),
      investmentType: transaction.type,
      investmentSubtype: transaction.subtype,
      cancelExternalActivityId: transaction.cancel_transaction_id ?? null,
      providerPayload: transaction as unknown as Record<string, unknown>,
    };
  }

  private toDecimalString(value: number | null | undefined): string | null {
    return value === null || value === undefined ? null : value.toString();
  }

  // TODO: Implement Plaid link 'update' flow for using same access token to fix broken links
}
