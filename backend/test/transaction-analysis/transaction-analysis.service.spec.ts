import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import { MoneySign, getDecimalPlaces } from '../../src/types/MoneyWithSign';

const mockUserId = 'user-uuid-123';

// Helper to create mock query builder
const createMockQueryBuilder = (results: unknown[] = []) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  addGroupBy: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(results),
});

/**
 * Real conversion logic (mirrors CurrencyConversionService.convertAmount)
 * so mock behaves identically to production code.
 */
function realConvertAmount(
  amount: number,
  sourceCurrency: string,
  targetCurrency: string,
  rate: number,
): number {
  const sourceDecimals = getDecimalPlaces(sourceCurrency);
  const targetDecimals = getDecimalPlaces(targetCurrency);
  const majorUnits = amount / Math.pow(10, sourceDecimals);
  return Math.round(majorUnits * rate * Math.pow(10, targetDecimals));
}

describe('TransactionAnalysisService', () => {
  let service: TransactionAnalysisService;
  let mockTransactionRepository: {
    createQueryBuilder: jest.Mock;
  };
  let mockCategoryRepository: Record<string, jest.Mock>;
  let mockCurrencyConversionService: {
    getPreferredCurrency: jest.Mock;
    getRateMap: jest.Mock;
    convertAmount: jest.Mock;
  };

  beforeEach(async () => {
    mockTransactionRepository = {
      createQueryBuilder: jest.fn(),
    };
    mockCategoryRepository = {};
    mockCurrencyConversionService = {
      getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
      getRateMap: jest.fn().mockResolvedValue(new Map()),
      convertAmount: jest.fn().mockImplementation(realConvertAmount),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionAnalysisService,
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(CategoryEntity),
          useValue: mockCategoryRepository,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
      ],
    }).compile();

    service = module.get<TransactionAnalysisService>(
      TransactionAnalysisService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAnalysis', () => {
    it('should return empty analysis when no transactions exist', async () => {
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-01-31');
      expect(result.currency).toBe('USD');
      expect(result.inflows).toEqual([]);
      expect(result.outflows).toEqual([]);
      expect(result.totalInflow).toBe(0);
      expect(result.totalOutflow).toBe(0);
      expect(result.netFlow).toBe(0);
      expect(result.uncategorizedInflow).toBe(0);
      expect(result.uncategorizedOutflow).toBe(0);
    });

    it('should classify positive sign as inflow and negative as outflow', async () => {
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: 'INCOME',
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'USD',
            totalAmount: '500000',
            count: '5',
          },
          {
            primary: 'FOOD_AND_DRINK',
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '15000',
            count: '10',
          },
        ]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.inflows).toHaveLength(1);
      expect(result.inflows[0].primaryCategory).toBe('INCOME');
      expect(result.inflows[0].totalAmount).toBe(500000);
      expect(result.inflows[0].transactionCount).toBe(5);

      expect(result.outflows).toHaveLength(1);
      expect(result.outflows[0].primaryCategory).toBe('FOOD_AND_DRINK');
      expect(result.outflows[0].totalAmount).toBe(15000);
      expect(result.outflows[0].transactionCount).toBe(10);
    });

    it('should handle uncategorized transactions', async () => {
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: null,
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'USD',
            totalAmount: '100000',
            count: '2',
          },
          {
            primary: null,
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '50000',
            count: '3',
          },
        ]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.uncategorizedInflow).toBe(100000);
      expect(result.uncategorizedOutflow).toBe(50000);

      // Uncategorized should appear in the category lists too
      const uncatInflow = result.inflows.find(
        (i) => i.primaryCategory === 'UNCATEGORIZED',
      );
      expect(uncatInflow).toBeDefined();
      expect(uncatInflow!.totalAmount).toBe(100000);

      const uncatOutflow = result.outflows.find(
        (o) => o.primaryCategory === 'UNCATEGORIZED',
      );
      expect(uncatOutflow).toBeDefined();
      expect(uncatOutflow!.totalAmount).toBe(50000);
    });

    it('should compute correct net flow', async () => {
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: 'INCOME',
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'USD',
            totalAmount: '300000',
            count: '3',
          },
          {
            primary: 'RENT_AND_UTILITIES',
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '150000',
            count: '1',
          },
          {
            primary: 'FOOD_AND_DRINK',
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '50000',
            count: '5',
          },
        ]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.totalInflow).toBe(300000);
      expect(result.totalOutflow).toBe(200000);
      expect(result.netFlow).toBe(100000);
    });

    it('should sort categories by totalAmount descending', async () => {
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: 'FOOD_AND_DRINK',
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '10000',
            count: '5',
          },
          {
            primary: 'RENT_AND_UTILITIES',
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '200000',
            count: '1',
          },
          {
            primary: 'TRANSPORTATION',
            amountSign: MoneySign.NEGATIVE,
            amountCurrency: 'USD',
            totalAmount: '50000',
            count: '3',
          },
        ]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.outflows[0].primaryCategory).toBe('RENT_AND_UTILITIES');
      expect(result.outflows[1].primaryCategory).toBe('TRANSPORTATION');
      expect(result.outflows[2].primaryCategory).toBe('FOOD_AND_DRINK');
    });

    it('should convert foreign currency amounts to preferred currency', async () => {
      mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue(
        'USD',
      );

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: 'INCOME',
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'EUR',
            totalAmount: '100000', // 1000.00 EUR in cents
            count: '1',
          },
        ]),
      );

      // EUR -> USD rate: 1.10
      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.1]]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.currency).toBe('USD');
      // 1000.00 EUR * 1.10 = 1100.00 USD = 110000 cents
      expect(result.inflows[0].totalAmount).toBe(110000);
      expect(result.inflows[0].currency).toBe('USD');
    });

    it('should aggregate same category from multiple currencies', async () => {
      mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue(
        'USD',
      );

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: 'INCOME',
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'USD',
            totalAmount: '200000', // $2000.00
            count: '2',
          },
          {
            primary: 'INCOME',
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'EUR',
            totalAmount: '100000', // 1000.00 EUR
            count: '1',
          },
        ]),
      );

      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.1]]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.inflows).toHaveLength(1);
      expect(result.inflows[0].primaryCategory).toBe('INCOME');
      // $2000 + (1000 EUR * 1.1) = $2000 + $1100 = $3100 = 310000 cents
      expect(result.inflows[0].totalAmount).toBe(310000);
      expect(result.inflows[0].transactionCount).toBe(3);
    });

    it('should use user preferred currency from settings', async () => {
      mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue(
        'GBP',
      );

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([
          {
            primary: 'INCOME',
            amountSign: MoneySign.POSITIVE,
            amountCurrency: 'GBP',
            totalAmount: '100000',
            count: '1',
          },
        ]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.currency).toBe('GBP');
      // No conversion needed since currency matches preference - getRateMap called with empty array
      expect(
        mockCurrencyConversionService.getRateMap,
      ).toHaveBeenCalledWith([], 'GBP', '2024-01-31');
    });

    it('should default to USD when user has no currency preference', async () => {
      mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue(
        'USD',
      );

      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([]),
      );

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.currency).toBe('USD');
    });

    it('should query with correct exclusion parameters for credit card payments', async () => {
      const mockQueryBuilder = createMockQueryBuilder([]);
      mockTransactionRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );

      await service.getAnalysis('2024-01-01', '2024-01-31', mockUserId);

      // Verify the query builder was called with the correct parameters
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('c.detailed NOT IN'),
        expect.objectContaining({
          excludedDetailed: expect.arrayContaining([
            'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
          ]),
        }),
      );
    });
  });
});
