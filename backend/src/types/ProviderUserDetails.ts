import { z } from 'zod';

/**
 * Provider-specific user details stored on the User entity
 *
 * Each provider can store their own user-level data here (e.g., tokens, IDs).
 * The structure is: { [providerName]: { ...provider-specific fields } }
 */

/** Plaid-specific user details */
export const PlaidUserDetailsSchema = z.object({
  /** User token for multi-item link functionality */
  userToken: z.string(),
});
export type PlaidUserDetails = z.infer<typeof PlaidUserDetailsSchema>;

/**
 * Map of provider name to their specific details
 * Used for storage in the User entity
 */
export const ProviderUserDetailsSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);
export type ProviderUserDetails = z.infer<typeof ProviderUserDetailsSchema>;
