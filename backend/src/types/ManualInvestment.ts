import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

export const ManualInvestmentHoldingSchema = registerSchema(
  'ManualInvestmentHolding',
  z.object({
    id: z.string().uuid(),
    instrumentId: z.string().uuid(),
    symbol: z.string(),
    displayName: z.string().nullable().optional(),
    quantity: z.number().positive(),
  }),
);

export type ManualInvestmentHolding = z.infer<
  typeof ManualInvestmentHoldingSchema
>;

export const ReplaceManualInvestmentHoldingDtoSchema = registerSchema(
  'ReplaceManualInvestmentHoldingDto',
  z.object({
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9._-]+$/, 'Symbol must be alphanumeric'),
    displayName: z.string().trim().min(1).max(100).nullable().optional(),
    quantity: z.number().positive(),
  }),
);

export type ReplaceManualInvestmentHoldingDto = z.infer<
  typeof ReplaceManualInvestmentHoldingDtoSchema
>;

export const ManualInvestmentSnapshotSchema = registerSchema(
  'ManualInvestmentSnapshot',
  z
    .object({
      id: z.string().uuid(),
      accountId: z.string().uuid(),
      snapshotDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
      holdings: z.array(ManualInvestmentHoldingSchema),
    })
    .merge(
      z.object({
        cashBalance: MoneyWithSignSchema,
      }),
    )
    .merge(OwnedSchema),
);

export type ManualInvestmentSnapshot = z.infer<
  typeof ManualInvestmentSnapshotSchema
>;

export const ReplaceManualInvestmentSnapshotDtoSchema = registerSchema(
  'ReplaceManualInvestmentSnapshotDto',
  z.object({
    cashBalance: MoneyWithSignSchema,
    holdings: z.array(ReplaceManualInvestmentHoldingDtoSchema),
  }),
);

export type ReplaceManualInvestmentSnapshotDto = z.infer<
  typeof ReplaceManualInvestmentSnapshotDtoSchema
>;
