import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { AuthService } from '../../src/auth/auth.service';
import { RefreshTokenEntity } from '../../src/auth/refresh-token.entity';
import { BrowserSessionService } from '../../src/auth/browser-session.service';

const NOW = new Date('2026-05-14T12:00:00.000Z');
const FUTURE = new Date('2026-05-14T12:05:00.000Z');
const PAST = new Date('2026-05-14T11:55:00.000Z');
const JWT_SECRET = 'test-jwt-secret';
const ROTATED_REFRESH_TOKEN_PREFIX = 'splice_refresh_rotated_v1';

describe('AuthService', () => {
  let service: AuthService;
  let originalJwtSecret: string | undefined;

  const mockRefreshTokenRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  const mockManager = {
    getRepository: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };
  const mockSessions = {
    lockRefreshToken: jest.fn(),
    createSession: jest.fn(),
    extendSession: jest.fn(),
    revokeToken: jest.fn(),
    revokeAll: jest.fn(),
  };

  beforeAll(() => {
    originalJwtSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    mockManager.getRepository.mockReturnValue(mockRefreshTokenRepository);
    mockRefreshTokenRepository.manager.transaction.mockImplementation(
      async (callback) => callback(mockManager),
    );
    mockRefreshTokenRepository.save.mockImplementation(
      async (entity) => entity,
    );
    mockSessions.lockRefreshToken.mockImplementation(async () => {
      const token = await mockRefreshTokenRepository.findOne();
      return token
        ? {
            token,
            session: { id: 'session-id', expiresAt: FUTURE, revokedAt: null },
          }
        : null;
    });
    mockSessions.createSession.mockResolvedValue({ id: 'session-id' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: BrowserSessionService, useValue: mockSessions },
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it('rotates a valid refresh token while storing only hashes', async () => {
    const oldRawToken = 'old-refresh-token';
    const oldTokenEntity = createRefreshTokenEntity({
      id: 'old-token-id',
      token: hashToken(oldRawToken),
    });

    mockRefreshTokenRepository.findOne.mockResolvedValue(oldTokenEntity);

    const result = await service.rotateRefreshToken(oldRawToken);
    const expectedReplacement = deriveRotatedRefreshToken(
      oldRawToken,
      oldTokenEntity.id,
    );
    const savedReplacement = mockRefreshTokenRepository.save.mock
      .calls[0][0] as RefreshTokenEntity;
    const savedOldToken = mockRefreshTokenRepository.save.mock
      .calls[1][0] as RefreshTokenEntity;

    expect(result).toEqual({
      userId: oldTokenEntity.userId,
      newRefreshToken: expectedReplacement,
    });
    expect(savedReplacement.token).toBe(hashToken(expectedReplacement));
    expect(savedReplacement.token).not.toBe(expectedReplacement);
    expect(savedReplacement.revoked).toBe(false);
    expect(savedReplacement.sessionId).toBe('session-id');
    expect(mockSessions.extendSession).toHaveBeenCalledWith(
      mockManager,
      expect.objectContaining({ id: 'session-id' }),
      savedReplacement.expiresAt,
    );
    expect(savedOldToken.revoked).toBe(true);
    expect(savedOldToken.revokedAt).toEqual(NOW);
    expect(savedOldToken.revocationReason).toBe('rotated');
    expect(savedOldToken.rotationGraceExpiresAt).toEqual(
      new Date(NOW.getTime() + 10_000),
    );
    expect(savedOldToken.replacedByTokenId).toBe(savedReplacement.id);
  });

  it('rejects expired refresh tokens', async () => {
    mockRefreshTokenRepository.findOne.mockResolvedValue(
      createRefreshTokenEntity({
        expiresAt: PAST,
      }),
    );

    await expect(
      service.rotateRefreshToken('expired-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockRefreshTokenRepository.save).not.toHaveBeenCalled();
  });

  it('creates a browser session for each login without exposing its identity in tokens', async () => {
    const raw = await service.generateRefreshToken('user-123');
    expect(mockSessions.createSession).toHaveBeenCalledWith(
      mockManager,
      'user-123',
      expect.any(Date),
    );
    expect(mockRefreshTokenRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-id',
        token: hashToken(raw),
      }),
    );
  });

  it('uses atomic session revocation for logout and logout-all', async () => {
    await service.revokeToken('synthetic-token');
    await service.revokeAllUserTokens('user-123');
    expect(mockSessions.revokeToken).toHaveBeenCalledWith('synthetic-token');
    expect(mockSessions.revokeAll).toHaveBeenCalledWith('user-123');
    expect(mockRefreshTokenRepository.update).not.toHaveBeenCalled();
  });

  it('never rotates a token belonging to a revoked session', async () => {
    mockSessions.lockRefreshToken.mockResolvedValue({
      token: createRefreshTokenEntity(),
      session: { id: 'session-id', expiresAt: FUTURE, revokedAt: NOW },
    });
    await expect(
      service.rotateRefreshToken('synthetic-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockRefreshTokenRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a revoked rotated token outside the grace window', async () => {
    const oldRawToken = 'old-refresh-token';
    mockRefreshTokenRepository.findOne.mockResolvedValue(
      createRefreshTokenEntity({
        id: 'old-token-id',
        token: hashToken(oldRawToken),
        revoked: true,
        revokedAt: PAST,
        revocationReason: 'rotated',
        rotationGraceExpiresAt: PAST,
        replacedByTokenId: 'replacement-token-id',
      }),
    );

    await expect(
      service.rotateRefreshToken(oldRawToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockRefreshTokenRepository.save).not.toHaveBeenCalled();
  });

  it('returns the already-issued replacement token for a duplicate within grace', async () => {
    const oldRawToken = 'old-refresh-token';
    const oldTokenId = 'old-token-id';
    const replacementTokenId = 'replacement-token-id';
    const replacementRawToken = deriveRotatedRefreshToken(
      oldRawToken,
      oldTokenId,
    );
    const oldTokenEntity = createRefreshTokenEntity({
      id: oldTokenId,
      token: hashToken(oldRawToken),
      revoked: true,
      revokedAt: NOW,
      revocationReason: 'rotated',
      rotationGraceExpiresAt: FUTURE,
      replacedByTokenId: replacementTokenId,
    });
    const replacementTokenEntity = createRefreshTokenEntity({
      id: replacementTokenId,
      token: hashToken(replacementRawToken),
    });

    mockRefreshTokenRepository.findOne
      .mockResolvedValueOnce(oldTokenEntity)
      .mockResolvedValueOnce(replacementTokenEntity);

    const result = await service.rotateRefreshToken(oldRawToken);

    expect(result).toEqual({
      userId: oldTokenEntity.userId,
      newRefreshToken: replacementRawToken,
    });
    expect(mockRefreshTokenRepository.save).not.toHaveBeenCalled();
  });

  it('rejects duplicate rotation when logout-all revoked the replacement token', async () => {
    const oldRawToken = 'old-refresh-token';
    const oldTokenId = 'old-token-id';
    const replacementTokenId = 'replacement-token-id';
    const replacementRawToken = deriveRotatedRefreshToken(
      oldRawToken,
      oldTokenId,
    );
    const oldTokenEntity = createRefreshTokenEntity({
      id: oldTokenId,
      token: hashToken(oldRawToken),
      revoked: true,
      revokedAt: NOW,
      revocationReason: 'rotated',
      rotationGraceExpiresAt: FUTURE,
      replacedByTokenId: replacementTokenId,
    });
    const replacementTokenEntity = createRefreshTokenEntity({
      id: replacementTokenId,
      token: hashToken(replacementRawToken),
      revoked: true,
      revokedAt: NOW,
      revocationReason: 'logout_all',
    });

    mockRefreshTokenRepository.findOne
      .mockResolvedValueOnce(oldTokenEntity)
      .mockResolvedValueOnce(replacementTokenEntity);

    await expect(
      service.rotateRefreshToken(oldRawToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockRefreshTokenRepository.save).not.toHaveBeenCalled();
  });
});

function createRefreshTokenEntity(
  overrides: Partial<RefreshTokenEntity> = {},
): RefreshTokenEntity {
  const entity = new RefreshTokenEntity();
  entity.id = 'refresh-token-id';
  entity.token = hashToken('refresh-token');
  entity.userId = 'user-123';
  entity.expiresAt = FUTURE;
  entity.revoked = false;
  entity.revokedAt = null;
  entity.revocationReason = null;
  entity.rotationGraceExpiresAt = null;
  entity.replacedByTokenId = null;
  entity.createdAt = NOW;
  entity.updatedAt = NOW;

  return Object.assign(entity, overrides);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function deriveRotatedRefreshToken(
  oldRawToken: string,
  tokenId: string,
): string {
  return crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${ROTATED_REFRESH_TOKEN_PREFIX}:${tokenId}:${oldRawToken}`)
    .digest('hex');
}
