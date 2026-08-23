/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

const APP_SHELL_CACHE = 'splice-app-shell-v1'
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Splice</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #282a36;
        color: #f8f8f2;
      }

      main {
        width: min(28rem, calc(100vw - 2rem));
        display: grid;
        gap: 0.75rem;
        text-align: center;
      }

      h1 {
        margin: 0;
        font-size: 2.5rem;
        line-height: 1.1;
      }

      p {
        margin: 0;
        color: #d7d7d2;
        font-size: 1rem;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Splice</h1>
      <p>Splice is offline. Reconnect to load live financial data.</p>
    </main>
  </body>
</html>`

type PushPayload = {
  title: string
  body: string
  url: string
  tag: string
  count?: number
  badgeCount?: number
}

type ServiceWorkerMessage = {
  type?: string
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([caches.delete(APP_SHELL_CACHE), self.clients.claim()]),
  )
})

self.addEventListener('message', (event) => {
  if (
    (event.data as ServiceWorkerMessage | undefined)?.type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') {
    return
  }

  event.respondWith(loadNavigation(event.request))
})

self.addEventListener('push', (event) => {
  let payload: PushPayload = {
    title: 'Splice',
    body: '',
    url: '/',
    tag: 'splice-notification',
  }

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...(event.data.json() as Partial<PushPayload>),
      }
    } catch {
      payload.body = event.data.text()
    }
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        data: {
          url: payload.url || '/',
        },
      }),
      updateAppBadgeFromPushPayload(payload),
    ]),
  )
})

async function loadNavigation(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    return new Response(OFFLINE_FALLBACK_HTML, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 503,
    })
  }
}

async function updateAppBadgeFromPushPayload(
  payload: PushPayload,
): Promise<void> {
  const badgingNavigator = self.navigator as WorkerNavigator & {
    setAppBadge?: (contents?: number) => Promise<void>
  }

  if (typeof badgingNavigator.setAppBadge !== 'function') {
    return
  }

  const badgeCount =
    typeof payload.badgeCount === 'number' ? payload.badgeCount : payload.count

  if (typeof badgeCount === 'number' && badgeCount > 0) {
    await badgingNavigator.setAppBadge(badgeCount)
    return
  }

  await badgingNavigator.setAppBadge()
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.location.origin,
  ).href

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then((clientList) => {
        for (const client of clientList) {
          if (
            'focus' in client &&
            new URL(client.url).origin === self.location.origin
          ) {
            return client.focus().then(() => client.navigate(targetUrl))
          }
        }

        return self.clients.openWindow(targetUrl)
      }),
  )
})
