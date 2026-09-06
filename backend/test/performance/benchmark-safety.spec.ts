import { guardDatabase, instrument, stats } from './benchmark-runner.cjs';

describe('backend benchmark isolation and statistics', () => {
  it.each([
    undefined,
    'postgres://localhost/splice',
    'postgres://production.example/splice_backend_benchmark',
    'https://localhost/splice_backend_benchmark',
  ])('refuses unsafe benchmark targets', (url) => {
    expect(() => guardDatabase(url)).toThrow();
  });

  it('accepts only the dedicated loopback database', () => {
    expect(guardDatabase('postgres://127.0.0.1/splice_backend_benchmark')).toBe(
      'postgres://127.0.0.1/splice_backend_benchmark',
    );
  });

  it('reports nearest-rank percentiles from all raw samples', () => {
    expect(stats(Array.from({ length: 100 }, (_, index) => index + 1))).toEqual(
      {
        p50: 50,
        p95: 95,
        min: 1,
        max: 100,
      },
    );
  });

  it('releases SQL rows and never retains unmeasured warmup results', async () => {
    const rows = [{ providerPayload: 'Synthetic payload' }];
    const database = {
      driver: { obtainMasterConnection: async () => ({}) },
      createQueryRunner: () => ({ query: jest.fn().mockResolvedValue(rows) }),
    };
    const recorder = instrument(database);
    recorder.pause();
    for (let count = 0; count < 10; count++)
      await database.createQueryRunner().query('SELECT synthetic');
    expect(recorder.get()).toEqual([]);
    recorder.reset();
    await database.createQueryRunner().query('SELECT synthetic');
    expect(recorder.get()[0].records).toBe(rows);
    recorder.pause();
    expect(recorder.get()).toEqual([]);
  });
});
