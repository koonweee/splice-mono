import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import type {
  Notification,
  NotificationPayload,
  NotificationStatus,
  NotificationType,
} from '../types/Notification';

@Entity()
@Index('UQ_notification_type_dedupe', ['type', 'dedupeKey'], { unique: true })
export class NotificationEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: NotificationType;

  @Column({ type: 'varchar' })
  dedupeKey: string;

  @Column({ type: 'jsonb' })
  payload: NotificationPayload;

  @Column({ type: 'varchar', default: 'active' })
  status: NotificationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  toObject(): Notification {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      dedupeKey: this.dedupeKey,
      payload: this.payload,
      status: this.status,
      readAt: this.readAt,
      archivedAt: this.archivedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
