import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type { ProviderUserDetails } from '../types/ProviderUserDetails';
import type { User, UserWithPassword } from '../types/User';
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

  @Column({ type: 'varchar', nullable: true })
  hashedPassword: string | null;

  @Index('IDX_user_entity_google_subject', {
    unique: true,
    where: '"googleSubject" IS NOT NULL',
  })
  @Column({ type: 'varchar', nullable: true })
  googleSubject: string | null;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  /** User settings (currency, preferences, etc.) stored as JSONB */
  @Column({
    type: 'jsonb',
    default: () => `'${JSON.stringify(DEFAULT_USER_SETTINGS)}'`,
  })
  settings: UserSettings;

  @Column({ type: 'jsonb', nullable: true })
  providerDetails: ProviderUserDetails | null;

  /**
   * Create entity from a verified Google identity.
   */
  static fromGoogleIdentity(dto: {
    email: string;
    googleSubject: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): UserEntity {
    const entity = new UserEntity();
    entity.email = dto.email;
    entity.hashedPassword = null;
    entity.googleSubject = dto.googleSubject;
    entity.displayName = dto.displayName ?? null;
    entity.avatarUrl = dto.avatarUrl ?? null;
    entity.settings = normalizeUserSettings(undefined);
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
      displayName: this.displayName ?? undefined,
      avatarUrl: this.avatarUrl ?? undefined,
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
      displayName: this.displayName ?? undefined,
      avatarUrl: this.avatarUrl ?? undefined,
      settings: normalizeUserSettings(this.settings),
      hashedPassword: this.hashedPassword,
      providerDetails: this.providerDetails ?? undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
