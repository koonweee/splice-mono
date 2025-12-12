import { ISOCurrencyCode } from '@half0wl/money';
import { Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from 'jose';
import {
  Configuration,
  CountryCode,
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
  UserCreateRequest,
} from 'plaid';
import {
  APIAccount,
  type GetAccountsResponse,
  type Institution,
  LinkCompletionResponse,
  LinkInitiationResponse,
} from '../../../types/BankLink';
import { MoneySign, MoneyWithSign } from '../../../types/MoneyWithSign';
import {
  PlaidUserDetails,
  PlaidUserDetailsSchema,
} from '../../../types/ProviderUserDetails';
import { IBankLinkProvider } from '../bank-link-provider.interface';
/**
 * Plaid provider for linking bank accounts
 */
@Injectable()
export class PlaidProvider implements IBankLinkProvider {
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
  }): Promise<LinkInitiationResponse> {
    const { userId, redirectUri, providerUserDetails } = input;
    this.logger.log({ userId, redirectUri }, 'Plaid link initiated');

    // Parse and validate existing provider details
    const existingDetails = this.parseProviderUserDetails(providerUserDetails);

    // Reuse existing user token or create a new one
    let userToken: string;
    let updatedProviderUserDetails: PlaidUserDetails | undefined;

    if (existingDetails?.userToken) {
      // Reuse existing user token
      userToken = existingDetails.userToken;
      this.logger.log({ userId }, 'Reusing existing Plaid user token');
    } else {
      // Create new user token and return it for persistence
      userToken = await this.createUserToken(userId);
      updatedProviderUserDetails = { userToken };
      this.logger.log({ userId }, 'Created new Plaid user token');
    }

    // Construct link token request
    const request: LinkTokenCreateRequest = {
      client_name: 'Splice',
      language: 'en',
      country_codes: [CountryCode.Us],
      user: {
        client_user_id: userId,
      },
      products: [Products.Transactions],
      optional_products: [Products.Investments], // Optional since we don't want to fail if we don't have it
      redirect_uri: redirectUri,
      hosted_link: {
        completion_redirect_uri: redirectUri,
      },
      enable_multi_item_link: true,
      user_token: userToken,
      webhook: `${process.env.API_DOMAIN}/bank-link/webhook/plaid`,
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
        { expiresAt: result.expiresAt, hasUserToken: !!result.updatedProviderUserDetails },
        'Plaid link token created',
      );
      return result;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
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

  shouldProcessWebhook(rawPayload: Record<string, any>): string | undefined {
    // Check that payload conatins webhook_code and link_token
    if (
      !rawPayload.webhook_code ||
      !rawPayload.link_token ||
      typeof rawPayload.link_token !== 'string' ||
      !rawPayload.status ||
      typeof rawPayload.status !== 'string'
    ) {
      this.logger.warn(
        {},
        'Not processing Plaid webhook: missing webhook_code or link_token or status',
      );
      return;
    }
    const { webhook_code, link_token, status } = rawPayload;
    if (webhook_code !== 'SESSION_FINISHED') {
      this.logger.warn({ webhookCode: webhook_code }, 'Not processing Plaid webhook of this type');
      return;
    }
    if (status !== 'success') {
      this.logger.warn({ status }, 'Not processing Plaid webhook of this status');
      return;
    }
    return link_token;
  }

  /**
   * Process webhook from Plaid
   * Parses mock webhook payload and returns standardized event
   */
  async processWebhook(
    rawPayload: Record<string, any>,
  ): Promise<LinkCompletionResponse[]> {
    // Cast rawPayload to LinkSessionFinishedWebhook
    const castedPayload = rawPayload as LinkSessionFinishedWebhook;

    this.logger.log(
      { publicTokenCount: castedPayload.public_tokens?.length ?? 0 },
      'Processing Plaid webhook payload',
    );

    const { public_tokens = [] } = castedPayload;

    const plaidItems = await Promise.all(
      public_tokens.map(async (public_token) => {
        return this.exchangeToken(public_token);
      }),
    );

    // Log all plaid items
    this.logger.log({ itemCount: plaidItems.length }, 'Exchanged public tokens for access tokens');

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
    const accessToken = authentication.accessToken as string;
    if (!accessToken) {
      throw new Error('Missing accessToken in authentication data');
    }

    this.logger.log({}, 'Fetching accounts from Plaid');
    try {
      const response = await this.client.accountsGet({
        access_token: accessToken,
      });
      // Debug: Log response
      this.logger.log(
        { accountCount: response.data.accounts.length },
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
        const currency = (iso_currency_code ??
          unofficial_currency_code ??
          'USD') as ISOCurrencyCode;

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
        this.logger.warn({}, 'Webhook verification failed: Missing Plaid-Verification header');
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
        this.logger.warn({}, 'Webhook verification failed: Missing kid in JWT header');
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
        this.logger.warn({}, 'Webhook verification failed: Missing request_body_sha256 in JWT payload');
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
        this.logger.warn({}, 'Webhook verification failed: Body hash length mismatch');
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
    const webhookType = rawPayload.webhook_type as string | undefined;
    const webhookCode = rawPayload.webhook_code as string | undefined;
    const itemId = rawPayload.item_id as string | undefined;

    // Handle TRANSACTIONS DEFAULT_UPDATE and INVESTMENTS DEFAULT_UPDATE
    if (
      (webhookType === 'TRANSACTIONS' || webhookType === 'INVESTMENTS') &&
      webhookCode === 'DEFAULT_UPDATE' &&
      typeof itemId === 'string'
    ) {
      return { itemId, type: webhookType };
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
    const webhookType = rawPayload.webhook_type as string | undefined;
    const webhookCode = rawPayload.webhook_code as string | undefined;

    // Only handle ITEM webhooks
    if (webhookType !== 'ITEM') {
      return undefined;
    }

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
                error_message: error.error_message,
                display_message: error.display_message,
                suggested_action: error.suggested_action,
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
    const accessToken = authentication.accessToken as string;
    if (!accessToken) {
      throw new Error('Missing accessToken in authentication data');
    }

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

  // TODO: Implement Plaid link 'update' flow for using same access token to fix broken links
}
