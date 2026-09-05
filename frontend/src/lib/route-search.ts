import { TimePeriod } from './types'

export type HomeSearch = { accountId?: string; period?: TimePeriod }
export const isValidTimePeriod = (value: unknown): value is TimePeriod =>
  typeof value === 'string' &&
  Object.values(TimePeriod).includes(value as TimePeriod)
export type SettingsTab =
  | 'general'
  | 'notifications'
  | 'access'
  | 'categories'
  | 'analysis'
  | 'categorization'
  | 'recurring'
export function validateSettingsSearch(search: Record<string, unknown>): {
  tab?: SettingsTab
} {
  const tab = search.tab
  return tab === 'general' ||
    tab === 'notifications' ||
    tab === 'access' ||
    tab === 'categories' ||
    tab === 'analysis' ||
    tab === 'categorization' ||
    tab === 'recurring'
    ? { tab }
    : {}
}

export type IndexSearch = { login?: true; redirect?: string }

export function validateIndexSearch(
  search: Record<string, unknown>,
): IndexSearch {
  const parsedSearch: IndexSearch = {}

  if (search.login === true || search.login === 'true') {
    parsedSearch.login = true
  }

  if (typeof search.redirect === 'string') {
    parsedSearch.redirect = search.redirect
  }

  return parsedSearch
}
