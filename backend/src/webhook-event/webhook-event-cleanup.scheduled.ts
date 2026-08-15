import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  WEBHOOK_CLEANUP_BATCH_SIZE,
  WebhookEventCleanupService,
} from './webhook-event-cleanup.service';

const MAX_BATCHES_PER_RUN = 10;

@Injectable()
export class WebhookEventCleanupScheduledService {
  private readonly logger = new Logger(
    WebhookEventCleanupScheduledService.name,
  );

  constructor(private readonly cleanupService: WebhookEventCleanupService) {}

  @Cron('0 10 3 * * *', {
    name: 'cleanupExpiredPendingWebhookContexts',
    timeZone: 'UTC',
  })
  async handleCleanup(): Promise<void> {
    const now = new Date();
    let deletedCount = 0;
    let batches = 0;

    try {
      while (batches < MAX_BATCHES_PER_RUN) {
        const batchDeleted = await this.cleanupService.cleanupExpiredPending(
          now,
          WEBHOOK_CLEANUP_BATCH_SIZE,
        );
        deletedCount += batchDeleted;
        batches += 1;
        if (batchDeleted < WEBHOOK_CLEANUP_BATCH_SIZE) {
          break;
        }
      }
      this.logger.log(
        { now, batches, deletedCount },
        'Expired pending webhook context cleanup completed',
      );
    } catch (error) {
      this.logger.error(
        { now, batches, deletedCount, error: String(error) },
        'Expired pending webhook context cleanup failed',
      );
    }
  }
}
