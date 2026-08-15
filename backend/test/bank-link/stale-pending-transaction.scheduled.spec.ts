import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { StalePendingTransactionScheduledService } from '../../src/bank-link/stale-pending-transaction.scheduled';
import { DataSource } from 'typeorm';

describe('StalePendingTransactionScheduledService', () => {
  const bankLinkService = {
    reconcileStalePendingTransactions: jest.fn(),
  };
  const bankLinkRepository = {
    find: jest.fn(),
  };
  const queryRunner = {
    connect: jest.fn(),
    query: jest.fn(),
    release: jest.fn(),
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  };
  let service: StalePendingTransactionScheduledService;

  beforeEach(async () => {
    jest.clearAllMocks();
    queryRunner.query
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StalePendingTransactionScheduledService,
        { provide: BankLinkService, useValue: bankLinkService },
        {
          provide: getRepositoryToken(BankLinkEntity),
          useValue: bankLinkRepository,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(StalePendingTransactionScheduledService);
  });

  it('reconciles active healthy Plaid links serially and continues after a failure', async () => {
    bankLinkRepository.find.mockResolvedValue([
      { id: 'link-1', userId: 'user-1' },
      { id: 'link-2', userId: 'user-2' },
      { id: 'link-3', userId: 'user-3' },
    ]);
    bankLinkService.reconcileStalePendingTransactions
      .mockResolvedValueOnce({
        candidateCount: 2,
        reconciledCount: 1,
        unresolvedCount: 1,
        ambiguousCount: 0,
      })
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({
        candidateCount: 0,
        reconciledCount: 0,
        unresolvedCount: 0,
        ambiguousCount: 0,
      });

    await expect(service.handleReconciliation()).resolves.toBeUndefined();

    expect(bankLinkRepository.find).toHaveBeenCalledWith({
      where: {
        providerName: 'plaid',
        status: 'OK',
        archivedAt: expect.any(Object),
      },
      order: { id: 'ASC' },
    });
    expect(
      bankLinkService.reconcileStalePendingTransactions,
    ).toHaveBeenNthCalledWith(1, 'link-1', 'user-1');
    expect(
      bankLinkService.reconcileStalePendingTransactions,
    ).toHaveBeenNthCalledWith(2, 'link-2', 'user-2');
    expect(
      bankLinkService.reconcileStalePendingTransactions,
    ).toHaveBeenNthCalledWith(3, 'link-3', 'user-3');
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [1777503001],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_advisory_unlock($1)',
      [1777503001],
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('does no provider or repository work when another replica holds the lock', async () => {
    queryRunner.query.mockReset().mockResolvedValueOnce([{ acquired: false }]);

    await expect(service.handleReconciliation()).resolves.toBeUndefined();

    expect(bankLinkRepository.find).not.toHaveBeenCalled();
    expect(
      bankLinkService.reconcileStalePendingTransactions,
    ).not.toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('counts the TypeORM DELETE tuple when purging expired archives', async () => {
    queryRunner.query
      .mockReset()
      .mockResolvedValueOnce([{ acquired: true }])
      .mockResolvedValueOnce([
        [{ id: 'archive-1' }, { id: 'archive-2' }, { id: 'archive-3' }],
        3,
      ])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    bankLinkRepository.find.mockResolvedValueOnce([]);
    const logger = Reflect.get(service, 'logger') as {
      log: (context: unknown, message: string) => void;
    };
    const logSpy = jest.spyOn(logger, 'log');

    await service.handleReconciliation();

    expect(logSpy).toHaveBeenCalledWith(
      { purgedCount: 3 },
      'Purged expired transaction reconciliation archives',
    );
  });

  it('releases the advisory lock and connection when the scheduled run fails', async () => {
    bankLinkRepository.find.mockRejectedValueOnce(new Error('database failed'));

    await expect(service.handleReconciliation()).rejects.toThrow(
      'database failed',
    );

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      'SELECT pg_advisory_unlock($1)',
      [1777503001],
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
