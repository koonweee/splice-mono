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
  };

  beforeEach(async () => {
    service = {
      getAnalysis: jest.fn(),
      getCategoryTransactions: jest.fn(),
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
});
