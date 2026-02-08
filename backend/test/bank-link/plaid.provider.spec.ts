import { PlaidProvider } from '../../src/bank-link/providers/plaid/plaid.provider';

describe('PlaidProvider', () => {
  let provider: PlaidProvider;

  beforeEach(() => {
    // Create provider with mocked environment
    process.env.PLAID_CLIENT_ID = 'test-client-id';
    process.env.PLAID_SECRET = 'test-secret';
    process.env.API_DOMAIN = 'https://test.example.com';
    provider = new PlaidProvider();
  });

  describe('parseUpdateWebhook', () => {
    it('should parse SYNC_UPDATES_AVAILABLE webhook', () => {
      const payload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'SYNC_UPDATES_AVAILABLE',
        item_id: 'item-123',
        initial_update_complete: true,
        historical_update_complete: false,
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'TRANSACTIONS',
      });
    });

    it('should parse DEFAULT_UPDATE webhook', () => {
      const payload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-123',
        new_transactions: 5,
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'TRANSACTIONS',
      });
    });

    it('should parse INITIAL_UPDATE webhook', () => {
      const payload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'INITIAL_UPDATE',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'TRANSACTIONS',
      });
    });

    it('should parse HISTORICAL_UPDATE webhook', () => {
      const payload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'HISTORICAL_UPDATE',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'TRANSACTIONS',
      });
    });

    it('should parse TRANSACTIONS_REMOVED webhook', () => {
      const payload = {
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'TRANSACTIONS_REMOVED',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'TRANSACTIONS',
      });
    });

    it('should parse HOLDINGS DEFAULT_UPDATE webhook', () => {
      const payload = {
        webhook_type: 'HOLDINGS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'HOLDINGS',
      });
    });

    it('should return undefined for unknown webhook type', () => {
      const payload = {
        webhook_type: 'UNKNOWN',
        webhook_code: 'SOMETHING',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toBeUndefined();
    });

    it('should return undefined for LINK webhooks', () => {
      const payload = {
        webhook_type: 'LINK',
        webhook_code: 'SESSION_FINISHED',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toBeUndefined();
    });
  });

  describe('syncTransactions', () => {
    it('should reject invalid authentication', async () => {
      await expect(
        provider.syncTransactions({ invalid: true }),
      ).rejects.toThrow('Missing or invalid accessToken');
    });
  });
});
