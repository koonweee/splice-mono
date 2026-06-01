import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Brackets, In, IsNull, LessThan, Repository } from 'typeorm';
import type {
  Notification,
  NotificationPayload,
  NotificationType,
  PushConfigResponse,
  PushSubscriptionResponse,
  PushSubscriptionStatusResponse,
  RegisterPushSubscriptionDto,
  TestNotificationResponse,
} from '../types/Notification';
import { UserService } from '../user/user.service';
import { NotificationPushDeliveryEntity } from './notification-push-delivery.entity';
import { NotificationEntity } from './notification.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { RenderedPushPayload, WebPushAdapter } from './web-push.adapter';

const NOTIFICATION_PUSH_DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PUSH_DELIVERY_ATTEMPTS = 3;
const PUSH_RETRY_DELAY_MS = 5 * 60 * 1000;
const PUSH_PROCESSING_STALE_MS = 10 * 60 * 1000;

type NewSyncedTransactionsInput = {
  userId: string;
  transactionIds: string[];
  accountIds: string[];
  count: number;
  occurredAt: string;
};

type BankLinkNeedsAttentionInput = {
  userId: string;
  bankLinkId: string;
  providerName: string;
  institutionName: string | null;
  status: 'ERROR' | 'PENDING_REAUTH';
  statusBody: Record<string, unknown> | null;
  occurredAt: string;
};

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  dedupeKey: string;
  payload: NotificationPayload;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly pushSubscriptionRepository: Repository<PushSubscriptionEntity>,
    @InjectRepository(NotificationPushDeliveryEntity)
    private readonly pushDeliveryRepository: Repository<NotificationPushDeliveryEntity>,
    private readonly userService: UserService,
    private readonly webPushAdapter: WebPushAdapter,
  ) {}

  getPushConfig(): PushConfigResponse {
    return {
      configured: this.webPushAdapter.isConfigured(),
      vapidPublicKey: this.webPushAdapter.getPublicKey(),
    };
  }

  async getCurrentSubscriptionStatus(
    userId: string,
    endpoint?: string,
  ): Promise<PushSubscriptionStatusResponse> {
    if (!endpoint) {
      return {
        configured: this.webPushAdapter.isConfigured(),
        subscribed: false,
      };
    }

    const subscription = await this.pushSubscriptionRepository.findOne({
      where: { userId, endpoint, revokedAt: IsNull() },
    });

    return {
      configured: this.webPushAdapter.isConfigured(),
      subscribed: Boolean(subscription),
    };
  }

  async registerPushSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
  ): Promise<PushSubscriptionResponse> {
    await this.userService.enableDefaultNotificationsIfUnset(userId);

    const existing = await this.pushSubscriptionRepository.findOne({
      where: { endpoint: dto.endpoint },
    });
    const entity = existing ?? new PushSubscriptionEntity();

    entity.userId = userId;
    entity.endpoint = dto.endpoint;
    entity.p256dh = dto.keys.p256dh;
    entity.auth = dto.keys.auth;
    entity.userAgent = dto.userAgent ?? null;
    entity.revokedAt = null;

    const saved = await this.pushSubscriptionRepository.save(entity);
    return saved.toResponse();
  }

  async revokeCurrentPushSubscription(
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    const subscription = await this.pushSubscriptionRepository.findOne({
      where: { userId, endpoint, revokedAt: IsNull() },
    });

    if (!subscription) {
      return false;
    }

    subscription.revokedAt = new Date();
    await this.pushSubscriptionRepository.save(subscription);
    return true;
  }

  async revokeAllPushSubscriptions(userId: string): Promise<number> {
    const result = await this.pushSubscriptionRepository
      .createQueryBuilder()
      .update(PushSubscriptionEntity)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL')
      .execute();

    return result.affected ?? 0;
  }

  async createNewSyncedTransactionsNotification(
    input: NewSyncedTransactionsInput,
  ): Promise<Notification | null> {
    const user = await this.userService.findOne(input.userId);
    if (!user?.settings.notifications.transactions.newSyncedTransactions) {
      this.logger.debug(
        { userId: input.userId },
        'New uncategorized transaction notification preference disabled',
      );
      return null;
    }

    const notification = new NotificationEntity();
    notification.userId = input.userId;
    notification.type = 'transactions.new_synced';
    notification.dedupeKey = this.buildDedupeKey(
      input.userId,
      input.transactionIds,
    );
    notification.payload = {
      count: input.count,
      transactionIds: input.transactionIds,
      accountIds: input.accountIds,
      occurredAt: input.occurredAt,
    };
    notification.status = 'active';
    notification.readAt = null;
    notification.archivedAt = null;

    try {
      const result = await this.createNotificationWithPushDeliveries({
        userId: notification.userId,
        type: notification.type,
        dedupeKey: notification.dedupeKey,
        payload: notification.payload,
      });
      return result.notification;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        this.logger.debug(
          { userId: input.userId, dedupeKey: notification.dedupeKey },
          'Notification already exists for dedupe key',
        );
        return null;
      }

      throw error;
    }
  }

  async createBankLinkNeedsAttentionNotification(
    input: BankLinkNeedsAttentionInput,
  ): Promise<Notification | null> {
    const user = await this.userService.findOne(input.userId);
    if (!user?.settings.notifications.bankLinks.needsAttention) {
      this.logger.debug(
        { userId: input.userId, bankLinkId: input.bankLinkId },
        'Bank link needs attention notification preference disabled',
      );
      return null;
    }

    try {
      const result = await this.createNotificationWithPushDeliveries({
        userId: input.userId,
        type: 'bank_link.needs_attention',
        dedupeKey: this.buildBankLinkNeedsAttentionDedupeKey(input),
        payload: {
          bankLinkId: input.bankLinkId,
          providerName: input.providerName,
          institutionName: input.institutionName,
          status: input.status,
          statusBody: input.statusBody,
          occurredAt: input.occurredAt,
        },
      });
      return result.notification;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        this.logger.debug(
          { userId: input.userId, bankLinkId: input.bankLinkId },
          'Notification already exists for bank link needs attention dedupe key',
        );
        return null;
      }

      throw error;
    }
  }

  async createTestNotification(
    userId: string,
  ): Promise<TestNotificationResponse> {
    const result = await this.createNotificationWithPushDeliveries({
      userId,
      type: 'system.test',
      dedupeKey: `system.test:${userId}:${randomUUID()}`,
      payload: {
        occurredAt: new Date().toISOString(),
      },
    });

    return {
      notification: result.notification,
      deliveryCount: result.deliveryCount,
      pushConfigured: this.webPushAdapter.isConfigured(),
    };
  }

  async claimPendingPushDeliveries(
    limit: number,
  ): Promise<NotificationPushDeliveryEntity[]> {
    return this.pushDeliveryRepository.manager.transaction(async (manager) => {
      const deliveryRepo = manager.getRepository(
        NotificationPushDeliveryEntity,
      );
      const now = new Date();
      const staleBefore = new Date(now.getTime() - PUSH_PROCESSING_STALE_MS);
      const deliveries = await deliveryRepo
        .createQueryBuilder('delivery')
        .innerJoin('delivery.subscription', 'subscription')
        .where(
          new Brackets((qb) => {
            qb.where('delivery.status = :pendingStatus', {
              pendingStatus: 'pending',
            })
              .andWhere('delivery.availableAt <= :now', { now })
              .orWhere(
                new Brackets((staleQb) => {
                  staleQb
                    .where('delivery.status = :processingStatus', {
                      processingStatus: 'processing',
                    })
                    .andWhere('delivery.processingStartedAt <= :staleBefore', {
                      staleBefore,
                    });
                }),
              );
          }),
        )
        .andWhere('subscription.revokedAt IS NULL')
        .orderBy('delivery.createdAt', 'ASC')
        .setLock('pessimistic_write', undefined, ['delivery'])
        .setOnLocked('skip_locked')
        .take(limit)
        .getMany();

      if (deliveries.length === 0) {
        return [];
      }

      deliveries.forEach((delivery) => {
        delivery.status = 'processing';
        delivery.processingStartedAt = now;
        delivery.attemptCount += 1;
      });

      await deliveryRepo.save(deliveries);

      const claimedIds = deliveries.map((delivery) => delivery.id);
      const claimedDeliveries = await deliveryRepo.find({
        where: { id: In(claimedIds) },
        relations: {
          notification: true,
          subscription: true,
        },
      });

      const deliveryById = new Map(
        claimedDeliveries.map((delivery) => [delivery.id, delivery]),
      );
      return claimedIds.flatMap((id) => {
        const delivery = deliveryById.get(id);
        return delivery ? [delivery] : [];
      });
    });
  }

  renderPushPayload(
    notification: Pick<NotificationEntity, 'id' | 'type' | 'payload'>,
  ): RenderedPushPayload {
    switch (notification.type) {
      case 'transactions.new_synced': {
        const transactionsPayload =
          notification.payload as NotificationPayload & {
            count: number;
          };
        return {
          title: 'New uncategorized transactions',
          body:
            transactionsPayload.count === 1
              ? '1 new uncategorized transaction was added'
              : `${transactionsPayload.count} new uncategorized transactions were added`,
          url: '/transactions?categoryId=UNCATEGORIZED',
          tag: notification.id,
          badgeCount: transactionsPayload.count,
        };
      }
      case 'bank_link.needs_attention': {
        const bankLinkPayload = notification.payload as NotificationPayload & {
          institutionName?: string | null;
          status?: string;
        };
        const institutionName =
          bankLinkPayload.institutionName?.trim() || 'A linked account';
        return {
          title: `${institutionName} needs attention`,
          body:
            bankLinkPayload.status === 'PENDING_REAUTH'
              ? 'Reconnect this account to keep Splice syncing.'
              : 'Fix this connection to keep Splice syncing.',
          url: '/accounts',
          tag: notification.id,
        };
      }
      case 'system.test':
        return {
          title: 'Splice test notification',
          body: 'Push notifications are working.',
          url: '/settings?tab=notifications',
          tag: notification.id,
        };
    }
  }

  async sendPushDelivery(
    delivery: NotificationPushDeliveryEntity,
  ): Promise<void> {
    try {
      await this.webPushAdapter.send(
        delivery.subscription,
        this.renderPushPayload(delivery.notification),
      );
      delivery.status = 'sent';
      delivery.sentAt = new Date();
      delivery.lastError = null;
      await this.pushDeliveryRepository.save(delivery);
    } catch (error) {
      await this.handlePushDeliveryFailure(delivery, error);
    }
  }

  async cleanupOldPushDeliveries(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - NOTIFICATION_PUSH_DELIVERY_RETENTION_MS,
    );
    const result = await this.pushDeliveryRepository.delete({
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  private async handlePushDeliveryFailure(
    delivery: NotificationPushDeliveryEntity,
    error: unknown,
  ): Promise<void> {
    const statusCode = this.getWebPushStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 404 || statusCode === 410) {
      delivery.subscription.revokedAt = new Date();
      delivery.status = 'failed';
      delivery.lastError = message;
      await this.pushSubscriptionRepository.save(delivery.subscription);
      await this.pushDeliveryRepository.save(delivery);
      return;
    }

    if (delivery.attemptCount >= MAX_PUSH_DELIVERY_ATTEMPTS) {
      delivery.status = 'failed';
      delivery.lastError = message;
      await this.pushDeliveryRepository.save(delivery);
      return;
    }

    delivery.status = 'pending';
    delivery.availableAt = new Date(Date.now() + PUSH_RETRY_DELAY_MS);
    delivery.lastError = message;
    await this.pushDeliveryRepository.save(delivery);
  }

  private async createNotificationWithPushDeliveries(
    input: CreateNotificationInput,
  ): Promise<{ notification: Notification; deliveryCount: number }> {
    const notification = new NotificationEntity();
    notification.userId = input.userId;
    notification.type = input.type;
    notification.dedupeKey = input.dedupeKey;
    notification.payload = input.payload;
    notification.status = 'active';
    notification.readAt = null;
    notification.archivedAt = null;

    return this.notificationRepository.manager.transaction(async (manager) => {
      const notificationRepo = manager.getRepository(NotificationEntity);
      const subscriptionRepo = manager.getRepository(PushSubscriptionEntity);
      const deliveryRepo = manager.getRepository(
        NotificationPushDeliveryEntity,
      );

      const savedNotification = await notificationRepo.save(notification);
      let deliveryCount = 0;

      if (this.webPushAdapter.isConfigured()) {
        const subscriptions = await subscriptionRepo.find({
          where: { userId: input.userId, revokedAt: IsNull() },
        });
        deliveryCount = subscriptions.length;

        if (subscriptions.length > 0) {
          await deliveryRepo.save(
            subscriptions.map((subscription) => {
              const delivery = new NotificationPushDeliveryEntity();
              delivery.notificationId = savedNotification.id;
              delivery.subscriptionId = subscription.id;
              delivery.status = 'pending';
              delivery.attemptCount = 0;
              delivery.availableAt = new Date();
              delivery.processingStartedAt = null;
              delivery.sentAt = null;
              delivery.lastError = null;
              return delivery;
            }),
          );
        }
      }

      return {
        notification: savedNotification.toObject(),
        deliveryCount,
      };
    });
  }

  private buildDedupeKey(userId: string, transactionIds: string[]): string {
    const hash = createHash('sha256')
      .update([...transactionIds].sort().join(':'))
      .digest('hex');
    return `transactions.new_synced:${userId}:${hash}`;
  }

  private buildBankLinkNeedsAttentionDedupeKey(
    input: BankLinkNeedsAttentionInput,
  ): string {
    return [
      'bank_link.needs_attention',
      input.userId,
      input.bankLinkId,
      input.status,
      input.occurredAt,
    ].join(':');
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    );
  }

  private getWebPushStatusCode(error: unknown): number | null {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('statusCode' in error)
    ) {
      return null;
    }

    const statusCode = (error as { statusCode?: unknown }).statusCode;
    return typeof statusCode === 'number' ? statusCode : null;
  }
}
