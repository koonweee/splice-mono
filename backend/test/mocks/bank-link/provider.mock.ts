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

export const mockPlaidProvider: IBankLinkProvider = {
  providerName: 'plaid',
  initiateLinking: jest.fn(function (this: void) {
    return Promise.resolve(mockLinkInitiationResponse);
  }),
  shouldProcessWebhook: jest.fn(function (this: void) {
    return 'webhook-mock-123';
  }),
  processWebhook: jest.fn(function (this: void) {
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
  parseStatusWebhook: jest.fn(function (this: void) {
    return undefined; // Default: not a status webhook
  }),
};
