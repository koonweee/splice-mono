import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { UserEvents, UserSettingsUpdatedEvent } from '../events/user.events';
import type { TokenResponse, User } from '../types/User';
import type {
  UpdateUserSettingsDto,
  UserSettings,
} from '../types/UserSettings';
import { normalizeUserSettings } from '../types/UserSettings';
import { UserEntity } from './user.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
    private readonly authService: AuthService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    const { userId, newRefreshToken } =
      await this.authService.rotateRefreshToken(refreshToken);

    const user = await this.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const accessToken = this.authService.generateAccessToken(
      userId,
      user.email,
    );

    this.logger.log({ userId }, 'Tokens refreshed for user');
    return { accessToken, refreshToken: newRefreshToken };
  }

  async findOne(id: string): Promise<User | null> {
    this.logger.log({ id }, 'Finding user');
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) {
      this.logger.warn({ id }, 'User not found');
      return null;
    }

    return entity.toObject();
  }

  async findByGoogleSubject(googleSubject: string): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { googleSubject },
    });

    return entity?.toObject() ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { email: this.normalizeEmail(email) },
    });

    return entity?.toObject() ?? null;
  }

  async findOrCreateFromGoogleIdentity(profile: {
    googleSubject: string;
    email: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const email = this.normalizeEmail(profile.email);
    const existingGoogleUser = await this.repository.findOne({
      where: { googleSubject: profile.googleSubject },
    });

    if (existingGoogleUser) {
      this.logger.log(
        { userId: existingGoogleUser.id },
        'Google OAuth login matched existing Google subject',
      );
      return existingGoogleUser.toObject();
    }

    const existingEmailUser = await this.repository.findOne({
      where: { email },
    });

    if (existingEmailUser) {
      if (
        existingEmailUser.googleSubject &&
        existingEmailUser.googleSubject !== profile.googleSubject
      ) {
        this.logger.warn(
          { userId: existingEmailUser.id },
          'Google OAuth email already linked to a different subject',
        );
        throw new ConflictException('Google account is already linked');
      }

      existingEmailUser.googleSubject = profile.googleSubject;
      existingEmailUser.displayName =
        profile.displayName ?? existingEmailUser.displayName ?? null;
      existingEmailUser.avatarUrl =
        profile.avatarUrl ?? existingEmailUser.avatarUrl ?? null;
      const savedEntity = await this.repository.save(existingEmailUser);
      this.logger.log(
        { userId: savedEntity.id },
        'Linked Google OAuth identity to existing user by verified email',
      );
      return savedEntity.toObject();
    }

    const entity = UserEntity.fromGoogleIdentity({
      email,
      googleSubject: profile.googleSubject,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ userId: savedEntity.id }, 'Created Google OAuth user');
    return savedEntity.toObject();
  }

  /**
   * Update user settings (partial update - merges with existing settings)
   *
   * @param userId - User ID
   * @param settingsUpdate - Partial settings to update
   * @returns Updated user settings or null if user not found
   */
  async updateSettings(
    userId: string,
    settingsUpdate: UpdateUserSettingsDto,
  ): Promise<UserSettings | null> {
    const entity = await this.repository.findOne({
      where: { id: userId },
    });

    if (!entity) {
      this.logger.warn({ userId }, 'Cannot update settings: user not found');
      return null;
    }

    // Merge existing settings with updates
    const oldSettings = normalizeUserSettings(entity.settings);
    const newSettings: UserSettings = {
      currency: settingsUpdate.currency ?? oldSettings.currency,
      timezone: settingsUpdate.timezone ?? oldSettings.timezone,
      hideZeroBalanceAccounts:
        settingsUpdate.hideZeroBalanceAccounts ??
        oldSettings.hideZeroBalanceAccounts,
      theme: settingsUpdate.theme ?? oldSettings.theme,
      neutralizationLookaroundDays:
        settingsUpdate.neutralizationLookaroundDays ??
        oldSettings.neutralizationLookaroundDays,
      analysisSankeyEnabled:
        settingsUpdate.analysisSankeyEnabled ??
        oldSettings.analysisSankeyEnabled,
      notifications: {
        transactions: {
          newSyncedTransactions:
            settingsUpdate.notifications?.transactions?.newSyncedTransactions ??
            oldSettings.notifications.transactions.newSyncedTransactions,
        },
        bankLinks: {
          needsAttention:
            settingsUpdate.notifications?.bankLinks?.needsAttention ??
            oldSettings.notifications.bankLinks.needsAttention,
        },
      },
    };
    entity.settings = newSettings;

    await this.repository.save(entity);
    this.logger.log({ userId }, 'Updated settings for user');

    // Emit event if settings actually changed
    if (
      oldSettings.currency !== newSettings.currency ||
      oldSettings.timezone !== newSettings.timezone
    ) {
      this.eventEmitter.emit(
        UserEvents.SETTINGS_UPDATED,
        new UserSettingsUpdatedEvent(userId, oldSettings, newSettings),
      );
    }

    return newSettings;
  }

  async enableDefaultNotificationsIfUnset(
    userId: string,
  ): Promise<UserSettings | null> {
    const entity = await this.repository.findOne({
      where: { id: userId },
    });

    if (!entity) {
      this.logger.warn(
        { userId },
        'Cannot initialize notification settings: user not found',
      );
      return null;
    }

    const rawSettings = entity.settings as Partial<UserSettings> | null;
    if (rawSettings?.notifications !== undefined) {
      return normalizeUserSettings(entity.settings);
    }

    const settings = normalizeUserSettings(entity.settings);
    settings.notifications.transactions.newSyncedTransactions = true;
    settings.notifications.bankLinks.needsAttention = true;
    entity.settings = settings;
    await this.repository.save(entity);

    this.logger.log(
      { userId },
      'Initialized default notification settings for user',
    );

    return settings;
  }

  /**
   * Get user's timezone setting
   *
   * @param userId - User ID
   * @returns IANA timezone string (defaults to 'UTC' if user not found or not set)
   */
  async getTimezone(userId: string): Promise<string> {
    const entity = await this.repository.findOne({
      where: { id: userId },
    });

    return entity?.settings?.timezone ?? 'UTC';
  }

  async getPreferredCurrency(userId: string): Promise<string> {
    const entity = await this.repository.findOne({ where: { id: userId } });
    return normalizeUserSettings(entity?.settings).currency.toUpperCase();
  }

  /**
   * Get provider-specific details for a user
   *
   * @param userId - User ID
   * @param providerName - Provider name (e.g., 'plaid')
   * @returns Provider details or undefined if not set
   */
  async getProviderDetails(
    userId: string,
    providerName: string,
  ): Promise<Record<string, unknown> | undefined> {
    const entity = await this.repository.findOne({
      where: { id: userId },
    });

    if (!entity || !entity.providerDetails) {
      return undefined;
    }

    const providerDetails = entity.providerDetails;
    return providerDetails[providerName];
  }

  /**
   * Update provider-specific details for a user
   * Replaces the entire provider details for the given provider
   *
   * @param userId - User ID
   * @param providerName - Provider name (e.g., 'plaid')
   * @param details - Provider-specific details to store
   * @returns Updated user or null if user not found
   */
  async updateProviderDetails(
    userId: string,
    providerName: string,
    details: Record<string, unknown>,
  ): Promise<User | null> {
    const entity = await this.repository.findOne({
      where: { id: userId },
    });

    if (!entity) {
      this.logger.warn(
        { userId },
        'Cannot update provider details: user not found',
      );
      return null;
    }

    // Initialize providerDetails if null, then replace for this provider
    const currentDetails = entity.providerDetails ?? {};
    entity.providerDetails = {
      ...currentDetails,
      [providerName]: details,
    };

    const savedEntity = await this.repository.save(entity);
    this.logger.log(
      { userId, providerName },
      'Updated provider details for user',
    );
    return savedEntity.toObject();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
