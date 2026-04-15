/**
 * Firebase Cloud Messaging Service Worker
 * Minimaliste et robuste — pour notifications en arrière-plan
 */

console.log('[SW] 🟢 Service Worker démarré');

// ─────────────────────────────────────────────────────────────────────────
// CLIC NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 🖱️ Notification cliquée');
  event.notification.close();

  const route = event.notification.data?.route || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Chercher fenêtre existante
        for (const client of clientList) {
          if (client.url.includes(window.location.hostname)) {
            console.log('[SW] 📍 Focus fenêtre existante');
            return client.focus();
          }
        }

        // Ouvrir nouvelle fenêtre
        if (clients.openWindow) {
          console.log('[SW] 📍 Ouverture nouvelle fenêtre');
          return clients.openWindow(route);
        }
      })
  );
});

// ─────────────────────────────────────────────────────────────────────────
// IMPORT FIREBASE CDN + INITIALISATION (lazy loading)
// ─────────────────────────────────────────────────────────────────────────

let firebaseReady = false;
let messaging = null;

async function initializeFirebase() {
  if (firebaseReady) {
    console.log('[SW] Firebase déjà initialisé');
    return messaging;
  }

  try {
    console.log('[SW] ⏳ Import Firebase depuis CDN...');

    // Import Firebase depuis CDN officiel
    const { initializeApp, getApps } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
    );
    const { getMessaging, onBackgroundMessage } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js'
    );

    console.log('[SW] ✅ Firebase modules importés');

    // Config Firebase hard-codée pour éviter tout problème de transmission
    // Ces valeurs doivent être injectées via l'environnement ou secrets
    const firebaseConfig = {
      apiKey: 'AIzaSyC3R9KLvJrfFGqWAeJ5fPbLR5K5QzX9mY8',
      authDomain: 'cdl-app-4743c.firebaseapp.com',
      projectId: 'cdl-app-4743c',
      storageBucket: 'cdl-app-4743c.appspot.com',
      messagingSenderId: '524835393755',
      appId: '1:524835393755:web:7e2f3a5c9d8b1e6f4c3a2b',
      vapidKey:
        'BGr-_1_WL8nQnIXQiRwZqZsUsC9Q3KqhMVl9vQp5Z6dYqY5GxL8N3pR2K9W4S5L7N6M9O1Z3X2Y5Q8R7V4W9T6U3S8P2',
    };

    console.log('[SW] ⏳ Initialisation Firebase avec config...');
    const app =
      getApps().length === 0
        ? initializeApp(firebaseConfig)
        : getApps()[0];

    messaging = getMessaging(app);
    console.log('[SW] ✅ Firebase Messaging initialisé');

    // Écouter notifications en arrière-plan
    console.log('[SW] ⏳ Enregistrement onBackgroundMessage...');
    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] 📬 Notification en BG:', {
        title: payload.notification?.title,
        body: payload.notification?.body,
      });

      const title = payload.notification?.title || 'CDL';
      const options = {
        body: payload.notification?.body || '',
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: 'cdl-notification',
        data: payload.data || {},
      };

      self.registration.showNotification(title, options);
    });

    console.log('[SW] ✅ onBackgroundMessage enregistré');
    firebaseReady = true;
    console.log('[SW] 🎉 Firebase Cloud Messaging OPÉRATIONNEL');

    return messaging;
  } catch (err) {
    console.error('[SW] ❌ Erreur initialisation Firebase:', err.message);
    console.error('[SW] Stack:', err.stack);
    throw err;
  }
}

// Initialiser Firebase au démarrage du SW
initializeFirebase().catch((err) => {
  console.error('[SW] ❌ Firebase init échouée:', err.message);
});

console.log('[SW] 🟢 Service Worker prêt');
