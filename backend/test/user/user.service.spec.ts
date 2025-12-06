import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserEntity } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import { mockCreateUserDto, mockLoginDto } from '../mocks/user/user.mock';

describe('UserService', () => {
  let service: UserService;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let jwtService: JwtService;

  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      mockRepository.findOne.mockResolvedValue(null); // No existing user

      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = mockCreateUserDto.email;
      mockEntity.hashedPassword = 'hashed-password';
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(mockCreateUserDto);

      expect(result).toHaveProperty('id');
      expect(result.email).toBe(mockCreateUserDto.email);
      expect(result).not.toHaveProperty('hashedPassword');
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException if user already exists', async () => {
      const existingEntity = new UserEntity();
      existingEntity.id = 'existing-user-id';
      existingEntity.email = mockCreateUserDto.email;

      mockRepository.findOne.mockResolvedValue(existingEntity);

      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(mockCreateUserDto)).rejects.toThrow(
        'User with this email already exists',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should hash the password before saving', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = mockCreateUserDto.email;
      mockEntity.hashedPassword = 'hashed-password';
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      mockRepository.save.mockResolvedValue(mockEntity);

      await service.create(mockCreateUserDto);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: mockCreateUserDto.email,
          hashedPassword: expect.any(String) as string,
        }),
      );

      // Verify the password is hashed (contains salt:hash format)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const savedEntity = mockRepository.save.mock.calls[0][0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(savedEntity.hashedPassword).toContain(':');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(savedEntity.hashedPassword).not.toBe(mockCreateUserDto.password);
    });
  });

  describe('login', () => {
    it('should return access token and user on successful login', async () => {
      // Create an entity with a real hashed password
      const password = 'password123';
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = mockLoginDto.email;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      // First create a user to get a valid hash
      mockRepository.findOne.mockResolvedValueOnce(null);
      mockRepository.save.mockImplementation((entity) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        mockEntity.hashedPassword = entity.hashedPassword;
        return Promise.resolve(mockEntity);
      });

      await service.create({ email: mockLoginDto.email, password });

      // Now test login
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.login({
        email: mockLoginDto.email,
        password,
      });

      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe(mockLoginDto.email);
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockEntity.id,
        email: mockEntity.email,
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.login(mockLoginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.login(mockLoginDto)).rejects.toThrow(
        'Invalid email or password',
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = mockLoginDto.email;
      mockEntity.hashedPassword = 'invalid-hash-format';
      mockEntity.createdAt = new Date();
      mockEntity.updatedAt = new Date();

      mockRepository.findOne.mockResolvedValue(mockEntity);

      await expect(
        service.login({ ...mockLoginDto, password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findOne('user-uuid-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user-uuid-123');
      expect(result?.email).toBe('test@example.com');
      expect(result).not.toHaveProperty('hashedPassword');
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should return a user when found by email', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findByEmail('test@example.com');

      expect(result).toBeDefined();
      expect(result?.email).toBe('test@example.com');
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null when user not found by email', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('getProviderDetails', () => {
    it('should return provider details when user has them', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.providerDetails = {
        plaid: { userToken: 'plaid-user-token-123' },
      };
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.getProviderDetails('user-uuid-123', 'plaid');

      expect(result).toEqual({ userToken: 'plaid-user-token-123' });
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'user-uuid-123' },
      });
    });

    it('should return undefined when user has no provider details', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.getProviderDetails('user-uuid-123', 'plaid');

      expect(result).toBeUndefined();
    });

    it('should return undefined when provider not in details', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.providerDetails = {
        other: { someField: 'value' },
      };
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.getProviderDetails('user-uuid-123', 'plaid');

      expect(result).toBeUndefined();
    });

    it('should return undefined when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getProviderDetails(
        'non-existent-id',
        'plaid',
      );

      expect(result).toBeUndefined();
    });
  });

  describe('updateProviderDetails', () => {
    it('should update and return user with new provider details', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateProviderDetails(
        'user-uuid-123',
        'plaid',
        { userToken: 'new-token' },
      );

      expect(result).toBeDefined();
      expect(result?.providerDetails).toEqual({
        plaid: { userToken: 'new-token' },
      });
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          providerDetails: { plaid: { userToken: 'new-token' } },
        }),
      );
    });

    it('should merge with existing provider details for other providers', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.providerDetails = {
        simplefin: { existingField: 'value' },
      };
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateProviderDetails(
        'user-uuid-123',
        'plaid',
        { userToken: 'new-token' },
      );

      expect(result?.providerDetails).toEqual({
        simplefin: { existingField: 'value' },
        plaid: { userToken: 'new-token' },
      });
    });

    it('should replace existing details for the same provider', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.providerDetails = {
        plaid: { userToken: 'old-token', otherField: 'will-be-removed' },
      };
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateProviderDetails(
        'user-uuid-123',
        'plaid',
        { userToken: 'new-token' },
      );

      expect(result?.providerDetails).toEqual({
        plaid: { userToken: 'new-token' },
      });
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.updateProviderDetails(
        'non-existent-id',
        'plaid',
        { userToken: 'new-token' },
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});
