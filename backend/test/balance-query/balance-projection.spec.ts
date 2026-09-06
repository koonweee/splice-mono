import {
  buildBalanceWithConversion,
  createBalanceConverter,
} from '../../src/balance-query/balance-projection';
import { decimalRateRatio } from '../../src/common/exact-money';
import type { RateWithSource } from '../../src/types/BalanceQuery';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../../src/types/MoneyWithSign';

function quote(date: string, rate = '1.1'): RateWithSource {
  return {
    baseCurrency: 'EUR',
    targetCurrency: 'USD',
    requestedDate: date,
    rateDate: '2026-09-01',
    rate,
    ratio: decimalRateRatio(rate),
    source: 'FORWARD_FILLED',
  };
}
const balance: SerializedMoneyWithSign = {
  money: { amount: '900719925474099312345', currency: 'EUR' },
  sign: MoneySign.NEGATIVE,
};

describe('Request-local balance conversion reuse', () => {
  it('preserves exact rounding and each day’s provenance across unchanged and changed quotes', () => {
    const convert = createBalanceConverter('USD');
    for (const [date, rate] of [
      ['2026-09-02', '1.1'],
      ['2026-09-03', '1.1'],
      ['2026-09-04', '1.100000000000000001'],
    ]) {
      const value = quote(date, rate);
      const rates = new Map([['EUR:USD', value]]);
      const actual = convert(balance, rates, date);
      expect(actual).toEqual(
        buildBalanceWithConversion(balance, 'USD', rates, date),
      );
      expect(actual.exchangeRate).toBe(value);
      expect(actual.exchangeRate?.requestedDate).toBe(date);
    }
  });
  it('checks every day for missing or nonpositive FX after a successful conversion', () => {
    const convert = createBalanceConverter('USD');
    convert(balance, new Map([['EUR:USD', quote('2026-09-02')]]), '2026-09-02');
    expect(() => convert(balance, undefined, '2026-09-03')).toThrow(
      'on 2026-09-03',
    );
    expect(() =>
      convert(
        balance,
        new Map([['EUR:USD', { ...quote('2026-09-03'), rate: '0' }]]),
        '2026-09-03',
      ),
    ).toThrow('on 2026-09-03');
  });
  it('keeps returned money independent across dates and requests', () => {
    const convert = createBalanceConverter('USD');
    const rates = new Map([['EUR:USD', quote('2026-09-02')]]);
    const first = convert(balance, rates, '2026-09-02');
    first.balance.money.amount = '1';
    first.convertedBalance!.money.amount = '1';
    expect(convert(balance, rates, '2026-09-02')).toEqual(
      buildBalanceWithConversion(balance, 'USD', rates, '2026-09-02'),
    );
    expect(
      createBalanceConverter('SGD')(
        balance,
        new Map([
          ['EUR:SGD', { ...quote('2026-09-02', '3'), targetCurrency: 'SGD' }],
        ]),
        '2026-09-02',
      ).convertedBalance?.money.amount,
    ).toBe('2702159776422297937035');
    const zero = {
      money: { amount: '0', currency: 'EUR' },
      sign: MoneySign.NEGATIVE,
    };
    expect(convert(zero, undefined, '2026-09-02').convertedBalance).toEqual({
      money: { amount: '0', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    });
  });
});
