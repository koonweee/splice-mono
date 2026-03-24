import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import { MoneySign, getDecimalPlaces } from '../../src/types/MoneyWithSign';

const mockUserId = 'user-uuid-123';

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

function buildTransaction(params: {
  id: string;
  amount: number;
  sign: MoneySign;
  currency?: string;
  date: string;
  pending?: boolean;
  primary?: string | null;
  detailed?: string | null;
}): TransactionEntity {
  const entity = TransactionEntity.fromDto(
    {
      amount: {
        money: {
          amount: params.amount,
          currency: params.currency ?? 'USD',
        },
        sign: params.sign,
      },
      accountId: 'account-1',
      pending: params.pending ?? false,
      date: params.date,
    },
    mockUserId,
  );

  entity.id = params.id;
  entity.category = params.primary
    ? ({
        id: `cat-${params.primary}`,
        primary: params.primary,
        detailed: params.detailed ?? `${params.primary}_DETAIL`,
      } as CategoryEntity)
    : null;

  return entity;
}

describe('TransactionAnalysisService', () => {
  let service: TransactionAnalysisService;
  let mockTransactionRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockCurrencyConversionService: {
    getPreferredCurrency: jest.Mock;
    getRateMap: jest.Mock;
    convertAmount: jest.Mock;
  };

  beforeEach(async () => {
    mockTransactionRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => {
        throw new Error(
          'TransactionAnalysisService must load raw posted transactions instead of using the SQL aggregate path',
        );
      }),
    };
    mockCurrencyConversionService = {
      getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
      getRateMap: jest.fn().mockResolvedValue(new Map([['EUR', 1.1]])),
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
    it('excludes pending transactions from analysis entirely', async () => {
      mockTransactionRepository.find.mockResolvedValue([]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });

      expect(mockTransactionRepository.find).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: mockUserId,
          pending: false,
          date: expect.anything(),
        }),
        relations: ['category'],
      });
    });

    it('cancels exact equal and opposite posted transactions in the same currency', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'expense',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'mirror-income',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          date: '2024-01-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('matches each negative to the nearest positive after deterministic negative ordering', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-near',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-far',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-01',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-14',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 6000,
        outflows: [
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 6000,
            transactionCount: 1,
          }),
        ],
      });
    });

    it('sorts negative candidates by date then id before matching', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'neg-late',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-15',
          primary: 'FOOD_AND_DRINK',
        }),
        buildTransaction({
          id: 'neg-early-b',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-10',
          primary: 'GENERAL_SERVICES',
        }),
        buildTransaction({
          id: 'neg-early-a',
          amount: 6000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-10',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'pos-early',
          amount: 6000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-10',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalOutflow: 12000,
        outflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'GENERAL_SERVICES',
            totalAmount: 6000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 6000,
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('does not cancel across different currencies', async () => {
      const usdExpense = buildTransaction({
        id: 'usd-expense',
        amount: 10000,
        sign: MoneySign.NEGATIVE,
        currency: 'USD',
        date: '2024-01-10',
        primary: 'GENERAL_SERVICES',
      });
      const eurIncome = buildTransaction({
        id: 'eur-income',
        amount: 10000,
        sign: MoneySign.POSITIVE,
        currency: 'EUR',
        date: '2024-01-10',
        primary: 'INCOME',
      });

      mockTransactionRepository.find.mockResolvedValue([
        usdExpense,
        eurIncome,
      ]);

      const result = await service.getAnalysis(
        '2024-01-01',
        '2024-01-31',
        mockUserId,
      );

      expect(result.totalInflow).toBe(11000);
      expect(result.totalOutflow).toBe(10000);
      expect(result.netFlow).toBe(1000);
      expect(result.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 11000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(result.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_SERVICES',
          totalAmount: 10000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);

      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        ['EUR'],
        'USD',
        '2024-01-31',
      );
    });

    it('does not cancel transactions that fall in different analysis windows', async () => {
      const februaryExpense = buildTransaction({
        id: 'feb-expense',
        amount: 9000,
        sign: MoneySign.NEGATIVE,
        date: '2024-02-29',
        primary: 'GENERAL_SERVICES',
      });
      const marchIncome = buildTransaction({
        id: 'march-income',
        amount: 9000,
        sign: MoneySign.POSITIVE,
        date: '2024-03-01',
        primary: 'INCOME',
      });

      mockTransactionRepository.find
        .mockResolvedValueOnce([februaryExpense])
        .mockResolvedValueOnce([marchIncome]);

      const februaryResult = await service.getAnalysis(
        '2024-02-01',
        '2024-02-29',
        mockUserId,
      );
      const marchResult = await service.getAnalysis(
        '2024-03-01',
        '2024-03-31',
        mockUserId,
      );

      expect(februaryResult.totalOutflow).toBe(9000);
      expect(februaryResult.totalInflow).toBe(0);
      expect(februaryResult.outflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'GENERAL_SERVICES',
          totalAmount: 9000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(februaryResult.inflows).toEqual([]);

      expect(marchResult.totalInflow).toBe(9000);
      expect(marchResult.totalOutflow).toBe(0);
      expect(marchResult.inflows).toEqual([
        expect.objectContaining({
          primaryCategory: 'INCOME',
          totalAmount: 9000,
          currency: 'USD',
          transactionCount: 1,
        }),
      ]);
      expect(marchResult.outflows).toEqual([]);

      expect(mockTransactionRepository.find).toHaveBeenCalledTimes(2);
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
          }),
          relations: ['category'],
        }),
      );
      expect(mockTransactionRepository.find).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            pending: false,
          }),
          relations: ['category'],
        }),
      );
    });

    it('neutralizes a production-shaped mirrored pair even when categories disagree', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'bilt-negative',
          amount: 243360,
          sign: MoneySign.NEGATIVE,
          date: '2026-02-28',
          primary: 'LOAN_PAYMENTS',
        }),
        buildTransaction({
          id: 'bilt-positive',
          amount: 243360,
          sign: MoneySign.POSITIVE,
          date: '2026-02-28',
          primary: 'INCOME',
        }),
      ]);

      await expect(
        service.getAnalysis('2026-02-01', '2026-02-28', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 0,
        totalOutflow: 0,
        inflows: [],
        outflows: [],
      });
    });

    it('keeps unmatched posted transactions in formerly excluded categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'unmatched-transfer-in',
          amount: 25000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-06',
          primary: 'TRANSFER_IN',
          detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-transfer-out',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-07',
          primary: 'TRANSFER_OUT',
          detailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        }),
        buildTransaction({
          id: 'unmatched-loan-payment',
          amount: 45000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-08',
          primary: 'LOAN_PAYMENTS',
          detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 25000,
        totalOutflow: 195000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'TRANSFER_IN',
            totalAmount: 25000,
            transactionCount: 1,
          }),
        ],
        outflows: expect.arrayContaining([
          expect.objectContaining({
            primaryCategory: 'TRANSFER_OUT',
            totalAmount: 150000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'LOAN_PAYMENTS',
            totalAmount: 45000,
            transactionCount: 1,
          }),
        ]),
      });
    });

    it('still aggregates unmatched posted transactions into their categories', async () => {
      mockTransactionRepository.find.mockResolvedValue([
        buildTransaction({
          id: 'paycheck',
          amount: 300000,
          sign: MoneySign.POSITIVE,
          date: '2024-01-05',
          primary: 'INCOME',
        }),
        buildTransaction({
          id: 'rent',
          amount: 150000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-07',
          primary: 'RENT_AND_UTILITIES',
        }),
        buildTransaction({
          id: 'groceries',
          amount: 50000,
          sign: MoneySign.NEGATIVE,
          date: '2024-01-08',
          primary: 'FOOD_AND_DRINK',
        }),
      ]);

      await expect(
        service.getAnalysis('2024-01-01', '2024-01-31', mockUserId),
      ).resolves.toMatchObject({
        totalInflow: 300000,
        totalOutflow: 200000,
        inflows: [
          expect.objectContaining({
            primaryCategory: 'INCOME',
            totalAmount: 300000,
            transactionCount: 1,
          }),
        ],
        outflows: [
          expect.objectContaining({
            primaryCategory: 'RENT_AND_UTILITIES',
            totalAmount: 150000,
            transactionCount: 1,
          }),
          expect.objectContaining({
            primaryCategory: 'FOOD_AND_DRINK',
            totalAmount: 50000,
            transactionCount: 1,
          }),
        ],
      });
    });
  });
});
