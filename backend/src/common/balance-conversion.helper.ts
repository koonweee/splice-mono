import { CurrencyConversionService } from '../exchange-rate/currency-conversion.service';
import {
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
 * Interface for objects with converted balances added
 */
export interface WithConvertedBalances {
  convertedCurrentBalance: SerializedMoneyWithSign | null;
  convertedAvailableBalance: SerializedMoneyWithSign | null;
}

/**
 * Result from CurrencyConversionService.convertMany
 */
interface ConversionResult {
  amount: number;
  rate: number | null;
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
   * 3. Converts both balance types in parallel
   * 4. Maps the results back to the items
   *
   * @param items - Array of items with balances to convert
   * @param userId - The user ID (to get preferred currency)
   * @returns Array of items with converted balances added
   */
  async addConvertedBalances<T extends HasBalances>(
    items: T[],
    userId: string,
  ): Promise<(T & WithConvertedBalances)[]> {
    if (items.length === 0) {
      return [];
    }

    const targetCurrency = await this.getTargetCurrency(userId);

    // Prepare separate arrays for each balance type
    const currentBalanceInputs = items.map((item) => ({
      amount: item.currentBalance.money.amount,
      currency: item.currentBalance.money.currency,
    }));

    const availableBalanceInputs = items.map((item) => ({
      amount: item.availableBalance.money.amount,
      currency: item.availableBalance.money.currency,
    }));

    // Convert both balance types in parallel
    const [currentBalanceResults, availableBalanceResults] = await Promise.all([
      this.currencyConversionService.convertMany(
        currentBalanceInputs,
        targetCurrency,
      ),
      this.currencyConversionService.convertMany(
        availableBalanceInputs,
        targetCurrency,
      ),
    ]);

    // Map results back to items
    return items.map((item, index): T & WithConvertedBalances => {
      return {
        ...item,
        convertedCurrentBalance: this.buildConvertedBalance(
          currentBalanceResults[index],
          item.currentBalance.sign,
          targetCurrency,
        ),
        convertedAvailableBalance: this.buildConvertedBalance(
          availableBalanceResults[index],
          item.availableBalance.sign,
          targetCurrency,
        ),
      };
    });
  }

  /**
   * Add converted balances to a single item that has current and available balances.
   *
   * @param item - The item with balances to convert
   * @param userId - The user ID (to get preferred currency)
   * @returns The item with converted balances added
   */
  async addConvertedBalancesToOne<T extends HasBalances>(
    item: T,
    userId: string,
  ): Promise<T & WithConvertedBalances> {
    const [result] = await this.addConvertedBalances([item], userId);
    return result;
  }

  /**
   * Build a converted balance object from a conversion result.
   *
   * Returns null if the conversion used a fallback (no rate available),
   * otherwise returns the converted balance with the original sign.
   *
   * @param conversionResult - Result from CurrencyConversionService.convertMany
   * @param originalSign - The sign of the original balance
   * @param targetCurrency - The currency the balance was converted to
   * @returns The converted balance, or null if conversion failed
   */
  buildConvertedBalance(
    conversionResult: ConversionResult,
    originalSign: MoneySign,
    targetCurrency: string,
  ): SerializedMoneyWithSign | null {
    // Return null if no rate was available (fallback was used)
    if (conversionResult.usedFallback) {
      return null;
    }

    return {
      money: {
        amount: Math.round(conversionResult.amount),
        currency: targetCurrency,
      },
      sign: originalSign,
    };
  }
}
