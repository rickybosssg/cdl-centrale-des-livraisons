// 🔄 Service Worker Firebase Cloud Messaging — Démarrage
console.log('[SW] 🟢 Service Worker loaded — ready to receive FIREBASE_CONFIG');

let firebaseConfig = null;
let messaging = null;

// 📨 Écouter la config Firebase du frontend
self.addEventListener('message', (event) => {
  try {
    console.log('[SW] 📨 Message reçu de type:', event.data?.type);
    
    if (event.data?.type === 'FIREBASE_CONFIG') {
      firebaseConfig = event.data.config;
      console.log('[SW] ✅ Config reçue. Vérification...');
      
      // Vérifier complétude
      const required = ['apiKey', 'messagingSenderId', 'appId', 'vapidKey'];
      const missing = required.filter(k => !firebaseConfig[k]);
      
      console.log('[SW] Config values:', {
        apiKey: firebaseConfig.apiKey ? '✅' : '❌',
        messagingSenderId: firebaseConfig.messagingSenderId ? '✅' : '❌',
        appId: firebaseConfig.appId ? '✅' : '❌',
        vapidKey: firebaseConfig.vapidKey ? '✅' : '❌',
      });
      
      if (missing.length > 0) {
        console.error('[SW] ❌ Config incomplète. Manquants:', missing);
        return;
      }
      
      // Lancer l'initialisation Firebase
      initializeFirebaseAsync();
    }
  } catch (err) {
    console.error('[SW] ❌ Erreur handler message:', err.message, err.stack);
  }
});

// ⏳ Initialisation Firebase asynchrone
async function initializeFirebaseAsync() {
  try {
    console.log('[SW] ⏳ Démarrage initialisation Firebase...');
    
    // Importer Firebase modules
    const { initializeApp, getApps } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
    );
    const { getMessaging, onBackgroundMessage } = await import(
      'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js'
    );
    
    console.log('[SW] ✅ Modules Firebase importés');
    
    // Initialiser ou récupérer app
    let app;
    const apps = getApps();
    if (apps.length === 0) {
      app = initializeApp(firebaseConfig);
      console.log('[SW] ✅ initializeApp() → nouvelle instance');
    } else {
      app = apps[0];
      console.log('[SW] ✅ initializeApp() → instance existante');
    }
    
    // Initialiser messaging
    messaging = getMessaging(app);
    console.log('[SW] ✅ getMessaging() → messaging objet créé');
    
    // Écouter les notifications en arrière-plan
    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] 📬 Notification reçue en BG:', {
        title: payload.notification?.title,
        body: payload.notification?.body,
        route: payload.data?.route,
      });
      
      const notificationTitle = payload.notification?.title || 'CDL';
      const notificationOptions = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: payload.data?.tag || 'cdl-notification',
        data: payload.data || {},
        requireInteraction: payload.data?.priority === 'high' || payload.data?.priority === 'urgent',
      };
      
      if (payload.data?.route) {
        notificationOptions.data.route = payload.data.route;
      }
      
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
    
    console.log('[SW] ✅ onBackgroundMessage() → listener enregistré');
    console.log('[SW] 🎉 Firebase Cloud Messaging PRÊT');
    
  } catch (err) {
    console.error('[SW] ❌ Erreur initializeFirebaseAsync():', err.message);
    console.error('[SW] Stack:', err.stack);
  }
}

// 🖱️ Clic sur notification
self.addEventListener('notificationclick', (event) => {
  try {
    console.log('[SW] 🖱️ Notification cliquée:', event.notification.tag);
    event.notification.close();
    
    const route = event.notification.data?.route || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === new URL(route, self.location).href && 'focus' in client) {
            console.log('[SW] 📍 Focus sur fenêtre existante:', route);
            return client.focus();
          }
        }
        
        if (clients.openWindow) {
          console.log('[SW] 📍 Ouverture nouvelle fenêtre:', route);
          return clients.openWindow(route);
        }
      })
    );
  } catch (err) {
    console.error('[SW] ❌ Erreur notificationclick:', err.message);
  }
});

// ⏰ Vérifier config après 5s
setTimeout(() => {
  if (!firebaseConfig) {
    console.warn('[SW] ⚠️ Config Firebase NON REÇUE après 5s — FCM BG ne fonctionnera pas');
  }
}, 5000);

console.log('[SW] 🟢 Service Worker initialisation complète');
