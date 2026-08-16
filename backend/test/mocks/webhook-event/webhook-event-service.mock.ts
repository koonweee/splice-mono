import { WebhookEventService } from 'src/webhook-event/webhook-event.service';
import {
  mockPendingWebhookEvent,
  mockWebhookEvent,
} from './webhook-event.mock';

export const mockWebhookEventService: jest.Mocked<
  Omit<WebhookEventService, 'logger' | 'repository'>
> = {
  onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  createPending: jest.fn().mockResolvedValue(mockPendingWebhookEvent),
  findPendingByWebhookId: jest.fn().mockResolvedValue(mockPendingWebhookEvent),
  markCompleted: jest.fn().mockResolvedValue(mockWebhookEvent),
  markFailed: jest.fn().mockResolvedValue(mockWebhookEvent),
  processWebhookOnce: jest
    .fn()
    .mockImplementation(
      async (
        _baseWebhookId: string,
        _providerName: string,
        _userId: string,
        _webhookContent: Record<string, any>,
        process: () => Promise<void>,
      ) => {
        await process();
        return { processed: true as const };
      },
    ),
  markClaimCompleted: jest.fn().mockResolvedValue(mockWebhookEvent),
  markClaimFailed: jest.fn().mockResolvedValue(mockWebhookEvent),
};
