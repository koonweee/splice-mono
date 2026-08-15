import { ConflictException } from '@nestjs/common';
import { BankLinkLifecycleService } from '../../src/bank-link/bank-link-lifecycle.service';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';

describe('BankLinkLifecycleService', () => {
  const expectedUpdatedAt = new Date('2026-08-15T12:00:00.000Z');
  const bankLink = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    status: 'ERROR',
    updatedAt: expectedUpdatedAt,
    archivedAt: null,
  } as BankLinkEntity;
  const bankLinkRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const accountRepository = {
    count: jest.fn(),
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: unknown) =>
      entity === BankLinkEntity ? bankLinkRepository : accountRepository,
    ),
  };
  const repository = {
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn(
        async (callback: (scopedManager: typeof manager) => unknown) =>
          callback(manager),
      ),
    },
  };
  let service: BankLinkLifecycleService;

  beforeEach(() => {
    jest.clearAllMocks();
    bankLink.archivedAt = null;
    bankLink.status = 'ERROR';
    bankLink.updatedAt = expectedUpdatedAt;
    bankLinkRepository.findOne.mockResolvedValue(bankLink);
    bankLinkRepository.save.mockImplementation(async (entity) => entity);
    accountRepository.count.mockResolvedValue(0);
    service = new BankLinkLifecycleService(repository as never);
  });

  it('archives an inspected bank link only while it still has no active accounts', async () => {
    await expect(
      service.archiveEmptyBankLink({
        bankLinkId: bankLink.id,
        userId: bankLink.userId,
        expectedStatus: 'ERROR',
        expectedUpdatedAt,
      }),
    ).resolves.toBe(true);

    expect(accountRepository.count).toHaveBeenCalledWith({
      where: {
        bankLinkId: bankLink.id,
        userId: bankLink.userId,
        archivedAt: expect.objectContaining({ _type: 'isNull' }),
      },
    });
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 1777502000))',
      [bankLink.id],
    );
    expect(bankLinkRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ archivedAt: expect.any(Date) }),
    );
  });

  it('rejects cleanup when an active account appeared after inspection', async () => {
    accountRepository.count.mockResolvedValueOnce(1);

    await expect(
      service.archiveEmptyBankLink({
        bankLinkId: bankLink.id,
        userId: bankLink.userId,
        expectedStatus: 'ERROR',
        expectedUpdatedAt,
      }),
    ).rejects.toThrow('Bank link still has active accounts');
  });

  it('rejects cleanup when status or update time changed after inspection', async () => {
    bankLink.status = 'OK';

    await expect(
      service.archiveEmptyBankLink({
        bankLinkId: bankLink.id,
        userId: bankLink.userId,
        expectedStatus: 'ERROR',
        expectedUpdatedAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(accountRepository.count).not.toHaveBeenCalled();
  });

  it('is idempotent for an already archived link', async () => {
    bankLink.archivedAt = new Date('2026-08-15T13:00:00.000Z');

    await expect(
      service.archiveEmptyBankLink({
        bankLinkId: bankLink.id,
        userId: bankLink.userId,
        expectedStatus: 'ERROR',
        expectedUpdatedAt,
      }),
    ).resolves.toBe(false);

    expect(accountRepository.count).not.toHaveBeenCalled();
    expect(bankLinkRepository.save).not.toHaveBeenCalled();
  });

  it('sweeps only a bounded set of links stale for at least thirty days', async () => {
    const candidateQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([bankLink]),
    };
    repository.createQueryBuilder.mockReturnValueOnce(candidateQuery);
    const archiveSpy = jest
      .spyOn(service, 'archiveEmptyBankLink')
      .mockResolvedValueOnce(true);

    await expect(
      service.archiveStaleEmptyBankLinks(new Date('2026-09-15T12:00:00.000Z')),
    ).resolves.toBe(1);

    expect(candidateQuery.andWhere).toHaveBeenCalledWith(
      'bankLink.status != :healthyStatus',
      { healthyStatus: 'OK' },
    );
    expect(candidateQuery.andWhere).toHaveBeenCalledWith(
      'bankLink.updatedAt < :cutoff',
      { cutoff: new Date('2026-08-16T12:00:00.000Z') },
    );
    expect(candidateQuery.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('"account"."archivedAt" IS NULL'),
    );
    expect(candidateQuery.take).toHaveBeenCalledWith(100);
    expect(archiveSpy).toHaveBeenCalledWith({
      bankLinkId: bankLink.id,
      userId: bankLink.userId,
      expectedStatus: 'ERROR',
      expectedUpdatedAt,
    });
  });
});
