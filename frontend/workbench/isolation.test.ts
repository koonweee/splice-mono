import { afterEach, describe, expect, it, vi } from 'vitest'
import { installNetworkIsolation } from './isolation'

let restore: (() => void) | undefined
afterEach(() => {
  restore?.()
  vi.restoreAllMocks()
})

describe('workbench transport isolation', () => {
  it('rejects fetch without forwarding cookies or writes to a backend', async () => {
    const fetch = vi.spyOn(window, 'fetch')
    const blocked = vi.fn()
    window.addEventListener('workbench:request-blocked', blocked, {
      once: true,
    })
    restore = installNetworkIsolation(window)
    await expect(
      window.fetch('http://localhost:3000/user/settings', {
        method: 'PATCH',
        credentials: 'include',
      }),
    ).rejects.toThrow('Unmocked workbench request')
    expect(fetch).not.toHaveBeenCalled()
    expect(blocked).toHaveBeenCalledOnce()
  })

  it('rejects Axios/XHR transport before opening a connection', () => {
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open')
    restore = installNetworkIsolation(window)
    expect(() => new XMLHttpRequest().open('POST', '/bank-link')).toThrow(
      'Unmocked workbench request',
    )
    expect(open).not.toHaveBeenCalled()
  })
})
