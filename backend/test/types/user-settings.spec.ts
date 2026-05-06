import {
  UpdateUserSettingsDtoSchema,
  normalizeUserSettings,
  UserSettingsSchema,
} from '../../src/types/UserSettings';

describe('UserSettings types', () => {
  it('defaults full user settings', () => {
    expect(UserSettingsSchema.parse({})).toEqual({
      currency: 'USD',
      timezone: 'UTC',
      hideZeroBalanceAccounts: false,
      theme: 'splice-dark',
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
    });
  });
});
