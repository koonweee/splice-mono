import {
  buildExchangeRateKey,
  CurrencyExchangeService,
} from '../../src/currency-exchange/currency-exchange.service';

describe('CurrencyExchangeService', () => {
  it.each([
    ['USD', 'EUR', 'EUR:USD:2026-08-15'],
    ['GBP', 'EUR', 'EUR:GBP:2026-08-15'],
  ])(
    'builds a canonical key for inverted %s to %s requests',
    (baseCurrency, targetCurrency, expected) => {
      expect(
        buildExchangeRateKey(baseCurrency, targetCurrency, '2026-08-15'),
      ).toBe(expected);
    },
  );

  it('returns existing-rate keys with canonical base, target, and date', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rateDate: '2026-08-15',
        },
      ]),
    };
    const service = new CurrencyExchangeService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
      {} as never,
      {} as never,
    );

    const keys = await service.getExistingRateKeys(
      'EUR',
      ['USD'],
      '2026-08-15',
      '2026-08-15',
    );

    expect(keys).toEqual(new Set(['EUR:USD:2026-08-15']));
  });
});
