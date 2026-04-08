// sw.js - Service Worker para Tenant CRM (VERSIÓN DEFINITIVA)
const CACHE_NAME = 'tenant-crm-v4';

// Solo cachear recursos locales específicos
const urlsToCache = [
  '/dashboard.html',
  '/tenants.html',
  '/contracts.html',
  '/payments.html',
  '/reports.html',
  '/settings.html',
  '/login.html',
  '/offline.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/ui.js',
  '/js/notifications.js',
  '/js/push-notifications.js'
];

// Instalación
self.addEventListener('install', event => {
  console.log('✅ Service Worker instalado');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cacheando recursos...');
        // Cachear solo si la URL es válida
        return Promise.all(
          urlsToCache.map(url => {
            return fetch(url)
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(() => console.log('⚠️ No se pudo cachear:', url));
          })
        );
      })
  );
  self.skipWaiting();
});

// Activación
self.addEventListener('activate', event => {
  console.log('✅ Service Worker activado');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando cache antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - Ignorar extensiones y recursos externos
self.addEventListener('fetch', event => {
  const url = event.request.url;
  
  // Ignorar extensiones de Chrome
  if (url.startsWith('chrome-extension://')) {
    return;
  }
  
  // No cachear peticiones a la API
  if (url.includes('/.netlify/functions/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // No cachear recursos externos (CDNs)
  if (url.includes('cdn.tailwindcss.com') || 
      url.includes('cdnjs.cloudflare.com') ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});

// NOTIFICACIONES PUSH
self.addEventListener('push', event => {
  console.log('📨 Evento push recibido');
  
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {}
  
  const options = {
    body: data.body || 'Tienes una nueva notificación',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'default',
    requireInteraction: true,
    data: {
      url: data.url || '/dashboard.html'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || '🔔 Tenant CRM', options)
  );
});

// CLIC EN NOTIFICACIÓN
self.addEventListener('notificationclick', event => {
  console.log('👆 Clic en notificación');
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/dashboard.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (let client of windowClients) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});