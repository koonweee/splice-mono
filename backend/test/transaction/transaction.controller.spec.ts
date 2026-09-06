import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { TransactionController } from '../../src/transaction/transaction.controller';
import { TransactionService } from '../../src/transaction/transaction.service';
import { mockTransactionService } from '../mocks/transaction/transaction-service.mock';
import {
  mockAccountId,
  mockCreateManualTransactionDto,
  mockTransaction,
  mockTransaction2,
} from '../mocks/transaction/transaction.mock';

const mockCurrencyConversionService = {
  getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
  getResolvedRates: jest.fn().mockResolvedValue(new Map()),
  convertAmount: jest.fn().mockImplementation((amount: string) => amount),
};

let snapshotActive = false;
const snapshotManager = { getRepository: jest.fn() };
const mockTransactionQueries = {
  withReadSnapshot: jest.fn(async (reader) => {
    snapshotActive = true;
    try {
      return await reader(snapshotManager);
    } finally {
      snapshotActive = false;
    }
  }),
  readPage: jest.fn(async (userId, options, manager) => {
    expect(manager).toBe(snapshotManager);
    expect(snapshotActive).toBe(true);
    const page = await mockTransactionService.findPage(userId, options);
    return {
      ...page,
      entities: page.data.map((transaction) => ({
        ...transaction,
        amount: {
          amount: transaction.amount.money.amount,
          currency: transaction.amount.money.currency,
          sign: transaction.amount.sign,
        },
        toObject: () => {
          expect(snapshotActive).toBe(false);
          return transaction;
        },
      })),
    };
  }),
};

