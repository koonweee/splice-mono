import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';
import {
  mockCreateAccountDto,
  mockUserId,
} from '../mocks/account/account.mock';
import { mockUserService } from '../mocks/user/user-service.mock';

describe('AccountService archive', () => {
  let service: AccountService;

  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };
  const mockSnapshotRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const mockBankLinkRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    mockSnapshotRepository.find.mockResolvedValue([]);
    mockSnapshotRepository.findOne.mockResolvedValue(null);
    mockSnapshotRepository.save.mockImplementation(async (entity) => entity);
    mockBankLinkRepository.findOne.mockResolvedValue(null);
    mockBankLinkRepository.save.mockImplementation(async (entity) => entity);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockSnapshotRepository,
        },
        {
          provide: getRepositoryToken(BankLinkEntity),
          useValue: mockBankLinkRepository,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('archives an account, zeroes its balances, and writes a zero balance snapshot', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-05T12:00:00Z'));
    const account = AccountEntity.fromDto(
      {
        ...mockCreateAccountDto,
        availableBalance: {
          money: { currency: 'USD', amount: 25000 },
          sign: MoneySign.POSITIVE,
        },
        currentBalance: {
          money: { currency: 'USD', amount: 50000 },
          sign: MoneySign.POSITIVE,
        },
      },
      mockUserId,
    );
    account.id = 'archive-id';
    mockRepository.findOne.mockResolvedValue(account);
    mockRepository.save.mockImplementation(async (entity) => entity);

    const result = await service.archive('archive-id', mockUserId);

    expect(result?.archivedAt?.toISOString()).toBe('2026-04-05T12:00:00.000Z');
    expect(result?.currentBalance).toEqual({
      money: { currency: 'USD', amount: 0 },
      sign: MoneySign.POSITIVE,
    });
    expect(result?.availableBalance).toEqual({
      money: { currency: 'USD', amount: 0 },
      sign: MoneySign.POSITIVE,
    });
    expect(mockSnapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'archive-id',
        userId: mockUserId,
        snapshotDate: '2026-04-05',
        snapshotType: BalanceSnapshotType.USER_UPDATE,
      }),
    );
  });

  it('removes a linked archived account external id from its bank link without removing the provider item', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-05T12:00:00Z'));
    const account = AccountEntity.fromDto(
      {
        ...mockCreateAccountDto,
        externalAccountId: 'external-archive-id',
        bankLinkId: 'bank-link-id',
      },
      mockUserId,
    );
    const bankLink = BankLinkEntity.fromDto(
      {
        providerName: 'plaid',
        authentication: { accessToken: 'test-token', itemId: 'item-id' },
        accountIds: ['external-keep-id', 'external-archive-id'],
      },
      mockUserId,
    );
    bankLink.id = 'bank-link-id';
    account.id = 'archive-id';
    account.bankLink = bankLink;
    mockRepository.findOne.mockResolvedValue(account);
    mockRepository.save.mockImplementation(async (entity) => entity);

    await service.archive('archive-id', mockUserId);

    expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bank-link-id',
        accountIds: ['external-keep-id'],
        authentication: { accessToken: 'test-token', itemId: 'item-id' },
      }),
    );
  });

  it('excludes archived accounts from default findAll and includes them when requested', async () => {
    const active = AccountEntity.fromDto(mockCreateAccountDto, mockUserId);
    active.id = 'active-id';
    const archived = AccountEntity.fromDto(
      {
        ...mockCreateAccountDto,
        name: 'Archived',
        type: AccountType.Depository,
      },
      mockUserId,
    );
    archived.id = 'archived-id';
    archived.archivedAt = new Date('2026-04-05T12:00:00Z');
    mockRepository.find.mockResolvedValue([active, archived]);

    await expect(service.findAll(mockUserId)).resolves.toHaveLength(1);
    await expect(
      service.findAll(mockUserId, { includeArchived: true }),
    ).resolves.toHaveLength(2);
  });

  it('returns null when archiving a missing account', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await expect(service.archive('missing-id', mockUserId)).resolves.toBeNull();
    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockSnapshotRepository.save).not.toHaveBeenCalled();
  });

  it('does not rewrite balances or snapshots for an already archived account', async () => {
    const account = AccountEntity.fromDto(mockCreateAccountDto, mockUserId);
    account.id = 'archived-id';
    account.archivedAt = new Date('2026-04-01T00:00:00Z');
    mockRepository.findOne.mockResolvedValue(account);

    const result = await service.archive('archived-id', mockUserId);

    expect(result?.archivedAt?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockSnapshotRepository.save).not.toHaveBeenCalled();
  });

  it('prunes the bank link for an already archived linked account', async () => {
    const account = AccountEntity.fromDto(
      {
        ...mockCreateAccountDto,
        externalAccountId: 'archived-external-id',
        bankLinkId: 'bank-link-id',
      },
      mockUserId,
    );
    const bankLink = BankLinkEntity.fromDto(
      {
        providerName: 'plaid',
        authentication: { accessToken: 'test-token', itemId: 'item-id' },
        accountIds: ['archived-external-id', 'remaining-external-id'],
      },
      mockUserId,
    );
    bankLink.id = 'bank-link-id';
    account.id = 'archived-id';
    account.archivedAt = new Date('2026-04-01T00:00:00Z');
    account.bankLink = bankLink;
    mockRepository.findOne.mockResolvedValue(account);

    const result = await service.archive('archived-id', mockUserId);

    expect(result?.archivedAt?.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(mockRepository.save).not.toHaveBeenCalled();
    expect(mockSnapshotRepository.save).not.toHaveBeenCalled();
    expect(mockBankLinkRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bank-link-id',
        accountIds: ['remaining-external-id'],
      }),
    );
  });
});
