import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../../src/auth/decorators/public.decorator';
import type { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import { InvestmentController } from '../../src/investment/investment.controller';
import { InvestmentService } from '../../src/investment/investment.service';

const userId = '11111111-1111-1111-1111-111111111111';
const accountId = '22222222-2222-2222-2222-222222222222';
const currentUser: JwtUser = {
  userId,
  email: 'test@example.com',
};

const holdingsResponse = {
  accountId,
  snapshotDate: '2026-05-20',
  holdings: [],
};

describe('InvestmentController', () => {
  let controller: InvestmentController;
  const investmentService = {
    findLatestHoldingsForAccount: jest.fn(),
    findHoldingsForAccountOnDate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    investmentService.findLatestHoldingsForAccount.mockResolvedValue(
      holdingsResponse,
    );
    investmentService.findHoldingsForAccountOnDate.mockResolvedValue(
      holdingsResponse,
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestmentController],
      providers: [
        {
          provide: InvestmentService,
          useValue: investmentService,
        },
      ],
    }).compile();

    controller = module.get(InvestmentController);
  });

  it('gets latest holdings for the current user account', async () => {
    const result = await controller.findLatestHoldingsForAccount(
      currentUser,
      accountId,
    );

    expect(investmentService.findLatestHoldingsForAccount).toHaveBeenCalledWith(
      userId,
      accountId,
    );
    expect(result).toEqual(holdingsResponse);
  });

  it('gets date-specific holdings for the current user account', async () => {
    const result = await controller.findHoldingsForAccountOnDate(
      currentUser,
      accountId,
      { snapshotDate: '2026-05-20' },
    );

    expect(investmentService.findHoldingsForAccountOnDate).toHaveBeenCalledWith(
      userId,
      accountId,
      '2026-05-20',
    );
    expect(result).toEqual(holdingsResponse);
  });

  it('propagates cross-user account access denial from the service', async () => {
    investmentService.findLatestHoldingsForAccount.mockRejectedValueOnce(
      new NotFoundException(`Account with id ${accountId} not found`),
    );

    await expect(
      controller.findLatestHoldingsForAccount(currentUser, accountId),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires authenticated access for holdings routes', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        InvestmentController.prototype.findLatestHoldingsForAccount,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        InvestmentController.prototype.findHoldingsForAccountOnDate,
      ),
    ).toBeUndefined();
  });
});
