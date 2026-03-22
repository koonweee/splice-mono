import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import { PersonalAccessTokenEntity } from '../../src/auth/personal-access-token.entity';
import { UserEntity } from '../../src/user/user.entity';

describe('PersonalAccessTokenService', () => {
  let service: PersonalAccessTokenService;

  const mockPatRepository = {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockUser: JwtUser = {
    userId: 'user-123',
    email: 'user@example.com',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonalAccessTokenService,
        {
          provide: getRepositoryToken(PersonalAccessTokenEntity),
          useValue: mockPatRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get(PersonalAccessTokenService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a token by storing only a hash and returning the raw token once', async () => {
    mockPatRepository.save.mockImplementation(async (entity) => {
      entity.id = 'pat-123';
      entity.createdAt = new Date('2024-01-01T00:00:00Z');
      entity.updatedAt = new Date('2024-01-01T00:00:00Z');
      return entity;
    });

    const result = await service.createToken(mockUser, { name: 'codex-local' });

    expect(mockPatRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'codex-local',
        userId: 'user-123',
        tokenHash: expect.any(String),
      }),
    );
    expect(result.token).toMatch(/^splice_pat_/);
    expect(result.tokenHash).toBeUndefined();
    expect(result.tokenPreview).toMatch(/^splice_pat_/);
  });

  it('lists tokens without exposing tokenHash or the raw token', async () => {
    const entity = new PersonalAccessTokenEntity();
    entity.id = 'pat-123';
    entity.userId = 'user-123';
    entity.name = 'codex-local';
    entity.prefix = 'splice_pat';
    entity.tokenHash = 'c8f0e5f8b6b4d2f4fdbb1d8e2a5c9a7f4f7c8a9b4b5c6d7e8f9a0b1c2d3e4f5';
    entity.lastUsedAt = null;
    entity.expiresAt = null;
    entity.revokedAt = null;
    entity.createdAt = new Date('2024-01-01T00:00:00Z');
    entity.updatedAt = new Date('2024-01-01T00:00:00Z');

    mockPatRepository.find.mockResolvedValue([entity]);

    const result = await service.listTokens('user-123');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('codex-local');
    expect(result[0].tokenPreview).toMatch(/^splice_pat_/);
    expect(result[0].tokenHash).toBeUndefined();
    expect(result[0].token).toBeUndefined();
  });

  it('revokes a token by marking it unusable', async () => {
    await service.revokeToken('user-123', 'pat-123');

    expect(mockPatRepository.update).toHaveBeenCalledWith(
      { id: 'pat-123', userId: 'user-123' },
      expect.objectContaining({
        revokedAt: expect.any(Date),
      }),
    );
  });

  it('validates a personal access token and returns user identity', async () => {
    const entity = new PersonalAccessTokenEntity();
    entity.id = 'pat-123';
    entity.userId = 'user-123';
    entity.name = 'codex-local';
    entity.prefix = 'splice_pat';
    entity.tokenHash = '3f4b1c2d3e4f5a6b7c8d9e0f1234567890abcdef1234567890abcdef12345678';
    entity.lastUsedAt = null;
    entity.expiresAt = null;
    entity.revokedAt = null;
    entity.createdAt = new Date('2024-01-01T00:00:00Z');
    entity.updatedAt = new Date('2024-01-01T00:00:00Z');

    mockPatRepository.findOne.mockResolvedValue(entity);
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
    } as UserEntity);
    mockPatRepository.save.mockImplementation(async (savedEntity) => savedEntity);

    const result = await service.validateToken('splice_pat_deadbeef');

    expect(result).toEqual({
      userId: 'user-123',
      email: 'user@example.com',
    });
    expect(mockPatRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pat-123',
        lastUsedAt: expect.any(Date),
      }),
    );
  });

  it('returns null for expired or revoked personal access tokens', async () => {
    const expiredEntity = new PersonalAccessTokenEntity();
    expiredEntity.id = 'pat-expired';
    expiredEntity.userId = 'user-123';
    expiredEntity.name = 'expired';
    expiredEntity.prefix = 'splice_pat';
    expiredEntity.tokenHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expiredEntity.lastUsedAt = null;
    expiredEntity.expiresAt = new Date('2024-01-01T00:00:00Z');
    expiredEntity.revokedAt = null;
    expiredEntity.createdAt = new Date('2024-01-01T00:00:00Z');
    expiredEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

    const revokedEntity = new PersonalAccessTokenEntity();
    revokedEntity.id = 'pat-revoked';
    revokedEntity.userId = 'user-123';
    revokedEntity.name = 'revoked';
    revokedEntity.prefix = 'splice_pat';
    revokedEntity.tokenHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    revokedEntity.lastUsedAt = null;
    revokedEntity.expiresAt = null;
    revokedEntity.revokedAt = new Date('2024-01-02T00:00:00Z');
    revokedEntity.createdAt = new Date('2024-01-01T00:00:00Z');
    revokedEntity.updatedAt = new Date('2024-01-02T00:00:00Z');

    mockPatRepository.findOne
      .mockResolvedValueOnce(expiredEntity)
      .mockResolvedValueOnce(revokedEntity);

    await expect(service.validateToken('splice_pat_expired')).resolves.toBeNull();
    await expect(service.validateToken('splice_pat_revoked')).resolves.toBeNull();
  });
});
