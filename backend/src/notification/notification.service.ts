import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { Brackets, EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import type {
  Notification,
  NotificationInboxItem,
  NotificationInboxPage,
  NotificationInboxQuery,
  NotificationSummary,
  NotificationPayload,
  NotificationType,
  PushConfigResponse,
  PushEnrollmentEligibility,
  PushSubscriptionResponse,
  PushSubscriptionStatusResponse,
  RegisterPushSubscriptionDto,
  TestNotificationResponse,
} from '../types/Notification';
import { getPostgresMutationAffectedCount } from '../common/postgres-mutation-result';
import { BrowserSessionService } from '../auth/browser-session.service';
import { TransactionQueryService } from '../transaction/transaction-query.service';
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
    private readonly browserSessions: BrowserSessionService,
    private readonly transactionQueries: TransactionQueryService,
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
    refreshToken?: string,
  ): Promise<PushSubscriptionStatusResponse> {
    if (!refreshToken)
      throw new UnauthorizedException('A browser session is required');
    return this.pushSubscriptionRepository.manager.transaction(
      async (manager) => {
        const session = await this.browserSessions.resolveForRefreshToken(
          manager,
          refreshToken,
          userId,
        );
        const subscription = endpoint
          ? await manager.getRepository(PushSubscriptionEntity).findOne({
              where: { userId, endpoint },
            })
          : null;
        const ownedEnrollment = subscription?.sessionId === session.id;
        return {
          configured: this.webPushAdapter.isConfigured(),
          subscribed: Boolean(
            ownedEnrollment &&
              !subscription?.revokedAt &&
              !subscription?.rebindRequired,
          ),
          rebindRequired: Boolean(
            subscription?.rebindRequired &&
              (!subscription.sessionId || ownedEnrollment),
          ),
          enrollmentId:
            ownedEnrollment && !subscription?.revokedAt
              ? (subscription?.enrollmentId ?? null)
              : null,
        };
      },
    );
  }

  async getEnrollmentEligibility(
    userId: string,
    enrollmentId: string,
    refreshToken?: string,
  ): Promise<PushEnrollmentEligibility> {
    if (!refreshToken) return { eligible: false };
    try {
      return await this.pushSubscriptionRepository.manager.transaction(
        async (manager) => {
          const session = await this.browserSessions.resolveForRefreshToken(
            manager,
            refreshToken,
            userId,
          );
          const subscription = await manager
            .getRepository(PushSubscriptionEntity)
            .findOne({
              where: {
                userId,
                sessionId: session.id,
                enrollmentId,
                revokedAt: IsNull(),
                rebindRequired: false,
              },
              lock: { mode: 'pessimistic_read' },
            });
          return { eligible: Boolean(subscription) };
        },
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) return { eligible: false };
      throw error;
    }
  }

  async getSummary(userId: string): Promise<NotificationSummary> {
    return this.notificationRepository.manager.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const rows: Array<{ computedAt: Date }> = await manager.query(
          'SELECT transaction_timestamp() AS "computedAt"',
        );
        const uncategorizedTransactionCount =
          await this.transactionQueries.countUncategorized(userId, manager);
        const unreadNotificationCount = await this.inboxQuery(manager, userId)
          .andWhere('notification.readAt IS NULL')
          .getCount();
        return {
          uncategorizedTransactionCount,
          unreadNotificationCount,
          computedAt: rows[0].computedAt.toISOString(),
        };
      },
    );
  }

  private inboxQuery(manager: EntityManager, userId: string) {
    return manager
      .getRepository(NotificationEntity)
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId })
      .andWhere('notification.status = :status', { status: 'active' })
      .andWhere('notification.type IN (:...types)', {
        types: ['transactions.new_synced', 'bank_link.needs_attention'],
      })
      .andWhere(`notification.createdAt >= now() - interval '90 days'`);
  }

  async getInbox(
    userId: string,
    query: NotificationInboxQuery,
  ): Promise<NotificationInboxPage> {
    const builder = this.inboxQuery(this.notificationRepository.manager, userId)
      .addSelect('notification."createdAt"::text', 'cursorCreatedAt')
      .orderBy('notification.createdAt', 'DESC')
      .addOrderBy('notification.id', 'DESC')
      .take(query.pageSize + 1);
    if (query.cursor) {
      let cursor: unknown;
      try {
        cursor = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8'),
        );
      } catch {
        throw new BadRequestException('Invalid inbox cursor');
      }
      if (
        !Array.isArray(cursor) ||
        cursor.length !== 2 ||
        typeof cursor[0] !== 'string' ||
        typeof cursor[1] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:\d{2})?|Z)?$/.test(
          cursor[0],
        ) ||
        !Number.isFinite(Date.parse(cursor[0])) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          cursor[1],
        )
      )
        throw new BadRequestException('Invalid inbox cursor');
      builder.andWhere(
        '(notification."createdAt", notification.id) < (:createdAt, :id)',
        { createdAt: cursor[0], id: cursor[1] },
      );
    }
    const result = await builder.getRawAndEntities<{
      cursorCreatedAt: string;
    }>();
    const hasMore = result.entities.length > query.pageSize;
    const entities = result.entities.slice(0, query.pageSize);
    const items: NotificationInboxItem[] = entities.map((notification) => {
      const rendered = this.renderPushPayload(notification);
      return {
        id: notification.id,
        type: notification.type as NotificationInboxItem['type'],
        title: rendered.title,
        body: rendered.body,
        url: rendered.url,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      };
    });
    const last = entities.at(-1);
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify([
              result.raw[entities.length - 1].cursorCreatedAt,
              last.id,
            ]),
          ).toString('base64url')
        : null;
    return { items, nextCursor, hasMore };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ readAt: () => 'COALESCE("readAt", now())' })
      .where('id = :id AND "userId" = :userId AND type <> :test', {
        id,
        userId,
        test: 'system.test',
      })
      .execute();
    if (!result.affected) throw new NotFoundException('Notification not found');
  }

  async archive(userId: string, id: string): Promise<void> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({
        status: 'archived',
        archivedAt: () => 'COALESCE("archivedAt", now())',
      })
      .where('id = :id AND "userId" = :userId AND type <> :test', {
        id,
        userId,
        test: 'system.test',
      })
      .execute();
    if (!result.affected) throw new NotFoundException('Notification not found');
  }

  async archiveAll(userId: string): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({
        status: 'archived',
        archivedAt: () => 'COALESCE("archivedAt", now())',
      })
      .where('"userId" = :userId AND type <> :test AND status <> :archived', {
        userId,
        test: 'system.test',
        archived: 'archived',
      })
      .execute();
  }

  async registerPushSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
    refreshToken?: string,
  ): Promise<PushSubscriptionResponse> {
    if (!refreshToken)
      throw new UnauthorizedException('A browser session is required');

    return this.pushSubscriptionRepository.manager.transaction(
      async (manager) => {
        const session = await this.browserSessions.resolveForRefreshToken(
          manager,
          refreshToken,
          userId,
        );
        await this.userService.enableDefaultNotificationsIfUnset(userId);
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

        const enrollmentChanged =
          !entity.enrollmentId ||
          entity.sessionId !== session.id ||
          entity.revokedAt !== null ||
          entity.rebindRequired ||
          entity.p256dh !== dto.keys.p256dh ||
          entity.auth !== dto.keys.auth;
        if (enrollmentChanged && entity.id) {
          await deliveryRepo.update(
            {
              subscriptionId: entity.id,
              status: In(['pending', 'processing']),
            },
            {
              status: 'failed',
              processingStartedAt: null,
              claimToken: null,
              lastError: 'Push enrollment changed',
            },
          );
        }
        entity.sessionId = session.id;
        entity.enrollmentId = enrollmentChanged
          ? randomUUID()
          : entity.enrollmentId;
        entity.rebindRequired = false;
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
          where: { userId, endpoint },
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
        subscription.rebindRequired = false;
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
              AND ("revokedAt" IS NULL OR "rebindRequired" = true)
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
          where: [
            { userId, revokedAt: IsNull() },
            { userId, rebindRequired: true },
          ],
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
          subscription.rebindRequired = false;
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
                OR subscription."rebindRequired" = true
                OR subscription."sessionId" IS NULL
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
                    .andWhere(
                      '(delivery.processingStartedAt IS NULL OR delivery.processingStartedAt <= :staleBefore)',
                      {
                        staleBefore,
                      },
                    );
                }),
              );
          }),
        )
        .andWhere('subscription.revokedAt IS NULL')
        .andWhere('subscription.rebindRequired = false')
        .andWhere('subscription.sessionId IS NOT NULL')
        .andWhere('notification.userId = subscription.userId')
        .orderBy('delivery.createdAt', 'ASC')
        .setLock('pessimistic_write', undefined, ['delivery', 'subscription'])
        .setOnLocked('skip_locked')
        .take(limit)
        .getMany();

      if (deliveries.length === 0) {
        return [];
      }

      for (const delivery of deliveries) {
        if (delivery.status === 'processing')
          this.logPushOutcome(delivery, 'stale_claim_reclaimed', Date.now());
      }
      deliveries.forEach((delivery) => {
        delivery.status = 'processing';
        delivery.processingStartedAt = now;
        delivery.attemptCount += 1;
        delivery.claimToken = randomUUID();
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
    if (!delivery.claimToken) {
      this.logPushOutcome(delivery, 'stale_claim_ignored', Date.now());
      return;
    }
    const claimToken = delivery.claimToken;
    const startedAt = Date.now();
    try {
      await this.pushDeliveryRepository.manager.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout = '6s'");
        await manager.query("SET LOCAL statement_timeout = '8s'");
        const sessionId = delivery.subscription.sessionId;
        if (!sessionId)
          throw new UnauthorizedException('Push session unavailable');
        await this.browserSessions.lockActiveSession(
          manager,
          sessionId,
          delivery.subscription.userId,
        );
        const lockedRows: Array<{ id: string; ownersMatch: boolean }> =
          await manager.query(
            `
          SELECT delivery.id, (notification."userId" = subscription."userId") AS "ownersMatch"
          FROM notification_push_delivery_entity delivery
          JOIN push_subscription_entity subscription ON subscription.id = delivery."subscriptionId"
          JOIN notification_entity notification ON notification.id = delivery."notificationId"
          WHERE delivery.id = $1 AND delivery.status = 'processing' AND delivery."claimToken" = $2
          FOR UPDATE OF subscription, delivery
        `,
            [delivery.id, claimToken],
          );
        const deliveryRepo = manager.getRepository(
          NotificationPushDeliveryEntity,
        );
        const subscriptionRepo = manager.getRepository(PushSubscriptionEntity);
        if (!lockedRows[0]) {
          this.logPushOutcome(delivery, 'stale_claim_ignored', startedAt);
          return;
        }
        const current = await deliveryRepo.findOne({
          where: { id: delivery.id, status: 'processing', claimToken },
          relations: { notification: true, subscription: true },
        });
        if (!current) {
          this.logPushOutcome(delivery, 'stale_claim_ignored', startedAt);
          return;
        }
        if (
          !lockedRows[0].ownersMatch ||
          current.subscription.revokedAt !== null ||
          current.subscription.rebindRequired ||
          current.subscription.sessionId !== sessionId ||
          current.notification.userId !== current.subscription.userId
        ) {
          current.status = 'failed';
          current.processingStartedAt = null;
          current.claimToken = null;
          current.lastError = 'Push delivery is no longer owner-eligible';
          await deliveryRepo.save(current);
          this.logPushOutcome(current, 'owner_ineligible', startedAt);
          return;
        }
        const lifetime =
          current.notification.type === 'transactions.new_synced'
            ? 86400
            : current.notification.type === 'bank_link.needs_attention'
              ? 3600
              : 300;
        const ttl = Math.floor(
          lifetime -
            (Date.now() - current.notification.createdAt.getTime()) / 1000,
        );
        let relevant = ttl > 0 && current.notification.status !== 'archived';
        if (
          relevant &&
          current.notification.type === 'bank_link.needs_attention'
        ) {
          const payload = current.notification.payload as {
            bankLinkId: string;
          };
          const links: Array<{ id: string }> = await manager.query(
            `SELECT id FROM bank_link_entity WHERE id = $1 AND "userId" = $2 AND status IN ('ERROR', 'PENDING_REAUTH')`,
            [payload.bankLinkId, current.notification.userId],
          );
          relevant = links.length > 0;
        }
        if (!relevant) {
          current.status = 'skipped';
          current.processingStartedAt = null;
          current.claimToken = null;
          current.lastError = 'Push notification expired or resolved';
          await deliveryRepo.save(current);
          this.logPushOutcome(current, 'expired_or_resolved', startedAt);
          return;
        }
        try {
          const timestamps: Array<{ computedAt: Date }> = await manager.query(
            'SELECT clock_timestamp() AS "computedAt"',
          );
          const badgeCount = await this.transactionQueries.countUncategorized(
            current.notification.userId,
            manager,
          );
          await this.webPushAdapter.send(
            current.subscription,
            {
              ...this.renderPushPayload(current.notification),
              version: 2,
              enrollmentId: current.subscription.enrollmentId,
              badgeCount,
              badgeAsOf: timestamps[0].computedAt.toISOString(),
            },
            ttl,
          );
          current.status = 'sent';
          current.sentAt = new Date();
          current.lastError = null;
          current.processingStartedAt = null;
          current.claimToken = null;
          await deliveryRepo.save(current);
        } catch (error) {
          await this.handlePushDeliveryFailure(
            current,
            error,
            subscriptionRepo,
            deliveryRepo,
          );
        }
        this.logPushOutcome(current, current.status, startedAt);
      });
    } catch (error) {
      await this.pushDeliveryRepository.manager.transaction(async (manager) => {
        await manager.query("SET LOCAL lock_timeout = '6s'");
        const result = await manager
          .getRepository(NotificationPushDeliveryEntity)
          .update(
            {
              id: delivery.id,
              status: 'processing',
              claimToken,
            },
            {
              status:
                error instanceof UnauthorizedException ||
                delivery.attemptCount >= MAX_PUSH_DELIVERY_ATTEMPTS
                  ? 'failed'
                  : 'pending',
              availableAt: new Date(Date.now() + PUSH_RETRY_DELAY_MS),
              processingStartedAt: null,
              claimToken: null,
              lastError:
                error instanceof UnauthorizedException
                  ? 'Push session unavailable'
                  : 'Push delivery interrupted or lock contention',
            },
          );
        this.logPushOutcome(
          delivery,
          !result?.affected
            ? 'stale_claim_ignored'
            : error instanceof UnauthorizedException
              ? 'session_ineligible'
              : 'interrupted_or_contended',
          startedAt,
        );
      });
    }
  }

  private logPushOutcome(
    delivery: NotificationPushDeliveryEntity,
    outcome: string,
    startedAt: number,
  ): void {
    this.logger.log(
      {
        deliveryId: delivery.id,
        notificationId: delivery.notificationId,
        outcome,
        durationMs: Math.max(0, Date.now() - startedAt),
        attempt: delivery.attemptCount,
        backlogAgeMs: Math.max(0, startedAt - delivery.createdAt.getTime()),
      },
      'Push delivery outcome',
    );
  }

  async cleanupOldNotificationRecords(
    now = new Date(),
  ): Promise<{ deliveries: number; notifications: number }> {
    const deliveryCutoff = new Date(
      now.getTime() - NOTIFICATION_PUSH_DELIVERY_RETENTION_MS,
    );
    const terminalStatuses = ['sent', 'failed', 'skipped'] as const;
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
    const message =
      statusCode === null
        ? 'Push transport failed'
        : `Push provider status ${statusCode}`;
    delivery.processingStartedAt = null;
    delivery.claimToken = null;

    if (statusCode === 404 || statusCode === 410) {
      delivery.subscription.revokedAt = new Date();
      delivery.subscription.rebindRequired = false;
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
          where: {
            userId: input.userId,
            revokedAt: IsNull(),
            rebindRequired: false,
            sessionId: Not(IsNull()),
          },
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
              delivery.claimToken = null;
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
