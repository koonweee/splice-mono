import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionController } from '../../src/transaction/transaction.controller';
import { TransactionService } from '../../src/transaction/transaction.service';
import { mockTransactionService } from '../mocks/transaction/transaction-service.mock';
import {
  mockAccountId,
  mockCreateTransactionDto,
  mockTransaction,
  mockTransaction2,
  mockUpdateTransactionDto,
} from '../mocks/transaction/transaction.mock';

const mockCurrencyConversionService = {
  getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
  getRateMap: jest.fn().mockResolvedValue(new Map()),
  convertAmount: jest.fn().mockReturnValue(0),
};

describe('TransactionController', () => {
  let controller: TransactionController;
  let service: TransactionService;

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
    service = module.get<TransactionService>(TransactionService);

    // Reset mocks before each test
    jest.clearAllMocks();
    mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue('USD');
    mockCurrencyConversionService.getRateMap.mockResolvedValue(new Map());
    mockCurrencyConversionService.convertAmount.mockImplementation(
      (amount: number) => amount,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return paginated transactions with default params', async () => {
      const result = await controller.findAll(mockUser);

      expect(result).toEqual({
        data: [mockTransaction, mockTransaction2],
        total: 2,
        pageIndex: 0,
        pageSize: 20,
      });
      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 20,
          sortBy: undefined,
          sortOrder: 'DESC',
          accountId: undefined,
        }),
      );
    });

    it('should pass custom pagination params', async () => {
      await controller.findAll(mockUser, '2', '10', 'merchantName', 'ASC');

      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({
          pageIndex: 2,
          pageSize: 10,
          sortBy: 'merchantName',
          sortOrder: 'ASC',
          accountId: undefined,
        }),
      );
    });

    it('should filter by accountId when provided', async () => {
      await controller.findAll(
        mockUser,
        '0',
        '20',
        undefined,
        undefined,
        mockAccountId,
      );

      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({
          pageIndex: 0,
          pageSize: 20,
          sortBy: undefined,
          sortOrder: 'DESC',
          accountId: mockAccountId,
        }),
      );
    });

    it('should clamp pageSize to max 100', async () => {
      await controller.findAll(mockUser, '0', '500');

      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({ pageSize: 100 }),
      );
    });

    it('should default invalid pageIndex to 0', async () => {
      await controller.findAll(mockUser, 'abc');

      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({ pageIndex: 0 }),
      );
    });

    it('should pass category review status when valid', async () => {
      await controller.findAll(
        mockUser,
        '0',
        '20',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'true',
        'needs_review',
      );

      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({
          categoryReviewStatus: 'needs_review',
        }),
      );
    });
  });

  describe('getSummary', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return preferred-currency transaction summary totals', async () => {
      const result = await controller.getSummary(mockUser);

      expect(result).toEqual({
        currency: 'USD',
        inflow: {
          money: { currency: 'USD', amount: 0 },
          sign: 'positive',
        },
        outflow: {
          money: { currency: 'USD', amount: 7500 },
          sign: 'negative',
        },
        net: {
          money: { currency: 'USD', amount: 7500 },
          sign: 'negative',
        },
        transactionCount: 2,
        pendingCount: 1,
        needsReviewCount: 2,
      });
      expect(mockTransactionService.getSummary).toHaveBeenCalledWith(
        mockUser.userId,
        expect.objectContaining({
          accountId: undefined,
          startDate: undefined,
          endDate: undefined,
          categoryPrimary: undefined,
          amountSign: undefined,
          categoryReviewStatus: undefined,
        }),
      );
    });

    it('should pass valid summary filters and ignore invalid review status', async () => {
      await controller.getSummary(
        mockUser,
        mockAccountId,
        '2026-05-01',
        '2026-05-07',
        'FOOD_AND_DRINK',
        'negative',
        'true',
        'ignored',
      );

      expect(mockTransactionService.getSummary).toHaveBeenCalledWith(
        mockUser.userId,
        {
          accountId: mockAccountId,
          startDate: '2026-05-01',
          endDate: '2026-05-07',
          categoryPrimary: 'FOOD_AND_DRINK',
          amountSign: 'negative',
          categoryReviewStatus: undefined,
        },
      );
    });

    it('should convert foreign summary buckets into preferred currency', async () => {
      mockTransactionService.getSummary.mockResolvedValueOnce({
        buckets: [
          { currency: 'USD', inflowAmount: 10000, outflowAmount: 2500 },
          { currency: 'EUR', inflowAmount: 5000, outflowAmount: 1000 },
        ],
        transactionCount: 4,
        pendingCount: 1,
        needsReviewCount: 2,
      });
      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.1]]),
      );
      mockCurrencyConversionService.convertAmount.mockImplementation(
        (
          amount: number,
          sourceCurrency: string,
          _targetCurrency: string,
          rate: number,
        ) => (sourceCurrency === 'USD' ? amount : Math.round(amount * rate)),
      );

      const result = await controller.getSummary(mockUser);

      expect(result).toEqual(
        expect.objectContaining({
          inflow: {
            money: { currency: 'USD', amount: 15500 },
            sign: 'positive',
          },
          outflow: {
            money: { currency: 'USD', amount: 3600 },
            sign: 'negative',
          },
          net: {
            money: { currency: 'USD', amount: 11900 },
            sign: 'positive',
          },
        }),
      );
      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        ['EUR'],
        'USD',
        expect.any(String),
      );
    });
  });

  describe('create', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should create and return a new transaction', async () => {
      const result = await controller.create(
        mockUser,
        mockCreateTransactionDto,
      );

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionService.create).toHaveBeenCalledWith(
        mockCreateTransactionDto,
        mockUser.userId,
      );
    });

    it('should call transactionService.create with correct data', async () => {
      await controller.create(mockUser, mockCreateTransactionDto);

      expect(mockTransactionService.create).toHaveBeenCalledTimes(1);
      expect(mockTransactionService.create).toHaveBeenCalledWith(
        mockCreateTransactionDto,
        mockUser.userId,
      );
    });
  });

  describe('findOne', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return a transaction when valid ID is provided', async () => {
      mockTransactionService.findOne.mockResolvedValue(mockTransaction);
      const result = await controller.findOne('transaction-uuid-123', mockUser);

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionService.findOne).toHaveBeenCalledWith(
        'transaction-uuid-123',
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when transaction is not found', async () => {
      mockTransactionService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne('non-existent-id', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.findOne('non-existent-id', mockUser),
      ).rejects.toThrow('Transaction with id non-existent-id not found');
    });

    it('should call transactionService.findOne with correct ID and userId', async () => {
      mockTransactionService.findOne.mockResolvedValue(mockTransaction);
      await controller.findOne('transaction-uuid-123', mockUser);

      expect(mockTransactionService.findOne).toHaveBeenCalledTimes(1);
      expect(mockTransactionService.findOne).toHaveBeenCalledWith(
        'transaction-uuid-123',
        mockUser.userId,
      );
    });
  });

  describe('update', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should update and return a transaction', async () => {
      mockTransactionService.update.mockResolvedValue(mockTransaction);
      const result = await controller.update(
        'transaction-uuid-123',
        mockUser,
        mockUpdateTransactionDto,
      );

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionService.update).toHaveBeenCalledWith(
        'transaction-uuid-123',
        mockUpdateTransactionDto,
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when transaction is not found', async () => {
      mockTransactionService.update.mockResolvedValue(null);

      await expect(
        controller.update(
          'non-existent-id',
          mockUser,
          mockUpdateTransactionDto,
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.update(
          'non-existent-id',
          mockUser,
          mockUpdateTransactionDto,
        ),
      ).rejects.toThrow('Transaction with id non-existent-id not found');
    });

    it('should call transactionService.update with correct data', async () => {
      mockTransactionService.update.mockResolvedValue(mockTransaction);
      await controller.update(
        'transaction-uuid-123',
        mockUser,
        mockUpdateTransactionDto,
      );

      expect(mockTransactionService.update).toHaveBeenCalledTimes(1);
      expect(mockTransactionService.update).toHaveBeenCalledWith(
        'transaction-uuid-123',
        mockUpdateTransactionDto,
        mockUser.userId,
      );
    });
  });

  describe('updateCategory', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should update category override and return a transaction', async () => {
      mockTransactionService.updateCategory.mockResolvedValue(mockTransaction);

      const result = await controller.updateCategory(
        'transaction-uuid-123',
        mockUser,
        { categoryId: 'category-uuid-123' },
      );

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionService.updateCategory).toHaveBeenCalledWith(
        'transaction-uuid-123',
        { categoryId: 'category-uuid-123' },
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when transaction or category is not found', async () => {
      mockTransactionService.updateCategory.mockResolvedValue(null);

      await expect(
        controller.updateCategory('non-existent-id', mockUser, {
          categoryId: 'category-uuid-123',
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.updateCategory('non-existent-id', mockUser, {
          categoryId: 'category-uuid-123',
        }),
      ).rejects.toThrow(
        'Transaction or category for transaction non-existent-id not found',
      );
    });
  });

  describe('updateCategoryReview', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should update category review and return a transaction', async () => {
      mockTransactionService.updateCategoryReview.mockResolvedValue(
        mockTransaction,
      );

      const result = await controller.updateCategoryReview(
        'transaction-uuid-123',
        mockUser,
        { reviewed: true },
      );

      expect(result).toEqual(mockTransaction);
      expect(mockTransactionService.updateCategoryReview).toHaveBeenCalledWith(
        'transaction-uuid-123',
        { reviewed: true },
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when transaction is not found', async () => {
      mockTransactionService.updateCategoryReview.mockResolvedValue(null);

      await expect(
        controller.updateCategoryReview('non-existent-id', mockUser, {
          reviewed: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulk category review', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should bulk review categories', async () => {
      const result = await controller.bulkReviewCategories(mockUser, {
        filters: { categoryReviewStatus: 'needs_review' },
      });

      expect(result).toEqual({
        count: 1,
        transactionIds: [mockTransaction.id],
      });
      expect(mockTransactionService.bulkReviewCategories).toHaveBeenCalledWith(
        mockUser.userId,
        { filters: { categoryReviewStatus: 'needs_review' } },
      );
    });

    it('should undo bulk review categories', async () => {
      const result = await controller.undoBulkReviewCategories(mockUser, {
        transactionIds: [mockTransaction.id],
      });

      expect(result).toEqual({
        count: 1,
        transactionIds: [mockTransaction.id],
      });
      expect(
        mockTransactionService.undoBulkReviewCategories,
      ).toHaveBeenCalledWith(mockUser.userId, {
        transactionIds: [mockTransaction.id],
      });
    });
  });

  describe('remove', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should delete a transaction when valid ID is provided', async () => {
      const removeSpy = jest.spyOn(service, 'remove').mockResolvedValue(true);
      await controller.remove('transaction-uuid-123', mockUser);

      expect(removeSpy).toHaveBeenCalledWith(
        'transaction-uuid-123',
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when transaction is not found', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue(false);

      await expect(
        controller.remove('non-existent-id', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.remove('non-existent-id', mockUser),
      ).rejects.toThrow('Transaction with id non-existent-id not found');
    });

    it('should call transactionService.remove with correct ID and userId', async () => {
      const removeSpy = jest.spyOn(service, 'remove').mockResolvedValue(true);
      await controller.remove('transaction-uuid-123', mockUser);

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith(
        'transaction-uuid-123',
        mockUser.userId,
      );
    });
  });
});
