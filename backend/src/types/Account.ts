import { AccountSubtype, AccountType } from 'plaid';
import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { CryptoAccountType } from './AccountType';
import { APIAccountSchema, SanitizedBankLinkSchema } from './BankLink';
import { CurrentAndAvailableBalanceSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

/**
 * Account type schema that accepts both Plaid banking types and crypto types
 */
export const AccountTypeSchema = z.union([
  z.nativeEnum(AccountType),
  z.nativeEnum(CryptoAccountType),
]);

export const AccountSubTypeSchema = z.nativeEnum(AccountSubtype);

export const AccountSchema = registerSchema(
  'Account',
  z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      customName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      /** Mask of account number (e.g., last 4 digits) */
      mask: z.string().nullable().optional(),
      type: AccountTypeSchema,
      subType: AccountSubTypeSchema.nullable(),
      /** External account ID from bank provider (e.g., Plaid account_id) */
      externalAccountId: z.string().nullable().optional(),
      /** ID of linked BankLink (optional 1-to-1 relationship) */
      bankLinkId: z.string().nullable().optional(),
      /** Embedded bank link data (sanitized - no authentication) */
      bankLink: SanitizedBankLinkSchema.nullable().optional(),
      /** When set, the account is hidden from default account lists. */
      archivedAt: z.date().nullable().optional(),
      /** Latest non-forward-filled snapshot sync time */
      syncedAt: z.date().optional(),
    })
    .merge(CurrentAndAvailableBalanceSchema)
    .merge(OwnedSchema),
);

export type Account = z.infer<typeof AccountSchema>;

/** AccountService arguments */

/** Internal account persistence shape used by provider ingestion. */
export const CreateAccountDtoSchema = z
  .object({
    name: z.string().nullable(),
    customName: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    /** Mask of account number (e.g., last 4 digits) */
    mask: z.string().nullable().optional(),
    type: AccountTypeSchema,
    subType: AccountSubTypeSchema.nullable(),
    /** External account ID from bank provider (e.g., Plaid account_id) */
    externalAccountId: z.string().nullable().optional(),
    /** ID of BankLink to associate with this account */
    bankLinkId: z.string().nullable().optional(),
    /** Raw API account data from provider */
    rawApiAccount: APIAccountSchema.nullable().optional(),
  })
  .merge(CurrentAndAvailableBalanceSchema);

export type CreateAccountDto = z.infer<typeof CreateAccountDtoSchema>;

/** Public manual-account creation shape. */
export const CreateManualAccountDtoSchema = registerSchema(
  'CreateManualAccountDto',
  z
    .object({
      name: z.string().nullable(),
      customName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      type: AccountTypeSchema,
      subType: AccountSubTypeSchema.nullable(),
    })
    .merge(CurrentAndAvailableBalanceSchema)
    .strict(),
);

export type CreateManualAccountDto = z.infer<
  typeof CreateManualAccountDtoSchema
>;

export const UpdateAccountMetadataDtoSchema = registerSchema(
  'UpdateAccountMetadataDto',
  z
    .object({
      name: z.string().nullable().optional(),
      customName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .strict(),
);

export type UpdateAccountMetadataDto = z.infer<
  typeof UpdateAccountMetadataDtoSchema
>;
