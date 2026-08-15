import {
  Column,
  Entity,
  ForeignKey,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import { UserEntity } from '../user/user.entity';

export type RefreshTokenRevocationReason =
  | 'rotated'
  | 'logout'
  | 'logout_all'
  | 'legacy';

@Entity('refresh_token')
@Index('IDX_refresh_token_expiry_cleanup', ['expiresAt', 'id'])
@Index('IDX_refresh_token_revoked_cleanup', ['revokedAt', 'id'], {
  where: '"revoked" = true',
})
export class RefreshTokenEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  token: string; // SHA-256 hash of the actual token

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  user: UserEntity;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  revoked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  revocationReason: RefreshTokenRevocationReason | null;

  @Column({ type: 'timestamp', nullable: true })
  rotationGraceExpiresAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  @ForeignKey(() => RefreshTokenEntity, {
    name: 'FK_refresh_token_replacement',
    onDelete: 'SET NULL',
  })
  replacedByTokenId: string | null;
}
