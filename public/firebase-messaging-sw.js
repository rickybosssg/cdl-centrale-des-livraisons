// Firebase Messaging Service Worker — CDL Admin Push Notifications
// Gère les notifications en arrière-plan et app fermée

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// La config Firebase est injectée depuis le client via postMessage
// ou lue depuis les meta VITE (injectées par le manifest)
// On lit depuis les query params du SW URL si disponible
const swUrl = new URL(self.location.href);
const apiKey = swUrl.searchParams.get('apiKey') || '';
const messagingSenderId = swUrl.searchParams.get('messagingSenderId') || '';
const appId = swUrl.searchParams.get('appId') || '';
const projectId = swUrl.searchParams.get('projectId') || '';

if (apiKey) {
  firebase.initializeApp({ apiKey, messagingSenderId, appId, projectId });
} else {
  // Fallback: attendre un message de config
  self.addEventListener('message', (event) => {
    if (event.data?.type === 'FIREBASE_CONFIG' && !firebase.apps.length) {
      firebase.initializeApp(event.data.config);
    }
  });
}

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  console.warn('[SW] Firebase messaging init failed:', e);
}

// Gestion des notifications en arrière-plan
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Background message received:', payload);

    const notificationData = payload.data || {};
    const notificationInfo = payload.notification || {};
    const title = notificationInfo.title || notificationData.title || 'CDL Admin';
    const body = notificationInfo.body || notificationData.body || '';
    const route = notificationData.notif_route || notificationData.route || '/admin-dashboard';

    const options = {
      body,
      icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg',
      badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/1eb51398f_Screenshot_20260330_132434_WhatsApp.jpg',
      data: { route, ...notificationData },
      vibrate: [200, 100, 200],
      tag: notificationData.type || 'cdl-admin',
      requireInteraction: true,
    };

    return self.registration.showNotification(title, options);
  });
}

// Clic sur notification → deep link
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const route = data.notif_route || data.route || '/admin-dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // App déjà ouverte → focus + navigation
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'CDL_NOTIFICATION_CLICK', route });
          return;
        }
      }
      // App fermée → ouvrir avec ?notif_route=
      const url = `/?notif_route=${encodeURIComponent(route)}`;
      return clients.openWindow(url);
    })
  );
});
