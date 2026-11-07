import { calculateEffectiveBalance } from '../../src/common/effective-balance';
import {
  ExpectedValuePercentSchema,
  ExpectedTaxPercentSchema,
} from '../../src/common/account-value-adjustments';
import { MoneySign } from '../../src/types/MoneyWithSign';

describe('account value adjustments', () => {
  const base = {
    money: { amount: '10000000', currency: 'USD' },
    sign: MoneySign.POSITIVE,
  };
  it('preserves the base with defaults and never mutates it', () => {
    expect(calculateEffectiveBalance(base)).toBe(base);
    const adjusted = calculateEffectiveBalance(base, {
      expectedValuePercent: '50',
      expectedTaxPercent: '30',
    });
    expect(adjusted.money.amount).toBe('3500000');
    expect(base.money.amount).toBe('10000000');
  });
  it.each([
    ['150', '0', '15000000'],
    ['100', '100', '0'],
    ['0.5', '0', '50000'],
    ['100', '30', '7000000'],
  ])(
    'values %s%% and tax %s%% exactly',
    (expectedValuePercent, expectedTaxPercent, amount) => {
      expect(
        calculateEffectiveBalance(base, {
          expectedValuePercent,
          expectedTaxPercent,
        }).money.amount,
      ).toBe(amount);
    },
  );
  it('combines factors before half-up rounding and preserves sign/currency', () => {
    const input = {
      money: { amount: '1', currency: 'JPY' },
      sign: MoneySign.NEGATIVE,
    };
    expect(
      calculateEffectiveBalance(input, {
        expectedValuePercent: '50',
        expectedTaxPercent: '50',
      }),
    ).toEqual({
      money: { amount: '0', currency: 'JPY' },
      sign: MoneySign.NEGATIVE,
    });
    expect(
      calculateEffectiveBalance(input, { expectedValuePercent: '50' }).money
        .amount,
    ).toBe('1');
  });
  it('preserves large exact minor units beyond Number precision', () => {
    const amount = '9'.repeat(78);
    const adjusted = calculateEffectiveBalance(
      { ...base, money: { ...base.money, amount } },
      { expectedValuePercent: '50' },
    );
    expect(adjusted.money.amount).toBe(((BigInt(amount) + 1n) / 2n).toString());
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1e2', '', 'abc', '100%'])(
    'rejects invalid expected value %s without throwing from validation',
    (value) => {
      expect(ExpectedValuePercentSchema.safeParse(value).success).toBe(false);
    },
  );
  it.each(['-1', '100.001', 'NaN', 'Infinity', '1e2', '', 'abc'])(
    'rejects invalid tax %s',
    (value) => {
      expect(ExpectedTaxPercentSchema.safeParse(value).success).toBe(false);
    },
  );
  it('allows a value above 100 and both tax endpoints', () => {
    expect(ExpectedValuePercentSchema.parse('12345.6789')).toBe('12345.6789');
    expect(ExpectedTaxPercentSchema.parse('0')).toBe('0');
    expect(ExpectedTaxPercentSchema.parse('100')).toBe('100');
  });
});
