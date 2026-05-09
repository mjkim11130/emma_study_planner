const SHELL_CACHE = 'emma-planner-shell-v1'
const ASSET_CACHE = 'emma-planner-assets-v1'

const scopeUrl = new URL(self.registration.scope)
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`

const shellUrls = ['', 'index.html', '404.html', 'site.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.svg'].map(
  (path) => new URL(path, self.registration.scope).toString(),
)

function isAppAsset(url) {
  if (url.origin !== self.location.origin) return false
  if (!url.pathname.startsWith(scopePath)) return false
  return (
    url.pathname.startsWith(`${scopePath}assets/`) ||
    /\.(?:css|js|mjs|png|svg|ico|webmanifest|woff2?)$/i.test(url.pathname)
  )
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
      cache.put(new URL('index.html', self.registration.scope).toString(), response.clone())
    }
    return response
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match(new URL('index.html', self.registration.scope).toString())) ||
      Response.error()
    )
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)

  if (cached) {
    void networkPromise
    return cached
  }

  const networkResponse = await networkPromise
  return networkResponse || Response.error()
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(shellUrls)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isAppAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
