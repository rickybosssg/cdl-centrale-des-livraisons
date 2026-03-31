importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Config lue depuis le fichier de config public
self.addEventListener('fetch', () => {});

// Lire la config depuis le cache ou les données injectées
let firebaseConfig = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebaseConfig = event.data.config;
    initFirebase();
  }
});

function initFirebase() {
  if (!firebaseConfig || firebase.apps.length > 0) return;
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Gestion des messages en arrière-plan (app fermée ou en background)
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || 'CDL APP';
    const body = payload.notification?.body || '';

    self.registration.showNotification(title, {
      body,
      icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      vibrate: [200, 100, 200],
      data: payload.data || {},
      tag: 'cdl-notification',
      renotify: true,
    });
  });
}

// Ouvrir l'app au clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
