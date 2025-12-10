import type { BankLink } from '../../../src/types/BankLink';

const mockBankLink: BankLink = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: 'user-uuid-123',
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  status: 'OK',
  statusDate: new Date('2025-01-01T00:00:00Z'),
  statusBody: null,
};

export const mockBankLinkService = {
  // CRUD methods
  create: jest.fn(function (this: void) {
    return Promise.resolve(mockBankLink);
  }),
  findOne: jest.fn(function (this: void) {
    return Promise.resolve(mockBankLink);
  }),
  findAll: jest.fn(function (this: void) {
    return Promise.resolve([mockBankLink]);
  }),
  update: jest.fn(function (this: void) {
    return Promise.resolve(mockBankLink);
  }),
  remove: jest.fn(function (this: void) {
    return Promise.resolve(true);
  }),
  // Linking methods
  initiateLinking: jest.fn(function (this: void) {
    return Promise.resolve({
      linkUrl: 'https://plaid.com/link/mock-123',
      expiresAt: new Date('2025-01-01T12:00:00Z'),
    });
  }),
  handleWebhook: jest.fn(function (this: void) {
    return Promise.resolve(undefined);
  }),
  syncAccounts: jest.fn(function (this: void) {
    return Promise.resolve([]);
  }),
  syncAllAccounts: jest.fn(function (this: void) {
    return Promise.resolve([]);
  }),
  syncAllAccountsSystem: jest.fn(function (this: void) {
    return Promise.resolve([]);
  }),
};
