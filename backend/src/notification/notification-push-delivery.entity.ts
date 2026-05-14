import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';
import type { NotificationPushDeliveryStatus } from '../types/Notification';
import { NotificationEntity } from './notification.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';

@Entity()
@Index('IDX_notification_push_delivery_pending', ['status', 'availableAt'])
@Index('IDX_notification_push_delivery_cleanup', ['createdAt'])
@Index(
  'UQ_notification_push_delivery_target',
  ['notificationId', 'subscriptionId'],
  {
    unique: true,
  },
)
export class NotificationPushDeliveryEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  notificationId: string;

  @ManyToOne(() => NotificationEntity, { nullable: false })
  @JoinColumn({ name: 'notificationId' })
  notification: NotificationEntity;

  @Column({ type: 'uuid' })
  subscriptionId: string;

  @ManyToOne(() => PushSubscriptionEntity, { nullable: false })
  @JoinColumn({ name: 'subscriptionId' })
  subscription: PushSubscriptionEntity;

  @Column({ type: 'varchar', default: 'pending' })
  status: NotificationPushDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;
}
