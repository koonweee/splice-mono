import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';

export const USER_THEME_VALUES = [
  'splice-light',
  'splice-dark',
  'dracula',
  'oled-black',
] as const;

export const UserThemePreferenceSchema = z.enum(USER_THEME_VALUES);
export const UserThemeSchema = UserThemePreferenceSchema.default('splice-dark');
export const NeutralizationLookaroundDaysSchema = z
  .number()
  .int()
  .min(0)
  .max(180);

/**
 * User settings schema - stored as JSONB in the database
 * Add new user preferences here as the app evolves
 */
export const UserSettingsSchema = registerSchema(
  'UserSettings',
  z.object({
    /** User's preferred currency for display (ISO 4217 code) */
    currency: z.string().default('USD'),
    /** User's timezone (IANA timezone string, e.g., 'America/New_York') */
    timezone: z.string().default('UTC'),
    /** Hide zero-balance accounts from the home dashboard account lists */
    hideZeroBalanceAccounts: z.boolean().default(false),
    /** User's preferred design theme preset */
    theme: UserThemeSchema,
    /** Days before/after the selected analysis range to consider for neutralization candidates */
    neutralizationLookaroundDays:
      NeutralizationLookaroundDaysSchema.default(60),
    /** Render the Analysis page using a Sankey cashflow diagram */
    analysisSankeyEnabled: z.boolean().default(false),
    // Future settings can be added here:
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
  z.object({
    currency: z.string().optional(),
    timezone: z.string().optional(),
    hideZeroBalanceAccounts: z.boolean().optional(),
    theme: UserThemePreferenceSchema.optional(),
    neutralizationLookaroundDays: NeutralizationLookaroundDaysSchema.optional(),
    analysisSankeyEnabled: z.boolean().optional(),
  }),
);

export type UpdateUserSettingsDto = z.infer<typeof UpdateUserSettingsDtoSchema>;

/**
 * Default settings for new users
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  currency: 'USD',
  timezone: 'UTC',
  hideZeroBalanceAccounts: false,
  theme: 'splice-dark',
  neutralizationLookaroundDays: 60,
  analysisSankeyEnabled: false,
};

export function normalizeUserSettings(
  settings?: Partial<UserSettings> | null,
): UserSettings {
  const theme = UserThemePreferenceSchema.safeParse(settings?.theme);
  const neutralizationLookaroundDays =
    NeutralizationLookaroundDaysSchema.safeParse(
      settings?.neutralizationLookaroundDays,
    );

  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    theme: theme.success ? theme.data : DEFAULT_USER_SETTINGS.theme,
    neutralizationLookaroundDays: neutralizationLookaroundDays.success
      ? neutralizationLookaroundDays.data
      : DEFAULT_USER_SETTINGS.neutralizationLookaroundDays,
  };
}
