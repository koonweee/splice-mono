import {
  MoneySchema,
  MoneySign,
  MoneySignSchema,
  MoneyWithSign,
  MoneyWithSignSchema,
  SerializedMoneyWithSign,
} from '../../src/types/MoneyWithSign';

describe('MoneyWithSign', () => {
  describe('constructor', () => {
    it('should create instance with integer amount in cents', () => {
      const money = new MoneyWithSign('USD', 19999, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(19999);
      expect(money.getCurrency()).toBe('USD');
      expect(money.getSign()).toBe(MoneySign.CREDIT);
    });

    it('should store absolute value of negative amounts', () => {
      const money = new MoneyWithSign('USD', -5000, MoneySign.DEBIT);

      expect(money.getAmount()).toBe(5000);
      expect(money.getSign()).toBe(MoneySign.DEBIT);
    });

    it('should handle zero amount', () => {
      const money = new MoneyWithSign('USD', 0, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(0);
    });

    it('should work with different currencies', () => {
      const eurMoney = new MoneyWithSign('EUR', 1000, MoneySign.CREDIT);
      const gbpMoney = new MoneyWithSign('GBP', 2000, MoneySign.DEBIT);

      expect(eurMoney.getCurrency()).toBe('EUR');
      expect(gbpMoney.getCurrency()).toBe('GBP');
    });
  });

  describe('fromFloat', () => {
    it('should convert float to integer cents', () => {
      const money = MoneyWithSign.fromFloat('USD', 199.99, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(19999);
      expect(money.getCurrency()).toBe('USD');
      expect(money.getSign()).toBe(MoneySign.CREDIT);
    });

    it('should handle whole dollar amounts', () => {
      const money = MoneyWithSign.fromFloat('USD', 100.0, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(10000);
    });

    it('should handle small amounts', () => {
      const money = MoneyWithSign.fromFloat('USD', 0.01, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(1);
    });

    it('should convert negative float to positive cents with sign', () => {
      const money = MoneyWithSign.fromFloat('USD', -50.25, MoneySign.DEBIT);

      expect(money.getAmount()).toBe(5025);
      expect(money.getSign()).toBe(MoneySign.DEBIT);
    });

    it('should handle zero amount', () => {
      const money = MoneyWithSign.fromFloat('USD', 0, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(0);
    });

    it('should round to nearest cent for imprecise floats', () => {
      // 19.999... should round to 2000 cents ($20.00)
      const money = MoneyWithSign.fromFloat('USD', 19.999, MoneySign.CREDIT);

      expect(money.getAmount()).toBe(2000);
    });
  });

  describe('fromSerialized', () => {
    it('should reconstruct from serialized data', () => {
      const serialized: SerializedMoneyWithSign = {
        money: { currency: 'USD', amount: 12345 },
        sign: MoneySign.CREDIT,
      };

      const money = MoneyWithSign.fromSerialized(serialized);

      expect(money.getAmount()).toBe(12345);
      expect(money.getCurrency()).toBe('USD');
      expect(money.getSign()).toBe(MoneySign.CREDIT);
    });

    it('should handle debit sign', () => {
      const serialized: SerializedMoneyWithSign = {
        money: { currency: 'EUR', amount: 500 },
        sign: MoneySign.DEBIT,
      };

      const money = MoneyWithSign.fromSerialized(serialized);

      expect(money.getSign()).toBe(MoneySign.DEBIT);
    });
  });

  describe('getters', () => {
    it('getAmount should return amount in cents', () => {
      const money = new MoneyWithSign('USD', 9999, MoneySign.CREDIT);
      expect(money.getAmount()).toBe(9999);
    });

    it('getCurrency should return currency code', () => {
      const money = new MoneyWithSign('JPY', 1000, MoneySign.CREDIT);
      expect(money.getCurrency()).toBe('JPY');
    });

    it('getSign should return the sign', () => {
      const credit = new MoneyWithSign('USD', 100, MoneySign.CREDIT);
      const debit = new MoneyWithSign('USD', 100, MoneySign.DEBIT);

      expect(credit.getSign()).toBe(MoneySign.CREDIT);
      expect(debit.getSign()).toBe(MoneySign.DEBIT);
    });

    it('getMoney should return underlying Money instance', () => {
      const money = new MoneyWithSign('USD', 5000, MoneySign.CREDIT);
      const underlyingMoney = money.getMoney();

      expect(underlyingMoney.getAmount()).toBe(5000);
      expect(underlyingMoney.getCurrency()).toBe('USD');
    });
  });

  describe('toLocaleString', () => {
    it('should format as locale string with default locale', () => {
      const money = new MoneyWithSign('USD', 19999, MoneySign.CREDIT);

      expect(money.toLocaleString()).toBe('$199.99');
    });

    it('should format whole amounts correctly', () => {
      const money = new MoneyWithSign('USD', 10000, MoneySign.CREDIT);

      expect(money.toLocaleString()).toBe('$100.00');
    });

    it('should format small amounts correctly', () => {
      const money = new MoneyWithSign('USD', 1, MoneySign.CREDIT);

      expect(money.toLocaleString()).toBe('$0.01');
    });

    it('should handle different currencies', () => {
      const eurMoney = new MoneyWithSign('EUR', 5000, MoneySign.CREDIT);

      // EUR formatting may vary by locale, but should contain the amount
      const formatted = eurMoney.toLocaleString();
      expect(formatted).toContain('50');
    });
  });

  describe('toSerialized', () => {
    it('should serialize to plain object', () => {
      const money = new MoneyWithSign('USD', 12345, MoneySign.CREDIT);

      const serialized = money.toSerialized();

      expect(serialized).toEqual({
        money: { currency: 'USD', amount: 12345 },
        sign: MoneySign.CREDIT,
      });
    });

    it('should serialize debit correctly', () => {
      const money = new MoneyWithSign('GBP', 999, MoneySign.DEBIT);

      const serialized = money.toSerialized();

      expect(serialized).toEqual({
        money: { currency: 'GBP', amount: 999 },
        sign: MoneySign.DEBIT,
      });
    });
  });

  describe('toJSON', () => {
    it('should return same result as toSerialized', () => {
      const money = new MoneyWithSign('USD', 5000, MoneySign.CREDIT);

      expect(money.toJSON()).toEqual(money.toSerialized());
    });

    it('should work with JSON.stringify', () => {
      const money = new MoneyWithSign('USD', 19999, MoneySign.CREDIT);

      const jsonString = JSON.stringify(money);
      const parsed = JSON.parse(jsonString) as SerializedMoneyWithSign;

      expect(parsed).toEqual({
        money: { currency: 'USD', amount: 19999 },
        sign: MoneySign.CREDIT,
      });
    });
  });

  describe('roundtrip conversion', () => {
    it('should preserve value through serialize/deserialize cycle', () => {
      const original = MoneyWithSign.fromFloat('USD', 199.99, MoneySign.CREDIT);
      const serialized = original.toSerialized();
      const restored = MoneyWithSign.fromSerialized(serialized);

      expect(restored.getAmount()).toBe(original.getAmount());
      expect(restored.getCurrency()).toBe(original.getCurrency());
      expect(restored.getSign()).toBe(original.getSign());
    });

    it('should preserve value through JSON roundtrip', () => {
      const original = new MoneyWithSign('EUR', 50000, MoneySign.DEBIT);
      const jsonString = JSON.stringify(original);
      const parsed = JSON.parse(jsonString) as SerializedMoneyWithSign;
      const restored = MoneyWithSign.fromSerialized(parsed);

      expect(restored.getAmount()).toBe(original.getAmount());
      expect(restored.getCurrency()).toBe(original.getCurrency());
      expect(restored.getSign()).toBe(original.getSign());
    });
  });
});

describe('MoneyWithSign Zod Schemas', () => {
  describe('MoneySchema', () => {
    it('should validate correct money object', () => {
      const result = MoneySchema.safeParse({
        currency: 'USD',
        amount: 1000,
      });

      expect(result.success).toBe(true);
    });

    it('should reject non-integer amounts', () => {
      const result = MoneySchema.safeParse({
        currency: 'USD',
        amount: 10.99,
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing currency', () => {
      const result = MoneySchema.safeParse({
        amount: 1000,
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing amount', () => {
      const result = MoneySchema.safeParse({
        currency: 'USD',
      });

      expect(result.success).toBe(false);
    });

    it('should reject string amounts', () => {
      const result = MoneySchema.safeParse({
        currency: 'USD',
        amount: '1000',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('MoneySignSchema', () => {
    it('should validate credit', () => {
      const result = MoneySignSchema.safeParse('credit');
      expect(result.success).toBe(true);
    });

    it('should validate debit', () => {
      const result = MoneySignSchema.safeParse('debit');
      expect(result.success).toBe(true);
    });

    it('should reject invalid sign', () => {
      const result = MoneySignSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });
  });

  describe('MoneyWithSignSchema', () => {
    it('should validate complete MoneyWithSign object', () => {
      const result = MoneyWithSignSchema.safeParse({
        money: { currency: 'USD', amount: 5000 },
        sign: 'credit',
      });

      expect(result.success).toBe(true);
    });

    it('should reject decimal amounts', () => {
      const result = MoneyWithSignSchema.safeParse({
        money: { currency: 'USD', amount: 50.99 },
        sign: 'credit',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid sign', () => {
      const result = MoneyWithSignSchema.safeParse({
        money: { currency: 'USD', amount: 5000 },
        sign: 'positive',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing money field', () => {
      const result = MoneyWithSignSchema.safeParse({
        sign: 'credit',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing sign field', () => {
      const result = MoneyWithSignSchema.safeParse({
        money: { currency: 'USD', amount: 5000 },
      });

      expect(result.success).toBe(false);
    });
  });
});
