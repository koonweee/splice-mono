import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import type {
  CreateUserDto,
  LoginDto,
  LoginResponse,
  TokenResponse,
  User,
} from '../types/User';
import type {
  UpdateUserSettingsDto,
  UserSettings,
} from '../types/UserSettings';
import { UserEntity } from './user.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private repository: Repository<UserEntity>,
    private authService: AuthService,
  ) {}

  /**
   * Hash a password using scrypt (built-in Node.js crypto)
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  }

  /**
   * Verify a password against a hash
   */
  private async verifyPassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    const [salt, key] = hash.split(':');
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(key === derivedKey.toString('hex'));
      });
    });
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user: email=${createUserDto.email}`);

    // Check if user already exists
    const existingUser = await this.repository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      this.logger.warn(`User already exists: email=${createUserDto.email}`);
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await this.hashPassword(createUserDto.password);
    const entity = UserEntity.fromDto(createUserDto, hashedPassword);

    const savedEntity = await this.repository.save(entity);
    this.logger.log(`User created successfully: id=${savedEntity.id}`);
    return savedEntity.toObject();
  }

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    this.logger.log(`Login attempt: email=${loginDto.email}`);

    const entity = await this.repository.findOne({
      where: { email: loginDto.email },
    });

    if (!entity) {
      this.logger.warn(
        `Login failed - user not found: email=${loginDto.email}`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.verifyPassword(
      loginDto.password,
      entity.hashedPassword,
    );

    if (!isPasswordValid) {
      this.logger.warn(
        `Login failed - invalid password: email=${loginDto.email}`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = entity.toObject();
    const accessToken = this.authService.generateAccessToken(
      user.id,
      user.email,
    );
    const refreshToken = await this.authService.generateRefreshToken(user.id);

    this.logger.log(`Login successful: id=${user.id}`);
    return { accessToken, refreshToken, user };
  }

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

    this.logger.log(`Tokens refreshed for user: ${userId}`);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async findOne(id: string): Promise<User | null> {
    this.logger.log(`Finding user: id=${id}`);
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) {
      this.logger.warn(`User not found: id=${id}`);
      return null;
    }

    return entity.toObject();
  }

  async findByEmail(email: string): Promise<User | null> {
    this.logger.log(`Finding user by email: email=${email}`);
    const entity = await this.repository.findOne({
      where: { email },
    });

    if (!entity) {
      return null;
    }

    return entity.toObject();
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
      this.logger.warn(`Cannot update settings: user not found: id=${userId}`);
      return null;
    }

    // Merge existing settings with updates
    const currentSettings = entity.settings;
    const newSettings: UserSettings = {
      currency: settingsUpdate.currency ?? currentSettings.currency,
      timezone: settingsUpdate.timezone ?? currentSettings.timezone,
    };
    entity.settings = newSettings;

    await this.repository.save(entity);
    this.logger.log(`Updated settings for user ${userId}`);
    return newSettings;
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
        `Cannot update provider details: user not found: id=${userId}`,
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
      `Updated provider details for user ${userId}, provider ${providerName}`,
    );
    return savedEntity.toObject();
  }
}
