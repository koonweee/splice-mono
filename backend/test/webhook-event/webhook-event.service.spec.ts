import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookEventEntity } from '../../src/webhook-event/webhook-event.entity';
import { WebhookEventService } from '../../src/webhook-event/webhook-event.service';
import {
  mockCreateWebhookEventDto,
  mockUserId,
} from '../mocks/webhook-event/webhook-event.mock';

describe('WebhookEventService', () => {
  let service: WebhookEventService;

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };

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

  describe('create', () => {
    it('should create and return a webhook event', async () => {
      const mockEntity = WebhookEventEntity.fromDto(
        mockCreateWebhookEventDto,
        mockUserId,
      );
      mockEntity.id = 'generated-uuid-123';
      mockEntity.createdAt = new Date();
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(
        mockCreateWebhookEventDto,
        mockUserId,
      );

      expect(result).toHaveProperty('id');
      expect(result.webhookId).toBe(mockCreateWebhookEventDto.webhookId);
      expect(result.webhookContent).toBe(
        mockCreateWebhookEventDto.webhookContent,
      );
      expect(result).toHaveProperty('createdAt');
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('exists', () => {
    it('should return true when webhook exists', async () => {
      mockRepository.count.mockResolvedValue(1);

      const result = await service.exists('wh_plaid_12345');

      expect(result).toBe(true);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { webhookId: 'wh_plaid_12345' },
      });
    });

    it('should return false when webhook does not exist', async () => {
      mockRepository.count.mockResolvedValue(0);

      const result = await service.exists('wh_plaid_nonexistent');

      expect(result).toBe(false);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { webhookId: 'wh_plaid_nonexistent' },
      });
    });
  });

  describe('findOne', () => {
    it('should return a webhook event when found', async () => {
      const mockEntity = WebhookEventEntity.fromDto(
        mockCreateWebhookEventDto,
        mockUserId,
      );
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.createdAt = new Date();
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findOne('test-webhook-event-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('test-webhook-event-123');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-webhook-event-123' },
      });
    });

    it('should return null when webhook event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const result = await service.findOne('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('findByWebhookId', () => {
    it('should return a webhook event when found by webhookId', async () => {
      const mockEntity = WebhookEventEntity.fromDto(
        mockCreateWebhookEventDto,
        mockUserId,
      );
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.createdAt = new Date();
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findByWebhookId('wh_plaid_12345');

      expect(result).toBeDefined();
      expect(result?.webhookId).toBe(mockCreateWebhookEventDto.webhookId);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { webhookId: 'wh_plaid_12345' },
      });
    });

    it('should return null when webhook event not found by webhookId', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const result = await service.findByWebhookId('wh_plaid_nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all webhook events', async () => {
      const mockEntity1 = WebhookEventEntity.fromDto(
        mockCreateWebhookEventDto,
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      mockEntity1.createdAt = new Date();
      const mockEntity2 = WebhookEventEntity.fromDto(
        {
          ...mockCreateWebhookEventDto,
          webhookId: 'wh_plaid_different',
        },
        mockUserId,
      );
      mockEntity2.id = 'id-2';
      mockEntity2.createdAt = new Date();

      mockRepository.find.mockResolvedValue([mockEntity1, mockEntity2]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('id-1');
      expect(result[1].id).toBe('id-2');
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should return an empty array when no webhook events exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update and return a webhook event', async () => {
      const mockEntity = WebhookEventEntity.fromDto(
        mockCreateWebhookEventDto,
        mockUserId,
      );
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.createdAt = new Date();
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const updateDto = {
        webhookContent: { updated: true },
      };
      const result = await service.update('test-webhook-event-123', updateDto);

      expect(result).toBeDefined();
      expect(result?.id).toBe('test-webhook-event-123');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-webhook-event-123' },
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should return null when webhook event not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      const updateDto = { webhookContent: { updated: true } };
      const result = await service.update('non-existent-id', updateDto);
      expect(result).toBeNull();
    });

    it('should only update provided fields', async () => {
      const mockEntity = WebhookEventEntity.fromDto(
        mockCreateWebhookEventDto,
        mockUserId,
      );
      mockEntity.id = 'test-webhook-event-123';
      mockEntity.createdAt = new Date();
      const originalWebhookId = mockEntity.webhookId;

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const updateDto = {
        webhookContent: { updated: true },
      };
      const result = await service.update('test-webhook-event-123', updateDto);

      expect(result?.webhookId).toBe(originalWebhookId);
      expect(result?.webhookContent).toEqual({ updated: true });
    });
  });

  describe('remove', () => {
    it('should delete a webhook event and return true', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove('test-webhook-event-123');

      expect(result).toBe(true);
      expect(mockRepository.delete).toHaveBeenCalledWith(
        'test-webhook-event-123',
      );
    });

    it('should return false when webhook event not found', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.remove('non-existent-id');

      expect(result).toBe(false);
    });

    it('should return false when affected is null', async () => {
      mockRepository.delete.mockResolvedValue({ affected: null });

      const result = await service.remove('test-id');

      expect(result).toBe(false);
    });
  });
});
