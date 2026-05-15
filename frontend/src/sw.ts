/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

const APP_SHELL_CACHE = 'splice-app-shell-v1'
const APP_SHELL_URL = '/'
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
}

precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell())
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
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: {
        url: payload.url || '/',
      },
    }),
  )
})

async function cacheAppShell(): Promise<void> {
  try {
    const cache = await caches.open(APP_SHELL_CACHE)
    await cache.add(
      new Request(APP_SHELL_URL, {
        cache: 'reload',
        credentials: 'same-origin',
      }),
    )
  } catch {
    // The fallback below still gives cold offline launches a readable page.
  }
}

async function loadNavigation(request: Request): Promise<Response> {
  try {
    const response = await fetch(request)

    if (isRootNavigation(request) && response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE)
      await cache.put(APP_SHELL_URL, response.clone())
    }

    return response
  } catch {
    const cachedAppShell = await caches.match(APP_SHELL_URL, {
      cacheName: APP_SHELL_CACHE,
    })

    if (cachedAppShell) {
      return cachedAppShell
    }

    return new Response(OFFLINE_FALLBACK_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
      status: 503,
    })
  }
}

function isRootNavigation(request: Request): boolean {
  const url = new URL(request.url)

  return url.origin === self.location.origin && url.pathname === '/'
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
