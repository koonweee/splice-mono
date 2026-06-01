import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BankLinkEvents,
  BankLinkNeedsAttentionEvent,
} from '../events/bank-link.events';
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
          'Created notification for new uncategorized transactions',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          userId: event.userId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create notification for new uncategorized transactions',
      );
    }
  }

  @OnEvent(BankLinkEvents.NEEDS_ATTENTION)
  async handleBankLinkNeedsAttention(
    event: BankLinkNeedsAttentionEvent,
  ): Promise<void> {
    try {
      const notification =
        await this.notificationService.createBankLinkNeedsAttentionNotification(
          {
            userId: event.userId,
            bankLinkId: event.bankLinkId,
            providerName: event.providerName,
            institutionName: event.institutionName,
            status: event.status,
            statusBody: event.statusBody,
            occurredAt: event.occurredAt,
          },
        );

      if (notification) {
        this.logger.log(
          {
            userId: event.userId,
            bankLinkId: event.bankLinkId,
            notificationId: notification.id,
          },
          'Created notification for bank link requiring attention',
        );
      }
    } catch (error) {
      this.logger.error(
        {
          userId: event.userId,
          bankLinkId: event.bankLinkId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to create notification for bank link requiring attention',
      );
    }
  }
}
