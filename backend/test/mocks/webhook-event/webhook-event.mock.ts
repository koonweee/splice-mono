import type {
  CreateWebhookEventDto,
  WebhookEvent,
} from '../../../src/types/WebhookEvent';
import { WebhookEventStatus } from '../../../src/types/WebhookEvent';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

export const mockWebhookEvent: WebhookEvent = {
  id: 'test-webhook-event-123',
  userId: mockUserId,
  webhookId: 'wh_plaid_12345',
  webhookContent: {
    webhook_type: 'TRANSACTIONS',
    webhook_code: 'DEFAULT_UPDATE',
    item_id: 'item_123',
    new_transactions: 5,
  },
  status: WebhookEventStatus.COMPLETED,
  providerName: 'plaid',
  expiresAt: null,
  completedAt: new Date('2024-01-01T00:01:00Z'),
  errorMessage: null,
  ...mockTimestamps,
};

export const mockWebhookEvent2: WebhookEvent = {
  id: 'test-webhook-event-456',
  userId: mockUserId,
  webhookId: 'wh_plaid_67890',
  webhookContent: {
    webhook_type: 'ITEM',
    webhook_code: 'WEBHOOK_UPDATE_ACKNOWLEDGED',
    item_id: 'item_456',
  },
  status: WebhookEventStatus.COMPLETED,
  providerName: 'plaid',
  expiresAt: null,
  completedAt: new Date('2024-01-02T00:01:00Z'),
  errorMessage: null,
  createdAt: new Date('2024-01-02T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
};

export const mockPendingWebhookEvent: WebhookEvent = {
  id: 'test-webhook-event-pending',
  userId: mockUserId,
  webhookId: 'link-token-abc123',
  webhookContent: null,
  status: WebhookEventStatus.PENDING,
  providerName: 'plaid',
  expiresAt: new Date('2024-01-01T01:00:00Z'),
  completedAt: null,
  errorMessage: null,
  ...mockTimestamps,
};

export const mockCreateWebhookEventDto: CreateWebhookEventDto = {
  webhookId: 'wh_plaid_99999',
  providerName: 'plaid',
  webhookContent: {
    webhook_type: 'AUTH',
    webhook_code: 'AUTOMATICALLY_VERIFIED',
    item_id: 'item_789',
  },
};
