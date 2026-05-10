import { z } from 'zod';
import { normalizeCategoryColor } from '../category/category-color';
import { registerSchema } from '../common/zod-api-response';
import { TimestampsSchema } from './Timestamps';

export const CategoryColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Must be a valid hex color',
  })
  .transform((color) => normalizeCategoryColor(color));

/**
 * Category schema for transaction categorization.
 * Categories are user-owned; ownership is scoped by the authenticated user and
 * is not exposed in API responses.
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
      /** Display color as a normalized hex color */
      color: CategoryColorSchema,
      /** Archive timestamp for categories hidden from future assignment */
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
    color: CategoryColorSchema.optional(),
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
    color: CategoryColorSchema.optional(),
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
    color: CategoryColorSchema,
    archivedAt: z.coerce.date().nullable().default(null),
  }),
);

export type CategoryConflict = z.infer<typeof CategoryConflictSchema>;

export const CategoryManagementItemSchema = registerSchema(
  'CategoryManagementItem',
  CategorySchema.extend({
    transactionCount: z.number().int().nonnegative().optional(),
    lastUsedAt: z.string().nullable().optional(),
  }),
);

export type CategoryManagementItem = z.infer<
  typeof CategoryManagementItemSchema
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
      action: z.literal('duplicate'),
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
