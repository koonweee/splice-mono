import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateWebhookEventDto,
  UpdateWebhookEventDto,
  WebhookEvent,
  WebhookEventStatus,
} from '../types/WebhookEvent';
import { WebhookEventEntity } from './webhook-event.entity';

@Injectable()
export class WebhookEventService {
  private readonly logger = new Logger(WebhookEventService.name);

  constructor(
    @InjectRepository(WebhookEventEntity)
    private repository: Repository<WebhookEventEntity>,
  ) {}

  /**
   * Create a new webhook event record
   * @throws Error if webhookId already exists (duplicate webhook)
   */
  async create(
    createWebhookEventDto: CreateWebhookEventDto,
    userId: string,
  ): Promise<WebhookEvent> {
    this.logger.log(
      `Creating webhook event: webhookId=${createWebhookEventDto.webhookId}, userId=${userId}`,
    );
    const entity = WebhookEventEntity.fromDto(createWebhookEventDto, userId);
    const savedEntity = await this.repository.save(entity);
    this.logger.log(`WebhookEvent created successfully: id=${savedEntity.id}`);
    return savedEntity.toObject();
  }

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

  /**
   * Check if a webhook has already been processed
   */
  async exists(webhookId: string): Promise<boolean> {
    this.logger.log(`Checking if webhook exists: webhookId=${webhookId}`);
    const count = await this.repository.count({ where: { webhookId } });
    const exists = count > 0;
    this.logger.log(
      `Webhook ${exists ? 'exists' : 'does not exist'}: webhookId=${webhookId}`,
    );
    return exists;
  }

  async findOne(id: string): Promise<WebhookEvent | null> {
    this.logger.log(`Finding webhook event: id=${id}`);
    const entity = await this.repository.findOne({ where: { id } });

    if (!entity) {
      this.logger.warn(`WebhookEvent not found: id=${id}`);
      return null;
    }

    this.logger.log(`WebhookEvent found: id=${id}`);
    return entity.toObject();
  }

  async findByWebhookId(webhookId: string): Promise<WebhookEvent | null> {
    this.logger.log(`Finding webhook event by webhookId: ${webhookId}`);
    const entity = await this.repository.findOne({ where: { webhookId } });

    if (!entity) {
      this.logger.warn(`WebhookEvent not found: webhookId=${webhookId}`);
      return null;
    }

    this.logger.log(`WebhookEvent found: webhookId=${webhookId}`);
    return entity.toObject();
  }

  async findAll(): Promise<WebhookEvent[]> {
    this.logger.log('Finding all webhook events');
    const entities = await this.repository.find();
    this.logger.log(`Found ${entities.length} webhook events`);
    return entities.map((entity) => entity.toObject());
  }

  async update(
    id: string,
    updateWebhookEventDto: UpdateWebhookEventDto,
  ): Promise<WebhookEvent | null> {
    this.logger.log(`Updating webhook event: id=${id}`);
    const entity = await this.repository.findOne({ where: { id } });
    if (!entity) {
      this.logger.warn(`WebhookEvent not found for update: id=${id}`);
      return null;
    }

    // Update only provided fields
    if (updateWebhookEventDto.webhookId !== undefined) {
      entity.webhookId = updateWebhookEventDto.webhookId;
    }
    if (updateWebhookEventDto.webhookContent !== undefined) {
      entity.webhookContent = updateWebhookEventDto.webhookContent ?? null;
    }
    if (updateWebhookEventDto.providerName !== undefined) {
      entity.providerName = updateWebhookEventDto.providerName;
    }
    if (updateWebhookEventDto.status !== undefined) {
      entity.status = updateWebhookEventDto.status;
    }
    if (updateWebhookEventDto.expiresAt !== undefined) {
      entity.expiresAt = updateWebhookEventDto.expiresAt ?? null;
    }

    const savedEntity = await this.repository.save(entity);
    this.logger.log(`WebhookEvent updated successfully: id=${id}`);
    return savedEntity.toObject();
  }

  async remove(id: string): Promise<boolean> {
    this.logger.log(`Removing webhook event: id=${id}`);
    const result = await this.repository.delete(id);
    const success =
      result.affected !== null &&
      result.affected !== undefined &&
      result.affected > 0;

    if (success) {
      this.logger.log(`WebhookEvent removed successfully: id=${id}`);
    } else {
      this.logger.warn(`WebhookEvent not found for removal: id=${id}`);
    }

    return success;
  }
}
