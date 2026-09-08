import { Alert, Button, Group, Text } from '@mantine/core'
import { CloudOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useSession } from '../lib/session'
import { applyNotificationSummaryBadge } from '../lib/pwa/app-badge'
import {
  APP_BUILD_ID,
  checkForPwaUpdate,
  getPwaUpdateState,
  getServiceWorkerRegistration,
  registerPwaServiceWorker,
  reportChunkLoadFailure,
  subscribeToPwaUpdates,
} from '../lib/pwa/service-worker'
import {
  openPendingAppTransition,
  requestAppTransition,
  setAppMutationBlocked,
  useAppTransitionState,
} from '../lib/pwa/app-transition'
import { safeNotificationDestination } from '../lib/pwa/worker-state'
import { withDeadline } from '../lib/pwa/deadline'
import { completePendingLogout } from '../lib/pwa/logout'
import { PENDING_LOGOUT_KEY, getPendingLogout } from '../lib/pwa/logout-state'
import {
  authDocumentNavigation,
  getAuthGeneration,
  isPrivateUiBlocked,
  subscribeAuthBoundary,
} from '../lib/auth-generation'
import { reconcileDeviceNotifications } from '../lib/notifications/browser-push'
import { notificationSummaryQueryOptions } from '../lib/queries/notification'
import { invalidateFamilies } from '../lib/query-invalidation'
import styles from './PwaLifecycle.module.css'
import type { PwaUpdateState } from '../lib/pwa/service-worker'

let activeLifecycleMounted = false

