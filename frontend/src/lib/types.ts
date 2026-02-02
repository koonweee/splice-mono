export enum TimePeriod {
  'day' = 'day',
  'week' = 'week',
  'month' = 'month',
  'year' = 'year',
  'threeYears' = 'threeYears',
  'fiveYears' = 'fiveYears',
  'tenYears' = 'tenYears',
}

export const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: '1Y',
  threeYears: '3Y',
  fiveYears: '5Y',
  tenYears: '10Y',
}
