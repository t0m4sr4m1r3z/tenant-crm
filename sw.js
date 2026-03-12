// sw.js - Service Worker para Tenant CRM PWA
const CACHE_NAME = 'tenant-crm-v1';
const urlsToCache = [
  '/',
  '/dashboard.html',
  '/tenants.html',
  '/contracts.html',
  '/payments.html',
  '/reports.html',
  '/settings.html',
  '/login.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/ui.js',
  '/js/notifications.js',
  '/js/tenants.js',
  '/js/contracts.js',
  '/js/payments.js',
  '/js/reports.js',
  '/js/dashboard.js',
  '/js/settings.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activación y limpieza de caches viejos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Eliminando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estrategia de caché: Network First, fallback a cache
self.addEventListener('fetch', event => {
  // No cachear peticiones a la API
  if (event.request.url.includes('/.netlify/functions/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('/offline.html');
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la respuesta es válida, clonarla y guardarla en cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, buscar en cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Si no está en cache, devolver offline.html
          return caches.match('/offline.html');
        });
      })
  );
});

// Sincronización en segundo plano (para cuando la app esté offline)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-payments') {
    event.waitUntil(syncPayments());
  }
});

async function syncPayments() {
  try {
    const db = await openDB();
    const pendingPayments = await db.getAll('pendingPayments');
    
    for (const payment of pendingPayments) {
      try {
        const response = await fetch('/.netlify/functions/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payment)
        });
        
        if (response.ok) {
          await db.delete('pendingPayments', payment.id);
        }
      } catch (error) {
        console.error('Error syncing payment:', error);
      }
    }
  } catch (error) {
    console.error('Error in syncPayments:', error);
  }
}

// IndexedDB para almacenamiento offline
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('TenantCRMOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingPayments')) {
        db.createObjectStore('pendingPayments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingContracts')) {
        db.createObjectStore('pendingContracts', { keyPath: 'id' });
      }
    };
  });
}