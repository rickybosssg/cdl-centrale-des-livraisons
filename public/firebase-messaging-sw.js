// Service Worker Firebase Messaging - CDL App
// La config Firebase est passée via les query params lors de l'enregistrement

// Récupérer la config depuis les params d'URL du SW
const swUrl = self.location.href;
const swParams = new URL(swUrl).searchParams;

const firebaseConfig = {
  apiKey: swParams.get('apiKey'),
  authDomain: swParams.get('authDomain'),
  projectId: swParams.get('projectId'),
  storageBucket: swParams.get('storageBucket'),
  messagingSenderId: swParams.get('messagingSenderId'),
  appId: swParams.get('appId'),
};

// Importer les scripts Firebase
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Initialiser Firebase seulement si la config est disponible
if (firebaseConfig.apiKey && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Afficher les notifications reçues en arrière-plan
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Message en arrière-plan reçu:', payload);

    const { title, body, icon } = payload.notification || {};
    const notificationTitle = title || 'CDL App';
    const notificationOptions = {
      body: body || '',
      icon: icon || 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      vibrate: [200, 100, 200],
      data: payload.data || {},
      tag: 'cdl-notification',
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[SW] Config Firebase manquante, notifications background désactivées');
}

// Clic sur notification → ouvrir l'app
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
