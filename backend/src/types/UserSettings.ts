import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';

/**
 * User settings schema - stored as JSONB in the database
 * Add new user preferences here as the app evolves
 */
export const UserSettingsSchema = registerSchema(
  'UserSettings',
  z.object({
    /** User's preferred currency for display (ISO 4217 code) */
    currency: z.string().default('USD'),
    // Future settings can be added here:
    // theme: z.enum(['light', 'dark', 'system']).default('system'),
    // locale: z.string().default('en-US'),
    // notifications: z.object({...}).optional(),
  }),
);

export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Schema for updating user settings (all fields optional)
 */
export const UpdateUserSettingsDtoSchema = registerSchema(
  'UpdateUserSettingsDto',
  UserSettingsSchema.partial(),
);

export type UpdateUserSettingsDto = z.infer<typeof UpdateUserSettingsDtoSchema>;

/**
 * Default settings for new users
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  currency: 'USD',
};
