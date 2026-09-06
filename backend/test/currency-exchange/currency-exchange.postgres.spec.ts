import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import {
  CurrencyExchangeService,
  fxRequestKey,
} from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import { convertMinorUnits } from '../../src/common/exact-money';

postgresSuite('Shared sparse FX resolution in PostgreSQL', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: CurrencyExchangeService;
  beforeAll(async () => {
    harness = await isolatedPostgres('fx_test');
    const repository = harness.database.getRepository(ExchangeRateEntity);
    service = new CurrencyExchangeService(repository, {} as any, {} as any);
    await repository.save([
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: '1.5',
        rateDate: '2026-01-10',
      }),
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: '2',
        rateDate: '2026-02-01',
      }),
      ExchangeRateEntity.fromDto({
        baseCurrency: 'GBP',
        targetCurrency: 'USD',
        rate: '1.25',
        rateDate: '2026-01-01',
      }),
      ExchangeRateEntity.fromDto({
        baseCurrency: 'JPY',
        targetCurrency: 'USD',
        rate: '0.0067',
        rateDate: '2026-01-01',
      }),
    ]);
  }, 120000);
  afterAll(async () => {
    await harness?.close();
  });

  it('resolves 100 sparse dates and three currencies with a bounded query count and no daily grid', async () => {
    const requests = Array.from({ length: 100 }, (_, index) => {
      const date = new Date('2026-01-01T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index * 31);
      return {
        baseCurrency: ['EUR', 'GBP', 'JPY'][index % 3],
        targetCurrency: 'USD',
        requestedDate: date.toISOString().slice(0, 10),
      };
    });
    harness.queries.length = 0;
    const result = await service.resolveRequests([...requests, ...requests]);
    expect(result.size).toBe(100);
    expect([...result.keys()].sort()).toEqual(
      requests.map(fxRequestKey).sort(),
    );
    expect(
      harness.queries.filter((query) => /^SELECT|^\s*WITH/i.test(query)).length,
    ).toBeLessThanOrEqual(3);
    expect(harness.queries.length).toBe(1);
  });

  it('preserves requested dates, actual quote dates, prior/future fill, direct and identity provenance', async () => {
    const requests = [
      '2026-01-01',
      '2026-01-10',
      '2026-01-20',
      '2026-02-01',
    ].map((requestedDate) => ({
      baseCurrency: 'EUR',
      targetCurrency: 'USD',
      requestedDate,
    }));
    const resolved = await service.resolveRequests(requests);
    expect(
      [...resolved.values()].map((rate) => ({
        requestedDate: rate.requestedDate,
        rateDate: rate.rateDate,
        source: rate.source,
        rate: rate.rate,
      })),
    ).toEqual([
      {
        requestedDate: '2026-01-01',
        rateDate: '2026-01-10',
        source: 'BACKWARD_FILLED',
        rate: '1.5',
      },
      {
        requestedDate: '2026-01-10',
        rateDate: '2026-01-10',
        source: 'DB',
        rate: '1.5',
      },
      {
        requestedDate: '2026-01-20',
        rateDate: '2026-01-10',
        source: 'FORWARD_FILLED',
        rate: '1.5',
      },
      {
        requestedDate: '2026-02-01',
        rateDate: '2026-02-01',
        source: 'DB',
        rate: '2',
      },
    ]);
    harness.queries.length = 0;
    const identity = await service.resolveRequests([
      {
        baseCurrency: 'usd',
        targetCurrency: 'USD',
        requestedDate: '2026-01-01',
      },
    ]);
    expect(identity.get('USD:USD:2026-01-01')).toMatchObject({
      rate: '1',
      rateDate: '2026-01-01',
      source: 'IDENTITY',
      ratio: { numerator: '1', denominator: '1' },
    });
    expect(harness.queries).toHaveLength(0);
  });

  it('uses the exact inverse fraction even when the quote display decimal must repeat', async () => {
    const request = {
      baseCurrency: 'USD',
      targetCurrency: 'EUR',
      requestedDate: '2026-01-10',
    };
    const rate = (await service.resolveRequests([request])).get(
      fxRequestKey(request),
    )!;
    expect(rate.rate.startsWith('0.6666666666')).toBe(true);
    expect(BigInt(rate.ratio.numerator) * 3n).toBe(
      BigInt(rate.ratio.denominator) * 2n,
    );
    expect(convertMinorUnits('3', 'USD', 'EUR', rate.ratio)).toBe('2');
    expect(convertMinorUnits('9'.repeat(78), 'USD', 'EUR', rate.ratio)).toBe(
      '6'.repeat(78),
    );
  });

  it('fails all-or-nothing for a missing pair and validates dates before issuing SQL', async () => {
    await expect(
      service.resolveRequests([
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          requestedDate: '2026-01-10',
        },
        {
          baseCurrency: 'ETH',
          targetCurrency: 'USD',
          requestedDate: '2026-01-10',
        },
      ]),
    ).rejects.toThrow('ETH to USD on 2026-01-10');
    harness.queries.length = 0;
    await expect(
      service.resolveRequests([
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          requestedDate: '2026-02-30',
        },
      ]),
    ).rejects.toThrow();
    expect(harness.queries).toHaveLength(0);
  });
});