export function PwaLifecycle({
  offlineStatusOwnedByHeader = false,
}: {
  offlineStatusOwnedByHeader?: boolean
}) {
  const [active, setActive] = useState(false)
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  )
  const [update, setUpdate] = useState<PwaUpdateState>(getPwaUpdateState)
  const [pendingLogout, setPendingLogout] = useState(getPendingLogout)
  const pendingLogoutRef = useRef(pendingLogout)
  const anonymousNavigationRequested = useRef(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [updating, setUpdating] = useState(false)
  const updateInFlight = useRef(false)
  const [updateError, setUpdateError] = useState<string>()
  const [retrying, setRetrying] = useState(false)
  const retryInFlight = useRef(false)
  const banner = useRef<HTMLDivElement>(null)
  const [deviceError, setDeviceError] = useState<string>()
  const [workerReady, setWorkerReady] = useState<{
    generation: number
    revision: number
    snapshotAsOf: string
  }>()
  const badgeRevision = useRef(0)
  const forceReconciliation = useRef(false)
  const hasQueuedReconciliation = () => forceReconciliation.current
  const session = useSession()
  const userId = session.data?.user.id
  const client = useQueryClient()
  const router = useRouter({ warn: false }) as
    | ReturnType<typeof useRouter>
    | undefined
  const mutations = useIsMutating()
  const transition = useAppTransitionState()
  const summary = useQuery({
    ...notificationSummaryQueryOptions(),
    enabled:
      active &&
      online &&
      Boolean(userId) &&
      !pendingLogout &&
      !isPrivateUiBlocked(),
  })
  const current = useRef({ userId, router })
  current.current = { userId, router }
  const lifecycleLive = useRef(false)
  const wake = useRef<(force?: boolean) => void>(() => {})
  const reconciling = useRef(false)
  const signingOut = useRef(false)
  const lastReconciled = useRef<{ generation: number; at: number }>(undefined)

  const showAnonymousDocument = () => {
    if (!lifecycleLive.current || anonymousNavigationRequested.current) return
    anonymousNavigationRequested.current = true
    authDocumentNavigation.replace()
  }
  const syncPendingLogout = () => {
    const marker = getPendingLogout()
    const previous = pendingLogoutRef.current
    pendingLogoutRef.current = marker
    setPendingLogout(marker)
    // Another tab may complete the server request. Its durable acknowledgement
    // releases this already-cleared document without rebinding the old session.
    if (previous && !marker && isPrivateUiBlocked()) showAnonymousDocument()
    return marker
  }

  const finishLogout = async () => {
    const marker = syncPendingLogout()
    if (!marker || signingOut.current || navigator.onLine === false) return
    signingOut.current = true
    setLogoutBusy(true)
    try {
      if (await completePendingLogout(marker)) {
        const remaining = syncPendingLogout()
        if (!remaining) showAnonymousDocument()
      }
    } catch {
      /* Keep the persistent, honest pending state and explicit Retry. */
    } finally {
      signingOut.current = false
      setLogoutBusy(false)
    }
  }

  const reconcile = async (force = false) => {
    const generation = getAuthGeneration()
    if (
      !current.current.userId ||
      isPrivateUiBlocked() ||
      getPendingLogout() ||
      navigator.onLine === false ||
      document.visibilityState === 'hidden'
    )
      return
    if (reconciling.current) {
      if (force) forceReconciliation.current = true
      return
    }
    if (
      !force &&
      !forceReconciliation.current &&
      lastReconciled.current?.generation === generation &&
      Date.now() - lastReconciled.current.at < 30_000
    )
      return
    if (getPwaUpdateState().status === 'unsupported') return
    reconciling.current = true
    forceReconciliation.current = false
    const revision = ++badgeRevision.current
    setWorkerReady(undefined)
    const isCurrent = () =>
      lifecycleLive.current &&
      getAuthGeneration() === generation &&
      badgeRevision.current === revision &&
      !isPrivateUiBlocked() &&
      !getPendingLogout()
    lastReconciled.current = { generation, at: Date.now() }
    try {
      await reconcileDeviceNotifications()
      if (!isCurrent()) return
      // A new worker epoch must never inherit a pre-bind cached response. Cancel
      // older reads, then obtain a fresh shared summary before enabling badges.
      const options = notificationSummaryQueryOptions()
      await client.cancelQueries({ queryKey: options.queryKey })
      if (!isCurrent()) return
      const fresh = await withDeadline(
        client.fetchQuery({ ...options, staleTime: 0, retry: false }),
        10_000,
        'Notification counts could not refresh. Try again.',
      ).catch(async (cause: unknown) => {
        if (isCurrent())
          await client.cancelQueries({ queryKey: options.queryKey })
        throw cause
      })
      if (isCurrent()) {
        setWorkerReady({ generation, revision, snapshotAsOf: fresh.computedAt })
        setDeviceError(undefined)
      }
    } catch (cause) {
      if (getAuthGeneration() === generation && !isPrivateUiBlocked())
        setDeviceError(
          cause instanceof Error
            ? cause.message
            : 'Device notifications could not be checked. Try again.',
        )
    } finally {
      reconciling.current = false
      if (hasQueuedReconciliation()) wake.current(true)
    }
  }

  const reportBuild = () => {
    void getServiceWorkerRegistration()
      .then((registration) => {
        registration.active?.postMessage({
          type: 'PWA_CLIENT_BUILD',
          buildId: APP_BUILD_ID,
        })
      })
      .catch(() => undefined)
  }
  wake.current = (force = false) => {
    if (!lifecycleLive.current || document.visibilityState === 'hidden') return
    const marker = syncPendingLogout()
    if (anonymousNavigationRequested.current) return
    if (marker) {
      void finishLogout()
      return
    }
    if (navigator.onLine === false) return
    reportBuild()
    void checkForPwaUpdate()
    void reconcile(force)
  }

  useEffect(() => {
    if (activeLifecycleMounted) return
    activeLifecycleMounted = true
    lifecycleLive.current = true
    setActive(true)
    const onlineChanged = () => {
      setOnline(navigator.onLine)
      wake.current()
    }
    const offlineChanged = () => setOnline(false)
    const foreground = () => wake.current()
    const controllerChanged = () => wake.current(true)
    const identityChanged = () => {
      badgeRevision.current++
      setWorkerReady(undefined)
      setDeviceError(undefined)
      syncPendingLogout()
      wake.current(true)
    }
    const workerControlStale = () => {
      badgeRevision.current++
      setWorkerReady(undefined)
      forceReconciliation.current = true
      wake.current(true)
    }
    const storageChanged = (event: StorageEvent) => {
      if (event.key === PENDING_LOGOUT_KEY) identityChanged()
    }
    const chunkFailed = (event: Event) => {
      event.preventDefault()
      reportChunkLoadFailure()
    }
    const workerMessage = (event: MessageEvent) => {
      if (
        event.data?.type === 'SPLICE_NOTIFICATION_RECEIVED' &&
        document.visibilityState === 'visible' &&
        current.current.userId &&
        !isPrivateUiBlocked()
      ) {
        void invalidateFamilies(client, [
          'notifications',
          'notificationSummary',
        ])
      }
      if (event.data?.type !== 'SPLICE_NOTIFICATION_OPEN') return
      const destination = safeNotificationDestination(
        event.data.url,
        window.location.origin,
      )
      const generation = getAuthGeneration()
      const destinationRouter = current.current.router
      if (
        !destination ||
        isPrivateUiBlocked() ||
        getPendingLogout() ||
        !destinationRouter
      ) {
        event.ports[0]?.postMessage({ handled: false })
        return
      }
      requestAppTransition(() => {
        if (getAuthGeneration() !== generation || isPrivateUiBlocked()) return
        void destinationRouter.navigate({ href: destination })
      })
      event.ports[0]?.postMessage({ handled: true })
    }
    const serviceWorker =
      'serviceWorker' in navigator ? navigator.serviceWorker : null
    const unsubscribe = subscribeToPwaUpdates(setUpdate)
    const unsubscribeIdentity = subscribeAuthBoundary(identityChanged)
    window.addEventListener('online', onlineChanged)
    window.addEventListener('offline', offlineChanged)
    window.addEventListener('focus', foreground)
    window.addEventListener('storage', storageChanged)
    window.addEventListener('splice:pwa-control-stale', workerControlStale)
    window.addEventListener('vite:preloadError', chunkFailed)
    document.addEventListener('visibilitychange', foreground)
    serviceWorker?.addEventListener('controllerchange', controllerChanged)
    serviceWorker?.addEventListener('message', workerMessage)
    void registerPwaServiceWorker()
      .then(() => wake.current())
      .catch(() => undefined)
    wake.current()
    return () => {
      lifecycleLive.current = false
      window.removeEventListener('online', onlineChanged)
      window.removeEventListener('offline', offlineChanged)
      window.removeEventListener('focus', foreground)
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('splice:pwa-control-stale', workerControlStale)
      window.removeEventListener('vite:preloadError', chunkFailed)
      document.removeEventListener('visibilitychange', foreground)
      serviceWorker?.removeEventListener('controllerchange', controllerChanged)
      serviceWorker?.removeEventListener('message', workerMessage)
      unsubscribe()
      unsubscribeIdentity()
      activeLifecycleMounted = false
    }
  }, [client])

  useEffect(() => {
    if (!active) return
    setAppMutationBlocked(mutations > 0)
    return () => setAppMutationBlocked(false)
  }, [active, mutations])
  useEffect(() => {
    if (active && online && userId && !pendingLogout) wake.current()
  }, [active, online, userId, pendingLogout])
  useEffect(() => {
    if (
      !active ||
      !online ||
      !userId ||
      pendingLogout ||
      !summary.data ||
      workerReady?.generation !== getAuthGeneration() ||
      workerReady.revision !== badgeRevision.current ||
      summary.data.computedAt < workerReady.snapshotAsOf
    )
      return
    void applyNotificationSummaryBadge(summary.data).catch(() => undefined)
  }, [active, online, userId, pendingLogout, summary.data, workerReady])

  useEffect(() => {
    if (!active || !banner.current) return
    const element = banner.current
    const reserve = () => {
      const rect = element.getBoundingClientRect()
      const bottom = Number.parseFloat(getComputedStyle(element).bottom) || 0
      document.documentElement.style.setProperty(
        '--splice-lifecycle-space',
        `${rect.height > 0 ? Math.ceil(rect.height + bottom) : 0}px`,
      )
    }
    reserve()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(reserve)
    observer?.observe(element)
    window.addEventListener('resize', reserve)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', reserve)
      document.documentElement.style.removeProperty('--splice-lifecycle-space')
    }
  }, [active])

  if (!active) return null
  const error = updateError || update.error || deviceError
  const applyUpdate = async () => {
    if (
      updateInFlight.current ||
      !online ||
      transition.blocked ||
      !update.updateServiceWorker
    )
      return
    updateInFlight.current = true
    setUpdating(true)
    setUpdateError(undefined)
    let reloading = false
    try {
      reloading = (await update.updateServiceWorker()) === true
    } catch (cause) {
      setUpdateError(
        cause instanceof Error
          ? cause.message
          : 'Could not update Splice. Try again.',
      )
    } finally {
      // Keep feedback visible until navigation replaces the current document.
      if (!reloading) {
        updateInFlight.current = false
        setUpdating(false)
      }
    }
  }
  const retry = async () => {
    if (retryInFlight.current) return
    retryInFlight.current = true
    setRetrying(true)
    setUpdateError(undefined)
    try {
      await registerPwaServiceWorker().catch(() => undefined)
      await checkForPwaUpdate(true)
      await reconcile(true)
    } finally {
      retryInFlight.current = false
      setRetrying(false)
    }
  }

  return (
    <div ref={banner} className={styles.container}>
      {!online && !offlineStatusOwnedByHeader && (
        <Alert
          className={styles.alert}
          color="yellow"
          icon={<CloudOff size={18} />}
          role="alert"
          title="Offline"
          variant="light"
        >
          Live financial data may not load until your connection returns.
        </Alert>
      )}
      {pendingLogout && (
        <Alert
          className={styles.alert}
          color="yellow"
          title="Sign out pending"
          role="alert"
        >
          <Group className={styles.actions} gap="sm" justify="space-between">
            <Text data-typography="bodySmall">
              Private data is hidden on this device. Reconnect to finish signing
              out on the server.
            </Text>
            <Button
              disabled={!online}
              loading={logoutBusy}
              onClick={() => void finishLogout()}
            >
              Retry sign out
            </Button>
          </Group>
        </Alert>
      )}
      {!pendingLogout && error && (
        <Alert
          className={styles.alert}
          color="red"
          title="App features need attention"
          role="alert"
        >
          <Group className={styles.actions} gap="sm" justify="space-between">
            <Text data-typography="bodySmall">{error}</Text>
            <Button
              disabled={!online}
              loading={retrying}
              onClick={() => void retry()}
            >
              Retry
            </Button>
          </Group>
        </Alert>
      )}
      {!pendingLogout && update.needRefresh && (
        <Alert
          className={`${styles.alert} ${styles.update}`}
          role="status"
          title={updating ? 'Updating Splice' : 'Update available'}
          variant="default"
        >
          <Group className={styles.actions} gap="sm" justify="space-between">
            <Text data-typography="bodySmall">
              {updating
                ? 'Splice will restart when the update is ready.'
                : transition.blocked
                  ? 'Finish your edits and saves before updating.'
                  : 'Update to use the latest version of Splice.'}
            </Text>
            <Button
              onClick={() => void applyUpdate()}
              disabled={
                !online || transition.blocked || !update.updateServiceWorker
              }
              loading={updating}
              aria-label={updating ? 'Updating Splice' : 'Update'}
              aria-busy={updating}
            >
              Update
            </Button>
          </Group>
        </Alert>
      )}
      {!pendingLogout && transition.pending && (
        <Alert
          className={styles.alert}
          title="Notification ready to open"
          role="status"
        >
          <Group className={styles.actions} gap="sm" justify="space-between">
            <Text data-typography="bodySmall">
              {transition.blocked
                ? 'Finish your edits and saves, then open the notification.'
                : 'Your notification is ready.'}
            </Text>
            <Button
              disabled={transition.blocked}
              onClick={openPendingAppTransition}
            >
              Open
            </Button>
          </Group>
        </Alert>
      )}
    </div>
  )
}
