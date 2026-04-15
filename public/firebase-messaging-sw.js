/**
 * Firebase Cloud Messaging Service Worker
 * Riceve config da window.__FIREBASE_CONFIG__ impostato da NotificationPermissionRequest
 */

console.log('[SW] 🟢 Service Worker avviato');

let firebaseReady = false;
let messaging = null;

// ─────────────────────────────────────────────────────────────────────────
// CLIC NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 🖱️ Notification cliccata');
  event.notification.close();

  const route = event.notification.data?.route || '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Cerca finestra esistente
        for (const client of clientList) {
          if (client.url.includes(self.location.hostname)) {
            console.log('[SW] 📍 Focus su finestra esistente');
            return client.focus();
          }
        }

        // Apri nuova finestra
        if (clients.openWindow) {
          console.log('[SW] 📍 Apertura nuova finestra');
          return clients.openWindow(route);
        }
      })
  );
});

// ─────────────────────────────────────────────────────────────────────────
// RICEZIONE CONFIG DA WINDOW
// ─────────────────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    console.log('[SW] 📨 Ricezione config Firebase via message');
    self.__FIREBASE_CONFIG__ = event.data.config;
    console.log('[SW] ✅ Config salvata in __FIREBASE_CONFIG__');
    
    // Inizializza Firebase subito dopo aver ricevuto la config
    if (!firebaseReady) {
      firebaseReady = true;
      initializeFirebase();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// INITIALIZZAZIONE FIREBASE
// ─────────────────────────────────────────────────────────────────────────

async function initializeFirebase() {
  try {
    console.log('[SW] ⏳ Inizializzazione Firebase...');

    // Ottieni config (dovrebbe essere stata ricevuta via message)
    let firebaseConfig = self.__FIREBASE_CONFIG__;
    
    if (!firebaseConfig) {
      console.warn('[SW] ⚠️ Config non ricevuta via message, FCM non sarà operativo');
      return;
    }

    // Valida config
    console.log('[SW] Validazione config:', {
      apiKey: firebaseConfig.apiKey ? '✅' : '❌',
      messagingSenderId: firebaseConfig.messagingSenderId ? '✅' : '❌',
      appId: firebaseConfig.appId ? '✅' : '❌',
    });

    if (!firebaseConfig.apiKey || !firebaseConfig.messagingSenderId || !firebaseConfig.appId) {
      console.error('[SW] ❌ Config incompleta - Firebase non inizializzato');
      return;
    }

    // Import Firebase
    console.log('[SW] ⏳ Import Firebase modules...');
    const { initializeApp, getApps } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
    );
    const { getMessaging, onBackgroundMessage } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js'
    );
    console.log('[SW] ✅ Firebase modules importati');

    // Inizializza app
    console.log('[SW] ⏳ initializeApp()...');
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    messaging = getMessaging(app);
    console.log('[SW] ✅ Firebase app inizializzato');

    // Ascolta notifiche in background
    console.log('[SW] ⏳ Registrazione onBackgroundMessage...');
    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] 📬 Notifica ricevuta in background:', payload.notification?.title);

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

    console.log('[SW] 🎉 Firebase Cloud Messaging OPERATIVO');
    firebaseReady = true;
  } catch (err) {
    console.error('[SW] ❌ Errore inizializzazione Firebase:', err.message);
    console.error('[SW] Stack:', err.stack);
  }
}

console.log('[SW] 🟢 Service Worker pronto - in attesa di FIREBASE_CONFIG');
