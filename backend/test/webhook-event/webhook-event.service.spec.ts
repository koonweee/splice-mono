import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookEventEntity } from '../../src/webhook-event/webhook-event.entity';
import { WebhookEventService } from '../../src/webhook-event/webhook-event.service';
import { WebhookEventStatus } from '../../src/types/WebhookEvent';

describe('WebhookEventService', () => {
  let service: WebhookEventService;
  let configuredPoolErrorListenerCount: number;

  const mockLockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockLockPool = {
    connect: jest.fn(),
    end: jest.fn(),
  };

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    manager: {
      transaction: jest.fn(),
      connection: {
        options: { type: 'postgres' },
      },
    },
  };

  const mockUserId = 'user-uuid-123';

  beforeEach(async () => {
    mockLockClient.query.mockResolvedValue({ rows: [{ acquired: true }] });
    mockLockPool.connect.mockResolvedValue(mockLockClient);
    mockRepository.manager.transaction.mockImplementation(async (callback) =>
      callback({
        query: jest.fn().mockResolvedValue([]),
        getRepository: () => mockRepository,
      }),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventService,
        {
          provide: getRepositoryToken(WebhookEventEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<WebhookEventService>(WebhookEventService);
    const configuredPool = (
      service as unknown as {
        lockPool: {
          listenerCount: (event: string) => number;
          end: () => Promise<void>;
        };
      }
    ).lockPool;
    configuredPoolErrorListenerCount = configuredPool.listenerCount('error');
    await configuredPool.end();
    Object.defineProperty(service, 'lockPool', { value: mockLockPool });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('closes the dedicated webhook lock pool on module shutdown', async () => {
    await service.onModuleDestroy();

    expect(mockLockPool.end).toHaveBeenCalledTimes(1);
  });

  it('handles idle lock-pool errors instead of leaving them uncaught', () => {
    expect(configuredPoolErrorListenerCount).toBe(1);
  });

  describe('createPending', () => {
    it('should create a pending webhook event', async () => {
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'generated-uuid-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
      mockEntity.context = null;
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.createPending(
        'wh_plaid_12345',
        'plaid',
        mockUserId,
      );

      expect(result).toHaveProperty('id');
      expect(result.webhookId).toBe('wh_plaid_12345');
      expect(result.status).toBe(WebhookEventStatus.PENDING);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should create pending webhook event with expiration date', async () => {
      const expiresAt = new Date(Date.now() + 3600000);
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'generated-uuid-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
      mockEntity.expiresAt = expiresAt;
      mockEntity.context = null;
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.createPending(
        'wh_plaid_12345',
        'plaid',
        mockUserId,
        expiresAt,
      );

      expect(result.expiresAt).toEqual(expiresAt);
    });
  });

  describe('findPendingByWebhookId', () => {
    it('should return a pending webhook event when found', async () => {
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
      mockEntity.context = null;
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findPendingByWebhookId('wh_plaid_12345');

      expect(result).toBeDefined();
      expect(result?.webhookId).toBe('wh_plaid_12345');
      expect(result?.status).toBe(WebhookEventStatus.PENDING);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: expect.arrayContaining([
          expect.objectContaining({
            webhookId: 'wh_plaid_12345',
            status: WebhookEventStatus.PENDING,
          }),
        ]),
      });
    });

    it('should reject an expired pending webhook event defensively', async () => {
      const expiredEntity = new WebhookEventEntity();
      expiredEntity.id = 'expired-webhook-event';
      expiredEntity.webhookId = 'wh_plaid_expired';
      expiredEntity.providerName = 'plaid';
      expiredEntity.status = WebhookEventStatus.PENDING;
      expiredEntity.userId = mockUserId;
      expiredEntity.expiresAt = new Date(Date.now() - 1);

      mockRepository.findOne.mockResolvedValue(expiredEntity);

      await expect(
        service.findPendingByWebhookId('wh_plaid_expired'),
      ).resolves.toBeNull();
    });

    it('should return null when pending webhook event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findPendingByWebhookId(
        'wh_plaid_nonexistent',
      );

      expect(result).toBeNull();
    });
  });

  describe('markCompleted', () => {
    it('should mark a pending webhook event as completed', async () => {
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
      mockEntity.context = null;
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      const webhookContent = { public_token: 'public-sandbox-12345' };

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) => {
        entity.status = WebhookEventStatus.COMPLETED;
        entity.webhookContent = webhookContent;
        entity.completedAt = new Date();
        return Promise.resolve(entity);
      });

      const result = await service.markCompleted(
        'wh_plaid_12345',
        webhookContent,
      );

      expect(result).toBeDefined();
      expect(result?.status).toBe(WebhookEventStatus.COMPLETED);
      expect(result?.webhookContent).toEqual(webhookContent);
      expect(result?.completedAt).toBeDefined();
      expect(mockRepository.manager.transaction).toHaveBeenCalledTimes(1);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: expect.arrayContaining([
          expect.objectContaining({
            webhookId: 'wh_plaid_12345',
            status: WebhookEventStatus.PENDING,
          }),
        ]),
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('should return null when pending webhook event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.markCompleted('wh_plaid_nonexistent', {});

      expect(result).toBeNull();
    });

    it('should not complete an expired pending webhook event', async () => {
      const expiredEntity = new WebhookEventEntity();
      expiredEntity.id = 'expired-webhook-event';
      expiredEntity.webhookId = 'wh_plaid_expired';
      expiredEntity.status = WebhookEventStatus.PENDING;
      expiredEntity.expiresAt = new Date(Date.now() - 1);

      mockRepository.findOne.mockResolvedValue(expiredEntity);

      await expect(
        service.markCompleted('wh_plaid_expired', { result: 'late' }),
      ).resolves.toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('markFailed', () => {
    it('should mark a pending webhook event as failed', async () => {
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
      mockEntity.context = null;
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      const errorMessage = 'Invalid public token';

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) => {
        entity.status = WebhookEventStatus.FAILED;
        entity.errorMessage = errorMessage;
        entity.completedAt = new Date();
        return Promise.resolve(entity);
      });

      const result = await service.markFailed('wh_plaid_12345', errorMessage);

      expect(result).toBeDefined();
      expect(result?.status).toBe(WebhookEventStatus.FAILED);
      expect(result?.errorMessage).toBe(errorMessage);
      expect(result?.completedAt).toBeDefined();
    });

    it('should mark failed with webhook content', async () => {
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
      mockEntity.context = null;
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      const errorMessage = 'Invalid public token';
      const webhookContent = { error: 'invalid_token' };

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) => {
        entity.status = WebhookEventStatus.FAILED;
        entity.errorMessage = errorMessage;
        entity.webhookContent = webhookContent;
        entity.completedAt = new Date();
        return Promise.resolve(entity);
      });

      const result = await service.markFailed(
        'wh_plaid_12345',
        errorMessage,
        webhookContent,
      );

      expect(result?.webhookContent).toEqual(webhookContent);
    });

    it('should return null when pending webhook event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.markFailed('wh_plaid_nonexistent', 'error');

      expect(result).toBeNull();
    });

    it('should not mutate an expired pending webhook event', async () => {
      const expiredEntity = new WebhookEventEntity();
      expiredEntity.id = 'expired-webhook-event';
      expiredEntity.webhookId = 'wh_plaid_expired';
      expiredEntity.status = WebhookEventStatus.PENDING;
      expiredEntity.expiresAt = new Date(Date.now() - 1);

      mockRepository.findOne.mockResolvedValue(expiredEntity);

      await expect(
        service.markFailed('wh_plaid_expired', 'late failure'),
      ).resolves.toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processWebhookOnce', () => {
    const baseWebhookId = 'plaid:TRANSACTIONS:DEFAULT_UPDATE:item_abc123';
    const webhookContent = {
      webhook_type: 'TRANSACTIONS',
      item_id: 'item_abc123',
    };

    it('holds a scoped session lock through exact completion', async () => {
      const claim = new WebhookEventEntity();
      claim.id = 'claim-id';
      claim.status = WebhookEventStatus.PENDING;
      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(claim);
      mockRepository.save.mockImplementation((entity) => {
        if (!entity.id) entity.id = 'claim-id';
        return Promise.resolve(entity);
      });
      const process = jest.fn().mockResolvedValue(undefined);

      const result = await service.processWebhookOnce(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
        process,
      );

      expect(result).toEqual({ processed: true });
      expect(process).toHaveBeenCalledTimes(1);
      expect(mockLockPool.connect).toHaveBeenCalledTimes(1);
      expect(mockLockClient.query.mock.calls[0][0]).toContain(
        'pg_try_advisory_lock',
      );
      expect(mockLockClient.query.mock.calls.at(-1)?.[0]).toContain(
        'pg_advisory_unlock',
      );
      expect(mockLockClient.release).toHaveBeenCalledTimes(1);

      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.webhookId).toMatch(
        new RegExp(`^${baseWebhookId}:\\d+:`),
      );
      expect(savedEntity.expiresAt).toBeNull();
      expect(claim.status).toBe(WebhookEventStatus.COMPLETED);
      expect(claim.completedAt).toBeInstanceOf(Date);
    });

    it('uses a literal prefix scoped by provider and owner, even with SQL wildcard characters', async () => {
      const wildcardBase = 'plaid:ITEM:ERR%R:item_under_score';
      const recentEntity = new WebhookEventEntity();
      recentEntity.status = WebhookEventStatus.COMPLETED;
      recentEntity.completedAt = new Date();
      mockRepository.findOne.mockResolvedValueOnce(recentEntity);

      await service.processWebhookOnce(
        wildcardBase,
        'plaid',
        mockUserId,
        webhookContent,
        jest.fn(),
      );

      const where = mockRepository.findOne.mock.calls[0][0].where as Record<
        string,
        any
      >;
      expect(where.providerName).toBe('plaid');
      expect(where.userId).toBe(mockUserId);
      expect(where.webhookId._type).toBe('raw');
      expect(where.webhookId._objectLiteralParameters).toEqual({
        webhookPrefix: `${wildcardBase}:`,
      });
      expect(where.webhookId._getSql('webhookId')).toContain('left(');
      expect(where.webhookId._getSql('webhookId')).not.toContain('LIKE');
    });

    it('returns a retriable 503 without running work when the session lock is held', async () => {
      mockLockClient.query.mockResolvedValueOnce({
        rows: [{ acquired: false }],
      });
      const process = jest.fn();

      await expect(
        service.processWebhookOnce(
          baseWebhookId,
          'plaid',
          mockUserId,
          webhookContent,
          process,
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(process).not.toHaveBeenCalled();
      expect(mockLockClient.release).toHaveBeenCalledTimes(1);
      expect(mockLockClient.query).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a completed duplicate without invoking downstream work', async () => {
      const completed = new WebhookEventEntity();
      completed.status = WebhookEventStatus.COMPLETED;
      completed.completedAt = new Date();
      mockRepository.findOne.mockResolvedValueOnce(completed);
      const process = jest.fn();

      const result = await service.processWebhookOnce(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
        process,
      );

      expect(result).toEqual({
        processed: false,
        reason: expect.stringContaining('Duplicate webhook'),
      });
      expect(process).not.toHaveBeenCalled();
      expect(mockLockClient.query.mock.calls.at(-1)?.[0]).toContain(
        'pg_advisory_unlock',
      );
    });

    it('keeps a second worker fenced while downstream work exceeds the old lease horizon', async () => {
      const claim = new WebhookEventEntity();
      claim.id = 'claim-id';
      claim.status = WebhookEventStatus.PENDING;
      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(claim);
      mockRepository.save.mockImplementation(async (entity) => {
        if (!entity.id) entity.id = 'claim-id';
        return entity;
      });
      const makeClient = (acquired: boolean) => ({
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ acquired }] })
          .mockResolvedValue({ rows: [{ pg_advisory_unlock: true }] }),
        release: jest.fn(),
      });
      const firstClient = makeClient(true);
      const secondClient = makeClient(false);
      mockLockPool.connect
        .mockResolvedValueOnce(firstClient)
        .mockResolvedValueOnce(secondClient);

      let releaseWork!: () => void;
      let signalStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        signalStarted = resolve;
      });
      const workGate = new Promise<void>((resolve) => {
        releaseWork = resolve;
      });
      const first = service.processWebhookOnce(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
        async () => {
          signalStarted();
          await workGate;
        },
      );
      await started;

      const activeClaim = mockRepository.save.mock.calls[0][0];
      expect(activeClaim.expiresAt).toBeNull();
      await expect(
        service.processWebhookOnce(
          baseWebhookId,
          'plaid',
          mockUserId,
          webhookContent,
          jest.fn(),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(firstClient.query).toHaveBeenCalledTimes(1);

      releaseWork();
      await expect(first).resolves.toEqual({ processed: true });
      expect(firstClient.query).toHaveBeenCalledTimes(2);
    });

    it('caps dedicated lock sessions without consuming ordinary repository capacity', async () => {
      const claims = new Map<string, WebhookEventEntity>();
      let claimSequence = 0;
      mockRepository.findOne.mockImplementation(async (options) => {
        const where = options.where as Record<string, any>;
        return typeof where.id === 'string'
          ? (claims.get(where.id) ?? null)
          : null;
      });
      mockRepository.save.mockImplementation(async (entity) => {
        if (!entity.id) entity.id = `capacity-claim-${++claimSequence}`;
        claims.set(entity.id, entity);
        return entity;
      });

      const clients = Array.from({ length: 4 }, () => ({
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ acquired: true }] })
          .mockResolvedValue({ rows: [{ pg_advisory_unlock: true }] }),
        release: jest.fn(),
      }));
      mockLockPool.connect.mockReset();
      for (const client of clients) {
        mockLockPool.connect.mockResolvedValueOnce(client);
      }
      mockLockPool.connect.mockRejectedValueOnce(
        new Error('timeout exceeded when trying to connect'),
      );

      let startedCount = 0;
      let signalAllStarted!: () => void;
      const allStarted = new Promise<void>((resolve) => {
        signalAllStarted = resolve;
      });
      let releaseAll!: () => void;
      const workGate = new Promise<void>((resolve) => {
        releaseAll = resolve;
      });
      const active = clients.map((_client, index) =>
        service.processWebhookOnce(
          `${baseWebhookId}:capacity-${index}`,
          'plaid',
          mockUserId,
          webhookContent,
          async () => {
            startedCount += 1;
            if (startedCount === clients.length) signalAllStarted();
            await workGate;
          },
        ),
      );
      await allStarted;

      await expect(
        mockRepository.manager.transaction(async () => 'main-pool-available'),
      ).resolves.toBe('main-pool-available');
      await expect(
        service.processWebhookOnce(
          `${baseWebhookId}:capacity-overflow`,
          'plaid',
          mockUserId,
          webhookContent,
          jest.fn(),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      releaseAll();
      await expect(Promise.all(active)).resolves.toEqual(
        Array.from({ length: 4 }, () => ({ processed: true })),
      );
      clients.forEach((client) =>
        expect(client.release).toHaveBeenCalledTimes(1),
      );
    });

    it('marks the exact claim failed and releases the lock when downstream work fails', async () => {
      const claim = new WebhookEventEntity();
      claim.id = 'claim-id';
      claim.status = WebhookEventStatus.PENDING;
      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(claim);
      mockRepository.save.mockImplementation(async (entity) => {
        if (!entity.id) entity.id = 'claim-id';
        return entity;
      });

      await expect(
        service.processWebhookOnce(
          baseWebhookId,
          'plaid',
          mockUserId,
          webhookContent,
          async () => {
            throw new Error('required sync failed');
          },
        ),
      ).rejects.toThrow('required sync failed');

      expect(claim.status).toBe(WebhookEventStatus.FAILED);
      expect(claim.errorMessage).toBe('required sync failed');
      expect(claim.completedAt).toBeNull();
      expect(mockLockClient.query.mock.calls.at(-1)?.[0]).toContain(
        'pg_advisory_unlock',
      );
      expect(mockLockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('claim lifecycle', () => {
    it('completes only the exact pending claim', async () => {
      const claim = new WebhookEventEntity();
      claim.id = 'claim-id';
      claim.status = WebhookEventStatus.PENDING;
      claim.toObject = jest.fn().mockReturnValue({ status: 'completed' });
      mockRepository.findOne.mockResolvedValueOnce(claim);
      mockRepository.save.mockImplementationOnce((entity) =>
        Promise.resolve(entity),
      );

      await service.markClaimCompleted('claim-id', { event: 'payload' });

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'claim-id', status: WebhookEventStatus.PENDING },
        lock: { mode: 'pessimistic_write' },
      });
      expect(claim.status).toBe(WebhookEventStatus.COMPLETED);
      expect(claim.completedAt).toBeInstanceOf(Date);
    });

    it('marks a failed claim retryable by leaving it out of successful dedupe', async () => {
      const claim = new WebhookEventEntity();
      claim.id = 'claim-id';
      claim.status = WebhookEventStatus.PENDING;
      claim.toObject = jest.fn().mockReturnValue({ status: 'failed' });
      mockRepository.findOne.mockResolvedValueOnce(claim);
      mockRepository.save.mockImplementationOnce((entity) =>
        Promise.resolve(entity),
      );

      await service.markClaimFailed('claim-id', 'sync failed', {
        event: 'payload',
      });

      expect(claim.status).toBe(WebhookEventStatus.FAILED);
      expect(claim.errorMessage).toBe('sync failed');
      expect(claim.expiresAt).toBeNull();
      expect(claim.completedAt).toBeNull();
    });
  });
});
