/// <reference lib="webworker" />
import {
  acceptsBadgeSnapshot,
  changeWorkerControl,
  safeNotificationDestination,
  serializeWorkerState,
  validBadgeSnapshot,
  validWorkerControlScope,
} from './worker-state'
import { withDeadline } from './deadline'

declare const self: ServiceWorkerGlobalScope
let volatileDisabled = false
let disableRevision = 0
let badgeRevision = 0
class StaleWorkerEpochError extends Error {}

async function verifyCurrentControlScope(): Promise<string> {
  const response = await fetch('/_pwa/recovery', {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error('Session verification unavailable')
  const result: unknown = await response.json()
  if (
    !result ||
    typeof result !== 'object' ||
    !('app' in result) ||
    result.app !== 'splice' ||
    !('status' in result) ||
    result.status !== 'ready' ||
    !('controlScope' in result) ||
    !validWorkerControlScope(result.controlScope)
  )
    throw new Error('Session verification unavailable')
  return result.controlScope
}

async function validateCurrentEnrollment(
  enrollmentId: string,
): Promise<boolean> {
  try {
    const response = await fetch('/_pwa/enrollment', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enrollmentId }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return false
    const result: unknown = await response.json()
    return Boolean(
      result &&
      typeof result === 'object' &&
      'eligible' in result &&
      result.eligible === true,
    )
  } catch {
    return false
  }
}

type WorkerBadgeNavigator = WorkerNavigator & {
  setAppBadge?: (count: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}
async function setBadge(count: number) {
  const browser = self.navigator as WorkerBadgeNavigator
  const revision = ++badgeRevision
  const pending = Promise.resolve(
    count === 0 ? browser.clearAppBadge?.() : browser.setAppBadge?.(count),
  )
  if (count > 0) {
    // Native badging exposes no cancellation. A timed-out older write that later
    // settles must clear again after logout or a newer writer superseded it.
    void pending
      .then(async () => {
        if (volatileDisabled || revision !== badgeRevision)
          await withDeadline(
            Promise.resolve(browser.clearAppBadge?.()),
            3_000,
            'Badge cleanup timed out.',
          )
      })
      .catch(() => undefined)
  }
  await withDeadline(pending, 3_000, 'Badge update timed out.')
}
async function clearDisplayedNotifications() {
  await Promise.allSettled([
    withDeadline(
      self.registration.getNotifications(),
      3_000,
      'Notification cleanup timed out.',
    ).then((notifications) => {
      notifications.forEach((notification) => notification.close())
    }),
    withDeadline(setBadge(0), 3_000, 'Badge cleanup timed out.'),
  ])
}

export async function handleWorkerControlMessage(
  event: ExtendableMessageEvent,
) {
  const message: unknown = event.data
  if (!message || typeof message !== 'object' || !('type' in message)) return
  const data = message as Record<string, unknown>
  // Only controlled same-origin windows can alter enrollment or the app badge.
  const source = event.source
  if (
    !source ||
    !('url' in source) ||
    new URL(source.url).origin !== self.location.origin
  )
    return
  const supported = [
    'PWA_CONTROL_GET',
    'PWA_SESSION_READY',
    'PWA_DISABLE',
    'PWA_BADGE',
  ]
  if (!supported.includes(String(data.type))) return
  if (data.type === 'PWA_DISABLE') {
    volatileDisabled = true
    disableRevision += 1
  }
  const receiptRevision = disableRevision
  try {
    // Verify outside the state queue so a slow server does not hold up logout.
    const controlScope =
      data.type === 'PWA_SESSION_READY'
        ? await verifyCurrentControlScope()
        : null
    const value = await serializeWorkerState(async () => {
      if (data.type === 'PWA_DISABLE') {
        try {
          return await changeWorkerControl(() => ({
            epoch: crypto.randomUUID(),
            controlScope: null,
            enrollmentId: null,
            disabled: true,
            lastBadgeAsOf: null,
          }))
        } finally {
          await clearDisplayedNotifications()
        }
      }
      const current = await changeWorkerControl()
      if (data.type === 'PWA_CONTROL_GET') {
        if (current.disabled || !validWorkerControlScope(current.controlScope))
          await clearDisplayedNotifications()
        return current
      }
      if (data.epoch !== current.epoch)
        throw new StaleWorkerEpochError('Stale device state')
      if (data.type === 'PWA_SESSION_READY') {
        if (receiptRevision !== disableRevision)
          throw new Error('Session handshake superseded by logout')
        if (data.enrollmentId !== null && typeof data.enrollmentId !== 'string')
          throw new Error('Invalid enrollment')
        if (!validWorkerControlScope(controlScope))
          throw new Error('Session verification unavailable')
        const enrollmentId = data.enrollmentId
        const unchanged =
          !volatileDisabled &&
          !current.disabled &&
          current.controlScope === controlScope &&
          current.enrollmentId === enrollmentId
        if (unchanged) return current
        const updated = await changeWorkerControl((state) => ({
          ...state,
          epoch: crypto.randomUUID(),
          controlScope,
          disabled: false,
          enrollmentId,
          lastBadgeAsOf: null,
        }))
        if (receiptRevision !== disableRevision)
          throw new Error('Session handshake superseded by logout')
        await clearDisplayedNotifications()
        if (receiptRevision !== disableRevision)
          throw new Error('Session handshake superseded by logout')
        volatileDisabled = false
        return updated
      }
      if (
        !volatileDisabled &&
        !current.disabled &&
        validWorkerControlScope(current.controlScope) &&
        validBadgeSnapshot(data.count, data.computedAt) &&
        acceptsBadgeSnapshot(current, data.computedAt as string)
      ) {
        await setBadge(data.count)
        return changeWorkerControl((state) => ({
          ...state,
          lastBadgeAsOf: data.computedAt as string,
        }))
      }
      return current
    })
    event.ports[0]?.postMessage({ ok: true, value })
  } catch (error) {
    event.ports[0]?.postMessage({
      ok: false,
      ...(error instanceof StaleWorkerEpochError
        ? { code: 'stale_epoch' }
        : {}),
    })
  }
}

export async function handlePrivatePush(event: PushEvent) {
  let value: unknown
  try {
    value = event.data?.json()
  } catch {
    value = undefined
  }
  await serializeWorkerState(async () => {
    const payload =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {}
    let allowed = false
    try {
      const current = await changeWorkerControl()
      allowed =
        !volatileDisabled &&
        !current.disabled &&
        validWorkerControlScope(current.controlScope) &&
        payload.version === 2 &&
        typeof payload.enrollmentId === 'string' &&
        payload.enrollmentId === current.enrollmentId
      if (allowed)
        allowed = await validateCurrentEnrollment(
          payload.enrollmentId as string,
        )
      allowed &&= !volatileDisabled
      if (!allowed) {
        if (current.disabled || !validWorkerControlScope(current.controlScope))
          await clearDisplayedNotifications()
        // The push protocol may require visibility even for a stale delivery.
        // Never display the old owner's title/body or destination.
        await self.registration.showNotification('Splice', {
          body: 'Open Splice to check your notification settings.',
          tag: 'splice-device-state',
          data: { url: '/' },
        })
        if (current.disabled)
          await (await self.registration.pushManager.getSubscription())
            ?.unsubscribe()
            .catch(() => false)
        return
      }
      const url =
        safeNotificationDestination(payload.url, self.location.origin) ?? '/'
      await self.registration.showNotification(
        typeof payload.title === 'string' ? payload.title : 'Splice',
        {
          body: typeof payload.body === 'string' ? payload.body : '',
          tag:
            typeof payload.tag === 'string'
              ? payload.tag
              : 'splice-notification',
          data: { url, enrollmentId: current.enrollmentId },
        },
      )
      if (
        validBadgeSnapshot(payload.badgeCount, payload.badgeAsOf) &&
        acceptsBadgeSnapshot(current, payload.badgeAsOf as string)
      ) {
        try {
          await setBadge(payload.badgeCount)
          await changeWorkerControl((state) => ({
            ...state,
            lastBadgeAsOf: payload.badgeAsOf as string,
          }))
        } catch {
          /* A failed badge write remains retryable with the same snapshot. */
        }
      }
      for (const client of await self.clients.matchAll({ type: 'window' }))
        client.postMessage({ type: 'SPLICE_NOTIFICATION_RECEIVED' })
    } catch {
      if (!allowed)
        await self.registration.showNotification('Splice', {
          body: 'Open Splice to check your notification settings.',
          tag: 'splice-device-state',
          data: { url: '/' },
        })
    }
  })
}

export async function handlePrivateNotificationClick(event: NotificationEvent) {
  event.notification.close()
  const data: unknown = event.notification.data
  const detail =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  let target =
    safeNotificationDestination(detail.url, self.location.origin) ?? '/'
  try {
    const state = await changeWorkerControl()
    if (
      state.disabled ||
      (detail.enrollmentId && detail.enrollmentId !== state.enrollmentId)
    )
      target = '/'
  } catch {
    target = '/'
  }
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const client = windows.find(
    (window) => new URL(window.url).origin === self.location.origin,
  )
  if (client) {
    await client.focus()
    const channel = new MessageChannel()
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        channel.port1.close()
        resolve()
      }, 2_000)
      channel.port1.onmessage = () => {
        clearTimeout(timer)
        channel.port1.close()
        resolve()
      }
      client.postMessage({ type: 'SPLICE_NOTIFICATION_OPEN', url: target }, [
        channel.port2,
      ])
    })
    // An unresponsive/old client is focused, never forcibly navigated over a draft.
    return
  }
  await self.clients.openWindow(new URL(target, self.location.origin).href)
}
