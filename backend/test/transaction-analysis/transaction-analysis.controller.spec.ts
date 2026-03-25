import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionAnalysisController } from '../../src/transaction-analysis/transaction-analysis.controller';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import {
  TransactionAnalysisBalanceAdjustmentsQuerySchema,
} from '../../src/types/TransactionAnalysis';
import { ZodValidationPipe } from '../../src/zod-validation/zod-validation.pipe';

describe('TransactionAnalysisController', () => {
  let controller: TransactionAnalysisController;
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

    controller = module.get<TransactionAnalysisController>(
      TransactionAnalysisController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('balance adjustment query boundary', () => {
    it('rejects non-BALANCE_ADJUSTMENT categoryPrimary before the controller can execute', () => {
      const pipe = new ZodValidationPipe(
        TransactionAnalysisBalanceAdjustmentsQuerySchema,
      );

      expect(() =>
        pipe.transform(
          {
            startDate: '2024-01-01',
            endDate: '2024-01-31',
            categoryPrimary: 'INCOME',
            flowDirection: 'inflow',
          },
          { type: 'query', metatype: Object, data: 'query' } as never,
        ),
      ).toThrow(BadRequestException);

      expect(service.getAnalysis).not.toHaveBeenCalled();
      expect(service.getCategoryTransactions).not.toHaveBeenCalled();
    });
  });
});
