import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { RefreshTokenCleanupService } from '../../src/auth/refresh-token-cleanup.service';
import { RefreshTokenEntity } from '../../src/auth/refresh-token.entity';

describe('RefreshTokenCleanupService', () => {
  const repository = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes a bounded batch only after revoked or expired token retention', async () => {
    repository.query.mockResolvedValue([
      [{ id: 'token-1' }, { id: 'token-2' }, { id: 'token-3' }],
      3,
    ]);
    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: repository,
        },
      ],
    }).compile();
    const service = module.get(RefreshTokenCleanupService);
    const now = new Date('2026-08-15T12:00:00.000Z');

    await expect(service.cleanupInactiveTokens(now, 40)).resolves.toBe(3);

    const [sql, parameters] = repository.query.mock.calls[0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('LIMIT $2');
    expect(sql).toContain('token."revoked" = true');
    expect(sql).toContain('token."expiresAt" < $1');
    expect(parameters).toEqual([new Date('2026-07-16T12:00:00.000Z'), 40]);
  });

  it('clamps the batch size to a safe maximum', async () => {
    repository.query.mockResolvedValue([[], 0]);
    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenCleanupService,
        {
          provide: getRepositoryToken(RefreshTokenEntity),
          useValue: repository,
        },
      ],
    }).compile();
    const service = module.get(RefreshTokenCleanupService);

    await service.cleanupInactiveTokens(new Date(), 100_000);

    expect(repository.query.mock.calls[0][1][1]).toBe(500);
  });
});
