/**
 * Service Worker minimal et stable
 * SANS Firebase — gestion basique des notifications via push
 */

console.log('[SW] 🟢 Démarrage Service Worker...');
console.log('[SW] Scope:', self.location.href);

// ─────────────────────────────────────────────────────────────────
// LIFECYCLE EVENTS
// ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] 🔄 Activate event');
  event.waitUntil(clients.claim());
});

// ─────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS (simple)
// ─────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  console.log('[SW] 📬 Push event reçu');
  
  let notificationTitle = 'CDL Notification';
  let notificationOptions = {
    body: 'Vous avez un nouveau message',
    icon: '/logo.png',
    tag: 'cdl-notification',
  };

  // Si le push a des données, les utiliser
  if (event.data) {
    try {
      const data = event.data.json();
      notificationTitle = data.title || notificationTitle;
      notificationOptions.body = data.body || notificationOptions.body;
      notificationOptions.data = data.data || {};
    } catch (e) {
      console.log('[SW] Pas de JSON dans le push, utiliser texte brut');
      notificationOptions.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// ─────────────────────────────────────────────────────────────────
// NOTIFICATION CLICK
// ─────────────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 🔔 Notification click');
  event.notification.close();

  // Récupérer la route cible si elle existe
  const route = event.notification.data?.route || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une fenêtre existe, focus et navigue
      for (let i = 0; i < clientList.length; i++) {
        if (clientList[i].url === self.location.origin + route && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(route);
      }
    })
  );
});

// ─────────────────────────────────────────────────────────────────
// MESSAGE HANDLING
// ─────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  console.log('[SW] 💬 Message reçu:', event.data?.type);
  
  if (event.data?.type === 'ping') {
    event.ports[0].postMessage({ status: 'pong', timestamp: new Date().toISOString() });
  }
});

// ─────────────────────────────────────────────────────────────────
// FETCH (passthrough)
// ─────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  // Passthrough — pas de caching pour le moment
});

console.log('[SW] ✅ Service Worker prêt (mode minimal — SANS Firebase)');
console.log('[SW] Événements disponibles: install, activate, push, message');
