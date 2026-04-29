/**
 * firebase-messaging-sw.js — Service Worker Firebase pour notifications background
 *
 * Ce fichier doit être à la RACINE du domaine (/firebase-messaging-sw.js)
 * Il gère les notifications quand l'app est en background ou fermée.
 */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// ── Config Firebase — lue depuis le SW (pas d'accès à import.meta.env) ──────
// Ces valeurs sont injectées au moment du build via le SW.
// En attendant, on utilise les valeurs depuis le scope du SW.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    initFirebase(event.data.config);
  }
});

let messaging = null;

function initFirebase(config) {
  if (messaging) return; // Déjà initialisé
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    messaging = firebase.messaging();

    // Gérer les notifications background
    messaging.onBackgroundMessage((payload) => {
      console.log('[SW Firebase] 📬 Message background reçu:', payload.notification?.title);

      const notificationTitle = payload.notification?.title || 'CDL';
      const notificationBody = payload.notification?.body || '';
      const data = payload.data || {};

      const notificationOptions = {
        body: notificationBody,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: data.course_id || 'cdl-notif',
        data: data,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        actions: data.notif_route ? [
          { action: 'view', title: 'Voir' }
        ] : [],
      };

      return self.registration.showNotification(notificationTitle, notificationOptions);
    });

    console.log('[SW Firebase] ✅ Firebase Messaging initialisé');
  } catch (err) {
    console.error('[SW Firebase] ❌ Erreur init:', err.message);
  }
}

// Gérer le clic sur notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const route = data.notif_route || data.route || data.target_screen || '/';

  console.log('[SW Firebase] 👆 Clic notification → route:', route);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une fenêtre est déjà ouverte, la focaliser et naviguer
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'CDL_NOTIFICATION_CLICK', route });
          return;
        }
      }
      // Sinon ouvrir une nouvelle fenêtre avec le route en paramètre
      if (clients.openWindow) {
        return clients.openWindow(`/?notif_route=${encodeURIComponent(route)}`);
      }
    })
  );
});

// Activation immédiate du SW
self.addEventListener('install', (event) => {
  console.log('[SW Firebase] Install');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW Firebase] Activate');
  event.waitUntil(clients.claim());
});
