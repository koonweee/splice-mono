import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingAppTransition,
  isAppTransitionBlocked,
  openPendingAppTransition,
  registerAppTransitionGuard,
  requestAppTransition,
  setAppMutationBlocked,
} from './app-transition'

afterEach(() => {
  clearPendingAppTransition()
  setAppMutationBlocked(false)
})

describe('app transitions', () => {
  it('keeps editors intact until they close and the user opens the destination', () => {
    const close = registerAppTransitionGuard()
    const navigate = vi.fn()
    expect(requestAppTransition(navigate)).toBe(false)
    openPendingAppTransition()
    expect(navigate).not.toHaveBeenCalled()
    close()
    expect(navigate).not.toHaveBeenCalled()
    openPendingAppTransition()
    expect(navigate).toHaveBeenCalledOnce()
  })
  it('keeps independent editors and a pending save protected', () => {
    const closeFirst = registerAppTransitionGuard()
    const closeSecond = registerAppTransitionGuard()
    setAppMutationBlocked(true)
    closeFirst()
    closeSecond()
    expect(isAppTransitionBlocked()).toBe(true)
    setAppMutationBlocked(false)
    expect(isAppTransitionBlocked()).toBe(false)
  })
  it('clears deferred navigation at an identity boundary', () => {
    const close = registerAppTransitionGuard()
    const navigate = vi.fn()
    requestAppTransition(navigate)
    clearPendingAppTransition()
    close()
    openPendingAppTransition()
    expect(navigate).not.toHaveBeenCalled()
  })
})
