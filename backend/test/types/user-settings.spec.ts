import {
  UpdateUserSettingsDtoSchema,
  normalizeUserSettings,
  UserSettingsSchema,
} from '../../src/types/UserSettings';

const defaultNotificationSettings = {
  notifications: {
    transactions: {
      newSyncedTransactions: true,
    },
    bankLinks: {
      needsAttention: true,
    },
  },
};

describe('UserSettings types', () => {
  it.each([true, false])(
    'accepts and preserves monospaceAmounts=%s',
    (monospaceAmounts) => {
      const appearance = { mode: 'dark', accent: null, monospaceAmounts };
      expect(UpdateUserSettingsDtoSchema.parse({ appearance })).toEqual({
        appearance,
      });
      expect(
        normalizeUserSettings({ appearance: { ...appearance, mode: 'dark' } })
          .appearance,
      ).toEqual(appearance);
    },
  );
  it('rejects non-boolean amount-font preferences', () => {
    expect(() =>
      UpdateUserSettingsDtoSchema.parse({
        appearance: { mode: 'dark', accent: null, monospaceAmounts: 'true' },
      }),
    ).toThrow();
  });
  it.each(['light', 'dark', 'oled'])(
    'accepts atomic %s appearance and normalizes hex',
    (mode) => {
      expect(
        UpdateUserSettingsDtoSchema.parse({
          appearance: { mode, accent: '#AAbbCC' },
        }),
      ).toEqual({ appearance: { mode, accent: '#aabbcc' } });
      expect(
        UpdateUserSettingsDtoSchema.parse({
          appearance: { mode, accent: null },
        }),
      ).toEqual({ appearance: { mode, accent: null } });
    },
  );
  it.each([
    null,
    {},
    { mode: 'dark' },
    { accent: null },
    { mode: 'auto', accent: null },
    { mode: 'light', accent: '#fff' },
    { mode: 'dark', accent: '#1234567' },
    { mode: 'dark', accent: 'x'.repeat(1000) },
  ])('rejects malformed or incomplete appearance %j', (appearance) => {
    expect(() => UpdateUserSettingsDtoSchema.parse({ appearance })).toThrow();
  });
  it('rejects the removed theme field even alongside a valid appearance', () => {
    expect(() =>
      UpdateUserSettingsDtoSchema.parse({
        theme: 'splice-dark',
        appearance: { mode: 'dark', accent: null },
      }),
    ).toThrow();
    expect(UpdateUserSettingsDtoSchema.parse({})).toEqual({});
  });

  it('defaults full user settings', () => {
    expect(UserSettingsSchema.parse({})).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      appearance: { mode: 'dark', accent: '#83b59b' },
      neutralizationLookaroundDays: 60,
      analysisSankeyEnabled: false,
      ...defaultNotificationSettings,
    });
  });

  it('does not apply defaults to partial settings updates', () => {
    expect(
      UpdateUserSettingsDtoSchema.parse({
        appearance: { mode: 'dark', accent: '#b399cf' },
      }),
    ).toEqual({
      appearance: { mode: 'dark', accent: '#b399cf' },
    });
  });

  it('rejects removed theme presets for settings updates', () => {
    expect(() =>
      UpdateUserSettingsDtoSchema.parse({ theme: 'nord' }),
    ).toThrow();
  });

  it('accepts neutralization lookaround bounds for settings updates', () => {
    expect(
      UpdateUserSettingsDtoSchema.parse({ neutralizationLookaroundDays: 0 }),
    ).toEqual({ neutralizationLookaroundDays: 0 });
    expect(
      UpdateUserSettingsDtoSchema.parse({ neutralizationLookaroundDays: 60 }),
    ).toEqual({ neutralizationLookaroundDays: 60 });
    expect(
      UpdateUserSettingsDtoSchema.parse({ neutralizationLookaroundDays: 180 }),
    ).toEqual({ neutralizationLookaroundDays: 180 });
  });

  it('accepts analysis Sankey setting updates', () => {
    expect(
      UpdateUserSettingsDtoSchema.parse({ analysisSankeyEnabled: true }),
    ).toEqual({ analysisSankeyEnabled: true });
    expect(
      UpdateUserSettingsDtoSchema.parse({ analysisSankeyEnabled: false }),
    ).toEqual({ analysisSankeyEnabled: false });
  });

  it('rejects invalid neutralization lookaround values', () => {
    expect(() =>
      UpdateUserSettingsDtoSchema.parse({ neutralizationLookaroundDays: -1 }),
    ).toThrow();
    expect(() =>
      UpdateUserSettingsDtoSchema.parse({ neutralizationLookaroundDays: 181 }),
    ).toThrow();
    expect(() =>
      UpdateUserSettingsDtoSchema.parse({ neutralizationLookaroundDays: 1.5 }),
    ).toThrow();
  });

  it('normalizes invalid stored appearance to the default', () => {
    expect(
      normalizeUserSettings({
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
        appearance: { mode: 'invalid', accent: null },
      } as unknown as Parameters<typeof normalizeUserSettings>[0]),
    ).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      appearance: { mode: 'dark', accent: '#83b59b' },
      neutralizationLookaroundDays: 60,
      analysisSankeyEnabled: false,
      ...defaultNotificationSettings,
    });
  });

  it('normalizes missing neutralizationLookaroundDays to the default', () => {
    expect(
      normalizeUserSettings({
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
        appearance: { mode: 'dark', accent: '#83b59b' },
      }),
    ).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      appearance: { mode: 'dark', accent: '#83b59b' },
      neutralizationLookaroundDays: 60,
      analysisSankeyEnabled: false,
      ...defaultNotificationSettings,
    });
  });

  it('normalizes missing analysisSankeyEnabled to the default', () => {
    expect(
      normalizeUserSettings({
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
        appearance: { mode: 'dark', accent: '#83b59b' },
        neutralizationLookaroundDays: 60,
      }),
    ).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      appearance: { mode: 'dark', accent: '#83b59b' },
      neutralizationLookaroundDays: 60,
      analysisSankeyEnabled: false,
      ...defaultNotificationSettings,
    });
  });
});