describe('TransactionController', () => {
  let controller: TransactionController;

  const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: TransactionQueryService, useValue: mockTransactionQueries },
        {
          provide: TransactionService,
          useValue: mockTransactionService,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    jest.clearAllMocks();
    mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('USD');
    mockCurrencyConversionService.getResolvedRates.mockResolvedValue(new Map());
    mockCurrencyConversionService.convertAmount.mockImplementation(
      (amount: string) => {
        expect(snapshotActive).toBe(false);
        return amount;
      },
    );
  });

  it('returns paginated transactions with category filters and no review status', async () => {
    const result = await controller.findAll(
      mockUser,
      '2',
      '10',
      'merchantName',
      'ASC',
      mockAccountId,
      '2026-05-01',
      '2026-05-07',
      'UNCATEGORIZED',
      'negative',
    );

    expect(result).toEqual({
      data: [mockTransaction, mockTransaction2],
      total: 2,
      pageIndex: 2,
      pageSize: 10,
      nextCursor: null,
      hasMore: false,
    });
    expect(mockTransactionService.findPage).toHaveBeenCalledWith(
      mockUser.userId,
      {
        pageIndex: 2,
        pageSize: 10,
        sortBy: 'merchantName',
        sortOrder: 'ASC',
        accountId: mockAccountId,
        startDate: '2026-05-01',
        endDate: '2026-05-07',
        categoryId: undefined,
        categoryPrimary: 'UNCATEGORIZED',
        amountSign: 'negative',
        cursor: undefined,
        includeTotal: undefined,
      },
    );
  });

  it('converts transaction amounts when requested', async () => {
    mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('EUR');
    mockCurrencyConversionService.getResolvedRates.mockResolvedValue(
      new Map([
        ['USD:EUR:2024-01-14', { ratio: { numerator: '2', denominator: '1' } }],
        ['USD:EUR:2024-01-16', { ratio: { numerator: '2', denominator: '1' } }],
      ]),
    );
    mockCurrencyConversionService.convertAmount.mockReturnValue('10000');

    const result = await controller.findAll(
      mockUser,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
    );

    expect(result.data[0].convertedAmount).toEqual({
      money: { currency: 'EUR', amount: '10000' },
      sign: mockTransaction.amount.sign,
    });
  });

  it('converts manual transaction amounts from their account currency when requested', async () => {
    const manualEurTransaction = {
      ...mockTransaction,
      source: 'manual' as const,
      externalTransactionId: null,
      amount: {
        money: { currency: 'EUR', amount: '4500' },
        sign: mockTransaction.amount.sign,
      },
    };
    mockTransactionService.findPage.mockResolvedValueOnce({
      data: [manualEurTransaction],
      total: 1,
    });
    mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('USD');
    mockCurrencyConversionService.getResolvedRates.mockResolvedValue(
      new Map([
        ['EUR:USD:2024-01-14', { ratio: { numerator: '6', denominator: '5' } }],
      ]),
    );
    mockCurrencyConversionService.convertAmount.mockReturnValue('5400');

    const result = await controller.findAll(
      mockUser,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
    );

    expect(mockCurrencyConversionService.getResolvedRates).toHaveBeenCalledWith(
      [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          requestedDate: '2024-01-14',
        },
      ],
      snapshotManager,
    );
    expect(mockCurrencyConversionService.convertAmount).toHaveBeenCalledWith(
      '4500',
      'EUR',
      'USD',
      { numerator: '6', denominator: '5' },
    );
    expect(result.data[0]).toMatchObject({
      source: 'manual',
      convertedAmount: {
        money: { currency: 'USD', amount: '5400' },
        sign: mockTransaction.amount.sign,
      },
    });
  });

  it('converts a foreign zero without requiring an exchange rate', async () => {
    mockTransactionService.findPage.mockResolvedValueOnce({
      data: [
        {
          ...mockTransaction,
          amount: {
            money: { amount: '0', currency: 'EUR' },
            sign: mockTransaction.amount.sign,
          },
        },
      ],
      total: 1,
      nextCursor: null,
      hasMore: false,
    });
    mockCurrencyConversionService.getResolvedRates.mockResolvedValueOnce(
      new Map(),
    );
    const result = await controller.findAll(
      mockUser,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
    );
    expect(mockCurrencyConversionService.getResolvedRates).toHaveBeenCalledWith(
      [],
      snapshotManager,
    );
    expect(result.data[0].convertedAmount?.money).toEqual({
      amount: '0',
      currency: 'USD',
    });
  });

  it('delegates manual, reporting-date, category, undo, and delete flows', async () => {
    await expect(
      controller.createManual(mockUser, mockCreateManualTransactionDto),
    ).resolves.toMatchObject({ source: 'manual' });
    await expect(
      controller.update(mockTransaction.id, mockUser, {
        reportingDateOverride: '2026-08-15',
      }),
    ).resolves.toBe(mockTransaction);
    await expect(
      controller.updateManual(
        mockTransaction.id,
        mockUser,
        mockCreateManualTransactionDto,
      ),
    ).resolves.toMatchObject({ source: 'manual' });
    await expect(
      controller.updateCategory(mockTransaction.id, mockUser, {
        categoryId: null,
      }),
    ).resolves.toBe(mockTransaction);
    await expect(
      controller.bulkUpdateCategories(mockUser, {
        transactionIds: [mockTransaction.id],
        categoryId: null,
      }),
    ).resolves.toMatchObject({ count: 1 });
    await expect(
      controller.undoBulkUpdateCategories(mockUser, { undo: 'undo-token' }),
    ).resolves.toMatchObject({ count: 1 });
    await expect(
      controller.removeManual(mockTransaction.id, mockUser),
    ).resolves.toBeUndefined();

    expect(mockTransactionService.createManual).toHaveBeenCalledWith(
      mockUser.userId,
      mockCreateManualTransactionDto,
    );
    expect(mockTransactionService.updateManual).toHaveBeenCalledWith(
      mockTransaction.id,
      mockUser.userId,
      mockCreateManualTransactionDto,
    );
    expect(mockTransactionService.updateReportingDate).toHaveBeenCalledWith(
      mockTransaction.id,
      { reportingDateOverride: '2026-08-15' },
      mockUser.userId,
    );
    expect(mockTransactionService.removeManual).toHaveBeenCalledWith(
      mockTransaction.id,
      mockUser.userId,
    );
  });

  it('throws NotFoundException when service returns null', async () => {
    mockTransactionService.findOne.mockResolvedValueOnce(null);
    mockTransactionService.updateCategory.mockResolvedValueOnce(null);
    mockTransactionService.updateReportingDate.mockResolvedValueOnce(null);
    mockTransactionService.createManual.mockResolvedValueOnce(null);
    mockTransactionService.updateManual.mockResolvedValueOnce(null);
    mockTransactionService.removeManual.mockResolvedValueOnce(false);

    await expect(
      controller.findOne(mockTransaction.id, mockUser),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.updateCategory(mockTransaction.id, mockUser, {
        categoryId: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.update(mockTransaction.id, mockUser, {
        reportingDateOverride: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.createManual(mockUser, mockCreateManualTransactionDto),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.updateManual(
        mockTransaction.id,
        mockUser,
        mockCreateManualTransactionDto,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.removeManual(mockTransaction.id, mockUser),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
