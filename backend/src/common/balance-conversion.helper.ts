import { CurrencyConversionService } from '../exchange-rate/currency-conversion.service';
import {
  type ConvertedBalance,
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { UserService } from '../user/user.service';

/**
 * Interface for objects that have current and available balances
 */
export interface HasBalances {
  currentBalance: SerializedMoneyWithSign;
  availableBalance: SerializedMoneyWithSign;
}

/**
 * Interface for objects that optionally have a currency date for historical conversion
 */
export interface MayHaveCurrencyDate {
  /** Optional date (YYYY-MM-DD) for historical currency conversion. If not provided, uses the latest available rate. */
  currencyDate?: string;
}

/**
 * Interface for objects with converted balances added
 */
export interface WithConvertedBalances {
  convertedCurrentBalance: ConvertedBalance | null;
  convertedAvailableBalance: ConvertedBalance | null;
}

/**
 * Result from CurrencyConversionService.convertMany
 */
interface ConversionResult {
  amount: number;
  rate: number | null;
  rateDate: string | null;
  usedFallback: boolean;
}

/**
 * Helper class for converting balances to a user's preferred currency.
 *
 * This class encapsulates the common pattern of:
 * 1. Getting the user's preferred currency
 * 2. Preparing balance inputs for batch conversion
 * 3. Converting current and available balances in parallel
 * 4. Building the converted balance objects
 *
 * @example
 * ```typescript
 * // In a service constructor:
 * constructor(
 *   private readonly userService: UserService,
 *   private readonly currencyConversionService: CurrencyConversionService,
 * ) {
 *   this.balanceConversionHelper = new BalanceConversionHelper(
 *     userService,
 *     currencyConversionService,
 *   );
 * }
 *
 * // In a service method:
 * async findAllWithConversion(userId: string) {
 *   const items = await this.findAll(userId);
 *   return this.balanceConversionHelper.addConvertedBalances(items, userId);
 * }
 * ```
 */
export class BalanceConversionHelper {
  constructor(
    private readonly userService: UserService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  /**
   * Get the user's preferred currency, defaulting to USD if not set.
   *
   * @param userId - The user ID
   * @returns The user's preferred currency code
   */
  async getTargetCurrency(userId: string): Promise<string> {
    const user = await this.userService.findOne(userId);
    return user?.settings.currency ?? 'USD';
  }

  /**
   * Add converted balances to an array of items that have current and available balances.
   *
   * This method:
   * 1. Gets the user's preferred currency
   * 2. Prepares balance inputs for batch conversion
   * 3. Converts both balance types in parallel (grouped by date for efficiency)
   * 4. Maps the results back to the items
   *
   * Items can optionally have a `currencyDate` field (YYYY-MM-DD) for historical
   * currency conversion. If not provided, uses the latest available rate.
   *
   * @param items - Array of items with balances to convert
   * @param userId - The user ID (to get preferred currency)
   * @returns Array of items with converted balances added
   */
  async addConvertedBalances<T extends HasBalances & MayHaveCurrencyDate>(
    items: T[],
    userId: string,
  ): Promise<(T & WithConvertedBalances)[]> {
    if (items.length === 0) {
      return [];
    }

    const targetCurrency = await this.getTargetCurrency(userId);

    // Group items by their currency date for efficient batch conversion
    // undefined key = use latest rate
    const dateGroups = new Map<
      string | undefined,
      { indices: number[]; items: T[] }
    >();

    items.forEach((item, index) => {
      const rateDate = item.currencyDate;
      if (!dateGroups.has(rateDate)) {
        dateGroups.set(rateDate, { indices: [], items: [] });
      }
      const group = dateGroups.get(rateDate)!;
      group.indices.push(index);
      group.items.push(item);
    });

    // Process each date group in parallel
    const groupResults = await Promise.all(
      Array.from(dateGroups.entries()).map(async ([rateDate, group]) => {
        const currentBalanceInputs = group.items.map((item) => ({
          amount: item.currentBalance.money.amount,
          currency: item.currentBalance.money.currency,
        }));

        const availableBalanceInputs = group.items.map((item) => ({
          amount: item.availableBalance.money.amount,
          currency: item.availableBalance.money.currency,
        }));

        const [currentResults, availableResults] = await Promise.all([
          this.currencyConversionService.convertMany(
            currentBalanceInputs,
            targetCurrency,
            rateDate,
          ),
          this.currencyConversionService.convertMany(
            availableBalanceInputs,
            targetCurrency,
            rateDate,
          ),
        ]);

        return {
          indices: group.indices,
          items: group.items,
          currentResults,
          availableResults,
        };
      }),
    );

    // Build result array, placing items back in original order
    const results: (T & WithConvertedBalances)[] = new Array(
      items.length,
    ) as (T & WithConvertedBalances)[];

    for (const {
      indices,
      items: groupItems,
      currentResults,
      availableResults,
    } of groupResults) {
      indices.forEach((originalIndex, groupIndex) => {
        const originalItem = items[indices[groupIndex]];
        const groupItem = groupItems[groupIndex];
        results[originalIndex] = {
          ...originalItem,
          convertedCurrentBalance: this.buildConvertedBalance(
            currentResults[groupIndex],
            groupItem.currentBalance.sign,
            targetCurrency,
          ),
          convertedAvailableBalance: this.buildConvertedBalance(
            availableResults[groupIndex],
            groupItem.availableBalance.sign,
            targetCurrency,
          ),
        };
      });
    }

    return results;
  }

  /**
   * Build a converted balance object from a conversion result.
   *
   * Returns null if the conversion used a fallback (no rate available),
   * otherwise returns the converted balance with the original sign and rate info.
   *
   * @param conversionResult - Result from CurrencyConversionService.convertMany
   * @param originalSign - The sign of the original balance
   * @param targetCurrency - The currency the balance was converted to
   * @returns The converted balance with rate info, or null if conversion failed
   */
  buildConvertedBalance(
    conversionResult: ConversionResult,
    originalSign: MoneySign,
    targetCurrency: string,
  ): ConvertedBalance | null {
    // Return null if no rate was available (fallback was used)
    if (
      conversionResult.usedFallback ||
      conversionResult.rate === null ||
      conversionResult.rateDate === null
    ) {
      return null;
    }

    return {
      balance: {
        money: {
          amount: Math.round(conversionResult.amount),
          currency: targetCurrency,
        },
        sign: originalSign,
      },
      rate: conversionResult.rate,
      rateDate: conversionResult.rateDate,
    };
  }
}
