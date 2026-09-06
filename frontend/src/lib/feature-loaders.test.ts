import { describe, expect, it, vi } from 'vitest'
import { sharedImport } from './feature-loaders'

describe('shared feature imports', () => {
  it('shares pending and resolved code between preparation and lazy rendering', async () => {
    const module = { default: 'component' },
      load = vi.fn(() => Promise.resolve(module)),
      shared = sharedImport(load)
    const prepared = shared()
    expect(shared()).toBe(prepared)
    expect(await prepared).toBe(module)
    expect(await shared()).toBe(module)
    expect(load).toHaveBeenCalledOnce()
  })
  it('does not poison lazy rendering when speculative code loading fails', async () => {
    const load = vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ default: 'component' }),
      shared = sharedImport(load)
    await expect(shared()).rejects.toThrow('offline')
    await expect(shared()).resolves.toEqual({ default: 'component' })
    expect(load).toHaveBeenCalledTimes(2)
  })
})
