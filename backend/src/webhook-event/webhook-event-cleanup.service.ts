import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getPostgresMutationAffectedCount } from '../common/postgres-mutation-result';
import { WebhookEventStatus } from '../types/WebhookEvent';
import { WebhookEventEntity } from './webhook-event.entity';

export const WEBHOOK_PENDING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const WEBHOOK_CLEANUP_BATCH_SIZE = 100;
export const WEBHOOK_CLEANUP_MAX_BATCH_SIZE = 500;

@Injectable()
export class WebhookEventCleanupService {
  private readonly logger = new Logger(WebhookEventCleanupService.name);

  constructor(
    @InjectRepository(WebhookEventEntity)
    private readonly repository: Repository<WebhookEventEntity>,
  ) {}

  async cleanupExpiredPending(
    now = new Date(),
    requestedBatchSize = WEBHOOK_CLEANUP_BATCH_SIZE,
  ): Promise<number> {
    const batchSize = Math.max(
      1,
      Math.min(requestedBatchSize, WEBHOOK_CLEANUP_MAX_BATCH_SIZE),
    );
    const cutoff = new Date(now.getTime() - WEBHOOK_PENDING_RETENTION_MS);

    const deleted: unknown = await this.repository.query(
      `WITH candidates AS (
         SELECT event."id"
         FROM "webhook_event_entity" event
         WHERE event."status" = $1
           AND event."expiresAt" IS NOT NULL
           AND event."expiresAt" <= $2
         ORDER BY event."expiresAt" ASC, event."id" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $3
       )
       DELETE FROM "webhook_event_entity" event
       USING candidates
       WHERE event."id" = candidates."id"
         AND event."status" = $1
         AND event."expiresAt" <= $2
       RETURNING event."id"`,
      [WebhookEventStatus.PENDING, cutoff, batchSize],
    );

    const deletedCount = getPostgresMutationAffectedCount(deleted);
    this.logger.log(
      { cutoff, batchSize, deletedCount },
      'Expired pending webhook context cleanup batch completed',
    );
    return deletedCount;
  }
}
