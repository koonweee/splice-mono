import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { ManualBalanceUpdateService } from '../../src/account/manual-balance-update.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import {
  TransactionEntity,
  TransactionSource,
} from '../../src/transaction/transaction.entity';
import { BalanceColumns } from '../../src/common/balance.columns';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import {
  MoneySign,
  SerializedMoneyWithSign,
} from '../../src/types/MoneyWithSign';
import { mockUserId } from '../mocks/account/account.mock';

const money = (amount: number): SerializedMoneyWithSign => ({
  money: { amount, currency: 'USD' },
  sign: amount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
});

const buildAccount = (snapshotDate: string, amount: number) => {
  const account = AccountEntity.fromDto(
    {
      name: 'Manual Cash Account',
      availableBalance: money(amount),
      currentBalance: money(amount),
      type: AccountType.Depository,
      subType: null,
    },
    mockUserId,
  );
  account.id = 'manual-id';
  account.availableBalance = account.currentBalance;
  account.updatedAt = new Date(`${snapshotDate}T12:00:00.000Z`);
  return account;
};

const buildSnapshot = (
  snapshotDate: string,
  amount: number,
  availableAmount = amount,
) =>
  ({
    id: 'snapshot-id',
    userId: mockUserId,
    accountId: 'manual-id',
    snapshotDate,
    currentBalance: BalanceColumns.fromMoneyWithSign(money(amount)),
    availableBalance: BalanceColumns.fromMoneyWithSign(money(availableAmount)),
    snapshotType: BalanceSnapshotType.USER_UPDATE,
  }) as unknown as BalanceSnapshotEntity;

const buildSyntheticTransaction = (date: string, amount: number) =>
  ({
    id: 'existing-synthetic-transaction-id',
    userId: mockUserId,
    accountId: 'manual-id',
    date,
    merchantName: 'Balance update',
    pending: false,
    externalTransactionId: null,
    amount: BalanceColumns.fromMoneyWithSign(money(amount)),
    source: TransactionSource.MANUAL_BALANCE_UPDATE,
  }) as unknown as TransactionEntity;

describe('ManualBalanceUpdateService', () => {
  let service: ManualBalanceUpdateService;

  const accountRepo = {
    manager: {
      transaction: jest.fn(),
    },
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const snapshotRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const transactionRepo = {
    findOne: jest.fn(),
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
    accountRepo.manager.transaction.mockImplementation(async (callback) =>
      callback({
        getRepository: (entity) => {
          if (entity === AccountEntity) return accountRepo;
          if (entity === BalanceSnapshotEntity) return snapshotRepo;
          if (entity === TransactionEntity) return transactionRepo;
          throw new Error(`Unexpected repository request: ${String(entity)}`);
        },
      }),
    );
    snapshotRepo.save.mockImplementation(async (entity) => entity);
    accountRepo.save.mockImplementation(async (entity) => entity);
    transactionRepo.save.mockImplementation(async (entity) => entity);
  });

  it('creates a positive Balance update transaction from the latest prior snapshot', async () => {
    snapshotRepo.findOne
      .mockResolvedValueOnce(buildSnapshot('2026-03-20', 100000))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildSnapshot('2026-03-24', 125000));
    accountRepo.findOne.mockResolvedValue(buildAccount('2026-03-20', 100000));

    const result = await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(125000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

    expect(result.availableBalance).toEqual(money(125000));
    expect(result.latestSnapshotDate).toBe('2026-03-24');
    expect(snapshotRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'manual-id',
          userId: mockUserId,
        }),
      }),
    );
    expect(transactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantName: 'Balance update',
        date: '2026-03-24',
        source: TransactionSource.MANUAL_BALANCE_UPDATE,
        amount: expect.objectContaining({ amount: 25000 }),
      }),
    );
  });

  it('keeps investment-account available balance at zero', async () => {
    const investmentAccount = buildAccount('2026-03-20', 100000);
    investmentAccount.type = AccountType.Investment;
    snapshotRepo.findOne
      .mockResolvedValueOnce(buildSnapshot('2026-03-20', 100000))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildSnapshot('2026-03-24', 140000, 0));
    accountRepo.findOne.mockResolvedValue(investmentAccount);

    const result = await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(140000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

    expect(result.currentBalance).toEqual(money(140000));
    expect(result.availableBalance).toEqual(money(0));
  });

  it('recomputes same-day replacement from the same prior snapshot baseline', async () => {
    snapshotRepo.findOne
      .mockResolvedValueOnce(buildSnapshot('2026-03-20', 100000))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildSnapshot('2026-03-24', 125000))
      .mockResolvedValueOnce(buildSnapshot('2026-03-20', 100000))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildSnapshot('2026-03-24', 125000))
      .mockResolvedValueOnce(buildSnapshot('2026-03-24', 140000));
    accountRepo.findOne.mockResolvedValue(buildAccount('2026-03-20', 100000));

    transactionRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildSyntheticTransaction('2026-03-24', 25000));

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(125000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(140000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

    expect(transactionRepo.findOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'manual-id',
          date: '2026-03-24',
          source: TransactionSource.MANUAL_BALANCE_UPDATE,
        }),
      }),
    );
    expect(transactionRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'existing-synthetic-transaction-id',
        merchantName: 'Balance update',
        date: '2026-03-24',
        amount: expect.objectContaining({ amount: 40000 }),
        source: TransactionSource.MANUAL_BALANCE_UPDATE,
      }),
    );
  });

  it('deletes later snapshots and later synthetic balance-update transactions when backdating', async () => {
    snapshotRepo.findOne
      .mockResolvedValueOnce(buildSnapshot('2026-03-17', 90000))
      .mockResolvedValueOnce(buildSnapshot('2026-03-20', 110000))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(buildSnapshot('2026-03-18', 120000));
    accountRepo.findOne.mockResolvedValue(buildAccount('2026-03-25', 130000));

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(120000),
      effectiveDate: '2026-03-18',
      confirmHistoryReset: true,
    });

    expect(snapshotRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'manual-id',
        userId: mockUserId,
        snapshotDate: expect.objectContaining({
          type: 'moreThan',
          value: '2026-03-18',
        }),
      }),
    );
    expect(transactionRepo.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'manual-id',
        userId: mockUserId,
        source: TransactionSource.MANUAL_BALANCE_UPDATE,
        date: expect.objectContaining({
          type: 'moreThan',
          value: '2026-03-18',
        }),
      }),
    );
  });

  it('rejects destructive backdated saves when confirmHistoryReset is false', async () => {
    snapshotRepo.findOne
      .mockResolvedValueOnce(buildSnapshot('2026-03-17', 90000))
      .mockResolvedValueOnce(buildSnapshot('2026-03-20', 110000));
    accountRepo.findOne.mockResolvedValue(buildAccount('2026-03-25', 130000));

    await expect(
      service.updateManualBalance('manual-id', mockUserId, {
        balance: money(120000),
        effectiveDate: '2026-03-18',
        confirmHistoryReset: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
