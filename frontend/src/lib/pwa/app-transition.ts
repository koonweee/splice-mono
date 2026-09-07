import { useEffect, useSyncExternalStore } from 'react'

const guards = new Set<symbol>()
const listeners = new Set<() => void>()
let pending: (() => void) | undefined
let mutationBlocked = false
let revision = 0

function emit() {
  revision += 1
  for (const listener of listeners) listener()
}

export function isAppTransitionBlocked() {
  return guards.size > 0 || mutationBlocked
}

export function setAppMutationBlocked(blocked: boolean) {
  if (blocked === mutationBlocked) return
  mutationBlocked = blocked
  emit()
}

export function registerAppTransitionGuard() {
  const id = Symbol('app-transition')
  guards.add(id)
  emit()
  return () => {
    guards.delete(id)
    emit()
  }
}

export function useAppTransitionGuard(blocked: boolean) {
  useEffect(() => {
    if (blocked) return registerAppTransitionGuard()
  }, [blocked])
}

/** Keep navigation local; the user explicitly opens a deferred destination. */
export function requestAppTransition(action: () => void): boolean {
  if (isAppTransitionBlocked()) {
    pending = action
    emit()
    return false
  }
  action()
  return true
}

export function openPendingAppTransition() {
  if (isAppTransitionBlocked() || !pending) return
  const action = pending
  pending = undefined
  emit()
  action()
}

export function clearPendingAppTransition() {
  pending = undefined
  emit()
}

export function useAppTransitionState() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => revision,
    () => 0,
  )
  return { blocked: isAppTransitionBlocked(), pending: Boolean(pending) }
}
