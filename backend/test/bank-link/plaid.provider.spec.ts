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

  describe('initiateLinking', () => {
    it('should request single-account Link customization for conversion flows', async () => {
      provider['client'] = {
        linkTokenCreate: jest.fn().mockResolvedValue({
          data: {
            link_token: 'link-token-123',
            expiration: '2026-01-01T00:00:00Z',
            hosted_link_url: 'https://plaid.com/link',
          },
        }),
      } as any;
      provider['createUserToken'] = jest
        .fn()
        .mockResolvedValue('user-token-123');

      await provider.initiateLinking({
        userId: 'user-123',
        redirectUri: 'https://app.example.com/accounts',
        singleAccountSelect: true,
      });

      expect(provider['client'].linkTokenCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_token: 'user-token-123',
          enable_multi_item_link: false,
          link_customization_name: 'single_account',
        }),
      );
    });
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

    it('should request and map enriched transaction metadata', async () => {
      provider['client'] = {
        transactionsSync: jest.fn().mockResolvedValue({
          data: {
            added: [
              {
                account_id: 'external-account-id',
                amount: 12.34,
                iso_currency_code: 'USD',
                unofficial_currency_code: null,
                transaction_id: 'transaction-id',
                name: 'DD *DOORDASH CRACKEDAN',
                merchant_name: 'Crackedan',
                original_description: 'DOORDASH CRACKEDAN 855-973-1040 CA',
                pending: true,
                pending_transaction_id: 'pending-id',
                account_owner: null,
                date: '2026-05-03',
                datetime: null,
                authorized_date: '2026-05-03',
                authorized_datetime: '2026-05-03T13:51:41Z',
                logo_url: null,
                website: 'https://www.doordash.com',
                merchant_entity_id: 'merchant-entity-id',
                payment_channel: 'online',
                transaction_code: null,
                personal_finance_category_icon_url:
                  'https://plaid-category-icon.example/food.png',
                counterparties: [
                  {
                    name: 'DoorDash',
                    type: 'marketplace',
                    website: 'https://www.doordash.com',
                    logo_url: null,
                  },
                ],
                location: {
                  address: null,
                  city: null,
                  region: null,
                  postal_code: null,
                  country: null,
                  lat: null,
                  lon: null,
                  store_number: null,
                },
                payment_meta: {
                  reference_number: null,
                  ppd_id: null,
                  payee: null,
                  by_order_of: null,
                  payer: null,
                  payment_method: null,
                  payment_processor: null,
                  reason: null,
                },
                personal_finance_category: {
                  primary: 'FOOD_AND_DRINK',
                  detailed: 'FOOD_AND_DRINK_RESTAURANT',
                  confidence_level: 'VERY_HIGH',
                },
              },
            ],
            modified: [],
            removed: [],
            next_cursor: 'cursor-1',
            has_more: false,
          },
        }),
      } as any;

      const result = await provider.syncTransactions({
        accessToken: 'access-token',
      });

      expect(provider['client'].transactionsSync).toHaveBeenCalledWith({
        access_token: 'access-token',
        cursor: '',
        count: 500,
        options: {
          include_original_description: true,
          include_personal_finance_category: true,
        },
      });
      expect(result.added[0]).toEqual(
        expect.objectContaining({
          merchantName: 'Crackedan',
          providerTransactionName: 'DD *DOORDASH CRACKEDAN',
          originalDescription: 'DOORDASH CRACKEDAN 855-973-1040 CA',
          pendingTransactionId: 'pending-id',
          website: 'https://www.doordash.com',
          merchantEntityId: 'merchant-entity-id',
          paymentChannel: 'online',
          personalFinanceCategoryIconUrl:
            'https://plaid-category-icon.example/food.png',
          personalFinanceCategoryConfidenceLevel: 'VERY_HIGH',
          counterparties: [
            expect.objectContaining({
              name: 'DoorDash',
              website: 'https://www.doordash.com',
            }),
          ],
          location: expect.any(Object),
          paymentMeta: expect.any(Object),
          personalFinanceCategory: {
            primary: 'FOOD_AND_DRINK',
            detailed: 'FOOD_AND_DRINK_RESTAURANT',
          },
        }),
      );
    });
  });
});
