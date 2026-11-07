import { z } from 'zod';
import { DECIMAL_PATTERN, ExactDecimal } from './exact-money';

const PercentageSchema = z.string().max(100).regex(DECIMAL_PATTERN);
export const ExpectedValuePercentSchema = PercentageSchema.pipe(
  z
    .string()
    .refine(
      (value) =>
        new ExactDecimal(value).isFinite() && new ExactDecimal(value).gt(0),
      'Expected value must be greater than zero',
    ),
);
export const ExpectedTaxPercentSchema = PercentageSchema.pipe(
  z
    .string()
    .refine(
      (value) =>
        new ExactDecimal(value).gte(0) && new ExactDecimal(value).lte(100),
      'Expected tax must be between zero and 100',
    ),
);
export const AccountValueAdjustmentsSchema = z.object({
  expectedValuePercent: ExpectedValuePercentSchema.optional(),
  expectedTaxPercent: ExpectedTaxPercentSchema.optional(),
});
export type AccountValueAdjustments = z.infer<
  typeof AccountValueAdjustmentsSchema
>;
