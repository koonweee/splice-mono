import { AccountSubtype, AccountType } from 'plaid';
import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { APIAccountSchema } from './BankLink';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

export const AccountTypeSchema = z.nativeEnum(AccountType);

export const AccountSubTypeSchema = z.nativeEnum(AccountSubtype);

export const AccountSchema = registerSchema(
  'Account',
  z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      /** Mask of account number (e.g., last 4 digits) */
      mask: z.string().nullable().optional(),
      availableBalance: MoneyWithSignSchema,
      currentBalance: MoneyWithSignSchema,
      type: AccountTypeSchema,
      subType: AccountSubTypeSchema.nullable(),
      /** External account ID from bank provider (e.g., Plaid account_id) */
      externalAccountId: z.string().nullable().optional(),
      /** ID of linked BankLink (optional 1-to-1 relationship) */
      bankLinkId: z.string().nullable().optional(),
    })
    .merge(OwnedSchema),
);

export type Account = z.infer<typeof AccountSchema>;

/** AccountService arguments */

export const CreateAccountDtoSchema = registerSchema(
  'CreateAccountDto',
  z.object({
    name: z.string().nullable(),
    /** Mask of account number (e.g., last 4 digits) */
    mask: z.string().nullable().optional(),
    availableBalance: MoneyWithSignSchema,
    currentBalance: MoneyWithSignSchema,
    type: AccountTypeSchema,
    subType: AccountSubTypeSchema.nullable(),
    /** External account ID from bank provider (e.g., Plaid account_id) */
    externalAccountId: z.string().nullable().optional(),
    /** ID of BankLink to associate with this account */
    bankLinkId: z.string().nullable().optional(),
    /** Raw API account data from provider */
    rawApiAccount: APIAccountSchema.nullable().optional(),
  }),
);

export type CreateAccountDto = z.infer<typeof CreateAccountDtoSchema>;

/**
 * DTO for updating an existing Account
 */
export const UpdateAccountDtoSchema = registerSchema(
  'UpdateAccountDto',
  CreateAccountDtoSchema.partial(),
);

export type UpdateAccountDto = z.infer<typeof UpdateAccountDtoSchema>;

/**
 * Account with balances converted to user's preferred currency
 */
export const AccountWithConvertedBalanceSchema = registerSchema(
  'AccountWithConvertedBalance',
  AccountSchema.extend({
    /** Current balance converted to user's preferred currency */
    convertedCurrentBalance: MoneyWithSignSchema.nullable(),
    /** Available balance converted to user's preferred currency */
    convertedAvailableBalance: MoneyWithSignSchema.nullable(),
  }),
);

export type AccountWithConvertedBalance = z.infer<
  typeof AccountWithConvertedBalanceSchema
>;
