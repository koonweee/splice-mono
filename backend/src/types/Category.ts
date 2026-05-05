import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { TimestampsSchema } from './Timestamps';

/**
 * Category schema for transaction categorization.
 * This is a reference entity - categories are global/shared across all users.
 */
export const CategorySchema = registerSchema(
  'Category',
  z
    .object({
      id: z.string().uuid(),
      /** Primary category (e.g., "Food and Drink") */
      primary: z.string(),
      /** Detailed category (e.g., "Restaurants") */
      detailed: z.string(),
      /** Description of the category */
      description: z.string(),
      /** Category source: Plaid taxonomy or user-created */
      source: z.enum(['plaid', 'user']).default('plaid'),
      /** Owning user for custom categories */
      userId: z.string().uuid().nullable().default(null),
      /** Archive timestamp for user-created categories hidden from selectors */
      archivedAt: z.coerce.date().nullable().default(null),
    })
    .merge(TimestampsSchema),
);

export type Category = z.infer<typeof CategorySchema>;

export const CreateCustomCategoryDtoSchema = registerSchema(
  'CreateCustomCategoryDto',
  z.object({
    primary: z.string().trim().min(1).max(80),
    detailed: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
  }),
);

export type CreateCustomCategoryDto = z.infer<
  typeof CreateCustomCategoryDtoSchema
>;

export const UpdateCustomCategoryDtoSchema = registerSchema(
  'UpdateCustomCategoryDto',
  z.object({
    primary: z.string().trim().min(1).max(80).optional(),
    detailed: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    archived: z.boolean().optional(),
  }),
);

export type UpdateCustomCategoryDto = z.infer<
  typeof UpdateCustomCategoryDtoSchema
>;

export const CategoryConflictSchema = registerSchema(
  'CategoryConflict',
  z.object({
    categoryId: z.string().uuid(),
    label: z.string(),
    primary: z.string(),
    detailed: z.string(),
    source: z.enum(['plaid', 'user']),
  }),
);

export type CategoryConflict = z.infer<typeof CategoryConflictSchema>;
