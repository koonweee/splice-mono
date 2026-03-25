import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { ManualBalanceUpdateService } from '../../src/account/manual-balance-update.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign, SerializedMoneyWithSign } from '../../src/types/MoneyWithSign';
import { mockUserId } from '../mocks/account/account.mock';

const TransactionSource = {
  MANUAL_BALANCE_UPDATE: 'MANUAL_BALANCE_UPDATE',
} as const;

const money = (amount: number): SerializedMoneyWithSign => ({
  money: { amount, currency: 'USD' },
  sign: amount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
});

const buildSnapshot = ({
  snapshotDate,
  amount,
}: {
  snapshotDate: string
  amount: number
}) =>
  ({
    accountId: 'manual-id',
    userId: mockUserId,
    snapshotDate,
    snapshotType: BalanceSnapshotType.USER_UPDATE,
    currentBalance: money(amount),
    availableBalance: money(amount),
  }) as unknown as BalanceSnapshotEntity;

describe('ManualBalanceUpdateService', () => {
  let service: ManualBalanceUpdateService;

  const accountRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const priorSnapshotRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const snapshotRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const transactionRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManualBalanceUpdateService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: accountRepo,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: snapshotRepo,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: transactionRepo,
        },
      ],
    }).compile();

    service = module.get(ManualBalanceUpdateService);

    jest.clearAllMocks();
  });

  it('creates a positive Balance update transaction from the latest prior snapshot', async () => {
    priorSnapshotRepo.findOne.mockResolvedValue(
      buildSnapshot({ snapshotDate: '2026-03-20', amount: 100000 }),
    );

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(125000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

    expect(transactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantName: 'Balance update',
        date: '2026-03-24',
        source: TransactionSource.MANUAL_BALANCE_UPDATE,
        amount: expect.objectContaining({ amount: 25000 }),
      }),
    );
  });

  it('recomputes same-day replacement from the same prior snapshot baseline', async () => {
    priorSnapshotRepo.findOne.mockResolvedValue(
      buildSnapshot({ snapshotDate: '2026-03-20', amount: 100000 }),
    );

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(140000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

    expect(transactionRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merchantName: 'Balance update',
        amount: expect.objectContaining({ amount: 40000 }),
      }),
    );
  });

  it('deletes later snapshots and later synthetic balance-update transactions when backdating', async () => {
    priorSnapshotRepo.findOne.mockResolvedValue(
      buildSnapshot({ snapshotDate: '2026-03-17', amount: 90000 }),
    );

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(120000),
      effectiveDate: '2026-03-18',
      confirmHistoryReset: true,
    });

    expect(snapshotRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'manual-id',
        userId: mockUserId,
      }),
    );
    expect(transactionRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'manual-id',
        userId: mockUserId,
        source: TransactionSource.MANUAL_BALANCE_UPDATE,
      }),
    );
  });

  it('rejects destructive backdated saves when confirmHistoryReset is false', async () => {
    priorSnapshotRepo.findOne.mockResolvedValue(
      buildSnapshot({ snapshotDate: '2026-03-17', amount: 90000 }),
    );

    await expect(
      service.updateManualBalance('manual-id', mockUserId, {
        balance: money(120000),
        effectiveDate: '2026-03-18',
        confirmHistoryReset: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
