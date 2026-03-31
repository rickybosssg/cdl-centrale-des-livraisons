// Firebase Cloud Messaging Service Worker - CDL APP
// Charge la config depuis firebase-sw-config.js (valeurs publiques, non-secrètes)

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
importScripts('/firebase-sw-config.js');

firebase.initializeApp(self.FIREBASE_SW_CONFIG);

const messaging = firebase.messaging();

// Notifications quand app fermée ou en arrière-plan
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  if (!title) return;

  self.registration.showNotification(title, {
    body: body || '',
    icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
    badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
    data: payload.data || {},
    vibrate: [200, 100, 200],
  });
});

// Clic notification → ouvre ou focus l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) { client.focus(); return; }
      }
      return clients.openWindow(url);
    })
  );
});
