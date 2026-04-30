import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import { PersonalAccessTokenEntity } from '../../src/auth/personal-access-token.entity';
import { UserEntity } from '../../src/user/user.entity';
import * as crypto from 'crypto';

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
    jest.resetAllMocks();
  });

  it('creates a token by storing only a hash and returning the raw token once', async () => {
    mockPatRepository.save.mockImplementation(async (entity) => {
      entity.id = 'pat-123';
      entity.createdAt = new Date('2024-01-01T00:00:00Z');
      entity.updatedAt = new Date('2024-01-01T00:00:00Z');
      return entity;
    });

    const result = await service.createToken(mockUser, { name: 'codex-local' });
    const savedEntity = mockPatRepository.save.mock
      .calls[0][0] as PersonalAccessTokenEntity;
    const expectedHash = crypto
      .createHash('sha256')
      .update(result.token)
      .digest('hex');

    expect(mockPatRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'codex-local',
        userId: 'user-123',
        tokenHash: expect.any(String),
      }),
    );
    expect(savedEntity).not.toHaveProperty('token');
    expect(savedEntity.tokenHash).toBe(expectedHash);
    expect(savedEntity.tokenHash).not.toBe(result.token);
    expect(savedEntity.prefix).toMatch(/^[a-f0-9]{8}$/);
    expect(result.token).toMatch(/^splice_pat_/);
    expect(result).not.toHaveProperty('tokenHash');
    expect(result.tokenPreview).toBe(`splice_pat_${savedEntity.prefix}`);
  });

  it('lists tokens without exposing tokenHash or the raw token', async () => {
    const entity = new PersonalAccessTokenEntity();
    entity.id = 'pat-123';
    entity.userId = 'user-123';
    entity.name = 'codex-local';
    entity.prefix = 'deadbeef';
    entity.tokenHash =
      'c8f0e5f8b6b4d2f4fdbb1d8e2a5c9a7f4f7c8a9b4b5c6d7e8f9a0b1c2d3e4f5';
    entity.lastUsedAt = null;
    entity.expiresAt = null;
    entity.revokedAt = null;
    entity.createdAt = new Date('2024-01-01T00:00:00Z');
    entity.updatedAt = new Date('2024-01-01T00:00:00Z');

    mockPatRepository.find.mockResolvedValue([entity]);

    const result = await service.listTokens('user-123');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('codex-local');
    expect(result[0].tokenPreview).toBe('splice_pat_deadbeef');
    expect(result[0]).not.toHaveProperty('tokenHash');
    expect(result[0]).not.toHaveProperty('token');
  });

  it.each([[''], ['not-a-date'], [new Date('invalid')]])(
    'rejects invalid expiresAt input %p',
    async (expiresAt) => {
      await expect(
        service.createToken(mockUser, {
          name: 'codex-local',
          expiresAt,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPatRepository.save).not.toHaveBeenCalled();
    },
  );

  it('revokes a token by marking it unusable', async () => {
    mockPatRepository.findOne.mockResolvedValue({
      id: 'pat-123',
      userId: 'user-123',
      revokedAt: null,
    });
    mockPatRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.revokeToken('user-123', 'pat-123');

    expect(result).toBe('revoked');
    expect(mockPatRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'pat-123', userId: 'user-123' },
    });
    expect(mockPatRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pat-123',
        userId: 'user-123',
        revokedAt: expect.any(Object),
      }),
      expect.objectContaining({
        revokedAt: expect.any(Date),
      }),
    );
  });

  it('returns already_revoked when revoke is repeated', async () => {
    mockPatRepository.findOne.mockResolvedValue({
      id: 'pat-123',
      userId: 'user-123',
      revokedAt: new Date('2024-01-02T00:00:00Z'),
    });

    const result = await service.revokeToken('user-123', 'pat-123');

    expect(result).toBe('already_revoked');
    expect(mockPatRepository.update).not.toHaveBeenCalled();
  });

  it('returns not_found when the token does not exist or is not owned by the user', async () => {
    mockPatRepository.findOne.mockResolvedValue(null);

    const result = await service.revokeToken('user-123', 'pat-missing');

    expect(result).toBe('not_found');
    expect(mockPatRepository.update).not.toHaveBeenCalled();
  });

  it('validates a personal access token and returns user identity', async () => {
    const entity = new PersonalAccessTokenEntity();
    entity.id = 'pat-123';
    entity.userId = 'user-123';
    entity.name = 'codex-local';
    entity.prefix = 'deadbeef';
    entity.tokenHash =
      '3f4b1c2d3e4f5a6b7c8d9e0f1234567890abcdef1234567890abcdef12345678';
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
    mockPatRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.validateToken('splice_pat_deadbeef');
    const expectedHash = crypto
      .createHash('sha256')
      .update('splice_pat_deadbeef')
      .digest('hex');

    expect(result).toEqual({
      userId: 'user-123',
      email: 'user@example.com',
    });
    expect(mockPatRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: expectedHash,
        }),
      }),
    );
    expect(mockPatRepository.findOne.mock.calls[0][0].where.tokenHash).not.toBe(
      'splice_pat_deadbeef',
    );
    expect(mockPatRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pat-123',
        revokedAt: expect.any(Object),
      }),
      expect.objectContaining({
        lastUsedAt: expect.any(Date),
      }),
    );
  });

  it('returns null for expired personal access tokens', async () => {
    const expiredEntity = new PersonalAccessTokenEntity();
    expiredEntity.id = 'pat-expired';
    expiredEntity.userId = 'user-123';
    expiredEntity.name = 'expired';
    expiredEntity.prefix = 'deadbeef';
    expiredEntity.tokenHash =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expiredEntity.lastUsedAt = null;
    expiredEntity.expiresAt = new Date('2024-01-01T00:00:00Z');
    expiredEntity.revokedAt = null;
    expiredEntity.createdAt = new Date('2024-01-01T00:00:00Z');
    expiredEntity.updatedAt = new Date('2024-01-01T00:00:00Z');

    mockPatRepository.findOne.mockResolvedValue(expiredEntity);
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-123',
      email: 'user@example.com',
    } as UserEntity);

    await expect(
      service.validateToken('splice_pat_expired'),
    ).resolves.toBeNull();
  });

  it('returns null for revoked personal access tokens', async () => {
    mockPatRepository.findOne.mockResolvedValue(null);

    await expect(
      service.validateToken('splice_pat_revoked'),
    ).resolves.toBeNull();
    expect(mockPatRepository.update).not.toHaveBeenCalled();
    expect(mockUserRepository.findOne).not.toHaveBeenCalled();
  });
});
