import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import {
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionUpdatedEvent,
} from '../../src/events/transaction.events';
import { TransactionListener } from '../../src/transaction/transaction.listener';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { Transaction } from '../../src/types/Transaction';

describe('TransactionListener', () => {
  let listener: TransactionListener;

  const mockAccountRepository = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionListener,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
      ],
    }).compile();

    listener = module.get<TransactionListener>(TransactionListener);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleTransactionCreated', () => {
    const mockTransaction: Transaction = {
      id: 'txn-123',
      userId: 'user-123',
      accountId: 'account-123',
      amount: {
        money: { currency: 'USD', amount: 50000 }, // $500.00
        sign: MoneySign.CREDIT,
      },
      merchantName: 'Test Merchant',
      pending: false,
      externalTransactionId: null,
      logoUrl: null,
      date: '2024-01-15',
      datetime: null,
      authorizedDate: null,
      authorizedDatetime: null,
      categoryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should add credit amount to account balance and upsert snapshot', async () => {
      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionCreatedEvent(mockTransaction);
      await listener.handleTransactionCreated(event);

      // Verify the CTE query updates account and upserts snapshot
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          50000,
          'account-123',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), // snapshot date
          BalanceSnapshotType.USER_UPDATE,
        ],
      );

      // Verify the query contains both account update and snapshot insert
      const calls = mockAccountRepository.query.mock.calls as [
        string,
        unknown[],
      ][];
      const queryCall = calls[0][0];
      expect(queryCall).toContain('UPDATE account_entity');
      expect(queryCall).toContain('INSERT INTO balance_snapshot_entity');
      expect(queryCall).toContain('ON CONFLICT');
    });

    it('should subtract debit amount from account balance', async () => {
      const debitTransaction: Transaction = {
        ...mockTransaction,
        amount: {
          money: { currency: 'USD', amount: 25000 }, // $250.00
          sign: MoneySign.DEBIT,
        },
      };

      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionCreatedEvent(debitTransaction);
      await listener.handleTransactionCreated(event);

      // Debit should subtract (negative amount)
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          -25000,
          'account-123',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          BalanceSnapshotType.USER_UPDATE,
        ],
      );
    });

    it('should handle database errors gracefully', async () => {
      mockAccountRepository.query.mockRejectedValue(
        new Error('Database error'),
      );

      const event = new TransactionCreatedEvent(mockTransaction);

      // Should not throw
      await expect(
        listener.handleTransactionCreated(event),
      ).resolves.not.toThrow();
    });
  });

  describe('handleTransactionDeleted', () => {
    const mockTransaction: Transaction = {
      id: 'txn-123',
      userId: 'user-123',
      accountId: 'account-123',
      amount: {
        money: { currency: 'USD', amount: 50000 }, // $500.00
        sign: MoneySign.CREDIT,
      },
      merchantName: 'Test Merchant',
      pending: false,
      externalTransactionId: null,
      logoUrl: null,
      date: '2024-01-15',
      datetime: null,
      authorizedDate: null,
      authorizedDatetime: null,
      categoryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should reverse credit amount from account balance and update snapshots atomically', async () => {
      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionDeletedEvent(mockTransaction);
      await listener.handleTransactionDeleted(event);

      // Verify the atomic CTE query updates both account and snapshots
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          -50000,
          'account-123',
          '2024-01-15',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ],
      );

      // Verify the query contains both account update and snapshot update
      const calls = mockAccountRepository.query.mock.calls as [
        string,
        unknown[],
      ][];
      const queryCall = calls[0][0];
      expect(queryCall).toContain('UPDATE account_entity');
      expect(queryCall).toContain('UPDATE balance_snapshot_entity');
    });

    it('should reverse debit amount from account balance (add back)', async () => {
      const debitTransaction: Transaction = {
        ...mockTransaction,
        amount: {
          money: { currency: 'USD', amount: 25000 }, // $250.00
          sign: MoneySign.DEBIT,
        },
      };

      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionDeletedEvent(debitTransaction);
      await listener.handleTransactionDeleted(event);

      // Debit reversal should add back (positive amount)
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          25000,
          'account-123',
          '2024-01-15',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ],
      );
    });

    it('should handle database errors gracefully', async () => {
      mockAccountRepository.query.mockRejectedValue(
        new Error('Database error'),
      );

      const event = new TransactionDeletedEvent(mockTransaction);

      // Should not throw
      await expect(
        listener.handleTransactionDeleted(event),
      ).resolves.not.toThrow();
    });
  });

  describe('handleTransactionUpdated', () => {
    const baseTransaction: Transaction = {
      id: 'txn-123',
      userId: 'user-123',
      accountId: 'account-123',
      amount: {
        money: { currency: 'USD', amount: 50000 }, // $500.00
        sign: MoneySign.CREDIT,
      },
      merchantName: 'Test Merchant',
      pending: false,
      externalTransactionId: null,
      logoUrl: null,
      date: '2024-01-15',
      datetime: null,
      authorizedDate: null,
      authorizedDatetime: null,
      categoryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should apply positive difference when credit amount increases', async () => {
      const oldTransaction = { ...baseTransaction };
      const newTransaction = {
        ...baseTransaction,
        amount: {
          money: { currency: 'USD', amount: 75000 }, // $750.00
          sign: MoneySign.CREDIT,
        },
      };

      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionUpdatedEvent(oldTransaction, newTransaction);
      await listener.handleTransactionUpdated(event);

      // Difference: 75000 - 50000 = 25000
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          25000,
          'account-123',
          '2024-01-15',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ],
      );
    });

    it('should apply negative difference when credit amount decreases', async () => {
      const oldTransaction = { ...baseTransaction };
      const newTransaction = {
        ...baseTransaction,
        amount: {
          money: { currency: 'USD', amount: 30000 }, // $300.00
          sign: MoneySign.CREDIT,
        },
      };

      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionUpdatedEvent(oldTransaction, newTransaction);
      await listener.handleTransactionUpdated(event);

      // Difference: 30000 - 50000 = -20000
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          -20000,
          'account-123',
          '2024-01-15',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ],
      );
    });

    it('should handle sign change from credit to debit', async () => {
      const oldTransaction = { ...baseTransaction }; // Credit $500
      const newTransaction = {
        ...baseTransaction,
        amount: {
          money: { currency: 'USD', amount: 50000 }, // Debit $500
          sign: MoneySign.DEBIT,
        },
      };

      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionUpdatedEvent(oldTransaction, newTransaction);
      await listener.handleTransactionUpdated(event);

      // Old signed: +50000, New signed: -50000, Difference: -100000
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          -100000,
          'account-123',
          '2024-01-15',
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ],
      );
    });

    it('should skip update when amount difference is zero', async () => {
      const oldTransaction = { ...baseTransaction };
      const newTransaction = { ...baseTransaction }; // Same amount

      const event = new TransactionUpdatedEvent(oldTransaction, newTransaction);
      await listener.handleTransactionUpdated(event);

      // Should not call query when there's no difference
      expect(mockAccountRepository.query).not.toHaveBeenCalled();
    });

    it('should use earlier date when transaction date changes', async () => {
      const oldTransaction = { ...baseTransaction, date: '2024-01-20' };
      const newTransaction = {
        ...baseTransaction,
        date: '2024-01-15',
        amount: {
          money: { currency: 'USD', amount: 75000 },
          sign: MoneySign.CREDIT,
        },
      };

      mockAccountRepository.query.mockResolvedValue([]);

      const event = new TransactionUpdatedEvent(oldTransaction, newTransaction);
      await listener.handleTransactionUpdated(event);

      // Should use the earlier date (2024-01-15)
      expect(mockAccountRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH updated_account AS'),
        [
          25000,
          'account-123',
          '2024-01-15', // Earlier date
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ],
      );
    });

    it('should handle database errors gracefully', async () => {
      const oldTransaction = { ...baseTransaction };
      const newTransaction = {
        ...baseTransaction,
        amount: {
          money: { currency: 'USD', amount: 75000 },
          sign: MoneySign.CREDIT,
        },
      };

      mockAccountRepository.query.mockRejectedValue(
        new Error('Database error'),
      );

      const event = new TransactionUpdatedEvent(oldTransaction, newTransaction);

      // Should not throw
      await expect(
        listener.handleTransactionUpdated(event),
      ).resolves.not.toThrow();
    });
  });
});
