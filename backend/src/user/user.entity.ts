import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type { ProviderUserDetails } from '../types/ProviderUserDetails';
import type { CreateUserDto, User, UserWithPassword } from '../types/User';
import {
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  type UserSettings,
} from '../types/UserSettings';

@Entity()
export class UserEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  hashedPassword: string;

  /** User settings (currency, preferences, etc.) stored as JSONB */
  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify(DEFAULT_USER_SETTINGS)}'`,
  })
  settings: UserSettings;

  @Column({ type: 'jsonb', nullable: true })
  providerDetails: ProviderUserDetails | null;

  /**
   * Create entity from DTO (password should already be hashed)
   */
  static fromDto(dto: CreateUserDto, hashedPassword: string): UserEntity {
    const entity = new UserEntity();
    entity.email = dto.email;
    entity.hashedPassword = hashedPassword;
    entity.settings = normalizeUserSettings(dto.settings);
    entity.providerDetails = null;
    return entity;
  }

  /**
   * Convert entity to domain object (without password)
   */
  toObject(): User {
    return {
      id: this.id,
      email: this.email,
      settings: normalizeUserSettings(this.settings),
      providerDetails: this.providerDetails ?? undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Convert entity to domain object with password (internal use only)
   */
  toObjectWithPassword(): UserWithPassword {
    return {
      id: this.id,
      email: this.email,
      settings: normalizeUserSettings(this.settings),
      hashedPassword: this.hashedPassword,
      providerDetails: this.providerDetails ?? undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
