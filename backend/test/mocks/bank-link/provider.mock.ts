import { AccountType } from 'plaid';
import type { IBankLinkProvider } from '../../../src/bank-link/providers/bank-link-provider.interface';
import type { APIAccount } from '../../../src/types/BankLink';
import { MoneySign } from '../../../src/types/MoneyWithSign';

export const mockLinkInitiationResponse = {
  linkUrl: 'https://plaid.com/link/mock-123',
  webhookId: 'webhook-mock-123',
  expiresAt: new Date('2025-01-01T12:00:00Z'),
  metadata: { environment: 'mock' },
};

export const mockApiAccount: APIAccount = {
  accountId: 'plaid-acc-123',
  name: 'Mock Checking',
  mask: '1234',
  type: AccountType.Depository,
  subType: null,
  availableBalance: {
    money: { currency: 'USD', amount: 100000 },
    sign: MoneySign.POSITIVE,
  },
  currentBalance: {
    money: { currency: 'USD', amount: 100000 },
    sign: MoneySign.POSITIVE,
  },
};

export const mockInstitution = {
  id: 'ins_mock_123',
  name: 'Mock Bank',
};

export const mockLinkCompletionResponse = {
  authentication: { accessToken: 'access-token-123', itemId: 'item-mock-123' },
  accounts: [mockApiAccount],
  institution: mockInstitution,
};

export const mockGetAccountsResponse = {
  accounts: [mockApiAccount],
  institution: mockInstitution,
};

export const mockTransactionSyncResponse = {
  added: [],
  modified: [],
  removed: [],
  nextCursor: 'cursor-mock-123',
  hasMore: false,
};

export const mockInvestmentHoldingsResponse = {
  externalAccountIds: ['plaid-acc-123'],
  securities: [
    {
      externalSecurityId: 'sec-123',
      institutionId: 'ins_mock_123',
      institutionSecurityId: 'institution-sec-123',
      name: 'Vanguard FTSE All-World UCITS ETF',
      tickerSymbol: 'VWRA',
      isin: 'IE00BK5BQT80',
      cusip: null,
      sedol: null,
      type: 'etf',
      subtype: 'etf',
      isCashEquivalent: false,
      closePrice: '120.25',
      closePriceAsOf: '2026-05-20',
      updateDatetime: '2026-05-20T21:00:00Z',
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      marketIdentifierCode: 'XLON',
      sector: null,
      industry: null,
    },
  ],
  holdings: [
    {
      externalAccountId: 'plaid-acc-123',
      externalSecurityId: 'sec-123',
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
};

export const mockInvestmentTransactionsResponse = {
  externalAccountIds: ['plaid-acc-123'],
  startDate: '2024-05-20',
  endDate: '2026-05-20',
  securities: mockInvestmentHoldingsResponse.securities,
  transactions: [
    {
      externalActivityId: 'investment-transaction-123',
      externalAccountId: 'plaid-acc-123',
      externalSecurityId: 'sec-123',
      providerDate: '2026-05-20',
      providerDatetime: null,
      name: 'Buy VWRA',
      quantity: '2',
      amount: {
        money: { currency: 'USD', amount: 12345 },
        sign: MoneySign.NEGATIVE,
      },
      price: '61.725',
      fees: '1.25',
      investmentType: 'buy',
      investmentSubtype: 'buy',
      cancelExternalActivityId: null,
      providerPayload: {
        investment_transaction_id: 'investment-transaction-123',
      },
    },
  ],
};

export const mockPlaidProvider: IBankLinkProvider = {
  providerName: 'plaid',
  initiateLinking: jest.fn(function (this: void) {
    return Promise.resolve(mockLinkInitiationResponse);
  }),
  parseLinkCompletionWebhook: jest.fn(function (this: void) {
    return { linkToken: 'webhook-mock-123' };
  }),
  processLinkCompletion: jest.fn(function (this: void) {
    return Promise.resolve([mockLinkCompletionResponse]);
  }),
  getAccounts: jest.fn(function (this: void) {
    return Promise.resolve(mockGetAccountsResponse);
  }),
  verifyWebhook: jest.fn(function (this: void) {
    return Promise.resolve(true);
  }),
  parseUpdateWebhook: jest.fn(function (this: void) {
    return undefined; // Default: not an update webhook
  }),
  getItemId: jest.fn(function (this: void) {
    return Promise.resolve('item-mock-123');
  }),
  getConnectionDiagnostics: jest.fn(function (this: void) {
    return Promise.resolve({});
  }),
  parseStatusWebhook: jest.fn(function (this: void) {
    return undefined; // Default: not a status webhook
  }),
  syncTransactions: jest.fn(function (this: void) {
    return Promise.resolve(mockTransactionSyncResponse);
  }),
  syncInvestmentHoldings: jest.fn(function (this: void) {
    return Promise.resolve(mockInvestmentHoldingsResponse);
  }),
  syncInvestmentTransactions: jest.fn(function (this: void) {
    return Promise.resolve(mockInvestmentTransactionsResponse);
  }),
};
