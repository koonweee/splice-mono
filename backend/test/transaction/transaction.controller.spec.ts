import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

    it('should return an array of transactions', async () => {
      const result = await controller.findAll(mockUser);

      expect(result).toEqual([mockTransaction, mockTransaction2]);
      expect(mockTransactionService.findAll).toHaveBeenCalledWith(
        mockUser.userId,
      );
    });

    it('should call transactionService.findAll with userId', async () => {
      await controller.findAll(mockUser);

      expect(mockTransactionService.findAll).toHaveBeenCalledTimes(1);
      expect(mockTransactionService.findAll).toHaveBeenCalledWith(
        mockUser.userId,
      );
    });

    it('should filter by accountId when provided', async () => {
      const result = await controller.findAll(mockUser, mockAccountId);

      expect(result).toEqual([mockTransaction, mockTransaction2]);
      expect(mockTransactionService.findByAccountId).toHaveBeenCalledWith(
        mockAccountId,
        mockUser.userId,
      );
      expect(mockTransactionService.findAll).not.toHaveBeenCalled();
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
