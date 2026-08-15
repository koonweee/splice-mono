import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { WebhookEventCleanupService } from '../../src/webhook-event/webhook-event-cleanup.service';
import { WebhookEventEntity } from '../../src/webhook-event/webhook-event.entity';

describe('WebhookEventCleanupService', () => {
  const repository = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes only one bounded batch of pending contexts expired beyond retention', async () => {
    repository.query.mockResolvedValue([{ id: 'webhook-1' }]);
    const module = await Test.createTestingModule({
      providers: [
        WebhookEventCleanupService,
        {
          provide: getRepositoryToken(WebhookEventEntity),
          useValue: repository,
        },
      ],
    }).compile();
    const service = module.get(WebhookEventCleanupService);
    const now = new Date('2026-08-15T12:00:00.000Z');

    await expect(service.cleanupExpiredPending(now, 25)).resolves.toBe(1);

    const [sql, parameters] = repository.query.mock.calls[0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('LIMIT $3');
    expect(sql).toContain('event."status" = $1');
    expect(parameters).toEqual([
      'pending',
      new Date('2026-08-08T12:00:00.000Z'),
      25,
    ]);
  });

  it('clamps the batch size to a safe maximum', async () => {
    repository.query.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        WebhookEventCleanupService,
        {
          provide: getRepositoryToken(WebhookEventEntity),
          useValue: repository,
        },
      ],
    }).compile();
    const service = module.get(WebhookEventCleanupService);

    await service.cleanupExpiredPending(new Date(), 100_000);

    expect(repository.query.mock.calls[0][1][2]).toBe(500);
  });
});
