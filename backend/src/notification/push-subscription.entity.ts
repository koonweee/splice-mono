import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import type { PushSubscriptionResponse } from '../types/Notification';

@Entity()
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

  toResponse(): PushSubscriptionResponse {
    return {
      id: this.id,
      endpoint: this.endpoint,
      revokedAt: this.revokedAt,
    };
  }
}
