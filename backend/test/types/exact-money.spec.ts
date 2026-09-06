import {
  MoneySchema,
  MoneySign,
  MoneyWithSign,
  MoneyWithSignSchema,
} from '../../src/types/MoneyWithSign';
import { BalanceColumns } from '../../src/common/balance.columns';
import {
  convertMinorUnits,
  decimalRateRatio,
  ExactDecimal,
  majorToMinorString,
  minorToMajorString,
  moneyFromSignedMinorUnits,
  signedMinorUnits,
} from '../../src/common/exact-money';

describe('exact money', () => {
  it.each([
    ['USD', '199.99', '19999'],
    ['JPY', '123', '123'],
    ['BTC', '0.00000001', '1'],
    ['ETH', '1.000000000000000001', '1000000000000000001'],
    ['ETH', '10', '10000000000000000000'],
  ])(
    'roundtrips %s %s through persistence and JSON',
    (currency, major, minor) => {
      const value = MoneyWithSign.fromMajorUnit(
        currency,
        major,
        MoneySign.NEGATIVE,
      );
      const parsed = MoneyWithSignSchema.parse(
        JSON.parse(JSON.stringify(value)),
      );
      expect(value.getAmount()).toBe(minor);
      expect(value.toMajorUnit()).toBe(major);
      expect(
        BalanceColumns.fromMoneyWithSign(parsed).toMoneyWithSign(),
      ).toEqual(parsed);
      expect(signedMinorUnits(parsed)).toBe(-BigInt(minor));
    },
  );
  it('preserves 78 digits through arithmetic and formatting', () => {
    const amount = '9'.repeat(78);
    const value = new MoneyWithSign('JPY', amount, MoneySign.POSITIVE);
    expect(value.toLocaleString().replace(/[^0-9]/g, '')).toBe(amount);
    expect(convertMinorUnits(amount, 'JPY', 'JPY', '1')).toBe(amount);
    expect(new ExactDecimal(amount).plus(1).minus(1).toFixed()).toBe(amount);
  });
  it.each([
    1000,
    1.5,
    -1,
    NaN,
    Infinity,
    '',
    '01',
    '+1',
    '-1',
    '-0',
    '1.0',
    '1e3',
    ' 1',
    '9'.repeat(79),
  ])('rejects invalid public input %p', (amount) => {
    expect(MoneySchema.safeParse({ currency: 'USD', amount }).success).toBe(
      false,
    );
  });
  it.each([
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    '01',
    '-1',
    '9'.repeat(79),
  ])('rejects lossy internal input %p', (amount) => {
    expect(
      () => new MoneyWithSign('USD', amount, MoneySign.POSITIVE),
    ).toThrow();
  });
  it('quantizes half up once and adapts provider numbers explicitly', () => {
    expect(majorToMinorString('1.005', 'USD')).toBe('101');
    expect(majorToMinorString('-1.005', 'USD')).toBe('101');
    expect(
      MoneyWithSign.fromFloat('USD', 1.005, MoneySign.POSITIVE).getAmount(),
    ).toBe('101');
    expect(
      MoneyWithSign.fromFloat('ETH', 1e-18, MoneySign.POSITIVE).getAmount(),
    ).toBe('1');
    expect(() =>
      MoneyWithSign.fromFloat('USD', Infinity, MoneySign.POSITIVE),
    ).toThrow();
  });
  it('preserves inverse ties at the storage limit with integer ratios', () => {
    const amount = '9'.repeat(78);
    expect(
      convertMinorUnits(amount, 'JPY', 'JPY', decimalRateRatio('2', true)),
    ).toBe(((BigInt(amount) + 1n) / 2n).toString());
    expect(convertMinorUnits('1', 'EUR', 'USD', '1.5')).toBe('2');
    expect(BigInt(convertMinorUnits('1', 'EUR', 'USD', '1.5')) * 2n).toBe(4n);
    expect(convertMinorUnits('1', 'BTC', 'ETH', '1')).toBe('10000000000');
    expect(() => convertMinorUnits(amount, 'JPY', 'JPY', '2')).toThrow();
  });
  it('cancels exact large amounts with canonical zero', () => {
    const value = '10000000000000000001';
    const debit = new MoneyWithSign(
      'ETH',
      value,
      MoneySign.NEGATIVE,
    ).toSerialized();
    const credit = new MoneyWithSign(
      'ETH',
      value,
      MoneySign.POSITIVE,
    ).toSerialized();
    expect(
      moneyFromSignedMinorUnits(
        signedMinorUnits(debit) + signedMinorUnits(credit),
        'ETH',
      ),
    ).toEqual({ money: { currency: 'ETH', amount: '0' }, sign: 'positive' });
  });
  it('formats complete crypto fractions and fiat scale', () => {
    expect(
      new MoneyWithSign('USD', '19999', MoneySign.POSITIVE).toLocaleString(),
    ).toBe('$199.99');
    expect(
      new MoneyWithSign(
        'ETH',
        '1000000000000000001',
        MoneySign.POSITIVE,
      ).toLocaleString(),
    ).toBe('1.000000000000000001 ETH');
    expect(minorToMajorString('1', 'jpy')).toBe('1');
    expect(minorToMajorString('1', 'XYZ')).toBe('0.01');
  });
  it.each(['NaN', 'Infinity', '1e3', ' 1', '', '01.1', '1.2.3'])(
    'rejects malformed decimal %s',
    (amount) => {
      expect(() => majorToMinorString(amount, 'USD')).toThrow();
    },
  );
});
