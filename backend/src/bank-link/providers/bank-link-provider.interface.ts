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
   * @param userId - User ID
   * @param redirectUri - Optional redirect URL after linking
   * @param providerUserDetails - Existing provider-specific user details (provider should validate with Zod)
   * @returns Link information including linkRequestId for webhook matching
   */
  initiateLinking(input: {
    userId: string;
    redirectUri?: string;
    providerUserDetails?: Record<string, unknown>;
  }): Promise<LinkInitiationResponse>;

  /**
   * Parse link completion webhooks that signal a user has finished the linking flow
   * Optional - only implemented by providers that support webhook-driven link completion
   * (e.g., Plaid SESSION_FINISHED webhook)
   *
   * @param rawPayload - Raw webhook payload
   * @returns Link token if this is a link completion webhook, undefined otherwise
   */
  parseLinkCompletionWebhook?(
    rawPayload: Record<string, any>,
  ): { linkToken: string } | undefined;

  /**
   * Process a link completion webhook payload
   * Called after parseLinkCompletionWebhook identifies this as a link completion webhook
   *
   * @param rawPayload - Raw webhook body
   * @returns Array of link completion responses (each corresponds to a linked account to be created)
   */
  processLinkCompletion?(
    rawPayload: Record<string, any>,
  ): Promise<LinkCompletionResponse[]>;

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

  /**
   * Parse status webhooks that signal bank link status changes
   * Optional - only implemented by providers that support status webhooks
   * (e.g., Plaid ITEM webhooks: ERROR, LOGIN_REPAIRED, PENDING_DISCONNECT, PENDING_EXPIRATION)
   *
   * @param rawPayload - Raw webhook payload
   * @returns Status webhook info if this is a status webhook, undefined otherwise
   */
  parseStatusWebhook?(rawPayload: Record<string, any>):
    | {
        itemId: string;
        webhookCode: string;
        status: 'OK' | 'ERROR' | 'PENDING_REAUTH';
        statusBody: Record<string, any> | null;
        shouldSync: boolean;
      }
    | undefined;

  /**
   * Update the webhook URL for an item
   * Optional - only implemented by providers that support webhook URL updates
   *
   * @param authentication - Provider-specific authentication data
   * @returns void
   */
  updateWebhookUrl?(authentication: Record<string, any>): Promise<void>;
}
