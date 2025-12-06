import { z } from 'zod';

/**
 * Category schema for transaction categorization.
 * This is a reference entity - categories are global/shared across all users.
 */
export const CategorySchema = z.object({
  id: z.string().uuid(),
  /** Primary category (e.g., "Food and Drink") */
  primary: z.string(),
  /** Detailed category (e.g., "Restaurants") */
  detailed: z.string(),
  /** Description of the category */
  description: z.string(),
});

export type Category = z.infer<typeof CategorySchema>;
