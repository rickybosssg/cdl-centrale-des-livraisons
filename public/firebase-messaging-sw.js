/**
 * Service Worker Firebase Cloud Messaging
 * ─────────────────────────────────────────
 * Gère les notifications FCM en arrière-plan et app fermée.
 * La config Firebase est injectée par le frontend via postMessage.
 */

let firebaseConfig = null;
let messaging = null;

console.log('[firebase-messaging-sw] 🔄 Service Worker chargé');

// Écouter la config depuis le frontend
self.addEventListener('message', (event) => {
  console.log('[firebase-messaging-sw] 📨 Message reçu:', event.data?.type);
  
  if (event.data?.type === 'FIREBASE_CONFIG') {
    firebaseConfig = event.data.config;
    
    // Vérifier la complétude
    const missing = [];
    if (!firebaseConfig.apiKey) missing.push('apiKey');
    if (!firebaseConfig.messagingSenderId) missing.push('messagingSenderId');
    if (!firebaseConfig.appId) missing.push('appId');
    if (!firebaseConfig.vapidKey) missing.push('vapidKey');
    
    console.log('[firebase-messaging-sw] ✅ Config reçue:', {
      apiKey: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 8) + '...' : '❌ UNDEFINED',
      messagingSenderId: firebaseConfig.messagingSenderId ? firebaseConfig.messagingSenderId.substring(0, 8) + '...' : '❌ UNDEFINED',
      appId: firebaseConfig.appId ? firebaseConfig.appId.substring(0, 8) + '...' : '❌ UNDEFINED',
      vapidKey: firebaseConfig.vapidKey ? firebaseConfig.vapidKey.substring(0, 8) + '...' : '❌ UNDEFINED',
      missing: missing.length > 0 ? missing : '✅ Complet',
    });
    
    // Initialiser Firebase
    initializeFirebase();
  }
});

async function initializeFirebase() {
  if (!firebaseConfig) {
    console.error('[firebase-messaging-sw] ❌ Firebase config not available');
    return null;
  }
  
  try {
    console.log('[firebase-messaging-sw] ⏳ Initialisation Firebase...');
    
    // Importer Firebase depuis CDN
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
    const { getMessaging, onBackgroundMessage } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js');
    
    console.log('[firebase-messaging-sw] ✅ Modules Firebase importés');
    
    // Initialiser Firebase (ou récupérer l'instance existante)
    let app;
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
      console.log('[firebase-messaging-sw] ✅ Firebase app initialisé');
    } else {
      app = getApps()[0];
      console.log('[firebase-messaging-sw] ✅ Firebase app déjà initialisé');
    }
    
    messaging = getMessaging(app);
    console.log('[firebase-messaging-sw] ✅ Messaging initialisé');
    
    // Écouter les notifications en arrière-plan
    onBackgroundMessage(messaging, (payload) => {
      console.log('[firebase-messaging-sw] 📬 Notification reçue en BG:', {
        title: payload.notification?.title,
        body: payload.notification?.body,
        route: payload.data?.route,
      });
      
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
    
    console.log('[firebase-messaging-sw] ✅ Firebase Cloud Messaging prêt');
    return messaging;
    
  } catch (error) {
    console.error('[firebase-messaging-sw] ❌ Erreur initialisation Firebase:', error.message, error.stack);
    return null;
  }
}

// Gérer le clic sur la notification
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw] 🖱️ Notification cliquée:', event.notification.tag);
  event.notification.close();
  
  const route = event.notification.data?.route || '/';
  
  // Chercher si une fenêtre est déjà ouverte
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Chercher une fenêtre existante
      for (const client of clientList) {
        if (client.url === new URL(route, self.location).href && 'focus' in client) {
          console.log('[firebase-messaging-sw] 📍 Focus sur fenêtre existante:', route);
          return client.focus();
        }
      }
      
      // Sinon, ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        console.log('[firebase-messaging-sw] 📍 Ouverture nouvelle fenêtre:', route);
        return clients.openWindow(route);
      }
    })
  );
});

// Alerte si config non reçue
setTimeout(() => {
  if (!firebaseConfig) {
    console.warn('[firebase-messaging-sw] ⚠️ Config Firebase NON REÇUE après 5s');
  }
}, 5000);
