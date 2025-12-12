import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookEventEntity } from '../../src/webhook-event/webhook-event.entity';
import { WebhookEventService } from '../../src/webhook-event/webhook-event.service';
import { WebhookEventStatus } from '../../src/types/WebhookEvent';

describe('WebhookEventService', () => {
  let service: WebhookEventService;

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockUserId = 'user-uuid-123';

  beforeEach(async () => {
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPending', () => {
    it('should create a pending webhook event', async () => {
      const mockEntity = new WebhookEventEntity();
      mockEntity.id = 'generated-uuid-123';
      mockEntity.webhookId = 'wh_plaid_12345';
      mockEntity.providerName = 'plaid';
      mockEntity.status = WebhookEventStatus.PENDING;
      mockEntity.userId = mockUserId;
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
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findPendingByWebhookId('wh_plaid_12345');

      expect(result).toBeDefined();
      expect(result?.webhookId).toBe('wh_plaid_12345');
      expect(result?.status).toBe(WebhookEventStatus.PENDING);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          webhookId: 'wh_plaid_12345',
          status: WebhookEventStatus.PENDING,
        },
      });
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
    });

    it('should return null when pending webhook event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.markCompleted('wh_plaid_nonexistent', {});

      expect(result).toBeNull();
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
  });

  describe('tryAcquireWebhook', () => {
    const baseWebhookId = 'plaid:TRANSACTIONS:DEFAULT_UPDATE:item_abc123';
    const webhookContent = { webhook_type: 'TRANSACTIONS', item_id: 'item_abc123' };

    it('should acquire lock on first call (no recent webhook)', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.tryAcquireWebhook(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
      );

      expect(result.acquired).toBe(true);
      expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);

      // Verify saved entity has timestamped webhookId
      const savedEntity = mockRepository.save.mock.calls[0][0];
      expect(savedEntity.webhookId).toMatch(new RegExp(`^${baseWebhookId}:\\d+$`));
      expect(savedEntity.status).toBe(WebhookEventStatus.COMPLETED);
      expect(savedEntity.completedAt).toBeInstanceOf(Date);
    });

    it('should reject duplicate within deduplication window', async () => {
      const recentEntity = new WebhookEventEntity();
      recentEntity.webhookId = `${baseWebhookId}:1702000000000`;
      recentEntity.completedAt = new Date(); // Just now

      mockRepository.findOne.mockResolvedValue(recentEntity);

      const result = await service.tryAcquireWebhook(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
        5 * 60 * 1000, // 5 minutes
      );

      expect(result.acquired).toBe(false);
      expect('reason' in result && result.reason).toContain('Duplicate webhook');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should acquire lock when no recent webhook within window', async () => {
      // No recent webhook found
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.tryAcquireWebhook(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
        5 * 60 * 1000,
      );

      expect(result.acquired).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should use custom deduplication window', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const customWindowMs = 1 * 60 * 1000; // 1 minute

      await service.tryAcquireWebhook(
        baseWebhookId,
        'plaid',
        mockUserId,
        webhookContent,
        customWindowMs,
      );

      // Verify findOne was called with correct time window
      const findOneCall = mockRepository.findOne.mock.calls[0][0];
      expect(findOneCall.where.completedAt).toBeDefined();
    });
  });
});
