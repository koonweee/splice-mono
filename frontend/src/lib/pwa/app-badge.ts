import { axios } from '../../api/axios'
import type { PaginatedTransactionResponse } from '../../api/models/paginatedTransactionResponse'

type BadgingNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const UNCATEGORIZED_BADGE_PARAMS = {
  categoryId: 'UNCATEGORIZED',
  pageIndex: '0',
  pageSize: '1',
  sortBy: 'activityDate',
  sortOrder: 'DESC',
} as const

function getBadgingNavigator(): BadgingNavigator | null {
  if (typeof navigator === 'undefined') {
    return null
  }

  return navigator as BadgingNavigator
}

export function isAppBadgeSupported(): boolean {
  const badgingNavigator = getBadgingNavigator()

  return (
    typeof badgingNavigator?.setAppBadge === 'function' &&
    typeof badgingNavigator.clearAppBadge === 'function'
  )
}

export async function setAppBadgeCount(count: number): Promise<void> {
  const badgingNavigator = getBadgingNavigator()

  if (
    typeof badgingNavigator?.setAppBadge !== 'function' ||
    typeof badgingNavigator.clearAppBadge !== 'function'
  ) {
    return
  }

  if (count > 0) {
    await badgingNavigator.setAppBadge(count)
    return
  }

  await badgingNavigator.clearAppBadge()
}

export async function clearAppBadge(): Promise<void> {
  await setAppBadgeCount(0)
}

export async function fetchUncategorizedTransactionCount(): Promise<number> {
  const response = await axios<PaginatedTransactionResponse>({
    url: '/transaction',
    method: 'GET',
    params: UNCATEGORIZED_BADGE_PARAMS,
  })

  return response.total ?? 0
}

export async function refreshUncategorizedTransactionBadge(): Promise<number> {
  const count = await fetchUncategorizedTransactionCount()
  await setAppBadgeCount(count)

  return count
}
