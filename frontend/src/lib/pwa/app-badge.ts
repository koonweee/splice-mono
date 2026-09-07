import { assertAuthGeneration, getAuthGeneration } from '../auth-generation'
import { withDeadline } from './deadline'
import { sendWorkerBadge } from './worker-channel'
import { validBadgeSnapshot } from './worker-state'
import type { NotificationSummary } from '../../api/models'

type BadgingNavigator = Navigator & { clearAppBadge?: () => Promise<void> }

/** All foreground counts go through the active worker's serialized, fenced writer. */
export async function applyNotificationSummaryBadge(
  summary: NotificationSummary,
): Promise<void> {
  if (
    !validBadgeSnapshot(
      summary.uncategorizedTransactionCount,
      summary.computedAt,
    )
  )
    return
  const generation = getAuthGeneration()
  await sendWorkerBadge(
    summary.uncategorizedTransactionCount,
    summary.computedAt,
  )
  assertAuthGeneration(generation)
}

/** Logout calls worker disable separately; local clearing must not await any other work. */
export async function clearAppBadge(): Promise<void> {
  if (typeof navigator === 'undefined') return
  const badgingNavigator = navigator as BadgingNavigator
  if (typeof badgingNavigator.clearAppBadge === 'function')
    await withDeadline(
      badgingNavigator.clearAppBadge(),
      3_000,
      'Badge cleanup timed out.',
    )
}
