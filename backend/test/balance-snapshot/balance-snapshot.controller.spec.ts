/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { AccountService } from '../../src/account/account.service';
import { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import { BalanceSnapshotController } from '../../src/balance-snapshot/balance-snapshot.controller';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { mockAccountService } from '../mocks/account/account-service.mock';
import { mockUserId } from '../mocks/balance-snapshot/balance-snapshot.mock';

describe('BalanceSnapshotController', () => {
  let controller: BalanceSnapshotController;
  let balanceSnapshotService: BalanceSnapshotService;
  let accountService: typeof mockAccountService;

  const mockUser: JwtUser = {
    userId: mockUserId,
    email: 'test@example.com',
  };

  const mockBalanceSnapshotService = {
    bulkUpsert: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BalanceSnapshotController],
      providers: [
        {
          provide: BalanceSnapshotService,
          useValue: mockBalanceSnapshotService,
        },
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    controller = module.get<BalanceSnapshotController>(
      BalanceSnapshotController,
    );
    balanceSnapshotService = module.get<BalanceSnapshotService>(
      BalanceSnapshotService,
    );
    accountService = module.get(AccountService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTemplate', () => {
    it('should generate CSV template with user accounts', async () => {
      const mockResponse = {
        set: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        pipe: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
      } as unknown as Response;

      await controller.getTemplate(mockUser, mockResponse);

      expect(accountService.findAll).toHaveBeenCalledWith(mockUserId);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv',
        }),
      );
    });
  });

  describe('importCsv', () => {
    it('should parse CSV and bulk upsert snapshots', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAccount = {
        id: validUuid,
        name: 'Test Account',
        type: 'depository',
        currentBalance: { money: { currency: 'USD' } },
      };
      accountService.findAll.mockResolvedValue([mockAccount]);

      // We need to use the ID from the mock in the CSV
      const csvWithValidId = `Account Name,Account UUID,Account Type,Currency,2025-01-01,2025-01-15
Test Account,${validUuid},depository,USD,100.00,-50.50
`;

      const validFile = {
        buffer: Buffer.from(csvWithValidId),
      } as Express.Multer.File;

      mockBalanceSnapshotService.bulkUpsert.mockResolvedValue(2);

      const result = await controller.importCsv(mockUser, validFile);

      expect(result).toEqual({ imported: 2 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(balanceSnapshotService.bulkUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: validUuid,
            snapshotDate: '2025-01-01',
            currentBalance: expect.objectContaining({
              money: expect.objectContaining({ amount: 10000 }), // 100.00 * 100
              sign: MoneySign.POSITIVE,
            }),
            snapshotType: BalanceSnapshotType.CSV_IMPORT,
          }),
          expect.objectContaining({
            accountId: validUuid,
            snapshotDate: '2025-01-15',
            currentBalance: expect.objectContaining({
              money: expect.objectContaining({ amount: 5050 }), // 50.50 * 100
              sign: MoneySign.NEGATIVE,
            }),
            snapshotType: BalanceSnapshotType.CSV_IMPORT,
          }),
        ]),
        mockUserId,
      );
    });

    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        controller.importCsv(mockUser, undefined as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for currency mismatch', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAccount = {
        id: validUuid,
        name: 'Test Account',
        type: 'depository',
        currentBalance: { money: { currency: 'USD' } },
      };
      accountService.findAll.mockResolvedValue([mockAccount]);

      const csvContent = `Account Name,Account UUID,Account Type,Currency,2025-01-01
Test Account,${validUuid},depository,EUR,100.00
`;
      const file = { buffer: Buffer.from(csvContent) } as Express.Multer.File;

      await expect(controller.importCsv(mockUser, file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should skip example row', async () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const mockAccount = {
        id: validUuid,
        name: 'Test Account',
        type: 'depository',
        currentBalance: { money: { currency: 'USD' } },
      };
      accountService.findAll.mockResolvedValue([mockAccount]);

      const csvContent = `Account Name,Account UUID,Account Type,Currency,2025-01-01
Example,uuid-placeholder,depository,USD,100.00
Test Account,${validUuid},depository,USD,100.00
`;
      const file = { buffer: Buffer.from(csvContent) } as Express.Multer.File;

      mockBalanceSnapshotService.bulkUpsert.mockResolvedValue(1);

      const result = await controller.importCsv(mockUser, file);

      expect(result.imported).toBe(1);
      // Verify that only the valid row was processed
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(balanceSnapshotService.bulkUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: validUuid,
          }),
        ]),
        mockUserId,
      );
      // Ensure the array length is 1
      const calledArgs =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (balanceSnapshotService.bulkUpsert as jest.Mock).mock.calls[0][0];
      expect(calledArgs).toHaveLength(1);
    });
  });
});
