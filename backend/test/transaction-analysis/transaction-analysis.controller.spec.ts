import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TransactionAnalysisController } from '../../src/transaction-analysis/transaction-analysis.controller';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';

describe('TransactionAnalysisController', () => {
  let app: INestApplication;
  let service: {
    getAnalysis: jest.Mock;
    getCategoryTransactions: jest.Mock;
    getBalanceAdjustments: jest.Mock;
  };
  const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

  beforeEach(async () => {
    service = {
      getAnalysis: jest.fn(),
      getCategoryTransactions: jest.fn(),
      getBalanceAdjustments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionAnalysisController],
      providers: [
        {
          provide: TransactionAnalysisService,
          useValue: service,
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = mockUser;
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  it('rejects non-BALANCE_ADJUSTMENT categoryPrimary on the balance adjustment route', async () => {
    const response = await request(app.getHttpServer())
      .get('/transaction-analysis/balance-adjustments')
      .query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryPrimary: 'INCOME',
        flowDirection: 'inflow',
      });

    expect(response.status).toBe(400);
    expect(service.getAnalysis).not.toHaveBeenCalled();
    expect(service.getCategoryTransactions).not.toHaveBeenCalled();
  });

  it('delegates a valid balance adjustment drilldown request to the balance adjustment service method', async () => {
    service.getBalanceAdjustments.mockResolvedValue([
      {
        accountId: 'acct-1',
        accountName: 'Checking',
        flowDirection: 'inflow',
        currency: 'USD',
        deltaAmount: 1500,
        startBalance: {
          money: { amount: 5000, currency: 'USD' },
          sign: 'positive',
        },
        endBalance: {
          money: { amount: 6500, currency: 'USD' },
          sign: 'positive',
        },
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/transaction-analysis/balance-adjustments')
      .query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryPrimary: 'BALANCE_ADJUSTMENT',
        flowDirection: 'inflow',
      });

    expect(response.status).toBe(200);
    expect(service.getBalanceAdjustments).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      'BALANCE_ADJUSTMENT',
      'inflow',
      mockUser.userId,
    );
    expect(service.getAnalysis).not.toHaveBeenCalled();
    expect(service.getCategoryTransactions).not.toHaveBeenCalled();
  });
});
