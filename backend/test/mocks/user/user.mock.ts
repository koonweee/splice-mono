import type {
  CreateUserDto,
  LoginDto,
  LoginResponse,
  User,
} from '../../../src/types/User';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * Mock user
 */
export const mockUser: User = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  settings: { currency: 'USD' },
  ...mockTimestamps,
};

/**
 * Second mock user
 */
export const mockUser2: User = {
  id: 'user-uuid-456',
  email: 'test2@example.com',
  settings: { currency: 'USD' },
  ...mockTimestamps,
};

/**
 * Mock DTO for creating a user
 */
export const mockCreateUserDto: CreateUserDto = {
  email: 'test@example.com',
  password: 'password123',
};

/**
 * Mock DTO for login
 */
export const mockLoginDto: LoginDto = {
  email: 'test@example.com',
  password: 'password123',
};

/**
 * Mock login response
 */
export const mockLoginResponse: LoginResponse = {
  accessToken: 'mock-jwt-token',
  refreshToken: 'mock-refresh-token',
  user: mockUser,
};
