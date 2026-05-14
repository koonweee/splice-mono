import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getNotificationPermission,
  isPushSupported,
  urlBase64ToUint8Array,
} from './browser-push'

describe('browser push helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'atob', {
      value: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      configurable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts VAPID base64url keys to Uint8Array', () => {
    const result = urlBase64ToUint8Array('AQIDBA')

    expect(Array.from(result)).toEqual([1, 2, 3, 4])
  })

  it('detects unsupported browsers', () => {
    vi.stubGlobal('Notification', undefined)

    expect(isPushSupported()).toBe(false)
    expect(getNotificationPermission()).toBe('unsupported')
  })
})
