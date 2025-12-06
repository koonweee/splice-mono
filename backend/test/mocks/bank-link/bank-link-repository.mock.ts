import type { BankLink } from '../../../src/types/BankLink';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

export const mockBankLink: BankLink = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: mockUserId,
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
  ...mockTimestamps,
};

export const mockCreateBankLinkDto = {
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
};

const mockBankLinkEntity = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: mockUserId,
  providerName: 'plaid',
  authentication: { accessToken: 'test-token' },
  accountIds: ['acc-1', 'acc-2'],
  ...mockTimestamps,
  toObject: jest.fn().mockReturnValue(mockBankLink),
};

export const mockBankLinkRepository = {
  save: jest.fn().mockResolvedValue(mockBankLinkEntity),
  findOne: jest.fn().mockResolvedValue(mockBankLinkEntity),
  find: jest.fn().mockResolvedValue([mockBankLinkEntity]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};
