const CACHE_NAME = 'tapautime-v125.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './order.html',
  './customer_login.html',
  './merchant.html',
  './style.css?v=124.0',
  './app.js?v=124.0',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/badge-96.png',
  './icons/tapau-logo.png',
  './icons/tapau-box.png',
  './icons/tapau-hero.png',
  './icons/dine-in-hero.png',
  './icons/tapau-terus.png',
  './icons/dine-in-terus.png',
  './icons/tapau-rewards.png',
  './dining_in.png',
  './tapau_rewards.png'
];

// Install Event - Pre-cache App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Tapau Time SW] Pre-caching offline shell v125.0');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Tapau Time SW] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-While-Revalidate & Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore non-GET requests and non-http schemes
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Bypass cache completely for dynamic Supabase REST & Realtime APIs, and PHP API endpoints
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('api.php')
  ) {
    return;
  }

  // Bypass cache entirely for OAuth callbacks (PKCE code exchange)
  if (url.searchParams.has('code') || url.hash.includes('access_token')) {
    return;
  }

  // External Fonts & CDN Styles - Cache First
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('lh3.googleusercontent.com')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            fetch(event.request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(event.request, networkResponse.clone());
              }
            }).catch(() => {});
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Local static images and icons - Cache First with Background Revalidation
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|webp|ico)$/i)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }
        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(async () => {
            const logoFallback = await cache.match('./icons/tapau-logo.png');
            if (logoFallback) return logoFallback;
            return new Response('', { status: 404, statusText: 'Not Found' });
          });
      })
    );
    return;
  }

  // Local assets - Network First with SPA Fallback
  event.respondWith(
    fetch(event.request)
      .then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        }
        // Handle 504 / 502 / 500 Gateway errors gracefully from edge proxy
        if (networkResponse && (networkResponse.status >= 500 && networkResponse.status <= 504)) {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          if (cached) return cached;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            const orderCached = await caches.match('./order.html', { ignoreSearch: true });
            if (orderCached) return orderCached;
            const indexCached = await caches.match('./index.html', { ignoreSearch: true });
            if (indexCached) return indexCached;
          }
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.headers.get('accept')?.includes('text/html')) {
          const orderCached = await caches.match('./order.html', { ignoreSearch: true });
          if (orderCached) return orderCached;
          const indexCached = await caches.match('./index.html', { ignoreSearch: true });
          if (indexCached) return indexCached;
        }
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      })
  );
});

// =============================================================================
// WEB PUSH NOTIFICATIONS API LISTENERS
// =============================================================================
self.addEventListener('push', (event) => {
  let data = { title: 'Tapau Time', body: 'Your order status has been updated!', url: './order.html?view=orders' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || './order.html?view=orders',
    },
    actions: [
      { action: 'view', title: 'View Order' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tapau Time', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './order.html?view=orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('order.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

