importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// La config Firebase est passée via les query params lors de l'enregistrement du SW
function getConfigFromUrl() {
  const params = new URL(self.location.href).searchParams;
  return {
    apiKey: params.get('apiKey'),
    authDomain: params.get('authDomain'),
    projectId: params.get('projectId'),
    storageBucket: params.get('storageBucket'),
    messagingSenderId: params.get('messagingSenderId'),
    appId: params.get('appId'),
  };
}

const config = getConfigFromUrl();

if (config.apiKey && firebase.apps.length === 0) {
  firebase.initializeApp(config);
}

const messaging = firebase.messaging();

// Notifications en arrière-plan (app fermée ou minimisée)
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

// Ouvrir l'app au clic sur la notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
