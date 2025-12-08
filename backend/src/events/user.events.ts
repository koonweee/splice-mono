import type { UserSettings } from '../types/UserSettings';

/**
 * Event names for user-related events
 */
export const UserEvents = {
  SETTINGS_UPDATED: 'user.settings-updated',
} as const;

/**
 * Payload for user settings updated event
 */
export class UserSettingsUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly oldSettings: UserSettings,
    public readonly newSettings: UserSettings,
  ) {}

  /**
   * Check if the currency setting changed
   */
  get currencyChanged(): boolean {
    return this.oldSettings.currency !== this.newSettings.currency;
  }

  /**
   * Check if the timezone setting changed
   */
  get timezoneChanged(): boolean {
    return this.oldSettings.timezone !== this.newSettings.timezone;
  }
}
