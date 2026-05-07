import { z } from 'zod';
import { CategorySchema } from './Category';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

export const TransactionCategoryReviewMethodSchema = registerSchema(
  'TransactionCategoryReviewMethod',
  z.enum(['manual_accept', 'manual_change', 'bulk_accept']),
);

export type TransactionCategoryReviewMethod = z.infer<
  typeof TransactionCategoryReviewMethodSchema
>;

export const TransactionCategoryReviewStatusSchema = registerSchema(
  'TransactionCategoryReviewStatus',
  z.enum(['needs_review', 'reviewed']),
);

export type TransactionCategoryReviewStatus = z.infer<
  typeof TransactionCategoryReviewStatusSchema
>;

const ProviderJsonObjectSchema = z.record(z.string(), z.unknown());

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
      /** Provider's raw transaction name/description */
      providerTransactionName: z.string().nullable(),
      /** Original transaction description from the financial institution */
      originalDescription: z.string().nullable(),
      /** Whether the transaction is pending (unsettled) */
      pending: z.boolean(),
      /** Provider ID of the related pending transaction, when available */
      pendingTransactionId: z.string().nullable(),
      /** Account owner supplied by the provider, when available */
      accountOwner: z.string().nullable(),
      /** External transaction ID from provider (e.g., Plaid transaction_id) */
      externalTransactionId: z.string().nullable(),
      /** Logo URL for the merchant */
      logoUrl: z.string().nullable(),
      /** Website URL associated with the merchant */
      website: z.string().nullable(),
      /** Stable provider merchant entity ID */
      merchantEntityId: z.string().nullable(),
      /** Channel used to make the payment */
      paymentChannel: z.string().nullable(),
      /** Provider transaction code */
      transactionCode: z.string().nullable(),
      /** Icon URL for the provider's personal finance category */
      personalFinanceCategoryIconUrl: z.string().nullable(),
      /** Provider confidence level for the personal finance category */
      personalFinanceCategoryConfidenceLevel: z.string().nullable(),
      /** Provider-extracted counterparties for this transaction */
      counterparties: z.array(ProviderJsonObjectSchema).nullable(),
      /** Provider location metadata for this transaction */
      location: ProviderJsonObjectSchema.nullable(),
      /** Provider payment metadata for this transaction */
      paymentMeta: ProviderJsonObjectSchema.nullable(),
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
      /** User-selected category override ID (nullable) */
      userCategoryId: z.string().uuid().nullable(),
      /** Joined user-selected category override details (nullable) */
      userCategory: CategorySchema.nullable().optional(),
      /** When the user category override was last updated */
      userCategoryUpdatedAt: z.coerce.date().nullable(),
      /** Category ID used for user-facing display and aggregation */
      effectiveCategoryId: z.string().uuid().nullable(),
      /** Category used for user-facing display and aggregation */
      effectiveCategory: CategorySchema.nullable().optional(),
      /** When the category was reviewed by the user */
      categoryReviewedAt: z.coerce.date().nullable(),
      /** How the category review was completed */
      categoryReviewMethod: TransactionCategoryReviewMethodSchema.nullable(),
      /** Whether the category still needs user review */
      categoryNeedsReview: z.boolean(),
      /** Display name of the associated account (customName or name) */
      accountName: z.string().nullable().optional(),
      /** Converted amount in user's preferred currency (set when convert=true) */
      convertedAmount: MoneyWithSignSchema.nullable().optional(),
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
    providerTransactionName: z.string().nullable().optional(),
    originalDescription: z.string().nullable().optional(),
    pending: z.boolean(),
    pendingTransactionId: z.string().nullable().optional(),
    accountOwner: z.string().nullable().optional(),
    externalTransactionId: z.string().nullable().optional(),
    logoUrl: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    merchantEntityId: z.string().nullable().optional(),
    paymentChannel: z.string().nullable().optional(),
    transactionCode: z.string().nullable().optional(),
    personalFinanceCategoryIconUrl: z.string().nullable().optional(),
    personalFinanceCategoryConfidenceLevel: z.string().nullable().optional(),
    counterparties: z.array(ProviderJsonObjectSchema).nullable().optional(),
    location: ProviderJsonObjectSchema.nullable().optional(),
    paymentMeta: ProviderJsonObjectSchema.nullable().optional(),
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

export const UpdateTransactionCategoryDtoSchema = registerSchema(
  'UpdateTransactionCategoryDto',
  z.object({
    /** Selected category ID. Null clears the user override. */
    categoryId: z.string().uuid().nullable(),
  }),
);

export type UpdateTransactionCategoryDto = z.infer<
  typeof UpdateTransactionCategoryDtoSchema
>;

export const UpdateTransactionCategoryReviewDtoSchema = registerSchema(
  'UpdateTransactionCategoryReviewDto',
  z.object({
    reviewed: z.boolean(),
  }),
);

export type UpdateTransactionCategoryReviewDto = z.infer<
  typeof UpdateTransactionCategoryReviewDtoSchema
>;

export const BulkTransactionCategoryReviewFiltersSchema = registerSchema(
  'BulkTransactionCategoryReviewFilters',
  z.object({
    accountId: z.string().uuid().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    categoryPrimary: z.string().optional(),
    amountSign: z.enum(['positive', 'negative']).optional(),
    categoryReviewStatus: TransactionCategoryReviewStatusSchema.optional(),
  }),
);

export type BulkTransactionCategoryReviewFilters = z.infer<
  typeof BulkTransactionCategoryReviewFiltersSchema
>;

export const BulkTransactionCategoryReviewDtoSchema = registerSchema(
  'BulkTransactionCategoryReviewDto',
  z.object({
    filters: BulkTransactionCategoryReviewFiltersSchema.default({}),
  }),
);

export type BulkTransactionCategoryReviewDto = z.infer<
  typeof BulkTransactionCategoryReviewDtoSchema
>;

export const BulkTransactionCategoryReviewUndoDtoSchema = registerSchema(
  'BulkTransactionCategoryReviewUndoDto',
  z.object({
    transactionIds: z.array(z.string().uuid()),
  }),
);

export type BulkTransactionCategoryReviewUndoDto = z.infer<
  typeof BulkTransactionCategoryReviewUndoDtoSchema
>;

export const BulkTransactionCategoryReviewResponseSchema = registerSchema(
  'BulkTransactionCategoryReviewResponse',
  z.object({
    count: z.number().int(),
    transactionIds: z.array(z.string().uuid()),
  }),
);

export type BulkTransactionCategoryReviewResponse = z.infer<
  typeof BulkTransactionCategoryReviewResponseSchema
>;

export const TransactionSummarySchema = registerSchema(
  'TransactionSummary',
  z.object({
    currency: z.string(),
    inflow: MoneyWithSignSchema,
    outflow: MoneyWithSignSchema,
    net: MoneyWithSignSchema,
    transactionCount: z.number().int(),
    pendingCount: z.number().int(),
    needsReviewCount: z.number().int(),
  }),
);

export type TransactionSummary = z.infer<typeof TransactionSummarySchema>;

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
