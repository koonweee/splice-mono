import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ProviderTransactionsSyncedEvent,
  TransactionEvents,
} from '../events/transaction.events';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(TransactionEvents.PROVIDER_TRANSACTIONS_SYNCED)
  async handleProviderTransactionsSynced(
    event: ProviderTransactionsSyncedEvent,
  ): Promise<void> {
    try {
      const notification =
        await this.notificationService.createNewSyncedTransactionsNotification({
          userId: event.userId,
          transactionIds: event.transactionIds,
          accountIds: event.accountIds,
          count: event.count,
          occurredAt: event.occurredAt,
        });

      if (notification) {
        this.logger.log(
          {
            userId: event.userId,
            notificationId: notification.id,
            count: event.count,
          },
          'Created notification for new synced transactions',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          userId: event.userId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create notification for new synced transactions',
      );
    }
  }
}
