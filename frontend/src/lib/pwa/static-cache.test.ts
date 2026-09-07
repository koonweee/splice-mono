// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as StaticCacheHelpers from './static-cache'

class MemoryCache {
  entries = new Map<string, Response>()
  async match(request: Request | string) {
    return this.entries
      .get(typeof request === 'string' ? request : request.url)
      ?.clone()
  }
  async put(request: Request | string, response: Response) {
    this.entries.set(
      typeof request === 'string' ? request : request.url,
      response.clone(),
    )
  }
  async delete(request: Request | string) {
    return this.entries.delete(
      typeof request === 'string' ? request : request.url,
    )
  }
}
let cacheMap: Map<string, MemoryCache>
let helpers: typeof StaticCacheHelpers
let fetcher: ReturnType<typeof vi.fn>
let clients: Array<{ id: string }>
let enablePreload: ReturnType<typeof vi.fn>
let waiting: {
  postMessage: (message: unknown, ports: Array<MessagePort>) => void
} | null
let installing: boolean
const asset = 'https://splice.test/assets/main-abcdefgh.js'
const metadataUrl = 'https://splice.test/__splice_static_metadata__'
const js = (body = 'public javascript') =>
  new Response(body, {
    headers: {
      'Content-Type': 'text/javascript',
      'Cache-Control': 'public,max-age=31536000,immutable',
    },
  })

