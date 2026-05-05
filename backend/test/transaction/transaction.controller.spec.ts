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
        {
          pageIndex: 0,
          pageSize: 20,
          sortBy: undefined,
          sortOrder: 'DESC',
          accountId: undefined,
        },
      );
    });

    it('should pass custom pagination params', async () => {
      await controller.findAll(mockUser, '2', '10', 'merchantName', 'ASC');

      expect(mockTransactionService.findAllPaginated).toHaveBeenCalledWith(
        mockUser.userId,
        {
          pageIndex: 2,
          pageSize: 10,
          sortBy: 'merchantName',
          sortOrder: 'ASC',
          accountId: undefined,
        },
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
        {
          pageIndex: 0,
          pageSize: 20,
          sortBy: undefined,
          sortOrder: 'DESC',
          accountId: mockAccountId,
        },
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
