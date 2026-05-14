self.addEventListener('push', (event) => {
  let payload = {
    title: 'Splice',
    body: '',
    url: '/',
    tag: 'splice-notification',
  }

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...event.data.json(),
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

        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl)
        }
      }),
  )
})
