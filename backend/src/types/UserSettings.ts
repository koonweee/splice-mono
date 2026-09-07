import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';

export const AppearancePreferenceSchema = registerSchema(
  'AppearancePreference',
  z
    .object({
      mode: z.enum(['light', 'dark', 'oled']),
      /** Use monospace for monetary figures; omitted means the normal body font. */
      monospaceAmounts: z.boolean().optional(),
      accent: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .transform((value) => value.toLowerCase())
        .nullable(),
    })
    .strict(),
);
export type AppearancePreference = z.infer<typeof AppearancePreferenceSchema>;
export const DEFAULT_APPEARANCE: AppearancePreference = {
  mode: 'dark',
  accent: '#83b59b',
};

export const NeutralizationLookaroundDaysSchema = z
  .number()
  .int()
  .min(0)
  .max(180);

export const UserNotificationSettingsSchema = z
  .object({
    transactions: z
      .object({
        newSyncedTransactions: z.boolean().default(true),
      })
      .default({ newSyncedTransactions: true }),
    bankLinks: z
      .object({
        needsAttention: z.boolean().default(true),
      })
      .default({ needsAttention: true }),
  })
  .default({
    transactions: { newSyncedTransactions: true },
    bankLinks: { needsAttention: true },
  });

export type UserNotificationSettings = z.infer<
  typeof UserNotificationSettingsSchema
>;

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
    /** Complete appearance preference; neutral accent is explicitly null */
    appearance: AppearancePreferenceSchema.default(DEFAULT_APPEARANCE),
    /** Days before/after the selected analysis range to consider for neutralization candidates */
    neutralizationLookaroundDays:
      NeutralizationLookaroundDaysSchema.default(60),
    /** Render the Analysis page using a Sankey cashflow diagram */
    analysisSankeyEnabled: z.boolean().default(false),
    /** User-level notification type preferences */
    notifications: UserNotificationSettingsSchema.default({
      transactions: { newSyncedTransactions: true },
      bankLinks: { needsAttention: true },
    }),
    // Future settings can be added here:
    // locale: z.string().default('en-US'),
  }),
);

export type UserSettings = z.infer<typeof UserSettingsSchema>;

/**
 * Schema for updating user settings (all fields optional)
 */
export const UpdateUserSettingsDtoSchema = registerSchema(
  'UpdateUserSettingsDto',
  z
    .object({
      currency: z.string().optional(),
      timezone: z.string().optional(),
      hideZeroBalanceAccounts: z.boolean().optional(),
      appearance: AppearancePreferenceSchema.optional(),
      neutralizationLookaroundDays:
        NeutralizationLookaroundDaysSchema.optional(),
      analysisSankeyEnabled: z.boolean().optional(),
      notifications: z
        .object({
          transactions: z
            .object({
              newSyncedTransactions: z.boolean().optional(),
            })
            .optional(),
          bankLinks: z
            .object({
              needsAttention: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .strict(),
);

export type UpdateUserSettingsDto = z.infer<typeof UpdateUserSettingsDtoSchema>;

/**
 * Default settings for new users
 */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  currency: 'USD',
  timezone: 'UTC',
  hideZeroBalanceAccounts: false,
  appearance: DEFAULT_APPEARANCE,
  neutralizationLookaroundDays: 60,
  analysisSankeyEnabled: false,
  notifications: {
    transactions: {
      newSyncedTransactions: true,
    },
    bankLinks: {
      needsAttention: true,
    },
  },
};

export function normalizeUserSettings(
  settings?: Partial<UserSettings> | null,
): UserSettings {
  const appearance = AppearancePreferenceSchema.safeParse(settings?.appearance);
  const neutralizationLookaroundDays =
    NeutralizationLookaroundDaysSchema.safeParse(
      settings?.neutralizationLookaroundDays,
    );

  return UserSettingsSchema.parse({
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    appearance: appearance.success ? appearance.data : DEFAULT_APPEARANCE,
    neutralizationLookaroundDays: neutralizationLookaroundDays.success
      ? neutralizationLookaroundDays.data
      : DEFAULT_USER_SETTINGS.neutralizationLookaroundDays,
    notifications: UserNotificationSettingsSchema.parse(
      settings?.notifications,
    ),
  });
}
