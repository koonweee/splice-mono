import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { CategorySchema } from './Category';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

export const RecurringManualTransactionFrequencySchema = registerSchema(
  'RecurringManualTransactionFrequency',
  z.enum(['monthly']),
);

export type RecurringManualTransactionFrequency = z.infer<
  typeof RecurringManualTransactionFrequencySchema
>;

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RecurringManualTransactionScheduleSchema = registerSchema(
  'RecurringManualTransactionSchedule',
  z
    .object({
      id: z.string().uuid(),
      accountId: z.string().uuid(),
      accountName: z.string().nullable().optional(),
      amount: MoneyWithSignSchema,
      merchantName: z.string(),
      categoryId: z.string().uuid(),
      category: CategorySchema.nullable().optional(),
      frequency: RecurringManualTransactionFrequencySchema,
      dayOfMonth: z.number().int().min(1).max(31),
      startDate: DateOnlySchema,
      endDate: DateOnlySchema.nullable(),
      nextOccurrenceDate: DateOnlySchema.nullable(),
      lastGeneratedOccurrenceDate: DateOnlySchema.nullable(),
      pausedAt: z.coerce.date().nullable(),
      archivedAt: z.coerce.date().nullable(),
    })
    .merge(OwnedSchema),
);

export type RecurringManualTransactionSchedule = z.infer<
  typeof RecurringManualTransactionScheduleSchema
>;

export const RecurringManualTransactionOccurrenceSchema = registerSchema(
  'RecurringManualTransactionOccurrence',
  z
    .object({
      id: z.string().uuid(),
      scheduleId: z.string().uuid(),
      occurrenceDate: DateOnlySchema,
      transactionId: z.string().uuid(),
      generatedAt: z.coerce.date(),
    })
    .merge(OwnedSchema),
);

export type RecurringManualTransactionOccurrence = z.infer<
  typeof RecurringManualTransactionOccurrenceSchema
>;

const RecurringManualTransactionAmountSchema = MoneyWithSignSchema.refine(
  (amount) => amount.money.amount !== '0',
  {
    message: 'Recurring manual transaction amount must be positive',
    path: ['money', 'amount'],
  },
);

export const CreateRecurringManualTransactionScheduleDtoSchema = registerSchema(
  'CreateRecurringManualTransactionScheduleDto',
  z.object({
    accountId: z.string().uuid(),
    amount: RecurringManualTransactionAmountSchema,
    merchantName: z.string().trim().min(1),
    categoryId: z.string().uuid(),
    frequency: RecurringManualTransactionFrequencySchema.default('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    startDate: DateOnlySchema,
    endDate: DateOnlySchema.nullable().optional(),
  }),
);

export type CreateRecurringManualTransactionScheduleDto = z.infer<
  typeof CreateRecurringManualTransactionScheduleDtoSchema
>;

export const UpdateRecurringManualTransactionScheduleDtoSchema = registerSchema(
  'UpdateRecurringManualTransactionScheduleDto',
  z.object({
    accountId: z.string().uuid().optional(),
    amount: RecurringManualTransactionAmountSchema.optional(),
    merchantName: z.string().trim().min(1).optional(),
    categoryId: z.string().uuid().optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    startDate: DateOnlySchema.optional(),
    endDate: DateOnlySchema.nullable().optional(),
    paused: z.boolean().optional(),
  }),
);

export type UpdateRecurringManualTransactionScheduleDto = z.infer<
  typeof UpdateRecurringManualTransactionScheduleDtoSchema
>;
