import { z } from 'zod';
import { CategorySchema } from './Category';
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
      /** Joined category details (nullable) */
      category: CategorySchema.nullable().optional(),
      /** Display name of the associated account (customName or name) */
      accountName: z.string().nullable().optional(),
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
    /** Plaid personal_finance_category strings for category resolution */
    personalFinanceCategory: z
      .object({
        primary: z.string(),
        detailed: z.string(),
      })
      .optional(),
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

/**
 * Paginated transaction response with metadata for table rendering
 */
export const PaginatedTransactionResponseSchema = registerSchema(
  'PaginatedTransactionResponse',
  z.object({
    data: z.array(TransactionSchema),
    total: z.number().int(),
    pageIndex: z.number().int(),
    pageSize: z.number().int(),
  }),
);

export type PaginatedTransactionResponse = z.infer<
  typeof PaginatedTransactionResponseSchema
>;
