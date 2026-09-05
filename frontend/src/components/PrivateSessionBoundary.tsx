import { useSyncExternalStore } from 'react'
import {
  isPrivateUiBlocked,
  subscribeAuthBoundary,
} from '../lib/auth-generation'
import type { ReactNode } from 'react'

// Server rendering is request-isolated and already authenticated by beforeLoad.
// Browser transitions unmount every protected observer and local editor together.
const serverSnapshot = () => false
export function PrivateSessionBoundary({
  children,
  fallback = <div role="status">Updating session…</div>,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const blocked = useSyncExternalStore(
    subscribeAuthBoundary,
    isPrivateUiBlocked,
    serverSnapshot,
  )
  return blocked ? fallback : children
}
