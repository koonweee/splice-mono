import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import { UserEntity } from '../user/user.entity';

@Entity('browser_session')
@Index('IDX_browser_session_user', ['userId'])
export class BrowserSessionEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @ForeignKey(() => UserEntity, { onDelete: 'CASCADE' })
  userId: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;
}
