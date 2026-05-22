import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

export const AccountActivityKindSchema = registerSchema(
  'AccountActivityKind',
  z.enum(['banking_transaction', 'investment_transaction']),
);

export type AccountActivityKind = z.infer<typeof AccountActivityKindSchema>;

export const AccountActivityProviderSchema = registerSchema(
  'AccountActivityProvider',
  z.enum(['plaid', 'manual']),
);

export type AccountActivityProvider = z.infer<
  typeof AccountActivityProviderSchema
>;

export const AccountActivitySchema = registerSchema(
  'AccountActivity',
  z
    .object({
      id: z.string().uuid(),
      accountId: z.string().uuid(),
      provider: AccountActivityProviderSchema,
      externalActivityId: z.string().nullable(),
      activityKind: AccountActivityKindSchema,
      activityDate: z.string(),
      providerDate: z.string(),
      providerDatetime: z.string().datetime().nullable(),
      amount: MoneyWithSignSchema,
    })
    .merge(OwnedSchema),
);

export type AccountActivity = z.infer<typeof AccountActivitySchema>;
