import { describe, expect, it, vi } from 'vitest'
import { createLoadingGate } from './loading-gates'
import { createFixtureApi } from './fixture-api'

describe('deterministic loading transitions', () => {
  it('holds related reads until released, lets session resolve, and keeps frames isolated', async () => {
    const gate = createLoadingGate(true)
    const api = createFixtureApi({
      beforeRead: (path) =>
        path === '/user/me' ? Promise.resolve() : gate.wait(),
    })
    const loaded = vi.fn()
    const first = api({ url: '/account' }).then(loaded)
    const second = api({ url: '/transaction' }).then(loaded)
    await expect(api({ url: '/user/me' })).resolves.toBeDefined()
    await expect(createFixtureApi()({ url: '/account' })).resolves.toBeDefined()
    expect(loaded).not.toHaveBeenCalled()
    gate.release()
    await Promise.all([first, second])
    expect(loaded).toHaveBeenCalledTimes(2)
    await expect(api({ url: '/account' })).resolves.toBeDefined()
  })
  it('releases modules and data independently', async () => {
    const modules = createLoadingGate(true)
    const reads = createLoadingGate(true)
    const moduleReady = vi.fn(),
      dataReady = vi.fn()
    const code = modules.wait().then(moduleReady)
    const data = reads.wait().then(dataReady)
    modules.release()
    await code
    expect(moduleReady).toHaveBeenCalledOnce()
    expect(dataReady).not.toHaveBeenCalled()
    reads.release()
    await data
    expect(dataReady).toHaveBeenCalledOnce()
  })
})
