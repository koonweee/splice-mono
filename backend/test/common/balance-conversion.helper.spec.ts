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
        rateDate: '2024-01-15',
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.POSITIVE,
        'EUR',
      );

      expect(result).toEqual({
        balance: {
          money: {
            amount: 150000,
            currency: 'EUR',
          },
          sign: MoneySign.POSITIVE,
        },
        rate: 1.5,
        rateDate: '2024-01-15',
      });
    });

    it('should return null when fallback was used', () => {
      const conversionResult = {
        amount: 100000,
        rate: null,
        rateDate: null,
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
        rateDate: '2024-01-15',
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.NEGATIVE,
        'GBP',
      );

      expect(result?.balance.sign).toBe(MoneySign.NEGATIVE);
    });

    it('should round the amount to nearest integer', () => {
      const conversionResult = {
        amount: 123456.789,
        rate: 1.23,
        rateDate: '2024-01-15',
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.POSITIVE,
        'USD',
      );

      expect(result?.balance.money.amount).toBe(123457);
    });

    it('should include rate and rateDate in result', () => {
      const conversionResult = {
        amount: 150000,
        rate: 1.5,
        rateDate: '2024-01-15',
        usedFallback: false,
      };

      const result = helper.buildConvertedBalance(
        conversionResult,
        MoneySign.POSITIVE,
        'EUR',
      );

      expect(result?.rate).toBe(1.5);
      expect(result?.rateDate).toBe('2024-01-15');
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

      // First call for current balances (rateDate is undefined when no currencyDate)
      expect(mockCurrencyConversionService.convertMany).toHaveBeenNthCalledWith(
        1,
        [
          { amount: 100000, currency: 'USD' },
          { amount: 200000, currency: 'EUR' },
        ],
        'USD',
        undefined,
      );

      // Second call for available balances
      expect(mockCurrencyConversionService.convertMany).toHaveBeenNthCalledWith(
        2,
        [
          { amount: 95000, currency: 'USD' },
          { amount: 180000, currency: 'EUR' },
        ],
        'USD',
        undefined,
      );
    });

    it('should return null for converted balances when fallback is used', async () => {
      const items = [createMockItem(100000, 95000)];
      mockCurrencyConversionService.convertMany.mockResolvedValue([
        { amount: 100000, rate: null, rateDate: null, usedFallback: true },
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
              rateDate: '2024-01-15',
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

    describe('currencyDate grouping', () => {
      interface ItemWithDate extends HasBalances {
        id: string;
        currencyDate?: string;
      }

      const createItemWithDate = (
        id: string,
        amount: number,
        currencyDate?: string,
      ): ItemWithDate => ({
        id,
        currencyDate,
        currentBalance: {
          money: { amount, currency: 'EUR' },
          sign: MoneySign.POSITIVE,
        },
        availableBalance: {
          money: { amount, currency: 'EUR' },
          sign: MoneySign.POSITIVE,
        },
      });

      it('should pass currencyDate to convertMany for items with dates', async () => {
        const items = [createItemWithDate('item-1', 100000, '2024-01-15')];

        await helper.addConvertedBalances(items, mockUserId);

        // Should pass the currencyDate to convertMany
        expect(
          mockCurrencyConversionService.convertMany,
        ).toHaveBeenNthCalledWith(
          1,
          [{ amount: 100000, currency: 'EUR' }],
          'USD',
          '2024-01-15',
        );
      });

      it('should pass undefined rateDate for items without currencyDate', async () => {
        const items = [createItemWithDate('item-1', 100000)];

        await helper.addConvertedBalances(items, mockUserId);

        expect(
          mockCurrencyConversionService.convertMany,
        ).toHaveBeenNthCalledWith(
          1,
          [{ amount: 100000, currency: 'EUR' }],
          'USD',
          undefined,
        );
      });

      it('should group items by currencyDate for batch conversion', async () => {
        // Reset mock to track calls properly
        mockCurrencyConversionService.convertMany.mockImplementation(
          (
            inputs: { amount: number; currency: string }[],
            _toCurrency: string,
            rateDate?: string,
          ) =>
            Promise.resolve(
              inputs.map((input) => ({
                amount: input.amount * 1.1, // Convert EUR to USD
                rate: 1.1,
                rateDate: rateDate ?? '2024-01-20',
                usedFallback: false,
              })),
            ),
        );

        const items = [
          createItemWithDate('item-1', 100000, '2024-01-15'),
          createItemWithDate('item-2', 200000, '2024-01-15'), // Same date
          createItemWithDate('item-3', 300000, '2024-01-16'), // Different date
          createItemWithDate('item-4', 400000), // No date (uses latest)
        ];

        await helper.addConvertedBalances(items, mockUserId);

        // Should have 6 calls total: 2 balance types × 3 date groups
        // (2024-01-15, 2024-01-16, undefined)
        expect(mockCurrencyConversionService.convertMany).toHaveBeenCalledTimes(
          6,
        );

        // Verify calls were made with correct date groupings
        const calls = mockCurrencyConversionService.convertMany.mock.calls;

        // Find calls for each date
        const jan15Calls = calls.filter((call) => call[2] === '2024-01-15');
        const jan16Calls = calls.filter((call) => call[2] === '2024-01-16');
        const latestCalls = calls.filter((call) => call[2] === undefined);

        // Jan 15 should have 2 items (item-1 and item-2)
        expect(jan15Calls.length).toBe(2); // current + available
        expect(jan15Calls[0][0]).toHaveLength(2);

        // Jan 16 should have 1 item (item-3)
        expect(jan16Calls.length).toBe(2); // current + available
        expect(jan16Calls[0][0]).toHaveLength(1);

        // Latest (undefined) should have 1 item (item-4)
        expect(latestCalls.length).toBe(2); // current + available
        expect(latestCalls[0][0]).toHaveLength(1);
      });

      it('should maintain original order when items have different dates', async () => {
        mockCurrencyConversionService.convertMany.mockImplementation(
          (
            inputs: { amount: number; currency: string }[],
            _toCurrency: string,
            rateDate?: string,
          ) =>
            Promise.resolve(
              inputs.map((input) => ({
                amount: input.amount,
                rate: 1,
                rateDate: rateDate ?? '2024-01-20',
                usedFallback: false,
              })),
            ),
        );

        const items = [
          createItemWithDate('item-1', 100000, '2024-01-15'),
          createItemWithDate('item-2', 200000), // No date
          createItemWithDate('item-3', 300000, '2024-01-16'),
          createItemWithDate('item-4', 400000, '2024-01-15'), // Same as item-1
        ];

        const result = await helper.addConvertedBalances(items, mockUserId);

        // Results should be in original order
        expect(result).toHaveLength(4);
        expect(result[0].id).toBe('item-1');
        expect(result[1].id).toBe('item-2');
        expect(result[2].id).toBe('item-3');
        expect(result[3].id).toBe('item-4');

        // Verify amounts match original items
        expect(result[0].currentBalance.money.amount).toBe(100000);
        expect(result[1].currentBalance.money.amount).toBe(200000);
        expect(result[2].currentBalance.money.amount).toBe(300000);
        expect(result[3].currentBalance.money.amount).toBe(400000);
      });

      it('should use correct rateDate in converted balance result', async () => {
        mockCurrencyConversionService.convertMany.mockImplementation(
          (
            inputs: { amount: number; currency: string }[],
            _toCurrency: string,
            rateDate?: string,
          ) =>
            Promise.resolve(
              inputs.map((input) => ({
                amount: input.amount,
                rate: 1.1,
                rateDate: rateDate ?? '2024-01-20', // Latest rate date
                usedFallback: false,
              })),
            ),
        );

        const items = [
          createItemWithDate('item-1', 100000, '2024-01-15'),
          createItemWithDate('item-2', 200000), // Uses latest
        ];

        const result = await helper.addConvertedBalances(items, mockUserId);

        // Item with specific date should have that date in result
        expect(result[0].convertedCurrentBalance?.rateDate).toBe('2024-01-15');

        // Item without date should have the latest date
        expect(result[1].convertedCurrentBalance?.rateDate).toBe('2024-01-20');
      });
    });
  });
});
