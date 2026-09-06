import { sampleHistory } from '../../src/balance-query/history-sampling';
import {
  assertDateRange,
  CalendarDateSchema,
} from '../../src/common/query-bounds';

describe('History sampling and work bounds', () => {
  it.each([4, 5, 20, 240, 999, 1000])(
    'preserves endpoints and exact extrema within %i points',
    (maxPoints) => {
      const points = Array.from({ length: 3653 }, (_, index) => ({
        date: index,
        value: (900719925474099300n + BigInt((index * 997) % 10000)).toString(),
      }));
      points[1701].value = '-900719925474099399';
      points[1702].value = '900719925474199399';
      const selected = sampleHistory(points, maxPoints);
      expect(selected.length).toBeLessThanOrEqual(maxPoints);
      expect(selected[0]).toBe(points[0]);
      expect(selected.at(-1)).toBe(points.at(-1));
      expect(selected).toContain(points[1701]);
      expect(selected).toContain(points[1702]);
      expect(selected.map((point) => point.date)).toEqual(
        [...new Set(selected.map((point) => point.date))].sort((a, b) => a - b),
      );
      expect(sampleHistory(points, maxPoints)).toEqual(selected);
    },
  );
  it('keeps an already-small daily result exact and rejects invalid budgets', () => {
    const points = [{ value: '0' }, { value: '1' }];
    expect(sampleHistory(points, 4)).toBe(points);
    for (const max of [0, 3, 1001, 4.5])
      expect(() => sampleHistory(points, max)).toThrow('maxPoints');
  });
  it('validates real calendar days and rejects oversized work before projection', () => {
    expect(CalendarDateSchema.parse('2024-02-29')).toBe('2024-02-29');
    for (const date of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-13-01'])
      expect(() => CalendarDateSchema.parse(date)).toThrow();
    expect(() => assertDateRange('2026-09-02', '2026-09-01')).toThrow();
    expect(() =>
      assertDateRange('1900-01-01', '2026-09-05', { maxDays: 10000 }),
    ).toThrow();
    expect(() =>
      assertDateRange('2000-01-01', '2026-09-05', {
        maxAccountDays: 1000000,
        accountCount: 1000,
      }),
    ).toThrow();
  });
});
