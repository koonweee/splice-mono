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
      `Creating pending webhook event: webhookId=${webhookId}, provider=${providerName}, userId=${userId}`,
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
      `Pending WebhookEvent created successfully: id=${savedEntity.id}`,
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
    this.logger.log(`Finding pending webhook event: webhookId=${webhookId}`);
    const entity = await this.repository.findOne({
      where: { webhookId, status: WebhookEventStatus.PENDING },
    });

    if (!entity) {
      this.logger.warn(
        `Pending WebhookEvent not found: webhookId=${webhookId}`,
      );
      return null;
    }

    this.logger.log(`Pending WebhookEvent found: webhookId=${webhookId}`);
    return entity.toObject();
  }

  /**
   * Mark a pending webhook event as completed with the webhook payload
   */
  async markCompleted(
    webhookId: string,
    webhookContent: Record<string, any>,
  ): Promise<WebhookEvent | null> {
    this.logger.log(
      `Marking webhook event as completed: webhookId=${webhookId}`,
    );
    const entity = await this.repository.findOne({
      where: { webhookId, status: WebhookEventStatus.PENDING },
    });

    if (!entity) {
      this.logger.warn(
        `Pending WebhookEvent not found for completion: webhookId=${webhookId}`,
      );
      return null;
    }

    entity.status = WebhookEventStatus.COMPLETED;
    entity.webhookContent = webhookContent;
    entity.completedAt = new Date();

    const savedEntity = await this.repository.save(entity);
    this.logger.log(`WebhookEvent marked as completed: webhookId=${webhookId}`);
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
    this.logger.log(`Marking webhook event as failed: webhookId=${webhookId}`);
    const entity = await this.repository.findOne({
      where: { webhookId, status: WebhookEventStatus.PENDING },
    });

    if (!entity) {
      this.logger.warn(
        `Pending WebhookEvent not found for failure: webhookId=${webhookId}`,
      );
      return null;
    }

    entity.status = WebhookEventStatus.FAILED;
    entity.errorMessage = errorMessage;
    entity.webhookContent = webhookContent ?? null;
    entity.completedAt = new Date();

    const savedEntity = await this.repository.save(entity);
    this.logger.log(`WebhookEvent marked as failed: webhookId=${webhookId}`);
    return savedEntity.toObject();
  }
}
