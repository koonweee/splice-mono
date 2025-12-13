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
      const money = new MoneyWithSign('USD', 19999, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(19999);
      expect(money.getCurrency()).toBe('USD');
      expect(money.getSign()).toBe(MoneySign.POSITIVE);
    });

    it('should store absolute value of negative amounts', () => {
      const money = new MoneyWithSign('USD', -5000, MoneySign.NEGATIVE);

      expect(money.getAmount()).toBe(5000);
      expect(money.getSign()).toBe(MoneySign.NEGATIVE);
    });

    it('should handle zero amount', () => {
      const money = new MoneyWithSign('USD', 0, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(0);
    });

    it('should work with different currencies', () => {
      const eurMoney = new MoneyWithSign('EUR', 1000, MoneySign.POSITIVE);
      const gbpMoney = new MoneyWithSign('GBP', 2000, MoneySign.NEGATIVE);

      expect(eurMoney.getCurrency()).toBe('EUR');
      expect(gbpMoney.getCurrency()).toBe('GBP');
    });
  });

  describe('fromFloat', () => {
    it('should convert float to integer cents', () => {
      const money = MoneyWithSign.fromFloat('USD', 199.99, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(19999);
      expect(money.getCurrency()).toBe('USD');
      expect(money.getSign()).toBe(MoneySign.POSITIVE);
    });

    it('should handle whole dollar amounts', () => {
      const money = MoneyWithSign.fromFloat('USD', 100.0, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(10000);
    });

    it('should handle small amounts', () => {
      const money = MoneyWithSign.fromFloat('USD', 0.01, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(1);
    });

    it('should convert negative float to positive cents with sign', () => {
      const money = MoneyWithSign.fromFloat('USD', -50.25, MoneySign.NEGATIVE);

      expect(money.getAmount()).toBe(5025);
      expect(money.getSign()).toBe(MoneySign.NEGATIVE);
    });

    it('should handle zero amount', () => {
      const money = MoneyWithSign.fromFloat('USD', 0, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(0);
    });

    it('should round to nearest cent for imprecise floats', () => {
      // 19.999... should round to 2000 cents ($20.00)
      const money = MoneyWithSign.fromFloat('USD', 19.999, MoneySign.POSITIVE);

      expect(money.getAmount()).toBe(2000);
    });
  });

  describe('fromSerialized', () => {
    it('should reconstruct from serialized data', () => {
      const serialized: SerializedMoneyWithSign = {
        money: { currency: 'USD', amount: 12345 },
        sign: MoneySign.POSITIVE,
      };

      const money = MoneyWithSign.fromSerialized(serialized);

      expect(money.getAmount()).toBe(12345);
      expect(money.getCurrency()).toBe('USD');
      expect(money.getSign()).toBe(MoneySign.POSITIVE);
    });

    it('should handle negative sign', () => {
      const serialized: SerializedMoneyWithSign = {
        money: { currency: 'EUR', amount: 500 },
        sign: MoneySign.NEGATIVE,
      };

      const money = MoneyWithSign.fromSerialized(serialized);

      expect(money.getSign()).toBe(MoneySign.NEGATIVE);
    });
  });

  describe('getters', () => {
    it('getAmount should return amount in cents', () => {
      const money = new MoneyWithSign('USD', 9999, MoneySign.POSITIVE);
      expect(money.getAmount()).toBe(9999);
    });

    it('getCurrency should return currency code', () => {
      const money = new MoneyWithSign('JPY', 1000, MoneySign.POSITIVE);
      expect(money.getCurrency()).toBe('JPY');
    });

    it('getSign should return the sign', () => {
      const positive = new MoneyWithSign('USD', 100, MoneySign.POSITIVE);
      const negative = new MoneyWithSign('USD', 100, MoneySign.NEGATIVE);

      expect(positive.getSign()).toBe(MoneySign.POSITIVE);
      expect(negative.getSign()).toBe(MoneySign.NEGATIVE);
    });
  });

  describe('toMajorUnit', () => {
    it('should convert cents to dollars for USD (2 decimals)', () => {
      const money = new MoneyWithSign('USD', 19999, MoneySign.POSITIVE);
      expect(money.toMajorUnit()).toBe(199.99);
    });

    it('should convert wei to ETH (18 decimals)', () => {
      // 1.5 ETH = 1.5 * 10^18 wei
      const money = new MoneyWithSign(
        'ETH',
        1500000000000000000,
        MoneySign.POSITIVE,
      );
      expect(money.toMajorUnit()).toBe(1.5);
    });

    it('should convert satoshis to BTC (8 decimals)', () => {
      // 0.025 BTC = 2500000 satoshis
      const money = new MoneyWithSign('BTC', 2500000, MoneySign.POSITIVE);
      expect(money.toMajorUnit()).toBe(0.025);
    });

    it('should handle zero-decimal currencies like JPY', () => {
      const money = new MoneyWithSign('JPY', 1000, MoneySign.POSITIVE);
      expect(money.toMajorUnit()).toBe(1000);
    });
  });

  describe('toLocaleString', () => {
    it('should format as locale string with default locale', () => {
      const money = new MoneyWithSign('USD', 19999, MoneySign.POSITIVE);

      expect(money.toLocaleString()).toBe('$199.99');
    });

    it('should format whole amounts correctly', () => {
      const money = new MoneyWithSign('USD', 10000, MoneySign.POSITIVE);

      expect(money.toLocaleString()).toBe('$100.00');
    });

    it('should format small amounts correctly', () => {
      const money = new MoneyWithSign('USD', 1, MoneySign.POSITIVE);

      expect(money.toLocaleString()).toBe('$0.01');
    });

    it('should handle different currencies', () => {
      const eurMoney = new MoneyWithSign('EUR', 5000, MoneySign.POSITIVE);

      // EUR formatting may vary by locale, but should contain the amount
      const formatted = eurMoney.toLocaleString();
      expect(formatted).toContain('50');
    });
  });

  describe('toSerialized', () => {
    it('should serialize to plain object', () => {
      const money = new MoneyWithSign('USD', 12345, MoneySign.POSITIVE);

      const serialized = money.toSerialized();

      expect(serialized).toEqual({
        money: { currency: 'USD', amount: 12345 },
        sign: MoneySign.POSITIVE,
      });
    });

    it('should serialize negative correctly', () => {
      const money = new MoneyWithSign('GBP', 999, MoneySign.NEGATIVE);

      const serialized = money.toSerialized();

      expect(serialized).toEqual({
        money: { currency: 'GBP', amount: 999 },
        sign: MoneySign.NEGATIVE,
      });
    });
  });

  describe('toJSON', () => {
    it('should return same result as toSerialized', () => {
      const money = new MoneyWithSign('USD', 5000, MoneySign.POSITIVE);

      expect(money.toJSON()).toEqual(money.toSerialized());
    });

    it('should work with JSON.stringify', () => {
      const money = new MoneyWithSign('USD', 19999, MoneySign.POSITIVE);

      const jsonString = JSON.stringify(money);
      const parsed = JSON.parse(jsonString) as SerializedMoneyWithSign;

      expect(parsed).toEqual({
        money: { currency: 'USD', amount: 19999 },
        sign: MoneySign.POSITIVE,
      });
    });
  });

  describe('roundtrip conversion', () => {
    it('should preserve value through serialize/deserialize cycle', () => {
      const original = MoneyWithSign.fromFloat(
        'USD',
        199.99,
        MoneySign.POSITIVE,
      );
      const serialized = original.toSerialized();
      const restored = MoneyWithSign.fromSerialized(serialized);

      expect(restored.getAmount()).toBe(original.getAmount());
      expect(restored.getCurrency()).toBe(original.getCurrency());
      expect(restored.getSign()).toBe(original.getSign());
    });

    it('should preserve value through JSON roundtrip', () => {
      const original = new MoneyWithSign('EUR', 50000, MoneySign.NEGATIVE);
      const jsonString = JSON.stringify(original);
      const parsed = JSON.parse(jsonString) as SerializedMoneyWithSign;
      const restored = MoneyWithSign.fromSerialized(parsed);

      expect(restored.getAmount()).toBe(original.getAmount());
      expect(restored.getCurrency()).toBe(original.getCurrency());
      expect(restored.getSign()).toBe(original.getSign());
    });
  });

  describe('crypto currencies', () => {
    it('should handle ETH with 18 decimal places', () => {
      const eth = MoneyWithSign.fromFloat('ETH', 1.5, MoneySign.POSITIVE);

      // 1.5 ETH = 1.5 * 10^18 wei
      expect(eth.getAmount()).toBe(1500000000000000000);
      expect(eth.getCurrency()).toBe('ETH');
    });

    it('should handle BTC with 8 decimal places', () => {
      const btc = MoneyWithSign.fromFloat('BTC', 0.025, MoneySign.POSITIVE);

      // 0.025 BTC = 0.025 * 10^8 satoshi = 2500000
      expect(btc.getAmount()).toBe(2500000);
      expect(btc.getCurrency()).toBe('BTC');
    });

    it('should format ETH with currency suffix', () => {
      const eth = new MoneyWithSign(
        'ETH',
        1500000000000000000,
        MoneySign.POSITIVE,
      );

      const formatted = eth.toLocaleString();
      expect(formatted).toContain('1.5');
      expect(formatted).toContain('ETH');
    });

    it('should format BTC with currency suffix', () => {
      const btc = new MoneyWithSign('BTC', 2500000, MoneySign.POSITIVE);

      const formatted = btc.toLocaleString();
      expect(formatted).toContain('0.025');
      expect(formatted).toContain('BTC');
    });

    it('should handle zero-decimal currencies like JPY', () => {
      const jpy = MoneyWithSign.fromFloat('JPY', 1000, MoneySign.POSITIVE);

      // JPY has 0 decimal places, so 1000 JPY = 1000 (no conversion)
      expect(jpy.getAmount()).toBe(1000);
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
    it('should validate positive', () => {
      const result = MoneySignSchema.safeParse('positive');
      expect(result.success).toBe(true);
    });

    it('should validate negative', () => {
      const result = MoneySignSchema.safeParse('negative');
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
        sign: 'positive',
      });

      expect(result.success).toBe(true);
    });

    it('should reject decimal amounts', () => {
      const result = MoneyWithSignSchema.safeParse({
        money: { currency: 'USD', amount: 50.99 },
        sign: 'positive',
      });

      expect(result.success).toBe(false);
    });

    it('should reject invalid sign', () => {
      const result = MoneyWithSignSchema.safeParse({
        money: { currency: 'USD', amount: 5000 },
        sign: 'credit',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing money field', () => {
      const result = MoneyWithSignSchema.safeParse({
        sign: 'positive',
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
