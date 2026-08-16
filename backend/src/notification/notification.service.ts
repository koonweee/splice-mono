import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Brackets, EntityManager, In, IsNull, Repository } from 'typeorm';
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
import { getPostgresMutationAffectedCount } from '../common/postgres-mutation-result';
import { UserService } from '../user/user.service';
import { NotificationPushDeliveryEntity } from './notification-push-delivery.entity';
import { NotificationEntity } from './notification.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { RenderedPushPayload, WebPushAdapter } from './web-push.adapter';

const NOTIFICATION_PUSH_DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_CLEANUP_BATCH_SIZE = 500;
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

    return this.pushSubscriptionRepository.manager.transaction(
      async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [dto.endpoint],
        );
        const subscriptionRepo = manager.getRepository(PushSubscriptionEntity);
        const deliveryRepo = manager.getRepository(
          NotificationPushDeliveryEntity,
        );
        const existing = await subscriptionRepo.findOne({
          where: { endpoint: dto.endpoint },
          lock: { mode: 'pessimistic_write' },
        });
        let entity = existing ?? new PushSubscriptionEntity();

        if (existing && existing.userId !== userId) {
          const staleBefore = new Date(Date.now() - PUSH_PROCESSING_STALE_MS);
          const activeOldOwnerDeliveries: Array<{
            id: string;
            status: 'pending' | 'processing';
            processingStartedAt: Date | null;
          }> = await manager.query(
            `
              SELECT delivery.id,
                delivery.status,
                delivery."processingStartedAt"
              FROM notification_push_delivery_entity delivery
              WHERE delivery."subscriptionId" = $1
                AND delivery.status IN ('pending', 'processing')
              FOR UPDATE OF delivery
            `,
            [existing.id],
          );
          if (
            activeOldOwnerDeliveries.some(
              (delivery) =>
                delivery.status === 'processing' &&
                delivery.processingStartedAt !== null &&
                new Date(delivery.processingStartedAt) > staleBefore,
            )
          ) {
            // A legacy worker may already hold an in-memory copy of this
            // delivery and does not re-check endpoint ownership before send.
            // Keep ownership unchanged until that send finishes; the client
            // can safely retry registration afterward.
            throw new ConflictException(
              'Push subscription is currently delivering a notification; retry registration shortly',
            );
          }

          const abandonedDeliveryIds = activeOldOwnerDeliveries.map(
            (delivery) => delivery.id,
          );
          if (abandonedDeliveryIds.length > 0) {
            await deliveryRepo.update(
              {
                id: In(abandonedDeliveryIds),
                status: In(['pending', 'processing']),
              },
              {
                status: 'failed',
                processingStartedAt: null,
                lastError: 'Push endpoint ownership changed',
              },
            );
          }

          // Do not reassign the existing row in place. A legacy notification
          // transaction may have selected it for the old owner before this
          // transaction acquired the endpoint lock and insert a delivery after
          // we commit. Keeping that row owned by the old user and revoked makes
          // such a late insert ineligible, while moving the unique endpoint off
          // the row lets the new owner receive a fresh subscription identity.
          existing.endpoint = `reassigned:${existing.id}:${randomUUID()}`;
          existing.revokedAt = new Date();
          await subscriptionRepo.save(existing);
          entity = new PushSubscriptionEntity();
        }

        entity.userId = userId;
        entity.endpoint = dto.endpoint;
        entity.p256dh = dto.keys.p256dh;
        entity.auth = dto.keys.auth;
        entity.userAgent = dto.userAgent ?? null;
        entity.revokedAt = null;

        const saved = await subscriptionRepo.save(entity);
        return saved.toResponse();
      },
    );
  }

  async revokeCurrentPushSubscription(
    userId: string,
    endpoint: string,
  ): Promise<boolean> {
    return this.pushSubscriptionRepository.manager.transaction(
      async (manager) => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [endpoint],
        );
        const subscriptionRepo = manager.getRepository(PushSubscriptionEntity);
        const subscription = await subscriptionRepo.findOne({
          where: { userId, endpoint, revokedAt: IsNull() },
          lock: { mode: 'pessimistic_write' },
        });

        if (!subscription) {
          return false;
        }

        await this.terminalizeAbandonedPushDeliveries(
          manager,
          [subscription.id],
          'Push subscription revoked',
        );
        subscription.revokedAt = new Date();
        await subscriptionRepo.save(subscription);
        return true;
      },
    );
  }

  async revokeAllPushSubscriptions(userId: string): Promise<number> {
    return this.pushSubscriptionRepository.manager.transaction(
      async (manager) => {
        const endpoints: Array<{ endpoint: string }> = await manager.query(
          `
            SELECT endpoint
            FROM push_subscription_entity
            WHERE "userId" = $1
              AND "revokedAt" IS NULL
            ORDER BY endpoint
          `,
          [userId],
        );
        if (endpoints.length === 0) {
          return 0;
        }

        await manager.query(
          `
            SELECT pg_advisory_xact_lock(hashtextextended(endpoint, 0))
            FROM unnest($1::text[]) endpoint
            ORDER BY endpoint
          `,
          [endpoints.map(({ endpoint }) => endpoint)],
        );
        const subscriptionRepo = manager.getRepository(PushSubscriptionEntity);
        const subscriptions = await subscriptionRepo.find({
          where: { userId, revokedAt: IsNull() },
          order: { endpoint: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (subscriptions.length === 0) {
          return 0;
        }

        await this.terminalizeAbandonedPushDeliveries(
          manager,
          subscriptions.map(({ id }) => id),
          'Push subscription revoked',
        );
        const revokedAt = new Date();
        subscriptions.forEach((subscription) => {
          subscription.revokedAt = revokedAt;
        });
        await subscriptionRepo.save(subscriptions);
        return subscriptions.length;
      },
    );
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
      const abandonedResult: unknown = await manager.query(
        `
          WITH abandoned AS (
            SELECT delivery.id
            FROM notification_push_delivery_entity delivery
            JOIN push_subscription_entity subscription
              ON subscription.id = delivery."subscriptionId"
            JOIN notification_entity notification
              ON notification.id = delivery."notificationId"
            WHERE (
                delivery.status = 'pending'
                OR (
                  delivery.status = 'processing'
                  AND (
                    delivery."processingStartedAt" IS NULL
                    OR delivery."processingStartedAt" <= $1
                  )
                )
              )
              AND (
                subscription."revokedAt" IS NOT NULL
                OR notification."userId" <> subscription."userId"
              )
            ORDER BY delivery."createdAt", delivery.id
            FOR UPDATE OF delivery, subscription SKIP LOCKED
            LIMIT $2
          )
          UPDATE notification_push_delivery_entity delivery
          SET status = 'failed',
            "processingStartedAt" = NULL,
            "lastError" = 'Push delivery is no longer owner-eligible',
            "updatedAt" = now()
          FROM abandoned
          WHERE delivery.id = abandoned.id
          RETURNING delivery.id
        `,
        [staleBefore, Math.max(limit, NOTIFICATION_CLEANUP_BATCH_SIZE)],
      );
      const abandonedCount = getPostgresMutationAffectedCount(abandonedResult);
      if (abandonedCount > 0) {
        this.logger.debug(
          { count: abandonedCount },
          'Terminalized abandoned push deliveries',
        );
      }
      const deliveries = await deliveryRepo
        .createQueryBuilder('delivery')
        .innerJoin('delivery.subscription', 'subscription')
        .innerJoin('delivery.notification', 'notification')
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
        .andWhere('notification.userId = subscription.userId')
        .orderBy('delivery.createdAt', 'ASC')
        .setLock('pessimistic_write', undefined, ['delivery', 'subscription'])
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
      const ineligibleIds = claimedDeliveries
        .filter(
          (delivery) =>
            delivery.notification.userId !== delivery.subscription.userId ||
            delivery.subscription.revokedAt !== null,
        )
        .map((delivery) => delivery.id);
      if (ineligibleIds.length > 0) {
        await deliveryRepo.update(
          { id: In(ineligibleIds), status: 'processing' },
          {
            status: 'failed',
            processingStartedAt: null,
            lastError: 'Push delivery is no longer owner-eligible',
          },
        );
      }
      return claimedIds.flatMap((id) => {
        const delivery = deliveryById.get(id);
        return delivery &&
          delivery.notification.userId === delivery.subscription.userId &&
          delivery.subscription.revokedAt === null
          ? [delivery]
          : [];
      });
    });
  }

  private async terminalizeAbandonedPushDeliveries(
    manager: EntityManager,
    subscriptionIds: string[],
    reason: string,
    now = new Date(),
  ): Promise<number> {
    if (subscriptionIds.length === 0) {
      return 0;
    }

    const staleBefore = new Date(now.getTime() - PUSH_PROCESSING_STALE_MS);
    const rows: Array<{ id: string }> = await manager.query(
      `
        SELECT delivery.id
        FROM notification_push_delivery_entity delivery
        WHERE delivery."subscriptionId" = ANY($1::uuid[])
          AND (
            delivery.status = 'pending'
            OR (
              delivery.status = 'processing'
              AND (
                delivery."processingStartedAt" IS NULL
                OR delivery."processingStartedAt" <= $2
              )
            )
          )
        ORDER BY delivery."createdAt", delivery.id
        FOR UPDATE OF delivery
      `,
      [subscriptionIds, staleBefore],
    );
    if (rows.length === 0) {
      return 0;
    }

    const result = await manager
      .getRepository(NotificationPushDeliveryEntity)
      .update(
        {
          id: In(rows.map(({ id }) => id)),
          status: In(['pending', 'processing']),
        },
        {
          status: 'failed',
          processingStartedAt: null,
          lastError: reason,
        },
      );
    return result.affected ?? 0;
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
    await this.pushDeliveryRepository.manager.transaction(async (manager) => {
      const lockedRows: Array<{ id: string; ownersMatch: boolean }> =
        await manager.query(
          `
            SELECT delivery.id,
              (notification."userId" = subscription."userId") AS "ownersMatch"
            FROM notification_push_delivery_entity delivery
            JOIN push_subscription_entity subscription
              ON subscription.id = delivery."subscriptionId"
            JOIN notification_entity notification
              ON notification.id = delivery."notificationId"
            WHERE delivery.id = $1
              AND delivery.status = 'processing'
            FOR UPDATE OF delivery, subscription
          `,
          [delivery.id],
        );
      const deliveryRepo = manager.getRepository(
        NotificationPushDeliveryEntity,
      );
      const subscriptionRepo = manager.getRepository(PushSubscriptionEntity);
      const locked = lockedRows[0];
      if (!locked) {
        return;
      }
      if (!locked.ownersMatch) {
        await deliveryRepo.update(
          { id: delivery.id, status: 'processing' },
          {
            status: 'failed',
            processingStartedAt: null,
            lastError: 'Push delivery owner mismatch',
          },
        );
        return;
      }

      const current = await deliveryRepo.findOne({
        where: { id: delivery.id, status: 'processing' },
        relations: { notification: true, subscription: true },
      });
      if (
        !current ||
        current.subscription.revokedAt !== null ||
        current.notification.userId !== current.subscription.userId
      ) {
        if (current) {
          current.status = 'failed';
          current.processingStartedAt = null;
          current.lastError = 'Push delivery is no longer owner-eligible';
          await deliveryRepo.save(current);
        }
        return;
      }

      try {
        await this.webPushAdapter.send(
          current.subscription,
          this.renderPushPayload(current.notification),
        );
        current.status = 'sent';
        current.sentAt = new Date();
        current.lastError = null;
        await deliveryRepo.save(current);
      } catch (error) {
        await this.handlePushDeliveryFailure(
          current,
          error,
          subscriptionRepo,
          deliveryRepo,
        );
      }
    });
  }

  async cleanupOldNotificationRecords(
    now = new Date(),
  ): Promise<{ deliveries: number; notifications: number }> {
    const deliveryCutoff = new Date(
      now.getTime() - NOTIFICATION_PUSH_DELIVERY_RETENTION_MS,
    );
    const terminalStatuses = ['sent', 'failed'] as const;
    const notificationCutoff = new Date(
      now.getTime() - NOTIFICATION_RETENTION_MS,
    );
    return this.notificationRepository.manager.transaction(async (manager) => {
      const deliveryRepository = manager.getRepository(
        NotificationPushDeliveryEntity,
      );
      const notificationRepository = manager.getRepository(NotificationEntity);
      const deliveries = await deliveryRepository
        .createQueryBuilder('delivery')
        .select(['delivery.id'])
        .where('delivery.createdAt < :deliveryCutoff', { deliveryCutoff })
        .andWhere('delivery.status IN (:...terminalStatuses)', {
          terminalStatuses: [...terminalStatuses],
        })
        .orderBy('delivery.createdAt', 'ASC')
        .addOrderBy('delivery.id', 'ASC')
        .take(NOTIFICATION_CLEANUP_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      const deliveryResult =
        deliveries.length === 0
          ? { affected: 0 }
          : await deliveryRepository.delete({
              id: In(deliveries.map((delivery) => delivery.id)),
              status: In([...terminalStatuses]),
            });

      const notifications = await notificationRepository
        .createQueryBuilder('notification')
        .select(['notification.id'])
        .where('notification.createdAt < :notificationCutoff', {
          notificationCutoff,
        })
        .andWhere(
          `NOT EXISTS (
            SELECT 1
            FROM "notification_push_delivery_entity" "delivery"
            WHERE "delivery"."notificationId" = "notification"."id"
          )`,
        )
        .orderBy('notification.createdAt', 'ASC')
        .addOrderBy('notification.id', 'ASC')
        .take(NOTIFICATION_CLEANUP_BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();
      const notificationResult =
        notifications.length === 0
          ? { affected: 0 }
          : await notificationRepository.delete({
              id: In(notifications.map((notification) => notification.id)),
            });

      return {
        deliveries: deliveryResult.affected ?? 0,
        notifications: notificationResult.affected ?? 0,
      };
    });
  }

  private async handlePushDeliveryFailure(
    delivery: NotificationPushDeliveryEntity,
    error: unknown,
    subscriptionRepository: Repository<PushSubscriptionEntity>,
    deliveryRepository: Repository<NotificationPushDeliveryEntity>,
  ): Promise<void> {
    const statusCode = this.getWebPushStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 404 || statusCode === 410) {
      delivery.subscription.revokedAt = new Date();
      delivery.status = 'failed';
      delivery.lastError = message;
      await subscriptionRepository.save(delivery.subscription);
      await deliveryRepository.save(delivery);
      return;
    }

    if (delivery.attemptCount >= MAX_PUSH_DELIVERY_ATTEMPTS) {
      delivery.status = 'failed';
      delivery.lastError = message;
      await deliveryRepository.save(delivery);
      return;
    }

    delivery.status = 'pending';
    delivery.availableAt = new Date(Date.now() + PUSH_RETRY_DELAY_MS);
    delivery.lastError = message;
    await deliveryRepository.save(delivery);
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
