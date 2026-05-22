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

    it('should parse INVESTMENTS_TRANSACTIONS webhook as known no-op type', () => {
      const payload = {
        webhook_type: 'INVESTMENTS_TRANSACTIONS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'item-123',
      };

      const result = provider.parseUpdateWebhook(payload);

      expect(result).toEqual({
        itemId: 'item-123',
        type: 'INVESTMENTS_TRANSACTIONS',
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

  describe('syncInvestmentHoldings', () => {
    it('should reject invalid authentication', async () => {
      await expect(
        provider.syncInvestmentHoldings({ invalid: true }),
      ).rejects.toThrow('Missing or invalid accessToken');
    });

    it('should request and map investment holdings and securities', async () => {
      provider['client'] = {
        investmentsHoldingsGet: jest.fn().mockResolvedValue({
          data: {
            accounts: [{ account_id: 'external-account-id' }],
            holdings: [
              {
                account_id: 'external-account-id',
                security_id: 'security-id',
                institution_price: 120.25,
                institution_price_as_of: '2026-05-20',
                institution_price_datetime: '2026-05-20T21:00:00Z',
                institution_value: 1262.625,
                cost_basis: 1000,
                quantity: 10.5,
                iso_currency_code: 'USD',
                unofficial_currency_code: null,
                vested_quantity: null,
                vested_value: null,
              },
            ],
            securities: [
              {
                security_id: 'security-id',
                institution_id: 'ins_123',
                institution_security_id: 'institution-security-id',
                name: 'Vanguard FTSE All-World UCITS ETF',
                ticker_symbol: 'VWRA',
                isin: 'IE00BK5BQT80',
                cusip: null,
                sedol: null,
                type: 'etf',
                subtype: 'etf',
                is_cash_equivalent: false,
                close_price: 120.25,
                close_price_as_of: '2026-05-20',
                update_datetime: '2026-05-20T21:00:00Z',
                iso_currency_code: 'USD',
                unofficial_currency_code: null,
                market_identifier_code: 'XLON',
                sector: null,
                industry: null,
                option_contract: null,
                fixed_income: null,
              },
            ],
          },
        }),
      } as any;

      const result = await provider.syncInvestmentHoldings({
        accessToken: 'access-token',
      });

      expect(provider['client'].investmentsHoldingsGet).toHaveBeenCalledWith({
        access_token: 'access-token',
      });
      expect(result).toEqual({
        externalAccountIds: ['external-account-id'],
        holdings: [
          {
            externalAccountId: 'external-account-id',
            externalSecurityId: 'security-id',
            quantity: '10.5',
            costBasis: '1000',
            institutionPrice: '120.25',
            institutionPriceAsOf: '2026-05-20',
            institutionPriceDatetime: '2026-05-20T21:00:00Z',
            institutionValue: '1262.625',
            isoCurrencyCode: 'USD',
            unofficialCurrencyCode: null,
            vestedQuantity: null,
            vestedValue: null,
          },
        ],
        securities: [
          expect.objectContaining({
            externalSecurityId: 'security-id',
            tickerSymbol: 'VWRA',
            closePrice: '120.25',
          }),
        ],
      });
    });
  });

  describe('syncInvestmentTransactions', () => {
    const security = {
      security_id: 'security-id',
      institution_id: 'ins_123',
      institution_security_id: 'institution-security-id',
      name: 'Vanguard FTSE All-World UCITS ETF',
      ticker_symbol: 'VWRA',
      isin: 'IE00BK5BQT80',
      cusip: null,
      sedol: null,
      type: 'etf',
      subtype: 'etf',
      is_cash_equivalent: false,
      close_price: 120.25,
      close_price_as_of: '2026-05-20',
      update_datetime: '2026-05-20T21:00:00Z',
      iso_currency_code: 'USD',
      unofficial_currency_code: null,
      market_identifier_code: 'XLON',
      sector: null,
      industry: null,
      option_contract: null,
      fixed_income: null,
    };

    it('should reject invalid authentication', async () => {
      await expect(
        provider.syncInvestmentTransactions(
          { invalid: true },
          '2026-01-01',
          '2026-05-20',
        ),
      ).rejects.toThrow('Missing or invalid accessToken');
    });

    it('should page through and map investment transactions with inverted cash impact', async () => {
      provider['client'] = {
        investmentsTransactionsGet: jest
          .fn()
          .mockResolvedValueOnce({
            data: {
              accounts: [{ account_id: 'external-account-id' }],
              securities: [security],
              investment_transactions: [
                {
                  investment_transaction_id: 'investment-transaction-buy',
                  cancel_transaction_id: null,
                  account_id: 'external-account-id',
                  security_id: 'security-id',
                  date: '2026-05-19',
                  name: 'Buy VWRA',
                  quantity: 2,
                  amount: 123.45,
                  price: 61.725,
                  fees: 1.25,
                  type: 'buy',
                  subtype: 'buy',
                  iso_currency_code: 'USD',
                  unofficial_currency_code: null,
                },
                {
                  investment_transaction_id: 'investment-transaction-cash',
                  cancel_transaction_id: 'cancel-id',
                  account_id: 'external-account-id',
                  security_id: null,
                  date: '2026-05-20',
                  name: 'Interest',
                  quantity: 0,
                  amount: -4.56,
                  price: 0,
                  fees: null,
                  type: 'cash',
                  subtype: 'interest',
                  iso_currency_code: 'USD',
                  unofficial_currency_code: null,
                },
              ],
              total_investment_transactions: 3,
            },
          })
          .mockResolvedValueOnce({
            data: {
              accounts: [{ account_id: 'external-account-id' }],
              securities: [security],
              investment_transactions: [
                {
                  investment_transaction_id: 'investment-transaction-sell',
                  cancel_transaction_id: null,
                  account_id: 'external-account-id',
                  security_id: 'security-id',
                  date: '2026-05-21',
                  name: 'Sell VWRA',
                  quantity: -1,
                  amount: -70,
                  price: 70,
                  fees: 0,
                  type: 'sell',
                  subtype: 'sell',
                  iso_currency_code: 'USD',
                  unofficial_currency_code: null,
                },
              ],
              total_investment_transactions: 3,
            },
          }),
      } as any;

      const result = await provider.syncInvestmentTransactions(
        { accessToken: 'access-token' },
        '2026-01-01',
        '2026-05-21',
      );

      expect(
        provider['client'].investmentsTransactionsGet,
      ).toHaveBeenCalledWith({
        access_token: 'access-token',
        start_date: '2026-01-01',
        end_date: '2026-05-21',
        options: {
          count: 500,
          offset: 0,
        },
      });
      expect(
        provider['client'].investmentsTransactionsGet,
      ).toHaveBeenCalledWith({
        access_token: 'access-token',
        start_date: '2026-01-01',
        end_date: '2026-05-21',
        options: {
          count: 500,
          offset: 2,
        },
      });
      expect(result.externalAccountIds).toEqual(['external-account-id']);
      expect(result.securities).toEqual([
        expect.objectContaining({
          externalSecurityId: 'security-id',
          tickerSymbol: 'VWRA',
        }),
      ]);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0]).toEqual(
        expect.objectContaining({
          externalActivityId: 'investment-transaction-buy',
          externalSecurityId: 'security-id',
          quantity: '2',
          price: '61.725',
          fees: '1.25',
          investmentType: 'buy',
          investmentSubtype: 'buy',
          providerPayload: expect.objectContaining({
            investment_transaction_id: 'investment-transaction-buy',
          }),
          amount: {
            money: { currency: 'USD', amount: 12345 },
            sign: 'negative',
          },
        }),
      );
      expect(result.transactions[1]).toEqual(
        expect.objectContaining({
          externalActivityId: 'investment-transaction-cash',
          externalSecurityId: null,
          cancelExternalActivityId: 'cancel-id',
          amount: {
            money: { currency: 'USD', amount: 456 },
            sign: 'positive',
          },
        }),
      );
    });
  });
});
