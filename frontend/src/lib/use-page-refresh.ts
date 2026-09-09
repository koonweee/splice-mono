import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { usePresentationPreferences } from './presentation-preferences'
import { createPageRefreshCoordinator } from './page-refresh'
import type { RefreshStatus } from './page-refresh'

export function usePageRefresh(
  identity?: string,
  timezone = 'UTC',
  pathname = '/',
) {
  const client = useQueryClient()
  const { today, reconcileDate } = usePresentationPreferences()
  const current = useRef({ today, timezone, pathname })
  current.current = { today, timezone, pathname }
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
      reconcileDate: () => reconcileDate(current.current.timezone),
      home: () =>
        current.current.pathname === '/home'
          ? { endDate: current.current.today }
          : null,
      // Editors initialize from reads. Defer scheduled reconciliation while a
      // account/editor dialog is open or a text control has focus. Status detail
      // is excluded so its Retry action can still start work.
      defer: () =>
        Boolean(
          document.querySelector(
            '[role="dialog"]:not([aria-label="Refresh status"])',
          ),
        ) ||
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
    let wasHidden = document.visibilityState === 'hidden'
    const visibility = () => {
      const hidden = document.visibilityState === 'hidden'
      const returned = wasHidden && !hidden
      wasHidden = hidden
      if (returned) instance.foreground()
      else instance.wake()
    }
    const resume = () => instance.resumeDeferred()
    const focusOut = () => queueMicrotask(resume)
    const edits = new MutationObserver(resume)
    edits.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('focusout', focusOut)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', instance.wake)
    window.addEventListener('online', instance.reconnect)
    window.addEventListener('offline', instance.wake)
    return () => {
      instance.stop()
      coordinator.current = null
      edits.disconnect()
      document.removeEventListener('focusout', focusOut)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', instance.wake)
      window.removeEventListener('online', instance.reconnect)
      window.removeEventListener('offline', instance.wake)
    }
  }, [client, identity, pathname, reconcileDate])
  useEffect(() => {
    coordinator.current?.wake()
  }, [today, timezone])
  return { status, retry: () => coordinator.current?.retry() }
}
