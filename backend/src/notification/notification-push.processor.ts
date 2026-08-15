import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

const PUSH_DELIVERY_BATCH_SIZE = 25;

@Injectable()
export class NotificationPushProcessor {
  private readonly logger = new Logger(NotificationPushProcessor.name);
  private processing = false;

  constructor(private readonly notificationService: NotificationService) {}

  @Interval(15_000)
  async processPendingPushDeliveries(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      const deliveries =
        await this.notificationService.claimPendingPushDeliveries(
          PUSH_DELIVERY_BATCH_SIZE,
        );

      if (deliveries.length === 0) {
        return;
      }

      this.logger.log(
        { count: deliveries.length },
        'Processing notification push deliveries',
      );

      for (const delivery of deliveries) {
        await this.notificationService.sendPushDelivery(delivery);
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to process notification push deliveries',
      );
    } finally {
      this.processing = false;
    }
  }

  @Cron('0 30 3 * * *', {
    name: 'notificationRecordCleanup',
    timeZone: 'UTC',
  })
  async cleanupOldNotificationRecords(): Promise<void> {
    try {
      const deleted =
        await this.notificationService.cleanupOldNotificationRecords();
      if (deleted.deliveries > 0 || deleted.notifications > 0) {
        this.logger.log(
          deleted,
          'Cleaned up old notification delivery records',
        );
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to clean up old notification delivery records',
      );
    }
  }
}
