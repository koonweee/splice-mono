import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { OwnedEntity } from '../common/owned.entity';
import type {
  CreateWebhookEventDto,
  WebhookEvent,
} from '../types/WebhookEvent';
import { WebhookEventStatus } from '../types/WebhookEvent';

@Entity()
export class WebhookEventEntity extends OwnedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique identifier from webhook provider (for idempotency) */
  @Column({ unique: true })
  webhookId: string;

  /** Full webhook payload (null when pending) */
  @Column('jsonb', { nullable: true })
  webhookContent: Record<string, any> | null;

  /** Status of webhook processing */
  @Column({
    type: 'varchar',
    default: WebhookEventStatus.PENDING,
  })
  status: WebhookEventStatus;

  /** Provider that will send/sent the webhook */
  @Column()
  providerName: string;

  /** When this pending webhook expires */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  /** When the webhook was processed */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** Error message if failed */
  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /**
   * Create entity from DTO
   */
  static fromDto(
    dto: CreateWebhookEventDto,
    userId: string,
  ): WebhookEventEntity {
    const entity = new WebhookEventEntity();
    entity.userId = userId;
    entity.webhookId = dto.webhookId;
    entity.webhookContent = dto.webhookContent ?? null;
    entity.status = dto.status ?? WebhookEventStatus.PENDING;
    entity.providerName = dto.providerName;
    entity.expiresAt = dto.expiresAt ?? null;
    entity.completedAt = null;
    entity.errorMessage = null;
    return entity;
  }

  /**
   * Convert entity to domain object
   */
  toObject(): WebhookEvent {
    return {
      id: this.id,
      userId: this.userId,
      webhookId: this.webhookId,
      webhookContent: this.webhookContent,
      status: this.status,
      providerName: this.providerName,
      expiresAt: this.expiresAt,
      completedAt: this.completedAt,
      errorMessage: this.errorMessage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
