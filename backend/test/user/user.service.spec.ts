import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthService } from '../../src/auth/auth.service';
import type { UserSettings } from '../../src/types/UserSettings';
import { UserEntity } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';

const defaultSettings: UserSettings = {
  currency: 'USD',
  timezone: 'UTC',
  hideZeroBalanceAccounts: false,
  theme: 'splice-dark',
  neutralizationLookaroundDays: 60,
  analysisSankeyEnabled: false,
};

describe('UserService', () => {
  let service: UserService;

  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockAuthService = {
    generateAccessToken: jest.fn().mockReturnValue('mock-jwt-token'),
    generateRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
    rotateRefreshToken: jest.fn().mockResolvedValue({
      userId: 'user-uuid-123',
      newRefreshToken: 'new-refresh-token',
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
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
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateFromGoogleIdentity', () => {
    it('creates a Google-backed user without a password hash', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockImplementation((entity: UserEntity) => {
        entity.id = 'user-uuid-123';
        entity.createdAt = new Date('2024-01-01T00:00:00Z');
        entity.updatedAt = new Date('2024-01-01T00:00:00Z');
        return Promise.resolve(entity);
      });

      const result = await service.findOrCreateFromGoogleIdentity({
        googleSubject: 'google-subject-123',
        email: ' Test@Example.com ',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(result.email).toBe('test@example.com');
      expect(result.displayName).toBe('Test User');
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          googleSubject: 'google-subject-123',
          hashedPassword: null,
        }),
      );
    });

    it('returns an existing user when Google subject already exists', async () => {
      const existingEntity = new UserEntity();
      existingEntity.id = 'user-uuid-123';
      existingEntity.email = 'test@example.com';
      existingEntity.hashedPassword = null;
      existingEntity.googleSubject = 'google-subject-123';
      existingEntity.settings = defaultSettings;
      existingEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      existingEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValueOnce(existingEntity);

      const result = await service.findOrCreateFromGoogleIdentity({
        googleSubject: 'google-subject-123',
        email: 'test@example.com',
      });

      expect(result.id).toBe(existingEntity.id);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('links an existing user by verified email', async () => {
      const existingEntity = new UserEntity();
      existingEntity.id = 'user-uuid-123';
      existingEntity.email = 'test@example.com';
      existingEntity.hashedPassword = 'legacy-password-hash';
      existingEntity.googleSubject = null;
      existingEntity.settings = defaultSettings;
      existingEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      existingEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEntity);
      mockRepository.save.mockImplementation((entity: UserEntity) =>
        Promise.resolve(entity),
      );

      const result = await service.findOrCreateFromGoogleIdentity({
        googleSubject: 'google-subject-123',
        email: 'test@example.com',
      });

      expect(result.id).toBe(existingEntity.id);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: existingEntity.id,
          googleSubject: 'google-subject-123',
        }),
      );
    });

    it('throws ConflictException when email is linked to another Google subject', async () => {
      const existingEntity = new UserEntity();
      existingEntity.id = 'user-uuid-123';
      existingEntity.email = 'test@example.com';
      existingEntity.hashedPassword = null;
      existingEntity.googleSubject = 'other-google-subject';
      existingEntity.settings = defaultSettings;
      existingEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      existingEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEntity);

      await expect(
        service.findOrCreateFromGoogleIdentity({
          googleSubject: 'google-subject-123',
          email: 'test@example.com',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = { currency: 'USD', timezone: 'UTC' } as any;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findOne('user-uuid-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user-uuid-123');
      expect(result?.email).toBe('test@example.com');
      expect(result?.settings.hideZeroBalanceAccounts).toBe(false);
      expect(result?.settings.theme).toBe('splice-dark');
      expect(result).not.toHaveProperty('hashedPassword');
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getTimezone', () => {
    it('should return user timezone when set', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = {
        ...defaultSettings,
        timezone: 'America/New_York',
      };
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.getTimezone('user-uuid-123');

      expect(result).toBe('America/New_York');
    });

    it('should return UTC when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getTimezone('non-existent-id');

      expect(result).toBe('UTC');
    });

    it('should return UTC when timezone not set', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = { currency: 'USD' } as any; // Simulating old data without timezone
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.getTimezone('user-uuid-123');

      expect(result).toBe('UTC');
    });
  });

  describe('getProviderDetails', () => {
    it('should return provider details when user has them', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
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
      mockEntity.settings = defaultSettings;
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
      mockEntity.settings = defaultSettings;
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
      mockEntity.settings = defaultSettings;
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
      mockEntity.settings = defaultSettings;
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
      mockEntity.settings = defaultSettings;
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

  describe('updateSettings', () => {
    it('should update settings and emit event when currency changes', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateSettings('user-uuid-123', {
        currency: 'EUR',
      });

      expect(result).toEqual({
        ...defaultSettings,
        currency: 'EUR',
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.settings-updated',
        expect.objectContaining({
          userId: 'user-uuid-123',
          oldSettings: defaultSettings,
          newSettings: {
            ...defaultSettings,
            currency: 'EUR',
          },
        }),
      );
    });

    it('should update settings and emit event when timezone changes', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateSettings('user-uuid-123', {
        timezone: 'America/New_York',
      });

      expect(result).toEqual({
        ...defaultSettings,
        timezone: 'America/New_York',
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'user.settings-updated',
        expect.objectContaining({
          userId: 'user-uuid-123',
          oldSettings: defaultSettings,
          newSettings: {
            ...defaultSettings,
            timezone: 'America/New_York',
          },
        }),
      );
    });

    it('should not emit event when settings are unchanged', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      // Update with same values
      const result = await service.updateSettings('user-uuid-123', {
        currency: 'USD',
        timezone: 'UTC',
      });

      expect(result).toEqual(defaultSettings);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should update hideZeroBalanceAccounts without affecting currency or timezone events', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateSettings('user-uuid-123', {
        hideZeroBalanceAccounts: true,
      });

      expect(result).toEqual({
        ...defaultSettings,
        hideZeroBalanceAccounts: true,
      });
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should update theme without affecting currency or timezone events', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateSettings('user-uuid-123', {
        theme: 'dracula',
      });

      expect(result).toEqual({
        ...defaultSettings,
        theme: 'dracula',
      });
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should update neutralizationLookaroundDays without dropping existing settings', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = {
        ...defaultSettings,
        currency: 'EUR',
        timezone: 'America/New_York',
        hideZeroBalanceAccounts: true,
        theme: 'dracula',
        analysisSankeyEnabled: true,
      };
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateSettings('user-uuid-123', {
        neutralizationLookaroundDays: 120,
      });

      expect(result).toEqual({
        currency: 'EUR',
        timezone: 'America/New_York',
        hideZeroBalanceAccounts: true,
        theme: 'dracula',
        neutralizationLookaroundDays: 120,
        analysisSankeyEnabled: true,
      });
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should update analysisSankeyEnabled without affecting currency or timezone events', async () => {
      const mockEntity = new UserEntity();
      mockEntity.id = 'user-uuid-123';
      mockEntity.email = 'test@example.com';
      mockEntity.hashedPassword = 'hashed';
      mockEntity.settings = defaultSettings;
      mockEntity.providerDetails = null;
      mockEntity.createdAt = new Date('2024-01-01T00:00:00Z');
      mockEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation((entity) =>
        Promise.resolve(entity),
      );

      const result = await service.updateSettings('user-uuid-123', {
        analysisSankeyEnabled: true,
      });

      expect(result).toEqual({
        ...defaultSettings,
        analysisSankeyEnabled: true,
      });
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.updateSettings('non-existent-id', {
        currency: 'EUR',
      });

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
