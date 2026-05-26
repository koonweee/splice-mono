import { z } from 'zod';
import { CategorySchema } from './Category';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

const ProviderJsonObjectSchema = z.record(z.string(), z.unknown());

export const TransactionSourceSchema = registerSchema(
  'TransactionSource',
  z.enum(['provider', 'manual']),
);

export type TransactionSource = z.infer<typeof TransactionSourceSchema>;

export const CategoryAssignmentSourceSchema = registerSchema(
  'CategoryAssignmentSource',
  z.enum(['manual', 'rule']),
);

export type CategoryAssignmentSource = z.infer<
  typeof CategoryAssignmentSourceSchema
>;

export const ProviderCategoryHintSchema = registerSchema(
  'ProviderCategoryHint',
  z.object({
    /** Banking provider that supplied this category hint. */
    provider: z.literal('plaid'),
    /** Raw provider primary category code. Not an app category. */
    primary: z.string().nullable(),
    /** Raw provider detailed category code. Not an app category. */
    detailed: z.string().nullable(),
    /** Human-readable label derived from provider category fields. */
    displayLabel: z.string().nullable(),
    /** Provider confidence level for this category hint. */
    confidenceLevel: z.string().nullable(),
    /** Provider icon URL for this category hint. */
    iconUrl: z.string().nullable(),
  }),
);

export type ProviderCategoryHint = z.infer<typeof ProviderCategoryHintSchema>;

/**
 * Transaction schema for financial transactions linked to accounts.
 */
export const TransactionSchema = registerSchema(
  'Transaction',
  z
    .object({
      id: z.string().uuid(),
      /** Transaction origin: provider-synced or user-created manual entry */
      source: TransactionSourceSchema,
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
      /** Provider-extracted counterparties for this transaction */
      counterparties: z.array(ProviderJsonObjectSchema).nullable(),
      /** Provider location metadata for this transaction */
      location: ProviderJsonObjectSchema.nullable(),
      /** Provider payment metadata for this transaction */
      paymentMeta: ProviderJsonObjectSchema.nullable(),
      /** User-facing activity date (yyyy-mm-dd format): reportingDateOverride when set, otherwise authorizedDate when available, otherwise providerDate */
      activityDate: z.string(),
      /** User-selected reporting date override used for activityDate when present */
      reportingDateOverride: z.string().nullable(),
      /** Provider transaction date from Plaid (pending occurrence date while pending, posted date when posted) */
      providerDate: z.string(),
      /** Provider transaction datetime with time info (nullable) */
      providerDatetime: z.string().datetime().nullable(),
      /** Date the transaction was authorized (yyyy-mm-dd format) */
      authorizedDate: z.string().nullable(),
      /** Datetime the transaction was authorized with time info */
      authorizedDatetime: z.string().datetime().nullable(),
      /** User category ID for transaction categorization (nullable means uncategorized) */
      categoryId: z.string().uuid().nullable(),
      /** Joined user category details (nullable means uncategorized) */
      category: CategorySchema.nullable().optional(),
      /** When the user category was last updated */
      categoryUpdatedAt: z.coerce.date().nullable(),
      /** How the effective app category was assigned. */
      categoryAssignmentSource: CategoryAssignmentSourceSchema.nullable(),
      /** Categorization rule that assigned the effective app category. */
      categoryAssignmentRuleId: z.string().uuid().nullable(),
      /** Provider-supplied category guidance. Never used as the app category. */
      providerCategoryHint: ProviderCategoryHintSchema.nullable(),
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
    providerPayload: ProviderJsonObjectSchema.nullable().optional(),
    providerDate: z.string(),
    providerDatetime: z.string().datetime().nullable().optional(),
    authorizedDate: z.string().nullable().optional(),
    authorizedDatetime: z.string().datetime().nullable().optional(),
    reportingDateOverride: z.string().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    /** Plaid personal_finance_category strings stored as provider guidance */
    personalFinanceCategory: z
      .object({
        primary: z.string().nullable(),
        detailed: z.string().nullable(),
      })
      .optional(),
  }),
);

export type CreateTransactionDto = z.infer<typeof CreateTransactionDtoSchema>;

const ManualTransactionAmountSchema = MoneyWithSignSchema.refine(
  (amount) => amount.money.amount > 0,
  {
    message: 'Manual transaction amount must be positive',
    path: ['money', 'amount'],
  },
);

const ManualTransactionDtoShape = {
  accountId: z.string().uuid(),
  amount: ManualTransactionAmountSchema,
  merchantName: z.string().trim().min(1),
  providerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().uuid(),
};

export const CreateManualTransactionDtoSchema = registerSchema(
  'CreateManualTransactionDto',
  z.object(ManualTransactionDtoShape),
);

export type CreateManualTransactionDto = z.infer<
  typeof CreateManualTransactionDtoSchema
>;

export const UpdateManualTransactionDtoSchema = registerSchema(
  'UpdateManualTransactionDto',
  z.object(ManualTransactionDtoShape),
);

export type UpdateManualTransactionDto = z.infer<
  typeof UpdateManualTransactionDtoSchema
>;

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

export const BulkTransactionCategoryUpdateDtoSchema = registerSchema(
  'BulkTransactionCategoryUpdateDto',
  z.object({
    transactionIds: z.array(z.string().uuid()).min(1),
    /** Selected user category ID. Null clears the transaction to uncategorized. */
    categoryId: z.string().uuid().nullable(),
  }),
);

export type BulkTransactionCategoryUpdateDto = z.infer<
  typeof BulkTransactionCategoryUpdateDtoSchema
>;

export const BulkTransactionCategoryUpdateUndoDtoSchema = registerSchema(
  'BulkTransactionCategoryUpdateUndoDto',
  z.object({
    undo: z.string().min(1),
  }),
);

export type BulkTransactionCategoryUpdateUndoDto = z.infer<
  typeof BulkTransactionCategoryUpdateUndoDtoSchema
>;

export const BulkTransactionCategoryUpdateResponseSchema = registerSchema(
  'BulkTransactionCategoryUpdateResponse',
  z.object({
    count: z.number().int(),
    transactionIds: z.array(z.string().uuid()),
    undo: z.string(),
  }),
);

export type BulkTransactionCategoryUpdateResponse = z.infer<
  typeof BulkTransactionCategoryUpdateResponseSchema
>;

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
