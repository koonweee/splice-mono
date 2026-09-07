import {
  Column,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BrowserSessionEntity } from '../auth/browser-session.entity';
import { OwnedEntity } from '../common/owned.entity';
import type { PushSubscriptionResponse } from '../types/Notification';

@Entity()
@Index('IDX_push_subscription_session', ['sessionId'])
@Index('UQ_push_subscription_endpoint', ['endpoint'], { unique: true })
export class PushSubscriptionEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  @ForeignKey(() => BrowserSessionEntity, {
    name: 'FK_push_subscription_session',
    onDelete: 'RESTRICT',
  })
  sessionId: string | null;

  @Column({ type: 'uuid' })
  enrollmentId: string;

  @Column({ type: 'boolean', default: true })
  rebindRequired: boolean;

  toResponse(): PushSubscriptionResponse {
    return {
      id: this.id,
      endpoint: this.endpoint,
      revokedAt: this.revokedAt,
      enrollmentId: this.enrollmentId,
      rebindRequired: this.rebindRequired,
    };
  }
}
