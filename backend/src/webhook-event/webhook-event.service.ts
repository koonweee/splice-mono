import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { IsNull, MoreThan, Raw, Repository } from 'typeorm';
import { WebhookEvent, WebhookEventStatus } from '../types/WebhookEvent';
import { WebhookEventEntity } from './webhook-event.entity';

const WEBHOOK_PROCESSING_LEASE_MS = 15 * 60 * 1000;
const WEBHOOK_ADVISORY_LOCK_NAMESPACE = 1777503003;
const WEBHOOK_LOCK_POOL_MAX = 4;
const WEBHOOK_LOCK_POOL_ACQUIRE_TIMEOUT_MS = 250;

export type WebhookProcessingResult =
  | { processed: true }
  | { processed: false; reason: string };

@Injectable()
export class WebhookEventService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookEventService.name);
  private readonly lockPool: Pool;

  constructor(
    @InjectRepository(WebhookEventEntity)
    private repository: Repository<WebhookEventEntity>,
  ) {
    this.lockPool = new Pool(this.webhookLockPoolConfig());
    this.lockPool.on('error', (error: Error & { code?: string }) => {
      // Pool-level errors are emitted for idle clients. Registering a listener
      // prevents Node from treating them as uncaught; omit message/connection
      // details so credentials or network topology cannot reach logs.
      this.logger.error(
        { errorName: error.name, errorCode: error.code },
        'Idle webhook lock connection failed',
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.lockPool.end();
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
    context?: Record<string, any> | null,
  ): Promise<WebhookEvent> {
    this.logger.log(
      { webhookId, providerName, userId },
      'Creating pending webhook event',
    );
    const entity = WebhookEventEntity.fromDto(
      {
        webhookId,
        providerName,
        status: WebhookEventStatus.PENDING,
        expiresAt: expiresAt ?? null,
        context: context ?? null,
      },
      userId,
    );
    const savedEntity = await this.repository.save(entity);
    this.logger.log(
      { id: savedEntity.id },
      'Pending WebhookEvent created successfully',
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
    this.logger.log({ webhookId }, 'Finding pending webhook event');
    const now = new Date();
    const entity = await this.repository.findOne({
      where: this.activePendingWhere(webhookId, now),
    });

    if (!entity || this.isExpired(entity, now)) {
      this.logger.warn({ webhookId }, 'Pending WebhookEvent not found');
      return null;
    }

    this.logger.log({ webhookId }, 'Pending WebhookEvent found');
    return entity.toObject();
  }

  /**
   * Mark a pending webhook event as completed with the webhook payload
   */
  async markCompleted(
    webhookId: string,
    webhookContent: Record<string, any>,
  ): Promise<WebhookEvent | null> {
    this.logger.log({ webhookId }, 'Marking webhook event as completed');
    const savedEntity = await this.mutateActivePending(
      webhookId,
      (entity, now) => {
        entity.status = WebhookEventStatus.COMPLETED;
        entity.webhookContent = webhookContent;
        entity.completedAt = now;
      },
    );

    if (!savedEntity) {
      this.logger.warn(
        { webhookId },
        'Pending WebhookEvent not found for completion',
      );
      return null;
    }
    this.logger.log({ webhookId }, 'WebhookEvent marked as completed');
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
    this.logger.log({ webhookId }, 'Marking webhook event as failed');
    const savedEntity = await this.mutateActivePending(
      webhookId,
      (entity, now) => {
        entity.status = WebhookEventStatus.FAILED;
        entity.errorMessage = errorMessage;
        entity.webhookContent = webhookContent ?? null;
        entity.completedAt = now;
      },
    );

    if (!savedEntity) {
      this.logger.warn(
        { webhookId },
        'Pending WebhookEvent not found for failure',
      );
      return null;
    }
    this.logger.log({ webhookId }, 'WebhookEvent marked as failed');
    return savedEntity.toObject();
  }

  /**
   * Process an update/status webhook while holding a session advisory lock.
   *
   * The lock is scoped by provider, owner, and logical webhook identity and is
   * held on a small, dedicated Postgres pool until all downstream work and the
   * exact claim transition have finished. The application pool remains fully
   * available to the callback. A concurrent delivery therefore receives a
   * retriable 503 instead of being falsely acknowledged. Completed deliveries
   * inside the dedupe window remain successful no-op duplicates.
   */
  async processWebhookOnce(
    baseWebhookId: string,
    providerName: string,
    userId: string,
    webhookContent: Record<string, any>,
    process: () => Promise<void>,
    dedupeWindowMs: number = 5 * 60 * 1000,
  ): Promise<WebhookProcessingResult> {
    const lockClient = await this.acquireLockClient();
    let lockAcquired = false;

    try {
      const lockResult = await lockClient.query(
        `SELECT pg_try_advisory_lock(
          hashtextextended(
            concat($1::text, chr(31), $2::text, chr(31), $3::text),
            $4::bigint
          )
        ) AS acquired`,
        [providerName, userId, baseWebhookId, WEBHOOK_ADVISORY_LOCK_NAMESPACE],
      );
      const lockRows = lockResult.rows as Array<{ acquired: boolean }>;
      lockAcquired = lockRows[0]?.acquired === true;

      if (!lockAcquired) {
        throw new ServiceUnavailableException(
          'Webhook is already being processed; retry later',
        );
      }

      const acquisition = await this.repository.manager.transaction<
        { duplicateReason: string } | { claimId: string }
      >(async (manager) => {
        const repository = manager.getRepository(WebhookEventEntity);
        const now = new Date();
        const recentCompleted = await repository.findOne({
          where: {
            webhookId: this.literalWebhookPrefix(baseWebhookId),
            providerName,
            userId,
            status: WebhookEventStatus.COMPLETED,
            completedAt: MoreThan(new Date(now.getTime() - dedupeWindowMs)),
          },
          order: { completedAt: 'DESC' },
        });

        if (recentCompleted) {
          return {
            duplicateReason: `Duplicate webhook processed at ${recentCompleted.completedAt?.toISOString()}`,
          };
        }

        // If this session owns the advisory lock, a pending claim from an
        // earlier session has been abandoned (Postgres releases session locks
        // when their connection dies). Retire that exact row before retrying.
        const abandonedClaim = await repository.findOne({
          where: {
            webhookId: this.literalWebhookPrefix(baseWebhookId),
            providerName,
            userId,
            status: WebhookEventStatus.PENDING,
          },
          order: { createdAt: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (abandonedClaim) {
          abandonedClaim.status = WebhookEventStatus.FAILED;
          abandonedClaim.completedAt = null;
          abandonedClaim.expiresAt = null;
          abandonedClaim.errorMessage =
            'Abandoned webhook claim recovered by a later delivery';
          await repository.save(abandonedClaim);
        }

        const compatibilityFenceAt = new Date(
          now.getTime() + Math.max(dedupeWindowMs, WEBHOOK_PROCESSING_LEASE_MS),
        );
        const entity = WebhookEventEntity.fromDto(
          {
            webhookId: `${baseWebhookId}:${Date.now()}:${randomUUID()}`,
            providerName,
            status: WebhookEventStatus.PENDING,
            webhookContent,
            // Session ownership, not a wall-clock lease, defines liveness.
            // A null expiry also prevents cleanup from deleting an active
            // claim when downstream work legitimately runs past 15 minutes.
            expiresAt: null,
          },
          userId,
        );
        // This future marker retains the strongest compatibility available
        // with old workers that dedupe only on completedAt. New workers are
        // fenced for the full callback duration by the session lock.
        entity.completedAt = compatibilityFenceAt;
        const saved = await repository.save(entity);
        return { claimId: saved.id };
      });

      if ('duplicateReason' in acquisition) {
        this.logger.log(
          { baseWebhookId, reason: acquisition.duplicateReason },
          'Skipping completed duplicate webhook',
        );
        return { processed: false, reason: acquisition.duplicateReason };
      }

      try {
        await process();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const failedClaim = await this.markClaimFailed(
          acquisition.claimId,
          errorMessage,
          webhookContent,
        );
        if (!failedClaim) {
          this.logger.error(
            { claimId: acquisition.claimId },
            'Webhook claim was no longer pending at failure',
          );
        }
        throw error;
      }

      const completed = await this.markClaimCompleted(
        acquisition.claimId,
        webhookContent,
      );
      if (!completed) {
        throw new Error('Webhook claim was no longer pending at completion');
      }
      return { processed: true };
    } finally {
      if (lockAcquired) {
        try {
          await lockClient.query(
            `SELECT pg_advisory_unlock(
              hashtextextended(
                concat($1::text, chr(31), $2::text, chr(31), $3::text),
                $4::bigint
              )
            )`,
            [
              providerName,
              userId,
              baseWebhookId,
              WEBHOOK_ADVISORY_LOCK_NAMESPACE,
            ],
          );
        } catch (error) {
          this.logger.error(
            {
              baseWebhookId,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to explicitly release webhook advisory lock',
          );
        }
      }
      lockClient.release();
    }
  }

  async markClaimCompleted(
    claimId: string,
    webhookContent: Record<string, any>,
  ): Promise<WebhookEvent | null> {
    const saved = await this.mutatePendingClaim(claimId, (entity, now) => {
      entity.status = WebhookEventStatus.COMPLETED;
      entity.webhookContent = webhookContent;
      entity.completedAt = now;
      entity.expiresAt = null;
      entity.errorMessage = null;
    });
    return saved?.toObject() ?? null;
  }

  async markClaimFailed(
    claimId: string,
    errorMessage: string,
    webhookContent: Record<string, any>,
  ): Promise<WebhookEvent | null> {
    const saved = await this.mutatePendingClaim(claimId, (entity) => {
      entity.status = WebhookEventStatus.FAILED;
      entity.webhookContent = webhookContent;
      entity.completedAt = null;
      entity.expiresAt = null;
      entity.errorMessage = errorMessage;
    });
    return saved?.toObject() ?? null;
  }

  private activePendingWhere(webhookId: string, now: Date) {
    const base = { webhookId, status: WebhookEventStatus.PENDING };
    return [
      { ...base, expiresAt: IsNull() },
      { ...base, expiresAt: MoreThan(now) },
    ];
  }

  private isExpired(entity: WebhookEventEntity, now: Date): boolean {
    return entity.expiresAt !== null && entity.expiresAt <= now;
  }

  private async mutateActivePending(
    webhookId: string,
    mutate: (entity: WebhookEventEntity, now: Date) => void,
  ): Promise<WebhookEventEntity | null> {
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(WebhookEventEntity);
      const now = new Date();
      const entity = await repository.findOne({
        where: this.activePendingWhere(webhookId, now),
        lock: { mode: 'pessimistic_write' },
      });

      if (!entity || this.isExpired(entity, now)) {
        return null;
      }

      mutate(entity, now);
      return repository.save(entity);
    });
  }

  private async mutatePendingClaim(
    claimId: string,
    mutate: (entity: WebhookEventEntity, now: Date) => void,
  ): Promise<WebhookEventEntity | null> {
    return this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(WebhookEventEntity);
      const entity = await repository.findOne({
        where: { id: claimId, status: WebhookEventStatus.PENDING },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entity) {
        return null;
      }
      mutate(entity, new Date());
      return repository.save(entity);
    });
  }

  private literalWebhookPrefix(baseWebhookId: string) {
    const webhookPrefix = `${baseWebhookId}:`;
    return Raw(
      (alias) => `left(${alias}, char_length(:webhookPrefix)) = :webhookPrefix`,
      { webhookPrefix },
    );
  }

  private async acquireLockClient(): Promise<PoolClient> {
    try {
      return await this.lockPool.connect();
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Webhook lock capacity unavailable',
      );
      throw new ServiceUnavailableException(
        'Webhook processing capacity is busy; retry later',
      );
    }
  }

  private webhookLockPoolConfig(): PoolConfig {
    const options = this.repository.manager.connection.options;
    if (options.type !== 'postgres') {
      throw new Error('Webhook advisory locks require PostgreSQL');
    }

    const common: PoolConfig = {
      max: WEBHOOK_LOCK_POOL_MAX,
      connectionTimeoutMillis: WEBHOOK_LOCK_POOL_ACQUIRE_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true,
      application_name: 'splice-webhook-fence',
      ssl: options.ssl as PoolConfig['ssl'],
    };
    if (options.url) {
      return { ...common, connectionString: options.url };
    }
    return {
      ...common,
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
    };
  }
}
