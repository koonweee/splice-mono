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
    archivedAt: z.coerce.date().nullable().default(null),
    isHidden: z.boolean().optional(),
  }),
);

export type CategoryConflict = z.infer<typeof CategoryConflictSchema>;

export const CategoryManagementItemSchema = registerSchema(
  'CategoryManagementItem',
  CategorySchema.extend({
    isHidden: z.boolean(),
    isSelectable: z.boolean(),
    transactionCount: z.number().int().nonnegative().optional(),
    lastUsedAt: z.string().nullable().optional(),
  }),
);

export type CategoryManagementItem = z.infer<
  typeof CategoryManagementItemSchema
>;

export const BulkCategoryVisibilityDtoSchema = registerSchema(
  'BulkCategoryVisibilityDto',
  z.object({
    categoryIds: z.array(z.string().uuid()).min(1).max(500),
    hidden: z.boolean(),
  }),
);

export type BulkCategoryVisibilityDto = z.infer<
  typeof BulkCategoryVisibilityDtoSchema
>;

export const BulkCustomCategoryActionDtoSchema = registerSchema(
  'BulkCustomCategoryActionDto',
  z.discriminatedUnion('action', [
    z.object({
      categoryIds: z.array(z.string().uuid()).min(1).max(500),
      action: z.literal('archive'),
    }),
    z.object({
      categoryIds: z.array(z.string().uuid()).min(1).max(500),
      action: z.literal('restore'),
    }),
    z.object({
      categoryIds: z.array(z.string().uuid()).min(1).max(500),
      action: z.literal('setPrimary'),
      primary: z.string().trim().min(1).max(80),
    }),
  ]),
);

export type BulkCustomCategoryActionDto = z.infer<
  typeof BulkCustomCategoryActionDtoSchema
>;

export const BulkCategoryActionResponseSchema = registerSchema(
  'BulkCategoryActionResponse',
  z.object({
    requested: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.array(
      z.object({
        categoryId: z.string().uuid(),
        reason: z.enum([
          'not_found',
          'not_owned',
          'system_category',
          'archived',
          'duplicate_conflict',
        ]),
      }),
    ),
  }),
);

export type BulkCategoryActionResponse = z.infer<
  typeof BulkCategoryActionResponseSchema
>;
