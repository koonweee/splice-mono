/// <reference lib="webworker" />

import { fetchWithDeadline } from './deadline'

declare const self: ServiceWorkerGlobalScope

const PREFIX = 'splice-static-v2-'
const CACHE_NAME = `${PREFIX}${__SPLICE_BUILD_ID__}`
const META_PATH = '/__splice_static_metadata__'
const MAX_BYTES = 20 * 1024 * 1024
const MAX_ASSET_BYTES = 5 * 1024 * 1024
const UNUSED_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const branding = new Set([
  '/favicon.ico',
  '/favicon192.png',
  '/favicon512.png',
  '/apple-touch-icon.png',
])

type Entry = { url: string; revision?: string | null }
type Metadata = {
  buildId: string
  activated: boolean
  createdAt: number
  lastUsedAt: number
  assets: Partial<Record<string, { bytes: number; revision: string | null }>>
}
const clientBuilds = new Map<string, string>()
let mutation: Promise<unknown> = Promise.resolve()

function serialize<T>(action: () => Promise<T>): Promise<T> {
  const locks = (self.navigator as { locks?: LockManager }).locks
  const exclusive = async (): Promise<T> =>
    locks
      ? await locks.request('splice-static-cache-v2', action)
      : await action()
  const result = mutation.then(exclusive, exclusive)
  mutation = result.catch(() => undefined)
  return result
}

function metadataUrl(): string {
  return new URL(META_PATH, self.location.origin).href
}
async function metadata(cache: Cache): Promise<Metadata | null> {
  const response = await cache.match(metadataUrl())
  if (!response) return null
  return response.json() as Promise<Metadata>
}
async function writeMetadata(cache: Cache, value: Metadata): Promise<void> {
  await cache.put(
    metadataUrl(),
    new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}
async function inventories(): Promise<
  Array<{ name: string; cache: Cache; meta: Metadata }>
> {
  const result = []
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX)) continue
    const cache = await caches.open(name)
    const meta = await metadata(cache)
    if (meta) result.push({ name, cache, meta })
  }
  return result.sort((a, b) => b.meta.createdAt - a.meta.createdAt)
}
function byteSize(meta: Metadata): number {
  return Object.values(meta.assets).reduce(
    (sum, entry) => sum + (entry?.bytes ?? 0),
    0,
  )
}

export function reportStaticClient(
  clientId: string,
  buildId: string,
): Promise<void> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(buildId)) return Promise.resolve()
  clientBuilds.set(clientId, buildId)
  return pruneStaticAssets()
}

export function isCacheableStaticRequest(request: Request): boolean {
  if (
    request.method !== 'GET' ||
    request.mode === 'navigate' ||
    request.headers.has('range') ||
    request.headers.has('authorization')
  )
    return false
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.search) return false
  return (
    branding.has(url.pathname) ||
    /^\/pwa-offline-[a-zA-Z0-9-]+\.js$/.test(url.pathname) ||
    /^\/assets\/[a-zA-Z0-9._-]+-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|png|webp|avif|jpe?g|svg)$/.test(
      url.pathname,
    )
  )
}

function validResponse(request: Request, response: Response): boolean {
  if (
    !response.ok ||
    response.status !== 200 ||
    response.redirected ||
    response.type === 'opaque' ||
    response.type === 'opaqueredirect'
  )
    return false
  if (/private|no-store/i.test(response.headers.get('cache-control') ?? ''))
    return false
  if (response.url && new URL(response.url).origin !== self.location.origin)
    return false
  const type =
    response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ??
    ''
  const path = new URL(request.url).pathname
  if (path.endsWith('.js'))
    return ['application/javascript', 'text/javascript'].includes(type)
  if (path.endsWith('.css')) return type === 'text/css'
  if (/\.woff2?$/.test(path))
    return ['font/woff', 'font/woff2', 'application/font-woff'].includes(type)
  return type.startsWith('image/') && type !== 'image/html'
}

