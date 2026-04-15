/**
 * Service Worker Firebase Cloud Messaging
 * ─────────────────────────────────────────
 * Gère les notifications FCM en arrière-plan et app fermée.
 * La config Firebase est injectée par le frontend via postMessage.
 */

let firebaseConfig = null;
let messaging = null;

// Écouter la config desde le frontend
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    firebaseConfig = event.data.config;
    console.log('[firebase-messaging-sw] Config reçue:', {
      apiKey: firebaseConfig.apiKey.substring(0, 8) + '...',
      messagingSenderId: firebaseConfig.messagingSenderId.substring(0, 8) + '...',
      appId: firebaseConfig.appId.substring(0, 8) + '...',
      vapidKey: firebaseConfig.vapidKey.substring(0, 8) + '...',
    });
    initializeFirebase();
  }
});

async function initializeFirebase() {
  if (!firebaseConfig) {
    console.warn('[firebase-messaging-sw] Firebase config not yet received');
    return;
  }
  
  try {
    // Importer Firebase dynamiquement
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const { getMessaging, onBackgroundMessage } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
    
    // Initialiser Firebase
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    
    console.log('[firebase-messaging-sw] Firebase initialisé avec succès');
    
    // Écouter les notifications en arrière-plan
    onBackgroundMessage(messaging, (payload) => {
      console.log('[firebase-messaging-sw] Notification reçue en BG:', payload);
      
      const notificationTitle = payload.notification?.title || 'CDL';
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: payload.notification?.icon || '/logo192.png',
        badge: '/logo192.png',
        tag: payload.data?.tag || 'cdl-notification',
        data: payload.data || {},
        requireInteraction: payload.data?.priority === 'high' || payload.data?.priority === 'urgent',
      };
      
      // Si la notif a une route, la stocker pour la redirection
      if (payload.data?.route) {
        notificationOptions.data.route = payload.data.route;
      }
      
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
    
  } catch (error) {
    console.error('[firebase-messaging-sw] Erreur initialisation Firebase:', error);
  }
}

// Gérer le clic sur la notification
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw] Notification cliquée:', event.notification.tag);
  event.notification.close();
  
  const route = event.notification.data?.route || '/';
  
  // Chercher si une fenêtre est déjà ouverte
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Chercher une fenêtre existante
      for (const client of clientList) {
        if (client.url === new URL(route, self.location).href && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Sinon, ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(route);
      }
    })
  );
});

// Fallback: si la config n'a pas été reçue rapidement, log un avertissement
setTimeout(() => {
  if (!firebaseConfig) {
    console.warn('[firebase-messaging-sw] Config Firebase non reçue après 5s — les notifications en BG ne fonctionneront pas');
  }
}, 5000);
