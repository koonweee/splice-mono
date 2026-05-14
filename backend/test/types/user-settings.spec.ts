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
  },
};

describe('UserSettings types', () => {
  it('defaults full user settings', () => {
    expect(UserSettingsSchema.parse({})).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      theme: 'splice-dark',
      neutralizationLookaroundDays: 60,
      analysisSankeyEnabled: false,
      ...defaultNotificationSettings,
    });
  });

  it('does not apply defaults to partial settings updates', () => {
    expect(UpdateUserSettingsDtoSchema.parse({ theme: 'dracula' })).toEqual({
      theme: 'dracula',
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

  it('normalizes removed stored theme presets to the default', () => {
    expect(
      normalizeUserSettings({
        currency: 'USD',
        timezone: 'UTC',
        hideZeroBalanceAccounts: false,
        theme: 'solarized-light',
      } as unknown as Parameters<typeof normalizeUserSettings>[0]),
    ).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      theme: 'splice-dark',
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
        theme: 'splice-dark',
      }),
    ).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      theme: 'splice-dark',
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
        theme: 'splice-dark',
        neutralizationLookaroundDays: 60,
      }),
    ).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      theme: 'splice-dark',
      neutralizationLookaroundDays: 60,
      analysisSankeyEnabled: false,
      ...defaultNotificationSettings,
    });
  });
});
