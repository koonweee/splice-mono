import { WebhookEventEntity } from '../../../src/webhook-event/webhook-event.entity';
import {
  mockCreateWebhookEventDto,
  mockTimestamps,
  mockUserId,
  mockWebhookEvent,
} from './webhook-event.mock';

const mockWebhookEventEntity = WebhookEventEntity.fromDto(
  mockCreateWebhookEventDto,
  mockUserId,
);
mockWebhookEventEntity.id = mockWebhookEvent.id;
mockWebhookEventEntity.createdAt = mockTimestamps.createdAt;
mockWebhookEventEntity.updatedAt = mockTimestamps.updatedAt;

export const mockWebhookEventRepository = {
  save: jest.fn().mockResolvedValue(mockWebhookEventEntity),
  findOne: jest.fn().mockResolvedValue(mockWebhookEventEntity),
  find: jest.fn().mockResolvedValue([mockWebhookEventEntity]),
  count: jest.fn().mockResolvedValue(0),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};
