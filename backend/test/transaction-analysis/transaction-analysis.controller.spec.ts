import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { TransactionAnalysisController } from '../../src/transaction-analysis/transaction-analysis.controller';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';

describe('TransactionAnalysisController', () => {
  let app: INestApplication;
  let service: {
    getAnalysis: jest.Mock;
    getCategoryTransactions: jest.Mock;
    getAnalysisAudit: jest.Mock;
  };
  const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

  beforeEach(async () => {
    service = {
      getAnalysis: jest.fn(),
      getCategoryTransactions: jest.fn(),
      getAnalysisAudit: jest.fn(),
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

  it('rejects startDate after endDate on the audit route', async () => {
    const response = await request(app.getHttpServer())
      .get('/transaction-analysis/audit')
      .query({
        startDate: '2024-02-01',
        endDate: '2024-01-31',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      'startDate must be before or equal to endDate',
    );
    expect(service.getAnalysisAudit).not.toHaveBeenCalled();
  });

  it('delegates a valid audit request to the audit service method', async () => {
    service.getAnalysisAudit.mockResolvedValue({
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      neutralizationLookaroundDays: 60,
      rows: [],
    });

    const response = await request(app.getHttpServer())
      .get('/transaction-analysis/audit')
      .query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

    expect(response.status).toBe(200);
    expect(service.getAnalysisAudit).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-01-31',
      mockUser.userId,
    );
  });

  it('does not document a balance adjustment drilldown route', async () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1.0').build(),
    );

    expect(
      document.paths['/transaction-analysis/balance-adjustments'],
    ).toBeUndefined();
  });
});
