import {
  assertAuthGeneration,
  getAuthGeneration,
  isPrivateUiBlocked,
} from '../auth-generation'
import { getServiceWorkerRegistration } from './service-worker'
import { getPendingLogout } from './logout-state'
import { withDeadline } from './deadline'
import { recordPwaDiagnostic, tracePwa } from './diagnostics'
import { validWorkerControlScope } from './worker-state'

export type WorkerControl = {
  epoch: string
  controlScope: string | null
  enrollmentId: string | null
  disabled: boolean
}
let control: { generation: number; value: WorkerControl } | undefined
let bindRevision = 0
class StaleWorkerEpochError extends Error {}
class SessionUnavailableError extends Error {}
export const WORKER_CONTROL_STALE_EVENT = 'splice:pwa-control-stale'

export async function sendWorkerMessage<T>(
  message: Record<string, unknown>,
  stillCurrent: () => boolean = () => true,
): Promise<T> {
  if (!stillCurrent())
    throw new DOMException('Device state superseded', 'AbortError')
  const registration = await getServiceWorkerRegistration()
  if (!stillCurrent())
    throw new DOMException('Device state superseded', 'AbortError')
  const worker = registration.active
  if (!worker) throw new Error('App worker is not ready. Try again.')
  return tracePwa(
    'worker:message',
    () =>
      new Promise<T>((resolve, reject) => {
        const channel = new MessageChannel()
        const timer = setTimeout(
          () => {
            channel.port1.close()
            reject(new Error('App worker did not respond. Try again.'))
          },
          message.type === 'PWA_SESSION_READY'
            ? 15_000
            : message.type === 'PWA_CONTROL_GET'
              ? 7_000
              : 3_000,
        )
        channel.port1.onmessage = (
          event: MessageEvent<{ ok: boolean; value: T; code?: string }>,
        ) => {
          clearTimeout(timer)
          channel.port1.close()
          if (!event.data.ok)
            recordPwaDiagnostic('worker:message:rejected', {
              type: String(message.type),
              code: [
                'stale_epoch',
                'session_unavailable',
                'session_unverified',
              ].includes(event.data.code ?? '')
                ? event.data.code!
                : 'worker_operation_failed',
            })
          if (event.data.ok) resolve(event.data.value)
          else if (event.data.code === 'stale_epoch')
            reject(new StaleWorkerEpochError('Device state changed.'))
          else if (event.data.code === 'session_unavailable')
            reject(
              new SessionUnavailableError(
                'App worker could not reach Splice to verify your session. Try again.',
              ),
            )
          else if (event.data.code === 'session_unverified')
            reject(
              new Error('App worker could not verify your session. Try again.'),
            )
          else
            reject(
              new Error('App worker could not save device state. Try again.'),
            )
        }
        worker.postMessage(message, [channel.port2])
      }),
    { type: String(message.type) },
  )
}
export async function bindWorkerSession(
  enrollmentId: string | null,
): Promise<WorkerControl> {
  const generation = getAuthGeneration()
  const revision = ++bindRevision
  const stillCurrent = () =>
    generation === getAuthGeneration() &&
    revision === bindRevision &&
    !isPrivateUiBlocked() &&
    !getPendingLogout()
  let observedEnrollment: string | null | undefined
  let observedScope: string | null | undefined
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!stillCurrent())
      throw new DOMException('Device handshake superseded', 'AbortError')
    try {
      const existing = await sendWorkerMessage<WorkerControl>(
        { type: 'PWA_CONTROL_GET' },
        stillCurrent,
      )
      if (attempt === 0) {
        observedEnrollment = existing.enrollmentId
        observedScope = existing.controlScope
      } else if (
        existing.enrollmentId !== observedEnrollment ||
        existing.controlScope !== observedScope
      )
        throw new Error(
          'Device enrollment changed. Verify the session and retry.',
        )
      const value = await sendWorkerMessage<WorkerControl>(
        { type: 'PWA_SESSION_READY', epoch: existing.epoch, enrollmentId },
        stillCurrent,
      )
      if (!stillCurrent())
        throw new DOMException('Device handshake superseded', 'AbortError')
      if (
        value.disabled ||
        !validWorkerControlScope(value.controlScope) ||
        value.enrollmentId !== enrollmentId
      )
        throw new Error(
          'App worker has not verified this session. Update Splice and retry.',
        )
      control = { generation, value }
      return value
    } catch (error) {
      if (
        !(
          error instanceof StaleWorkerEpochError ||
          error instanceof SessionUnavailableError
        ) ||
        !stillCurrent() ||
        attempt === 2
      )
        throw error
      if (error instanceof SessionUnavailableError) {
        recordPwaDiagnostic('worker:session:retry', { attempt: attempt + 1 })
        // Let connectivity recover on resume. The next iteration checks logout
        // and identity fences before obtaining and verifying fresh control.
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      // Another tab may bind between GET and READY. Retry only the handshake;
      // a financial badge snapshot must never be replayed under the new epoch.
    }
  }
  throw new Error('Device handshake could not complete. Try again.')
}

export async function disableWorkerSession(
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  if (!stillCurrent()) return
  const generation = getAuthGeneration()
  const pendingId = getPendingLogout()?.id
  control = undefined
  bindRevision += 1
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return
  // Fast logout can acknowledge before enumeration returns. Fence the current
  // worker now so an already-authorized push cannot restore its badge afterward.
  try {
    navigator.serviceWorker.controller?.postMessage({ type: 'PWA_DISABLE' })
  } catch {
    /* Enumeration and displayed-notification cleanup remain independent. */
  }
  const registrations = await withDeadline(
    navigator.serviceWorker.getRegistrations(),
    3_000,
    'Device cleanup timed out.',
  )
  if (
    !stillCurrent() ||
    generation !== getAuthGeneration() ||
    (pendingId && getPendingLogout()?.id !== pendingId)
  )
    return
  await Promise.allSettled(
    registrations.map(async (registration) => {
      if (!stillCurrent()) return
      try {
        registration.active?.postMessage({ type: 'PWA_DISABLE' })
      } catch {
        /* A worker post failure must not skip displayed-notification cleanup. */
      }
      const notifications = await withDeadline(
        registration.getNotifications(),
        3_000,
        'Notification cleanup timed out.',
      )
      if (
        !stillCurrent() ||
        generation !== getAuthGeneration() ||
        (pendingId && getPendingLogout()?.id !== pendingId)
      )
        return
      notifications.forEach((notification) => notification.close())
    }),
  )
}
export async function sendWorkerBadge(count: number, computedAt: string) {
  const generation = getAuthGeneration()
  if (
    isPrivateUiBlocked() ||
    getPendingLogout() ||
    control?.generation !== generation
  )
    return
  const sendingControl = control
  try {
    await sendWorkerMessage(
      {
        type: 'PWA_BADGE',
        epoch: sendingControl.value.epoch,
        count,
        computedAt,
      },
      () =>
        generation === getAuthGeneration() &&
        control === sendingControl &&
        !isPrivateUiBlocked() &&
        !getPendingLogout(),
    )
  } catch (error) {
    if (
      error instanceof StaleWorkerEpochError &&
      control === sendingControl &&
      generation === getAuthGeneration() &&
      !isPrivateUiBlocked() &&
      !getPendingLogout()
    ) {
      control = undefined
      window.dispatchEvent(new Event(WORKER_CONTROL_STALE_EVENT))
    }
    throw error
  }
  assertAuthGeneration(generation)
}
