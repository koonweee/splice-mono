import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type { ProviderUserDetails } from '../types/ProviderUserDetails';
import type { CreateUserDto, User, UserWithPassword } from '../types/User';

@Entity()
export class UserEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar' })
  hashedPassword: string;

  @Column({ type: 'jsonb', nullable: true })
  providerDetails: ProviderUserDetails | null;

  /**
   * Create entity from DTO (password should already be hashed)
   */
  static fromDto(dto: CreateUserDto, hashedPassword: string): UserEntity {
    const entity = new UserEntity();
    entity.email = dto.email;
    entity.hashedPassword = hashedPassword;
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
      hashedPassword: this.hashedPassword,
      providerDetails: this.providerDetails ?? undefined,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
