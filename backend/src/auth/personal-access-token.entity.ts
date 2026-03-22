import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';

export interface PersonalAccessTokenView {
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
  token?: string;
  tokenHash?: string;
}

@Entity('personal_access_token')
export class PersonalAccessTokenEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

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

  toObject(): PersonalAccessTokenView {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      prefix: this.prefix,
      tokenPreview: `${this.prefix}_${this.tokenHash.slice(-8)}`,
      lastUsedAt: this.lastUsedAt,
      expiresAt: this.expiresAt,
      revokedAt: this.revokedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
