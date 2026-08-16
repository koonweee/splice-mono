import { CurrencyBackfillService } from '../../src/currency-exchange/currency-backfill.service';

describe('CurrencyBackfillService', () => {
  it('skips an existing canonical rate for an inverted daily request', async () => {
    const today = new Date().toISOString().split('T')[0];
    const getLatestRates = jest.fn();
    const currencyExchangeService = {
      getExistingRateKeys: jest
        .fn()
        .mockResolvedValue(new Set([`EUR:USD:${today}`])),
      getFiatProvider: jest.fn().mockReturnValue({ getLatestRates }),
      upsertRate: jest.fn(),
    };
    const service = new CurrencyBackfillService(
      currencyExchangeService as never,
      {
        find: jest
          .fn()
          .mockResolvedValue([{ currentBalance: { currency: 'USD' } }]),
      } as never,
      {
        find: jest
          .fn()
          .mockResolvedValue([
            { id: 'user-eur', settings: { currency: 'EUR' } },
          ]),
      } as never,
      { find: jest.fn() } as never,
    );

    await expect(service.syncDailyFiatRates()).resolves.toEqual([]);

    expect(currencyExchangeService.getExistingRateKeys).toHaveBeenCalledWith(
      'EUR',
      ['USD'],
      today,
      today,
    );
    expect(getLatestRates).not.toHaveBeenCalled();
    expect(currencyExchangeService.upsertRate).not.toHaveBeenCalled();
  });

  it('does not let an existing target/date for one base suppress another base', async () => {
    const today = new Date().toISOString().split('T')[0];
    const getLatestRates = jest
      .fn()
      .mockResolvedValue(new Map<string, number>([['USD', 1.25]]));
    const currencyExchangeService = {
      getExistingRateKeys: jest
        .fn()
        .mockResolvedValueOnce(new Set([`EUR:USD:${today}`]))
        .mockResolvedValueOnce(new Set()),
      getFiatProvider: jest.fn().mockReturnValue({ getLatestRates }),
      upsertRate: jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'rate-id',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...dto,
        }),
      ),
    };
    const accountRepository = {
      find: jest.fn().mockImplementation(({ where: { userId } }) =>
        Promise.resolve([
          {
            currentBalance: {
              currency: userId === 'user-eur' ? 'EUR' : 'GBP',
            },
          },
        ]),
      ),
    };
    const userRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'user-eur', settings: { currency: 'USD' } },
        { id: 'user-gbp', settings: { currency: 'USD' } },
      ]),
    };
    const service = new CurrencyBackfillService(
      currencyExchangeService as never,
      accountRepository as never,
      userRepository as never,
      { find: jest.fn() } as never,
    );

    const result = await service.syncDailyFiatRates();

    expect(getLatestRates).toHaveBeenCalledTimes(1);
    expect(getLatestRates).toHaveBeenCalledWith('GBP', ['USD']);
    expect(currencyExchangeService.upsertRate).toHaveBeenCalledWith({
      baseCurrency: 'GBP',
      targetCurrency: 'USD',
      rate: 1.25,
      rateDate: today,
    });
    expect(result).toHaveLength(1);
  });
});
