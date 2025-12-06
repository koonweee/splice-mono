import { WebhookEventService } from 'src/webhook-event/webhook-event.service';
import {
  mockPendingWebhookEvent,
  mockWebhookEvent,
  mockWebhookEvent2,
} from './webhook-event.mock';

export const mockWebhookEventService: jest.Mocked<
  Omit<WebhookEventService, 'logger' | 'repository'>
> = {
  create: jest.fn().mockResolvedValue(mockWebhookEvent),
  createPending: jest.fn().mockResolvedValue(mockPendingWebhookEvent),
  findPendingByWebhookId: jest.fn().mockResolvedValue(mockPendingWebhookEvent),
  markCompleted: jest.fn().mockResolvedValue(mockWebhookEvent),
  markFailed: jest.fn().mockResolvedValue(mockWebhookEvent),
  exists: jest.fn().mockResolvedValue(false),
  findOne: jest.fn().mockResolvedValue(mockWebhookEvent),
  findByWebhookId: jest.fn().mockResolvedValue(mockWebhookEvent),
  findAll: jest.fn().mockResolvedValue([mockWebhookEvent, mockWebhookEvent2]),
  update: jest.fn().mockResolvedValue(mockWebhookEvent),
  remove: jest.fn().mockResolvedValue(true),
};
