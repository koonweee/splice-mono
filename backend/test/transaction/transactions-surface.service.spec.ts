import { Test, TestingModule } from '@nestjs/testing';
import type { TransactionSurfaceSearchOptions } from '../../src/transaction/transaction-surface.types';
import { TransactionsSurfaceService } from '../../src/transaction/transactions-surface.service';
import { TransactionService } from '../../src/transaction/transaction.service';

describe('TransactionsSurfaceService', () => {
  let service: TransactionsSurfaceService;
  let mockTransactionService: {
    searchForSurface: jest.Mock;
  };

  beforeEach(async () => {
    mockTransactionService = {
      searchForSurface: jest.fn().mockResolvedValue({
        matchedCount: 2,
        truncated: false,
        transactions: [
          {
            id: 'txn-1',
            accountId: 'account-1',
            accountName: 'Checking',
            merchantName: 'Starbucks Reserve',
            pending: false,
            date: '2024-01-10',
            categoryPrimary: 'FOOD_AND_DRINK',
            amount: {
              money: { amount: 1250, currency: 'USD' },
              sign: 'negative',
            },
          },
          {
            id: 'txn-2',
            accountId: 'account-1',
            accountName: 'Checking',
            merchantName: 'Blue Bottle',
            pending: false,
            date: '2024-01-11',
            categoryPrimary: null,
            amount: {
              money: { amount: 500, currency: 'USD' },
              sign: 'negative',
            },
          },
        ],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsSurfaceService,
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
      ],
    }).compile();

    service = module.get<TransactionsSurfaceService>(
      TransactionsSurfaceService,
    );
  });

  it('adds user-facing category labels to transaction surface rows', async () => {
    const result = await service.searchTransactions('user-1', {
      limit: 10,
      merchantQuery: '',
    });

    expect(result).toMatchObject({
      matchedCount: 2,
      truncated: false,
      transactions: [
        expect.objectContaining({
          id: 'txn-1',
          categoryPrimary: 'FOOD_AND_DRINK',
          categoryPrimaryLabel: 'Food And Drink',
        }),
        expect.objectContaining({
          id: 'txn-2',
          categoryPrimary: null,
          categoryPrimaryLabel: 'Uncategorized',
        }),
      ],
    });
  });

  it('preserves merchantQuery semantics from the underlying transaction search', async () => {
    mockTransactionService.searchForSurface.mockImplementation(
      (_: string, options: TransactionSurfaceSearchOptions) =>
        Promise.resolve({
          matchedCount: 1,
          truncated: false,
          transactions: [
            {
              id: 'txn-1',
              accountId: 'account-1',
              accountName: 'Checking',
              merchantName: 'Starbucks Reserve',
              pending: false,
              date: '2024-01-10',
              categoryPrimary: 'FOOD_AND_DRINK',
              amount: {
                money: { amount: 1250, currency: 'USD' },
                sign: 'negative',
              },
            },
          ].filter((transaction) =>
            transaction.merchantName
              ?.toLowerCase()
              .includes(options.merchantQuery?.trim().toLowerCase() ?? ''),
          ),
        }),
    );

    const result = await service.searchTransactions('user-1', {
      limit: 10,
      merchantQuery: ' star ',
    });

    expect(mockTransactionService.searchForSurface).toHaveBeenCalledWith(
      'user-1',
      {
        limit: 10,
        merchantQuery: ' star ',
      },
    );
    expect(result.matchedCount).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toEqual(
      expect.objectContaining({
        id: 'txn-1',
        categoryPrimaryLabel: 'Food And Drink',
      }),
    );
  });
});
