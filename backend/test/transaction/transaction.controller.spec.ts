import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionController } from '../../src/transaction/transaction.controller';
import { TransactionService } from '../../src/transaction/transaction.service';
import { mockTransactionService } from '../mocks/transaction/transaction-service.mock';
import {
  mockAccountId,
  mockCreateManualTransactionDto,
  mockCreateTransactionDto,
  mockTransaction,
  mockTransaction2,
  mockUpdateTransactionDto,
} from '../mocks/transaction/transaction.mock';

const mockCurrencyConversionService = {
  getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
  getRateMap: jest.fn().mockResolvedValue(new Map()),
  convertAmount: jest.fn().mockImplementation((amount: number) => amount),
};

describe('TransactionController', () => {
  let controller: TransactionController;

  const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
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
    mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());
    mockCurrencyConversionService.convertAmount.mockImplementation(
      (amount: number) => amount,
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
    });
    expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
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
      },
    );
  });

  it('converts transaction amounts when requested', async () => {
    mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('EUR');
    mockCurrencyConversionService.getRateMap.mockResolvedValue(
      new Map([['USD', 2]]),
    );
    mockCurrencyConversionService.convertAmount.mockReturnValue(10000);

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
      money: { currency: 'EUR', amount: 10000 },
      sign: mockTransaction.amount.sign,
    });
  });

  it('converts manual transaction amounts from their account currency when requested', async () => {
    const manualEurTransaction = {
      ...mockTransaction,
      source: 'manual' as const,
      externalTransactionId: null,
      amount: {
        money: { currency: 'EUR', amount: 4500 },
        sign: mockTransaction.amount.sign,
      },
    };
    mockTransactionService.findAllPaginated.mockResolvedValueOnce({
      data: [manualEurTransaction],
      total: 1,
    });
    mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('USD');
    mockCurrencyConversionService.getRateMap.mockResolvedValue(
      new Map([['EUR', 1.2]]),
    );
    mockCurrencyConversionService.convertAmount.mockReturnValue(5400);

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

    expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
      ['EUR'],
      'USD',
      expect.any(String),
    );
    expect(mockCurrencyConversionService.convertAmount).toHaveBeenCalledWith(
      4500,
      'EUR',
      'USD',
      1.2,
    );
    expect(result.data[0]).toMatchObject({
      source: 'manual',
      convertedAmount: {
        money: { currency: 'USD', amount: 5400 },
        sign: mockTransaction.amount.sign,
      },
    });
  });

  it('delegates create, update, category update, undo, and delete flows', async () => {
    await expect(
      controller.create(mockUser, mockCreateTransactionDto),
    ).resolves.toBe(mockTransaction);
    await expect(
      controller.createManual(mockUser, mockCreateManualTransactionDto),
    ).resolves.toMatchObject({ source: 'manual' });
    await expect(
      controller.update(mockTransaction.id, mockUser, mockUpdateTransactionDto),
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
      controller.remove(mockTransaction.id, mockUser),
    ).resolves.toBeUndefined();
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
    expect(mockTransactionService.removeManual).toHaveBeenCalledWith(
      mockTransaction.id,
      mockUser.userId,
    );
  });

  it('throws NotFoundException when service returns null', async () => {
    mockTransactionService.findOne.mockResolvedValueOnce(null);
    mockTransactionService.updateCategory.mockResolvedValueOnce(null);
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
