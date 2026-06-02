import dayjs from 'dayjs';

export function isValidDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).isValid();
}

export function assertValidDayOfMonth(dayOfMonth: number): void {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error('dayOfMonth must be an integer from 1 through 31');
  }
}

export function getOccurrenceDateForMonth(
  yearMonthDate: string,
  dayOfMonth: number,
): string {
  assertValidDayOfMonth(dayOfMonth);

  const month = dayjs(yearMonthDate).startOf('month');
  const clampedDay = Math.min(dayOfMonth, month.daysInMonth());
  return month.date(clampedDay).format('YYYY-MM-DD');
}

export function getNextMonthlyOccurrenceOnOrAfter(input: {
  startDate: string;
  dayOfMonth: number;
  onOrAfterDate: string;
  endDate?: string | null;
}): string | null {
  assertValidDayOfMonth(input.dayOfMonth);

  if (
    !isValidDateOnly(input.startDate) ||
    !isValidDateOnly(input.onOrAfterDate)
  ) {
    throw new Error('startDate and onOrAfterDate must be YYYY-MM-DD dates');
  }

  if (input.endDate && !isValidDateOnly(input.endDate)) {
    throw new Error('endDate must be a YYYY-MM-DD date when provided');
  }

  const floorDate = dayjs(input.startDate).isAfter(input.onOrAfterDate, 'day')
    ? input.startDate
    : input.onOrAfterDate;

  const candidate = getOccurrenceDateForMonth(floorDate, input.dayOfMonth);
  const next = dayjs(candidate).isBefore(floorDate, 'day')
    ? getOccurrenceDateForMonth(
        dayjs(floorDate).add(1, 'month').format('YYYY-MM-DD'),
        input.dayOfMonth,
      )
    : candidate;

  if (input.endDate && dayjs(next).isAfter(input.endDate, 'day')) {
    return null;
  }

  return next;
}

export function getNextMonthlyOccurrenceAfter(input: {
  startDate: string;
  dayOfMonth: number;
  afterDate: string;
  endDate?: string | null;
}): string | null {
  return getNextMonthlyOccurrenceOnOrAfter({
    startDate: input.startDate,
    dayOfMonth: input.dayOfMonth,
    onOrAfterDate: dayjs(input.afterDate).add(1, 'day').format('YYYY-MM-DD'),
    endDate: input.endDate,
  });
}
