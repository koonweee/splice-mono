import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  REFRESH_TOKEN_CLEANUP_BATCH_SIZE,
  RefreshTokenCleanupService,
} from './refresh-token-cleanup.service';

const MAX_BATCHES_PER_RUN = 10;

@Injectable()
export class RefreshTokenCleanupScheduledService {
  private readonly logger = new Logger(
    RefreshTokenCleanupScheduledService.name,
  );

  constructor(private readonly cleanupService: RefreshTokenCleanupService) {}

  @Cron('0 15 3 * * *', {
    name: 'cleanupInactiveRefreshTokens',
    timeZone: 'UTC',
  })
  async handleCleanup(): Promise<void> {
    const now = new Date();
    let deletedCount = 0;
    let batches = 0;

    try {
      while (batches < MAX_BATCHES_PER_RUN) {
        const batchDeleted = await this.cleanupService.cleanupInactiveTokens(
          now,
          REFRESH_TOKEN_CLEANUP_BATCH_SIZE,
        );
        deletedCount += batchDeleted;
        batches += 1;
        if (batchDeleted < REFRESH_TOKEN_CLEANUP_BATCH_SIZE) {
          break;
        }
      }
      this.logger.log(
        { now, batches, deletedCount },
        'Inactive refresh token cleanup completed',
      );
    } catch (error) {
      this.logger.error(
        { now, batches, deletedCount, error: String(error) },
        'Inactive refresh token cleanup failed',
      );
    }
  }
}