beforeEach(async () => {
  vi.resetModules()
  cacheMap = new Map()
  clients = []
  waiting = null
  installing = false
  enablePreload = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('self', {
    location: { origin: 'https://splice.test' },
    navigator: {
      locks: {
        request: async (_name: string, action: () => Promise<unknown>) =>
          action(),
      },
    },
    clients: { matchAll: async () => clients },
    registration: {
      navigationPreload: { enable: enablePreload },
      get waiting() {
        return waiting
      },
      get installing() {
        return installing ? {} : null
      },
    },
  })
  vi.stubGlobal('caches', {
    keys: async () => [...cacheMap.keys()],
    open: async (name: string) => {
      const cache = cacheMap.get(name) ?? new MemoryCache()
      cacheMap.set(name, cache)
      return cache
    },
    delete: async (name: string) => cacheMap.delete(name),
  })
  fetcher = vi.fn().mockImplementation(async () => js())
  vi.stubGlobal('fetch', fetcher)
  helpers = await import('./static-cache')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function seed(buildId: string, age: number, bytes = 10, url = asset) {
  const cache = new MemoryCache()
  await cache.put(url, js('previous bytes'))
  await cache.put(
    metadataUrl,
    new Response(
      JSON.stringify({
        buildId,
        activated: true,
        createdAt: Date.now() - age,
        lastUsedAt: Date.now() - age,
        assets: { [url]: { bytes, revision: 'same-revision' } },
      }),
    ),
  )
  cacheMap.set(`splice-static-v2-${buildId}`, cache)
  return cache
}

describe('public static caching', () => {
  it('never treats financial routes, arbitrary assets, HTML, query URLs, or cross-origin URLs as static', () => {
    for (const url of [
      '/home',
      '/user/me',
      '/notification/inbox',
      '/version.json',
      '/assets/non-hashed.js',
      '/assets/main-abcdefgh.js?user=1',
      '/splash/apple.png',
      'https://other.test/assets/main-abcdefgh.js',
    ]) {
      expect(
        helpers.isCacheableStaticRequest(
          new Request(new URL(url, 'https://splice.test')),
        ),
      ).toBe(false)
    }
    expect(helpers.isCacheableStaticRequest(new Request(asset))).toBe(true)
    expect(
      helpers.isCacheableStaticRequest(
        new Request(asset, { headers: { authorization: 'fixture' } }),
      ),
    ).toBe(false)
  })
  it('installs valid essentials and reopens unchanged static bytes without another network body', async () => {
    await helpers.installStaticAssets([
      { url: '/assets/main-abcdefgh.js', revision: 'fixture' },
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(
      await (await helpers.loadStaticAsset(new Request(asset))).text(),
    ).toBe('public javascript')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('copies unchanged revision assets from the previous release during install', async () => {
    await seed('previous', 1000)
    await helpers.installStaticAssets([
      { url: '/assets/main-abcdefgh.js', revision: 'same-revision' },
    ])
    expect(fetcher).not.toHaveBeenCalled()
    expect(
      await (await helpers.loadStaticAsset(new Request(asset))).text(),
    ).toBe('previous bytes')
  })
  it.each([
    () =>
      new Response('<html>private</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    () =>
      new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain' },
      }),
    () =>
      new Response('private javascript', {
        headers: {
          'content-type': 'text/javascript',
          'cache-control': 'private,no-store',
        },
      }),
    () => new Response('', { status: 302, headers: { location: '/login' } }),
  ])('never caches inappropriate static responses', async (response) => {
    fetcher.mockImplementation(async () => response())
    await helpers.loadStaticAsset(new Request(asset))
    await helpers.loadStaticAsset(new Request(asset))
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(
      [...cacheMap.values()].some((cache) => cache.entries.has(asset)),
    ).toBe(false)
  })
  it('returns the live response before its cache copy finishes and keeps the writer alive', async () => {
    let finish: () => void = () => undefined
    fetcher.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('part'))
            finish = () => controller.close()
          },
        }),
        { headers: { 'content-type': 'text/javascript' } },
      ),
    )
    const waitUntil = vi.fn()
    const response = await helpers.loadStaticAsset(new Request(asset), {
      waitUntil,
    })
    expect(response).toBeInstanceOf(Response)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    finish()
    await waitUntil.mock.calls[0][0]
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('keeps online reads usable when CacheStorage or quota fails', async () => {
    vi.stubGlobal('caches', {
      keys: async () => {
        throw new Error('quota')
      },
      open: async () => {
        throw new Error('disabled')
      },
    })
    await expect(
      helpers.installStaticAssets([{ url: asset }]),
    ).resolves.toBeUndefined()
    expect(
      await (await helpers.loadStaticAsset(new Request(asset))).text(),
    ).toBe('public javascript')
    await expect(helpers.activateStaticAssets()).resolves.toBeUndefined()
  })
  it('keeps a previous release used by another client and deletes obsolete/legacy caches', async () => {
    await seed('previous', 8 * 86_400_000)
    await seed('older', 9 * 86_400_000)
    cacheMap.set('splice-app-shell-v1', new MemoryCache())
    cacheMap.set('workbox-precache-v2-fixture', new MemoryCache())
    clients = [{ id: 'editing-tab' }]
    await helpers.reportStaticClient('editing-tab', 'previous')
    await helpers.installStaticAssets([{ url: '/assets/main-newbuild.js' }])
    await helpers.activateStaticAssets()
    expect(enablePreload).toHaveBeenCalledTimes(1)
    expect(cacheMap.has('splice-static-v2-previous')).toBe(true)
    expect(cacheMap.has('splice-static-v2-older')).toBe(false)
    expect(cacheMap.has('splice-app-shell-v1')).toBe(false)
    expect(cacheMap.has('workbox-precache-v2-fixture')).toBe(false)
    expect(cacheMap.size).toBe(2)
  })
  it('expires unused previous releases without making missing old chunks look successful', async () => {
    await seed('previous', 8 * 86_400_000)
    await helpers.activateStaticAssets()
    expect(cacheMap.has('splice-static-v2-previous')).toBe(false)
    fetcher.mockResolvedValue(new Response('Not found', { status: 404 }))
    expect((await helpers.loadStaticAsset(new Request(asset))).status).toBe(404)
  })
  it('never exceeds the combined asset byte budget', async () => {
    await seed('previous', 1000, 20 * 1024 * 1024)
    await helpers.installStaticAssets([{ url: '/assets/main-newbuild.js' }])
    const added = [...cacheMap.values()].some((cache) =>
      cache.entries.has('https://splice.test/assets/main-newbuild.js'),
    )
    expect(added).toBe(false)
  })

  it('does not let an oversized cache clone stall the page response', async () => {
    fetcher.mockResolvedValue(js('x'.repeat(6 * 1024 * 1024)))
    const response = await helpers.loadStaticAsset(new Request(asset))
    expect((await response.text()).length).toBe(6 * 1024 * 1024)
    expect(
      [...cacheMap.values()].some((cache) => cache.entries.has(asset)),
    ).toBe(false)
  })

  it('prunes superseded staging after B waiting becomes C waiting while preserving an active installation', async () => {
    await helpers.installStaticAssets([{ url: '/assets/main-currentx.js' }])
    await helpers.activateStaticAssets()
    const current = await (await [...cacheMap.values()][0].match(
      metadataUrl,
    ))!.json()
    for (const build of ['b', 'c']) {
      const cache = await seed(build, 0)
      const meta = await (await cache.match(metadataUrl))!.json()
      await cache.put(metadataUrl, Response.json({ ...meta, activated: false }))
    }
    waiting = {
      postMessage: (_message, ports) => ports[0].postMessage({ buildId: 'b' }),
    }
    installing = true
    await helpers.reportStaticClient('tab', current.buildId)
    expect(cacheMap.has('splice-static-v2-b')).toBe(true)
    expect(cacheMap.has('splice-static-v2-c')).toBe(true)
    installing = false
    waiting = {
      postMessage: (_message, ports) => ports[0].postMessage({ buildId: 'c' }),
    }
    await helpers.reportStaticClient('tab', current.buildId)
    expect(cacheMap.has('splice-static-v2-b')).toBe(false)
    expect(cacheMap.has('splice-static-v2-c')).toBe(true)
    waiting = null
    await helpers.reportStaticClient('tab', current.buildId)
    expect(cacheMap.has('splice-static-v2-c')).toBe(false)
  })
  it('preserves a waiting worker cache during foreground cleanup and expires unused previous assets', async () => {
    await helpers.installStaticAssets([{ url: '/assets/main-currentx.js' }])
    await helpers.activateStaticAssets()
    const currentCache = [...cacheMap.values()][0]
    const current = await (await currentCache.match(metadataUrl))!.json()
    await seed('previous', 8 * 86_400_000)
    const waitingCache = await seed('waiting', -1000)
    const waitingMeta = await (await waitingCache.match(metadataUrl))!.json()
    waitingMeta.activated = false
    await waitingCache.put(metadataUrl, Response.json(waitingMeta))
    waiting = {
      postMessage: (_message, ports) =>
        ports[0].postMessage({ buildId: 'waiting' }),
    }
    clients = [{ id: 'new-tab' }]
    await helpers.reportStaticClient('new-tab', current.buildId)
    expect(cacheMap.has('splice-static-v2-previous')).toBe(false)
    expect(cacheMap.has('splice-static-v2-waiting')).toBe(true)
  })
})
