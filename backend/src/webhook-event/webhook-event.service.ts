import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, MoreThan, Repository } from 'typeorm';
import { WebhookEvent, WebhookEventStatus } from '../types/WebhookEvent';
import { WebhookEventEntity } from './webhook-event.entity';

@Injectable()
export class WebhookEventService {
  private readonly logger = new Logger(WebhookEventService.name);

  constructor(
    @InjectRepository(WebhookEventEntity)
    private repository: Repository<WebhookEventEntity>,
  ) {}

  /**
   * Create a pending webhook event at initiation time
   * This stores the userId and webhookId so we can correlate when the webhook arrives
   */
  async createPending(
    webhookId: string,
    providerName: string,
    userId: string,
    expiresAt?: Date,
  ): Promise<WebhookEvent> {
    this.logger.log(
      { webhookId, providerName, userId },
      'Creating pending webhook event',
    );
    const entity = WebhookEventEntity.fromDto(
      {
        webhookId,
        providerName,
        status: WebhookEventStatus.PENDING,
        expiresAt: expiresAt ?? null,
      },
      userId,
    );
    const savedEntity = await this.repository.save(entity);
    this.logger.log(
      { id: savedEntity.id },
      'Pending WebhookEvent created successfully',
    );
    return savedEntity.toObject();
  }

  /**
   * Find a pending webhook event by webhookId
   * Returns null if not found or not in pending status
   */
  async findPendingByWebhookId(
    webhookId: string,
  ): Promise<WebhookEvent | null> {
    this.logger.log({ webhookId }, 'Finding pending webhook event');
    const entity = await this.repository.findOne({
      where: { webhookId, status: WebhookEventStatus.PENDING },
    });

    if (!entity) {
      this.logger.warn({ webhookId }, 'Pending WebhookEvent not found');
      return null;
    }

    this.logger.log({ webhookId }, 'Pending WebhookEvent found');
    return entity.toObject();
  }

  /**
   * Mark a pending webhook event as completed with the webhook payload
   */
  async markCompleted(
    webhookId: string,
    webhookContent: Record<string, any>,
  ): Promise<WebhookEvent | null> {
    this.logger.log({ webhookId }, 'Marking webhook event as completed');
    const entity = await this.repository.findOne({
      where: { webhookId, status: WebhookEventStatus.PENDING },
    });

    if (!entity) {
      this.logger.warn(
        { webhookId },
        'Pending WebhookEvent not found for completion',
      );
      return null;
    }

    entity.status = WebhookEventStatus.COMPLETED;
    entity.webhookContent = webhookContent;
    entity.completedAt = new Date();

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ webhookId }, 'WebhookEvent marked as completed');
    return savedEntity.toObject();
  }

  /**
   * Mark a pending webhook event as failed with an error message
   */
  async markFailed(
    webhookId: string,
    errorMessage: string,
    webhookContent?: Record<string, any>,
  ): Promise<WebhookEvent | null> {
    this.logger.log({ webhookId }, 'Marking webhook event as failed');
    const entity = await this.repository.findOne({
      where: { webhookId, status: WebhookEventStatus.PENDING },
    });

    if (!entity) {
      this.logger.warn(
        { webhookId },
        'Pending WebhookEvent not found for failure',
      );
      return null;
    }

    entity.status = WebhookEventStatus.FAILED;
    entity.errorMessage = errorMessage;
    entity.webhookContent = webhookContent ?? null;
    entity.completedAt = new Date();

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ webhookId }, 'WebhookEvent marked as failed');
    return savedEntity.toObject();
  }

  /**
   * Try to acquire processing lock for a webhook using time-based deduplication.
   * Used for update/status webhooks that don't have pre-created pending records.
   *
   * @param baseWebhookId - Composite key without timestamp (e.g., plaid:TRANSACTIONS:DEFAULT_UPDATE:item_abc)
   * @param providerName - Provider name
   * @param userId - User who owns the resource
   * @param webhookContent - Full webhook payload
   * @param dedupeWindowMs - Time window for deduplication (default: 5 minutes)
   * @returns { acquired: true } if lock acquired, { acquired: false, reason: string } if duplicate
   */
  async tryAcquireWebhook(
    baseWebhookId: string,
    providerName: string,
    userId: string,
    webhookContent: Record<string, any>,
    dedupeWindowMs: number = 5 * 60 * 1000,
  ): Promise<{ acquired: true } | { acquired: false; reason: string }> {
    const windowStart = new Date(Date.now() - dedupeWindowMs);

    // Check for recent webhook with same base key
    const recent = await this.repository.findOne({
      where: {
        webhookId: Like(`${baseWebhookId}%`),
        completedAt: MoreThan(windowStart),
      },
      order: { completedAt: 'DESC' },
    });

    if (recent) {
      this.logger.log(
        {
          baseWebhookId,
          recentWebhookId: recent.webhookId,
          completedAt: recent.completedAt,
        },
        'Duplicate webhook within deduplication window',
      );
      return {
        acquired: false,
        reason: `Duplicate webhook processed at ${recent.completedAt?.toISOString()}`,
      };
    }

    // Insert new record with timestamp suffix for uniqueness
    const timestampedWebhookId = `${baseWebhookId}:${Date.now()}`;
    const entity = WebhookEventEntity.fromDto(
      {
        webhookId: timestampedWebhookId,
        providerName,
        status: WebhookEventStatus.COMPLETED,
        webhookContent,
      },
      userId,
    );
    entity.completedAt = new Date();

    await this.repository.save(entity);
    this.logger.log(
      { webhookId: timestampedWebhookId },
      'Webhook acquired for processing',
    );

    return { acquired: true };
  }
}
