import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
