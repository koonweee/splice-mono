import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

/**
 * Transaction schema for financial transactions linked to accounts.
 */
export const TransactionSchema = registerSchema(
  'Transaction',
  z
    .object({
      id: z.string().uuid(),
      /** Amount with sign (positive/negative) and currency */
      amount: MoneyWithSignSchema,
      /** Account this transaction belongs to */
      accountId: z.string().uuid(),
      /** Merchant name (e.g., "Starbucks") */
      merchantName: z.string().nullable(),
      /** Whether the transaction is pending (unsettled) */
      pending: z.boolean(),
      /** External transaction ID from provider (e.g., Plaid transaction_id) */
      externalTransactionId: z.string().nullable(),
      /** Logo URL for the merchant */
      logoUrl: z.string().nullable(),
      /** Transaction date (yyyy-mm-dd format) - occurrence date for pending, posted date for posted */
      date: z.string(),
      /** Transaction datetime with time info (nullable) */
      datetime: z.string().datetime().nullable(),
      /** Date the transaction was authorized (yyyy-mm-dd format) */
      authorizedDate: z.string().nullable(),
      /** Datetime the transaction was authorized with time info */
      authorizedDatetime: z.string().datetime().nullable(),
      /** Category ID for transaction categorization (nullable) */
      categoryId: z.string().uuid().nullable(),
    })
    .merge(OwnedSchema),
);

export type Transaction = z.infer<typeof TransactionSchema>;

/**
 * DTO for creating a new Transaction
 */
export const CreateTransactionDtoSchema = registerSchema(
  'CreateTransactionDto',
  z.object({
    amount: MoneyWithSignSchema,
    accountId: z.string().uuid(),
    merchantName: z.string().nullable().optional(),
    pending: z.boolean(),
    externalTransactionId: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    date: z.string(),
    datetime: z.string().datetime().nullable().optional(),
    authorizedDate: z.string().nullable().optional(),
    authorizedDatetime: z.string().datetime().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
  }),
);

export type CreateTransactionDto = z.infer<typeof CreateTransactionDtoSchema>;

/**
 * DTO for updating an existing Transaction
 */
export const UpdateTransactionDtoSchema = registerSchema(
  'UpdateTransactionDto',
  CreateTransactionDtoSchema.partial(),
);

export type UpdateTransactionDto = z.infer<typeof UpdateTransactionDtoSchema>;
