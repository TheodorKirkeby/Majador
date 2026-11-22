// Service worker for the notification playground only (scope /demo/). It
// exists because notifications with action buttons can only be shown through
// a service worker registration. The real app's worker is src/sw.ts.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const demo = windows.find((w) => new URL(w.url).pathname.startsWith('/demo/'))
      if (demo) {
        demo.postMessage({ clicked: event.action || 'notification' })
        await demo.focus()
        return
      }
      await self.clients.openWindow(event.notification.data?.url ?? './')
    })(),
  )
})
