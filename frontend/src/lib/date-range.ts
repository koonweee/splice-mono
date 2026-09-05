import dayjs from 'dayjs'
import type { DatesRangeValue } from '@mantine/dates'

export function formatDateRangeLabel(value: DatesRangeValue) {
  const [start, end] = value
  const startDate = start ? dayjs(start) : null
  const endDate = end ? dayjs(end) : null

  if (startDate && endDate) {
    if (startDate.isSame(endDate, 'day')) {
      return startDate.format('MMM D, YYYY')
    }

    if (startDate.isSame(endDate, 'month')) {
      return `${startDate.format('MMM D')}–${endDate.format('D, YYYY')}`
    }

    if (startDate.isSame(endDate, 'year')) {
      return `${startDate.format('MMM D')}–${endDate.format('MMM D, YYYY')}`
    }

    return `${startDate.format('MMM D, YYYY')}–${endDate.format('MMM D, YYYY')}`
  }

  if (startDate) {
    return `From ${startDate.format('MMM D, YYYY')}`
  }

  if (endDate) {
    return `Until ${endDate.format('MMM D, YYYY')}`
  }

  return 'All dates'
}
