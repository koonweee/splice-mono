import type {
  GetAccountsResponse,
  LinkCompletionResponse,
  LinkInitiationResponse,
} from '../../types/BankLink';

/**
 * Interface that all bank link providers must implement
 */
export interface IBankLinkProvider {
  /**
   * Provider identifier (e.g., 'plaid', 'simplefin')
   */
  readonly providerName: string;

  /**
   * Step 1: Initiate linking flow
   * Generate link URL/token for frontend and return tracking ID
   *
   * @param internalAccountId - Our internal Account ID
   * @param userId - User ID
   * @param redirectUri - Optional redirect URL after linking
   * @param providerUserDetails - Existing provider-specific user details (provider should validate with Zod)
   * @returns Link information including linkRequestId for webhook matching
   */
  initiateLinking(input: {
    internalAccountId: string;
    userId: string;
    redirectUri?: string;
    providerUserDetails?: Record<string, unknown>;
  }): Promise<LinkInitiationResponse>;

  /**
   * Helper function to decide if a webhook should be processed
   *
   * Returns webhook ID if should be processed, otherwise undefined
   */
  shouldProcessWebhook(rawPayload: any): string | undefined;

  /**
   * Step 2: Process webhook from provider
   * Process webhook response from provider
   *
   * @param rawPayload - Raw webhook body
   * @param getWebhookIdProcessed - Function to check if webhook has been processed
   * @returns Array of link completion responses (each corresponds to a linked account to be created) or undefined if webhook is not processed
   */
  processWebhook(
    rawPayload: any,
  ): Promise<LinkCompletionResponse[] | undefined>;

  /**
   * Fetch accounts from the provider using stored authentication
   *
   * @param authentication - Provider-specific authentication data (e.g., { accessToken: string } for Plaid)
   * @returns Accounts and institution info from the provider
   */
  getAccounts(
    authentication: Record<string, any>,
  ): Promise<GetAccountsResponse>;

  /**
   * Verify that a webhook is genuine and from the provider
   *
   * @param rawBody - Raw webhook body as string (must preserve original formatting for hash verification)
   * @param headers - HTTP headers from the webhook request
   * @returns true if webhook is verified, false otherwise
   */
  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean>;

  /**
   * Parse update webhooks that signal the provider has new data available
   * Optional - only implemented by providers that support webhook-driven updates
   *
   * @param rawPayload - Raw webhook payload
   * @returns Item identifier and webhook type if this is an update webhook, undefined otherwise
   */
  parseUpdateWebhook?(
    rawPayload: Record<string, any>,
  ): { itemId: string; type: string } | undefined;

  /**
   * Get the external item ID from the provider
   * Optional - used for backfilling item IDs for existing links
   *
   * @param authentication - Provider-specific authentication data
   * @returns The external item ID
   */
  getItemId?(authentication: Record<string, any>): Promise<string>;
}
