import { diagnosticSnapshot, tracePwa } from './lib/pwa/diagnostics'
/// <reference lib="webworker" />
import {
  activateStaticAssets,
  cachedLaunchResponse,
  installStaticAssets,
  isCacheableStaticRequest,
  loadStaticAsset,
  reportStaticClient,
} from './lib/pwa/static-cache'
import { handlePwaNavigation } from './lib/pwa/offline-page'
import {
  handlePrivateNotificationClick,
  handlePrivatePush,
  handleWorkerControlMessage,
} from './lib/pwa/worker-notifications'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>
}

const essentialEntries = self.__WB_MANIFEST
self.addEventListener('install', (event) => {
  event.waitUntil(
    tracePwa('worker:install', () => installStaticAssets(essentialEntries)),
  )
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await tracePwa('worker:activate-cache', () => activateStaticAssets())
      await tracePwa('worker:claim', () => self.clients.claim())
    })(),
  )
})
self.addEventListener('message', (event) => {
  const data: unknown = event.data
  if (!data || typeof data !== 'object' || !('type' in data)) return
  if (data.type === 'PWA_DIAGNOSTICS')
    event.ports[0]?.postMessage(diagnosticSnapshot())
  else if (data.type === 'PWA_BUILD_ID')
    event.ports[0]?.postMessage({ buildId: __SPLICE_BUILD_ID__ })
  else if (data.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting())
  else if (
    data.type === 'PWA_CLIENT_BUILD' &&
    'buildId' in data &&
    typeof data.buildId === 'string' &&
    event.source &&
    'id' in event.source
  ) {
    event.waitUntil(reportStaticClient(event.source.id, data.buildId))
  } else event.waitUntil(handleWorkerControlMessage(event))
})
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate')
    event.respondWith(
      cachedLaunchResponse(event.request, essentialEntries).then(
        (response) => response ?? handlePwaNavigation(event),
      ),
    )
  else if (isCacheableStaticRequest(event.request))
    event.respondWith(loadStaticAsset(event.request, event))
})
self.addEventListener('push', (event) =>
  event.waitUntil(handlePrivatePush(event)),
)
self.addEventListener('notificationclick', (event) =>
  event.waitUntil(handlePrivateNotificationClick(event)),
)
