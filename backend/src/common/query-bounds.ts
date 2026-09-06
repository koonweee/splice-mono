import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const DAY_MS = 86_400_000;
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
    return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

export const CalendarDateSchema = z
  .string()
  .refine(isCalendarDate, 'Use a real calendar date in YYYY-MM-DD format');

export function assertDateRange(
  startDate: string,
  endDate: string,
  limits: {
    maxDays?: number;
    maxAccountDays?: number;
    accountCount?: number;
  } = {},
): number {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    throw new BadRequestException(
      'Use real calendar dates in YYYY-MM-DD format',
    );
  }
  const days = (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS + 1;
  if (days < 1)
    throw new BadRequestException('startDate must be on or before endDate');
  if (limits.maxDays !== undefined && days > limits.maxDays) {
    throw new BadRequestException(
      `Date range exceeds ${limits.maxDays} days; request a shorter range`,
    );
  }
  if (
    limits.maxAccountDays !== undefined &&
    days * (limits.accountCount ?? 1) > limits.maxAccountDays
  ) {
    throw new BadRequestException(
      `Request exceeds ${limits.maxAccountDays} account-days; select fewer accounts or a shorter range`,
    );
  }
  return days;
}
