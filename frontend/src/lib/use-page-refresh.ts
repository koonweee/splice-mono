import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePresentationPreferences } from './presentation-preferences'
import { createPageRefreshCoordinator } from './page-refresh'
import type { RefreshStatus } from './page-refresh'

export function usePageRefresh(identity?: string, timezone = 'UTC') {
  const client = useQueryClient()
  const { reconcileDate } = usePresentationPreferences()
  const [status, setStatus] = useState<RefreshStatus>({
    phase: 'idle',
    lastSuccessfulAt: null,
  })
  const coordinator = useRef<ReturnType<
    typeof createPageRefreshCoordinator
  > | null>(null)
  useEffect(() => {
    if (!identity) return
    const instance = createPageRefreshCoordinator({
      client,
      visible: () => document.visibilityState === 'visible',
      online: () => navigator.onLine,
      reconcileDate: () => reconcileDate(timezone),
      // Editors initialize from reads. Defer scheduled reconciliation while a
      // dialog form is open or a text control has focus, preserving local drafts.
      defer: () =>
        Boolean(document.querySelector('[role="dialog"] form')) ||
        Boolean(
          document.activeElement?.matches(
            'input, textarea, [contenteditable="true"]',
          ),
        ),
      publish: (next) =>
        setStatus((previous) =>
          previous.phase === next.phase &&
          previous.lastSuccessfulAt === next.lastSuccessfulAt
            ? previous
            : next,
        ),
    })
    coordinator.current = instance
    document.addEventListener('visibilitychange', instance.wake)
    window.addEventListener('focus', instance.wake)
    window.addEventListener('online', instance.reconnect)
    window.addEventListener('offline', instance.wake)
    return () => {
      instance.stop()
      coordinator.current = null
      document.removeEventListener('visibilitychange', instance.wake)
      window.removeEventListener('focus', instance.wake)
      window.removeEventListener('online', instance.reconnect)
      window.removeEventListener('offline', instance.wake)
    }
  }, [client, identity, timezone, reconcileDate])
  return { status, retry: () => coordinator.current?.retry() }
}