/** Store only bounded public bytes; quota/cache failures are never a network failure. */
async function store(
  request: Request,
  response: Response,
  revision: string | null,
): Promise<void> {
  if (!isCacheableStaticRequest(request) || !validResponse(request, response))
    return
  const reader = response.body?.getReader()
  if (!reader) return
  const parts: Array<Uint8Array<ArrayBuffer>> = []
  let bytes = 0
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      void reader.cancel().catch(() => undefined)
      reject(new Error('Static body timed out'))
    }, 10_000)
  })
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline])
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_ASSET_BYTES) {
        // A tee's cancellation promise may wait for the page to consume its
        // other branch. Never hold that page's response behind our cache limit.
        void reader.cancel().catch(() => undefined)
        return
      }
      parts.push(new Uint8Array(value))
    }
    await serialize(async () => {
      const inventory = await inventories()
      const cache = await caches.open(CACHE_NAME)
      const meta = (await metadata(cache)) ?? {
        buildId: __SPLICE_BUILD_ID__,
        activated: true,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        assets: {},
      }
      const url = request.url
      const existingBytes = meta.assets[url]?.bytes ?? 0
      // Older platforms without cross-worker locks reserve half the budget
      // for a simultaneously installing worker instead of racing the ceiling.
      const budget = (self.navigator as { locks?: LockManager }).locks
        ? MAX_BYTES
        : MAX_BYTES / 2
      if (
        inventory.reduce((total, item) => total + byteSize(item.meta), 0) -
          existingBytes +
          bytes >
        budget
      )
        return
      const headers = new Headers(response.headers)
      headers.delete('content-encoding')
      headers.delete('content-length')
      const body = new Blob(parts)
      await cache.put(request, new Response(body, { status: 200, headers }))
      meta.assets[url] = { bytes, revision }
      meta.lastUsedAt = Date.now()
      try {
        await writeMetadata(cache, meta)
      } catch (error) {
        await cache.delete(request)
        throw error
      }
    })
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }
}

export async function installStaticAssets(
  entries: Array<Entry>,
): Promise<void> {
  // Static caching is an enhancement: even quota failure must allow recovery.
  try {
    const cache = await caches.open(CACHE_NAME)
    if (!(await metadata(cache)))
      await writeMetadata(cache, {
        buildId: __SPLICE_BUILD_ID__,
        activated: false,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        assets: {},
      })
    const inventory = await inventories()
    let index = 0
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (index < entries.length) {
          const entry = entries[index++]
          const request = new Request(
            new URL(entry.url, self.location.origin),
            // Hashed app files were often just loaded by the page. Reuse the
            // browser HTTP cache rather than downloading the entry twice.
            {
              credentials: 'omit',
              cache: entry.revision ? 'reload' : 'force-cache',
            },
          )
          if (!isCacheableStaticRequest(request)) continue
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10_000)
          try {
            let response: Response | undefined
            for (const previous of inventory) {
              if (
                previous.meta.assets[request.url]?.revision ===
                (entry.revision ?? null)
              ) {
                response = await previous.cache.match(request)
                if (response) break
              }
            }
            response ??= await fetch(request, { signal: controller.signal })
            await store(request, response, entry.revision ?? null)
          } catch {
            /* Keep the page online when caching is unavailable. */
          } finally {
            clearTimeout(timeout)
          }
        }
      }),
    )
  } catch {
    /* Disabled CacheStorage must not block installing the worker. */
  }
}

export async function activateStaticAssets(): Promise<void> {
  try {
    await (
      self.registration as { navigationPreload?: NavigationPreloadManager }
    ).navigationPreload?.enable()
  } catch {
    /* Unsupported/disabled preload falls back to one normal fetch. */
  }
  try {
    await serialize(async () => {
      const cache = await caches.open(CACHE_NAME)
      const meta = await metadata(cache)
      if (meta) {
        meta.activated = true
        await writeMetadata(cache, meta)
      }
    })
  } catch {
    /* Storage failure cannot prevent activation. */
  }
  await pruneStaticAssets()
}

