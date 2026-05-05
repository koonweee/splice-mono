import { mockUser } from './user.mock';

export const mockUserService = {
  findOne: jest.fn().mockResolvedValue(mockUser),
  findByEmail: jest.fn().mockResolvedValue(mockUser),
  findByGoogleSubject: jest.fn().mockResolvedValue(mockUser),
  findOrCreateFromGoogleIdentity: jest.fn().mockResolvedValue(mockUser),
  getTimezone: jest.fn().mockResolvedValue('UTC'),
  getProviderDetails: jest.fn().mockResolvedValue(undefined),
  updateProviderDetails: jest.fn().mockResolvedValue(mockUser),
  updateSettings: jest.fn().mockResolvedValue(mockUser.settings),
  refreshTokens: jest.fn().mockResolvedValue({
    accessToken: 'mock-jwt-token',
    refreshToken: 'mock-refresh-token',
  }),
};
