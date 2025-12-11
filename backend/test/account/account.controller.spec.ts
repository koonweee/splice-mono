import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountController } from '../../src/account/account.controller';
import { AccountService } from '../../src/account/account.service';
import { mockAccountService } from '../mocks/account/account-service.mock';
import {
  mockAccount,
  mockAccount2,
  mockCreateAccountDto,
} from '../mocks/account/account.mock';

describe('AccountController', () => {
  let controller: AccountController;
  let service: AccountService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
      ],
    }).compile();

    controller = module.get<AccountController>(AccountController);
    service = module.get<AccountService>(AccountService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return an array of accounts', async () => {
      const result = await controller.findAll(mockUser);

      expect(result).toEqual([mockAccount, mockAccount2]);
      expect(mockAccountService.findAll).toHaveBeenCalledWith(mockUser.userId);
    });

    it('should call accountService.findAll with userId', async () => {
      await controller.findAll(mockUser);

      expect(mockAccountService.findAll).toHaveBeenCalledTimes(1);
      expect(mockAccountService.findAll).toHaveBeenCalledWith(mockUser.userId);
    });
  });

  describe('create', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should create and return a new account', async () => {
      const result = await controller.create(mockUser, mockCreateAccountDto);

      expect(result).toEqual(mockAccount);
      expect(mockAccountService.create).toHaveBeenCalledWith(
        mockCreateAccountDto,
        mockUser.userId,
      );
    });

    it('should call accountService.create', async () => {
      await controller.create(mockUser, mockCreateAccountDto);

      expect(mockAccountService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return an account when valid ID is provided', async () => {
      const result = await controller.findOne('test-id-123', mockUser);

      expect(result).toEqual(mockAccount);
    });

    it('should throw NotFoundException when account is not found', async () => {
      mockAccountService.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(
        controller.findOne('non-existent-id', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.findOne('non-existent-id', mockUser),
      ).rejects.toThrow('Account with id non-existent-id not found');
    });

    it('should call accountService.findOne with correct ID and userId', async () => {
      await controller.findOne('test-id-123', mockUser);

      expect(mockAccountService.findOne).toHaveBeenCalledTimes(1);
      expect(mockAccountService.findOne).toHaveBeenCalledWith(
        'test-id-123',
        mockUser.userId,
      );
    });
  });

  describe('remove', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should delete an account when valid ID is provided', async () => {
      const removeSpy = jest.spyOn(service, 'remove').mockResolvedValue(true);
      await controller.remove('test-id-123', mockUser);

      expect(removeSpy).toHaveBeenCalledWith('test-id-123', mockUser.userId);
    });

    it('should throw NotFoundException when account is not found', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue(false);

      await expect(
        controller.remove('non-existent-id', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        controller.remove('non-existent-id', mockUser),
      ).rejects.toThrow('Account with id non-existent-id not found');
    });

    it('should call accountService.remove with correct ID and userId', async () => {
      const removeSpy = jest.spyOn(service, 'remove').mockResolvedValue(true);
      await controller.remove('test-id-123', mockUser);

      expect(removeSpy).toHaveBeenCalledTimes(1);
      expect(removeSpy).toHaveBeenCalledWith('test-id-123', mockUser.userId);
    });
  });
});