async function waitingBuildId(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const finish = (buildId: string | null) => {
      clearTimeout(timer)
      channel.port1.close()
      channel.port2.close()
      resolve(buildId)
    }
    const timer = setTimeout(() => finish(null), 1_000)
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      finish(
        data &&
          typeof data === 'object' &&
          'buildId' in data &&
          typeof data.buildId === 'string'
          ? data.buildId
          : null,
      )
    }
    try {
      worker.postMessage({ type: 'PWA_BUILD_ID' }, [channel.port2])
    } catch {
      finish(null)
    }
  })
}

async function pruneStaticAssets(): Promise<void> {
  try {
    const waiting = self.registration.waiting
    const waitingId =
      waiting && !self.registration.installing
        ? await waitingBuildId(waiting)
        : null
    await serialize(async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const live = new Set(clients.map((client) => client.id))
      for (const id of clientBuilds.keys())
        if (!live.has(id)) clientBuilds.delete(id)
      const all = await inventories()
      // A->B waiting->C waiting leaves B abandoned. Identify the actual waiting
      // build, and recheck registration after the async handshake before deleting.
      // An in-progress install or an older worker without this protocol is kept.
      if (
        !self.registration.installing &&
        self.registration.waiting === waiting &&
        (!waiting || waitingId)
      ) {
        for (const item of all) {
          if (
            item.meta.activated === false &&
            item.name !== CACHE_NAME &&
            item.meta.buildId !== waitingId
          )
            await caches.delete(item.name)
        }
      }
      const inventory = all.filter((item) => item.meta.activated !== false)
      const previous =
        inventory.find(
          (item) =>
            item.name !== CACHE_NAME &&
            (clients.length === 0 ||
              [...clientBuilds.values()].includes(item.meta.buildId)),
        ) ?? inventory.find((item) => item.name !== CACHE_NAME)
      for (const item of inventory) {
        if (item.name === CACHE_NAME) continue
        const inUse =
          clients.length > 0 &&
          (clientBuilds.size < clients.length ||
            [...clientBuilds.values()].includes(item.meta.buildId))
        if (
          item !== previous ||
          (!inUse && Date.now() - item.meta.lastUsedAt > UNUSED_MAX_AGE)
        )
          await caches.delete(item.name)
      }
      for (const name of await caches.keys()) {
        if (
          name === 'splice-app-shell-v1' ||
          name.startsWith('workbox-precache-v2-')
        )
          await caches.delete(name)
      }
    })
  } catch {
    /* Recovery and logout cannot depend on cache cleanup. */
  }
}

export async function loadStaticAsset(
  request: Request,
  event?: Pick<ExtendableEvent, 'waitUntil'>,
): Promise<Response> {
  if (!isCacheableStaticRequest(request)) return fetch(request)
  try {
    const inventory = await inventories()
    inventory.sort(
      (a, b) => Number(b.name === CACHE_NAME) - Number(a.name === CACHE_NAME),
    )
    for (const item of inventory) {
      const cached = await item.cache.match(request)
      if (cached && validResponse(request, cached)) {
        await serialize(async () => {
          const current = await metadata(item.cache)
          if (current) {
            current.lastUsedAt = Date.now()
            await writeMetadata(item.cache, current)
          }
        }).catch(() => undefined)
        return cached
      }
    }
  } catch {
    /* Fall through to network. */
  }
  // A stalled optional asset must not keep the outgoing worker alive forever.
  const response = await fetchWithDeadline(
    request,
    { signal: request.signal },
    5_000,
  )
  // Keep the bounded writer alive without buffering the page's response.
  if (validResponse(request, response)) {
    const writing = store(request, response.clone(), null).catch(
      () => undefined,
    )
    if (event) event.waitUntil(writing)
    else await writing
  }
  return response
}
