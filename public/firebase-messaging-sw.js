// CDL - Firebase Cloud Messaging Service Worker
// Ce fichier doit être à la racine du domaine pour recevoir les notifications en background/app fermée

// Récupérer la config Firebase depuis les query params (passés lors de l'enregistrement)
const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || 'cdl-app-4743c',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || '',
};

// Importer Firebase Messaging compat (version compatible SW)
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

try {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // Gérer les messages en background (app fermée ou en arrière-plan)
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Message background reçu:', payload);

    const notificationTitle = payload.notification?.title || 'CDL Notification';
    const notificationOptions = {
      body: payload.notification?.body || '',
      icon: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      badge: 'https://media.base44.com/images/public/69c3c74fc4b62396dca61751/a4649c33e_CDLLOGOOFFICIEL.jpeg',
      vibrate: [200, 100, 200],
      data: payload.data || {},
      tag: payload.data?.type || 'cdl-notification', // Evite les doublons
      requireInteraction: payload.data?.priority === 'high', // Garder visible si haute priorité
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });

  // Clic sur la notification en background → ouvrir l'app
  self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification cliquée:', event.notification);
    event.notification.close();

    const data = event.notification.data || {};
    let url = '/';

    // Routing selon le type de notification
    if (data.route) {
      url = data.route;
    } else if (data.type === 'new_course') {
      url = '/courses-disponibles';
    } else if (data.type === 'course_update' && data.courseId) {
      url = `/course/${data.courseId}`;
    } else if (data.type === 'profile_validated') {
      url = '/settings';
    } else if (data.type === 'profile_refused') {
      url = '/settings';
    } else if (data.type === 'bedou_credit') {
      url = '/mon-bedou';
    } else if (data.type === 'new_order') {
      url = '/commandes-partenaire';
    } else if (data.type === 'commercial_gain') {
      url = '/';
    }

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Si l'app est déjà ouverte, naviguer vers l'URL
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            if (url !== '/') client.navigate(url);
            return;
          }
        }
        // Sinon ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  });

  console.log('[SW] Firebase Messaging Service Worker initialisé');
} catch (err) {
  console.error('[SW] Erreur init Firebase:', err);
}
