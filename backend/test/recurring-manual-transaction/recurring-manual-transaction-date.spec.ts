import {
  getNextMonthlyOccurrenceAfter,
  getNextMonthlyOccurrenceOnOrAfter,
  getOccurrenceDateForMonth,
} from '../../src/recurring-manual-transaction/recurring-manual-transaction-date';

describe('recurring manual transaction date helpers', () => {
  it('computes monthly occurrences on or after the requested date', () => {
    expect(
      getNextMonthlyOccurrenceOnOrAfter({
        startDate: '2026-01-01',
        dayOfMonth: 15,
        onOrAfterDate: '2026-01-01',
      }),
    ).toBe('2026-01-15');

    expect(
      getNextMonthlyOccurrenceOnOrAfter({
        startDate: '2026-01-01',
        dayOfMonth: 15,
        onOrAfterDate: '2026-01-16',
      }),
    ).toBe('2026-02-15');
  });

  it('clamps missing month days to the last calendar day', () => {
    expect(getOccurrenceDateForMonth('2026-02-01', 31)).toBe('2026-02-28');
    expect(getOccurrenceDateForMonth('2028-02-01', 31)).toBe('2028-02-29');
    expect(getOccurrenceDateForMonth('2026-04-01', 31)).toBe('2026-04-30');
  });

  it('respects start dates and end dates', () => {
    expect(
      getNextMonthlyOccurrenceOnOrAfter({
        startDate: '2026-03-20',
        dayOfMonth: 15,
        onOrAfterDate: '2026-03-01',
      }),
    ).toBe('2026-04-15');

    expect(
      getNextMonthlyOccurrenceAfter({
        startDate: '2026-01-01',
        dayOfMonth: 31,
        afterDate: '2026-01-31',
        endDate: '2026-02-27',
      }),
    ).toBeNull();
  });
});
