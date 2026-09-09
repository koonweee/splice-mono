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
    let awaitingReturn = wasHidden
    let lastReturnAt = Date.now()
    const standalone = () =>
      Boolean(
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        (navigator as Navigator & { standalone?: boolean }).standalone,
      )
    const returned = (fallback = false) => {
      // iOS can restore a live standalone page without a complete visibility
      // pair. Multiple resume signals belong to one return; an observed new
      // departure always permits another return, even within this burst window.
      if (awaitingReturn || (fallback && Date.now() - lastReturnAt > 1000)) {
        awaitingReturn = false
        lastReturnAt = Date.now()
        instance.foreground()
      } else instance.wake()
    }
    const visibility = () => {
      const hidden = document.visibilityState === 'hidden'
      if (hidden) awaitingReturn = true
      const becameVisible = wasHidden && !hidden
      wasHidden = hidden
      if (becameVisible) returned()
      else instance.wake()
    }
    const blur = () => {
      if (standalone()) awaitingReturn = true
    }
    const focus = () => returned(standalone())
    const pageHide = () => {
      awaitingReturn = true
    }
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted || awaitingReturn) returned(event.persisted)
      else instance.wake()
    }
    const resume = () => instance.resumeDeferred()
    const focusOut = () => queueMicrotask(resume)
    const edits = new MutationObserver(resume)
    edits.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('focusout', focusOut)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('pageshow', pageShow)
    window.addEventListener('online', instance.reconnect)
    window.addEventListener('offline', instance.wake)
    return () => {
      instance.stop()
      coordinator.current = null
      edits.disconnect()
      document.removeEventListener('focusout', focusOut)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('pageshow', pageShow)
      window.removeEventListener('online', instance.reconnect)
      window.removeEventListener('offline', instance.wake)
    }
  }, [client, identity, pathname, reconcileDate])
  useEffect(() => {
    coordinator.current?.wake()
  }, [today, timezone])
  return { status, retry: () => coordinator.current?.retry() }
}
