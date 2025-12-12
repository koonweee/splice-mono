import { WebhookEventService } from 'src/webhook-event/webhook-event.service';
import {
  mockPendingWebhookEvent,
  mockWebhookEvent,
} from './webhook-event.mock';

export const mockWebhookEventService: jest.Mocked<
  Omit<WebhookEventService, 'logger' | 'repository'>
> = {
  createPending: jest.fn().mockResolvedValue(mockPendingWebhookEvent),
  findPendingByWebhookId: jest.fn().mockResolvedValue(mockPendingWebhookEvent),
  markCompleted: jest.fn().mockResolvedValue(mockWebhookEvent),
  markFailed: jest.fn().mockResolvedValue(mockWebhookEvent),
  tryAcquireWebhook: jest.fn().mockResolvedValue({ acquired: true }),
};
