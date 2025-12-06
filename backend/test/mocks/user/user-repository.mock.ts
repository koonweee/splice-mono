import { mockUser } from './user.mock';

const mockUserEntity = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  hashedPassword: 'hashed-password-123',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  toObject: jest.fn().mockReturnValue(mockUser),
  toObjectWithPassword: jest.fn().mockReturnValue({
    ...mockUser,
    hashedPassword: 'hashed-password-123',
  }),
};

export const mockUserRepository = {
  save: jest.fn().mockResolvedValue(mockUserEntity),
  findOne: jest.fn().mockResolvedValue(mockUserEntity),
  find: jest.fn().mockResolvedValue([mockUserEntity]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};

export { mockUserEntity };
