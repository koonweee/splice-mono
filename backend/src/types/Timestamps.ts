import { z } from 'zod';

/**
 * Timestamps schema for entities with automatic date tracking.
 * Use this to extend domain type schemas.
 */
export const TimestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Timestamps = z.infer<typeof TimestampsSchema>;

/**
 * Schema for user-owned resources.
 * Includes timestamps and userId.
 */
export const OwnedSchema = TimestampsSchema.extend({
  userId: z.string().uuid(),
});

export type Owned = z.infer<typeof OwnedSchema>;
