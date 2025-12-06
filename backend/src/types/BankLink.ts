import { AccountSubtype, AccountType } from 'plaid';
import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

/**
 * Request to initiate bank account linking
 */
export const InitiateLinkRequestSchema = registerSchema(
  'InitiateLinkRequest',
  z.object({
    accountId: z.string(), // Internal Account ID to link
    redirectUri: z.string().optional(), // Optional redirect after linking
  }),
);

export type InitiateLinkRequest = z.infer<typeof InitiateLinkRequestSchema>;

/**
 * Response from initiating bank account linking
 */
export const InitiateLinkResponseSchema = registerSchema(
  'InitiateLinkResponse',
  z.object({
    /** URL for user to add their banks (ie. Plaid's Link flow) */
    linkUrl: z.string().optional(),
    /** When the link expires */
    expiresAt: z.date().optional(),
  }),
);

export type InitiateLinkResponse = z.infer<typeof InitiateLinkResponseSchema>;

export const APIAccountSchema = z.object({
  /** ID of account on external API */
  accountId: z.string(),
  /** Name of account */
  name: z.string(),
  /** Mask of account number */
  mask: z.string().nullable(),
  /** Type of account */
  type: z.nativeEnum(AccountType),
  /** Subtype of account */
  subType: z.nativeEnum(AccountSubtype).nullable(),
  /** Available balance */
  availableBalance: MoneyWithSignSchema,
  /** Current balance */
  currentBalance: MoneyWithSignSchema,
});

export type APIAccount = z.infer<typeof APIAccountSchema>;

/**
 * Institution info from the bank provider
 */
export const InstitutionSchema = z.object({
  /** External institution ID from provider (e.g., Plaid institution_id) */
  id: z.string().nullable().optional(),
  /** Institution name (e.g., "Chase", "Bank of America") */
  name: z.string().nullable().optional(),
});

export type Institution = z.infer<typeof InstitutionSchema>;

/**
 * Bank Link - represents a connection to an external bank provider
 */
export const BankLinkSchema = z
  .object({
    /** Unique identifier */
    id: z.string().uuid(),
    /** Provider name (e.g., 'plaid', 'simplefin') */
    providerName: z.string(),
    /** Provider-specific authentication data */
    authentication: z.record(z.string(), z.any()),
    /** Array of linked account IDs */
    accountIds: z.array(z.string()),
    /** Institution ID from provider */
    institutionId: z.string().nullable().optional(),
    /** Institution name */
    institutionName: z.string().nullable().optional(),
  })
  .merge(OwnedSchema);

export type BankLink = z.infer<typeof BankLinkSchema>;

/**
 * DTO for creating a new BankLink (excludes id, userId, and timestamps which are auto-generated)
 */
export const CreateBankLinkDtoSchema = BankLinkSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateBankLinkDto = z.infer<typeof CreateBankLinkDtoSchema>;

/**
 * DTO for updating an existing BankLink
 */
export const UpdateBankLinkDtoSchema = CreateBankLinkDtoSchema.partial();

export type UpdateBankLinkDto = z.infer<typeof UpdateBankLinkDtoSchema>;

/**
 * Response from initiating a link flow
 */
export const LinkInitiationResponseSchema = z.object({
  /** URL for user to add their banks (ie. Plaid's Link flow) */
  linkUrl: z.string().optional(),
  /** When the link expires */
  expiresAt: z.date().optional(),
  /**
   * Unique ID for matching webhooks
   * This is set to link token to match the initial create request to the webhook response
   * */
  webhookId: z.string(),
  /** Provider-specific data */
  metadata: z.record(z.string(), z.any()).optional(),
  /**
   * Updated provider-specific user details to persist
   * If returned, these will replace the user's existing provider details for this provider
   */
  updatedProviderUserDetails: z.record(z.string(), z.unknown()).optional(),
});

export type LinkInitiationResponse = z.infer<
  typeof LinkInitiationResponseSchema
>;

/**
 * Response after processing webhook/linking accounts
 *
 * Account name, identifier and authentication data
 */
export const LinkCompletionResponseSchema = z.object({
  /** Account authentication data */
  authentication: z.record(z.string(), z.any()),
  accounts: z.array(APIAccountSchema),
  /** Institution info from the provider */
  institution: InstitutionSchema.optional(),
});

export type LinkCompletionResponse = z.infer<
  typeof LinkCompletionResponseSchema
>;

/**
 * Response from getAccounts - includes accounts and institution metadata
 */
export const GetAccountsResponseSchema = z.object({
  accounts: z.array(APIAccountSchema),
  /** Institution info from the provider */
  institution: InstitutionSchema.optional(),
});

export type GetAccountsResponse = z.infer<typeof GetAccountsResponseSchema>;
