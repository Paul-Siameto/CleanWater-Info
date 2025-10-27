self.addEventListener('install', (e) => {
  self.skipWaiting();
})
self.addEventListener('activate', (e) => {
  clients.claim();
})
self.addEventListener('fetch', () => {})

self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-reports') {
    event.waitUntil((async () => {
      const cls = await clients.matchAll({ includeUncontrolled: true })
      for (const c of cls) {
        c.postMessage({ type: 'flush-reports' })
      }
    })())
  }
})
