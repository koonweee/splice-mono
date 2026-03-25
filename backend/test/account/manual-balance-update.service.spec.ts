import { BadRequestException } from '@nestjs/common';
import { AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign, SerializedMoneyWithSign } from '../../src/types/MoneyWithSign';
import { mockUserId } from '../mocks/account/account.mock';

const TransactionSource = {
  MANUAL_BALANCE_UPDATE: 'MANUAL_BALANCE_UPDATE',
} as const;

type UpdateManualBalanceDto = {
  balance: SerializedMoneyWithSign;
  effectiveDate: string;
  confirmHistoryReset: boolean;
};

class ManualBalanceUpdateService {
  constructor(
    private readonly accountRepo: {
      findOne: jest.Mock;
      save: jest.Mock;
    },
    private readonly snapshotRepo: {
      findOne: jest.Mock;
      find: jest.Mock;
      save: jest.Mock;
      delete: jest.Mock;
    },
    private readonly transactionRepo: {
      save: jest.Mock;
      delete: jest.Mock;
    },
  ) {}

  async updateManualBalance(
    accountId: string,
    userId: string,
    dto: UpdateManualBalanceDto,
  ): Promise<void> {
    void accountId;
    void userId;
    void dto;
  }
}

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

const buildSnapshot = (snapshotDate: string, amount: number) =>
  ({
    id: 'snapshot-id',
    userId: mockUserId,
    accountId: 'manual-id',
    snapshotDate,
    currentBalance: money(amount),
    availableBalance: money(amount),
    snapshotType: BalanceSnapshotType.USER_UPDATE,
  }) as unknown as BalanceSnapshotEntity;

describe('ManualBalanceUpdateService', () => {
  let service: ManualBalanceUpdateService;

  const accountRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const snapshotRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const transactionRepo = {
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(() => {
    service = new ManualBalanceUpdateService(
      accountRepo,
      snapshotRepo,
      transactionRepo,
    );

    jest.clearAllMocks();
  });

  it('creates a positive Balance update transaction from the latest prior snapshot', async () => {
    snapshotRepo.findOne.mockResolvedValue(
      buildSnapshot('2026-03-20', 100000),
    );
    snapshotRepo.find.mockResolvedValue([
      buildSnapshot('2026-03-20', 100000),
      buildSnapshot('2026-03-25', 130000),
    ]);
    accountRepo.findOne.mockResolvedValue(buildAccount('2026-03-20', 100000));

    await service.updateManualBalance('manual-id', mockUserId, {
      balance: money(125000),
      effectiveDate: '2026-03-24',
      confirmHistoryReset: false,
    });

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

  it('recomputes same-day replacement from the same prior snapshot baseline', async () => {
    snapshotRepo.findOne.mockResolvedValue(
      buildSnapshot('2026-03-20', 100000),
    );
    snapshotRepo.find.mockResolvedValue([buildSnapshot('2026-03-20', 100000)]);
    accountRepo.findOne.mockResolvedValue(buildAccount('2026-03-20', 100000));

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

    expect(transactionRepo.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        merchantName: 'Balance update',
        date: '2026-03-24',
        amount: expect.objectContaining({ amount: 40000 }),
      }),
    );
  });

  it('deletes later snapshots and later synthetic balance-update transactions when backdating', async () => {
    snapshotRepo.findOne.mockResolvedValue(
      buildSnapshot('2026-03-17', 90000),
    );
    snapshotRepo.find.mockResolvedValue([
      buildSnapshot('2026-03-17', 90000),
      buildSnapshot('2026-03-20', 110000),
      buildSnapshot('2026-03-25', 130000),
    ]);
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
    snapshotRepo.findOne.mockResolvedValue(
      buildSnapshot('2026-03-17', 90000),
    );
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
