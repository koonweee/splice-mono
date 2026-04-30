import { mockAccount, mockAccount2 } from './account.mock';

export const mockAccountService = {
  create: jest.fn().mockResolvedValue(mockAccount),
  findOne: jest.fn().mockResolvedValue(mockAccount),
  findAll: jest.fn().mockResolvedValue([mockAccount, mockAccount2]),
  update: jest.fn().mockResolvedValue(mockAccount),
  archive: jest.fn().mockResolvedValue(mockAccount),
  remove: jest.fn().mockResolvedValue(true),
};
