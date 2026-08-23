import { describe, expect, it } from 'vitest'
import { createMissingAssetResponse } from '../../../server/routes/assets/[...path]'

describe('missing asset fallback', () => {
  it('returns a non-cacheable 404 instead of SSR HTML', async () => {
    const response = createMissingAssetResponse()

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe(
      'text/plain; charset=utf-8',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    await expect(response.text()).resolves.toBe('Not Found')
  })
})
