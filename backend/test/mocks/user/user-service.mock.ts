import { mockLoginResponse, mockUser } from './user.mock';

export const mockUserService = {
  create: jest.fn().mockResolvedValue(mockUser),
  login: jest.fn().mockResolvedValue(mockLoginResponse),
  findOne: jest.fn().mockResolvedValue(mockUser),
  findByEmail: jest.fn().mockResolvedValue(mockUser),
  getProviderDetails: jest.fn().mockResolvedValue(undefined),
  updateProviderDetails: jest.fn().mockResolvedValue(mockUser),
};
