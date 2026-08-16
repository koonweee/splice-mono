import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../../src/auth/decorators/public.decorator';
import type { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import { InvestmentController } from '../../src/investment/investment.controller';
import { InvestmentService } from '../../src/investment/investment.service';
import { ManualBrokerageService } from '../../src/investment/manual-brokerage.service';
import { MarketPriceService } from '../../src/market-price/market-price.service';
import {
  CreateManualBrokerageAccountDtoSchema,
  ReplaceManualBrokerageHoldingsDtoSchema,
} from '../../src/types/Investment';
import { MarketSecuritySearchQuerySchema } from '../../src/types/MarketPrice';
import { ZodValidationPipe } from '../../src/zod-validation/zod-validation.pipe';

const userId = '11111111-1111-1111-1111-111111111111';
const accountId = '22222222-2222-2222-2222-222222222222';
const currentUser: JwtUser = {
  userId,
  email: 'test@example.com',
};

const holdingsResponse = {
  accountId,
  snapshotDate: '2026-05-20',
  accountCurrency: null,
  accountValue: null,
  holdings: [],
};

const activityResponse = {
  data: [],
  total: 0,
  pageIndex: 0,
  pageSize: 20,
};

describe('InvestmentController', () => {
  let controller: InvestmentController;
  const investmentService = {
    findLatestHoldingsForAccount: jest.fn(),
    findHoldingsForAccountOnDate: jest.fn(),
    findActivityForAccount: jest.fn(),
    findActivity: jest.fn(),
  };
  const manualBrokerageService = {
    createManualBrokerageAccount: jest.fn(),
    replaceManualBrokerageHoldings: jest.fn(),
    refreshManualBrokeragePrices: jest.fn(),
  };
  const marketPriceService = { search: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    investmentService.findLatestHoldingsForAccount.mockResolvedValue(
      holdingsResponse,
    );
    investmentService.findHoldingsForAccountOnDate.mockResolvedValue(
      holdingsResponse,
    );
    investmentService.findActivityForAccount.mockResolvedValue(
      activityResponse,
    );
    investmentService.findActivity.mockResolvedValue(activityResponse);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvestmentController],
      providers: [
        {
          provide: InvestmentService,
          useValue: investmentService,
        },
        {
          provide: ManualBrokerageService,
          useValue: manualBrokerageService,
        },
        {
          provide: MarketPriceService,
          useValue: marketPriceService,
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

  it('searches securities with the validated query', async () => {
    const searchResults = [
      {
        symbol: 'C6L.SI',
        name: 'Singapore Airlines Limited',
        quoteType: 'EQUITY',
        exchangeCode: 'SES',
        exchangeName: 'SES',
        currency: 'SGD',
        marketIdentifierCode: 'XSES',
      },
    ];
    marketPriceService.search.mockResolvedValueOnce(searchResults);

    await expect(
      controller.searchSecurities({ query: 'sia', limit: 10 }),
    ).resolves.toEqual(searchResults);
    expect(marketPriceService.search).toHaveBeenCalledWith('sia', 10);
  });

  it('delegates manual brokerage create, replace, and refresh operations', async () => {
    const portfolioResponse = { staleSymbols: [] };
    manualBrokerageService.createManualBrokerageAccount.mockResolvedValueOnce(
      portfolioResponse,
    );
    manualBrokerageService.replaceManualBrokerageHoldings.mockResolvedValueOnce(
      portfolioResponse,
    );
    manualBrokerageService.refreshManualBrokeragePrices.mockResolvedValueOnce(
      portfolioResponse,
    );
    const createDto = {
      name: 'Prime Account',
      accountCurrency: 'USD',
      positions: [{ symbol: 'AAPL', quantity: '2' }],
    };
    const replaceDto = { positions: [] };

    await controller.createManualBrokerageAccount(currentUser, createDto);
    await controller.replaceManualBrokerageHoldings(
      currentUser,
      accountId,
      replaceDto,
    );
    await controller.refreshManualBrokeragePrices(currentUser, accountId);

    expect(
      manualBrokerageService.createManualBrokerageAccount,
    ).toHaveBeenCalledWith(createDto, userId);
    expect(
      manualBrokerageService.replaceManualBrokerageHoldings,
    ).toHaveBeenCalledWith(accountId, replaceDto, userId);
    expect(
      manualBrokerageService.refreshManualBrokeragePrices,
    ).toHaveBeenCalledWith(accountId, userId);
  });

  it('rejects invalid search and manual brokerage request payloads', () => {
    expect(() =>
      new ZodValidationPipe(MarketSecuritySearchQuerySchema).transform({
        query: 'x',
        limit: 100,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      new ZodValidationPipe(CreateManualBrokerageAccountDtoSchema).transform({
        name: 'Empty brokerage',
        accountCurrency: 'USD',
        positions: [],
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      new ZodValidationPipe(ReplaceManualBrokerageHoldingsDtoSchema).transform({
        positions: [{ symbol: 'AAPL', quantity: '-1' }],
      }),
    ).toThrow(BadRequestException);
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

  it('gets investment activity for the current user account with filters and pagination', async () => {
    const query = {
      startDate: '2026-05-01',
      endDate: '2026-05-20',
      type: 'buy',
      subtype: 'buy',
      pageIndex: 1,
      pageSize: 10,
    };

    const result = await controller.findActivityForAccount(
      currentUser,
      accountId,
      query,
    );

    expect(investmentService.findActivityForAccount).toHaveBeenCalledWith(
      userId,
      accountId,
      query,
    );
    expect(result).toEqual(activityResponse);
  });

  it('gets investment activity across accounts', async () => {
    const query = {
      accountId,
      pageIndex: 0,
      pageSize: 20,
    };

    const result = await controller.findActivity(currentUser, query);

    expect(investmentService.findActivity).toHaveBeenCalledWith(userId, query);
    expect(result).toEqual(activityResponse);
  });

  it('propagates cross-user account access denial from the service', async () => {
    investmentService.findLatestHoldingsForAccount.mockRejectedValueOnce(
      new NotFoundException(`Account with id ${accountId} not found`),
    );

    await expect(
      controller.findLatestHoldingsForAccount(currentUser, accountId),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires authenticated access for every investment route', () => {
    const routeMethods = [
      InvestmentController.prototype.searchSecurities,
      InvestmentController.prototype.createManualBrokerageAccount,
      InvestmentController.prototype.replaceManualBrokerageHoldings,
      InvestmentController.prototype.refreshManualBrokeragePrices,
      InvestmentController.prototype.findLatestHoldingsForAccount,
      InvestmentController.prototype.findHoldingsForAccountOnDate,
      InvestmentController.prototype.findActivityForAccount,
      InvestmentController.prototype.findActivity,
    ];

    for (const routeMethod of routeMethods) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, routeMethod)).toBeUndefined();
    }
  });
});
