import {
  BalanceConversionHelper,
  HasBalances,
} from '../../src/common/balance-conversion.helper';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { mockCurrencyConversionService } from '../mocks/exchange-rate/currency-conversion-service.mock';
import { mockUserService } from '../mocks/user/user-service.mock';

describe('BalanceConversionHelper', () => {
  let helper: BalanceConversionHelper;
  const mockUserId = 'user-123';

  beforeEach(() => {
    helper = new BalanceConversionHelper(
      mockUserService as any,
      mockCurrencyConversionService as any,
    );
    jest.clearAllMocks();
  });

  describe('getTargetCurrency', () => {
    it('should return user preferred currency', async () => {
      const result = await helper.getTargetCurrency(mockUserId);

      expect(result).toBe('USD');
      expect(mockUserService.findOne).toHaveBeenCalledWith(mockUserId);
    });

    it('should default to USD when user not found', async () => {
      mockUserService.findOne.mockResolvedValueOnce(null);

      const result = await helper.getTargetCurrency(mockUserId);

      expect(result).toBe('USD');
    });

    it('should default to USD when user has no currency setting', async () => {
      mockUserService.findOne.mockResolvedValueOnce({
        settings: {},
      });

      const result = await helper.getTargetCurrency(mockUserId);

      expect(result).toBe('USD');
    });
  });

  describe('buildConvertedBalance', () => {
    it('should return converted balance when rate is available', () => {
      const conversionResult = {
        amount: 150000,
        rate: 1.5,
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.POSITIVE,
        'EUR',
      );

      expect(result).toEqual({
        money: {
          amount: 150000,
          currency: 'EUR',
        },
        sign: MoneySign.POSITIVE,
      });
    });

    it('should return null when fallback was used', () => {
      const conversionResult = {
        amount: 100000,
        rate: null,
        usedFallback: true,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.POSITIVE,
        'EUR',
      );

      expect(result).toBeNull();
    });

    it('should preserve the original sign', () => {
      const conversionResult = {
        amount: 50000,
        rate: 0.5,
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.NEGATIVE,
        'GBP',
      );

      expect(result?.sign).toBe(MoneySign.NEGATIVE);
    });

    it('should round the amount to nearest integer', () => {
      const conversionResult = {
        amount: 123456.789,
        rate: 1.23,
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.POSITIVE,
        'USD',
      );

      expect(result?.money.amount).toBe(123457);
    });
  });

  describe('addConvertedBalances', () => {
    const createMockItem = (
      currentAmount: number,
      availableAmount: number,
      currency = 'USD',
    ): HasBalances => ({
      currentBalance: {
        money: { amount: currentAmount, currency },
        sign: MoneySign.POSITIVE,
      },
      availableBalance: {
        money: { amount: availableAmount, currency },
        sign: MoneySign.POSITIVE,
      },
    });

    it('should return empty array when input is empty', async () => {
      const result = await helper.addConvertedBalances([], mockUserId);

      expect(result).toEqual([]);
      expect(mockUserService.findOne).not.toHaveBeenCalled();
      expect(mockCurrencyConversionService.convertMany).not.toHaveBeenCalled();
    });

    it('should add converted balances to items', async () => {
      const items = [createMockItem(100000, 95000)];

      const result = await helper.addConvertedBalances(items, mockUserId);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('convertedCurrentBalance');
      expect(result[0]).toHaveProperty('convertedAvailableBalance');
      expect(result[0].currentBalance).toEqual(items[0].currentBalance);
      expect(result[0].availableBalance).toEqual(items[0].availableBalance);
    });

    it('should call convertMany twice (for current and available balances)', async () => {
      const items = [createMockItem(100000, 95000)];

      await helper.addConvertedBalances(items, mockUserId);

      expect(mockCurrencyConversionService.convertMany).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should pass correct balance inputs to convertMany', async () => {
      const items = [
        createMockItem(100000, 95000, 'USD'),
        createMockItem(200000, 180000, 'EUR'),
      ];

      await helper.addConvertedBalances(items, mockUserId);

      // First call for current balances
      expect(mockCurrencyConversionService.convertMany).toHaveBeenNthCalledWith(
        1,
        [
          { amount: 100000, currency: 'USD' },
          { amount: 200000, currency: 'EUR' },
        ],
        'USD',
      );

      // Second call for available balances
      expect(mockCurrencyConversionService.convertMany).toHaveBeenNthCalledWith(
        2,
        [
          { amount: 95000, currency: 'USD' },
          { amount: 180000, currency: 'EUR' },
        ],
        'USD',
      );
    });

    it('should return null for converted balances when fallback is used', async () => {
      const items = [createMockItem(100000, 95000)];
      mockCurrencyConversionService.convertMany.mockResolvedValue([
        { amount: 100000, rate: null, usedFallback: true },
      ]);

      const result = await helper.addConvertedBalances(items, mockUserId);

      expect(result[0].convertedCurrentBalance).toBeNull();
      expect(result[0].convertedAvailableBalance).toBeNull();
    });

    it('should handle multiple items correctly', async () => {
      const items = [
        createMockItem(100000, 95000),
        createMockItem(200000, 190000),
        createMockItem(300000, 280000),
      ];

      // Reset mock to return correct number of results for multiple items
      mockCurrencyConversionService.convertMany.mockImplementation(
        (inputs: { amount: number; currency: string }[]) =>
          Promise.resolve(
            inputs.map((input) => ({
              amount: input.amount,
              rate: 1,
              usedFallback: false,
            })),
          ),
      );

      const result = await helper.addConvertedBalances(items, mockUserId);

      expect(result).toHaveLength(3);
      result.forEach((item, index) => {
        expect(item).toHaveProperty('convertedCurrentBalance');
        expect(item).toHaveProperty('convertedAvailableBalance');
        expect(item.currentBalance).toEqual(items[index].currentBalance);
      });
    });

    it('should preserve original item properties', async () => {
      interface ExtendedItem extends HasBalances {
        id: string;
        name: string;
      }

      const items: ExtendedItem[] = [
        {
          id: 'item-1',
          name: 'Test Item',
          currentBalance: {
            money: { amount: 100000, currency: 'USD' },
            sign: MoneySign.POSITIVE,
          },
          availableBalance: {
            money: { amount: 95000, currency: 'USD' },
            sign: MoneySign.POSITIVE,
          },
        },
      ];

      const result = await helper.addConvertedBalances(items, mockUserId);

      expect(result[0].id).toBe('item-1');
      expect(result[0].name).toBe('Test Item');
    });
  });

  describe('addConvertedBalancesToOne', () => {
    it('should add converted balances to a single item', async () => {
      const item: HasBalances = {
        currentBalance: {
          money: { amount: 100000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        availableBalance: {
          money: { amount: 95000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      };

      const result = await helper.addConvertedBalancesToOne(item, mockUserId);

      expect(result).toHaveProperty('convertedCurrentBalance');
      expect(result).toHaveProperty('convertedAvailableBalance');
      expect(result.currentBalance).toEqual(item.currentBalance);
    });

    it('should call addConvertedBalances internally', async () => {
      const item: HasBalances = {
        currentBalance: {
          money: { amount: 100000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        availableBalance: {
          money: { amount: 95000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      };

      await helper.addConvertedBalancesToOne(item, mockUserId);

      expect(mockCurrencyConversionService.convertMany).toHaveBeenCalledTimes(
        2,
      );
    });
  });
});
