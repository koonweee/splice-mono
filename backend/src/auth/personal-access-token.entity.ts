import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import { UserEntity } from '../user/user.entity';

const TOKEN_PREFIX = 'splice_pat';

export interface PersonalAccessTokenListItem {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  tokenPreview: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalAccessTokenCreated extends PersonalAccessTokenListItem {
  token: string;
}

@Entity('personal_access_token')
export class PersonalAccessTokenEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  user: UserEntity;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  tokenHash: string;

  @Column({ type: 'varchar' })
  prefix: string;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  toObject(): PersonalAccessTokenListItem {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      prefix: this.prefix,
      tokenPreview: `${TOKEN_PREFIX}_${this.prefix}`,
      lastUsedAt: this.lastUsedAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
